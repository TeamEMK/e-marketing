// ══════════════════════════════════════════════════════
// MEETINGS — calendar (month + day)
// ══════════════════════════════════════════════════════
let _mtgClientsCache = null;
let _mtgUsersCache = null;
let _mtgEditing = null;
let _mtgSeriesRemaining = 0; // scheduled occurrences left in the open meeting's series
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
// from _mtgDayAnchor and saveMeeting moves both to the saved date); the
// meeting form, Done, Copy invite and Remove are still this file's, and their
// loadMeetings() / renderMtgDay() calls come back to the page.
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

// A meeting whose date + start time is already past: no email goes out (the
// server decides the same way), and a new one is unticked for a link unless
// the user ticked it themselves.
let _mtgLinkTouched = false;
function mtgSyncPastState() {
  const d = document.getElementById('mtgFormDate')?.value || '';
  const t = document.getElementById('mtgStart')?.value || '';
  const nowIst = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 16).replace('T', ' ');
  const past = !!d && `${d} ${t || '00:00'}` < nowIst;
  const note = document.getElementById('mtgPastNote');
  if (note) note.style.display = past ? 'block' : 'none';
  const cb = document.getElementById('mtgCreateLink');
  if (cb && !_mtgEditing && !_mtgLinkTouched) cb.checked = !past;
}
document.addEventListener('change', e => {
  if (e.target && e.target.id === 'mtgCreateLink') _mtgLinkTouched = true;
  if (e.target && ['mtgFormDate', 'mtgStart', 'mtgStartPeriod'].includes(e.target.id)) mtgSyncPastState();
});

// The form is React (frontend/src/pages/MeetingForm.jsx) since 2026-10-30,
// mounted into #mtgFormRoot; #meetingModal and the functions below stay as
// the fallback. These two are its way into this file's caches and calendar.
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
  _mtgEditing = id || null;
  _mtgSeriesRemaining = 0;
  document.getElementById('mtgEditId').value = id || '';
  document.getElementById('meetingModalTitle').textContent = id ? 'Edit Meeting' : 'Schedule Meeting';
  document.getElementById('mtgDeleteBtn').style.display = id ? 'inline-block' : 'none';
  document.getElementById('mtgDoneBtn').style.display = 'none';

  // Populate dropdowns from cache. Clients are refetched on every open so a
  // client switched active/inactive in Client Master shows up (or drops out)
  // straight away; only active ones are offered.
  _mtgClientsCache = null;
  await Promise.all([_mtgEnsureClients(), _mtgEnsureUsers()]);
  const clientSel = document.getElementById('mtgClient');
  clientSel.innerHTML = '<option value="">— None —</option>' +
    sortClientsForPicker(_mtgClientsCache.filter(isActiveClient)).map(c => `<option value="${c.id}">${dtEscape(clientLabel(c))}</option>`).join('');
  // Explicit reset — browsers retain the previously-selected <select> .value
  // across innerHTML rebuilds if the new option list still contains it, so a
  // brand-new meeting was silently inheriting the last-picked client.
  clientSel.value = '';
  const attEl = document.getElementById('mtgAttendees');
  attEl.innerHTML = _mtgUsersCache.map(u =>
    `<label data-att-row style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:400;text-transform:none;letter-spacing:0;margin-bottom:0;padding:6px 10px;border-radius:6px;cursor:pointer;color:#1e293b" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
       <input type="checkbox" value="${u.id}" data-att onchange="updateAttSummary()" style="width:16px;height:16px;margin:0;padding:0;flex-shrink:0;accent-color:#4f46e5"/>
       <span style="flex:1">${dtEscape(u.name)}</span>
     </label>`).join('');
  document.getElementById('mtgAttSearch').value = '';
  filterAttDropdown();

  // Default values
  // A new meeting starts as "E-Marketing x " so only the other side's name is
  // typed; editing a meeting overwrites this with its own title below.
  document.getElementById('mtgTitle').value = 'E-Marketing x ';
  document.getElementById('mtgAgenda').value = '';
  document.getElementById('mtgLink').value = '';
  document.getElementById('mtgFormDate').value = (_mtgDayAnchor ? _mtgIso(_mtgDayAnchor) : _mtgTodayIso());
  mtgSetStartTime(prefillStart || '', { silent: true });
  document.getElementById('mtgDuration').value = '30';
  mtgRecalcEnd();

  // Recurrence only applies when creating a brand-new meeting — editing one
  // occurrence shouldn't spawn a whole new series.
  document.getElementById('mtgRecurrenceSection').style.display = id ? 'none' : 'block';
  document.getElementById('mtgFrequency').value = '';
  document.getElementById('mtgRepeatUntil').value = '';
  document.querySelectorAll('[data-repeat-day]').forEach(cb => cb.checked = false);
  mtgOnFrequencyChange();

  if (id) {
    const m = await api(`/api/meetings/${id}`);
    if (m && !m.error) {
      document.getElementById('mtgTitle').value = m.title || '';
      document.getElementById('mtgAgenda').value = m.agenda || '';
      document.getElementById('mtgLink').value = m.meet_link || '';
      document.getElementById('mtgDoneBtn').style.display = (m.status === 'scheduled') ? 'inline-block' : 'none';
      document.getElementById('mtgFormDate').value = m.meeting_date || '';
      mtgSetStartTime(m.start_time || '10:00', { silent: true });
      // A meeting already tied to a now-inactive client keeps that client.
      const own = m.client_id && !clientSel.querySelector(`option[value="${m.client_id}"]`)
        && _mtgClientsCache.find(c => String(c.id) === String(m.client_id));
      if (own) clientSel.insertAdjacentHTML('beforeend', `<option value="${own.id}">${dtEscape(clientLabel(own))}</option>`);
      clientSel.value = m.client_id || '';
      const dur = (() => {
        const [sh,sm] = (m.start_time||'10:00').split(':').map(Number);
        const [eh,em] = (m.end_time||'10:30').split(':').map(Number);
        return (eh*60+em) - (sh*60+sm);
      })();
      const durSel = document.getElementById('mtgDuration');
      if ([15,30,60,90].includes(dur)) durSel.value = String(dur);
      mtgRecalcEnd();
      const attSet = new Set((m.attendees||[]).map(a => String(a.id)));
      attEl.querySelectorAll('[data-att]').forEach(cb => { cb.checked = attSet.has(cb.value); });
      _mtgSeriesRemaining = m.series_remaining || 0;
    }
  }
  // "Create a meeting link": only for a new meeting; ticked unless the time has passed.
  document.getElementById('mtgCreateLinkWrap').style.display = id ? 'none' : 'flex';
  document.getElementById('mtgCreateLink').checked = true;
  _mtgLinkTouched = false;
  mtgSyncPastState();
  document.getElementById('meetingModal').classList.add('open');
  // New meeting: cursor after "E-Marketing x ", ready for the other side's name.
  if (!id) setTimeout(() => {
    const t = document.getElementById('mtgTitle');
    t.focus(); t.setSelectionRange(t.value.length, t.value.length);
  }, 50);
  updateAttSummary();
  mtgRefreshAvailNote();
  // Update availability note when attendees change (in addition to inline summary update)
  attEl.querySelectorAll('[data-att]').forEach(cb => cb.addEventListener('change', mtgRefreshAvailNote));
  document.getElementById('mtgFormDate').addEventListener('change', mtgRefreshAvailNote);
  document.getElementById('mtgStart').addEventListener('change', mtgRefreshAvailNote);
}

function toggleAttDropdown(force) {
  const dd = document.getElementById('mtgAttDropdown');
  const willOpen = force === undefined ? dd.style.display === 'none' : force;
  dd.style.display = willOpen ? 'block' : 'none';
  if (willOpen) setTimeout(() => document.getElementById('mtgAttSearch')?.focus(), 0);
}

function filterAttDropdown() {
  const q = (document.getElementById('mtgAttSearch')?.value || '').toLowerCase();
  document.querySelectorAll('#mtgAttendees [data-att-row]').forEach(row => {
    row.style.display = !q || row.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
  });
}

function updateAttSummary() {
  const checked = Array.from(document.querySelectorAll('#mtgAttendees [data-att]:checked'));
  const summary = document.getElementById('mtgAttSummary');
  if (!summary) return;
  if (!checked.length) {
    summary.textContent = 'Select attendees…';
    summary.style.color = '#94a3b8';
  } else {
    const names = checked.map(cb => cb.parentElement.textContent.trim());
    summary.textContent = checked.length <= 2 ? names.join(', ') : `${checked.length} selected`;
    summary.style.color = '#1e293b';
  }
}

// Close attendee dropdown on outside click
document.addEventListener('click', (e) => {
  const dd = document.getElementById('mtgAttDropdown');
  const trig = document.getElementById('mtgAttTrigger');
  if (!dd || !trig) return;
  if (dd.style.display === 'none') return;
  if (dd.contains(e.target) || trig.contains(e.target)) return;
  dd.style.display = 'none';
});

function mtgOnFrequencyChange() {
  const freq = document.getElementById('mtgFrequency').value;
  const untilGroup = document.getElementById('mtgRepeatUntilGroup');
  const onGroup = document.getElementById('mtgRepeatOnGroup');
  const note = document.getElementById('mtgRecurrenceNote');
  untilGroup.style.display = freq ? 'block' : 'none';
  onGroup.style.display = freq === 'custom' ? 'block' : 'none';
  if (freq && !document.getElementById('mtgRepeatUntil').value) {
    const start = document.getElementById('mtgFormDate').value ? new Date(document.getElementById('mtgFormDate').value) : new Date();
    const d = new Date(start);
    d.setMonth(d.getMonth() + 3);
    document.getElementById('mtgRepeatUntil').value = d.toISOString().split('T')[0];
  }
  note.textContent = freq
    ? 'This will create one meeting per occurrence, up to the "repeat until" date — fill this form once instead of every time.'
    : '';
}

function mtgRecalcEnd() {
  mtgSyncPastState();   // a start-time pick changes whether the meeting is in the past
  const start = document.getElementById('mtgStart').value;
  if (!start) { document.getElementById('mtgEnd').value = ''; return; }
  const dur = parseInt(document.getElementById('mtgDuration').value, 10) || 30;
  const [h,m] = start.split(':').map(Number);
  const total = h*60 + m + dur;
  const eh = String(Math.floor(total/60) % 24).padStart(2,'0');
  const em = String(total % 60).padStart(2,'0');
  document.getElementById('mtgEnd').value = `${eh}:${em}`;
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

function mtgSetStartTime(value24raw, { silent } = {}) {
  const value24 = (value24raw || '').slice(0, 5); // tolerate DB "HH:MM:SS" TIME values
  const hidden = document.getElementById('mtgStart');
  hidden.value = value24 || '';
  const opt = value24 ? MTG_TIME_OPTIONS.find(o => o.value === value24) : null;
  document.getElementById('mtgStartDisplay').value = opt ? opt.h12Label : '';
  if (opt) document.getElementById('mtgStartPeriod').value = opt.period;
  if (!silent) hidden.dispatchEvent(new Event('change'));
}

function mtgRenderStartDropdown(filterText) {
  const dd = document.getElementById('mtgStartDropdown');
  const q = (filterText || '').trim().toLowerCase().replace(/\s+/g, '');
  // Match against the bare "H:MM" as well as "H:MM AM/PM", so typing "10:00" keeps both periods.
  const matches = q
    ? MTG_TIME_OPTIONS.filter(o => o.label.toLowerCase().replace(/\s+/g, '').includes(q))
    : MTG_TIME_OPTIONS;
  dd.innerHTML = matches.length
    ? matches.map(o => `<div data-time-opt="${o.value}" onclick="mtgPickStartTime('${o.value}')"
        style="padding:8px 12px;font-size:13px;cursor:pointer;color:#1e293b" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">${o.label}</div>`).join('')
    : `<div style="padding:10px 12px;font-size:12px;color:#94a3b8">No matching time</div>`;
  dd.style.display = 'block';
}

function mtgOpenStartDropdown() {
  mtgRenderStartDropdown(document.getElementById('mtgStartDisplay').value);
  const current = document.getElementById('mtgStart').value;
  const activeEl = current && document.getElementById('mtgStartDropdown').querySelector(`[data-time-opt="${current}"]`);
  if (activeEl) activeEl.scrollIntoView({ block: 'center' });
}

function mtgFilterStartDropdown() {
  mtgRenderStartDropdown(document.getElementById('mtgStartDisplay').value);
}

function mtgPickStartTime(value24) {
  mtgSetStartTime(value24);
  document.getElementById('mtgStartDropdown').style.display = 'none';
}

function mtgStartKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const first = document.getElementById('mtgStartDropdown').querySelector('[data-time-opt]');
    if (first) mtgPickStartTime(first.getAttribute('data-time-opt'));
  } else if (e.key === 'Escape') {
    document.getElementById('mtgStartDropdown').style.display = 'none';
  }
}

// AM/PM select changed directly: keep the typed hour:minute if it's valid for the new period
// (e.g. 8:00 AM <-> 8:00 PM), otherwise clear the selection and let the user re-pick from the
// dropdown list.
function mtgPeriodChanged() {
  const typed = document.getElementById('mtgStartDisplay').value.trim().replace(/\s+/g, '');
  const period = document.getElementById('mtgStartPeriod').value;
  const match = MTG_TIME_OPTIONS.find(o => o.period === period && o.h12Label.replace(/\s+/g, '') === typed);
  mtgSetStartTime(match ? match.value : '');
  mtgRenderStartDropdown(document.getElementById('mtgStartDisplay').value);
}

// Close start-time dropdown on outside click
document.addEventListener('click', (e) => {
  const dd = document.getElementById('mtgStartDropdown');
  const input = document.getElementById('mtgStartDisplay');
  if (!dd || !input) return;
  if (dd.style.display === 'none') return;
  if (dd.contains(e.target) || input.contains(e.target)) return;
  dd.style.display = 'none';
});

function _mtgFmtTime12(hhmm) {
  const [h, m] = (hhmm || '').split(':').map(Number);
  if (!Number.isFinite(h)) return hhmm || '';
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

async function mtgRefreshAvailNote() {
  const date = document.getElementById('mtgFormDate').value;
  const start = document.getElementById('mtgStart').value;
  const end = document.getElementById('mtgEnd').value;
  const noteEl = document.getElementById('mtgAvailNote');
  if (!date || !start || !end) { noteEl.textContent = ''; return; }
  const ids = Array.from(document.querySelectorAll('#mtgAttendees [data-att]:checked')).map(c => c.value);
  if (!ids.length) { noteEl.textContent = 'Pick attendees to see availability for this slot.'; noteEl.style.color = '#64748b'; return; }
  try {
    const r = await api(`/api/meetings/slots?date=${date}&userIds=${ids.join(',')}`);
    if (r?.off) { noteEl.textContent = `${r.reason} — date unavailable.`; noteEl.style.color = '#dc2626'; return; }
    // Business-hours bounds come from the actual slot range, not an exact grid
    // match — the start-time picker offers 15-min steps while slots are 30-min,
    // so e.g. 10:15 would never equal any slot.start even though it's in-hours.
    const allSlots = r.slots || [];
    if (allSlots.length) {
      const first = allSlots[0].start, last = allSlots[allSlots.length - 1].end;
      if (start < first || end > last) {
        noteEl.textContent = `Start time outside business hours (${_mtgFmtTime12(first)}–${_mtgFmtTime12(last)}).`;
        noteEl.style.color = '#f59e0b';
        return;
      }
    }
    const parts = [];
    for (const u of _mtgUsersCache.filter(u => ids.includes(String(u.id)))) {
      const ranges = (r.busyRanges?.[u.id] || []).filter(rg => rg.start < end && rg.end > start);
      if (!ranges.length) continue;
      const rangeTxt = ranges.map(rg => `${_mtgFmtTime12(rg.start)}–${_mtgFmtTime12(rg.end)}`).join(', ');
      parts.push(`${u.name} busy ${rangeTxt}`);
    }
    if (parts.length) {
      noteEl.textContent = `⚠️ ${parts.join(' · ')}`;
      noteEl.style.color = '#dc2626';
    } else {
      noteEl.textContent = '✓ All selected attendees are free.';
      noteEl.style.color = '#16a34a';
    }
  } catch { noteEl.textContent = ''; }
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

async function saveMeeting() {
  const id = document.getElementById('mtgEditId').value;
  const payload = {
    title: document.getElementById('mtgTitle').value.trim(),
    agenda: document.getElementById('mtgAgenda').value.trim(),
    client_id: document.getElementById('mtgClient').value || null,
    meeting_date: document.getElementById('mtgFormDate').value,
    start_time: document.getElementById('mtgStart').value,
    end_time: document.getElementById('mtgEnd').value,
    meet_link: document.getElementById('mtgLink').value.trim() || null,
    create_link: document.getElementById('mtgCreateLink').checked,
    attendee_ids: Array.from(document.querySelectorAll('#mtgAttendees [data-att]:checked')).map(c => parseInt(c.value, 10))
  };
  if (/^E-Marketing x$/i.test(payload.title)) {
    showToast('Add who the meeting is with after "E-Marketing x"');
    return;
  }
  if (!payload.title || !payload.meeting_date || !payload.start_time || !payload.end_time) {
    showToast('Title, date, start and end time required');
    return;
  }
  if (!id) {
    const freq = document.getElementById('mtgFrequency').value;
    if (freq) {
      const repeatUntil = document.getElementById('mtgRepeatUntil').value;
      if (!repeatUntil) { showToast('Pick a "repeat until" date'); return; }
      const repeatDays = Array.from(document.querySelectorAll('[data-repeat-day]:checked')).map(cb => parseInt(cb.dataset.repeatDay, 10));
      if (freq === 'custom' && !repeatDays.length) { showToast('Select at least one day to repeat on'); return; }
      payload.frequency = freq;
      payload.repeat_until = repeatUntil;
      payload.repeat_days = repeatDays;
    }
  }
  try {
    const r = id
      ? await api(`/api/meetings/${id}`, 'PUT', payload)
      : await api('/api/meetings', 'POST', payload);
    if (r?.error) { showToast(r.error); return; }
    showToast(id
      ? 'Meeting updated · email sent'
      : (r?.count > 1 ? `${r.count} meetings scheduled · email sent` : 'Meeting scheduled · email sent'));
    closeModal('meetingModal');
    _mtgDayAnchor = _mtgParseIso(payload.meeting_date);
    _mtgMonthAnchor = new Date(_mtgDayAnchor.getFullYear(), _mtgDayAnchor.getMonth(), 1);
    _mtgMonthCache = {};
    _mtgTaskCache = {};
    loadMeetings();
  } catch (e) { showToast('Save failed: ' + e.message); }
}

async function markMeetingDone(id) {
  if (!await appConfirm('Mark this meeting as done?')) return;
  try {
    const r = await api(`/api/meetings/${id}/status`, 'PUT', { status: 'done' });
    if (r?.error) { appAlert(r.error, 'Error'); return; }
    showToast('✅ Meeting marked done');
    closeModal('meetingModal');
    _mtgMonthCache = {};
    _mtgTaskCache = {};
    loadMeetings();
  } catch (e) { appAlert('Failed: ' + e.message, 'Error'); }
}

async function deleteMeeting() {
  const id = document.getElementById('mtgEditId').value;
  if (!id) return;
  let scope = 'one';
  // A recurring meeting is stored as one independent row per date, so cancelling
  // "this one" leaves every later date standing. Offer the whole tail in one go.
  if (_mtgSeriesRemaining > 1) {
    const choice = await _showAppPrompt({
      title: 'Cancel Meeting?',
      message: `This meeting repeats — ${_mtgSeriesRemaining} occurrences are still scheduled from this date onwards. Cancel only this one, or all of them?`,
      buttons: [
        { label: 'Keep All',      className: 'btn btn-outline', value: '' },
        { label: 'Only This One', className: 'btn btn-outline', value: 'one' },
        { label: `Cancel All ${_mtgSeriesRemaining}`, className: 'btn btn-danger', value: 'following' }
      ]
    });
    if (!choice) return;
    scope = choice;
  } else if (!await appConfirm('Cancel this meeting? An email notification will go out.', 'Cancel Meeting?')) {
    return;
  }
  try {
    const r = await api(`/api/meetings/${id}?scope=${scope}`, 'DELETE');
    if (r?.error) { showToast(r.error); return; }
    showToast(r?.cancelled > 1 ? `${r.cancelled} meetings cancelled · email sent` : 'Meeting cancelled · email sent');
    closeModal('meetingModal');
    _mtgMonthCache = {};
    _mtgTaskCache = {};
    loadMeetings();
  } catch (e) { showToast('Cancel failed: ' + e.message); }
}

init();
setDefaultMISDates();
