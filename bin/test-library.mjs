import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const dom = new JSDOM(readFileSync('public/library.html', 'utf8'), {
  url: 'https://example.test/online-doc/',
  runScripts: 'outside-only',
});
const w = dom.window;
w.crossOriginIsolated = true;
w.confirm = () => true;
w.TextEncoder = TextEncoder;
w.localStorage.setItem('gh-online-doc-repo', 'owner/data');
w.localStorage.setItem('gh-online-doc-token', 'test-token');
const calls = [];
w.fetch = async (url, opts) => {
  calls.push({ url, opts });
  return {
    ok: true,
    status: 200,
    json: async () =>
      url.endsWith('/data/')
        ? { default_branch: 'main' }
        : {
            tree: [
              { type: 'blob', path: '中文.docx' },
              { type: 'blob', path: 'ignored.exe' },
            ],
          },
  };
};
w.eval(
  readFileSync('public/library.js', 'utf8') + '\nwindow.testAPI={api,put,encode,getState:()=>({repo,token,entries})};',
);
await new Promise((r) => setTimeout(r, 30));
assert.equal(w.document.querySelectorAll('#files button').length, 1);
assert.equal(w.document.querySelector('#files button').textContent, '中文.docx');
assert.equal(w.testAPI.getState().repo, 'owner/data');
assert(calls.every((c) => c.url.startsWith('https://api.github.com/repos/owner/data/')));
assert(calls.every((c) => c.opts.headers.Authorization === 'Bearer test-token'));
const text = '中文文档';
assert.equal(Buffer.from(w.testAPI.encode(new TextEncoder().encode(text)), 'base64').toString(), text);
await w.testAPI.put(new Blob([text]), '中文.docx', 'original-sha');
const body = JSON.parse(calls.at(-1).opts.body);
assert.equal(body.sha, 'original-sha');
assert.equal(body.branch, 'main');
assert.equal(Buffer.from(body.content, 'base64').toString(), text);
w.fetch = async () => ({ ok: false, status: 409 });
await assert.rejects(() => w.testAPI.put(new Blob([text]), '中文.docx', 'old'), /其他设备修改/);
w.fetch = async () => ({ ok: false, status: 403 });
await assert.rejects(() => w.testAPI.api(''), /Contents/);
dom.window.close();
console.log('PASS: BYOK bootstrap, file filtering, Unicode, SHA writes, 409 conflict, 403 permissions');
