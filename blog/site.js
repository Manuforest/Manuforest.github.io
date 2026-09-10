'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const root = document.documentElement;
  const motion = window.BlogMotion;
  try {
    const theme = localStorage.getItem('mf-theme');
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  } catch (_) { /* Storage preferences are optional. */ }
  $('#theme-toggle')?.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('mf-theme', root.dataset.theme); } catch (_) { /* Optional. */ }
  });
  const filters = [...document.querySelectorAll('[data-filter]')];
  const rows = [...document.querySelectorAll('.journal .post-entry')];
  function filter(category, instant = false) {
    if (!filters.some(button => button.dataset.filter === category)) category = 'all';
    let count = 0;
    if (motion) count = motion.filterRows(rows, category, instant);
    else rows.forEach(row => { row.hidden = category !== 'all' && row.dataset.category !== category; if (!row.hidden) count++; });
    filters.forEach(button => {
      const selected = button.dataset.filter === category;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
      if (selected) motion?.moveMarker(button, instant);
    });
    if ($('#filter-empty')) $('#filter-empty').hidden = count > 0;
    if ($('#filter-status')) $('#filter-status').textContent = `${count} 篇文章`;
  }
  filters.forEach(button => button.addEventListener('click', () => {
    filter(button.dataset.filter);
    const url = new URL(location.href);
    if (button.dataset.filter === 'all') url.searchParams.delete('category');
    else url.searchParams.set('category', button.dataset.filter);
    history.replaceState(null, '', url);
  }));
  if (filters.length) {
    const initial = new URLSearchParams(location.search).get('category');
    if (initial) filter(initial, true);
    else motion?.moveMarker(filters[0], true);
    if ('ResizeObserver' in window) new ResizeObserver(() => motion?.moveMarker($('.filter.active'), true)).observe($('.filters'));
    document.fonts?.ready.then(() => motion?.moveMarker($('.filter.active'), true));
    addEventListener('popstate', () => filter(new URLSearchParams(location.search).get('category') || 'all', true));
  }
  const dialog = $('#search-dialog'), input = $('#search-input');
  const status = $('#search-status'), results = $('#search-results');
  let indexPromise, transition = 0, queryVersion = 0;
  function openSearch() {
    transition++;
    if (!dialog.open) dialog.showModal();
    motion?.openDialog(dialog);
    input.focus();
  }
  async function closeSearch() {
    const version = ++transition;
    if (motion) await motion.closeDialog(dialog);
    if (transition === version && dialog.open) dialog.close();
  }
  $('#search-open')?.addEventListener('click', openSearch);
  $('#search-close')?.addEventListener('click', closeSearch);
  dialog?.addEventListener('cancel', event => { event.preventDefault(); closeSearch(); });
  dialog?.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeSearch();
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
  });
  async function search() {
    const version = ++queryVersion;
    const query = input.value.trim().toLocaleLowerCase();
    results.replaceChildren();
    if (!query) { status.textContent = ''; return; }
    status.textContent = '正在搜索…';
    try {
      indexPromise ||= fetch('/search.json').then(response => {
        if (!response.ok) throw Error('index');
        return response.json();
      }).catch(error => { indexPromise = null; throw error; });
      const index = await indexPromise;
      if (version !== queryVersion) return;
      const matches = index.filter(post => [post.title, post.text, post.category, ...(post.tags || [])].join(' ').toLocaleLowerCase().includes(query));
      status.textContent = matches.length ? `${matches.length} 篇文章` : '没有匹配的文章';
      for (const post of matches.slice(0, 40)) {
        if (!post.url?.startsWith('/') || post.url.startsWith('//')) continue;
        const link = document.createElement('a'); link.href = post.url;
        const title = document.createElement('strong'); title.textContent = post.title;
        const detail = document.createElement('small'); detail.textContent = `${post.date} · ${post.category} · ${post.description}`;
        link.append(title, detail); results.append(link);
      }
    } catch (_) { if (version === queryVersion) status.textContent = '搜索索引加载失败，请重试'; }
  }
  input?.addEventListener('input', event => { if (!event.isComposing) search(); });
  input?.addEventListener('compositionend', search);
  document.querySelectorAll('.prose pre').forEach(pre => {
    const text = (pre.querySelector('code') || pre).textContent;
    const button = document.createElement('button'); button.className = 'copy-code'; button.textContent = '复制';
    button.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); button.textContent = '已复制'; }
      catch (_) { button.textContent = '请手动复制'; }
      setTimeout(() => { button.textContent = '复制'; }, 1600);
    });
    pre.prepend(button);
  });
  if ('IntersectionObserver' in window) {
    const links = [...document.querySelectorAll('.toc nav a')];
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) links.forEach(link => {
        let id; try { id = decodeURIComponent(link.hash.slice(1)); } catch (_) { id = ''; }
        link.classList.toggle('current', id === entry.target.id);
      });
    }, { rootMargin: '-20% 0px -60% 0px' });
    document.querySelectorAll('#article-body h2, #article-body h3').forEach(heading => observer.observe(heading));
  }
  document.querySelectorAll('.comment-load').forEach(button => button.addEventListener('click', async () => {
    const section = button.closest('.comments'), info = section.querySelector('.comment-status');
    button.disabled = true; info.textContent = '正在加载…';
    try {
      if (!section.dataset.env) throw Error('Not configured');
      if (!window.twikoo) await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/twikoo@1.6.17/dist/twikoo.all.min.js';
        const timer = setTimeout(() => { script.remove(); reject(Error('Timeout')); }, 15000);
        script.onload = () => { clearTimeout(timer); resolve(); };
        script.onerror = () => { clearTimeout(timer); script.remove(); reject(Error('Load failed')); };
        document.head.append(script);
      });
      await window.twikoo.init({ envId: section.dataset.env, el: '#twikoo', path: section.dataset.path, lang: 'zh-CN' });
      button.hidden = true; info.textContent = '';
    } catch (_) { button.disabled = false; info.textContent = '评论服务暂时不可用，请稍后重试'; }
  }));
})();
