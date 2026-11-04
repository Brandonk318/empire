#!/usr/bin/env node
// Stand-in for a Grok CLI in tests. Its --help mirrors the community grok-cli's documented flags.
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`Usage: grok [options]

Options:
  -V, --version            output the version number
  -d, --directory <dir>    set working directory
  -k, --api-key <key>      Grok API key
  -m, --model <model>      AI model to use
  -p, --prompt <prompt>    process a single prompt and exit (headless mode)
  -h, --help               display help for command`);
  process.exit(0);
}
if (args.includes('--version')) {
  console.log('0.0.34');
  process.exit(0);
}
const i = args.indexOf('-p');
const prompt = i >= 0 ? args[i + 1] : '';
const sawBusiness = /Momoempire CRM/.test(prompt) && /QUESTION/.test(prompt);
console.log(
  JSON.stringify(
    sawBusiness
      ? { reply: 'From the CLI: free workshops with trade schools.', district: 'leads', source: 'Leads' }
      : { reply: 'business file missing from prompt', district: 'none' },
  ),
);
