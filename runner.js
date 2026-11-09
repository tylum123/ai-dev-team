import path from 'node:path';
import { command, ask, estimateCost } from './core.js';
import { retrieve, applyEdits, route, qualityGates, loadSkills, readSafe, limits } from './workflow.js';

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
    } catch (e) { gate.status = 'failed'; gate.output = e.message; }
    finally { await execute('docker', ['rm', '-f', name], root, 10000).catch(() => {}); }
  }
  return { passed: gates.some(g => g.name === 'test' && g.status === 'passed') && gates.every(g => ['passed', 'skipped'].includes(g.status)), gates };
}

export async function runLive(t, { root, data, event, save, execute = command, query = ask, validate = runGates }) {
  const dir = path.join(data, t.id);
  t.workspace = dir;
  t.routing = route(t.prompt, t.complexity);
  t.telemetry = [];
  const call = async (role, input, round = 0) => {
    if (t.calls >= limits.calls) throw Error('Đã đạt giới hạn 6 lượt AI');
    if (JSON.stringify(input).length > 60000) throw Error('Context vượt giới hạn 60.000 ký tự');
    t.calls++;
    await save();
    const started = Date.now();
    const result = await query(role, input, t.routing.model);
    let prices = {};
    try { prices = JSON.parse(process.env.MODEL_PRICES_JSON || '{}'); } catch { /* Unknown prices stay unknown. */ }
    t.tokens += result.tokens;
    t.telemetry.push({ role, round, model: t.routing.model, ...result.usage, tokens: result.tokens,
      cost: estimateCost(result.usage, t.routing.model, prices), milliseconds: Date.now() - started, error: result.error });
    await save();
    if (result.error) throw Error(result.error);
    return result.value;
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
    const gateSummary = { passed: t.test.passed, gates: t.test.gates.map(g => ({ ...g, output: g.output?.slice(0, 1800), truncated: (g.output?.length || 0) > 1800 })) };
    if (t.test.passed && t.diff.trim()) {
      if (t.routing.reviewer) {
        await event(t, 'Reviewer', 'Review sau khi quality gates đạt.');
        if (t.diff.length > 32000) throw Error('Diff vượt giới hạn review; chia nhỏ tác vụ.');
        t.review = await call('Reviewer', { task: t.prompt, diff: t.diff, test: gateSummary }, round);
      } else t.review = { approved: null, summary: 'Bỏ qua AI Reviewer cho task đơn giản; cần bạn xem diff.' };
      if (!t.routing.reviewer || t.review?.approved === true) {
        t.status = 'ready';
        await event(t, 'Approval', 'Chờ bạn xem diff và chủ động tạo draft PR.');
        return;
      }
    }
    feedback = { test: gateSummary, review: t.review };
    selected = await retrieve(dir, t.prompt, t.context.paths);
  }
  t.status = 'needs_changes';
  await event(t, 'System', 'Đã dừng sau 2 lượt; cần xem lỗi và điều chỉnh yêu cầu.');
}
