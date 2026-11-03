import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync, brotliDecompressSync } from 'node:zlib';
import { preparePortableWasm } from './portable-wasm.mjs';

const temp = mkdtempSync(join(tmpdir(), 'portable-wasm-'));
try {
  const dir = join(temp, 'sdkjs/common/wasm/x2t');
  mkdirSync(dir, { recursive: true });
  const wasm = Buffer.from('0061736d01000000', 'hex');
  for (const payload of [brotliCompressSync(wasm), gzipSync(wasm), wasm]) {
    writeFileSync(join(dir, 'x2t.wasm.br'), payload);
    for (const name of ['x2t_helper.js', 'x2t.worker.js']) {
      writeFileSync(join(dir, name), "const url = 'x2t.wasm.br';");
    }
    writeFileSync(join(temp, 'sw.js'), "const url = '/sdkjs/common/wasm/x2t/x2t.wasm.br';");
    preparePortableWasm(temp);
    assert.deepEqual(readFileSync(join(dir, 'x2t.wasm')), wasm);
    assert(WebAssembly.validate(readFileSync(join(dir, 'x2t.wasm'))));
    for (const file of ['x2t_helper.js', 'x2t.worker.js']) {
      assert.doesNotMatch(readFileSync(join(dir, file), 'utf8'), /wasm\.br/);
    }
    assert.doesNotMatch(readFileSync(join(temp, 'sw.js'), 'utf8'), /wasm\.br/);
    preparePortableWasm(temp);
    assert.deepEqual(readFileSync(join(dir, 'x2t.wasm')), wasm, 'Repeated preparation is safe');
  }
  const vendor = readFileSync('public/sdkjs/common/wasm/x2t/x2t.wasm.br');
  writeFileSync(join(dir, 'x2t.wasm.br'), vendor);
  preparePortableWasm(temp);
  const decoded = readFileSync(join(dir, 'x2t.wasm'));
  assert.deepEqual(decoded, brotliDecompressSync(vendor));
  assert(WebAssembly.validate(decoded), 'Real vendored engine must be valid WASM');
  preparePortableWasm(temp, { compressed: true });
  const compressed = readFileSync(join(dir, 'x2t.browser.wasm.br'));
  assert(compressed.length < 25 * 1024 ** 2, 'EO engine must fit the upload limit');
  assert(!existsSync(join(dir, 'x2t.wasm')), 'EO artifact must not contain the 40 MiB raw file');
  assert.deepEqual(brotliDecompressSync(compressed), decoded);
  assert.match(readFileSync(join(dir, 'x2t.worker.js'), 'utf8'), /x2t\.browser\.wasm\.br/);
  const config = JSON.parse(readFileSync('edgeone.json', 'utf8'));
  const headers = config.headers.find(rule => rule.source.endsWith('/x2t.browser.wasm.br')).headers;
  assert(headers.some(header => header.key === 'Content-Encoding' && header.value === 'br'));
  preparePortableWasm(temp);
  assert.match(readFileSync(join(dir, 'x2t.worker.js'), 'utf8'), /'x2t\.wasm'/);
  console.log(`PASS: EO compressed artifact ${compressed.length} bytes, decoded bytes identical, GitHub conversion preserved`);
  console.log(`PASS: Brotli/gzip/raw conversion, cache URLs, idempotence and real engine (${decoded.length} bytes)`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
