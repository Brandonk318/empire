import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.GROWLORD_QUIET = '1';
process.env.GROWLORD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'growlord-unit-'));

const { classifyFailure } = await import('../server/agent.js');
const { parseAnswer } = await import('../server/brain.js');
const { redact } = await import('../server/log.js');
const gate = await import('../server/gate.js');

test('classifies coding-agent failures by name', () => {
  assert.equal(classifyFailure({ apiStatus: 401, text: 'Invalid API key · Fix external API key' }), 'expired_login');
  assert.equal(classifyFailure({ text: 'OAuth token has expired. Please run /login' }), 'expired_login');
  assert.equal(classifyFailure({ text: 'Not logged in · Please run /login' }), 'expired_login');
  assert.equal(classifyFailure({ apiStatus: 429, text: '' }), 'limit_reached');
  assert.equal(classifyFailure({ text: "Claude AI usage limit reached|1793900000" }), 'limit_reached');
  assert.equal(classifyFailure({ text: "You've hit your limit · resets 3pm" }), 'limit_reached');
  assert.equal(classifyFailure({ notFound: true }), 'not_installed');
  assert.equal(classifyFailure({ text: 'ECONNRESET socket hang up' }), 'other');
});

test('parses Grok JSON answers strictly', () => {
  assert.deepEqual(parseAnswer('{"reply":"Use workshops.","district":"leads"}'), { reply: 'Use workshops.', district: 'leads' });
  assert.deepEqual(parseAnswer('```json\n{"reply":"x","district":"ADS"}\n```'), { reply: 'x', district: 'ads' });
  assert.equal(parseAnswer('{"reply":"x","district":"moon"}').district, 'none');
  assert.throws(() => parseAnswer('Sure! Leads come from workshops.'));
  assert.throws(() => parseAnswer('{"district":"leads"}'));
});

test('redacts keys before anything is logged', () => {
  process.env.XAI_API_KEY = 'xai-supersecretvalue123456';
  const out = redact('calling with xai-supersecretvalue123456 and sk-ant-abcdefghijkl and Bearer abcdefghijk');
  assert.ok(!out.includes('supersecret'));
  assert.ok(!out.includes('sk-ant-abc'));
  assert.ok(!out.includes('abcdefghijk'));
  delete process.env.XAI_API_KEY;
});

test('gate: nothing outbound runs without approval, and edits void approval', async () => {
  gate._resetForTests();
  let ran = 0;
  gate.registerExecutor('build', async (a) => {
    ran++;
    a.status = 'succeeded';
  });
  const dir = process.env.GROWLORD_DATA_DIR;
  const briefPath = path.join(dir, 'b.md');
  fs.writeFileSync(briefPath, 'v1');
  const a = gate.createAction('build', { briefPath, buildDir: dir, request: 'x' });

  assert.throws(() => gate.execute(a.id), /not been approved/);
  assert.equal(ran, 0);

  // email/post/publish stay blocked even after approval: no executor exists
  const e = gate.createAction('email', { to: 'someone@example.com' });
  assert.throws(() => gate.execute(e.id), /not been approved/);
  assert.throws(() => gate.approve(e.id), /not available/);

  // content changed after approval -> blocked
  gate.registerExecutor('build', async () => {
    ran++;
  });
  const b = gate.createAction('build', { briefPath, buildDir: dir, request: 'y' });
  b.status = 'approved';
  b.approvedHash = gate.contentHash(b);
  fs.writeFileSync(briefPath, 'v2 (edited on disk)');
  assert.throws(() => gate.execute(b.id), /changed after approval/);
  assert.equal(b.status, 'pending');

  // approve -> runs
  gate.approve(a.id);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ran, 1);
});
