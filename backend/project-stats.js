// Task counts per project of one client, for the client dashboards (Client Master's
// client page and the client portal). Same window and same rules as their task
// cards: delegation + checklist tasks whose due date falls in [from, to];
// overdue = still pending with a due date before today. Revised is delegation only.
//
// Returns [] when the client has no projects at all. Otherwise one row per active
// project (even with no tasks), then archived projects that still have tasks in the
// window, then "No project" for the client's tasks without one (tasks from before
// its projects existed, or from the WhatsApp bot), when there are any.
// Row: { id, name, archived, total, pending, completed, revised, overdue }.
module.exports = projectBreakdown;
module.exports.projectTasks = projectTasks;
module.exports.delayReport = delayReport;
module.exports.delaysByClient = delaysByClient;
module.exports.openTaskStatus = openTaskStatus;

// Where each open task of a client stands right now (not limited to a window):
// every delegation task still pending or revised, and checklist tasks pending and
// due today or earlier (a recurring checklist's future dates are not news).
// Row: { id, type, description, project, doer, due_date, due_time, state, state_label,
// days, note, sub_done, sub_total, last_comment: { text, by, at } | null }.
// state, first that applies: approval (waiting for approval), revised (revision
// asked), nodate (doer has not set the date; note = their reason), client (waiting
// on the client; note = what is needed), overdue (days past due), today, upcoming
// (days left). Ordered: overdue (most days first), today, client, approval,
// revised, nodate, then upcoming by date. At most 500.
async function openTaskStatus(db, clientId) {
  const [rows] = await db.query(
    `SELECT t.id, 'delegation' AS type, t.description, t.status, p.name AS project, COALESCE(u.name,'—') AS doer,
            DATE_FORMAT(t.due_date,'%Y-%m-%d') AS due_date, TIME_FORMAT(t.due_time,'%H:%i') AS due_time,
            COALESCE(t.waiting_approval,0) AS waiting_approval, COALESCE(t.awaiting_due_date,0) AS awaiting_due_date,
            t.no_due_date_reason, t.client_ask, DATE_FORMAT(t.client_ask_by,'%Y-%m-%d') AS client_ask_by,
            DATEDIFF(t.due_date, CURDATE()) AS days_to_due
       FROM delegation_tasks t LEFT JOIN users u ON u.id=t.assigned_to LEFT JOIN client_projects p ON p.id=t.project_id
      WHERE t.client_id=? AND t.status IN ('pending','revised')
     UNION ALL
     SELECT t.id, 'checklist', t.description, t.status, p.name, COALESCE(u.name,'—'),
            DATE_FORMAT(t.due_date,'%Y-%m-%d'), NULL, 0, 0, NULL, NULL, NULL, DATEDIFF(t.due_date, CURDATE())
       FROM checklist_tasks t LEFT JOIN users u ON u.id=t.assigned_to LEFT JOIN client_projects p ON p.id=t.project_id
      WHERE t.client_id=? AND t.status='pending' AND t.due_date <= CURDATE()
      LIMIT 500`, [clientId, clientId]);
  if (!rows.length) return [];
  const delIds = rows.filter(r => r.type === 'delegation').map(r => r.id);
  const chlIds = rows.filter(r => r.type === 'checklist').map(r => r.id);
  // Sub-tasks (delegation only) and the latest comment of each task.
  const subs = new Map();
  if (delIds.length) {
    const [s] = await db.query(
      `SELECT task_id, COUNT(*) AS total, SUM(status='completed') AS done FROM task_subtasks WHERE task_id IN (?) GROUP BY task_id`, [delIds]);
    s.forEach(r => subs.set(Number(r.task_id), { total: Number(r.total) || 0, done: Number(r.done) || 0 }));
  }
  const comments = new Map();
  for (const [type, ids] of [['delegation', delIds], ['checklist', chlIds]]) {
    if (!ids.length) continue;
    const [c] = await db.query(
      `SELECT c.task_id, c.comment, COALESCE(u.name,'—') AS by_name, DATE_FORMAT(c.created_at,'%Y-%m-%d %H:%i') AS at
         FROM task_comments c JOIN (SELECT task_id, MAX(id) AS mid FROM task_comments WHERE task_type=? AND task_id IN (?) GROUP BY task_id) last
           ON last.mid=c.id
         LEFT JOIN users u ON u.id=c.user_id`, [type, ids]);
    c.forEach(r => comments.set(type + Number(r.task_id), { text: r.comment, by: r.by_name, at: r.at }));
  }
  const ORDER = { overdue: 0, today: 1, client: 2, approval: 3, revised: 4, nodate: 5, upcoming: 6 };
  const out = rows.map(r => {
    const d = r.days_to_due == null ? null : Number(r.days_to_due);
    let state, label, note = null, days = null;
    if (Number(r.waiting_approval)) { state = 'approval'; label = 'Waiting for approval'; }
    else if (r.status === 'revised') { state = 'revised'; label = 'Revision asked'; }
    else if (Number(r.awaiting_due_date) || !r.due_date) { state = 'nodate'; label = 'Due date not set yet'; note = r.no_due_date_reason || null; }
    else if (r.client_ask) { state = 'client'; label = 'Waiting on the client'; note = r.client_ask + (r.client_ask_by ? ` (by ${r.client_ask_by.split('-').reverse().join('-')})` : ''); }
    else if (d < 0) { state = 'overdue'; days = -d; label = `Overdue by ${-d} day${d === -1 ? '' : 's'}`; }
    else if (d === 0) { state = 'today'; days = 0; label = 'Due today'; }
    else { state = 'upcoming'; days = d; label = `Due in ${d} day${d === 1 ? '' : 's'}`; }
    const sub = r.type === 'delegation' ? subs.get(Number(r.id)) : null;
    return {
      id: r.id, type: r.type, description: r.description, project: r.project, doer: r.doer,
      due_date: r.due_date, due_time: r.due_time, state, state_label: label, days, note,
      sub_done: sub ? sub.done : 0, sub_total: sub ? sub.total : 0,
      last_comment: comments.get(r.type + Number(r.id)) || null,
    };
  });
  return out.sort((a, b) => (ORDER[a.state] - ORDER[b.state])
    || (a.state === 'overdue' ? b.days - a.days : 0)
    || String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));
}

// The same delays across clients (Client Master → ⏰ Delays): one row per client
// with any late task in the window, limited by `scope` ({ sql, params } on alias c,
// from clientMasterScope; null = every client). Row: { client_id, name, late, open,
// done_late, total_days, max_days, worst: { name, days } — the member with the most
// days late for that client }. Most total days first.
async function delaysByClient(db, from, to, scope) {
  const sc = scope ? ' AND ' + scope.sql : '';
  const sp = scope ? scope.params : [];
  const [rows] = await db.query(
    `SELECT c.id AS client_id, COALESCE(NULLIF(TRIM(c.brand_name),''), c.name) AS client, t.assigned_to AS doer_id,
            COALESCE(u.name,'—') AS doer, t.status,
            CASE WHEN t.status='completed' THEN DATEDIFF(DATE(t.completed_at), t.due_date)
                 ELSE DATEDIFF(CURDATE(), t.due_date) END AS days_late
       FROM delegation_tasks t JOIN clients c ON c.id=t.client_id LEFT JOIN users u ON u.id=t.assigned_to
      WHERE t.due_date BETWEEN ? AND ?${sc}
        AND ((t.status='completed' AND t.completed_at IS NOT NULL AND DATE(t.completed_at) > t.due_date)
          OR (t.status='pending' AND t.due_date < CURDATE()))
     UNION ALL
     SELECT c.id, COALESCE(NULLIF(TRIM(c.brand_name),''), c.name), t.assigned_to, COALESCE(u.name,'—'), t.status,
            DATEDIFF(CURDATE(), t.due_date)
       FROM checklist_tasks t JOIN clients c ON c.id=t.client_id LEFT JOIN users u ON u.id=t.assigned_to
      WHERE t.due_date BETWEEN ? AND ?${sc} AND t.status='pending' AND t.due_date < CURDATE()`,
    [from, to, ...sp, from, to, ...sp]);
  const by = new Map();
  for (const r of rows) {
    const id = Number(r.client_id), days = Number(r.days_late) || 0;
    if (!by.has(id)) by.set(id, { client_id: id, name: r.client, late: 0, open: 0, done_late: 0, total_days: 0, max_days: 0, _m: new Map() });
    const c = by.get(id);
    c.late++;
    if (r.status === 'completed') c.done_late++; else c.open++;
    c.total_days += days;
    c.max_days = Math.max(c.max_days, days);
    const mk = r.doer_id == null ? 'none' : Number(r.doer_id);
    const m = c._m.get(mk) || { name: r.doer, days: 0 };
    m.days += days;
    c._m.set(mk, m);
  }
  return [...by.values()].map(c => {
    const worst = [...c._m.values()].sort((a, b) => b.days - a.days)[0] || null;
    delete c._m;
    return { ...c, worst };
  }).sort((a, b) => (b.total_days - a.total_days) || (b.late - a.late) || a.name.localeCompare(b.name));
}

// Delays for one client, in the same window (tasks whose due date is in [from, to]):
//   done late  — delegation completed on a day after its due date: days = done − due
//                (checklist keeps no completion date, so it cannot be late this way);
//   still open — pending past its due date (the cards' overdue): days = today − due.
// Returns { members, tasks }. tasks: { id, type, description, doer, doer_id, project,
// due_date, done_on, status, days_late, reason (delegation delay_reason) }, most days
// first, at most 1000. members: per doer { doer_id, name, late, open, done_late,
// total_days, max_days }, most total days first.
async function delayReport(db, clientId, from, to) {
  const [tasks] = await db.query(
    `SELECT t.id, 'delegation' AS type, t.description, t.status, t.assigned_to AS doer_id,
            COALESCE(u.name,'—') AS doer, p.name AS project,
            DATE_FORMAT(t.due_date,'%Y-%m-%d') AS due_date, DATE_FORMAT(t.completed_at,'%Y-%m-%d') AS done_on,
            t.delay_reason AS reason,
            CASE WHEN t.status='completed' THEN DATEDIFF(DATE(t.completed_at), t.due_date)
                 ELSE DATEDIFF(CURDATE(), t.due_date) END AS days_late
       FROM delegation_tasks t LEFT JOIN users u ON u.id=t.assigned_to LEFT JOIN client_projects p ON p.id=t.project_id
      WHERE t.client_id=? AND t.due_date BETWEEN ? AND ?
        AND ((t.status='completed' AND t.completed_at IS NOT NULL AND DATE(t.completed_at) > t.due_date)
          OR (t.status='pending' AND t.due_date < CURDATE()))
     UNION ALL
     SELECT t.id, 'checklist', t.description, t.status, t.assigned_to,
            COALESCE(u.name,'—'), p.name,
            DATE_FORMAT(t.due_date,'%Y-%m-%d'), NULL, NULL, DATEDIFF(CURDATE(), t.due_date)
       FROM checklist_tasks t LEFT JOIN users u ON u.id=t.assigned_to LEFT JOIN client_projects p ON p.id=t.project_id
      WHERE t.client_id=? AND t.due_date BETWEEN ? AND ? AND t.status='pending' AND t.due_date < CURDATE()
     ORDER BY days_late DESC, due_date ASC LIMIT 1000`, [clientId, from, to, clientId, from, to]);
  const by = new Map();
  for (const t of tasks) {
    t.days_late = Number(t.days_late) || 0;
    const k = t.doer_id == null ? 'none' : Number(t.doer_id);
    if (!by.has(k)) by.set(k, { doer_id: t.doer_id == null ? null : Number(t.doer_id), name: t.doer, late: 0, open: 0, done_late: 0, total_days: 0, max_days: 0 });
    const m = by.get(k);
    m.late++;
    if (t.status === 'completed') m.done_late++; else m.open++;
    m.total_days += t.days_late;
    m.max_days = Math.max(m.max_days, t.days_late);
  }
  const members = [...by.values()].sort((a, b) => (b.total_days - a.total_days) || (b.late - a.late) || a.name.localeCompare(b.name));
  return { members, tasks };
}

// The tasks behind one number of that table: same window and rules.
// project: a project id, 'none' (no project) or 'all'; status: 'all', 'pending',
// 'overdue', 'completed' or 'revised'. Newest due date first, at most 500.
// Row: { id, type, description, status, doer, due_date, done_on, project }.
async function projectTasks(db, clientId, from, to, project, status) {
  const where = [], params = [];
  if (project === 'none') where.push('t.project_id IS NULL');
  else if (project !== 'all') { where.push('t.project_id=?'); params.push(parseInt(project, 10) || 0); }
  if (status === 'overdue') where.push("t.status='pending' AND t.due_date<CURDATE()");
  else if (['pending', 'completed', 'revised'].includes(status)) { where.push('t.status=?'); params.push(status); }
  const extra = where.length ? ' AND ' + where.join(' AND ') : '';
  const part = (table, type, doneOn) => `SELECT t.id, '${type}' AS type, t.description, t.status,
      COALESCE(u.name,'—') AS doer, DATE_FORMAT(t.due_date,'%Y-%m-%d') AS due_date, ${doneOn} AS done_on,
      p.name AS project
    FROM ${table} t LEFT JOIN users u ON u.id=t.assigned_to LEFT JOIN client_projects p ON p.id=t.project_id
    WHERE t.client_id=? AND t.due_date BETWEEN ? AND ?${extra}`;
  const [rows] = await db.query(
    `${part('delegation_tasks', 'delegation', "DATE_FORMAT(t.completed_at,'%Y-%m-%d')")}
     UNION ALL
     ${part('checklist_tasks', 'checklist', 'NULL')}
     ORDER BY due_date DESC, id DESC LIMIT 500`,
    [clientId, from, to, ...params, clientId, from, to, ...params]);
  return rows;
}

async function projectBreakdown(db, clientId, from, to) {
  const [projects] = await db.query('SELECT id, name, is_active FROM client_projects WHERE client_id=?', [clientId]);
  if (!projects.length) return [];
  const [rows] = await db.query(
    `SELECT project_id, COUNT(*) AS total,
            SUM(status='pending') AS pending, SUM(status='completed') AS completed,
            SUM(status='revised') AS revised, SUM(status='pending' AND due_date<CURDATE()) AS overdue
       FROM (SELECT project_id, status, due_date FROM delegation_tasks WHERE client_id=? AND due_date BETWEEN ? AND ?
             UNION ALL
             SELECT project_id, status, due_date FROM checklist_tasks WHERE client_id=? AND due_date BETWEEN ? AND ?) t
      GROUP BY project_id`, [clientId, from, to, clientId, from, to]);
  const counts = new Map(rows.map(r => [r.project_id == null ? 'none' : Number(r.project_id), r]));
  const num = r => ({ total: Number(r && r.total) || 0, pending: Number(r && r.pending) || 0,
    completed: Number(r && r.completed) || 0, revised: Number(r && r.revised) || 0, overdue: Number(r && r.overdue) || 0 });
  const out = projects
    .filter(p => p.is_active || counts.has(Number(p.id)))
    .sort((a, b) => (b.is_active - a.is_active) || a.name.localeCompare(b.name))
    .map(p => ({ id: Number(p.id), name: p.name, archived: !p.is_active, ...num(counts.get(Number(p.id))) }));
  if (counts.has('none')) out.push({ id: null, name: 'No project', archived: false, ...num(counts.get('none')) });
  return out;
};
