// Coding-agent handoff (Claude Code CLI by default).
//
// Learned from the real CLI: `claude -p --output-format json` exits 0 even when the
// API call fails. The truth is in the JSON: `is_error`, `api_error_status`, `result`.
// So we never trust the exit code alone.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { config } from './config.js';
import { log, redact } from './log.js';

export const bus = new EventEmitter();
bus.setMaxListeners(50);

// Builds die with the server: never leave an orphaned agent running.
const running = new Set();
function killAll() {
  for (const c of running) {
    try { c.kill('SIGTERM'); } catch {}
  }
}
process.on('exit', killAll);
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    killAll();
    process.exit(130);
  });
}

export const REASONS = {
  ok: 'Ready',
  not_installed: 'Coding agent not installed',
  expired_login: 'Expired or missing login',
  limit_reached: 'Usage limit reached',
  timeout: 'Timed out',
  other: 'Other error',
};

const LOGIN_RE = /invalid api key|not logged in|please run \/login|run `?claude`? (and )?\/?login|\/login\b|authentication[_ ]?error|oauth token (has )?expired|token (has )?expired|login (has )?expired|session expired|unauthori[sz]ed|invalid x-api-key|could not resolve authentication/i;
const LIMIT_RE = /usage limit|limit reached|hit your (usage )?limit|rate[_ ]?limit|too many requests|quota|(5-hour|weekly|daily|monthly) limit|credit balance is too low|out of credits/i;

export function classifyFailure({ apiStatus, text = '', notFound = false, timedOut = false } = {}) {
  if (notFound) return 'not_installed';
  if (timedOut) return 'timeout';
  if (apiStatus === 401 || apiStatus === 403) return 'expired_login';
  if (apiStatus === 429) return 'limit_reached';
  if (LIMIT_RE.test(text)) return 'limit_reached';
  if (LOGIN_RE.test(text)) return 'expired_login';
  return 'other';
}

// The coding agent never needs Growlord's xAI key.
function childEnv() {
  const env = { ...process.env };
  delete env.XAI_API_KEY;
  delete env.GROK_API_KEY;
  return env;
}

function runOnce(args, { timeoutMs, cwd } = {}) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let child;
    try {
      child = spawn(config.agentBin, args, { cwd, env: childEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return resolve({ code: -1, out, err: String(e), notFound: e.code === 'ENOENT' });
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out, err: String(e), notFound: e.code === 'ENOENT' });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, out, err, timedOut: signal === 'SIGKILL' });
    });
  });
}

function lastJson(text) {
  const lines = text.trim().split('\n').reverse();
  for (const l of lines) {
    try {
      return JSON.parse(l);
    } catch {}
  }
  return null;
}

// Pre-flight: installed? logged in? under the usage limit? One tiny real call answers all three.
export async function preflight() {
  log('preflight', `checking ${config.agentBin}`);
  const ver = await runOnce(['--version'], { timeoutMs: 15_000 });
  if (ver.notFound) {
    const r = { ok: false, reason: 'not_installed', message: `"${config.agentBin}" was not found on PATH. Install Claude Code: npm install -g @anthropic-ai/claude-code` };
    log('preflight', 'FAIL', r);
    return r;
  }
  const version = (ver.out || ver.err).trim().split('\n')[0];
  const test = await runOnce(['-p', 'Reply with exactly: OK', '--output-format', 'json', '--max-turns', '1'], { timeoutMs: 90_000 });
  const j = lastJson(test.out);
  let r;
  if (test.timedOut) {
    r = { ok: false, reason: 'timeout', message: 'Test call did not answer within 90 seconds.' };
  } else if (j && j.type === 'result' && !j.is_error) {
    r = { ok: true, reason: 'ok', message: `${version}: logged in, under limit (test call answered "${String(j.result).slice(0, 20)}")`, version };
  } else {
    const text = `${j?.result || ''} ${test.err} ${j ? '' : test.out}`.trim();
    const reason = classifyFailure({ apiStatus: j?.api_error_status, text });
    r = { ok: false, reason, message: redact(text.slice(0, 400)) || `exit code ${test.code}`, version, apiStatus: j?.api_error_status ?? null };
  }
  log('preflight', r.ok ? 'OK' : 'FAIL', r);
  return r;
}

export function buildPromptText() {
  return 'Read BRIEF.md in this folder and build exactly what it describes, here in this folder. ' +
    'Do not send, post, email, publish, deploy, push to git, or contact anyone. ' +
    'When finished, write SUMMARY.md listing the files you made and how to check them.';
}

export function manualCommand(dir) {
  return `cd "${dir}" && ${config.agentBin} -p "${buildPromptText()}" --permission-mode acceptEdits --allowedTools "${config.buildAllowedTools}"`;
}

function describeTool(block) {
  const i = block.input || {};
  const arg = i.file_path || i.command || i.pattern || i.path || i.description || '';
  return `${block.name}${arg ? ': ' + String(arg).slice(0, 120) : ''}`;
}

function emit(action, type, text) {
  const ev = { id: action.id, type, text: redact(String(text)), at: new Date().toISOString() };
  action.progress.push(ev);
  if (action.progress.length > 500) action.progress.shift();
  bus.emit('progress', ev);
  log('build', `${type}: ${ev.text.slice(0, 200)}`, { id: action.id });
}

function fail(action, reason, message) {
  action.status = 'failed';
  action.failure = {
    reason,
    label: REASONS[reason] || REASONS.other,
    message: redact(String(message)).slice(0, 600),
    manualCommand: manualCommand(action.payload.buildDir),
    briefPath: action.payload.briefPath,
  };
  emit(action, 'failed', `${action.failure.label}: ${action.failure.message}`);
  bus.emit('action', action);
}

// Executor registered with the gate. Only ever called for approved actions.
export async function runBuild(action) {
  const { briefPath, buildDir } = action.payload;
  bus.emit('action', action);
  emit(action, 'step', 'Pre-flight check of the coding agent...');
  const pf = await preflight();
  action.preflight = pf;
  if (!pf.ok) return fail(action, pf.reason, pf.message);
  emit(action, 'step', `Pre-flight OK (${pf.version})`);

  fs.mkdirSync(buildDir, { recursive: true });
  fs.copyFileSync(briefPath, path.join(buildDir, 'BRIEF.md'));
  emit(action, 'step', `Handing off to ${config.agentBin} in ${path.relative(process.cwd(), buildDir) || buildDir}`);

  const args = [
    '-p', buildPromptText(),
    '--output-format', 'stream-json', '--verbose',
    '--max-turns', String(config.buildMaxTurns),
    '--permission-mode', 'acceptEdits',
    '--allowedTools', config.buildAllowedTools,
  ];

  await new Promise((resolve) => {
    let child;
    try {
      child = spawn(config.agentBin, args, { cwd: buildDir, env: childEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
      running.add(child);
    } catch (e) {
      fail(action, 'not_installed', String(e));
      return resolve();
    }
    let buf = '';
    let stderr = '';
    let result = null;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, config.buildTimeoutMs);

    child.stdout.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let m;
        try { m = JSON.parse(line); } catch { continue; }
        if (m.type === 'system' && m.subtype === 'init') emit(action, 'step', `Agent session started (${m.model || 'default model'})`);
        else if (m.type === 'assistant') {
          for (const b of m.message?.content || []) {
            if (b.type === 'text' && b.text.trim()) emit(action, 'say', b.text.trim().slice(0, 400));
            else if (b.type === 'tool_use') emit(action, 'tool', describeTool(b));
          }
        } else if (m.type === 'user') {
          for (const b of m.message?.content || []) {
            if (b.type === 'tool_result' && b.is_error) emit(action, 'warn', `tool error: ${String(typeof b.content === 'string' ? b.content : JSON.stringify(b.content)).slice(0, 200)}`);
          }
        } else if (m.type === 'result') result = m;
      }
    });
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      fail(action, e.code === 'ENOENT' ? 'not_installed' : 'other', String(e));
      resolve();
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      running.delete(child);
      if (signal === 'SIGKILL') fail(action, 'timeout', `Build ran longer than ${config.buildTimeoutMs / 60000} minutes and was stopped.`);
      else if (result && !result.is_error && result.subtype === 'success') {
        action.status = 'succeeded';
        action.result = { summary: String(result.result || '').slice(0, 2000), turns: result.num_turns, buildDir };
        emit(action, 'done', `Build finished in ${result.num_turns} turns. Output is in ${buildDir}`);
        bus.emit('action', action);
      } else {
        const text = `${result?.result || ''} ${result?.subtype && result.subtype !== 'success' ? result.subtype : ''} ${stderr}`.trim();
        fail(action, classifyFailure({ apiStatus: result?.api_error_status, text }), text || `agent exited with code ${code}`);
      }
      resolve();
    });
  });
}
