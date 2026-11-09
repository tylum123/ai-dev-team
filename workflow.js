import fs from 'node:fs/promises';
import path from 'node:path';
import { command, safePath } from './core.js';

export const limits = { files: 10, characters: 32000, calls: 6, rounds: 2 };

export function route(task, mode = 'auto', env = process.env) {
  const simple = mode === 'simple' || (mode === 'auto' && /css|typo|spacing|màu|chính tả/i.test(task) && !/auth|security|database|api|payment/i.test(task));
  return {
    complexity: simple ? 'simple' : 'complex',
    planner: !simple,
    reviewer: !simple,
    model: (simple ? env.OPENAI_MODEL_FAST : env.OPENAI_MODEL_STRONG) || env.OPENAI_MODEL,
  };
}

export async function readSafe(root, name) {
  const target = safePath(root, name);
  let current = root;
  for (const part of name.split('/')) {
    current = path.join(current, part);
    if ((await fs.lstat(current)).isSymbolicLink()) throw Error('Symlinks are not allowed');
  }
  if ((await fs.stat(target)).size > 64000) throw Error('File exceeds context limit');
  return fs.readFile(target, 'utf8');
}

export async function retrieve(root, task, pinned = []) {
  const names = (await command('git', ['ls-files', '-z'], root)).split('\0').filter(Boolean);
  const terms = task.toLowerCase().match(/[\p{L}\p{N}_./-]{3,}/gu) || [];
  const candidates = names.filter(name => {
    try { safePath(root, name); } catch { return false; }
    return !/(lock|secret|credential|node_modules|vendor|dist|build)/i.test(name);
  });
  const ranked = candidates.map(name => ({ name, score:
    terms.reduce((sum, term) => sum + (name.toLowerCase().includes(term) ? 4 : 0), 0)
    + (pinned.includes(name) ? 100 : 0) + (/^(package.json|AGENTS.md|README.md)$/.test(name) ? 2 : 0),
  })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const files = [];
  let characters = 0;
  for (const { name, score } of ranked) {
    if (score === 0 || files.length >= limits.files) continue;
    try {
      const content = await readSafe(root, name);
      if (characters + content.length > limits.characters) continue;
      files.push({ path: name, content });
      characters += content.length;
    } catch { /* Inaccessible and oversized files are deliberately excluded. */ }
  }
  // Follow only direct local imports of selected files; do not crawl the repository.
  for (const file of [...files]) {
    for (const match of file.content.matchAll(/(?:from\s*|import\s*|require\s*\()(['"])(\.[^'"]+)\1/g)) {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file.path), match[2]));
      const name = [base, base + '.js', base + '.ts', base + '.tsx', base + '/index.js', base + '/index.ts'].find(n => candidates.includes(n));
      if (!name || files.some(f => f.path === name) || files.length >= limits.files) continue;
      try {
        const content = await readSafe(root, name);
        if (characters + content.length > limits.characters) continue;
        files.push({ path: name, content });
        characters += content.length;
      } catch { /* Skip unsafe dependencies. */ }
    }
  }
  return { map: ranked.slice(0, 200).map(f => f.name), totalFiles: candidates.length, files, characters };
}

export async function applyEdits(root, edits, allowed) {
  if (!Array.isArray(edits) || !edits.length || edits.length > 20) throw Error('Expected 1–20 edits');
  const staged = new Map();
  const originals = new Map();
  for (const edit of edits) {
    safePath(root, edit.path);
    if (/(lock|secret|credential)/i.test(edit.path) || /(^|\/)AGENTS.md$/.test(edit.path)) throw Error('Protected file');
    if (typeof edit.before !== 'string' || typeof edit.after !== 'string' || edit.after.length > 32000) throw Error('Invalid patch');
    let content = staged.get(edit.path);
    if (content === undefined) {
      try {
        content = await readSafe(root, edit.path);
        if (!allowed.includes(edit.path)) throw Error('Read file before editing: ' + edit.path);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        // Check every existing parent even when the destination does not exist.
        let parent = path.dirname(safePath(root, edit.path));
        while (parent !== path.resolve(root)) {
          try { if ((await fs.lstat(parent)).isSymbolicLink()) throw Error('Symlink parent'); }
          catch (e) { if (e.code !== 'ENOENT') throw e; }
          parent = path.dirname(parent);
        }
        content = '';
      }
    }
    if (!originals.has(edit.path)) originals.set(edit.path, content);
    if (edit.before === '') {
      if (content !== '') throw Error('Empty search only allowed for a new/empty file');
      content = edit.after;
    } else {
      const at = content.indexOf(edit.before);
      if (at < 0 || content.indexOf(edit.before, at + 1) !== -1) throw Error('Patch must match exactly once: ' + edit.path);
      content = content.slice(0, at) + edit.after + content.slice(at + edit.before.length);
    }
    staged.set(edit.path, content);
  }
  // A generated patch cannot weaken gates or add dependencies to get a green result.
  for (const [name, content] of staged) {
    if (path.basename(name) !== 'package.json') continue;
    const before = JSON.parse(originals.get(name) || '{}');
    const after = JSON.parse(content);
    for (const field of ['scripts', 'dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) throw Error('Manifest scripts/dependencies require manual changes');
    }
  }
  // Validate the entire batch before writing any file.
  for (const [name, content] of staged) {
    const target = safePath(root, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  return [...staged.keys()];
}

export function qualityGates(pkg) {
  return ['format:check', 'lint', 'typecheck', 'test', 'build'].map(name => ({
    name, configured: typeof pkg.scripts?.[name] === 'string',
  }));
}

export async function loadSkills(root, task) {
  const names = [];
  if (/css|react|ui|frontend|giao diện/i.test(task)) names.push('frontend');
  if (/api|server|backend|database/i.test(task)) names.push('backend');
  if (/test|bug|fix|lỗi/i.test(task)) names.push('testing');
  return Promise.all(names.map(async name => ({ name, instructions: await fs.readFile(path.join(root, 'skills', name + '.md'), 'utf8') })));
}
