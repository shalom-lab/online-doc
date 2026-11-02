const $ = (id) => document.getElementById(id);
let repo = localStorage.getItem('gh-online-doc-repo') || '',
  token = localStorage.getItem('gh-online-doc-token') || '';
let branch = '',
  entries = [],
  current = null,
  dirty = false,
  busy = false,
  ready = false,
  changeVersion = 0;
const pending = new Map();
// Pages cannot set COOP/COEP headers; the upstream worker can supply them.
if ('serviceWorker' in navigator && !crossOriginIsolated) {
  navigator.serviceWorker
    .register('./sw.js?isolation=1')
    .then(() => navigator.serviceWorker.ready)
    .then(() => {
      if (!sessionStorage.getItem('online-doc-isolation-reload')) {
        sessionStorage.setItem('online-doc-isolation-reload', '1');
        if (navigator.serviceWorker.controller) location.reload();
        else navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
      }
    })
    .catch(() => {});
}
let toastTimer;
const toast = document.createElement('div');
toast.id = 'toast'; toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); toast.hidden = true;
document.body.append(toast);
const status = (s) => {
  $('status').textContent = s;
  const host = $('config').open ? $('config') : document.body;
  host.append(toast); toast.textContent = s; toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
};
const path = (p) => p.split('/').map(encodeURIComponent).join('/');
function guard() {
  return !dirty || confirm('当前修改尚未提交，确定放弃？');
}
async function api(p, options = {}) {
  if (!repo || !token) throw Error('请先配置数据仓和 Token');
  const r = await fetch(`https://api.github.com/repos/${repo}/${p}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(120000),
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!r.ok)
    throw Error(
      {
        401: 'Token 无效或已过期',
        403: '没有权限或达到 API 限流，请检查 Contents 读写权限',
        404: '仓库、分支或文件不存在，请检查访问权限',
        409: '文件已被其他设备修改，请备份当前内容后重新打开',
        422: '提交失败：路径已存在或参数不合法',
      }[r.status] || `GitHub 请求失败（${r.status}）`,
    );
  return r.status === 204 ? null : options.raw ? r.arrayBuffer() : r.json();
}
async function run(fn) {
  if (busy) return;
  if (!repo || !token) { status('尚未连接数据仓，请点击右上角「仓库设置」填写仓库和 Token。'); return; }
  busy = true;
  $('status').textContent = '正在处理，请稍候…';
  document.querySelector('main').setAttribute('aria-busy', 'true');
  document.querySelectorAll('button').forEach((b) => (b.disabled = true));
  try {
    await fn();
  } catch (e) {
    status(e.message);
  } finally {
    busy = false;
    document.querySelector('main').setAttribute('aria-busy', 'false');
    document.querySelectorAll('button').forEach((b) => (b.disabled = false));
  }
}
function render() {
  $('repoLabel').textContent = repo || '尚未设置数据仓';
  $('files').replaceChildren();
  for (const f of entries.filter((f) => f.path.toLowerCase().includes($('search').value.toLowerCase()))) {
    const b = document.createElement('button');
    b.textContent = f.path;
    b.onclick = () => run(() => open(f));
    $('files').append(b);
  }
}
async function refresh() {
  const meta = await api('');
  branch = meta.default_branch;
  let tree;
  try {
    tree = await api(`git/trees/${encodeURIComponent(branch)}?recursive=1`);
  } catch (e) {
    throw Error('无法读取数据仓，请先在 GitHub 初始化一个 README，并检查权限。');
  }
  if (tree.truncated) throw Error('数据仓目录过大，列表被截断，请使用较小的专用数据仓');
  entries = tree.tree.filter((x) => x.type === 'blob' && /\.(docx|xlsx|pptx|pdf)$/i.test(x.path));
  render();
  status(`已连接 ${repo} · ${entries.length} 个文档`);
}
function message(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error('编辑器响应超时，请稍后重试'));
    }, 120000);
    pending.set(id, { resolve, reject, timer });
    $('editor').contentWindow.postMessage({ id, type, payload }, location.origin);
  });
}
function mount(query = '') {
  ready = false;
  const frame = $('editor');
  frame.hidden = false;
  $('empty').hidden = true;
  frame.src = `editor.html?embed=1&locale=zh-CN&embedOrigin=${encodeURIComponent(location.origin)}${query}`;
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const t = setInterval(() => {
      if (ready) {
        clearInterval(t);
        resolve();
      } else if (Date.now() - start > 120000) {
        clearInterval(t);
        reject(Error('编辑器加载超时'));
      }
    }, 100);
  });
}
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.source !== $('editor').contentWindow) return;
  const m = e.data;
  if (!m || typeof m !== 'object') return;
  if (m.type === 'document:ready') ready = true;
  if (m.type === 'document:dirty-changed') {
    dirty = dirty || m.payload.dirty;
    if (m.payload.dirty) changeVersion++;
  }
  const p = pending.get(m.id);
  if (p) {
    clearTimeout(p.timer);
    pending.delete(m.id);
    m.type === 'document:error' ? p.reject(Error(m.payload.message)) : p.resolve(m.payload);
  }
});
async function open(f) {
  if (!guard()) return;
  status('正在读取文件并加载编辑器…');
  const data = await api(`contents/${path(f.path)}?ref=${encodeURIComponent(branch)}`);
  if (data.size > 20 * 1024 * 1024) throw Error('当前限制为 20 MB，请选择较小文档');
  const payload =
    data.encoding === 'base64' && data.content
      ? { base64: data.content }
      : { base64: (await api('git/blobs/' + encodeURIComponent(data.sha))).content };
  current = null;
  await mount();
  await message('document:open', { ...payload, fileName: f.path.split('/').pop() });
  current = { path: f.path, sha: data.sha };
  dirty = false;
  $('title').textContent = f.path;
  status('已打开，可预览或编辑；点击提交保存写入数据仓。');
}
function encode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
async function put(file, p, sha) {
  if (file.size > 20 * 1024 * 1024) throw Error('当前版本限制文件小于 20 MB');
  const content = encode(new Uint8Array(await file.arrayBuffer()));
  return api(`contents/${path(p)}`, {
    method: 'PUT',
    body: JSON.stringify({ message: `docs: ${sha ? '更新' : '新增'} ${p}`, content, branch, ...(sha ? { sha } : {}) }),
  });
}
$('settings').onclick = () => {
  if (!guard()) return;
  $('repo').value = repo;
  $('token').value = '';
  $('token').placeholder = token ? '已保存（留空保留）' : '仅存于当前浏览器';
  $('config').showModal();
};
$('persist').onclick = () => {
  const r = $('repo').value.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(r)) {
    status('仓库格式应为 owner/repo');
    return;
  }
  if (!($('token').value.trim() || token)) { status('请填写 GitHub Token 后再保存；也可以直接取消。'); $('token').focus(); return; }
  repo = r;
  token = $('token').value.trim() || token;
  localStorage.setItem('gh-online-doc-repo', repo);
  localStorage.setItem('gh-online-doc-token', token);
  current = null;
  dirty = false;
  entries = [];
  render();
  $('config').close();
  run(refresh);
};
$('clear').onclick = () => {
  if (!confirm('确定清除本机仓库和 Token 设置？')) return;
  localStorage.removeItem('gh-online-doc-repo');
  localStorage.removeItem('gh-online-doc-token');
  location.reload();
};
$('refresh').onclick = () => run(refresh);
$('search').oninput = render;
$('create').onclick = () =>
  run(async () => {
    if (!guard()) return;
    if (!branch) await refresh();
    const p = prompt('输入新文件路径（支持 .docx、.xlsx、.pptx）', '文档/未命名.docx');
    if (!p) return;
    if (!/\.(docx|xlsx|pptx)$/i.test(p) || p.startsWith('/') || p.split('/').some((x) => !x || x === '.' || x === '..'))
      throw Error('请输入有效的 Office 文件路径');
    if (entries.some((f) => f.path === p)) throw Error('该文件已存在');
    current = null;
    await mount(`&new=${p.split('.').pop().toLowerCase()}`);
    current = { path: p };
    dirty = true;
    $('title').textContent = p;
    status('新文档已打开，编辑完成后点击提交保存。');
  });
$('upload').onclick = () => { if (!repo || !token) { status('请先在「仓库设置」中连接数据仓，再上传文件。'); return; } $('picker').click(); };
$('picker').onchange = () =>
  run(async () => {
    const f = $('picker').files[0];
    if (!f) return;
    if (!/\.(docx|xlsx|pptx|pdf)$/i.test(f.name)) throw Error('请选择 Office 或 PDF 文档');
    if (!branch) await refresh();
    await put(f, f.name);
    await refresh();
    $('picker').value = '';
  });
$('save').onclick = () =>
  run(async () => {
    if (!current) throw Error('请先打开或新建文档');
    status('正在导出并提交…');
    const data = await message('document:save');
    const version = changeVersion;
    dirty = true;
    const result = await put(data.file, current.path, current.sha);
    current.sha = result.content.sha;
    dirty = Boolean(data.dirty) || changeVersion !== version;
    if (!entries.some((f) => f.path === current.path)) {
      entries.push({ path: current.path, type: 'blob' });
      render();
    }
    status('提交成功，文档已保存到 GitHub 数据仓。');
  });
$('preview').onclick = () =>
  run(async () => {
    if (!current) throw Error('请先从左侧打开文档，再预览。');
    await message('document:set-readonly', { readonly: true });
    status('已切换为只读预览');
  });
$('edit').onclick = () =>
  run(async () => {
    if (!current) throw Error('请先打开或新建文档，再编辑。');
    await message('document:set-readonly', { readonly: false });
    status('已切换为编辑模式');
  });
$('delete').onclick = () =>
  run(async () => {
    if (!current?.sha) throw Error('请先打开已有文档');
    if (!confirm(`确定从数据仓删除 ${current.path}？`)) return;
    await api(`contents/${path(current.path)}`, {
      method: 'DELETE',
      body: JSON.stringify({ message: `docs: 删除 ${current.path}`, sha: current.sha, branch }),
    });
    current = null;
    dirty = false;
    $('editor').hidden = true;
    $('editor').src = 'about:blank';
    $('empty').hidden = false;
    await refresh();
  });
window.addEventListener('beforeunload', (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
render();
if (repo && token) run(refresh);


// Cancel must never submit or validate the settings form.
$('cancel-settings').onclick = () => $('config').close();

