// Business folder, sources, follow-ups, "remember that", saved Workshop, xAI/CLI/TTS paths, doctor model check.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { startServer, sandbox, waitFor, killAll, ROOT, FAKE_GROK } from './helpers.js';

after(killAll);

// ---------------------------------------------------------------- fake xAI API
function fakeXai(script) {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    calls.push({ url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'grok-4' }, { id: 'grok-3-mini' }] }));
    const content = script.shift() ?? '{"reply":"ok","district":"none"}';
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${server.address().port}/v1`, calls, close: () => server.close() })));
}

test('xAI path: business files in the prompt, bad JSON retried, sources checked, follow-ups remembered, key never logged', async () => {
  const xai = await fakeXai([
    'Sure! Here is what I found.', // not JSON -> retry
    '{"reply":"Free workshops with trade schools.","district":"leads","source":"Leads"}',
    '{"reply":"Workshops there are co-hosted with trade schools.","district":"leads","source":"Pricing Secrets"}',
  ]);
  const key = 'xai-testkey-abcdef123456';
  const { call, box } = await startServer({ GROWLORD_BRAIN: 'xai', XAI_API_KEY: key, XAI_BASE_URL: xai.url });
  fs.writeFileSync(path.join(box.businessDir, 'workshops.md'), '# Workshops\n\n## Workshops\n- Next Cebu workshop: March 14.\n');

  const r1 = await call('POST', '/api/ask', { text: 'How do we get leads?' });
  assert.equal(r1.body.reply, 'Free workshops with trade schools.');
  assert.equal(r1.body.district, 'leads');
  assert.match(r1.body.source, /^Leads \(.*business\.md\)$/);
  const chats = xai.calls.filter((c) => c.url === '/v1/chat/completions');
  assert.equal(chats.length, 2, 'one retry after bad JSON');
  const prompt = chats[0].body.messages[0].content;
  assert.match(prompt, /Momoempire CRM/);
  assert.match(prompt, /Next Cebu workshop: March 14/, 'business/ files are included');
  assert.match(prompt, /FILE: .*workshops\.md/);
  assert.equal(chats[0].auth, `Bearer ${key}`);

  const r2 = await call('POST', '/api/ask', { text: 'What about Nigeria?' });
  const p2 = xai.calls.at(-1).body.messages[0].content;
  assert.match(p2, /RECENT CONVERSATION[\s\S]*How do we get leads\?[\s\S]*Free workshops with trade schools/);
  assert.equal(r2.body.source, null, 'a made-up source is never shown');

  await call('POST', '/api/conversation/reset');
  await call('POST', '/api/ask', { text: 'And ads?' });
  assert.doesNotMatch(xai.calls.at(-1).body.messages[0].content, /RECENT CONVERSATION/);

  const log = fs.readFileSync(path.join(box.dir, 'logs/chain.log'), 'utf8');
  assert.ok(!log.includes(key), 'key never written to the log');
  xai.close();
});

test('doctor flags a GROK_MODEL your key cannot use and suggests real ones', async () => {
  const xai = await fakeXai([]);
  const box = sandbox('doctor');
  // async spawn: a blocking spawnSync would freeze the fake xAI server living in this process
  const r = await new Promise((resolve) => {
    const c = spawn(process.execPath, [path.join(ROOT, 'server/doctor.js'), '--skip-agent'], {
      env: { ...process.env, XAI_API_KEY: 'xai-testkey-abcdef123456', XAI_BASE_URL: xai.url, GROK_MODEL: 'grok-9-imaginary', GROWLORD_BRAIN: 'auto', GROWLORD_DATA_DIR: box.dir, GROWLORD_BUSINESS_FILE: box.businessFile, GROWLORD_BUSINESS_DIR: box.businessDir, KOKORO_URL: 'http://127.0.0.1:9', GROK_BIN: 'growlord-no-such-grok' },
    });
    let stdout = '';
    c.stdout.on('data', (d) => (stdout += d));
    c.on('close', (status) => resolve({ status, stdout }));
  });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /GROK_MODEL=grok-9-imaginary is not in your account's models/);
  assert.match(r.stdout, /grok-4, grok-3-mini/);
  assert.match(r.stdout, /Business files .*1 file\(s\)/);
  xai.close();
});

test('Grok CLI path: flags detected from --help, business file sent in the prompt', async () => {
  const { call } = await startServer({ GROWLORD_BRAIN: 'cli', GROK_BIN: FAKE_GROK });
  const r = await call('POST', '/api/ask', { text: 'How do we get leads?' });
  assert.equal(r.body.reply, 'From the CLI: free workshops with trade schools.');
  assert.equal(r.body.district, 'leads');
  assert.equal(r.body.brain, 'cli');
});

test('voice: Kokoro audio is proxied when running, 503 (browser voice) when not', async () => {
  const wav = Buffer.from('RIFF....WAVEfmt fake');
  const tts = http.createServer((req, res) => {
    if (req.url === '/health') return res.end('ok');
    res.setHeader('content-type', 'audio/wav');
    res.end(wav);
  });
  await new Promise((r) => tts.listen(0, '127.0.0.1', r));
  const on = await startServer({ KOKORO_URL: `http://127.0.0.1:${tts.address().port}` });
  const r = await on.call('POST', '/api/tts', { text: 'Hello Brandon' });
  assert.equal(r.status, 200);
  assert.equal(r.type, 'audio/wav');
  assert.deepEqual(r.body, wav);
  tts.close();
  const off = await startServer();
  assert.equal((await off.call('POST', '/api/tts', { text: 'Hello' })).status, 503);
});

test('business folder: new files are used at once, cited, and announced live', async () => {
  const { base, session, call, box } = await startServer();
  // listen for the live "business" event
  const ctrl = new AbortController();
  const events = fetch(`${base}/api/events?s=${session}`, { signal: ctrl.signal }).then(async (res) => {
    const reader = res.body.getReader();
    let text = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return text;
      text += Buffer.from(value).toString();
      if (text.includes('event: business')) return text;
    }
  });
  await new Promise((r) => setTimeout(r, 200));
  fs.writeFileSync(path.join(box.businessDir, 'workshops.md'), '# Workshops\n\n## Workshops\n- Next Cebu workshop: March 14 at Cebu Tech.\n');
  const ev = await Promise.race([events, new Promise((_, rej) => setTimeout(() => rej(new Error('no business event')), 5000))]);
  assert.match(ev, /event: business[\s\S]*workshops\.md/);
  ctrl.abort();

  const r = await call('POST', '/api/ask', { text: 'When is the next Cebu workshop?' });
  assert.match(r.body.reply, /March 14/);
  assert.match(r.body.source, /^Workshops \(.*workshops\.md\)$/);

  const info = await call('GET', '/api/business');
  assert.equal(info.body.files.length, 2);
});

test('"remember that ..." drafts a business update that only lands after approval, with a backup', async () => {
  const { call, box } = await startServer();
  const before = fs.readFileSync(box.businessFile, 'utf8');
  const r = await call('POST', '/api/ask', { text: 'Remember that the referral program launches in January' });
  assert.equal(r.body.kind, 'business_update');
  const a = r.body.action;
  assert.equal(a.status, 'pending');
  const headings = fs.readFileSync(box.businessFile, 'utf8').match(/^## .*/gm).map((h) => h.slice(3));
  assert.ok(headings.includes(a.update.section), `placed in an existing section (got ${a.update.section})`);
  assert.equal(fs.readFileSync(box.businessFile, 'utf8'), before, 'nothing written before approval');

  // move it to a new section, then approve
  await call('PUT', `/api/actions/${a.id}/payload`, { section: 'Launch dates' });
  await call('POST', `/api/actions/${a.id}/approve`);
  const done = await waitFor(call, a.id, ['succeeded', 'failed']);
  assert.equal(done.status, 'succeeded', JSON.stringify(done.failure));
  const after = fs.readFileSync(box.businessFile, 'utf8');
  assert.match(after, /\n## Launch dates\n- the referral program launches in January\n$/);
  const backups = fs.readdirSync(path.join(box.businessDir, '.history'));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(box.businessDir, '.history', backups[0]), 'utf8'), before);

  // the next answer can use it
  const q = await call('POST', '/api/ask', { text: 'What are the launch dates?' });
  assert.match(q.body.reply, /January/);

  // can't write outside the business files
  const bad = await call('POST', '/api/business/proposals', { file: '../../etc/evil.txt', section: 'x', text: 'y' });
  assert.equal(bad.status, 400);
});

test('Workshop items survive a restart; interrupted runs come back as failed with Retry', async () => {
  const box = sandbox('restart');
  const one = await startServer({ FAKE_CLAUDE_MODE: 'logged_out' }, box);
  const r = await one.call('POST', '/api/ask', { text: 'build a tiny landing page' });
  const id = r.body.action.id;
  await one.call('POST', `/api/actions/${id}/approve`);
  await waitFor(one.call, id, ['failed']);
  const p2 = await one.call('POST', '/api/ask', { text: 'remember that we love tests' });
  await one.stop();

  // simulate a crash mid-build for a third item
  const state = path.join(box.dir, 'state/actions.json');
  const saved = JSON.parse(fs.readFileSync(state, 'utf8'));
  const running = { ...saved.find((a) => a.id === id), id: '00000000-0000-4000-8000-000000000000', status: 'running', failure: null };
  fs.writeFileSync(state, JSON.stringify([...saved, running]));

  const two = await startServer({ FAKE_CLAUDE_MODE: 'logged_out' }, box);
  const list = (await two.call('GET', '/api/actions')).body;
  assert.equal(list.length, 3);
  assert.equal(list.find((a) => a.id === id).failure.reason, 'expired_login');
  assert.equal(list.find((a) => a.id === p2.body.action.id).status, 'pending');
  const interrupted = list.find((a) => a.id === running.id);
  assert.equal(interrupted.status, 'failed');
  assert.equal(interrupted.failure.label, 'Interrupted');
  assert.match(interrupted.failure.manualCommand, /-p "Read BRIEF\.md/);
  assert.equal((await two.call('POST', `/api/actions/${running.id}/retry`)).status, 200);
});

test('brief names are cut at a word boundary', async () => {
  process.env.GROWLORD_QUIET = '1';
  process.env.GROWLORD_DATA_DIR = sandbox('slug').dir;
  const { slugify } = await import('../server/index.js');
  assert.equal(slugify('build a one-page HTML flyer for the free permit-readiness workshop'), 'a-one-page-html-flyer-for-the-free-permit');
  assert.equal(slugify('build !!!'), 'build');
});
