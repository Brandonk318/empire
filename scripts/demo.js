#!/usr/bin/env node
// npm run demo [-- --mock-brain] [-- --skip-build]
//
// Runs the "done means" checks against your REAL setup:
//   1. three questions (leads, ads, inbox) answered from business.md, with the district each flies to
//   2. one approved build, run end to end by the real coding agent
//   3. one build run while logged out: fails clearly and keeps the brief
//
// Step 2 and 3 approve builds through the same API the Approve button uses.
// The builds are local only (./builds/...). Nothing is sent, posted, or published.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const mockBrain = argv.includes('--mock-brain');
const skipBuild = argv.includes('--skip-build');
const procs = [];
const cleanup = () => procs.forEach((p) => p.kill());
process.on('exit', cleanup);

const hr = (t) => console.log(`\n\x1b[36m=== ${t} ===\x1b[0m`);
const ok = (t) => console.log(`\x1b[32m✔ ${t}\x1b[0m`);
const bad = (t) => console.log(`\x1b[31m✖ ${t}\x1b[0m`);
let failures = 0;

async function start(port, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
    env: { ...env, PORT: String(port), GROWLORD_QUIET: '1', ...(mockBrain ? { GROWLORD_BRAIN: 'mock' } : {}) },
    stdio: 'ignore',
  });
  procs.push(p);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    try {
      const html = await (await fetch(base + '/')).text();
      const s = html.match(/growlord-session" content="([0-9a-f]{48})"/)[1];
      return async (method, p, body) => {
        const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', 'x-growlord-session': s }, body: body && JSON.stringify(body) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || r.status);
        return j;
      };
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error('server did not start');
}

async function follow(call, id) {
  let seen = 0;
  for (;;) {
    const a = await call('GET', `/api/actions/${id}`);
    for (const p of a.progress.slice(seen)) console.log(`   ${p.type === 'tool' ? '→' : '·'} ${p.text.split('\n')[0].slice(0, 140)}`);
    seen = a.progress.length;
    if (['succeeded', 'failed', 'rejected'].includes(a.status)) return a;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const call = await start(4790, process.env);

hr(`1. Three questions${mockBrain ? ' (MOCK brain: offline keyword match, not Grok)' : ''}`);
for (const [q, want] of [
  ['How do we get new leads?', 'leads'],
  ['Should we run paid ads right now?', 'ads'],
  ['How should I greet people in emails to the Philippines?', 'inbox'],
]) {
  const r = await call('POST', '/api/ask', { text: q });
  console.log(`Q: ${q}\nA: ${r.reply}\n   -> camera flies to: ${r.district} (brain: ${r.brain})`);
  r.district === want ? ok(`district ${want}`) : (bad(`expected ${want}, got ${r.district}`), failures++);
}

if (!skipBuild) {
  hr('2. Approved build, end to end (real coding agent)');
  const b = await call('POST', '/api/ask', { text: 'build a one-page HTML flyer for the free permit-readiness workshop, as a single index.html with no external assets' });
  console.log(`Brief: ${b.action.briefFile}\nPre-flight: ${b.action.preflight.ok ? 'OK' : b.action.preflight.reason} - ${b.action.preflight.message}`);
  await call('POST', `/api/actions/${b.action.id}/approve`);
  console.log('Approved. Streaming progress:');
  const done = await follow(call, b.action.id);
  if (done.status === 'succeeded') ok(`build succeeded -> ${done.buildDir}`);
  else (bad(`build failed: ${done.failure?.label}: ${done.failure?.message}`), failures++);
}

hr('3. Build while logged out (invalid credentials, empty config)');
const emptyCfg = fs.mkdtempSync(path.join(os.tmpdir(), 'growlord-logged-out-'));
// Start from an allowlist so no saved login, OAuth token, or session variable can leak in.
const KEEP = /^(PATH|LANG|LC_\w+|TERM|TMPDIR|TEMP|TMP|SYSTEMROOT|COMSPEC|PATHEXT|APPDATA|HTTPS?_PROXY|https?_proxy|NO_PROXY|no_proxy|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|GROWLORD_\w+|XAI_API_KEY|GROK_\w+|CODING_AGENT_BIN|BUILD_\w+|KOKORO_\w+)$/;
const loggedOut = Object.fromEntries(Object.entries(process.env).filter(([k]) => KEEP.test(k)));
Object.assign(loggedOut, { ANTHROPIC_API_KEY: 'sk-ant-invalid-growlord-demo', CLAUDE_CONFIG_DIR: emptyCfg, HOME: emptyCfg, USERPROFILE: emptyCfg });
const call2 = await start(4791, loggedOut);
const lo = await call2('POST', '/api/ask', { text: 'build a logged-out test page' });
console.log(`Growlord: ${lo.reply}`);
if (lo.action.preflight.ok) {
  bad('logged-out environment still has a working login; not approving a real build');
  process.exit(1);
}
ok(`pre-flight caught it before handoff: ${lo.action.preflight.reason}`);
await call2('POST', `/api/actions/${lo.action.id}/approve`);
const failed = await follow(call2, lo.action.id);
if (failed.status === 'failed' && failed.failure.reason === 'expired_login') ok(`failed clearly: ${failed.failure.label}`);
else (bad(`expected expired_login, got ${failed.status} ${failed.failure?.reason}`), failures++);
const kept = fs.existsSync(path.resolve(ROOT, failed.briefFile));
kept ? ok(`brief kept at ${failed.briefFile}`) : (bad('brief missing'), failures++);
console.log(`Run it by hand:\n   ${failed.failure?.manualCommand}`);
console.log(`Full log: logs/chain.log`);

cleanup();
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
