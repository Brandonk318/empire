// End-to-end against the real HTTP server, with the offline mock brain and a fake coding agent.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer as boot, waitFor, killAll } from './helpers.js';

after(killAll);

async function startServer(mode) {
  const s = await boot({ FAKE_CLAUDE_MODE: mode });
  return { base: s.base, data: s.box.dir, call: async (m, p, b) => s.call(m, p, b) };
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
