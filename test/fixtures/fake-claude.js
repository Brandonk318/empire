#!/usr/bin/env node
// Stand-in for the coding-agent CLI in automated tests. FAKE_CLAUDE_MODE = ok | logged_out | limit
// Its outputs mirror the real `claude` CLI's JSON shapes (including exit code 0 on API errors).
import fs from 'node:fs';
const mode = process.env.FAKE_CLAUDE_MODE || 'ok';
const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('9.9.9 (Fake Claude Code)');
  process.exit(0);
}
const fmt = args[args.indexOf('--output-format') + 1];
const error = {
  logged_out: { api_error_status: 401, result: 'Invalid API key · Please run /login' },
  limit: { api_error_status: 429, result: "Claude AI usage limit reached. You've hit your limit." },
}[mode];
const result = (extra) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 3, result: 'OK', ...extra });
if (fmt === 'json') {
  console.log(error ? result({ is_error: true, num_turns: 1, ...error }) : result({ num_turns: 1 }));
  process.exit(0);
}
// stream-json build
console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'fake-model' }));
if (error) {
  console.log(result({ is_error: true, ...error }));
  process.exit(0);
}
console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Reading the brief.' }, { type: 'tool_use', name: 'Read', input: { file_path: 'BRIEF.md' } }] } }));
fs.writeFileSync('index.html', '<!doctype html><title>fake build</title>\n');
console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: 'index.html' } }] } }));
fs.writeFileSync('SUMMARY.md', '- index.html\n');
console.log(result({ result: 'Built index.html' }));
