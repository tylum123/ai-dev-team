import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

test('hosted demo uses no network and cannot publish or execute Live', async () => {
  const sandbox = { window: {}, crypto: { randomUUID } };
  vm.runInNewContext(await fs.readFile(new URL('../deploy/hosted-demo.js', import.meta.url), 'utf8'), sandbox);
  const request = sandbox.window.hostedDemo;
  await assert.rejects(request('/api/tasks', { mode: 'live', prompt: 'do real work' }), /worker/);
  await assert.rejects(request('/api/tasks/id/publish', {}), /worker/);
  await assert.rejects(request('/api/tasks', { mode: 'demo', prompt: 'short' }), /8/);
  const task = await request('/api/tasks', { mode: 'demo', prompt: 'example task' });
  assert.equal(task.tokens, 0);
  assert.equal(task.test.passed, null);
  assert.equal(task.review.approved, null);
  assert.equal(task.status, 'demo_complete');
  const state = await request('/api/state');
  assert.equal(state.config.hostedDemo, true);
  assert.equal(state.tasks.length, 1);
});
