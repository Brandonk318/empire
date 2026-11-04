// Shared helpers: start a real Growlord server in a sandbox (temp data + temp business files).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FAKE_CLAUDE = path.join(ROOT, 'test/fixtures/fake-claude.js');
export const FAKE_GROK = path.join(ROOT, 'test/fixtures/fake-grok.js');

const procs = [];
export function killAll() {
  procs.forEach((p) => p.kill());
}

export function sandbox(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `growlord-${name}-`));
  const businessFile = path.join(dir, 'business.md');
  fs.copyFileSync(path.join(ROOT, 'business.md'), businessFile);
  const businessDir = path.join(dir, 'business');
  fs.mkdirSync(businessDir);
  return { dir, businessFile, businessDir };
}

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

export async function startServer(env = {}, box = sandbox('srv')) {
  const port = await freePort();
  const p = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      GROWLORD_BRAIN: 'mock',
      GROWLORD_QUIET: '1',
      GROWLORD_DATA_DIR: box.dir,
      GROWLORD_BUSINESS_FILE: box.businessFile,
      GROWLORD_BUSINESS_DIR: box.businessDir,
      CODING_AGENT_BIN: FAKE_CLAUDE,
      FAKE_CLAUDE_MODE: 'ok',
      KOKORO_URL: 'http://127.0.0.1:9',
      XAI_API_KEY: '',
      ...env,
    },
    stdio: 'ignore',
  });
  procs.push(p);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      const html = await (await fetch(base + '/')).text();
      const session = html.match(/growlord-session" content="([0-9a-f]{48})"/)[1];
      const call = async (method, pth, body) => {
        const r = await fetch(base + pth, { method, headers: { 'content-type': 'application/json', 'x-growlord-session': session }, body: body && JSON.stringify(body) });
        const ct = r.headers.get('content-type') || '';
        return { status: r.status, type: ct, body: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
      };
      const stop = () =>
        new Promise((res) => {
          p.once('exit', res);
          p.kill('SIGTERM');
        });
      return { base, session, call, stop, box, proc: p };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('server did not start');
}

export async function waitFor(call, id, statuses) {
  for (let i = 0; i < 100; i++) {
    const r = await call('GET', `/api/actions/${id}`);
    if (statuses.includes(r.body.status)) return r.body;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('timed out waiting for action');
}
