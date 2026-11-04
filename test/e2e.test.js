// End-to-end against the real HTTP server, with the offline mock brain and a fake coding agent.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAKE = path.join(ROOT, 'test/fixtures/fake-claude.js');
const procs = [];
after(() => procs.forEach((p) => p.kill()));

async function startServer(mode) {
  const port = 4800 + Math.floor(Math.random() * 1000);
  const data = fs.mkdtempSync(path.join(os.tmpdir(), `growlord-e2e-${mode}-`));
  const p = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
    env: { ...process.env, PORT: String(port), GROWLORD_BRAIN: 'mock', GROWLORD_QUIET: '1', GROWLORD_DATA_DIR: data, CODING_AGENT_BIN: FAKE, FAKE_CLAUDE_MODE: mode, KOKORO_URL: 'http://127.0.0.1:9' },
    stdio: 'ignore',
  });
  procs.push(p);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try {
      const html = await (await fetch(base + '/')).text();
      const session = html.match(/growlord-session" content="([0-9a-f]{48})"/)[1];
      const call = async (method, p, body) => {
        const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', 'x-growlord-session': session }, body: body && JSON.stringify(body) });
        return { status: r.status, body: await r.json() };
      };
      return { base, data, call };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('server did not start');
}

async function waitFor(call, id, statuses) {
  for (let i = 0; i < 100; i++) {
    const r = await call('GET', `/api/actions/${id}`);
    if (statuses.includes(r.body.status)) return r.body;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('timed out waiting for action');
}

test('three questions answered from business.md fly to the right district', async () => {
  const { call } = await startServer('ok');
  const cases = [
    ['How do we get new leads?', 'leads', /workshops/i],
    ['Should we run paid ads?', 'ads', /\$200/],
    ['What tone do we use in the inbox?', 'inbox', /warm and respectful/i],
  ];
  for (const [q, district, re] of cases) {
    const r = await call('POST', '/api/ask', { text: q });
    assert.equal(r.status, 200);
    assert.equal(r.body.district, district, q);
    assert.match(r.body.reply, re);
  }
  const miss = await call('POST', '/api/ask', { text: 'What is our office phone number?' });
  assert.equal(miss.body.reply, "That's not in the business file.");
  assert.equal(miss.body.district, 'none');
});

test('server refuses requests without the session, from other hosts, or other origins', async () => {
  const { base } = await startServer('ok');
  assert.equal((await fetch(base + '/api/actions')).status, 403);
  const html = await (await fetch(base + '/')).text();
  const s = html.match(/content="([0-9a-f]{48})"/)[1];
  const evil = await fetch(base + '/api/actions', { headers: { 'x-growlord-session': s, origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
});

test('approved build runs end to end and streams progress', async () => {
  const { call, data } = await startServer('ok');
  const r = await call('POST', '/api/ask', { text: 'build a one-page flyer for the permit workshop' });
  assert.equal(r.body.kind, 'build');
  assert.equal(r.body.district, 'workshop');
  const a = r.body.action;
  assert.equal(a.status, 'pending');
  assert.equal(a.preflight.ok, true);
  assert.match(path.basename(a.briefFile), /^\d{4}-\d{2}-\d{2}-a-one-page-flyer-for-the-permit-workshop\.md$/);

  // there is no route that runs a build without approval
  assert.equal((await call('POST', `/api/actions/${a.id}/run`)).status, 404);
  assert.equal((await call('POST', `/api/actions/${a.id}/retry`)).status, 409);

  await call('POST', `/api/actions/${a.id}/approve`);
  const done = await waitFor(call, a.id, ['succeeded', 'failed']);
  assert.equal(done.status, 'succeeded', JSON.stringify(done.failure));
  assert.ok(done.progress.some((p) => p.type === 'tool' && /Write/.test(p.text)));
  const buildDir = path.join(data, 'builds', path.basename(a.briefFile, '.md'));
  assert.ok(fs.existsSync(path.join(buildDir, 'index.html')));
  const log = fs.readFileSync(path.join(data, 'logs/chain.log'), 'utf8');
  for (const step of ['research brief', 'brief saved', 'pre-flight', 'APPROVED', 'Build finished']) assert.ok(log.includes(step), step);
});

test('logged-out build fails clearly, keeps the brief, offers manual command and retry', async () => {
  const { call, data } = await startServer('logged_out');
  const r = await call('POST', '/api/ask', { text: 'build a price sheet' });
  const a = r.body.action;
  assert.equal(a.preflight.ok, false);
  assert.equal(a.preflight.reason, 'expired_login');
  assert.match(r.body.reply, /Expired or missing login/);

  await call('POST', `/api/actions/${a.id}/approve`);
  const failed = await waitFor(call, a.id, ['failed', 'succeeded']);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.failure.reason, 'expired_login');
  assert.match(failed.failure.manualCommand, /fake-claude\.js -p "Read BRIEF\.md/);
  assert.ok(fs.existsSync(path.join(data, 'briefs', path.basename(a.briefFile))), 'brief kept');

  // retry with unchanged brief re-runs (and fails the same way)
  const retry = await call('POST', `/api/actions/${a.id}/retry`);
  assert.equal(retry.status, 200);
  const again = await waitFor(call, a.id, ['failed']);
  assert.equal(again.failure.reason, 'expired_login');

  // editing the brief voids the approval: retry is refused until approved again
  await call('PUT', `/api/actions/${a.id}/brief`, { text: '# Brief: edited\n' });
  const afterEdit = await call('GET', `/api/actions/${a.id}`);
  assert.equal(afterEdit.body.status, 'pending');
  assert.equal(afterEdit.body.approved, false);
});

test('usage-limit failures are named as such', async () => {
  const { call } = await startServer('limit');
  const r = await call('POST', '/api/ask', { text: 'build a tiny test page' });
  assert.equal(r.body.action.preflight.reason, 'limit_reached');
});
