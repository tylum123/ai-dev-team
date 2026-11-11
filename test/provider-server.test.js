import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';

test('local provider endpoint saves settings without returning the API key', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devteam-provider-'));
  let child;
  t.after(async () => {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    await fs.rm(dir, { recursive: true, force: true });
  });
  for (const name of ['server.js', 'core.js', 'runner.js', 'workflow.js', 'agents.js', 'task-state.js', 'provider-config.js', 'package.json']) {
    await fs.copyFile(new URL(`../${name}`, import.meta.url), path.join(dir, name));
  }
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const env = { ...process.env, PORT: String(port) };
  delete env.OPENAI_API_KEY;
  delete env.OPENAI_MODEL;
  child = spawn(process.execPath, ['server.js'], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Server startup timeout')), 10000);
    child.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    child.once('exit', code => { clearTimeout(timer); reject(Error(`Server exited ${code}`)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const input = { protocol: 'responses', baseUrl: 'https://api.openai.com/v1', model: 'example-model', apiKey: 'private-test-key' };
  const denied = await fetch(`${base}/api/provider`, { method: 'POST', headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(denied.status, 403);
  const response = await fetch(`${base}/api/provider`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(response.status, 200);
  assert.ok(!(await response.text()).includes(input.apiKey));
  const state = await (await fetch(`${base}/api/state`)).text();
  assert.ok(!state.includes(input.apiKey));
  assert.equal(JSON.parse(state).config.model, input.model);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, '.data', 'provider.json'), 'utf8')).apiKey, input.apiKey);
});
