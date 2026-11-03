// Run after the upstream production build. GitHub Pages has no custom headers.
import { readFileSync, writeFileSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { secureEditorHtml } from './editor-csp.mjs';
const root = 'dist',
  base = '/online-doc/';
const wasm = join(root, 'sdkjs/common/wasm/x2t/x2t.wasm.br');
const bytes = readFileSync(wasm);
if (bytes[0] !== 0 || bytes[1] !== 97) writeFileSync(wasm, brotliDecompressSync(bytes));
// Prefix literal origin-root resource paths, including the vendored iframe URLs.
const roots = [...readdirSync(root), 'editor', 'history']
  .map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');
const pattern = new RegExp('(["\x27`(=])/(?=(?:' + roots + ')(?=[/"\x27`?#)\\s]|$))', 'g');
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(html|js|css|json)$/.test(p)) {
      // This SDK derives its base from its own script URL. Its /index.html
      // strings are suffixes appended to that base, not origin-root URLs.
      if (p === join(root, 'web-apps/apps/api/documents/api.js')) continue;
      let s = readFileSync(p, 'utf8');
      s = s.replace(pattern, (_, q) => q + base);
      writeFileSync(p, s);
    }
  }
}
walk(root);
copyFileSync(join(root, 'library.html'), join(root, 'index.html'));
copyFileSync(join(root, 'library.html'), join(root, '404.html'));
const editor = join(root, 'editor.html');
writeFileSync(
  editor,
  secureEditorHtml(readFileSync(editor, 'utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i, '')),
);
// Always provide isolation on this headerless host, including cached iframes.
const sw = join(root, 'sw.js');
writeFileSync(
  sw,
  readFileSync(sw, 'utf8').replace(
    'async function isolationPolicyEnabled() {',
    'async function isolationPolicyEnabled() { return true;',
  ),
);
writeFileSync(join(root, '.nojekyll'), '');
console.log('Prepared GitHub Pages artifact at ' + base);
