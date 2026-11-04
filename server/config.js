// Loads .env (no dependency) and exposes resolved settings.
// Keys stay on the server: nothing here is ever sent to the browser.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // Real environment wins over .env so tests and one-off overrides work.
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv(path.join(ROOT, '.env'));

const env = process.env;
const DATA = env.GROWLORD_DATA_DIR ? path.resolve(env.GROWLORD_DATA_DIR) : ROOT;

export const config = {
  host: '127.0.0.1', // localhost only, not configurable on purpose
  port: Number(env.PORT || 4747),
  businessFile: path.join(ROOT, 'business.md'),
  // GROWLORD_DATA_DIR moves briefs/, logs/, builds/ (tests use a temp folder)
  briefsDir: path.join(DATA, 'briefs'),
  logsDir: path.join(DATA, 'logs'),
  buildsDir: path.join(DATA, 'builds'),
  publicDir: path.join(ROOT, 'public'),

  // Brain: auto | xai | cli | mock
  brain: (env.GROWLORD_BRAIN || 'auto').toLowerCase(),
  xaiBaseUrl: env.XAI_BASE_URL || 'https://api.x.ai/v1',
  grokModel: env.GROK_MODEL || 'grok-4',
  grokBin: env.GROK_BIN || 'grok',

  // Coding agent
  agentBin: env.CODING_AGENT_BIN || 'claude',
  buildMaxTurns: Number(env.BUILD_MAX_TURNS || 40),
  // No open-ended shell by default: file tools plus a few harmless commands (no curl, no git push).
  buildAllowedTools: env.BUILD_ALLOWED_TOOLS || 'Read,Write,Edit,Glob,Grep,Bash(ls:*),Bash(mkdir:*),Bash(cat:*),Bash(wc:*)',
  buildTimeoutMs: Number(env.BUILD_TIMEOUT_MIN || 30) * 60_000,

  // TTS (OpenAI-compatible /v1/audio/speech, e.g. Kokoro)
  ttsUrl: (env.KOKORO_URL || 'http://127.0.0.1:8880').replace(/\/$/, ''),
  ttsVoice: env.KOKORO_VOICE || 'am_michael',
};

export function hasXaiKey() {
  return Boolean(env.XAI_API_KEY && env.XAI_API_KEY.trim());
}

// Values that must never appear in logs, responses, or child processes we don't trust.
export function secretValues() {
  return Object.entries(env)
    .filter(([k, v]) => /KEY|TOKEN|SECRET|PASSWORD|PASS\b/i.test(k) && v && v.length >= 6)
    .map(([, v]) => v);
}
