// Loaded before the application bundle so a cold editor never looks blank.
(() => {
  const panel = document.createElement('aside');
  panel.setAttribute('aria-label', '编辑器加载状态');
  panel.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:10002;width:min(420px,calc(100vw - 48px));box-sizing:border-box;padding:18px 20px;background:#fff;color:#222;border:1px solid #ddd;border-radius:12px;box-shadow:0 8px 32px #0002;font:14px/1.6 system-ui';
  const title = document.createElement('strong');
  title.setAttribute('role', 'status');
  const bar = document.createElement('progress');
  bar.setAttribute('aria-label', '编辑器正在加载，资源总量未知');
  bar.style.cssText = 'display:block;width:100%;height:8px;margin:12px 0';
  const detail = document.createElement('div');
  const hint = document.createElement('div');
  hint.style.cssText = 'color:#666;font-size:12px;margin-top:6px';
  const close = document.createElement('button');
  close.textContent = '收起';
  close.style.cssText = 'float:right;cursor:pointer';
  panel.append(close, title, bar, detail, hint);
  let timer;
  let started = 0;
  let cutoff = 0;
  function stop() {
    clearInterval(timer);
    panel.remove();
  }
  close.onclick = stop;
  function update() {
    let count = 0;
    let bytes = 0;
    function collect(win) {
      try {
        for (const entry of win.performance.getEntriesByType('resource')) {
          if (win.performance.timeOrigin + entry.startTime < cutoff) continue;
          count++;
          bytes += entry.encodedBodySize || 0;
        }
        for (let i = 0; i < win.frames.length; i++) collect(win.frames[i]);
      } catch { /* Cross-origin frames do not expose resource timings. */ }
    }
    collect(window);
    const seconds = Math.floor((Date.now() - started) / 1000);
    detail.textContent = `已加载 ${count} 个资源 · ${(bytes / 1048576).toFixed(1)} MB · 已等待 ${seconds} 秒`;
    hint.textContent = seconds >= 30
      ? '首次打开需要加载较大的编辑器资源；缓存资源也计入上方统计。总量未知，暂不显示百分比。'
      : '正在加载编辑器资源（含缓存），随后初始化文档。';
    if (seconds >= 120) {
      title.textContent = '加载时间较长';
      hint.textContent = '可以继续等待；若一直未打开，请检查网络或刷新重试。';
    }
  }
  function start(initial = false) {
    clearInterval(timer);
    started = Date.now();
    cutoff = initial ? performance.timeOrigin : started;
    title.textContent = '正在加载编辑器…';
    bar.hidden = false;
    bar.style.display = 'block';
    document.body.append(panel);
    update();
    timer = setInterval(update, 1000);
  }
  window.addEventListener('editor:load-start', () => start());
  window.addEventListener('editor:app-ready', () => {
    title.textContent = '编辑器已就绪，正在解析文档…';
  });
  window.addEventListener('document:content-ready', stop);
  window.addEventListener('editor:load-error', () => {
    clearInterval(timer);
    title.textContent = '文档加载失败';
    bar.hidden = true;
    bar.style.display = 'none';
    hint.textContent = '请查看错误提示，检查网络后重新打开文档。';
  });
  window.addEventListener('pagehide', stop);
  const query = new URLSearchParams(location.search);
  if (['new', 'file', 'src', 'open', 'embed'].some(key => query.has(key))) start(true);
})();
