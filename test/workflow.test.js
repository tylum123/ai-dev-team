import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safePath, repoName, command, ask, estimateCost } from '../core.js';
import { route, applyEdits, retrieve, qualityGates, loadSkills } from '../workflow.js';
import { runGates, runLive } from '../runner.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
async function fixture(t, files = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devteam-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await fs.writeFile(path.join(dir, name), content);
  }
  return dir;
}

test('reject unsafe paths and repository URLs', () => {
  for (const name of ['../x.js', '.env', 'a/../../x.js', 'a\\x.js', 'C:/x.js', 'NUL.js', 'a./x.js', 'a//x.js']) {
    assert.throws(() => safePath(root, name));
  }
  assert.equal(repoName('https://github.com/user/repo.git'), 'https://github.com/user/repo');
  for (const url of ['http://github.com/a/b', 'https://evil.test/a/b', 'https://github.com/a/..']) assert.throws(() => repoName(url));
});

test('route simple tasks to fast model and sensitive tasks to strong', () => {
  const env = { OPENAI_MODEL_FAST: 'fast', OPENAI_MODEL_STRONG: 'strong' };
  assert.deepEqual(route('fix css color', 'auto', env), { complexity: 'simple', planner: false, reviewer: false, model: 'fast' });
  assert.equal(route('fix css authentication API', 'auto', env).reviewer, true);
});

test('patches preserve unrelated text and reject ambiguous matches atomically', async t => {
  const dir = await fixture(t, { 'a.js': 'one two one', 'b.js': 'keep' });
  await assert.rejects(applyEdits(dir, [
    { path: 'b.js', before: 'keep', after: 'changed' },
    { path: 'a.js', before: 'one', after: 'x' },
  ], ['a.js', 'b.js']), /exactly once/);
  assert.equal(await fs.readFile(path.join(dir, 'b.js'), 'utf8'), 'keep');
  await applyEdits(dir, [{ path: 'a.js', before: 'two', after: 'three' }], ['a.js']);
  assert.equal(await fs.readFile(path.join(dir, 'a.js'), 'utf8'), 'one three one');
  await assert.rejects(applyEdits(dir, [{ path: 'b.js', before: 'keep', after: 'x' }], []), /Read file/);
});

test('block symlink parents, AGENTS edits and weakened test scripts', async t => {
  const dir = await fixture(t, { 'AGENTS.md': 'rules', 'package.json': '{"scripts":{"test":"node --test"}}' });
  const outside = await fixture(t, { 'x.js': 'safe' });
  await fs.symlink(outside, path.join(dir, 'linked'), 'junction');
  await assert.rejects(applyEdits(dir, [{ path: 'linked/new.js', before: '', after: 'bad' }], []), /Symlink/i);
  await assert.rejects(applyEdits(dir, [{ path: 'AGENTS.md', before: 'rules', after: 'none' }], ['AGENTS.md']), /Protected/);
  await assert.rejects(applyEdits(dir, [{ path: 'package.json', before: 'node --test', after: 'echo ok' }], ['package.json']), /manual/);
});

test('retrieve relevant filenames and direct imports within budget', async t => {
  const dir = await fixture(t, {
    'src/search.js': "import { normalize } from './normalize.js';\nexport function search() {}",
    'src/normalize.js': 'export const normalize = x => x;',
    'unrelated.js': 'do not load', 'secret.json': '{"key":"not allowed"}',
  });
  await command('git', ['init'], dir);
  await command('git', ['add', '.'], dir);
  const context = await retrieve(dir, 'fix search');
  assert.deepEqual(context.files.map(f => f.path), ['src/search.js', 'src/normalize.js']);
  assert.ok(context.characters <= 32000);
  assert.ok(!context.map.includes('secret.json'));
});

test('skills load only when relevant', async () => {
  assert.deepEqual(await loadSkills(root, 'rename variable'), []);
  assert.deepEqual((await loadSkills(root, 'fix css')).map(s => s.name), ['frontend', 'testing']);
});

test('quality gates skip missing scripts and never pass an empty test suite', async t => {
  const dir = await fixture(t, { 'package.json': '{"scripts":{"test":"node --test"}}' });
  assert.equal(qualityGates({}).filter(g => g.configured).length, 0);
  const result = await runGates({ id: 'test' }, dir, root, async (bin, args) => {
    if (args[0] === 'run') {
      assert.ok(args.includes('--network=none'));
      assert.ok(args.includes('--read-only'));
    }
    return '# tests 0';
  });
  assert.equal(result.passed, false);
  assert.equal(result.gates.find(g => g.name === 'test').status, 'empty');
});

test('API records cache usage, including malformed model output', async () => {
  const result = await ask('Coder', { task: 'test' }, 'configured-model', async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'configured-model');
    assert.equal(body.store, false);
    return { ok: true, json: async () => ({ status: 'completed', usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 50 }, output_tokens: 20 }, output: [{ content: [{ type: 'output_text', text: 'invalid JSON' }] }] }) };
  });
  assert.equal(result.usage.cached, 50);
  assert.ok(result.error);
  assert.equal(estimateCost(result.usage, 'unknown'), null);
  assert.equal(estimateCost(result.usage, 'm', { m: { input: 2, cached: 1, output: 5 } }), 0.00025);
});

for (const passing of [true, false]) {
  test(`orchestrator ${passing ? 'waits for approval' : 'stops after two rounds without Reviewer'}`, async t => {
    const data = await fixture(t);
    const dir = path.join(data, 'task');
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, 'style.css'), 'a { color: red; }');
    await command('git', ['init'], dir);
    await command('git', ['add', '.'], dir);
    const task = { id: 'task', prompt: 'fix css in style.css', complexity: passing ? 'simple' : 'complex', repo: 'mock', branch: 'ai/task', calls: 0, tokens: 0, status: 'running' };
    const roles = [];
    await runLive(task, {
      root, data, save: async () => {}, event: async () => {},
      execute: async (bin, args, cwd) => {
        if (args[0] === 'clone' || args[0] === 'checkout') return '';
        if (args[0] === 'branch') return 'main';
        return command(bin, args, cwd);
      },
      query: async role => {
        roles.push(role);
        const content = await fs.readFile(path.join(dir, 'style.css'), 'utf8');
        return { value: role === 'Planner' ? { paths: ['style.css'] } : { edits: [{ path: 'style.css', before: content, after: content.replace(/red|blue/, x => x === 'red' ? 'blue' : 'red') }] }, usage: { input: 10, output: 10, cached: 0 }, tokens: 20 };
      },
      validate: async () => ({ passed: passing, gates: [] }),
    });
    assert.equal(task.status, passing ? 'ready' : 'needs_changes');
    assert.equal(roles.filter(r => r === 'Coder').length, passing ? 1 : 2);
    assert.ok(!roles.includes('Reviewer'));
    assert.equal(task.telemetry.length, roles.length);
  });
}
