import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const events = new Map();
const timers = new Set();
let panel;
let visible = false;
function element() {
  return { style: {}, children: [], setAttribute() {}, append(...children) { this.children.push(...children); }, remove() { visible = false; } };
}
const now = Date.now();
const resource = { startTime: 1, encodedBodySize: 1048576 };
const performance = { timeOrigin: now - 1000, getEntriesByType: () => [resource] };
const window = {
  performance,
  frames: [{ performance, frames: [] }],
  addEventListener: (name, callback) => events.set(name, callback),
};
runInNewContext(readFileSync('public/editor-progress.js', 'utf8'), {
  document: { createElement: element, body: { append(node) { panel = node; visible = true; } } },
  window, performance, location: { search: '?new=docx' }, URLSearchParams, Date,
  setInterval: callback => { timers.add(callback); return callback; },
  clearInterval: callback => timers.delete(callback),
});
assert(visible, 'Cold editor shows progress before the app bundle');
assert.match(panel.children[3].textContent, /2 个资源 · 2.0 MB/);
events.get('editor:app-ready')();
assert.match(panel.children[1].textContent, /解析文档/);
events.get('document:content-ready')();
assert.equal(visible, false);
assert.equal(timers.size, 0, 'Ready cleans up resource polling');
events.get('editor:load-start')();
assert(visible, 'Opening another document restarts progress');
assert.match(panel.children[3].textContent, /0 个资源/, 'Prior downloads are not counted again');
events.get('editor:load-error')();
assert.match(panel.children[1].textContent, /失败/);
assert.equal(panel.children[2].hidden, true);
assert.equal(timers.size, 0);
panel.children[0].onclick();
assert.equal(visible, false);
console.log('PASS: editor progress resources, lifecycle, errors and cleanup');
