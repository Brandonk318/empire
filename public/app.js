// Growlord UI: ask, voice in/out, Workshop approvals, Doctor.
import { createWorld } from './world.js';

const SESSION = document.querySelector('meta[name="growlord-session"]').content;
const params = new URLSearchParams(location.search);
const lite = params.has('lite') || (params.get('quality') !== 'high' && (matchMedia('(pointer: coarse)').matches || innerWidth < 800));

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const world = createWorld($('#scene'), { lite });
window.growlord = world;
window.__cam = () => world._cam();
function fitPanel() {
  const panel = document.getElementById('panel');
  const wide = innerWidth > 760;
  world.setInsetRight(wide ? panel.offsetWidth + 16 : 0);
}
addEventListener('resize', fitPanel);
fitPanel(); // handy for debugging and automated checks

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'content-type': 'application/json', 'x-growlord-session': SESSION, ...(opts.headers || {}) },
  });
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('json') ? await res.json() : await res.blob();
  if (!res.ok) throw Object.assign(new Error(body?.error || `HTTP ${res.status}`), { status: res.status, body });
  return body;
}

let status = { tts: false };
api('/api/status').then((s) => (status = s)).catch(() => {});

// ------------------------------------------------------------ nav + tabs
function setNav(id) {
  document.querySelectorAll('[data-go]').forEach((b) => b.classList.toggle('active', b.dataset.go === id));
}
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => world.flyTo(b.dataset.go)));
world.on('district', (id) => {
  setNav(id);
  if (id === 'workshop') showTab('workshop');
});
function showTab(name) {
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${name}`));
}
document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ------------------------------------------------------------ transcript
const COLORS = { leads: '#f6b94c', ads: '#ff5fa2', inbox: '#4fb3ff', sales: '#4fdc8a', workshop: '#ff8a3d' };
function say(who, text, district) {
  const el = document.createElement('div');
  el.className = `msg ${who}`;
  el.innerHTML = esc(text) + (district && district !== 'none' ? `<span class="tag" style="background:${COLORS[district]}">${esc(district)}</span>` : '');
  $('#transcript').append(el);
  el.scrollIntoView({ block: 'end', behavior: 'smooth' });
}
const setStatus = (t) => ($('#status').textContent = t || '');

// ------------------------------------------------------------ voice out (TTS + analyser)
let audioCtx = null;
let analyser = null;
let currentSource = null;
let fakeLevel = 0;
let speakingFallback = false;
let lastBoundary = 0;
const timeData = new Uint8Array(1024);

function unlockAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    analyser.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
addEventListener('pointerdown', unlockAudio, { once: false });
addEventListener('keydown', unlockAudio, { once: false });

function stopSpeaking() {
  try { currentSource?.stop(); } catch {}
  currentSource = null;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  speakingFallback = false;
}

async function speak(text) {
  stopSpeaking();
  if (status.tts) {
    try {
      unlockAudio();
      const blob = await api('/api/tts', { method: 'POST', body: JSON.stringify({ text }) });
      const buf = await audioCtx.decodeAudioData(await blob.arrayBuffer());
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(analyser);
      src.start();
      currentSource = src;
      await new Promise((r) => (src.onended = r));
      if (currentSource === src) currentSource = null;
      return;
    } catch (e) {
      console.warn('TTS failed, using browser voice', e);
    }
  }
  if (!('speechSynthesis' in window)) return;
  await new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    u.voice = voices.find((v) => /en[-_]US/i.test(v.lang) && /male|david|guy|daniel|google us/i.test(v.name)) || voices.find((v) => /^en/i.test(v.lang)) || null;
    u.rate = 1;
    u.pitch = 0.85;
    // Faked reaction: every word boundary kicks the level up; it decays each frame.
    u.onboundary = () => {
      fakeLevel = 0.75 + Math.random() * 0.25;
      lastBoundary = performance.now();
    };
    u.onstart = () => (speakingFallback = true);
    u.onend = u.onerror = () => {
      speakingFallback = false;
      resolve();
    };
    speechSynthesis.speak(u);
  });
}

world.on('frame', (t, dt) => {
  let level = 0;
  if (currentSource && analyser) {
    analyser.getByteTimeDomainData(timeData);
    let sum = 0;
    for (let i = 0; i < timeData.length; i++) {
      const v = (timeData[i] - 128) / 128;
      sum += v * v;
    }
    level = Math.min(1, Math.sqrt(sum / timeData.length) * 4.5);
  } else if (speakingFallback) {
    fakeLevel = Math.max(0, fakeLevel - dt * 3.2);
    // Some voices never fire boundary events: keep the mouth moving anyway.
    const noBoundaries = performance.now() - lastBoundary > 700;
    level = noBoundaries ? 0.35 + 0.3 * Math.abs(Math.sin(t * 11)) * Math.abs(Math.sin(t * 3.7)) : fakeLevel;
  }
  world.growlord.setLevel(level);
});

// ------------------------------------------------------------ ask
let busy = false;
async function ask(text) {
  text = text.trim();
  if (!text || busy) return;
  busy = true;
  say('you', text);
  setStatus(/^\s*(please\s+)?build\b/i.test(text) ? 'Researching a brief with Grok...' : 'Thinking...');
  world.growlord.setThinking(true);
  try {
    const r = await api('/api/ask', { method: 'POST', body: JSON.stringify({ text }) });
    world.growlord.setThinking(false);
    say('growlord', r.reply, r.district);
    if (r.district && r.district !== 'none') world.flyTo(r.district);
    if (r.kind === 'build') {
      upsertAction(r.action);
      world.growlord.flare();
      showTab('workshop');
    }
    setStatus('');
    await speak(r.reply);
  } catch (e) {
    world.growlord.setThinking(false);
    say('error', e.message);
    setStatus('');
  } finally {
    busy = false;
  }
}

$('#askForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#askInput').value;
  $('#askInput').value = '';
  ask(v);
});

// ------------------------------------------------------------ voice in (push-to-talk)
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const micBtn = $('#mic');
let rec = null;
let heard = '';
if (!SR) {
  micBtn.disabled = true;
  micBtn.title = 'Speech recognition is not supported in this browser. Type instead (Chrome or Edge recommended).';
} else {
  const startRec = () => {
    if (rec) return;
    unlockAudio();
    stopSpeaking();
    heard = '';
    rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (ev) => {
      heard = Array.from(ev.results).map((r) => r[0].transcript).join(' ');
      $('#askInput').value = heard;
    };
    rec.onerror = (ev) => {
      setStatus(ev.error === 'not-allowed' ? 'Mic blocked. Allow the microphone, or type.' : `Mic: ${ev.error}`);
    };
    rec.onend = () => {
      micBtn.classList.remove('live');
      const text = heard.trim();
      rec = null;
      if (text) {
        $('#askInput').value = '';
        ask(text);
      } else setStatus('');
    };
    rec.start();
    micBtn.classList.add('live');
    setStatus('Listening... release to send');
  };
  const stopRec = () => rec?.stop();
  micBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    micBtn.setPointerCapture?.(e.pointerId);
    startRec();
  });
  micBtn.addEventListener('pointerup', stopRec);
  micBtn.addEventListener('pointercancel', stopRec);
  addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      e.preventDefault();
      startRec();
    }
  });
  addEventListener('keyup', (e) => {
    if (e.code === 'Space' && rec) stopRec();
  });
}

// ------------------------------------------------------------ Workshop
const actions = new Map();
const editing = new Set();

function upsertAction(a) {
  if (!a) return;
  const prev = actions.get(a.id);
  actions.set(a.id, { ...prev, ...a });
  renderWorkshop();
}

function renderWorkshop() {
  const list = [...actions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pending = list.filter((a) => a.status === 'pending' || a.status === 'failed').length;
  $('#wsBadge').hidden = !pending;
  $('#wsBadge').textContent = pending;
  world.setBusy(list.some((a) => a.status === 'running'));
  if (!list.length) return;
  $('#workshop').innerHTML = list.map(card).join('');
  for (const ul of document.querySelectorAll('.progress')) ul.scrollTop = ul.scrollHeight;
}

function card(a) {
  const pf = a.preflight;
  const pfLine = pf ? `<div class="preflight ${pf.ok ? 'ok' : 'bad'}">Pre-flight: ${pf.ok ? '✔ ' + esc(pf.message) : '✖ ' + esc(reasonLabel(pf.reason)) + ': ' + esc(pf.message)}</div>` : '';
  const isEditing = editing.has(a.id);
  const brief = isEditing
    ? `<textarea class="brief" id="edit-${a.id}">${esc(a.brief)}</textarea>`
    : `<div class="brief">${esc(a.brief)}</div>`;
  let buttons = '';
  if (isEditing) buttons = `<button data-act="save" data-id="${a.id}" class="approve">Save edits</button><button data-act="cancel" data-id="${a.id}">Cancel</button>`;
  else if (a.status === 'pending') buttons = `<button data-act="approve" data-id="${a.id}" class="approve">Approve</button><button data-act="edit" data-id="${a.id}">Edit</button><button data-act="reject" data-id="${a.id}" class="reject">Reject</button>`;
  else if (a.status === 'failed') buttons = `<button data-act="retry" data-id="${a.id}" class="retry">Retry</button><button data-act="edit" data-id="${a.id}">Edit</button><button data-act="reject" data-id="${a.id}" class="reject">Reject</button>`;
  const f = a.failure;
  const failure = f
    ? `<div class="failure"><b>Build failed: ${esc(f.label || reasonLabel(f.reason))}</b><div>${esc(f.message)}</div>
       <div style="margin-top:6px">The brief is kept at <b>${esc(a.briefFile)}</b>. Run it by hand:</div>
       <code>${esc(f.manualCommand)}</code><div class="row"><button data-act="copy" data-cmd="${esc(f.manualCommand)}">Copy command</button></div></div>`
    : '';
  const result = a.result ? `<div class="preflight ok">✔ Done. Output: ${esc(a.buildDir)}<br>${esc(a.result.summary).slice(0, 600)}</div>` : '';
  const progress = a.progress?.length
    ? `<ul class="progress">${a.progress.map((p) => `<li class="${esc(p.type)}">${esc(p.type === 'tool' ? '→ ' + p.text : p.text)}</li>`).join('')}</ul>`
    : '';
  return `<div class="card" id="card-${a.id}">
    <h3>${esc(a.request)} <span class="chip ${esc(a.status)}">${esc(a.status)}</span></h3>
    <div class="meta">${esc(a.briefFile)}</div>
    ${pfLine}${brief}<div class="row">${buttons}</div>${failure}${result}${progress}
  </div>`;
}

const reasonLabel = (r) => ({ ok: 'Ready', not_installed: 'Coding agent not installed', expired_login: 'Expired or missing login', limit_reached: 'Usage limit reached', timeout: 'Timed out', other: 'Other error' })[r] || r;

$('#workshop').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const { act, id } = b.dataset;
  try {
    if (act === 'copy') {
      await navigator.clipboard.writeText(b.dataset.cmd);
      b.textContent = 'Copied';
      return;
    }
    if (act === 'edit') {
      editing.add(id);
      return renderWorkshop();
    }
    if (act === 'cancel') {
      editing.delete(id);
      return renderWorkshop();
    }
    if (act === 'save') {
      const text = document.getElementById(`edit-${id}`).value;
      const a = await api(`/api/actions/${id}/brief`, { method: 'PUT', body: JSON.stringify({ text }) });
      editing.delete(id);
      return upsertAction(a);
    }
    b.disabled = true;
    if (act === 'approve') world.growlord.flare();
    const a = await api(`/api/actions/${id}/${act}`, { method: 'POST' });
    upsertAction(a);
  } catch (err) {
    if (err.body?.code === 'needs_approval') {
      say('error', 'The brief changed since you approved it. Please approve it again.');
      const fresh = await api(`/api/actions/${id}`);
      upsertAction(fresh);
    } else say('error', err.message);
    renderWorkshop();
  }
});

// live progress
const events = new EventSource(`/api/events?s=${encodeURIComponent(SESSION)}`);
events.addEventListener('action', (e) => upsertAction(JSON.parse(e.data)));
events.addEventListener('progress', (e) => {
  const ev = JSON.parse(e.data);
  const a = actions.get(ev.id);
  if (!a) return;
  a.progress = [...(a.progress || []), ev].slice(-200);
  if (ev.type === 'failed' || ev.type === 'done') world.growlord.flare();
  renderWorkshop();
});
api('/api/actions').then((list) => list.forEach(upsertAction)).catch(() => {});

// ------------------------------------------------------------ Doctor
async function runDoctor() {
  const ul = $('#doctorList');
  ul.innerHTML = '<li class="muted">Checking (the coding-agent check makes one tiny test call)...</li>';
  const browser = [];
  const add = (name, status, detail, fix) => browser.push({ name, status, detail, fix });
  // mic
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    add('Microphone', 'ok', 'Microphone permission granted');
  } catch (e) {
    add('Microphone', 'fail', `Mic not available: ${e.name}`, 'Allow the microphone for this page, or use the text box');
  }
  add('Speech to text', SR ? 'ok' : 'warn', SR ? 'Push-to-talk supported' : 'Not supported in this browser', 'Use Chrome or Edge, or type');
  add('Browser voice', 'speechSynthesis' in window ? 'ok' : 'warn', 'speechSynthesis' in window ? 'Fallback voice available' : 'No fallback voice');
  add('3D', 'ok', `Rendering at ~${Math.round(world.fps)} fps${lite ? ' (phone mode)' : ''}`);
  let server = [];
  try {
    server = await api('/api/doctor?agent=1');
  } catch (e) {
    server = [{ name: 'Server', status: 'fail', detail: e.message }];
  }
  const all = [...server.filter((r) => r.name !== 'Microphone'), ...browser];
  const icon = { ok: '✔', warn: '!', fail: '✖' };
  ul.innerHTML = all
    .map((r) => `<li class="${r.status}"><span class="ic">${icon[r.status]}</span><span><b>${esc(r.name)}</b>: ${esc(r.detail)}${r.fix && r.status !== 'ok' ? `<br><span class="fix">Fix: ${esc(r.fix)}</span>` : ''}</span></li>`)
    .join('');
}
$('#doctorBtn').addEventListener('click', () => {
  $('#doctor').showModal();
  runDoctor();
});
$('#doctorRun').addEventListener('click', runDoctor);
$('#doctorClose').addEventListener('click', () => $('#doctor').close());
