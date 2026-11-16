// Client Master → ⏰ Delays tab (#cmDelaysRoot, mounted by clients.js cmTab): late
// tasks per client over a date window (GET /api/client-delays), for the clients this
// person sees on Client Master. Late = a delegation done after its due date, or any
// task still pending past it (the same rule as each client's own Delays card).
// A row opens that client's page for the same window, where the Delays card has
// the member-wise and task-wise detail.
import { useEffect, useState } from 'react';
import { api, legacy, css } from '../lib/app.js';

const NUM = 'text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums';
const IN = 'padding:6px 9px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:12px;outline:none';
const days = n => `${n} day${n === 1 ? '' : 's'}`;
// The current month (IST), as Client Master's client page defaults to.
const monthRange = () => {
  const ist = new Date(Date.now() + 5.5 * 3600e3);
  const y = ist.getUTCFullYear(), m = ist.getUTCMonth();
  const pad = v => String(v).padStart(2, '0');
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(new Date(Date.UTC(y, m + 1, 0)).getUTCDate())}` };
};

export default function CmDelays() {
  const [range, setRange] = useState(monthRange);
  const [draft, setDraft] = useState(range);
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let live = true;
    setRows(null);
    api(`/api/client-delays?from=${range.from}&to=${range.to}`).then(r => { if (live) setRows(r); });
    return () => { live = false; };
  }, [range.from, range.to]);
  const apply = () => { if (draft.from && draft.to && draft.from <= draft.to) setRange({ ...draft }); };
  const list = Array.isArray(rows) ? rows : [];
  const totals = list.reduce((a, r) => ({ late: a.late + r.late, open: a.open + r.open, days: a.days + r.total_days }), { late: 0, open: 0, days: 0 });
  return (
    <div className="task-table-card" ref={css('padding:0')}>
      <div className="card-head" ref={css('padding:14px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap')}>
        <div>
          <div className="card-head-title">⏰ Delays by Client</div>
          <div ref={css('font-size:12px;color:#94a3b8;margin-top:2px')}>Late = done after the due date, or still pending past it. Tasks due in the window below.</div>
        </div>
        <div ref={css('display:flex;gap:6px;align-items:center')}>
          <input type="date" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} ref={css(IN)} />
          <span ref={css('color:#94a3b8;font-size:12px')}>to</span>
          <input type="date" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} ref={css(IN)} />
          <button className="btn btn-primary" ref={css('padding:6px 14px;font-size:12px')} onClick={apply}>Apply</button>
        </div>
      </div>
      {rows === null ? <div className="empty" ref={css('padding:24px')}>Loading…</div>
        : !Array.isArray(rows) ? <div className="empty" ref={css('padding:24px;color:#dc2626')}>{(rows && rows.error) || 'Could not load the delays'}</div>
        : !list.length ? <div className="empty" ref={css('padding:24px')}>No delays in this window 🎉</div>
        : <>
            <div ref={css('padding:10px 16px;font-size:13px;color:#475569;background:#f8fafc;border-bottom:1px solid #f1f5f9')}>
              {`${list.length} client${list.length === 1 ? '' : 's'} with delays · ${totals.late} late task${totals.late === 1 ? '' : 's'} (${totals.open} still open) · ${days(totals.days)} in all`}
            </div>
            <div ref={css('overflow-x:auto')}>
              <table ref={css('width:100%;min-width:760px')}>
                <thead><tr><th>Client</th><th ref={css(NUM)}>Late tasks</th><th ref={css(NUM)}>Still open</th><th ref={css(NUM)}>Done late</th>
                  <th ref={css(NUM)}>Total delay</th><th ref={css(NUM)}>Longest</th><th>Most delay from</th></tr></thead>
                <tbody>
                  {list.map(r => (
                    <tr key={r.client_id} ref={css('cursor:pointer')} title={`Open ${r.name}: who is late on what`}
                      onClick={() => legacy('cmShowDetail', r.client_id, range.from, range.to)}>
                      <td ref={css('font-weight:600;color:#1e293b')}>{r.name}</td>
                      <td ref={css(NUM + ';font-weight:700')}>{r.late}</td>
                      <td ref={css(NUM + ';color:' + (r.open ? '#b91c1c;font-weight:700' : '#94a3b8'))}>{r.open}</td>
                      <td ref={css(NUM + ';color:#b45309')}>{r.done_late}</td>
                      <td ref={css(NUM + ';font-weight:700;color:#b91c1c')}>{days(r.total_days)}</td>
                      <td ref={css(NUM + ';color:#64748b')}>{days(r.max_days)}</td>
                      <td ref={css('white-space:nowrap;color:#475569')}>{r.worst ? <>{r.worst.name} <span ref={css('color:#94a3b8;font-size:12px')}>{`(${days(r.worst.days)})`}</span></> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>}
    </div>
  );
}
