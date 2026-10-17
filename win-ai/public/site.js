(() => {
  const origin = location.origin;
  const base = origin + '/v1';
  document.querySelectorAll('[data-base-url]').forEach(el => { el.textContent = base; });
  document.querySelectorAll('[data-example]').forEach(el => { el.textContent = el.textContent.replaceAll('https://winai.xingzhoufilm.cn', origin); });
  let timer;
  const toast = message => {
    const el = document.querySelector('.toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('visible'), 2400);
  };
  document.querySelectorAll('[data-copy-base]').forEach(button => button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(base); toast('API 地址已复制'); }
    catch { toast('请选中地址手动复制'); }
  }));
  document.querySelectorAll('[data-code-tab]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-code-tab]').forEach(el => {
      const active = el === button;
      el.classList.toggle('active', active);
      el.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-code-panel]').forEach(el => { el.hidden = el.dataset.codePanel !== button.dataset.codeTab; });
  }));
  const status = document.querySelector('[data-site-status]');
  if (status) fetch('/api/status', {cache:'no-store'}).then(r => {if (!r.ok) throw new Error();return r.json();}).then(r => {
    if (!r.success || r.data.system_name !== 'Win AI') throw new Error();
    status.replaceChildren();
    const dot = document.createElement('span');dot.className = 'dot';
    status.append(dot, document.createTextNode('站点已连接 · 模型开放情况以控制台为准'));
  }).catch(() => {status.textContent = '暂时无法读取站点状态，请稍后重试。';});
})();
