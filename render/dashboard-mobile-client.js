// Self-contained progressive enhancement. This function is embedded in the
// generated page; do not add module-scope dependencies or source data here.
export function mountMobileDashboard() {
  const root = document.querySelector('.mobile-dashboard');
  if (!root) return;
  const links = [...root.querySelectorAll('nav a')];
  const pages = links.map(link => document.getElementById(link.dataset.section));
  const storageKey = 'moore-mobile-scroll';
  let scroll = {}, selected = -1, gesture = null;
  try { scroll = JSON.parse(sessionStorage.getItem(storageKey) || '{}'); } catch { /* Storage is optional. */ }
  if (!scroll || typeof scroll !== 'object') scroll = {};
  function save() {
    if (selected >= 0) scroll[pages[selected].id] = pages[selected].scrollTop;
    try { sessionStorage.setItem(storageKey, JSON.stringify(scroll)); } catch { /* Private browser mode. */ }
  }
  function select(index, updateUrl = true) {
    if (index < 0 || index >= pages.length) index = 0;
    if (index === selected) return;
    save();
    const prior = selected;
    selected = index;
    pages.forEach((page, i) => { page.hidden = i !== index; });
    links.forEach((link, i) => i === index ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current'));
    root.querySelector('h1').textContent = links[index].dataset.title;
    pages[index].scrollTop = Number(scroll[pages[index].id]) || 0;
    root.querySelector('#section-announcement').textContent = links[index].dataset.title;
    if (updateUrl) {
      try { history.replaceState(null, '', '#' + pages[index].id); } catch { /* file preview / embedded sandbox */ }
    }
    if (prior >= 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches && pages[index].animate) {
      pages[index].animate([{ transform: `translateX(${index > prior ? 16 : -16}px)` }, { transform: 'translateX(0)' }], { duration: 140, easing: 'ease-out' });
    }
  }
  function fromHash() {
    const found = links.findIndex(link => '#' + link.dataset.section === location.hash);
    select(found < 0 ? 0 : found, found < 0 && Boolean(location.hash));
  }
  root.classList.add('enhanced');
  fromHash();
  links.forEach((link, i) => link.addEventListener('click', event => { event.preventDefault(); select(i); }));
  root.querySelector('nav').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 : Math.min(links.length - 1, Math.max(0, selected + (event.key === 'ArrowRight' ? 1 : -1)));
    select(index); links[index].focus();
  });
  addEventListener('hashchange', fromHash);
  addEventListener('pagehide', save);
  // Preserve browser edge navigation and native controls. Only a clearly
  // horizontal interior gesture changes sections; never prevent vertical scroll.
  const main = root.querySelector('main');
  main.addEventListener('pointerdown', event => {
    gesture = null;
    if (!event.isPrimary || event.button !== 0 || event.clientX < 28 || event.clientX > innerWidth - 28 || event.target.closest('a,button,input,select,textarea,summary,details')) return;
    gesture = { x: event.clientX, y: event.clientY, id: event.pointerId };
    main.setPointerCapture(event.pointerId);
  });
  main.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    gesture = null;
    const index = selected + (dx < 0 ? 1 : -1);
    if (Math.abs(dx) >= 54 && Math.abs(dx) > Math.abs(dy) * 1.5 && index >= 0 && index < pages.length) select(index);
  });
  main.addEventListener('pointercancel', () => { gesture = null; });
  const generated = Date.parse(root.dataset.householdGeneratedAt || '');
  const freshness = root.querySelector('.freshness');
  const stamp = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  function tick() {
    const now = Date.now(), messages = [];
    if (!navigator.onLine) messages.push('Offline · showing the last received household update.');
    if (!Number.isFinite(generated)) messages.push('Household update time is unavailable.');
    else if (now < generated - 60000) messages.push('Device time is earlier than the household update.');
    else if (stamp.format(now) !== root.dataset.snapshotDate) messages.push('This household view is for a different day. Its date is shown above.');
    else if (now - generated > 6 * 3600000) messages.push('Household update is over 6 hours old.');
    freshness.textContent = messages.join(' ');
    for (const treatment of root.querySelectorAll('[data-activate-at]')) {
      const start = Number(treatment.dataset.activateAt), end = Number(treatment.dataset.expireAt);
      treatment.hidden = !(Number.isFinite(start) && Number.isFinite(end) && now >= start && now < end);
      const label = treatment.querySelector('[data-before-label]');
      if (label) label.textContent = now >= Number(treatment.dataset.midnightAt) ? label.dataset.onLabel : label.dataset.beforeLabel;
    }
  }
  tick();
  let interval = setInterval(tick, 30000);
  addEventListener('online', tick); addEventListener('offline', tick);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); else save(); });
  addEventListener('pagehide', () => { clearInterval(interval); interval = null; });
  addEventListener('pageshow', () => { tick(); if (interval === null) interval = setInterval(tick, 30000); });
  // Refresh/auth transport intentionally belongs to the publishing handoff.
  // No timer claims that reopening a static page reruns household selection.
}
