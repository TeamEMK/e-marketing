// ══════════════════════════════════════════════════════
// INVENTORY JS
// ══════════════════════════════════════════════════════
let _invItems = [], _invAssignments = [], _invTab = 'mine', _invAssignItemId = null, _invHandoverAssignId = null, _invReturnAssignId = null;
let _invPhotoBase64 = null;
let _invSelfAddMode = false;

const INV_TYPE_LABELS = {laptop:'💻 Laptop',keyboard:'⌨️ Keyboard',mouse:'🖱️ Mouse',mobile:'📱 Mobile',sim:'📶 SIM',charger:'🔌 Charger',other:'📦 Other'};
// Same labels without the emoji — used as the item's stored name, since the
// form has no free-text name field (an 'other' item is named by its typed-in
// custom type instead).
const INV_TYPE_PLAIN = {laptop:'Laptop',keyboard:'Keyboard',mouse:'Mouse',mobile:'Mobile',sim:'SIM',charger:'Charger',other:'Other'};
const INV_CONDITION_LABELS = {new:'New',good:'Good',fair:'Fair',poor:'Poor'};
// Mirrors INV_RETURN_REASONS in server.js — keep the two in step.
const INV_RETURN_REASON_LABELS = {damaged:'💥 Damaged',retired:'🗄 Retired',offboarding:'🚪 Offboarding'};
const INV_RETURN_REASON_OPTS = {
  offboarding: '🚪 Offboarding — leaving the company',
  damaged:     '💥 Damaged',
  retired:     '🗄 Retired — end of life',
};
// Retiring an item is a judgement about the asset's life, so it's the
// custodian's call — the holder can only say why they're handing it back.
// The server enforces this too; this just keeps the option out of their reach.
const INV_HOLDER_REASONS = ['offboarding', 'damaged'];
const invReasonOptions = (allowed) => '<option value="">--select--</option>' +
  allowed.map(k => `<option value="${k}">${INV_RETURN_REASON_OPTS[k]}</option>`).join('');
const INV_STATUS_COLORS = {available:'#10b981',assigned:'#f59e0b',damaged:'#ef4444',retired:'#94a3b8'};

// The page is React (frontend/src/pages/Inventory.jsx) since 2026-10-30. The
// items, assignments and open tab stay here: the pop-ups below read them and
// call loadInventory() after a change, which hands the reload to the page.
let INV_REACT = null;   // { reload } from the React page
function invSetReact(o) { INV_REACT = o; }
function invSetData(items, assignments) { _invItems = items; _invAssignments = assignments; }
function invGetData() { return { items: _invItems, assignments: _invAssignments, tab: _invTab }; }
function invSetTab(tab) { _invTab = tab; }

// The pop-ups (add, assign, handover / return request, confirm return, report
// issue, details, photo) are React (frontend/src/pages/InvPopups.jsx, in
// #invPopupsRoot) since 2026-10-31; their markup in app.html and the code
// below stay as the fallback. Each opener hands its arguments over.
let INV_POPUPS_REACT = null, _invPopupWanted = null;
function invPopupsSetReact(o) { INV_POPUPS_REACT = o; if (o && _invPopupWanted) { const [k, a] = _invPopupWanted; _invPopupWanted = null; o[k](...a); } }
function _invPopupReact(kind, args) {
  const root = document.getElementById('invPopupsRoot');
  if (!root || !root.dataset.react) return false;
  if (INV_POPUPS_REACT) INV_POPUPS_REACT[kind](...args);
  else { _invPopupWanted = [kind, args]; emkReactMount('invpopups', root); }
  return true;
}
const _invReasonList = keys => keys.map(k => ({ value: k, label: INV_RETURN_REASON_OPTS[k] }));

async function loadInventory() {
  const root = document.getElementById('invReactRoot');
  if (root) return INV_REACT ? INV_REACT.reload() : emkReactMount('inventory', root);
  // Name kept for the call sites below, but this is no longer "is this person an
  // admin" — it is "may this person edit Inventory", which the panel now decides.
  // It was a hardcoded role list, so setting a hod to View hid nothing: the
  // server refused the write (see userCanDo('edit_inventory') on those routes)
  // while the buttons stayed on screen and failed on click. hod carries
  // edit_inventory by default, so nobody's buttons move today.
  const isAdmin = canDo('edit_inventory');
  if (isAdmin) {
    document.getElementById('invTabAll').style.display = 'inline-flex';
    document.getElementById('invTabAssign').style.display = 'inline-flex';
    document.getElementById('invStats').style.display = 'grid';
  }
  const [items, assignments] = await Promise.all([
    api('/api/inventory/items'),
    isAdmin ? api('/api/inventory/assignments') : Promise.resolve([])
  ]);
  _invItems = Array.isArray(items) ? items : [];
  _invAssignments = Array.isArray(assignments) ? assignments : [];

  if (isAdmin) {
    document.getElementById('invStatTotal').textContent = _invItems.length;
    document.getElementById('invStatAssigned').textContent = _invItems.filter(i=>i.status==='assigned').length;
    document.getElementById('invStatAvailable').textContent = _invItems.filter(i=>i.status==='available').length;
    document.getElementById('invStatHandover').textContent = _invItems.filter(i=>i.handover_status==='pending_handover').length;
  }
  renderInventory();
}

function openInvDetailModal(id) {
  const item = _invItems.find(i => String(i.id) === String(id));
  if (!item) return;
  if (_invPopupReact('detail', [item, {
    emoji: invTypeEmoji(item.type), statusColor: INV_STATUS_COLORS[item.status] || '#94a3b8',
    type: INV_TYPE_PLAIN[item.type] || item.type, condition: INV_CONDITION_LABELS[item.item_condition] || item.item_condition,
    returnReason: INV_RETURN_REASON_LABELS[item.return_reason] || item.return_reason, issueLine: item.issue_id ? invIssueLine(item) : '',
  }])) return;

  const statusColor = INV_STATUS_COLORS[item.status] || '#94a3b8';
  const row = (label, value, mono) => value
    ? `<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #f1f5f9">
         <div style="width:110px;flex-shrink:0;font-size:12px;color:#94a3b8;font-weight:600">${label}</div>
         <div style="font-size:13px;color:#1e293b${mono ? ";font-family:monospace" : ""}">${esc(value)}</div>
       </div>`
    : '';

  const photo = item.photo
    ? `<img src="${esc(item.photo)}" alt="" onclick="viewInvPhoto(${jsArg(item.photo)})"
         style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin-bottom:12px;cursor:zoom-in">`
    : `<div style="height:120px;background:linear-gradient(135deg,#f1f5f9,#e2e8f0);display:flex;align-items:center;justify-content:center;border-radius:8px;margin-bottom:12px;font-size:44px">${invTypeEmoji(item.type)}</div>`;

  document.getElementById('invDetailTitle').innerHTML =
    `${invTypeEmoji(item.type)} ${esc(item.name)}
     <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;background:${statusColor}1a;color:${statusColor};margin-left:6px">${esc(item.status)}</span>`;

  document.getElementById('invDetailBody').innerHTML = photo +
    row('Type', INV_TYPE_PLAIN[item.type] || item.type) +
    row('Brand', item.brand) +
    row('Model', item.model) +
    row('Serial No.', item.serial_number, true) +
    row('Condition', INV_CONDITION_LABELS[item.item_condition] || item.item_condition) +
    row('Assigned to', item.assigned_to_name) +
    row('Added by', item.created_by_name) +
    row('Notes', item.notes) +
    row('Return reason', INV_RETURN_REASON_LABELS[item.return_reason] || item.return_reason) +
    (item.handover_status === 'pending_handover'
      ? `<div style="margin-top:10px;font-size:12px;color:#ef4444;font-weight:600">⚠️ Handover Pending</div>` : '') +
    (item.issue_id
      ? `<div style="margin-top:10px;font-size:12px;color:#334155">${invIssueLine(item)}<div style="margin-top:4px;white-space:pre-wrap">${esc(item.issue_remark||'')}</div></div>` : '');

  document.getElementById('invDetailModal').classList.add('open');
}

// ── Equipment issues ──────────────────────────────────
// The holder reports a fault; it only counts once an admin approves it on the
// Approvals page. Mirrors invIssueApprover in routes/inventory.js.
let _invIssueItemId = null;
const invIsIssueApprover = () => ME.role === 'admin' || canDo('admin_inventory');

function invIssueLine(item) {
  if (item.issue_status === 'pending') {
    return `<div style="font-size:11px;color:#d97706;font-weight:600;margin-top:4px">🛠 Issue reported ${fmtDate(item.issue_date)} · awaiting approval</div>`;
  }
  if (item.issue_status === 'approved') {
    return `<div style="font-size:11px;color:#ef4444;font-weight:600;margin-top:4px">❌ Faulty since ${fmtDate(item.issue_date)}</div>`;
  }
  return '';
}

function openInvIssueModal(itemId, itemName) {
  if (_invPopupReact('issue', [itemId, itemName])) return;
  _invIssueItemId = itemId;
  document.getElementById('invIssueDesc').textContent = itemName;
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const d = document.getElementById('invIssueDate');
  d.value = today;
  d.max = today;
  document.getElementById('invIssueRemark').value = '';
  document.getElementById('invIssueErr').style.display = 'none';
  document.getElementById('invIssueModal').classList.add('open');
}

async function resolveInvIssue(issueId) {
  if (!await appConfirm('Mark this item as repaired? It will count as working again.', 'Mark Repaired')) return;
  const r = await api(`/api/inventory/issues/${issueId}/resolve`, 'POST', {});
  if (r.error) { showToast(r.error, 'error'); return; }
  showToast('Marked as repaired.');
  loadInventory();
}

// Approvals page → Equipment Issues tab.
async function loadInvIssueApprovals() {
  const el = document.getElementById('invIssueApprovalsContent');
  const rows = await api('/api/inventory/issues');
  const list = Array.isArray(rows) ? rows : [];
  setApprovalTabBadge('apprInvIssueBadge', list.length);
  if (!el) return;
  // The list is a React page (frontend/src/pages/InvIssueApprovals.jsx) since
  // 2026-10-30; decideInvIssue stays here.
  if (el.dataset.react) {
    _invIssueList = list;
    if (INV_ISSUE_REACT) return INV_ISSUE_REACT(list);
    return emkReactMount('invissues', el);
  }
  if (!list.length) {
    el.innerHTML = '<div class="empty">✅ No pending equipment issues!</div>';
    return;
  }
  el.innerHTML = `<table>
    <thead><tr><th>Reported By</th><th>Item</th><th>Issue Date</th><th>Remark</th><th>Approve / Reject</th></tr></thead>
    <tbody>${list.map(x => `<tr>
      <td style="font-weight:600">${esc(x.reported_by_name||'—')}</td>
      <td><div style="font-weight:600">${invTypeEmoji(x.item_type)} ${esc(x.item_name||'')}</div><div style="font-size:11px;color:#64748b">${esc([x.brand, x.model].filter(Boolean).join(' · '))}${x.serial_number?' · SN:'+esc(x.serial_number):''}</div></td>
      <td style="font-size:12px;color:#64748b">${fmtDate(x.issue_date)}</td>
      <td style="max-width:320px;white-space:pre-wrap;word-break:break-word">${esc(x.remark||'')}</td>
      <td>
        <button class="action-btn done" onclick="decideInvIssue(${x.id},'approved')">Approve</button>
        <button class="action-btn delete" style="margin-left:6px" onclick="decideInvIssue(${x.id},'rejected')">Reject</button>
      </td>
    </tr>`).join('')}</tbody></table>`;
}
let INV_ISSUE_REACT = null;   // fn(list) from the React list
let _invIssueList = null;
function invIssueSetReact(fn) { INV_ISSUE_REACT = fn; if (fn && _invIssueList) fn(_invIssueList); }

async function decideInvIssue(id, decision) {
  let note = '';
  if (decision === 'rejected') {
    note = await appPromptText('Reason for rejecting (optional):', { title: 'Reject Issue', okLabel: 'Reject', okClass: 'btn btn-danger' });
    if (typeof note !== 'string') return;
  }
  const r = await api(`/api/inventory/issues/${id}/decide`, 'POST', { decision, note });
  if (r.error) { showToast(r.error, 'error'); return; }
  showToast(decision === 'approved' ? 'Issue approved — item marked faulty.' : 'Issue rejected.');
  loadInvIssueApprovals();
  loadApprovalBadge();
}

function invTypeEmoji(type) {
  return {laptop:'💻',keyboard:'⌨️',mouse:'🖱️',mobile:'📱',sim:'📶',charger:'🔌',other:'📦'}[type]||'📦';
}

function viewInvPhoto(src) {
  if (_invPopupReact('photo', [src])) return;
  document.getElementById('invPhotoViewerImg').src = src;
  document.getElementById('invPhotoViewer').style.display = 'flex';
  document.getElementById('invPhotoViewer').classList.add('open');
}

// Adding is contextual to the open tab: from My Equipment the item lands in
// the adder's own equipment (self-assigned); from All Equipment an admin/HOD
// adds it to the shared pool as unassigned stock.
function openInvAddModal() {
  if (_invPopupReact('add', [{ selfAdd: _invTab === 'mine', types: INV_TYPE_LABELS, names: INV_TYPE_PLAIN }])) return;
  _invSelfAddMode = _invTab === 'mine';
  document.getElementById('invAddModalTitle').textContent = _invSelfAddMode ? '＋ Add to My Equipment' : '＋ Add Equipment';
  document.getElementById('invAddModalSaveBtn').textContent = _invSelfAddMode ? 'Add to My Equipment' : 'Save Item';
  document.getElementById('invType').value = 'laptop';
  document.getElementById('invTypeOther').value = '';
  invTypeChanged();
  document.getElementById('invBrand').value = '';
  document.getElementById('invModel').value = '';
  document.getElementById('invSerial').value = '';
  // Condition is an admin's assessment of stock; someone logging kit they
  // already hold doesn't grade it, so it stays hidden (and defaults to 'good')
  // in self-add mode.
  document.getElementById('invCondition').value = 'good';
  document.getElementById('invConditionWrap').style.display = _invSelfAddMode ? 'none' : 'block';
  document.getElementById('invNotes').value = '';
  document.getElementById('invPhotoFile').value = '';
  document.getElementById('invPhotoPreview').style.display = 'none';
  document.getElementById('invAddErr').style.display = 'none';
  _invPhotoBase64 = null;
  document.getElementById('invAddModal').classList.add('open');
}

async function deleteInvItem(id) {
  if (!await appConfirm('This item will be permanently deleted.', 'Delete Item?')) return;
  const r = await api(`/api/inventory/items/${id}`, 'DELETE');
  if (r.error) { showToast(r.error,'error'); return; }
  showToast('Item deleted');
  loadInventory();
}

async function openInvAssignModal(itemId, itemName) {
  if (_invPopupReact('assign', [itemId, itemName])) return;
  _invAssignItemId = itemId;
  document.getElementById('invAssignItemName').textContent = `Item: ${itemName}`;
  document.getElementById('invAssignErr').style.display = 'none';
  const users = await api('/api/users');
  const sel = document.getElementById('invAssignUser');
  sel.innerHTML = '<option value="">Select employee…</option>' +
    (users||[]).filter(u=>u.role!=='client').map(u=>`<option value="${u.id}">${esc(u.name)} (${esc(u.department||'')})</option>`).join('');
  document.getElementById('invAssignModal').classList.add('open');
}

// Step 1, admin-initiated: the custodian starts a handover (e.g. someone is
// leaving). Shares its modal with the holder-initiated path below.
function openInvHandoverModal(assignmentId, itemName, userName) {
  if (_invPopupReact('handover', [{ id: assignmentId, title: 'Initiate Handover', button: 'Mark as Handover Pending',
    desc: `Item: ${itemName} — currently with ${userName}`, reasons: _invReasonList(Object.keys(INV_RETURN_REASON_OPTS)) }])) return;
  _invHandoverAssignId = assignmentId;
  document.getElementById('invHandoverTitle').textContent = 'Initiate Handover';
  document.getElementById('invHandoverSubmitBtn').textContent = 'Mark as Handover Pending';
  document.getElementById('invHandoverDesc').textContent = `Item: ${itemName} — currently with ${userName}`;
  document.getElementById('invHandoverReason').innerHTML = invReasonOptions(Object.keys(INV_RETURN_REASON_OPTS));
  document.getElementById('invHandoverReason').value = '';
  document.getElementById('invHandoverNotes').value = '';
  document.getElementById('invHandoverErr').style.display = 'none';
  document.getElementById('invHandoverModal').classList.add('open');
}

// Step 1, holder-initiated from My Equipment. Same endpoint and same modal —
// only the wording differs, since it's the same act: flag it pending and let
// an admin confirm receipt.
function requestInvReturn(assignmentId, itemName) {
  if (_invPopupReact('handover', [{ id: assignmentId, title: 'Return Equipment', button: 'Request Return',
    desc: `${itemName} — it stays listed as yours until an admin confirms they've received it.`, reasons: _invReasonList(INV_HOLDER_REASONS) }])) return;
  _invHandoverAssignId = assignmentId;
  document.getElementById('invHandoverTitle').textContent = 'Return Equipment';
  document.getElementById('invHandoverSubmitBtn').textContent = 'Request Return';
  document.getElementById('invHandoverDesc').textContent =
    `${itemName} — it stays listed as yours until an admin confirms they've received it.`;
  document.getElementById('invHandoverReason').innerHTML = invReasonOptions(INV_HOLDER_REASONS);
  document.getElementById('invHandoverReason').value = '';
  document.getElementById('invHandoverNotes').value = '';
  document.getElementById('invHandoverErr').style.display = 'none';
  document.getElementById('invHandoverModal').classList.add('open');
}

// Step 2, admin only: confirm the item is physically back. The reason picked
// here is the final call and decides where the item lands, so it is prefilled
// with whatever was claimed at step 1 but stays editable.
function openInvReturnModal(assignmentId, itemName, claimedReason) {
  if (_invPopupReact('ret', [{ id: assignmentId, desc: `${itemName} — confirm you've received it back.`,
    reasons: _invReasonList(Object.keys(INV_RETURN_REASON_OPTS)), claimed: claimedReason || '' }])) return;
  _invReturnAssignId = assignmentId;
  document.getElementById('invReturnDesc').textContent = `${itemName} — confirm you've received it back.`;
  document.getElementById('invReturnReason').innerHTML = invReasonOptions(Object.keys(INV_RETURN_REASON_OPTS));
  document.getElementById('invReturnReason').value = claimedReason || '';
  document.getElementById('invReturnErr').style.display = 'none';
  invReturnReasonChanged();
  document.getElementById('invReturnModal').classList.add('open');
}

// ══════════════════════════════════════════════════════
// LOGS — deleted-records archive (admin only)
// ══════════════════════════════════════════════════════
// The page is React (frontend/src/pages/Logs.jsx) — table, record pop-up and
// batch restore all live there. What is left here is the mount: the first
// loadLogs() draws the component, later ones (the page reopened from the nav)
// ask it to reload. The vanilla table that used to sit here was unreachable —
// #logsReactRoot is always in app.html, so loadLogs returned before it, and
// the ids it read (logsContent, logsSearch, logsFilterTable) are long gone.
let LOGS_REACT_RELOAD = null;
function logsSetReactReload(fn){ LOGS_REACT_RELOAD = fn; }

async function loadLogs() {
  const root = document.getElementById('logsReactRoot');
  if (!root) return;
  return LOGS_REACT_RELOAD ? LOGS_REACT_RELOAD() : emkReactMount('logs', root);
}
