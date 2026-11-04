// Growlord local server. Binds to 127.0.0.1 only.
//
// Protections:
//  - Host header must be localhost/127.0.0.1 (blocks DNS-rebinding attacks).
//  - Every /api call needs the per-run session token that is injected into the page
//    this server serves, and a localhost Origin when a browser sends one.
//  - Outbound actions go through gate.js; there is no route that runs one unapproved.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { config, ROOT } from './config.js';
import { log } from './log.js';
import { ask, research, resolveBrain } from './brain.js';
import { preflight, runBuild, bus, REASONS } from './agent.js';
import * as gate from './gate.js';
import { ttsAvailable, synth } from './tts.js';
import { runChecks } from './checks.js';

const SESSION = crypto.randomBytes(24).toString('hex');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

gate.registerExecutor('build', runBuild);
// email / post / publish are deliberately not registered in this version:
// even after approval, the gate answers "not available".

// ------------------------------------------------------------- helpers

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, {
    'content-type': isBuf ? 'application/octet-stream' : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(isBuf ? body : JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 1_000_000) throw Object.assign(new Error('Body too large'), { status: 413 });
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

const allowedHosts = () => new Set([`127.0.0.1:${config.port}`, `localhost:${config.port}`]);

function hostOk(req) {
  return allowedHosts().has(String(req.headers.host || '').toLowerCase());
}

function originOk(req) {
  const o = req.headers.origin;
  if (!o) return true;
  return o === `http://127.0.0.1:${config.port}` || o === `http://localhost:${config.port}`;
}

function sessionOk(req, url) {
  const t = req.headers['x-growlord-session'] || url.searchParams.get('s') || '';
  const a = Buffer.from(String(t));
  const b = Buffer.from(SESSION);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function today() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

function slugify(s) {
  return s.toLowerCase().replace(/^\s*(please\s+)?build\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'build';
}

function uniquePath(dir, base, ext) {
  let p = path.join(dir, `${base}${ext}`);
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${base}-${i}${ext}`);
  return p;
}

function view(a) {
  if (!a) return null;
  const brief = fs.existsSync(a.payload.briefPath) ? fs.readFileSync(a.payload.briefPath, 'utf8') : '(brief file missing)';
  return {
    id: a.id,
    kind: a.kind,
    status: a.status,
    request: a.payload.request,
    briefFile: path.relative(ROOT, a.payload.briefPath).startsWith('..') ? a.payload.briefPath : path.relative(ROOT, a.payload.briefPath),
    buildDir: path.relative(ROOT, a.payload.buildDir).startsWith('..') ? a.payload.buildDir : path.relative(ROOT, a.payload.buildDir),
    brief,
    approved: Boolean(a.approvedHash),
    preflight: a.preflight || null,
    failure: a.failure,
    result: a.result || null,
    progress: a.progress.slice(-200),
    createdAt: a.createdAt,
  };
}

// ------------------------------------------------------------- build flow

const BUILD_RE = /^\s*(?:hey\s+growlord[,\s]+)?(?:please\s+)?build\b/i;

async function startBuild(text) {
  const request = text.replace(/^\s*(?:hey\s+growlord[,\s]+)?(?:please\s+)?/i, '').trim();
  log('build', 'step 1/3: research brief', { request });
  const md = await research(request);
  fs.mkdirSync(config.briefsDir, { recursive: true });
  const slug = slugify(request);
  const briefPath = uniquePath(config.briefsDir, `${today()}-${slug}`, '.md');
  fs.writeFileSync(briefPath, md);
  const buildDir = path.join(config.buildsDir, path.basename(briefPath, '.md'));
  log('build', 'brief saved', { briefPath: path.relative(ROOT, briefPath) });

  log('build', 'step 2/3: pre-flight before handoff');
  const pf = await preflight();
  const action = gate.createAction('build', { briefPath, buildDir, request }, { preflight: pf });
  log('build', 'step 3/3: waiting for Brandon to approve in the Workshop', { id: action.id });

  const title = request.replace(/^build\s+/i, '');
  const reply = pf.ok
    ? `I wrote a brief for ${title}. It's in the Workshop waiting for your approval.`
    : `I wrote and saved the brief for ${title}, but the coding agent isn't ready: ${REASONS[pf.reason] || pf.reason}. The details are in the Workshop.`;
  return { kind: 'build', reply, district: 'workshop', action: view(action) };
}

// ------------------------------------------------------------- SSE

const clients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
bus.on('progress', (ev) => broadcast('progress', ev));
bus.on('action', (a) => broadcast('action', view(a)));

// ------------------------------------------------------------- static

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  let base = config.publicDir;
  if (rel.startsWith('/vendor/three/')) {
    base = path.join(ROOT, 'node_modules', 'three');
    rel = rel.slice('/vendor/three'.length);
  }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep)) return send(res, 403, { error: 'forbidden' });
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: 'not found' });
  let body = fs.readFileSync(file);
  if (rel === '/index.html') body = Buffer.from(body.toString('utf8').replace('__GROWLORD_SESSION__', SESSION));
  res.writeHead(200, {
    'content-type': MIME[path.extname(file)] || 'application/octet-stream',
    'cache-control': rel === '/index.html' ? 'no-store' : 'no-cache',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  res.end(body);
}

// ------------------------------------------------------------- router

async function api(req, res, url) {
  const p = url.pathname;
  const m = p.match(/^\/api\/actions\/([0-9a-f-]{36})(?:\/(approve|reject|retry|brief))?$/);

  if (p === '/api/status' && req.method === 'GET') {
    const brain = await resolveBrain();
    return send(res, 200, { name: 'Growlord', brain, agent: config.agentBin, tts: await ttsAvailable() });
  }

  if (p === '/api/ask' && req.method === 'POST') {
    const { text } = await readJson(req);
    if (!text || typeof text !== 'string' || !text.trim()) return send(res, 400, { error: 'Say or type something first.' });
    if (text.length > 4000) return send(res, 400, { error: 'That is too long. Keep it under 4000 characters.' });
    if (BUILD_RE.test(text)) return send(res, 200, await startBuild(text));
    const a = await ask(text.trim());
    return send(res, 200, { kind: 'answer', ...a });
  }

  if (p === '/api/actions' && req.method === 'GET') return send(res, 200, gate.listActions().map(view));

  if (m) {
    const [, id, verb] = m;
    if (!verb && req.method === 'GET') {
      const a = gate.getAction(id);
      return a ? send(res, 200, view(a)) : send(res, 404, { error: 'not found' });
    }
    if (verb === 'approve' && req.method === 'POST') return send(res, 200, view(gate.approve(id)));
    if (verb === 'reject' && req.method === 'POST') return send(res, 200, view(gate.reject(id)));
    if (verb === 'retry' && req.method === 'POST') return send(res, 200, view(gate.retry(id)));
    if (verb === 'brief' && req.method === 'PUT') {
      const a = gate.getAction(id);
      if (!a) return send(res, 404, { error: 'not found' });
      const { text } = await readJson(req);
      if (typeof text !== 'string' || !text.trim()) return send(res, 400, { error: 'Brief cannot be empty' });
      gate.markEdited(id); // throws if running
      fs.writeFileSync(a.payload.briefPath, text.endsWith('\n') ? text : text + '\n');
      log('build', 'brief edited by Brandon', { id, briefFile: path.relative(ROOT, a.payload.briefPath) });
      return send(res, 200, view(a));
    }
  }

  if (p === '/api/events' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(': hello\n\n');
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(res);
    });
    return;
  }

  if (p === '/api/tts' && req.method === 'POST') {
    const { text } = await readJson(req);
    if (!text) return send(res, 400, { error: 'no text' });
    if (!(await ttsAvailable())) return send(res, 503, { error: 'no tts' });
    const { buf, type } = await synth(String(text));
    return send(res, 200, buf, { 'content-type': type });
  }

  if (p === '/api/doctor' && req.method === 'GET') {
    return send(res, 200, await runChecks({ includeAgent: url.searchParams.get('agent') === '1' }));
  }

  return send(res, 404, { error: 'not found' });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      if (!hostOk(req)) return send(res, 403, { error: 'Host not allowed' });
      if (url.pathname.startsWith('/api/')) {
        if (!originOk(req)) return send(res, 403, { error: 'Origin not allowed' });
        if (!sessionOk(req, url)) return send(res, 403, { error: 'Missing or bad session. Reload the page.' });
        return await api(req, res, url);
      }
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
      return serveStatic(req, res, url);
    } catch (e) {
      const status = e instanceof gate.GateError ? (e.code === 'not_found' ? 404 : 409) : e.status || 500;
      log('server', 'error', { path: url.pathname, status, error: e.message });
      if (!res.headersSent) send(res, status, { error: e.message, code: e.code });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer();
  server.listen(config.port, config.host, async () => {
    const brain = await resolveBrain();
    log('server', `Growlord listening on http://${config.host}:${config.port}`, { brain: brain.kind });
    console.log(`\n  Growlord is up:  http://localhost:${config.port}\n  Brain: ${brain.kind} (${brain.detail})\n`);
  });
}
