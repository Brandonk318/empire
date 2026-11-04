// Approval gate for every outbound action (build, email, post, publish).
//
// Rules enforced HERE, on the server, regardless of what any UI does:
//  - Actions are created "pending". The only way to run one is approve().
//  - Approval is bound to a hash of the exact content. If the content changes
//    after approval (edited brief, edited file on disk), it must be approved again.
//  - execute() refuses anything not approved, and there is no HTTP route that
//    calls an executor directly.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { log } from './log.js';

export const OUTBOUND_KINDS = ['build', 'email', 'post', 'publish'];
// Local changes that still need Brandon's yes: edits to the business files.
export const ACTION_KINDS = [...OUTBOUND_KINDS, 'business_update'];

export class GateError extends Error {
  constructor(message, code = 'not_approved') {
    super(message);
    this.code = code;
  }
}

const actions = new Map();
const executors = new Map();
let changed = () => {};

// index.js saves to disk on every change so the Workshop survives restarts.
export function onChange(fn) {
  changed = fn;
}
// Every change bumps a revision so the page can ignore replies that arrive out of order.
export function touch(a) {
  a.rev = (a.rev || 0) + 1;
  a.updatedAt = new Date().toISOString();
  changed(a);
}

function contentOf(action) {
  // Builds are approved against the brief file as it is on disk right now.
  if (action.kind === 'build') {
    return fs.existsSync(action.payload.briefPath)
      ? fs.readFileSync(action.payload.briefPath, 'utf8')
      : '';
  }
  return JSON.stringify(action.payload);
}

export function contentHash(action) {
  return crypto.createHash('sha256').update(contentOf(action)).digest('hex');
}

export function registerExecutor(kind, fn) {
  if (!ACTION_KINDS.includes(kind)) throw new Error(`Unknown action kind: ${kind}`);
  executors.set(kind, fn);
}

export function createAction(kind, payload, extra = {}) {
  if (!ACTION_KINDS.includes(kind)) throw new Error(`Unknown action kind: ${kind}`);
  const action = {
    id: crypto.randomUUID(),
    kind,
    status: 'pending',
    payload,
    approvedHash: null,
    createdAt: new Date().toISOString(),
    failure: null,
    progress: [],
    ...extra,
  };
  actions.set(action.id, action);
  log('gate', `created ${kind} action, waiting for approval`, { id: action.id });
  touch(action);
  return action;
}

export function getAction(id) {
  return actions.get(id);
}

export function listActions() {
  return [...actions.values()];
}

export function approve(id) {
  const a = actions.get(id);
  if (!a) throw new GateError('No such action', 'not_found');
  if (!['pending', 'failed'].includes(a.status)) {
    throw new GateError(`Cannot approve an action that is ${a.status}`, 'bad_state');
  }
  a.approvedHash = contentHash(a);
  a.status = 'approved';
  a.approvedAt = new Date().toISOString();
  log('gate', `APPROVED ${a.kind}`, { id });
  return execute(id);
}

export function reject(id) {
  const a = actions.get(id);
  if (!a) throw new GateError('No such action', 'not_found');
  if (a.status === 'running') throw new GateError('Cannot reject a running action', 'bad_state');
  a.status = 'rejected';
  a.approvedHash = null;
  log('gate', `rejected ${a.kind} (content kept on disk)`, { id });
  touch(a);
  return a;
}

// Called after an edit: any earlier approval no longer covers the new content.
export function markEdited(id) {
  const a = actions.get(id);
  if (!a) throw new GateError('No such action', 'not_found');
  if (a.status === 'running') throw new GateError('Cannot edit while running', 'bad_state');
  a.approvedHash = null;
  a.status = 'pending';
  a.failure = null;
  log('gate', `edited ${a.kind}; approval reset`, { id });
  touch(a);
  return a;
}

// Change a non-build payload (e.g. the section of a business update). Voids any approval.
export function editPayload(id, patch) {
  const a = actions.get(id);
  if (!a) throw new GateError('No such action', 'not_found');
  if (a.kind === 'build') throw new GateError('Edit the brief instead', 'bad_state');
  if (['running', 'succeeded'].includes(a.status)) throw new GateError(`Cannot edit an action that is ${a.status}`, 'bad_state');
  a.payload = { ...a.payload, ...patch };
  return markEdited(id);
}

// Retry reuses the approval only if the content is byte-for-byte what was approved.
export function retry(id) {
  const a = actions.get(id);
  if (!a) throw new GateError('No such action', 'not_found');
  if (a.status !== 'failed') throw new GateError(`Can only retry a failed action (is ${a.status})`, 'bad_state');
  if (!a.approvedHash || a.approvedHash !== contentHash(a)) {
    a.status = 'pending';
    a.approvedHash = null;
    touch(a);
    throw new GateError('Content changed since approval. Approve it again.', 'needs_approval');
  }
  a.status = 'approved';
  log('gate', `retry ${a.kind} (same approved content)`, { id });
  return execute(id);
}

// Internal only. Never exposed as a route.
export function execute(id) {
  const a = actions.get(id);
  if (!a) throw new GateError('No such action', 'not_found');
  if (a.status !== 'approved' || !a.approvedHash) {
    log('gate', `BLOCKED unapproved ${a.kind}`, { id, status: a.status });
    throw new GateError(`Blocked: ${a.kind} has not been approved by Brandon.`);
  }
  if (a.approvedHash !== contentHash(a)) {
    a.status = 'pending';
    a.approvedHash = null;
    touch(a);
    log('gate', `BLOCKED ${a.kind}: content changed after approval`, { id });
    throw new GateError('Blocked: content changed after approval. Approve it again.', 'needs_approval');
  }
  const fn = executors.get(a.kind);
  if (!fn) {
    a.status = 'failed';
    a.failure = { reason: 'other', message: `${a.kind} is not available in this version.` };
    touch(a);
    throw new GateError(a.failure.message, 'not_available');
  }
  a.status = 'running';
  a.failure = null;
  touch(a);
  // Fire and forget; the executor reports progress/finish through the action object.
  Promise.resolve()
    .then(() => fn(a))
    .catch((err) => {
      a.status = 'failed';
      a.failure = a.failure || { reason: 'other', message: String(err?.message || err) };
      log('gate', `${a.kind} crashed`, { id, error: a.failure.message });
    })
    .finally(() => touch(a));
  return a;
}

// ---------------------------------------------------------------- persistence

export function snapshot() {
  return [...actions.values()].map((a) => ({ ...a, progress: a.progress.slice(-200) }));
}

// Restore saved actions. Anything that was running when the server stopped is marked failed
// (approval kept, so Retry works if the content is unchanged).
export function restore(list) {
  for (const a of list || []) {
    if (!a?.id || !ACTION_KINDS.includes(a.kind)) continue;
    if (a.status === 'running' || a.status === 'approved') {
      a.status = 'failed';
      a.failure = {
        reason: 'other',
        label: 'Interrupted',
        message: 'Growlord was stopped while this was running. Retry to run it again.',
        ...(a.failure?.manualCommand ? { manualCommand: a.failure.manualCommand } : {}),
      };
    }
    a.progress = a.progress || [];
    actions.set(a.id, a);
  }
  return actions.size;
}

// Test helper.
export function _resetForTests() {
  actions.clear();
  executors.clear();
  changed = () => {};
}
