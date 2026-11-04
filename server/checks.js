// Shared checks for `npm run doctor` and the in-page Doctor panel.
import fs from 'node:fs';
import path from 'node:path';
import { config, hasXaiKey, ROOT } from './config.js';
import { detectGrokCli, resolveBrain, listXaiModels } from './brain.js';
import * as business from './business.js';
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

  // Business knowledge: business.md + business/*.md
  const k = business.load();
  if (!k.files.length) add('Business files', 'fail', 'No business.md and no business/*.md', 'Restore business.md in the project root');
  else {
    const titles = new Set(k.sections.map((x) => x.title));
    const missing = REQUIRED_SECTIONS.filter((x) => !titles.has(x));
    const names = k.files.map((f) => f.rel).join(', ');
    if (missing.length) add('Business files', 'fail', `Missing sections: ${missing.join(', ')} (in ${names})`, 'Add the missing ## sections');
    else {
      const notes = [];
      if (k.fillIns) notes.push(`${k.fillIns} [FILL IN] gap(s)`);
      if (k.chars > config.businessMaxChars) notes.push(`${k.chars} chars is over the ${config.businessMaxChars} limit; trim or split it so Grok sees all of it`);
      const empty = k.files.filter((f) => !f.sections.length).map((f) => f.rel);
      if (empty.length) notes.push(`no "## " sections in ${empty.join(', ')}, so answers can't cite them`);
      add('Business files', notes.length ? 'warn' : 'ok', `${k.files.length} file(s): ${names}; ${k.sections.length} sections, ${k.chars} chars${notes.length ? '; ' + notes.join('; ') : ''}`);
    }
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
    const key = await checkXaiKey();
    add('Grok brain', key.status, `${brain.detail}. ${key.detail}`);
    if (key.status === 'ok') {
      try {
        const models = await listXaiModels();
        if (!models.length) add('Grok model', 'warn', 'xAI returned no model list; could not confirm GROK_MODEL');
        else if (models.includes(config.grokModel)) add('Grok model', 'ok', `${config.grokModel} is available to your key`);
        else {
          const grok = models.filter((m) => /grok/i.test(m)).slice(0, 6);
          add('Grok model', 'fail', `GROK_MODEL=${config.grokModel} is not in your account's models`, `Set GROK_MODEL in .env to one of: ${(grok.length ? grok : models.slice(0, 6)).join(', ')}`);
        }
      } catch (e) {
        add('Grok model', 'warn', `Could not list models: ${e.message}`);
      }
    }
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
