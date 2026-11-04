// Growlord's brain. Every answer is grounded in ./business.md.
//
// Providers (GROWLORD_BRAIN):
//   xai  - xAI chat completions API with XAI_API_KEY (recommended)
//   cli  - an installed Grok CLI; flags are detected from `grok --help`, never assumed
//   mock - offline keyword matcher over business.md, for tests and demos only
//   auto - xai if a key is set, else a detected CLI, else an error telling you what to fix
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { config, hasXaiKey } from './config.js';
import { log } from './log.js';

export const DISTRICTS = ['leads', 'ads', 'inbox', 'sales', 'workshop', 'none'];
export const NOT_IN_FILE = "That's not in the business file.";

export function readBusinessFile() {
  return fs.readFileSync(config.businessFile, 'utf8');
}

// ---------------------------------------------------------------- prompts

function answerPrompt(question, business) {
  return `You are Growlord, the voice of the command center for The AI Empire Project.

RULES
- Answer ONLY from the BUSINESS FILE below. No outside knowledge. Never guess, estimate, or invent numbers.
- If the answer is not in the business file, reply exactly: "${NOT_IN_FILE}" and set district to "none".
- The reply is spoken aloud: at most 3 short sentences, plain words, no markdown, no lists.
- You only advise. Never say you sent, posted, emailed, or published anything. Obey the NEVER-SEND RULES.
- district: "leads" = finding or tracking leads, workshops as lead sources, referrals, the CRM pipeline.
  "ads" = advertising, free vs paid channels, ad budget. "inbox" = email, tone, greetings, sign-off.
  "sales" = closers, commissions, close rates, sales documents. "workshop" = builds, tech, infrastructure.
  "none" = anything else.
- Output ONLY one JSON object, no code fences, no other text:
  {"reply": "...", "district": "leads|ads|inbox|sales|workshop|none"}

BUSINESS FILE
<<<
${business}
>>>

QUESTION
${question}`;
}

function researchPrompt(request, business) {
  return `You are Growlord, preparing a build brief for a headless coding agent.
Research the request and write a clear, buildable brief in Markdown.

Use these sections exactly:
# Brief: <short title>
## Goal
## Business context (only facts quoted from the business file; write "not in the business file" for gaps)
## What to build (concrete files, pages, features)
## Constraints
## Acceptance checks (how to tell it works)
## Open questions for Brandon

Hard constraints you must copy into "Constraints":
- Build locally in the current folder only.
- Do NOT send, post, email, publish, deploy, push to git, or contact anyone.
- Do not invent prices, commissions, or terms that are not in the business file.
- Anything marked DRAFT in the business file stays a draft.

Output only the Markdown brief.

BUSINESS FILE
<<<
${business}
>>>

REQUEST
${request}`;
}

// ---------------------------------------------------------------- JSON handling

export function parseAnswer(text) {
  if (typeof text !== 'string') throw new Error('empty response');
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in response');
  const obj = JSON.parse(s.slice(start, end + 1));
  if (typeof obj.reply !== 'string' || !obj.reply.trim()) throw new Error('missing "reply"');
  let district = String(obj.district || 'none').toLowerCase().trim();
  if (!DISTRICTS.includes(district)) district = 'none';
  return { reply: obj.reply.trim(), district };
}

// ---------------------------------------------------------------- xAI API

async function xaiChat(prompt, { json }) {
  const res = await fetch(`${config.xaiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: config.grokModel,
      temperature: json ? 0.1 : 0.4,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.text();
  if (!res.ok) {
    let msg = body.slice(0, 300);
    try { msg = JSON.parse(body).error?.message || JSON.parse(body).error || msg; } catch {}
    const err = new Error(`xAI API ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  const data = JSON.parse(body);
  return data.choices?.[0]?.message?.content ?? '';
}

// ---------------------------------------------------------------- Grok CLI

let cliCache = null;

function run(bin, args, { timeoutMs = 10_000, env } = {}) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let child;
    try {
      child = spawn(bin, args, { env: env || process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return resolve({ code: -1, out, err: String(e), notFound: true });
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

// Reads `grok --help` and works out how this particular CLI takes a prompt, a model, and files.
export async function detectGrokCli({ refresh = false } = {}) {
  if (cliCache && !refresh) return cliCache;
  const help = await run(config.grokBin, ['--help'], { timeoutMs: 15_000 });
  if (help.notFound) {
    cliCache = { installed: false, bin: config.grokBin };
    return cliCache;
  }
  const text = `${help.out}\n${help.err}`;
  const ver = await run(config.grokBin, ['--version'], { timeoutMs: 10_000 });
  const flag = (re) => {
    const m = text.match(re);
    return m ? m[1] : null;
  };
  cliCache = {
    installed: true,
    bin: config.grokBin,
    version: (ver.out || ver.err).trim().split('\n')[0] || 'unknown',
    // e.g. "-p, --prompt <prompt>"  or "--print"
    promptFlag:
      flag(/(?:^|\s)(-p)\s*,\s*--prompt\b/m) ||
      flag(/(?:^|\s)(--prompt)\b/m) ||
      flag(/(?:^|\s)(-p)\s*,\s*--print\b/m) ||
      flag(/(?:^|\s)(--print)\b/m),
    modelFlag: flag(/(?:^|\s)(-m)\s*,\s*--model\b/m) || flag(/(?:^|\s)(--model)\b/m),
    fileFlag: flag(/(?:^|\s)(--file)\b/m) || flag(/(?:^|\s)(--attach)\b/m),
    helpExcerpt: text.split('\n').filter((l) => /^\s*-/.test(l)).slice(0, 25).join('\n'),
  };
  return cliCache;
}

async function cliChat(prompt) {
  const cli = await detectGrokCli();
  if (!cli.installed) throw new Error(`Grok CLI "${config.grokBin}" is not installed.`);
  if (!cli.promptFlag) {
    throw new Error('Grok CLI found, but no headless prompt flag (--prompt / -p) was detected in its --help.');
  }
  // business.md is embedded in the prompt text, which works with any CLI that takes a prompt.
  const args = [cli.promptFlag, prompt];
  if (cli.modelFlag && process.env.GROK_MODEL) args.push(cli.modelFlag, config.grokModel);
  const env = { ...process.env };
  if (env.XAI_API_KEY && !env.GROK_API_KEY) env.GROK_API_KEY = env.XAI_API_KEY;
  const r = await run(cli.bin, args, { timeoutMs: 180_000, env });
  if (r.timedOut) throw new Error('Grok CLI timed out after 3 minutes.');
  if (r.code !== 0) throw new Error(`Grok CLI exited ${r.code}: ${(r.err || r.out).slice(0, 300)}`);
  return r.out;
}

// ---------------------------------------------------------------- mock (tests only)

const STOP = new Set('a an and are about any be by can do does for from get how i in is it me my of on or our should the to us we what when where which who why will with you your'.split(' '));
const SECTION_DISTRICT = { leads: 'leads', ads: 'ads', inbox: 'inbox', sales: 'sales', infrastructure: 'workshop' };

function sections(md) {
  const out = [];
  let cur = null;
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+(.*)/);
    if (h) {
      cur = { title: h[1].trim(), body: [] };
      out.push(cur);
    } else if (cur && line.trim()) cur.body.push(line.replace(/^[-\d.]+\s*/, '').trim());
  }
  return out;
}

// Extra words per section so the offline mock routes like a person would. Tests only.
const SYNONYMS = {
  leads: 'lead prospect prospects referral referrals crm pipeline workshop workshops find',
  ads: 'ad advertise advertising marketing budget paid facebook tiktok google youtube promote',
  inbox: 'email emails mail gmail greet greeting greetings tone reply sign signature write',
  sales: 'closer closers commission commissions sell selling close rate rates hire',
  products: 'price prices pricing cost costs tier tiers plan plans product products',
  infrastructure: 'build tech hosting server repo tts model models infrastructure',
};
const words = (s) => (s.toLowerCase().match(/[a-z0-9$%]+/g) || []).filter((w) => !STOP.has(w));
const stem = (w) => w.replace(/(ing|es|s)$/, '');

function mockAnswer(question, business) {
  const q = words(question).map(stem);
  let best = null;
  for (const sec of sections(business)) {
    const head = words(sec.title).map(stem);
    const extra = SYNONYMS[sec.title.toLowerCase().split(/\s+/)[0]] || '';
    const body = new Set(words(sec.body.join(' ') + ' ' + extra).map(stem));
    let score = 0;
    for (const w of q) {
      if (head.includes(w)) score += 5;
      if (body.has(w)) score += extra && extra.split(' ').map(stem).includes(w) ? 3 : 1;
    }
    if (!best || score > best.score) best = { sec, score, headHit: q.some((w) => head.includes(w)) };
  }
  if (!best || best.score < 3) {
    return { reply: NOT_IN_FILE, district: 'none' };
  }
  const key = best.sec.title.toLowerCase().split(/\s+/)[0];
  // speak the lines of that section that best match the question (in file order)
  const scored = best.sec.body.map((line, i) => {
    const lw = new Set(words(line).map(stem));
    return { i, line, score: q.filter((w) => lw.has(w)).length };
  });
  const top = !best.headHit && scored.some((x) => x.score > 0)
    ? scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, 2).sort((a, b) => a.i - b.i)
    : scored.slice(0, 2);
  const reply = top.map((x) => x.line).join(' ').replace(/\s+/g, ' ');
  return { reply, district: SECTION_DISTRICT[key] || 'none' };
}

function mockBrief(request, business) {
  const title = request.replace(/^build\s+/i, '').trim();
  return `# Brief: ${title}

## Goal
${title}

## Business context
- Owner and company: ${business.match(/Owner: ([^.]+)\./)?.[1] || 'not in the business file'}, Mind at Ease Solutions LLC.
- Audience: small contractors, tradespeople, artisans, and small service businesses.

## What to build
- A single self-contained file \`index.html\` in this folder that satisfies the goal above.

## Constraints
- Build locally in the current folder only.
- Do NOT send, post, email, publish, deploy, push to git, or contact anyone.
- Do not invent prices, commissions, or terms that are not in the business file.
- Anything marked DRAFT in the business file stays a draft.

## Acceptance checks
- \`index.html\` exists and opens in a browser without errors.

## Open questions for Brandon
- None (mock brief generated offline for testing).
`;
}

// ---------------------------------------------------------------- public API

export async function resolveBrain() {
  const want = config.brain;
  if (want === 'mock') return { kind: 'mock', detail: 'offline keyword matcher (tests only)' };
  if (want === 'xai') return hasXaiKey()
    ? { kind: 'xai', detail: `xAI API, model ${config.grokModel}` }
    : { kind: 'none', detail: 'GROWLORD_BRAIN=xai but XAI_API_KEY is empty in .env' };
  const cli = await detectGrokCli();
  if (want === 'cli') return cli.installed && cli.promptFlag
    ? { kind: 'cli', detail: `${cli.bin} ${cli.version} (prompt flag ${cli.promptFlag})` }
    : { kind: 'none', detail: cli.installed ? 'Grok CLI has no detectable prompt flag' : `Grok CLI "${cli.bin}" not installed` };
  // auto
  if (hasXaiKey()) return { kind: 'xai', detail: `xAI API, model ${config.grokModel}` };
  if (cli.installed && cli.promptFlag) return { kind: 'cli', detail: `${cli.bin} ${cli.version} (prompt flag ${cli.promptFlag})` };
  return { kind: 'none', detail: 'No XAI_API_KEY in .env and no usable Grok CLI found' };
}

async function chat(kind, prompt, opts) {
  if (kind === 'xai') return xaiChat(prompt, opts);
  if (kind === 'cli') return cliChat(prompt);
  throw new Error('No brain available. Run `npm run doctor`.');
}

export async function ask(question) {
  const business = readBusinessFile();
  const brain = await resolveBrain();
  log('ask', 'question', { brain: brain.kind, question });
  if (brain.kind === 'mock') {
    const a = mockAnswer(question, business);
    log('ask', 'answer', a);
    return { ...a, brain: 'mock' };
  }
  if (brain.kind === 'none') throw new Error(`No brain available: ${brain.detail}. Run \`npm run doctor\`.`);

  const prompt = answerPrompt(question, business);
  let raw = await chat(brain.kind, prompt, { json: true });
  let answer;
  try {
    answer = parseAnswer(raw);
  } catch (e) {
    log('ask', 'bad JSON from Grok, retrying once', { error: e.message, raw: raw.slice(0, 300) });
    raw = await chat(brain.kind, `${prompt}\n\nYour previous output was not valid JSON (${e.message}). Output ONLY the JSON object.`, { json: true });
    try {
      answer = parseAnswer(raw);
    } catch (e2) {
      log('ask', 'bad JSON again; refusing to guess', { error: e2.message });
      return { reply: "I couldn't get a clean answer from Grok, so I won't guess. Try asking again.", district: 'none', brain: brain.kind };
    }
  }
  log('ask', 'answer', answer);
  return { ...answer, brain: brain.kind };
}

export async function research(request) {
  const business = readBusinessFile();
  const brain = await resolveBrain();
  log('build', 'researching brief', { brain: brain.kind, request });
  if (brain.kind === 'mock') return mockBrief(request, business);
  if (brain.kind === 'none') throw new Error(`No brain available: ${brain.detail}. Run \`npm run doctor\`.`);
  const md = (await chat(brain.kind, researchPrompt(request, business), { json: false }))
    .trim()
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/```\s*$/, '');
  if (!md) throw new Error('Grok returned an empty brief.');
  return md + '\n';
}
