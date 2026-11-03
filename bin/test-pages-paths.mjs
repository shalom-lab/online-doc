import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const workspace = resolve('.');
const temp = mkdtempSync(join(tmpdir(), 'pages-paths-'));
const sdkPath = 'web-apps/apps/api/documents/api.js';
try {
  const root = join(temp, 'dist');
  for (const dir of ['web-apps/apps/api/documents', 'sdkjs/common/wasm/x2t']) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  writeFileSync(join(root, sdkPath), readFileSync(join(workspace, 'public', sdkPath)));
  writeFileSync(join(root, 'sdkjs/common/wasm/x2t/x2t.wasm.br'), Buffer.from('0061736d01000000', 'hex'));
  writeFileSync(join(root, 'index.html'), '<script src="/library.js"></script>');
  writeFileSync(join(root, 'library.html'), '<script src="/library.js"></script>');
  writeFileSync(join(root, 'library.js'), '');
  writeFileSync(join(root, 'editor.html'), '<html><head></head><body><script src="/web-apps/apps/api/documents/api.js"></script></body></html>');
  writeFileSync(join(root, 'sw.js'), 'async function isolationPolicyEnabled() {}');
  execFileSync(process.execPath, [join(workspace, 'bin/github-pages.mjs')], { cwd: temp });
  const sdk = readFileSync(join(root, sdkPath), 'utf8');
  const fn = sdk.slice(sdk.indexOf('    function getAppPath('), sdk.indexOf('    function getAppParameters('));
  for (const [documentType, app] of [['word', 'documenteditor'], ['cell', 'spreadsheeteditor'], ['slide', 'presentationeditor']]) {
    const path = runInNewContext(fn + '\ngetAppPath(config)', {
      config: { documentType, type: 'desktop', editorConfig: {} },
      getExtensionPath: () => '',
      getBasePath: () => '/online-doc/web-apps/apps/',
      extendAppPath: (_, path) => path,
      correct_app_type: () => 'desktop',
    });
    assert.equal(path, `/online-doc/web-apps/apps/${app}/main/index.html`);
  }
  assert.match(readFileSync(join(root, 'index.html'), 'utf8'), /src="\/online-doc\/library.js"/);
  assert.match(readFileSync(join(root, 'editor.html'), 'utf8'), /src="\/online-doc\/web-apps\//);
  console.log('PASS: Pages SDK iframe paths and root resource paths');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
