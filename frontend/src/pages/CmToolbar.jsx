// Client Master → the All / Active / Inactive / Showing cards (CmStats, in
// #cmStatsRoot) and the toolbar with the bulk-upload panel (CmToolbar, in
// #cmToolbarRoot) — were static markup in app.html driven by public/js/clients.js.
// clients.js keeps what they show in CM_BAR and tells both through
// cmBarSubscribe; a filter change goes back through cmSetF, which redraws the
// list. The buttons run clients.js's own functions.
import { useEffect, useRef, useState } from 'react';
import { legacy, css, api } from '../lib/app.js';
import SearchSelect from '../components/SearchSelect.jsx';

// ── 📁 Upload Projects ──
// Many clients' projects from one CSV: client_name, project (header optional;
// columns found by header name when there is one). Rows go to
// POST /api/client-projects/bulk; the answer is shown under the button.
// A small CSV reader: commas, quotes ("Kala, Jaipur") and doubled quotes.
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(Boolean));
}
const PROJECTS_SAMPLE = 'client_name,project\nAmbraee,ERP\nAmbraee,Google Sheet\nSohan Health Care,Website\n';
// The panel, under the toolbar like the client Bulk Upload one; its button sits in the toolbar row.
function ProjectsUpload() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const file = useRef(null);
  const sample = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([PROJECTS_SAMPLE], { type: 'text/csv' }));
    a.download = 'client_projects_sample.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const upload = async () => {
    const f = file.current && file.current.files[0];
    if (!f) { setRes({ error: 'Choose a CSV file first.' }); return; }
    const all = parseCsv(await f.text());
    const head = (all[0] || []).map(h => h.toLowerCase().replace(/[\s_-]+/g, ''));
    const hasHead = head.some(h => h.includes('client')) && head.some(h => h.includes('project'));
    const ci = hasHead ? head.findIndex(h => h.includes('client')) : 0;
    const pi = hasHead ? head.findIndex(h => h.includes('project')) : 1;
    const data = hasHead ? all.slice(1) : all;
    if (!data.length) { setRes({ error: 'The file has no rows.' }); return; }
    setBusy(true); setRes(null);
    const r = await api('/api/client-projects/bulk', 'POST', { rows: data.map(row => ({ client_name: row[ci] || '', name: row[pi] || '' })) });
    setBusy(false);
    // Row numbers as the spreadsheet shows them (the header is row 1).
    const off = hasHead ? 1 : 0;
    setRes(r && !r.error ? { ...r, problems: (r.problems || []).map(p => ({ ...p, row: p.row + off })) } : { error: (r && r.error) || 'Upload failed' });
    if (r && !r.error && file.current) file.current.value = '';
  };
  return (
        <div className="cm-bulk" id="cmProjectsPanel" ref={css('display:block')}>
          <div className="cm-bulk-head">
            <div>
              <div className="cm-bulk-head-text">Upload Projects (CSV)</div>
              <div className="cm-bulk-head-sub">Columns: client_name, project. One project per row; a client can have many rows. Projects a client already has are skipped.</div>
            </div>
            <button className="cm-btn-ghost" ref={css('padding:6px 12px;font-size:12px')} onClick={sample}>⬇ Sample</button>
          </div>
          <div className="cm-bulk-row">
            <input type="file" accept=".csv,.txt" ref={file} />
            <button className="cm-btn-primary" ref={css('padding:8px 14px;font-size:12px')} disabled={busy} onClick={upload}>{busy ? 'Uploading…' : '📤 Upload'}</button>
          </div>
          {res ? (
            <div id="cmProjectsResult" ref={css('margin-top:10px;font-size:13px')}>
              {res.error ? <div ref={css('color:#dc2626')}>{res.error}</div> : <>
                <div ref={css('color:#15803d;font-weight:600')}>{`${res.added} added · ${res.restored} restored · ${res.existing} already there${res.problems.length ? ` · ${res.problems.length} not added` : ''}`}</div>
                {res.problems.length ? <div ref={css('margin-top:6px;color:#b91c1c;max-height:160px;overflow:auto')}>{res.problems.map(p => <div key={p.row}>{`Row ${p.row}: ${p.error}`}</div>)}</div> : null}
              </>}
            </div>
          ) : null}
        </div>
  );
}

function useBar() {
  const [bar, setBar] = useState(null);
  useEffect(() => legacy('cmBarSubscribe', b => setBar(b && { ...b })), []);
  return bar;
}
const num = v => (v === undefined || v === null ? '—' : String(v));

const CARDS = [['', 'total', 'All Clients', 'Show all clients', ''], ['active', 'active', 'Active', 'Show active clients only', 'color:#16a34a'],
  ['inactive', 'inactive', 'Inactive', 'Show inactive clients only', 'color:#64748b']];

export function CmStats() {
  const bar = useBar();
  if (!bar) return null;
  return (
    <>
      {CARDS.map(([status, key, label, title, color]) => (
        <div key={key} className={`cm-stat cm-stat-pick${bar.status === status ? ' is-sel' : ''}`} data-status={status} title={title}
          onClick={() => legacy('cmSetStatus', status)}>
          <div className="cm-stat-val" ref={color ? css(color) : undefined}>{num(bar.counts[key])}</div>
          <div className="cm-stat-label">{label}</div>
        </div>
      ))}
      <div className="cm-stat">
        <div className="cm-stat-val">{num(bar.counts.visible)}</div>
        <div className="cm-stat-label">Showing</div>
      </div>
    </>
  );
}

// The two dropdowns carry the old <select>s' inline look.
const PICK = { padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontFamily: "'Inter', sans-serif", outline: 'none', color: '#1e293b', background: '#fff', cursor: 'pointer' };
const ADDED = [{ value: '', label: 'Added: All time' }, { value: 'this_month', label: 'Added: This month' },
  { value: 'last_month', label: 'Added: Last month' }, { value: 'custom', label: 'Added: Pick dates…' }];
const DATE = 'padding:8px 10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px';
// The old markup's shown / hidden parts were switched with style.display, which
// is how the browser then writes their style attribute; this does the same.
// `on` undefined leaves the element as the markup wrote it.
const shown = (base, on, display = '') => el => {
  if (!el) return;
  if (base != null) el.setAttribute('style', base);
  if (on !== undefined) el.style.display = on ? display : 'none';
};

export function CmToolbar() {
  const bar = useBar();
  const [bulkTouched, setBulkTouched] = useState(false);
  const [prjOpen, setPrjOpen] = useState(false);   // the Upload Projects panel
  useEffect(() => { if (bar && bar.bulk) setBulkTouched(true); }, [bar && bar.bulk]);
  if (!bar) return null;
  const f = bar.f;
  const set = patch => legacy('cmSetF', patch);
  return (
    <>
      <div className="cm-toolbar">
        <input className="cm-search" type="text" id="cmSearch" placeholder="🔍 Search clients..." value={f.q} onChange={e => set({ q: e.target.value })} />
        <SearchSelect value={f.dept} onChange={v => set({ dept: v })} style={PICK} placeholder="All Departments"
          options={[{ value: '', label: 'All Departments' }, ...bar.depts.map(d => ({ value: d, label: d }))]} />
        {/* When the client was added (clients.created_at); clients.js cmAddedRange */}
        <SearchSelect value={f.added} onChange={v => set({ added: v })} style={PICK} placeholder="Added: All time" options={ADDED} />
        <span id="cmAddedDates" ref={shown('display:none;align-items:center;gap:6px;font-size:12px;color:#64748b', f.added === 'custom' ? true : undefined, 'inline-flex')}>
          <input type="date" ref={css(DATE)} value={f.from} onChange={e => set({ from: e.target.value })} />
          to
          <input type="date" ref={css(DATE)} value={f.to} onChange={e => set({ to: e.target.value })} />
        </span>
        <div className="cm-add-row cm-actions-nowrap">
          <button className="cm-btn-primary" id="cmAddBtn" ref={shown(null, bar.show.add)} onClick={() => legacy('cmOpenAddModal')}>+ Add Client</button>
          <button className="cm-btn-ghost" id="cmBulkBtn" ref={shown(null, bar.show.add)} onClick={() => legacy('cmToggleBulk')}>📂 Bulk Upload</button>
          <button className="cm-btn-ghost" id="cmProjectsBtn" onClick={() => setPrjOpen(o => !o)}>📁 Upload Projects</button>
          <button className="cm-btn-ghost" onClick={() => legacy('cmExportExcel')}>⬇ Excel</button>
          <button className="cm-btn-ghost" id="cmCrmBtn" ref={shown('display:none', bar.show.crm)} onClick={() => legacy('cmOpenCrmTransfer')}>🔀 Transfer CRM</button>
        </div>
      </div>

      <div id="cmBulkPanel" className="cm-bulk" ref={shown('display:none', bulkTouched || bar.bulk ? bar.bulk : undefined, 'block')}>
        <div className="cm-bulk-head">
          <div>
            <div className="cm-bulk-head-text">Bulk Upload (CSV)</div>
            <div className="cm-bulk-head-sub">One client name per line. First row can be a header.</div>
          </div>
          <button className="cm-btn-ghost" ref={css('padding:6px 12px;font-size:12px')} onClick={() => legacy('cmDownloadSample')}>⬇ Sample</button>
        </div>
        <div className="cm-bulk-row">
          {/* cmBulkUpload reads and clears this input by its id */}
          <input type="file" id="cmBulkFile" accept=".csv,.txt" />
          <button className="cm-btn-primary" ref={css('padding:8px 14px;font-size:12px')} onClick={() => legacy('cmBulkUpload')}>📤 Upload</button>
        </div>
      </div>
      {prjOpen ? <ProjectsUpload /> : null}
    </>
  );
}
