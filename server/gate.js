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

export class GateError extends Error {
  constructor(message, code = 'not_approved') {
    super(message);
    this.code = code;
  }
}

const actions = new Map();
const executors = new Map();

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
  if (!OUTBOUND_KINDS.includes(kind)) throw new Error(`Unknown outbound kind: ${kind}`);
  executors.set(kind, fn);
}

export function createAction(kind, payload, extra = {}) {
  if (!OUTBOUND_KINDS.includes(kind)) throw new Error(`Unknown outbound kind: ${kind}`);
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
  return a;
}

// Retry reuses the approval only if the content is byte-for-byte what was approved.
export function retry(id) {
  const a = actions.get(id);
  if (!a) throw new GateError('No such action', 'not_found');
  if (a.status !== 'failed') throw new GateError(`Can only retry a failed action (is ${a.status})`, 'bad_state');
  if (!a.approvedHash || a.approvedHash !== contentHash(a)) {
    a.status = 'pending';
    a.approvedHash = null;
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
    log('gate', `BLOCKED ${a.kind}: content changed after approval`, { id });
    throw new GateError('Blocked: content changed after approval. Approve it again.', 'needs_approval');
  }
  const fn = executors.get(a.kind);
  if (!fn) {
    a.status = 'failed';
    a.failure = { reason: 'other', message: `${a.kind} is not available in this version.` };
    throw new GateError(a.failure.message, 'not_available');
  }
  a.status = 'running';
  a.failure = null;
  // Fire and forget; the executor reports progress/finish through the action object.
  Promise.resolve()
    .then(() => fn(a))
    .catch((err) => {
      a.status = 'failed';
      a.failure = a.failure || { reason: 'other', message: String(err?.message || err) };
      log('gate', `${a.kind} crashed`, { id, error: a.failure.message });
    });
  return a;
}

// Test helper.
export function _resetForTests() {
  actions.clear();
  executors.clear();
}
