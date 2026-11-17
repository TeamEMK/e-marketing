// Sidebar menu search: the box under the logo narrows the menu to the pages
// whose name matches what is typed. When no page name matches, a group's name
// shows all of its pages ("finance": both Finance pages). Enter opens the first
// match, Esc clears.
// Pages hidden for this user keep their inline display:none, so a search never
// shows a page they may not open. Opening a page clears the search.
(function () {
  const box = document.getElementById('sbSearch');
  const nav = document.querySelector('#sidebar .nav');
  if (!box || !nav) return;
  const input = box.querySelector('input');
  const clearBtn = box.querySelector('.sb-search-clear');
  const empty = document.createElement('div');
  empty.className = 'sb-search-empty';
  empty.textContent = 'No page matches';
  nav.prepend(empty);

  const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const label = el => norm((el.querySelector('.nav-label-text, .nav-group-label-text') || el).textContent);
  const shown = el => el.style.display !== 'none';

  function apply() {
    const q = norm(input.value);
    box.classList.toggle('has-text', !!input.value);
    nav.classList.toggle('sb-searching', !!q);
    nav.querySelectorAll('.sb-miss').forEach(el => el.classList.remove('sb-miss'));
    if (!q) { nav.classList.remove('sb-nothing'); return; }
    // Page names first; a group's name counts only when no page name matches, so
    // "client" gives Client Master, not the whole Clients & Docs group.
    const items = [...nav.querySelectorAll('.nav-item')];
    const byName = items.filter(el => shown(el) && label(el).includes(q));
    const hit = new Set(byName.length ? byName : items.filter(el => {
      const g = el.closest('.nav-group');
      return shown(el) && g && label(g.querySelector('.nav-group-header')).includes(q);
    }));
    items.forEach(el => { if (!hit.has(el)) el.classList.add('sb-miss'); });
    nav.querySelectorAll(':scope > .nav-group').forEach(g => {
      if (![...g.querySelectorAll('.nav-item')].some(el => hit.has(el))) g.classList.add('sb-miss');
    });
    nav.classList.toggle('sb-nothing', hit.size === 0);
  }

  function clear() { if (!input.value) return; input.value = ''; apply(); }

  input.addEventListener('input', apply);
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); clear(); input.blur(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const first = [...nav.querySelectorAll('.nav-item')].find(el => !el.closest('.sb-miss') && shown(el));
      if (first) first.click();
    }
  });
  clearBtn.addEventListener('click', () => { clear(); input.focus(); });
  // The magnifier on the collapsed bar: clicking anywhere on the box types in it.
  box.addEventListener('mousedown', e => { if (e.target !== input && e.target !== clearBtn) { e.preventDefault(); input.focus(); } });
  // A page picked from the results: back to the full menu.
  nav.addEventListener('click', e => { if (e.target.closest('.nav-item')) setTimeout(() => { clear(); input.blur(); }, 0); });
})();
