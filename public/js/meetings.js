// ══════════════════════════════════════════════════════
// MEETINGS — calendar (month + day)
// ══════════════════════════════════════════════════════
let _mtgClientsCache = null;
let _mtgUsersCache = null;
let _mtgMonthAnchor = null; // month-anchor Date (1st of viewed month)
let _mtgDayAnchor   = null; // currently focused day in the right-pane timeline
let _mtgMonthCache = {};
let _mtgTaskCache = {};   // calendar task feed, keyed by grid range
let _mtgHolidays = null;

function _mtgTodayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function _mtgIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function _mtgParseIso(s) {
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m-1, d);
}

// The calendar is a React page (frontend/src/pages/Meetings.jsx) since
// 2026-10-30. The viewed month and day stay here (the form prefills its date
// from _mtgDayAnchor), and Done, Copy invite and Remove are still this
// file's, with their loadMeetings() / renderMtgDay() calls coming back to
// the page.
let MTG_REACT = null;   // { reload, reloadDay, reloadMonth }
function mtgSetReact(o) { MTG_REACT = o; }
function mtgGetAnchors() { return { month: _mtgMonthAnchor, day: _mtgDayAnchor }; }
function mtgSetAnchors(month, day) { if (month) _mtgMonthAnchor = month; if (day) _mtgDayAnchor = day; }
function mtgRemember(m) { _mtgCopyById[m.id] = m; }

async function loadMeetings() {
  const today = new Date();
  if (!_mtgMonthAnchor) _mtgMonthAnchor = new Date(today.getFullYear(), today.getMonth(), 1);
  if (!_mtgDayAnchor)   _mtgDayAnchor   = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const root = document.getElementById('mtgReactRoot');
  if (root) {
    await Promise.all([_mtgEnsureClients(), _mtgEnsureUsers(), _mtgEnsureHolidays()]);
    return MTG_REACT ? MTG_REACT.reload() : emkReactMount('meetings', root);
  }
  await Promise.all([_mtgEnsureClients(), _mtgEnsureUsers(), _mtgEnsureHolidays()]);
  await renderMtgMonth();
  await renderMtgDay();
}

async function _mtgEnsureHolidays() {
  if (_mtgHolidays) return _mtgHolidays;
  try {
    const list = await api('/api/holidays');
    _mtgHolidays = new Set((list || []).map(h => h.holiday_date || h.date));
  } catch { _mtgHolidays = new Set(); }
  return _mtgHolidays;
}

async function renderMtgMonth() {
  if (MTG_REACT) return MTG_REACT.reloadMonth();
}

async function renderMtgDay() {
  if (MTG_REACT) return MTG_REACT.reloadDay();
}

function mtgClickHour(hour, minute) {
  const hh = String(hour).padStart(2,'0');
  const mm = String(minute).padStart(2,'0');
  openMeetingModal(null, `${hh}:${mm}`);
}

async function deletePlanItem(id) {
  if (!await appConfirm('Remove this item from your schedule?', 'Remove item?')) return;
  try {
    const r = await api(`/api/day-plan-items/${id}`, 'DELETE');
    if (r?.error) { showToast(r.error); return; }
    showToast('Removed');
    renderMtgDay();
  } catch (e) { showToast('Remove failed: ' + e.message); }
}

async function _mtgEnsureClients() {
  if (_mtgClientsCache) return _mtgClientsCache;
  try { _mtgClientsCache = await api('/api/clients') || []; }
  catch { _mtgClientsCache = []; }
  return _mtgClientsCache;
}

async function _mtgEnsureUsers() {
  if (_mtgUsersCache) return _mtgUsersCache;
  try { _mtgUsersCache = await api('/api/users') || []; }
  catch { _mtgUsersCache = []; }
  return _mtgUsersCache;
}

// The form is React (frontend/src/pages/MeetingForm.jsx) since 2026-10-30,
// mounted into #mtgFormRoot. The old modal markup and its handlers are gone;
// these two are React's way into this file's caches and calendar.
let MTG_FORM_REACT = null, _mtgFormWanted = null;
function mtgFormSetReact(fn) { MTG_FORM_REACT = fn; if (fn && _mtgFormWanted) { const a = _mtgFormWanted; _mtgFormWanted = null; fn(...a); } }
// Clients are refetched on every open, so one switched active/inactive in
// Client Master shows up (or drops out) straight away.
async function mtgFormLoad() {
  _mtgClientsCache = null;
  await Promise.all([_mtgEnsureClients(), _mtgEnsureUsers()]);
  return { clients: _mtgClientsCache || [], users: _mtgUsersCache || [],
    date: _mtgDayAnchor ? _mtgIso(_mtgDayAnchor) : _mtgTodayIso() };
}
// After a save, Done or cancel: show that date (if given) and reload.
function mtgAfterChange(dateIso) {
  if (dateIso) {
    _mtgDayAnchor = _mtgParseIso(dateIso);
    _mtgMonthAnchor = new Date(_mtgDayAnchor.getFullYear(), _mtgDayAnchor.getMonth(), 1);
  }
  _mtgMonthCache = {};
  _mtgTaskCache = {};
  loadMeetings();
}

async function openMeetingModal(id, prefillStart) {
  const root = document.getElementById('mtgFormRoot');
  if (root && root.dataset.react) {
    if (MTG_FORM_REACT) return MTG_FORM_REACT(id || null, prefillStart || '');
    _mtgFormWanted = [id || null, prefillStart || ''];
    return emkReactMount('meetingform', root);
  }
}

// Zoom-style start-time picker: "H:MM" text input + separate AM/PM select, backed by a
// hidden 24h value. The dropdown always lists the full business-hours range (8:00 AM - 8:00 PM)
// with the period spelled out on each row, so a PM slot can be picked without touching the
// AM/PM select first — picking a row syncs that select to the chosen period.
const MTG_TIME_OPTIONS = (() => {
  const opts = [];
  for (let mins = 8 * 60; mins <= 20 * 60; mins += 15) {
    const h24 = Math.floor(mins / 60), min = mins % 60;
    const value = `${String(h24).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const period = h24 < 12 ? 'AM' : 'PM';
    const h12Label = `${h12}:${String(min).padStart(2,'0')}`;
    opts.push({ value, h12Label, period, label: `${h12Label} ${period}` });
  }
  return opts;
})();

function _mtgFmtTime12(hhmm) {
  const [h, m] = (hhmm || '').split(':').map(Number);
  if (!Number.isFinite(h)) return hhmm || '';
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

// The meetings on screen, by id, for the Copy button.
const _mtgCopyById = {};

// A Zoom meeting copies the invitation the way Zoom words it; any other link is
// copied on its own.
function mtgInviteText(m) {
  if (!m.zoom_meeting_id) return m.meet_link;
  const id = String(m.zoom_meeting_id);
  const idFmt = id.length === 11 ? `${id.slice(0, 3)} ${id.slice(3, 7)} ${id.slice(7)}`
              : id.length === 10 ? `${id.slice(0, 3)} ${id.slice(3, 6)} ${id.slice(6)}` : id;
  const [y, mo, d] = m.meeting_date.split('-').map(Number);
  const [h, mi] = m.start_time.split(':').map(Number);
  const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mo - 1];
  const time = `${month} ${d}, ${y} ${String(h % 12 || 12).padStart(2, '0')}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'} India`;
  let host = 'zoom.us';
  try { host = new URL(m.meet_link).host; } catch (e) {}
  return `${m.organizer_name || 'E-Marketing'} is inviting you to a scheduled Zoom meeting.\n\n`
    + `Topic: ${m.title}\nTime: ${time}\n\n`
    + `Join Zoom Meeting\n${m.meet_link}\n\n`
    + `Meeting chat link\nhttps://${host}/launch/jc/${id}\n\n`
    + `Meeting ID: ${idFmt}\nPasscode: ${m.zoom_passcode || ''}`;
}

// Copies the invitation (Zoom) or the link, to paste into WhatsApp, email etc.
function mtgCopyLink(id) {
  const m = _mtgCopyById[id];
  if (!m) return;
  const link = mtgInviteText(m);
  const done = () => showToast(m.zoom_meeting_id ? '✅ Zoom invitation copied' : '✅ Meeting link copied');
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = link; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    ok ? done() : showToast('Could not copy — open Edit and copy it from there', 'error');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, fallback);
  else fallback();
}

async function markMeetingDone(id) {
  if (!await appConfirm('Mark this meeting as done?')) return;
  try {
    const r = await api(`/api/meetings/${id}/status`, 'PUT', { status: 'done' });
    if (r?.error) { appAlert(r.error, 'Error'); return; }
    showToast('✅ Meeting marked done');
    _mtgMonthCache = {};
    _mtgTaskCache = {};
    loadMeetings();
  } catch (e) { appAlert('Failed: ' + e.message, 'Error'); }
}

init();
setDefaultMISDates();
