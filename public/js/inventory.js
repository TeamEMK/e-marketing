// ══════════════════════════════════════════════════════
// INVENTORY JS
// ══════════════════════════════════════════════════════
let _invItems = [], _invAssignments = [], _invTab = 'mine';

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
// #invPopupsRoot) since 2026-10-31. Their markup and the openers' own bodies
// are gone; each opener now only hands its arguments over.
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
}

function openInvDetailModal(id) {
  const item = _invItems.find(i => String(i.id) === String(id));
  if (!item) return;
  if (_invPopupReact('detail', [item, {
    emoji: invTypeEmoji(item.type), statusColor: INV_STATUS_COLORS[item.status] || '#94a3b8',
    type: INV_TYPE_PLAIN[item.type] || item.type, condition: INV_CONDITION_LABELS[item.item_condition] || item.item_condition,
    returnReason: INV_RETURN_REASON_LABELS[item.return_reason] || item.return_reason, issueLine: item.issue_id ? invIssueLine(item) : '',
  }])) return;
}

// ── Equipment issues ──────────────────────────────────
// The holder reports a fault; it only counts once an admin approves it on the
// Approvals page. Mirrors invIssueApprover in routes/inventory.js.
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
}

// Adding is contextual to the open tab: from My Equipment the item lands in
// the adder's own equipment (self-assigned); from All Equipment an admin/HOD
// adds it to the shared pool as unassigned stock.
function openInvAddModal() {
  if (_invPopupReact('add', [{ selfAdd: _invTab === 'mine', types: INV_TYPE_LABELS, names: INV_TYPE_PLAIN }])) return;
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
}

// Step 1, admin-initiated: the custodian starts a handover (e.g. someone is
// leaving). Shares its modal with the holder-initiated path below.
function openInvHandoverModal(assignmentId, itemName, userName) {
  if (_invPopupReact('handover', [{ id: assignmentId, title: 'Initiate Handover', button: 'Mark as Handover Pending',
    desc: `Item: ${itemName} — currently with ${userName}`, reasons: _invReasonList(Object.keys(INV_RETURN_REASON_OPTS)) }])) return;
}

// Step 1, holder-initiated from My Equipment. Same endpoint and same modal —
// only the wording differs, since it's the same act: flag it pending and let
// an admin confirm receipt.
function requestInvReturn(assignmentId, itemName) {
  if (_invPopupReact('handover', [{ id: assignmentId, title: 'Return Equipment', button: 'Request Return',
    desc: `${itemName} — it stays listed as yours until an admin confirms they've received it.`, reasons: _invReasonList(INV_HOLDER_REASONS) }])) return;
}

// Step 2, admin only: confirm the item is physically back. The reason picked
// here is the final call and decides where the item lands, so it is prefilled
// with whatever was claimed at step 1 but stays editable.
function openInvReturnModal(assignmentId, itemName, claimedReason) {
  if (_invPopupReact('ret', [{ id: assignmentId, desc: `${itemName} — confirm you've received it back.`,
    reasons: _invReasonList(Object.keys(INV_RETURN_REASON_OPTS)), claimed: claimedReason || '' }])) return;
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
