// ══════════════════════════════════════════════════════
// NEW-TASK POPUP
//
// A doer already gets an email when something is delegated to them, but
// nothing said so inside the app — they had to spot a new row on their own
// board. This opens once, on the next thing they do in the ERP, listing
// what arrived while they were away.
//
// Two entry points, both cheap:
//   • init() calls ntMaybeOpen() on boot, like mwMaybeOpen() beside it
//   • the 30-second badge poll calls it again, so a task delegated while
//     they have the app open surfaces without a refresh
//
// "Seen" lives on the task row, not on a last-read stamp on the user. Two
// tasks can land in the same minute, and one dismissal must not bury the
// one that was never read.
// ══════════════════════════════════════════════════════

let _ntShownIds = [];     // what the open popup is currently displaying
let _ntUpto = null;       // cursor the dismissal clears against — see ntDismiss

// Read off the DOM rather than kept in a flag. A flag set true here and
// never cleared — because the modal was closed by anything other than the
// buttons below — would silence the popup for the rest of the session, and
// the failure would be invisible. The class is the truth either way.
function ntIsOpen() {
  const m = document.getElementById('newTaskModal');
  // The React pop-up (TaskPopups.jsx, kind 'newtask') counts the same way.
  return !!(m && m.classList.contains('open')) || !!document.querySelector('#taskPopupsRoot .modal-overlay.open .nt-modal');
}

// Called from init() and from the badge poll. Silent on failure: a
// notification that cannot load is not worth an error in front of someone
// who came here to do something else.
async function ntMaybeOpen() {
  if (ntIsOpen()) return;
  try {
    const r = await api('/api/tasks/unseen');
    if (!r || r.error || !r.total) return;
    ntShow(r.tasks, r.total, r.upto);
  } catch (e) { /* silent — not critical */ }
}

// `total` is the real number waiting; `tasks` is only the handful the modal
// prints. The two differ whenever a bulk upload lands, and the headline must
// follow `total` or it quietly under-reports the workload.
function ntShow(tasks, total, upto) {
  const box = document.getElementById('ntList');
  const head = document.getElementById('ntCount');
  if (!box || !head) return;

  const n = total || tasks.length;
  _ntShownIds = tasks.map(t => t.id);
  _ntUpto = upto || null;
  // React draws the same pop-up (frontend/src/pages/TaskPopups.jsx); its two
  // buttons come back through ntDismiss, which reads the two values above.
  if (typeof _taskPopReact === 'function' && _taskPopReact('newtask', [tasks, n])) return;
  head.textContent = n === 1
    ? 'A new task has been assigned to you'
    : n + ' new tasks have been assigned to you';

  box.innerHTML = tasks.map(t => {
    // A doer-defined deadline has no date yet, and printing an empty field
    // reads as missing data rather than as the state it actually is.
    const due = t.awaiting_due_date
      ? '<span class="nt-due nt-due-open">You set the date</span>'
      : (t.due_date ? '<span class="nt-due">Due ' + ntEsc(ntDate(t.due_date)) + '</span>' : '');
    const client = t.client_name ? '<span class="nt-client">' + ntEsc(t.client_name) + '</span>' : '';
    return '<div class="nt-item">' +
      '<div class="nt-item-top">' +
        '<span class="nt-prio nt-prio-' + ntEsc(t.priority || 'low') + '">' + ntEsc(t.priority || 'low') + '</span>' +
        client + due +
      '</div>' +
      '<div class="nt-desc">' + ntEsc(t.description || '') + '</div>' +
      '<div class="nt-by">From ' + ntEsc(t.assigned_by_name || 'someone') +
        ' · ' + ntEsc(t.assigned_at || '') + '</div>' +
    '</div>';
  }).join('');

  // Naming the remainder rather than printing it. Dismissing still clears all
  // of them, so this is the only place the doer is told they exist.
  const hidden = n - tasks.length;
  if (hidden > 0) {
    box.innerHTML += '<div class="nt-more">and ' + hidden +
      ' more — open All Tasks to see everything</div>';
  }

  document.getElementById('newTaskModal').classList.add('open');
}

// Dismissing is what marks the tasks read, so the popup never repeats them.
// The close is optimistic: if the POST fails the worst case is seeing the
// same list again next time, which is the safe direction to fail in.
async function ntDismiss(goToTasks) {
  const ids = _ntShownIds.slice();
  const upto = _ntUpto;
  _ntShownIds = [];
  _ntUpto = null;
  closeModal('newTaskModal');
  try {
    // `upto` clears everything the headline counted, not just the rows that
    // fitted on screen — otherwise the remainder reopens this modal half a
    // minute later, over and over, until a bulk upload has been clicked
    // through one screenful at a time.
    if (upto) await api('/api/tasks/seen', 'POST', { upto });
    else if (ids.length) await api('/api/tasks/seen', 'POST', { ids });
  } catch (e) { /* silent — they will simply be offered again */ }
  ntRefreshBell();   // the popup and the bell count the same rows
  if (goToTasks && typeof navigate === 'function') navigate('alltasks');
}

// One entry point for boot and for the 30-second poll, so the popup and the
// bell can never drift apart on what they think is unread.
function ntTick() {
  ntRefreshBell();
  ntMaybeOpen();
}

// ══════════════════════════════════════════════════════
// TOPBAR BELL
//
// The popup is a one-shot: dismiss it and it is gone. The bell is where you
// go back to it, so its list deliberately keeps rows that have already been
// read — a notification list that empties itself when you look at it cannot
// answer "what was that task again".
//
// The badge counts unread only, and rides the same 30-second poll as the
// popup rather than adding a timer of its own.
// ══════════════════════════════════════════════════════
let _ntItems = [];

function ntPanelOpen() {
  const p = document.getElementById('ntPanel');
  return !!(p && p.classList.contains('open'));
}

// The bell's button and panel are React (frontend/src/pages/NotifyBell.jsx),
// drawn inside #ntBellWrap itself — amber-ui.js inserts topbar buttons before
// that element, so it stays where it was. The markup in app.html is the
// fallback. React gets { unread, items } on every refresh.
let NT_BELL_REACT = null, _ntBellWanted = null;
function ntBellSetReact(fn) { NT_BELL_REACT = fn; if (fn && _ntBellWanted) { const w = _ntBellWanted; _ntBellWanted = null; fn(w); } }
function _ntBellReact(data) {
  const root = document.getElementById('ntBellWrap');
  if (!root || !root.dataset.react) return false;
  if (NT_BELL_REACT) NT_BELL_REACT(data); else { _ntBellWanted = data; emkReactMount('notifybell', root); }
  return true;
}

async function ntRefreshBell() {
  if (!document.getElementById('ntBellWrap')) return;
  try {
    const r = await api('/api/tasks/notifications');
    if (!r || r.error) return;
    _ntItems = r.items || [];
    ntDesktopNotify(_ntItems);
    if (_ntBellReact({ unread: r.unread || 0, items: _ntItems })) return;
    const badge = document.getElementById('ntBadge');
    if (!badge) return;
    badge.textContent = r.unread > 99 ? '99+' : String(r.unread || 0);
    badge.style.display = r.unread ? '' : 'none';
    const mark = document.getElementById('ntMarkAll');
    if (mark) mark.disabled = !r.unread;
    if (ntPanelOpen()) ntRenderPanel();
  } catch (e) { /* silent — the bell is not worth an error */ }
}

function ntRenderPanel() {
  const box = document.getElementById('ntPanelList');
  if (!box) return;
  if (!_ntItems.length) {
    box.innerHTML = '<div class="nt-empty">Nothing yet. Tasks delegated to you show up here.</div>';
    return;
  }
  box.innerHTML = _ntItems.map(t => {
    const bits = [];
    if (t.client_name) bits.push(ntEsc(t.client_name));
    bits.push(t.awaiting_due_date ? 'You set the date'
      : (t.due_date ? 'Due ' + ntEsc(ntDate(t.due_date)) : 'No date'));
    bits.push('From ' + ntEsc(t.assigned_by_name || 'someone'));
    bits.push(ntEsc(t.assigned_at || ''));
    return '<div class="nt-row' + (t.is_new ? ' nt-row-new' : '') + '" onclick="ntRowClick(' + t.id + ')">' +
      '<div class="nt-row-desc">' + ntEsc(t.description || '') + '</div>' +
      '<div class="nt-row-meta">' + (t.is_new ? '<span class="nt-dot"></span>' : '') +
        bits.join(' · ') + '</div>' +
    '</div>';
  }).join('');
}

function ntTogglePanel(ev) {
  if (ev) ev.stopPropagation();
  const p = document.getElementById('ntPanel');
  if (!p) return;
  if (p.classList.contains('open')) { p.classList.remove('open'); return; }
  ntRenderPanel();
  p.classList.add('open');
  // Opening the panel does NOT mark anything read. Seeing a row in a list is
  // not the same as having read it, and the unread state is the only thing
  // that makes the list worth scanning.
  ntRefreshBell();
}

// Clicking a row is a deliberate act, so it counts as reading that one.
async function ntRowClick(id) {
  document.getElementById('ntPanel')?.classList.remove('open');
  await ntReadOne(id);
  if (typeof navigate === 'function') navigate('alltasks');
}
// Shared with the React bell: an unread row that is clicked counts as read.
async function ntReadOne(id) {
  const item = _ntItems.find(t => t.id === id);
  if (item && item.is_new) {
    item.is_new = 0;
    try { await api('/api/tasks/seen', 'POST', { ids: [id] }); } catch (e) { /* offered again */ }
    ntRefreshBell();
  }
}

async function ntMarkAllRead() {
  const ids = _ntItems.filter(t => t.is_new).map(t => t.id);
  if (!ids.length) return;
  _ntItems.forEach(t => { t.is_new = 0; });
  ntRenderPanel();
  try { await api('/api/tasks/seen', 'POST', { ids }); } catch (e) { /* offered again */ }
  ntRefreshBell();
}

// Any click outside the bell closes the panel — without this it stays open
// behind whatever the user opened next.
document.addEventListener('click', e => {
  const wrap = document.getElementById('ntBellWrap');
  if (wrap && !wrap.contains(e.target)) document.getElementById('ntPanel')?.classList.remove('open');
});

// ══════════════════════════════════════════════════════
// WINDOWS (DESKTOP) NOTIFICATION
//
// The popup and the bell only show while someone is looking at the app. This
// puts a system notification in the corner of the screen when a task is
// delegated to them and the app is open but not in front: minimised, behind
// another window, or in a background tab. It rides the bell's 30-second poll
// (a background tab may be slowed to once a minute), so there is no new
// request and nothing on the server.
//
// Each task is announced once per browser: the ids already announced are kept
// in localStorage per user, which also stops a second open tab repeating it.
// While the app is in front nothing pops up, since the in-app popup is there;
// the task still counts as announced. Five or more at once (a bulk upload)
// become a single "N new tasks" notification.
// ══════════════════════════════════════════════════════
const NT_DESK_KEEP = 300;   // announced ids remembered per user

function _ntDeskKey() { return 'ntDeskSeen:' + (ME && ME.id); }
function _ntDeskRead() {
  try { return new Set(JSON.parse(localStorage.getItem(_ntDeskKey()) || '[]')); } catch { return new Set(); }
}
function _ntDeskWrite(set) {
  try { localStorage.setItem(_ntDeskKey(), JSON.stringify([...set].slice(-NT_DESK_KEEP))); } catch {}
}

function ntDesktopNotify(items) {
  if (!('Notification' in window) || !ME || ME.role === 'client') return;
  let firstRun = false;
  try { firstRun = localStorage.getItem(_ntDeskKey()) === null; } catch { return; }
  const seen = _ntDeskRead();
  const todo = (items || []).filter(t => t.is_new && !seen.has(t.id));
  // The first time in a browser, what is already waiting is not news (the popup
  // shows it on opening): it is recorded, even when nothing is, so later
  // arrivals are told apart from it.
  if (firstRun || todo.length) { todo.forEach(t => seen.add(t.id)); _ntDeskWrite(seen); }
  if (firstRun || !todo.length || Notification.permission !== 'granted' || document.hasFocus()) return;

  const open = n => { n.onclick = () => { window.focus(); n.close(); if (typeof navigate === 'function') navigate('alltasks'); }; };
  if (todo.length >= 5) {
    open(new Notification(`${todo.length} new tasks assigned to you`, {
      body: 'Open All Tasks to see them.', icon: '/emarketing-logo.png', tag: 'emk-tasks-bulk' }));
    return;
  }
  todo.forEach(t => {
    const bits = ['From ' + (t.assigned_by_name || 'someone')];
    if (t.client_name) bits.push(t.client_name);
    bits.push(t.awaiting_due_date ? 'You set the date' : (t.due_date ? 'Due ' + ntDate(t.due_date) : 'No date'));
    open(new Notification('New task assigned to you', {
      body: (t.description || '').slice(0, 180) + '\n' + bits.join(' · '),
      icon: '/emarketing-logo.png', tag: 'emk-task-' + t.id }));
  });
}

// Windows notifications need the browser's permission, which it only lets a
// page ask for after a click. Asked on the first click in the app, once per
// session while it is still undecided; the browser remembers Allow or Block,
// and a Block is never asked again.
document.addEventListener('click', () => {
  try {
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    if (!ME || ME.role === 'client' || sessionStorage.getItem('ntDeskAsked')) return;
    sessionStorage.setItem('ntDeskAsked', '1');
    Notification.requestPermission();
  } catch {}
}, true);

function ntDate(d) {
  return (typeof fmtDate === 'function') ? fmtDate(d) : d;
}

function ntEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
