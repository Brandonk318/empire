// Business knowledge: business.md plus every .md file in business/.
//
// - Re-read on every question, so edits take effect immediately (no restart).
// - Each file is labelled in what Grok sees, so answers can cite "Leads (business.md)".
// - Updates from the page go through the approval gate and back up the old file first.
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from './config.js';
import { log } from './log.js';

export const HISTORY_DIR_NAME = '.history';

const rel = (p) => {
  const r = path.relative(ROOT, p);
  return r.startsWith('..') ? p : r.split(path.sep).join('/');
};

export function listFiles() {
  const files = [];
  if (fs.existsSync(config.businessFile)) files.push(config.businessFile);
  if (fs.existsSync(config.businessDir)) {
    for (const name of fs.readdirSync(config.businessDir).sort()) {
      if (name.startsWith('.') || !name.toLowerCase().endsWith('.md')) continue;
      const p = path.join(config.businessDir, name);
      if (fs.statSync(p).isFile()) files.push(p);
    }
  }
  return files;
}

export function parseSections(text) {
  const out = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const h = line.match(/^##\s+(.*?)\s*$/);
    if (h) {
      cur = { title: h[1], body: [] };
      out.push(cur);
    } else if (cur && line.trim()) cur.body.push(line.replace(/^[-*\d.]+\s*/, '').trim());
  }
  return out;
}

// Everything Grok needs, labelled by file.
export function load() {
  const files = listFiles().map((p) => {
    const text = fs.readFileSync(p, 'utf8');
    return { path: p, rel: rel(p), text, sections: parseSections(text) };
  });
  const combined = files
    .map((f) => (files.length > 1 ? `<!-- FILE: ${f.rel} -->\n${f.text.trim()}` : f.text.trim()))
    .join('\n\n');
  const sections = files.flatMap((f) => f.sections.map((s) => ({ ...s, file: f.rel })));
  return {
    files,
    combined,
    sections,
    chars: combined.length,
    fillIns: (combined.match(/\[FILL IN\]/g) || []).length,
  };
}

// Match what Grok cited to a real heading. Returns "Leads (business.md)" or null.
export function resolveSource(source, sections) {
  if (!source || typeof source !== 'string') return null;
  const want = source.toLowerCase().replace(/\(.*?\)/g, '').replace(/^#+\s*/, '').trim();
  if (!want) return null;
  const hit =
    sections.find((s) => s.title.toLowerCase() === want) ||
    sections.find((s) => want.includes(s.title.toLowerCase()) || s.title.toLowerCase().includes(want));
  return hit ? { title: hit.title, file: hit.file, label: `${hit.title} (${hit.file})` } : null;
}

// Files Growlord may write to: business.md or a .md directly inside business/.
export function resolveWritable(file) {
  const name = String(file || '').trim().replace(/\\/g, '/');
  const candidates = [config.businessFile];
  if (name && name !== rel(config.businessFile) && name !== 'business.md') {
    const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '-');
    if (!base.toLowerCase().endsWith('.md') || base.startsWith('.')) throw Object.assign(new Error('Business files must be .md files'), { status: 400 });
    candidates[0] = path.join(config.businessDir, base);
  }
  const p = candidates[0];
  const inDir = path.dirname(p) === config.businessDir;
  if (p !== config.businessFile && !inDir) throw Object.assign(new Error('Not a business file'), { status: 400 });
  return p;
}

export function backup(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const dir = path.join(config.businessDir, HISTORY_DIR_NAME);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `${path.basename(filePath, '.md')}-${stamp}.md`);
  fs.copyFileSync(filePath, dest);
  return dest;
}

// Insert "- text" at the end of a "## section" (creating the section or file if needed).
export function applyUpdate({ file, section, text }) {
  const target = resolveWritable(file);
  const cleanSection = String(section || 'Notes').replace(/^#+\s*/, '').replace(/[\r\n]/g, ' ').trim() || 'Notes';
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/^[-*]\s/.test(l) ? l : `- ${l}`));
  if (!lines.length) throw Object.assign(new Error('Nothing to add'), { status: 400 });
  const saved = backup(target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let md = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : `# ${path.basename(target, '.md')}\n`;
  const rows = md.replace(/\s+$/, '').split('\n');
  const start = rows.findIndex((l) => {
    const m = l.match(/^##\s+(.*?)\s*$/);
    return m && m[1].toLowerCase() === cleanSection.toLowerCase();
  });
  if (start < 0) {
    rows.push('', `## ${cleanSection}`, ...lines);
  } else {
    let end = rows.findIndex((l, i) => i > start && /^##?\s/.test(l));
    if (end < 0) end = rows.length;
    // insert after the last non-blank line of the section
    let at = end;
    while (at - 1 > start && !rows[at - 1].trim()) at--;
    rows.splice(at, 0, ...lines);
  }
  md = rows.join('\n') + '\n';
  fs.writeFileSync(target, md);
  log('business', 'updated', { file: rel(target), section: cleanSection, lines: lines.length, backup: saved && rel(saved) });
  return { file: rel(target), section: cleanSection, backup: saved && rel(saved) };
}

// Watchers are kept here on purpose: an unreferenced fs.watch handle can be garbage-collected,
// which silently stops change notices.
const activeWatchers = [];

// Calls onChange (debounced) whenever business.md or anything in business/ changes.
export function watch(onChange) {
  let timer = null;
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const k = load();
        onChange({ files: k.files.map((f) => f.rel), chars: k.chars, sections: k.sections.length, fillIns: k.fillIns });
      } catch (e) {
        log('business', 'reload failed', { error: e.message });
      }
    }, 300);
  };
  const watchers = [];
  const add = (p, only) => {
    try {
      watchers.push(
        fs.watch(p, { persistent: false }, (_evt, name) => {
          if (only && name && name !== only) return;
          if (name && (name.startsWith('.') || !name.toLowerCase().endsWith('.md'))) return;
          fire();
        }),
      );
    } catch {}
  };
  // watch the folder that holds business.md (editors often replace the file on save)
  add(path.dirname(config.businessFile), path.basename(config.businessFile));
  fs.mkdirSync(config.businessDir, { recursive: true });
  add(config.businessDir);
  activeWatchers.push(...watchers);
  return () => watchers.forEach((w) => {
    w.close();
    activeWatchers.splice(activeWatchers.indexOf(w), 1);
  });
}
