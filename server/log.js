// Append-only chain log at ./logs/chain.log. Every line is redacted first.
import fs from 'node:fs';
import path from 'node:path';
import { config, secretValues } from './config.js';

const LOG_FILE = path.join(config.logsDir, 'chain.log');

const KEY_PATTERNS = [
  /\b(sk-ant-[A-Za-z0-9_-]{6,})/g,
  /\b(sk-[A-Za-z0-9_-]{16,})/g,
  /\b(xai-[A-Za-z0-9_-]{8,})/g,
  /(Bearer\s+)[A-Za-z0-9._-]{8,}/gi,
];

export function redact(input) {
  let s = typeof input === 'string' ? input : JSON.stringify(input);
  if (s === undefined) return '';
  for (const v of secretValues()) s = s.split(v).join('[REDACTED]');
  for (const re of KEY_PATTERNS) {
    s = s.replace(re, (m, p1) => (p1 && /Bearer/i.test(p1) ? `${p1}[REDACTED]` : '[REDACTED]'));
  }
  return s;
}

export function log(step, message, data) {
  fs.mkdirSync(config.logsDir, { recursive: true });
  let line = `${new Date().toISOString()} [${step}] ${message}`;
  if (data !== undefined) line += ` ${JSON.stringify(data)}`;
  line = redact(line).replace(/\r?\n/g, '\\n');
  fs.appendFileSync(LOG_FILE, line + '\n');
  if (process.env.GROWLORD_QUIET !== '1') console.log(line);
}

export const LOG_PATH = LOG_FILE;
