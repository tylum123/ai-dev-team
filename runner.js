import path from 'node:path';
import { command, ask, estimateCost } from './core.js';
import { retrieve, applyEdits, route, qualityGates, loadSkills, readSafe, limits } from './workflow.js';
import { validateAgentOutput } from './agents.js';
import { checkCancellation, transition } from './task-state.js';

export async function runGates(task, dir, root, execute = command) {
  let pkg = {};
  try { pkg = JSON.parse(await readSafe(dir, 'package.json')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const gates = qualityGates(pkg);
  const name = 'devteam-' + task.id;
  for (const gate of gates) {
    if (!gate.configured) { gate.status = 'skipped'; gate.output = 'Chưa cấu hình script'; continue; }
    try {
      gate.output = await execute('docker', [
        'run', '--rm', '--pull=never', '--name', name, '--network=none',
        '--memory=512m', '--cpus=1', '--pids-limit=128', '--cap-drop=ALL',
        '--security-opt=no-new-privileges', '--read-only', '--tmpfs', '/tmp:rw,size=256m',
        '--mount', `type=bind,source=${dir},target=/source,readonly`,
        process.env.DOCKER_IMAGE || 'node:22-alpine', 'sh', '-c',
        `cp -R /source /tmp/work && cd /tmp/work && npm run ${gate.name}`,
      ], root, 90000);
      gate.status = gate.name === 'test' && /(?:# tests 0\b|No tests found)/i.test(gate.output) ? 'empty' : 'passed';
    } catch (e) {
      gate.status = /cannot connect to the docker daemon|is the docker daemon running|error during connect|failed to connect to the docker|unable to find image|no such image|docker.*(?:not found|not recognized|enoent)/i.test(e.message) ? 'unavailable' : 'failed';
      gate.output = e.message;
    }
    finally { await execute('docker', ['rm', '-f', name], root, 10000).catch(() => {}); }
  }
  return { passed: gates.some(g => g.name === 'test' && g.status === 'passed') && gates.every(g => ['passed', 'skipped'].includes(g.status)), gates };
}

export async function runLive(t, { root, data, event, save, execute = command, query = ask, validate = runGates }) {
  const dir = path.join(data, t.id);
  t.workspace = dir;
  t.routing = route(t.prompt, t.complexity);
  t.telemetry = [];
  const configuredBudget = process.env.MAX_TASK_COST_USD;
  const budget = configuredBudget ? Number(configuredBudget) : null;
  if (budget !== null && (!Number.isFinite(budget) || budget <= 0)) throw Error('MAX_TASK_COST_USD phải là số dương');
  let prices = {};
  try { prices = JSON.parse(process.env.MODEL_PRICES_JSON || '{}'); } catch { /* Unknown prices stay unknown. */ }
  if (budget !== null && estimateCost({ input: 0, cached: 0, output: 0 }, t.routing.model, prices) === null) {
    throw Error('Cần cấu hình giá model trong MODEL_PRICES_JSON để dùng giới hạn chi phí');
  }
  const call = async (role, input, round = 0) => {
    checkCancellation(t);
    if (t.calls >= limits.calls) throw Error('Đã đạt giới hạn 6 lượt AI');
    if (JSON.stringify(input).length > 60000) throw Error('Context vượt giới hạn 60.000 ký tự');
    t.calls++;
    await save();
    const started = Date.now();
    let result;
    try { result = await query(role, input, t.routing.model); }
    catch (error) {
      t.telemetry.push({ role, round, model: t.routing.model, cost: null, milliseconds: Date.now() - started, error: error.message });
      await save();
      throw error;
    }
    t.tokens += result.tokens;
    t.telemetry.push({ role, round, model: t.routing.model, ...result.usage, tokens: result.tokens,
      cost: result.usageReported === false ? null : estimateCost(result.usage, t.routing.model, prices), milliseconds: Date.now() - started, error: result.error });
    await save();
    checkCancellation(t);
    if (budget !== null && t.telemetry.at(-1).cost === null) throw Error('Không có dữ liệu sử dụng để kiểm soát chi phí; tác vụ đã dừng');
    if (budget !== null && t.telemetry.reduce((sum, entry) => sum + entry.cost, 0) >= budget) {
      throw Error('Đã đạt giới hạn chi phí ước tính của tác vụ; dừng trước lượt AI tiếp theo');
    }
    if (result.error) throw Error(result.error);
    return validateAgentOutput(role, result.value);
  };
  await execute('git', ['clone', '--depth', '1', '--', t.repo, dir], root);
  t.base = (await execute('git', ['branch', '--show-current'], dir)).trim();
  await execute('git', ['checkout', '-b', t.branch], dir);
  let selected = await retrieve(dir, t.prompt);
  if (t.routing.planner) {
    await event(t, 'Planner', 'Chọn file và tiêu chí hoàn thành từ bản đồ đường dẫn.');
    t.plan = await call('Planner', { task: t.prompt, map: selected.map });
    selected = await retrieve(dir, t.prompt, Array.isArray(t.plan.paths) ? t.plan.paths.slice(0, 8) : []);
  }
  const skills = await loadSkills(root, t.prompt);
  t.context = { paths: selected.files.map(f => f.path), characters: selected.characters, totalFiles: selected.totalFiles, skills: skills.map(s => s.name) };
  let feedback;
  for (let round = 1; round <= limits.rounds; round++) {
    t.round = round;
    await event(t, 'Coder', `Sửa bằng patch — lượt ${round}/${limits.rounds}`);
    const change = await call('Coder', { task: t.prompt, plan: t.plan, files: selected.files, skills, feedback }, round);
    try { await applyEdits(dir, change.edits, selected.files.map(f => f.path)); }
    catch (error) {
      feedback = { patchError: error.message };
      await event(t, 'Coder', error.message);
      continue;
    }
    await execute('git', ['add', '--all'], dir);
    t.diff = await execute('git', ['diff', '--cached', '--no-ext-diff'], dir);
    await event(t, 'Quality gates', 'Chạy các script đã cấu hình trong Docker offline.');
    t.test = await validate(t, dir, root);
    checkCancellation(t);
    if (t.test.gates.some(g => g.status === 'unavailable')) throw Error('Docker hoặc image không khả dụng; hãy kiểm tra môi trường trước khi chạy lại.');
    const gateSummary = { passed: t.test.passed, gates: t.test.gates.map(g => ({ ...g, output: g.output?.slice(0, 1800), truncated: (g.output?.length || 0) > 1800 })) };
    if (t.test.passed && t.diff.trim()) {
      if (t.routing.reviewer) {
        await event(t, 'Reviewer', 'Review sau khi quality gates đạt.');
        if (t.diff.length > 32000) throw Error('Diff vượt giới hạn review; chia nhỏ tác vụ.');
        t.review = await call('Reviewer', { task: t.prompt, diff: t.diff, test: gateSummary }, round);
      } else t.review = { approved: null, summary: 'Bỏ qua AI Reviewer cho task đơn giản; cần bạn xem diff.' };
      if (!t.routing.reviewer || t.review?.approved === true) {
        transition(t, 'ready');
        await event(t, 'Approval', 'Chờ bạn xem diff và chủ động tạo draft PR.');
        return;
      }
    }
    feedback = { test: gateSummary, review: t.review };
    selected = await retrieve(dir, t.prompt, t.context.paths);
  }
  checkCancellation(t);
  transition(t, 'needs_changes');
  await event(t, 'System', 'Đã dừng sau 2 lượt; cần xem lỗi và điều chỉnh yêu cầu.');
}
