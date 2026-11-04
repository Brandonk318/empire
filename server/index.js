// Growlord local server. Binds to 127.0.0.1 only.
//
// Protections:
//  - Host header must be localhost/127.0.0.1 (blocks DNS-rebinding attacks).
//  - Every /api call needs the per-run session token that is injected into the page
//    this server serves, and a localhost Origin when a browser sends one.
//  - Outbound actions and business-file edits go through gate.js; no route runs one unapproved.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { config, ROOT } from './config.js';
import { log } from './log.js';
import { ask, research, resolveBrain, placeFact, NOT_IN_FILE } from './brain.js';
import { preflight, runBuild, bus, REASONS, manualCommand } from './agent.js';
import * as gate from './gate.js';
import * as business from './business.js';
import { ttsAvailable, synth } from './tts.js';
import { runChecks } from './checks.js';

const SESSION = crypto.randomBytes(24).toString('hex');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

const relPath = (p) => {
  const r = path.relative(ROOT, p);
  return r.startsWith('..') ? p : r.split(path.sep).join('/');
};

// ------------------------------------------------------------- executors

gate.registerExecutor('build', runBuild);

// Business-file edit: back up, insert, done. Only reachable through approve().
gate.registerExecutor('business_update', async (a) => {
  const r = business.applyUpdate(a.payload);
  a.status = 'succeeded';
  a.result = { summary: `Added to "${r.section}" in ${r.file}.${r.backup ? ` Previous version saved to ${r.backup}.` : ''}`, ...r };
  bus.emit('action', a);
});
// email / post / publish are deliberately not registered in this version:
// even after approval, the gate answers "not available".

// ------------------------------------------------------------- saved state

const STATE_FILE = path.join(config.stateDir, 'actions.json');
let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}
function saveNow() {
  clearTimeout(saveTimer);
  try {
    fs.mkdirSync(config.stateDir, { recursive: true });
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(gate.snapshot(), null, 1));
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) {
    log('state', 'could not save Workshop state', { error: e.message });
  }
}
function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return 0;
    const n = gate.restore(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
    log('state', `restored ${n} Workshop item(s)`);
    saveNow();
    return n;
  } catch (e) {
    log('state', 'could not read saved Workshop state; starting empty', { error: e.message });
    return 0;
  }
}
gate.onChange(saveSoon);
bus.on('progress', saveSoon);
process.on('exit', saveNow);

// ------------------------------------------------------------- conversation memory

let history = []; // [{q, a}] for follow-up questions; cleared by "New topic"
function remember(q, a) {
  history.push({ q, a });
  history = history.slice(-config.historyTurns);
}

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

// Short, readable slug cut at a word boundary (no "readin" fragments).
export function slugify(s, max = 48) {
  const words = s.toLowerCase().replace(/^\s*(please\s+)?build\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let out = '';
  for (const w of words) {
    const next = out ? `${out}-${w}` : w;
    if (next.length > max) break;
    out = next;
  }
  return out || words[0]?.slice(0, max) || 'build';
}

function uniquePath(dir, base, ext) {
  let p = path.join(dir, `${base}${ext}`);
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${base}-${i}${ext}`);
  return p;
}

function view(a) {
  if (!a) return null;
  const common = {
    id: a.id,
    kind: a.kind,
    status: a.status,
    rev: a.rev || 0,
    approved: Boolean(a.approvedHash),
    failure: a.failure,
    result: a.result || null,
    progress: (a.progress || []).slice(-200),
    createdAt: a.createdAt,
  };
  if (a.kind === 'business_update') {
    return { ...common, request: `Add to business file: ${a.payload.text}`, update: { ...a.payload } };
  }
  const brief = fs.existsSync(a.payload.briefPath) ? fs.readFileSync(a.payload.briefPath, 'utf8') : '(brief file missing)';
  const failure = a.failure && !a.failure.manualCommand ? { ...a.failure, manualCommand: manualCommand(a.payload.buildDir) } : a.failure;
  return {
    ...common,
    failure,
    request: a.payload.request,
    briefFile: relPath(a.payload.briefPath),
    buildDir: relPath(a.payload.buildDir),
    brief,
    preflight: a.preflight || null,
  };
}

// ------------------------------------------------------------- build flow

const LEAD = /^\s*(?:(?:hey|ok|okay)\s+growlord[,\s]+)?(?:please\s+)?/i;
const BUILD_RE = new RegExp(LEAD.source + /build\b/.source, 'i');
const REMEMBER_RE = new RegExp(LEAD.source + /(?:remember(?:\s+that)?|add\s+(?:this\s+)?to\s+(?:the\s+)?business\s+file|note\s+that|note)\s*[:,-]?\s+/.source, 'i');

async function startBuild(text) {
  const request = text.replace(LEAD, '').trim();
  log('build', 'step 1/3: research brief', { request });
  const md = await research(request);
  fs.mkdirSync(config.briefsDir, { recursive: true });
  const briefPath = uniquePath(config.briefsDir, `${today()}-${slugify(request)}`, '.md');
  fs.writeFileSync(briefPath, md);
  const buildDir = path.join(config.buildsDir, path.basename(briefPath, '.md'));
  log('build', 'brief saved', { briefPath: relPath(briefPath) });

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

function proposeUpdate({ file, section, text }) {
  const clean = String(text || '').trim();
  if (!clean) throw Object.assign(new Error('Write the fact to add first.'), { status: 400 });
  if (clean.length > 2000) throw Object.assign(new Error('Keep additions under 2000 characters.'), { status: 400 });
  const target = business.resolveWritable(file); // throws on anything outside the business files
  const payload = { file: relPath(target), section: String(section || 'Notes').trim() || 'Notes', text: clean };
  const action = gate.createAction('business_update', payload);
  bus.emit('action', action);
  return action;
}

async function startRemember(text) {
  const fact = text.replace(REMEMBER_RE, '').trim();
  if (!fact) return { kind: 'answer', reply: 'Tell me what to remember, for example: remember that workshops start in March.', district: 'none', source: null };
  const place = await placeFact(fact);
  const action = proposeUpdate(place);
  return {
    kind: 'business_update',
    reply: `I drafted that for the ${action.payload.section} section. It's in the Workshop for your approval before I change the business file.`,
    district: 'workshop',
    action: view(action),
  };
}

// ------------------------------------------------------------- SSE

const clients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
bus.on('progress', (ev) => broadcast('progress', ev));
bus.on('action', (a) => {
  gate.touch(a);
  broadcast('action', view(a));
});

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

function businessSummary() {
  const k = business.load();
  return {
    files: k.files.map((f) => ({ file: f.rel, sections: f.sections.map((s) => s.title) })),
    chars: k.chars,
    fillIns: k.fillIns,
  };
}

async function api(req, res, url) {
  const p = url.pathname;
  const m = p.match(/^\/api\/actions\/([0-9a-f-]{36})(?:\/(approve|reject|retry|brief|payload))?$/);

  if (p === '/api/status' && req.method === 'GET') {
    const brain = await resolveBrain();
    return send(res, 200, { name: 'Growlord', brain, agent: config.agentBin, tts: await ttsAvailable(), history: history.length });
  }

  if (p === '/api/ask' && req.method === 'POST') {
    const { text } = await readJson(req);
    if (!text || typeof text !== 'string' || !text.trim()) return send(res, 400, { error: 'Say or type something first.' });
    if (text.length > 4000) return send(res, 400, { error: 'That is too long. Keep it under 4000 characters.' });
    if (BUILD_RE.test(text)) return send(res, 200, await startBuild(text));
    if (REMEMBER_RE.test(text)) return send(res, 200, await startRemember(text));
    const q = text.trim();
    const a = await ask(q, history);
    // Don't let "not in the file" answers steer follow-ups.
    if (a.reply !== NOT_IN_FILE) remember(q, a.reply);
    return send(res, 200, { kind: 'answer', ...a });
  }

  if (p === '/api/conversation/reset' && req.method === 'POST') {
    history = [];
    log('ask', 'conversation reset');
    return send(res, 200, { ok: true });
  }

  if (p === '/api/business' && req.method === 'GET') return send(res, 200, businessSummary());

  if (p === '/api/business/proposals' && req.method === 'POST') {
    const body = await readJson(req);
    return send(res, 200, view(proposeUpdate(body)));
  }

  if (p === '/api/actions' && req.method === 'GET') return send(res, 200, gate.listActions().map(view));

  if (m) {
    const [, id, verb] = m;
    const a = gate.getAction(id);
    if (!a) return send(res, 404, { error: 'not found' });
    if (!verb && req.method === 'GET') return send(res, 200, view(a));
    if (verb === 'approve' && req.method === 'POST') return send(res, 200, view(gate.approve(id)));
    if (verb === 'reject' && req.method === 'POST') return send(res, 200, view(gate.reject(id)));
    if (verb === 'retry' && req.method === 'POST') return send(res, 200, view(gate.retry(id)));
    if (verb === 'brief' && req.method === 'PUT') {
      if (a.kind !== 'build') return send(res, 400, { error: 'Only builds have a brief' });
      const { text } = await readJson(req);
      if (typeof text !== 'string' || !text.trim()) return send(res, 400, { error: 'Brief cannot be empty' });
      gate.markEdited(id); // throws if running
      fs.writeFileSync(a.payload.briefPath, text.endsWith('\n') ? text : text + '\n');
      log('build', 'brief edited by Brandon', { id, briefFile: relPath(a.payload.briefPath) });
      return send(res, 200, view(a));
    }
    if (verb === 'payload' && req.method === 'PUT') {
      if (a.kind !== 'business_update') return send(res, 400, { error: 'Only business updates can be edited this way' });
      const { file, section, text } = await readJson(req);
      const patch = {};
      if (file !== undefined) patch.file = relPath(business.resolveWritable(file));
      if (section !== undefined) patch.section = String(section).trim() || 'Notes';
      if (text !== undefined) {
        if (!String(text).trim()) return send(res, 400, { error: 'Text cannot be empty' });
        patch.text = String(text).trim();
      }
      gate.editPayload(id, patch);
      bus.emit('action', a);
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
    try {
      const { buf, type } = await synth(String(text));
      return send(res, 200, buf, { 'content-type': type });
    } catch (e) {
      log('tts', 'failed; browser voice will be used', { error: e.message });
      return send(res, 503, { error: 'tts failed' });
    }
  }

  if (p === '/api/doctor' && req.method === 'GET') {
    return send(res, 200, await runChecks({ includeAgent: url.searchParams.get('agent') === '1' }));
  }

  return send(res, 404, { error: 'not found' });
}

export function createServer() {
  loadState();
  business.watch((info) => {
    log('business', 'business files changed; next answer uses the new version', info);
    broadcast('business', info);
  });
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      if (!hostOk(req)) return send(res, 403, { error: 'Host not allowed' });
      if (url.pathname.startsWith('/api/')) {
        if (!originOk(req)) return send(res, 403, { error: 'Origin not allowed' });
        if (!sessionOk(req, url)) return send(res, 403, { error: 'Growlord restarted. Reload the page.', code: 'stale_session' });
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
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') console.error(`\n  Port ${config.port} is busy. Is Growlord already running? Or set PORT in .env.\n`);
    else console.error(e);
    process.exit(1);
  });
  server.listen(config.port, config.host, async () => {
    const brain = await resolveBrain();
    log('server', `Growlord listening on http://${config.host}:${config.port}`, { brain: brain.kind });
    console.log(`\n  Growlord is up:  http://localhost:${config.port}\n  Brain: ${brain.kind} (${brain.detail})\n`);
  });
}
