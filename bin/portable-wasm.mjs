import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, brotliDecompressSync, gunzipSync } from 'node:zlib';

// Static hosts need not understand Cloudflare's _headers file. Publish real
// WASM bytes at a new URL; let the CDN handle transport compression normally.
export function preparePortableWasm(root, { compressed = false } = {}) {
  const dir = join(root, 'sdkjs/common/wasm/x2t');
  const packed = readFileSync(join(dir, 'x2t.wasm.br'));
  const magic = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
  const wasm = packed.subarray(0, 8).equals(magic) ? packed
    : packed[0] === 0x1f && packed[1] === 0x8b ? gunzipSync(packed)
    : brotliDecompressSync(packed);
  if (!wasm.subarray(0, 8).equals(magic)) throw new Error('Invalid x2t WASM payload');
  // Docker's preparation marks its HTTP-compatible input with gzip; keep the
  // raw endpoint there rather than introducing Brotli on an insecure origin.
  if (packed[0] === 0x1f && packed[1] === 0x8b) compressed = false;
  const output = compressed ? 'x2t.browser.wasm.br' : 'x2t.wasm';
  const alreadyBrotli = !packed.subarray(0, 8).equals(magic) && !(packed[0] === 0x1f && packed[1] === 0x8b);
  const bytes = compressed ? (alreadyBrotli ? packed : brotliCompressSync(wasm)) : wasm;
  writeFileSync(join(dir, output), bytes);
  if (compressed) rmSync(join(dir, 'x2t.wasm'), { force: true });
  for (const file of [
    'sdkjs/common/wasm/x2t/x2t_helper.js',
    'sdkjs/common/wasm/x2t/x2t.worker.js',
    'sw.js', 'landing-prefetch.js',
  ]) {
    const path = join(root, file);
    if (existsSync(path)) writeFileSync(path, readFileSync(path, 'utf8').replace(/x2t\.(?:browser\.)?wasm(?:\.br)?/g, output));
  }
  console.log(`Prepared x2t engine: ${output} (${bytes.length} bytes)`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  preparePortableWasm(resolve(process.argv[2] || 'dist'), { compressed: process.argv.includes('--compressed') });
}
