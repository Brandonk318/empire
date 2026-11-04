// Shared checks for `npm run doctor` and the in-page Doctor panel.
import fs from 'node:fs';
import path from 'node:path';
import { config, hasXaiKey, ROOT } from './config.js';
import { detectGrokCli, resolveBrain } from './brain.js';
import { preflight } from './agent.js';
import { ttsAvailable } from './tts.js';

const REQUIRED_SECTIONS = ['Company', 'Products', 'Leads', 'Ads', 'Inbox', 'Sales', 'NEVER-SEND RULES'];

async function checkXaiKey() {
  try {
    const res = await fetch(`${config.xaiBaseUrl}/models`, {
      headers: { authorization: `Bearer ${process.env.XAI_API_KEY}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { status: 'ok', detail: `XAI_API_KEY accepted by ${config.xaiBaseUrl}` };
    if (res.status === 401 || res.status === 403) return { status: 'fail', detail: `XAI_API_KEY rejected (${res.status}). Make a new key at console.x.ai and put it in .env.` };
    if (res.status === 429) return { status: 'fail', detail: 'xAI says you hit a rate or usage limit (429).' };
    return { status: 'warn', detail: `xAI answered ${res.status}` };
  } catch (e) {
    return { status: 'fail', detail: `Could not reach xAI: ${e.message}` };
  }
}

export async function runChecks({ includeAgent = true } = {}) {
  const results = [];
  const add = (name, status, detail, fix) => results.push({ name, status, detail, fix });

  // .env
  if (fs.existsSync(path.join(ROOT, '.env'))) add('.env file', 'ok', '.env found (values are never printed)');
  else add('.env file', 'warn', 'No .env file', 'cp .env.example .env  and fill in XAI_API_KEY');

  // business.md
  if (!fs.existsSync(config.businessFile)) add('business.md', 'fail', 'Missing', 'Restore business.md in the project root');
  else {
    const md = fs.readFileSync(config.businessFile, 'utf8');
    const missing = REQUIRED_SECTIONS.filter((s) => !new RegExp(`^##\\s+${s}\\s*$`, 'm').test(md));
    const fills = (md.match(/\[FILL IN\]/g) || []).length;
    if (missing.length) add('business.md', 'fail', `Missing sections: ${missing.join(', ')}`, 'Add the missing ## sections');
    else add('business.md', fills ? 'warn' : 'ok', `${md.length} chars, all core sections present${fills ? `, ${fills} [FILL IN] gaps` : ''}`);
  }

  // Grok CLI (detected, never assumed)
  const cli = await detectGrokCli({ refresh: true });
  if (cli.installed) {
    add('Grok CLI', cli.promptFlag ? 'ok' : 'warn',
      `${cli.bin} ${cli.version}; prompt flag: ${cli.promptFlag || 'none found'}; model flag: ${cli.modelFlag || 'none'}; file flag: ${cli.fileFlag || 'none (business.md is embedded in the prompt)'}`);
  } else {
    add('Grok CLI', hasXaiKey() ? 'ok' : 'warn', `"${cli.bin}" not installed${hasXaiKey() ? ' (not needed: using the xAI API)' : ''}`);
  }

  // Brain actually in use
  const brain = await resolveBrain();
  if (brain.kind === 'none') add('Grok brain', 'fail', brain.detail, 'Put XAI_API_KEY in .env (or install a Grok CLI)');
  else if (brain.kind === 'xai') {
    const k = await checkXaiKey();
    add('Grok brain', k.status, `${brain.detail}. ${k.detail}`);
  } else add('Grok brain', brain.kind === 'mock' ? 'warn' : 'ok', brain.detail, brain.kind === 'mock' ? 'Set GROWLORD_BRAIN=auto for real answers' : undefined);

  // Coding agent
  if (includeAgent) {
    const pf = await preflight();
    const fixes = {
      not_installed: 'npm install -g @anthropic-ai/claude-code',
      expired_login: `Run \`${config.agentBin}\` in a terminal and type /login`,
      limit_reached: 'Wait for your usage window to reset, or check your plan',
    };
    add('Coding agent', pf.ok ? 'ok' : 'fail', pf.ok ? pf.message : `${pf.reason}: ${pf.message}`, fixes[pf.reason]);
  } else add('Coding agent', 'warn', 'Skipped (use the full doctor to make a test call)');

  // TTS
  if (await ttsAvailable()) add('Voice (TTS)', 'ok', `Kokoro-compatible server at ${config.ttsUrl}`);
  else add('Voice (TTS)', 'warn', `No TTS server at ${config.ttsUrl}; the browser voice will be used`, 'Optional: see README "Kokoro voice"');

  // Mic can only be checked in the browser.
  add('Microphone', 'warn', 'Checked in the browser: open Growlord and press Doctor', 'Chrome or Edge recommended for push-to-talk');

  add('Network bind', 'ok', `Server binds to ${config.host}:${config.port} only`);
  return results;
}
