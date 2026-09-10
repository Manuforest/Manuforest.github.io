'use strict';
/* Progressive enhancement: content is visible without JavaScript.
   Motion-web vocabulary adapted to native scroll + Web Animations. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 680px)');
  const active = new Map();
  const seen = new WeakSet();
  const ease = 'cubic-bezier(.22, 1, .36, 1)';
  function cancel(element) {
    const animation = active.get(element);
    if (animation) { active.delete(element); animation.cancel(); }
  }
  function animate(element, frames, options = {}) {
    if (!element) return Promise.resolve();
    cancel(element);
    if (reduced.matches || typeof element.animate !== 'function') return Promise.resolve();
    const animation = element.animate(frames, {
      duration: mobile.matches ? 200 : 360, easing: ease, fill: 'both', ...options
    });
    active.set(element, animation);
    return animation.finished.catch(() => {}).then(() => {
      if (active.get(element) === animation) {
        active.delete(element);
        animation.cancel();
      }
    });
  }
  function reveal(element, delay = 0) {
    if (seen.has(element) || element.hidden) return;
    seen.add(element);
    animate(element, [
      { opacity: 0, transform: `translateY(${mobile.matches ? 0 : 10}px)` },
      { opacity: 1, transform: 'translateY(0)' }
    ], { delay, duration: mobile.matches ? 200 : 420 });
  }
  function moveMarker(button, instant = false) {
    if (!button) return;
    const group = button.closest('.filters');
    const marker = group?.querySelector('.filter-marker');
    if (!marker) return;
    const previous = getComputedStyle(marker).transform;
    const initialized = group.classList.contains('has-marker');
    cancel(marker);
    const next = `translateX(${button.offsetLeft}px) scaleX(${button.offsetWidth})`;
    marker.style.transform = next;
    group.classList.add('has-marker');
    if (initialized && !instant) animate(marker, [
      { transform: previous === 'none' ? next : previous }, { transform: next }
    ], { duration: 280 });
  }
  function filterRows(rows, category, instant = false) {
    // Apply logical state synchronously. Rapid clicks never let an old callback
    // restore stale visibility; remaining rows animate from measured positions.
    const before = new Map(rows.filter(row => !row.hidden).map(row => [row, row.getBoundingClientRect()]));
    rows.forEach(cancel);
    rows.forEach(row => { row.hidden = category !== 'all' && row.dataset.category !== category; });
    let count = 0;
    rows.forEach(row => {
      if (row.hidden) return;
      count++;
      seen.add(row);
      if (instant) return;
      const prior = before.get(row), after = row.getBoundingClientRect();
      const y = mobile.matches ? 0 : prior ? prior.top - after.top : 8;
      if (after.bottom < 0 || after.top > innerHeight + 60) return;
      animate(row, [
        { opacity: prior ? 1 : 0, transform: `translateY(${y}px)` },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: mobile.matches ? 160 : 300 });
    });
    return count;
  }
  function stopAll() { [...active.keys()].forEach(cancel); }
  reduced.addEventListener('change', () => { if (reduced.matches) stopAll(); });
  addEventListener('beforeprint', stopAll);
  addEventListener('pagehide', stopAll);
  addEventListener('pageshow', event => { if (event.persisted) stopAll(); });
  document.querySelectorAll('[data-enter]').forEach((element, i) => reveal(element, Math.min(i, 3) * 55));
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      let index = 0;
      for (const entry of entries) if (entry.isIntersecting && !entry.target.hidden) {
        reveal(entry.target, Math.min(index++, 3) * 45);
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.05 });
    document.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element));
  }
  const header = document.querySelector('.header-wrap');
  let pending = false;
  const syncHeader = () => { pending = false; header?.classList.toggle('scrolled', scrollY > 16); };
  addEventListener('scroll', () => { if (!pending) { pending = true; requestAnimationFrame(syncHeader); } }, { passive: true });
  syncHeader();
  window.BlogMotion = {
    animate, cancel, filterRows, moveMarker,
    openDialog: dialog => animate(dialog, [
      { opacity: 0, transform: `translateY(${mobile.matches ? 0 : 8}px)` },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 200 }),
    closeDialog: dialog => animate(dialog, [
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: `translateY(${mobile.matches ? 0 : 4}px)` }
    ], { duration: 130 })
  };
})();
