#!/usr/bin/env node
// npm run doctor  -> checks everything Growlord needs before first use.
process.env.GROWLORD_QUIET = '1';
const { runChecks } = await import('./checks.js');

const icon = { ok: '✔', warn: '!', fail: '✖' };
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const color = tty ? { ok: '\x1b[32m', warn: '\x1b[33m', fail: '\x1b[31m' } : { ok: '', warn: '', fail: '' };
const reset = tty ? '\x1b[0m' : '';

console.log('\nGrowlord doctor\n');
const results = await runChecks({ includeAgent: !process.argv.includes('--skip-agent') });
for (const r of results) {
  console.log(`${color[r.status]}${icon[r.status]} ${r.name.padEnd(16)}${reset} ${r.detail}`);
  if (r.fix && r.status !== 'ok') console.log(`  ${' '.repeat(16)} fix: ${r.fix}`);
}
const failed = results.filter((r) => r.status === 'fail').length;
console.log(failed ? `\n${failed} problem(s) to fix before first use.\n` : '\nReady.\n');
process.exit(failed ? 1 : 0);
