import fs from 'node:fs/promises';

// Explicit allowlist: never upload runtime workspaces or credentials as assets.
await fs.mkdir('dist', { recursive: true });
for (const file of ['index.html', 'style.css', 'app.js']) {
  await fs.copyFile('public/' + file, 'dist/' + file);
}
await fs.copyFile('deploy/hosted-demo.js', 'dist/hosted-demo.js');
const html = await fs.readFile('dist/index.html', 'utf8');
await fs.writeFile('dist/index.html', html.replace('<script src="/app.js" defer>', '<script src="/hosted-demo.js" defer></script><script src="/app.js" defer>'));
console.log('Built static dashboard in dist/ (demo only; no API keys or backend).');
