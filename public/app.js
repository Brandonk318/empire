// Growlord UI: ask, voice in/out, Workshop approvals, business-file updates, Doctor.
import { createWorld } from './world.js';

const SESSION = document.querySelector('meta[name="growlord-session"]').content;
const params = new URLSearchParams(location.search);
const lite = params.has('lite') || (params.get('quality') !== 'high' && (matchMedia('(pointer: coarse)').matches || innerWidth < 800));

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const world = createWorld($('#scene'), { lite });
window.growlord = world; // used by automated browser checks

function fitPanel() {
  const wide = innerWidth > 760;
  world.setInsetRight(wide ? $('#panel').offsetWidth + 16 : 0);
}
addEventListener('resize', fitPanel);
fitPanel();

// ------------------------------------------------------------ server calls
let stale = false;
function showStale() {
  if (stale) return;
  stale = true;
  $('#banner').hidden = false;
}
$('#reloadBtn').addEventListener('click', () => location.reload());

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'content-type': 'application/json', 'x-growlord-session': SESSION, ...(opts.headers || {}) },
  });
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('json') ? await res.json() : await res.blob();
  if (!res.ok) {
    if (body?.code === 'stale_session') showStale();
    throw Object.assign(new Error(body?.error || `HTTP ${res.status}`), { status: res.status, body });
  }
  return body;
}

function toast(text, ms = 4500) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

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
function say(who, text, { district, source } = {}) {
  const el = document.createElement('div');
  el.className = `msg ${who}`;
  el.innerHTML =
    esc(text) +
    (district && district !== 'none' ? `<span class="tag" style="background:${COLORS[district]}">${esc(district)}</span>` : '') +
    (source ? `<div class="src">from ${esc(source)}</div>` : '');
  $('#transcript').append(el);
  el.scrollIntoView({ block: 'end', behavior: 'smooth' });
}
const setStatus = (t) => ($('#status').textContent = t || '');

$('#newTopic').addEventListener('click', async () => {
  try {
    await api('/api/conversation/reset', { method: 'POST' });
    say('system', 'New topic. Earlier questions are forgotten.');
  } catch (e) {
    say('error', e.message);
  }
});

// ------------------------------------------------------------ voice out (TTS + analyser)
let audioCtx = null;
let analyser = null;
let currentSource = null;
let fakeLevel = 0;
let speakingFallback = false;
let lastBoundary = 0;
let speechPrimed = false;
let speakToken = 0;
const timeData = new Uint8Array(1024);

function unlockAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      audioCtx = new AC();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      analyser.connect(audioCtx.destination);
    }
  }
  if (audioCtx?.state === 'suspended') audioCtx.resume();
  // iOS/Safari only allow speech that was first started inside a tap: prime it once.
  if (!speechPrimed && 'speechSynthesis' in window) {
    speechPrimed = true;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch {}
  }
}
addEventListener('pointerdown', unlockAudio);
addEventListener('keydown', unlockAudio);

function stopSpeaking() {
  speakToken++;
  try {
    currentSource?.stop();
  } catch {}
  currentSource = null;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  speakingFallback = false;
}

let voicesCache = [];
if ('speechSynthesis' in window) {
  voicesCache = speechSynthesis.getVoices();
  speechSynthesis.addEventListener?.('voiceschanged', () => (voicesCache = speechSynthesis.getVoices()));
}

// Chrome cuts long utterances off after ~15s, so speak sentence by sentence.
function chunks(text) {
  const parts = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
  const out = [];
  for (const p of parts) {
    if (out.length && (out[out.length - 1] + p).length < 180) out[out.length - 1] += p;
    else out.push(p);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

function speakBrowser(text, token) {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  const voice =
    voicesCache.find((v) => /en[-_]US/i.test(v.lang) && /male|david|guy|daniel|google us/i.test(v.name)) ||
    voicesCache.find((v) => /^en/i.test(v.lang)) ||
    null;
  const sayOne = (s) =>
    new Promise((resolve) => {
      if (token !== speakToken) return resolve();
      const u = new SpeechSynthesisUtterance(s);
      if (voice) u.voice = voice;
      u.rate = 1;
      u.pitch = 0.85;
      // Faked reaction: every word boundary kicks the level up; it decays each frame.
      u.onboundary = () => {
        fakeLevel = 0.75 + Math.random() * 0.25;
        lastBoundary = performance.now();
      };
      u.onstart = () => (speakingFallback = true);
      // Some browsers never fire onend; never let that hang Growlord.
      const guard = setTimeout(done, 1500 + s.length * 90);
      function done() {
        clearTimeout(guard);
        resolve();
      }
      u.onend = u.onerror = done;
      speechSynthesis.speak(u);
    });
  return (async () => {
    for (const s of chunks(text)) await sayOne(s);
    if (token === speakToken) speakingFallback = false;
  })();
}

// Is a Kokoro (server) voice running? Re-checked every 30s, so starting Kokoro later just works.
let ttsUp = false;
async function refreshTts() {
  try {
    ttsUp = Boolean((await api('/api/status')).tts);
  } catch {}
}
refreshTts();
setInterval(refreshTts, 30_000);

async function speak(text) {
  stopSpeaking();
  const token = speakToken;
  try {
    if (!ttsUp) throw Object.assign(new Error('no server voice'), { status: 503 });
    unlockAudio();
    if (!audioCtx) throw new Error('no Web Audio');
    const blob = await api('/api/tts', { method: 'POST', body: JSON.stringify({ text }) });
    if (token !== speakToken) return;
    const buf = await audioCtx.decodeAudioData(await blob.arrayBuffer());
    if (token !== speakToken) return;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(analyser);
    src.start();
    currentSource = src;
    await new Promise((r) => (src.onended = r));
    if (currentSource === src) currentSource = null;
    return;
  } catch (e) {
    if (e.status === 503) ttsUp = false;
    else console.warn('Server voice failed, using browser voice', e);
  }
  if (token === speakToken) await speakBrowser(text, token);
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
  if (!text) return;
  if (busy) {
    setStatus('Still working on your last question...');
    return;
  }
  busy = true;
  stopSpeaking();
  say('you', text);
  setStatus(/^\s*(please\s+)?build\b/i.test(text) ? 'Researching a brief with Grok...' : 'Thinking...');
  world.growlord.setThinking(true);
  let reply = null;
  try {
    const r = await api('/api/ask', { method: 'POST', body: JSON.stringify({ text }) });
    say('growlord', r.reply, { district: r.district, source: r.source });
    if (r.district && r.district !== 'none') world.flyTo(r.district);
    if (r.action) {
      upsertAction(r.action);
      world.growlord.flare();
      showTab('workshop');
    }
    reply = r.reply;
  } catch (e) {
    say('error', e.message);
  } finally {
    world.growlord.setThinking(false);
    setStatus('');
    busy = false; // free for the next question even while he's still talking
  }
  if (reply) speak(reply);
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
      setStatus(ev.error === 'not-allowed' ? 'Mic blocked. Allow the microphone, or type.' : ev.error === 'no-speech' ? "I didn't hear anything." : `Mic: ${ev.error}`);
    };
    rec.onend = () => {
      micBtn.classList.remove('live');
      const text = heard.trim();
      rec = null;
      if (text) {
        $('#askInput').value = '';
        ask(text);
      } else if ($('#status').textContent.startsWith('Listening')) setStatus('');
    };
    try {
      rec.start();
    } catch (e) {
      rec = null;
      setStatus(`Mic: ${e.message}`);
      return;
    }
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
  micBtn.addEventListener('contextmenu', (e) => e.preventDefault()); // long-press on phones
  const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.querySelector('dialog[open]');
  addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat && !typing()) {
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
const drafts = new Map(); // keeps half-typed edits when live updates re-render the cards

function upsertAction(a) {
  if (!a) return;
  const prev = actions.get(a.id);
  if (prev && (a.rev ?? 0) < (prev.rev ?? 0)) return; // an older reply arrived late
  actions.set(a.id, { ...prev, ...a });
  renderWorkshop();
}

const reasonLabel = (r) =>
  ({ ok: 'Ready', not_installed: 'Coding agent not installed', expired_login: 'Expired or missing login', limit_reached: 'Usage limit reached', timeout: 'Timed out', other: 'Other error' })[r] || r;

function renderWorkshop() {
  // capture drafts before replacing the DOM
  document.querySelectorAll('#workshop [data-draft]').forEach((el) => drafts.set(el.dataset.draft, el.value));
  const focused = document.activeElement?.dataset?.draft;
  const list = [...actions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const waiting = list.filter((a) => a.status === 'pending' || a.status === 'failed').length;
  $('#wsBadge').hidden = !waiting;
  $('#wsBadge').textContent = waiting;
  world.setBusy(list.some((a) => a.status === 'running'));
  if (!list.length) return;
  $('#workshop').innerHTML = list.map(card).join('');
  for (const ul of document.querySelectorAll('.progress')) ul.scrollTop = ul.scrollHeight;
  document.querySelectorAll('#workshop [data-draft]').forEach((el) => {
    if (drafts.has(el.dataset.draft)) el.value = drafts.get(el.dataset.draft);
  });
  if (focused) document.querySelector(`[data-draft="${focused}"]`)?.focus();
}

function buttonsFor(a, isEditing) {
  if (isEditing) return `<button data-act="save" data-id="${a.id}" class="approve">Save edits</button><button data-act="cancel" data-id="${a.id}">Cancel</button>`;
  if (a.status === 'pending')
    return `<button data-act="approve" data-id="${a.id}" class="approve">Approve</button><button data-act="edit" data-id="${a.id}">Edit</button><button data-act="reject" data-id="${a.id}" class="reject">Reject</button>`;
  if (a.status === 'failed')
    return `<button data-act="retry" data-id="${a.id}" class="retry">Retry</button><button data-act="edit" data-id="${a.id}">Edit</button><button data-act="reject" data-id="${a.id}" class="reject">Reject</button>`;
  return '';
}

function card(a) {
  return a.kind === 'business_update' ? updateCard(a) : buildCard(a);
}

function updateCard(a) {
  const u = a.update;
  const isEditing = editing.has(a.id);
  const body = isEditing
    ? `<label class="field">Section<input data-draft="sec-${a.id}" value="${esc(u.section)}" /></label>
       <label class="field">Text<textarea class="brief small" data-draft="txt-${a.id}">${esc(u.text)}</textarea></label>`
    : `<div class="update"><div class="meta">${esc(u.file)} &rsaquo; ## ${esc(u.section)}</div><div class="add">+ ${esc(u.text)}</div></div>`;
  const result = a.result ? `<div class="preflight ok">✔ ${esc(a.result.summary)}</div>` : '';
  const fail = a.failure ? `<div class="failure"><b>Could not update: ${esc(a.failure.message)}</b></div>` : '';
  return `<div class="card">
    <h3>Add to business file <span class="chip ${esc(a.status)}">${esc(a.status === 'succeeded' ? 'added' : a.status)}</span></h3>
    ${body}<div class="row">${buttonsFor(a, isEditing)}</div>${fail}${result}
  </div>`;
}

function buildCard(a) {
  const pf = a.preflight;
  const pfLine = pf
    ? `<div class="preflight ${pf.ok ? 'ok' : 'bad'}">Pre-flight: ${pf.ok ? '✔ ' + esc(pf.message) : '✖ ' + esc(reasonLabel(pf.reason)) + ': ' + esc(pf.message)}</div>`
    : '';
  const isEditing = editing.has(a.id);
  const brief = isEditing ? `<textarea class="brief" data-draft="brief-${a.id}">${esc(a.brief)}</textarea>` : `<div class="brief">${esc(a.brief)}</div>`;
  const f = a.failure;
  const failure = f
    ? `<div class="failure"><b>Build failed: ${esc(f.label || reasonLabel(f.reason))}</b><div>${esc(f.message)}</div>
       <div style="margin-top:6px">The brief is kept at <b>${esc(a.briefFile)}</b>. Run it by hand:</div>
       <code>${esc(f.manualCommand)}</code><div class="row"><button data-act="copy" data-cmd="${esc(f.manualCommand)}">Copy command</button></div></div>`
    : '';
  const result = a.result ? `<div class="preflight ok">✔ Done. Output: ${esc(a.buildDir)}<br>${esc(String(a.result.summary || '').slice(0, 600))}</div>` : '';
  const progress = a.progress?.length
    ? `<ul class="progress">${a.progress.map((p) => `<li class="${esc(p.type)}">${esc(p.type === 'tool' ? '→ ' + p.text : p.text)}</li>`).join('')}</ul>`
    : '';
  return `<div class="card">
    <h3>${esc(a.request)} <span class="chip ${esc(a.status)}">${esc(a.status)}</span></h3>
    <div class="meta">${esc(a.briefFile)}</div>
    ${pfLine}${brief}<div class="row">${buttonsFor(a, isEditing)}</div>${failure}${result}${progress}
  </div>`;
}

$('#workshop').addEventListener('input', (e) => {
  if (e.target.dataset.draft) drafts.set(e.target.dataset.draft, e.target.value);
});

$('#workshop').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const { act, id } = b.dataset;
  const a = actions.get(id);
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
      [`brief-${id}`, `sec-${id}`, `txt-${id}`].forEach((k) => drafts.delete(k));
      return renderWorkshop();
    }
    if (act === 'save') {
      let fresh;
      if (a.kind === 'business_update') {
        const section = document.querySelector(`[data-draft="sec-${id}"]`).value;
        const text = document.querySelector(`[data-draft="txt-${id}"]`).value;
        fresh = await api(`/api/actions/${id}/payload`, { method: 'PUT', body: JSON.stringify({ section, text }) });
      } else {
        const text = document.querySelector(`[data-draft="brief-${id}"]`).value;
        fresh = await api(`/api/actions/${id}/brief`, { method: 'PUT', body: JSON.stringify({ text }) });
      }
      editing.delete(id);
      [`brief-${id}`, `sec-${id}`, `txt-${id}`].forEach((k) => drafts.delete(k));
      return upsertAction(fresh);
    }
    b.disabled = true;
    if (act === 'approve') world.growlord.flare();
    upsertAction(await api(`/api/actions/${id}/${act}`, { method: 'POST' }));
  } catch (err) {
    if (err.body?.code === 'needs_approval') {
      say('error', 'That changed since you approved it. Please approve it again.');
      upsertAction(await api(`/api/actions/${id}`));
    } else say('error', err.message);
    renderWorkshop();
  }
});

// ------------------------------------------------------------ live updates
function connectEvents() {
  const es = new EventSource(`/api/events?s=${encodeURIComponent(SESSION)}`);
  es.addEventListener('action', (e) => upsertAction(JSON.parse(e.data)));
  es.addEventListener('progress', (e) => {
    const ev = JSON.parse(e.data);
    const a = actions.get(ev.id);
    if (!a) return;
    a.progress = [...(a.progress || []), ev].slice(-200);
    if (ev.type === 'failed' || ev.type === 'done') world.growlord.flare();
    renderWorkshop();
  });
  es.addEventListener('business', (e) => {
    const info = JSON.parse(e.data);
    toast(`Business file updated (${info.files.length} file${info.files.length === 1 ? '' : 's'}, ${info.sections} sections). The next answer uses it.`);
    loadBusiness();
  });
  es.onerror = () => {
    // Server gone or restarted with a new session: check once it's reachable again.
    es.close();
    setTimeout(async () => {
      try {
        await api('/api/status');
        connectEvents();
      } catch (err) {
        if (!stale) setTimeout(connectEvents, 3000);
      }
    }, 2000);
  };
}
connectEvents();
api('/api/actions').then((list) => list.forEach(upsertAction)).catch(() => {});

// ------------------------------------------------------------ add to business file
let businessInfo = { files: [] };
async function loadBusiness() {
  try {
    businessInfo = await api('/api/business');
  } catch {}
}
loadBusiness();

const NEW = '__new__';
function fillSections() {
  const file = $('#bizFile').value;
  const f = businessInfo.files.find((x) => x.file === file);
  const opts = (f?.sections || []).map((s) => `<option>${esc(s)}</option>`).join('');
  $('#bizSection').innerHTML = `${opts}<option value="${NEW}">New section...</option>`;
  toggleNew();
}
function toggleNew() {
  $('#bizNewSectionWrap').hidden = $('#bizSection').value !== NEW;
  $('#bizNewFileWrap').hidden = $('#bizFile').value !== NEW;
}
$('#addBiz').addEventListener('click', async () => {
  await loadBusiness();
  $('#bizFile').innerHTML =
    businessInfo.files.map((f) => `<option>${esc(f.file)}</option>`).join('') + `<option value="${NEW}">New file in business/...</option>`;
  fillSections();
  $('#bizText').value = '';
  $('#bizNewSection').value = '';
  $('#bizNewFile').value = '';
  $('#bizDialog').showModal();
  $('#bizText').focus();
});
$('#bizFile').addEventListener('change', fillSections);
$('#bizSection').addEventListener('change', toggleNew);
$('#bizCancel').addEventListener('click', () => $('#bizDialog').close());
$('#bizForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileSel = $('#bizFile').value;
  const file = fileSel === NEW ? `business/${$('#bizNewFile').value.trim().replace(/\.md$/i, '') || 'notes'}.md` : fileSel;
  const section = $('#bizSection').value === NEW ? $('#bizNewSection').value.trim() : $('#bizSection').value;
  try {
    const a = await api('/api/business/proposals', { method: 'POST', body: JSON.stringify({ file, section: section || 'Notes', text: $('#bizText').value }) });
    $('#bizDialog').close();
    upsertAction(a);
    showTab('workshop');
    toast('Drafted. Approve it in the Workshop to change the business file.');
  } catch (err) {
    $('#bizError').textContent = err.message;
  }
});

// ------------------------------------------------------------ Doctor
async function runDoctor() {
  const ul = $('#doctorList');
  ul.innerHTML = '<li class="muted">Checking (the coding-agent check makes one tiny test call)...</li>';
  const browser = [];
  const add = (name, status, detail, fix) => browser.push({ name, status, detail, fix });
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    add('Microphone', 'ok', 'Microphone permission granted');
  } catch (e) {
    add('Microphone', 'fail', `Mic not available: ${e.name}`, 'Allow the microphone for this page, or use the text box');
  }
  add('Speech to text', SR ? 'ok' : 'warn', SR ? 'Push-to-talk supported' : 'Not supported in this browser', 'Use Chrome or Edge, or type');
  add('Browser voice', 'speechSynthesis' in window ? 'ok' : 'warn', 'speechSynthesis' in window ? `Fallback voice available (${voicesCache.length} voices)` : 'No fallback voice');
  add('3D', world.fps >= 45 ? 'ok' : 'warn', `Rendering at ~${Math.round(world.fps)} fps${lite ? ' (phone mode)' : ''}`, 'Try ?lite in the address bar for lighter graphics');
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
