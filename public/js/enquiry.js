// ══════════════════════════════════════════════════════
// ENQUIRY CAPTURE — sales enquiries, the same fields as the Google Form
// ══════════════════════════════════════════════════════
// API: backend/routes/enquiries.js. Access Control page 'enquiry':
// View lists, edit_enquiry adds, admin_enquiry deletes. The status, and adding
// a converted enquiry to Client Master, are for edit_enquiry and the CRMs.
let EC_ALL = [];
let EC_OPTS = null;

const ecDate = d => {
  if (!d) return '';
  const x = new Date(String(d).slice(0, 10) + 'T00:00:00');
  return isNaN(x) ? String(d) : x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const ecList = v => String(v || '').split('||').filter(Boolean);
// Form platforms whose department is spelled differently (lower case both
// sides). Landing Page, Whatsapp Marketing, GMB Ads, Sales Consutation, Book
// Writing and Lead Nuturing Funnel have no department of their own.
const EC_PLATFORM_DEPT = {
  'linkedin management': 'linkedin',
  'sm management': 'social media',
  'website designing & development': 'website design & development',
  'youtube ads': 'youtube',
};

// The list is a React page (frontend/src/pages/Enquiry.jsx) since 2026-10-30.
// EC_ALL stays here: the form, status change, import, delete and Add in Client
// Master below still work on it, and ecRender() / ecLoad() hand the redraw
// and the reload to the React page.
let EC_REACT = null;   // { reload, render } from the React page
function ecSetReact(o){ EC_REACT = o; }
function ecSetData(rows, opts){ EC_ALL = rows; if (opts && !opts.error) EC_OPTS = opts; }
function ecGetData(){ return { rows: EC_ALL, opts: EC_OPTS }; }

async function ecLoad() {
  const root = document.getElementById('ecReactRoot');
  if (root) return EC_REACT ? EC_REACT.reload() : emkReactMount('enquiry', root);
}

// Enquiries whose latest save did not reach the Google sheet (its read quota
// is shared and runs out) are sent again from here; the server paces it.
let EC_RETRYING = false, EC_RETRY_TIMER = null;
const ecPageOpen = () => !!document.getElementById('page-enquiry')?.classList.contains('active');
async function ecRetrySheet() {
  clearTimeout(EC_RETRY_TIMER);
  EC_RETRY_TIMER = null;
  if (EC_RETRYING || !ecPageOpen()) return;
  EC_RETRYING = true;
  let left = 0;
  try {
    const r = await api('/api/enquiries/sheet-retry', 'POST', {});
    if (!r || r.error) return;
    left = r.left;
    if (!r.sent) return;
    const rows = await api('/api/enquiries');
    if (Array.isArray(rows) && ecPageOpen()) { EC_ALL = rows; ecRender(); }
  } finally {
    EC_RETRYING = false;
    // While the page stays open, try again once the per-minute quota has turned over.
    if (left && ecPageOpen()) EC_RETRY_TIMER = setTimeout(ecRetrySheet, 70000);
  }
}

function ecRender() {
  if (EC_REACT) return EC_REACT.render();
}


// The form is React (frontend/src/pages/EnquiryForm.jsx) since 2026-10-30,
// mounted into #ecFormRoot; #ecModal and ecSave stay as the fallback.
let EC_FORM_REACT = null, _ecFormWanted;
function ecFormSetReact(fn) { EC_FORM_REACT = fn; if (fn && _ecFormWanted !== undefined) { const id = _ecFormWanted; _ecFormWanted = undefined; fn(id); } }
async function ecOpenForm(id) {
  const root = document.getElementById('ecFormRoot');
  if (root && root.dataset.react) {
    if (EC_FORM_REACT) return EC_FORM_REACT(id);
    _ecFormWanted = id === undefined ? null : id;
    return emkReactMount('enquiryform', root);
  }
}

async function ecImport() {
  if (!canDo('admin_enquiry')) return;
  if (!await appConfirm('Bring in every response from the Enquiry Capture Google Form sheet? Responses already in the app are skipped, so this is safe to run again.', 'Import from sheet?')) return;
  const btn = document.getElementById('ecImportBtn');
  btn.disabled = true;
  const r = await api('/api/enquiries/import-sheet', 'POST', {});
  btn.disabled = false;
  if (!r || r.error) { showToast((r && r.error) || 'Import failed', 'error'); return; }
  showToast(`Imported ${r.imported} enquir${r.imported === 1 ? 'y' : 'ies'} · ${r.skipped} already in the app`
    + (r.linked ? ` · ${r.linked} matched to Client Master` : ''));
  ecLoad();
}

// ── Status and Client Master ────────────────────────────
async function ecSetStatus(id, sel) {
  const e = EC_ALL.find(x => x.id === id);
  if (!e) return;
  const prev = e.status || 'Open', status = sel.value;
  if (status === prev) return;
  const hadDate = !!e.conversion_date;
  sel.disabled = true;
  const r = await api(`/api/enquiries/${id}/status`, 'PUT', { status });
  sel.disabled = false;
  if (!r || r.error) { sel.value = prev; showToast((r && r.error) || 'Could not change the status', 'error'); return; }
  Object.assign(e, r.enquiry);
  ecRender();
  // Not in the sheet yet: start the page's retry (it waits out the minute).
  if (Number(e.sheet_pending)) ecRetrySheet();
  // Into or out of Paused: write Pause / Active into the client's Onboarding
  // FMS row now; if the sheet is busy, the Client Master retry finishes it.
  if (r.fmsHold) {
    const word = r.fmsHold === 'Pause' ? 'Paused' : 'Resumed';
    const f = await api('/api/clients/fms-retry', 'POST', {});
    const err = f && (f.errors || []).find(x => x.clientId === e.client_id);
    if (err) showToast(`Status saved, but the Onboarding FMS was not changed: ${err.error}`, 'error');
    else if (!f || f.error || f.failed) {
      showToast(`${word}. Google Sheets is busy, so the Onboarding FMS will be updated automatically in a minute or two.`);
      if (typeof cmRetryFms === 'function') cmRetryFms();
    } else showToast(r.fmsHold === 'Pause' ? `${word} · its Onboarding FMS steps are on hold` : `${word} · its Onboarding FMS steps are back`);
    return;
  }
  if (r.warning) showToast(r.warning, r.queued ? 'success' : 'error');
  else if (status === 'Converted' && !hadDate && e.conversion_date) showToast(`Marked as Converted · Conversion Date set to ${ecDate(e.conversion_date)}`);
  else showToast(`Status set to ${status}`);
}

// Opens Add Client filled in from the enquiry. The CRM fills in the rest
// (kickstart date, handlers, billing name, login) and saves; cmAdd() then
// calls ecClientAdded() to tie the new client to this enquiry.
async function ecAddToClientMaster(id) {
  const e = EC_ALL.find(x => x.id === id);
  if (!e || e.client_id) return;
  const m = await api(`/api/enquiries/${id}/client-match`);
  if (!m || m.error) { showToast((m && m.error) || 'Could not check Client Master', 'error'); return; }
  if (m.match) {
    const c = m.match;
    const pickd = await _showAppPrompt({
      title: 'Already in Client Master?',
      message: `Client Master already has "${c.name}"${c.brand_name && c.brand_name !== c.name ? ` (brand ${c.brand_name})` : ''}. Link this enquiry to that client instead of adding it again?`,
      buttons: [
        { label: 'Cancel', className: 'btn btn-outline', value: null },
        { label: 'Add as new client', className: 'btn btn-outline', value: 'new' },
        { label: 'Link to it', className: 'btn btn-primary', value: 'link' },
      ],
    });
    if (!pickd) return;
    if (pickd === 'link') {
      const r = await api(`/api/enquiries/${id}/client`, 'PUT', { client_id: c.id });
      if (!r || r.error) { showToast((r && r.error) || 'Could not link the enquiry', 'error'); return; }
      showToast(`Linked to ${r.client_name} in Client Master`);
      ecLoad();
      return;
    }
  }
  // The form's department and handler lists come from CM_USERS, which only
  // the Client Master page loads.
  if (!CM_USERS.length) {
    const users = await api('/api/users');
    CM_USERS = Array.isArray(users) ? users : [];
  }
  // Each platform ticks its department: the same name (Google Ads, SEO, …) or
  // the department EC_PLATFORM_DEPT names. Platforms without one tick nothing.
  const wanted = [...new Set(ecList(e.platforms).map(p => p.toLowerCase().trim()).flatMap(p => [p, EC_PLATFORM_DEPT[p]]).filter(Boolean))];
  cmOpenAddModal({ name: e.client_name || '', brand: e.business_name || '', mobile: e.mobile || '', depts: wanted, platforms: ecList(e.platforms) });
  CM_ADD_FROM_ENQUIRY = id;
}

async function ecClientAdded(enquiryId, clientId) {
  if (clientId) {
    const r = await api(`/api/enquiries/${enquiryId}/client`, 'PUT', { client_id: clientId });
    if (!r || r.error) showToast('Client added, but the enquiry could not be linked to it: ' + ((r && r.error) || 'unknown error'), 'error');
  }
  if (document.getElementById('page-enquiry')?.classList.contains('active')) ecLoad();
}

async function ecDelete(id) {
  const e = EC_ALL.find(x => x.id === id);
  if (!e || !await appConfirm(`Delete the enquiry for ${e.client_name}? This cannot be undone.`, 'Delete enquiry?')) return;
  const r = await api('/api/enquiries/' + id, 'DELETE');
  if (!r || r.error) { showToast((r && r.error) || 'Could not delete', 'error'); return; }
  showToast('Enquiry deleted');
  ecLoad();
}
