'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const root = document.documentElement;
  let theme;
  try { theme = localStorage.getItem('mf-theme'); } catch (_) { /* Private mode. */ }
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  $('#theme-toggle')?.addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('mf-theme', root.dataset.theme); } catch (_) { /* Optional preference. */ }
  });
  document.querySelectorAll('img').forEach(img => {
    const failed = () => {
      if (img.classList.contains('avatar')) img.classList.add('image-error');
      else img.alt = img.alt || '图片暂时无法加载';
    };
    img.addEventListener('error', failed);
    if (img.complete && !img.naturalWidth) failed();
  });
  const filters = [...document.querySelectorAll('[data-filter]')];
  function filter(category) {
    let count = 0;
    document.querySelectorAll('.journal .post-card').forEach(card => {
      card.hidden = category !== 'all' && card.dataset.category !== category;
      if (!card.hidden) count++;
    });
    filters.forEach(button => {
      const active = button.dataset.filter === category;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if ($('#filter-empty')) $('#filter-empty').hidden = count > 0;
  }
  filters.forEach(button => button.addEventListener('click', () => filter(button.dataset.filter)));
  const category = new URLSearchParams(location.search).get('category');
  if (category && filters.some(b => b.dataset.filter === category)) filter(category);

  const dialog = $('#search-dialog');
  const input = $('#search-input');
  const status = $('#search-status');
  const results = $('#search-results');
  let indexPromise;
  function openSearch() { if (!dialog.open) dialog.showModal(); input.focus(); }
  $('#search-open')?.addEventListener('click', openSearch);
  $('#search-close')?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('click', e => { if (e.target === dialog && (e.clientX < dialog.getBoundingClientRect().left || e.clientX > dialog.getBoundingClientRect().right || e.clientY < dialog.getBoundingClientRect().top || e.clientY > dialog.getBoundingClientRect().bottom)) dialog.close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && dialog?.open) { e.preventDefault(); dialog.close(); return; } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); } });
  input?.addEventListener('input', async () => {
    const query = input.value.trim().toLocaleLowerCase();
    results.replaceChildren();
    if (!query) { status.textContent = '输入关键词，寻找一篇文字。'; return; }
    status.textContent = '正在翻阅…';
    try {
      indexPromise ||= fetch('/search.json').then(r => { if (!r.ok) throw Error('索引加载失败'); return r.json(); }).catch(e => { indexPromise = null; throw e; });
      const index = await indexPromise;
      if (input.value.trim().toLocaleLowerCase() !== query) return;
      const matches = index.filter(p => [p.title, p.text, p.category, ...p.tags].join(' ').toLocaleLowerCase().includes(query));
      results.replaceChildren();
      status.textContent = matches.length ? `找到 ${matches.length} 篇文字` : '没有找到。试试更短的关键词。';
      for (const p of matches.slice(0, 40)) {
        const a = document.createElement('a'); a.href = p.url;
        const title = document.createElement('strong'); title.textContent = p.title;
        const detail = document.createElement('small'); detail.textContent = `${p.date} · ${p.category} · ${p.description}`;
        a.append(title, detail); results.append(a);
      }
    } catch (_) { status.textContent = '暂时无法读取搜索索引，请检查网络后重试。'; }
  });
  document.querySelectorAll('.prose pre').forEach(pre => {
    const code = pre.querySelector('code') || pre;
    const text = code.textContent;
    const button = document.createElement('button'); button.className = 'copy-code'; button.textContent = '复制';
    button.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); button.textContent = '已复制'; }
      catch (_) { button.textContent = '请手动选择复制'; }
      setTimeout(() => button.textContent = '复制', 1600);
    });
    pre.prepend(button);
  });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        document.querySelectorAll('.toc nav a').forEach(a => a.classList.toggle('current', decodeURIComponent(a.hash.slice(1)) === entry.target.id));
      }
    }, { rootMargin: '-10% 0px -65% 0px' });
    document.querySelectorAll('#article-body h2, #article-body h3').forEach(h => observer.observe(h));
  }
  document.querySelectorAll('.comment-load').forEach(button => button.addEventListener('click', async () => {
    const section = button.closest('.comments');
    const info = section.querySelector('.comment-status');
    button.disabled = true; info.textContent = '正在连接原站评论服务…';
    try {
      if (!section.dataset.env) throw Error('评论服务未配置');
      if (!window.twikoo) await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/twikoo@1.6.17/dist/twikoo.all.min.js';
        const timer = setTimeout(() => { script.remove(); reject(Error('连接超时')); }, 15000);
        script.onload = () => { clearTimeout(timer); resolve(); };
        script.onerror = () => { clearTimeout(timer); script.remove(); reject(Error('加载失败')); };
        document.head.append(script);
      });
      await window.twikoo.init({ envId: section.dataset.env, el: '#twikoo', path: section.dataset.path, lang: 'zh-CN' });
      button.hidden = true; info.textContent = '';
    } catch (_) { button.disabled = false; info.textContent = '原站评论服务暂时不可用，正文阅读不受影响。可以稍后重试。'; }
  }));
})();
