// Users → the table rows, rendered straight into #usersTbody (was the body of
// renderUsersTable in public/js/users.js). users.js still loads and filters
// the list and hands it over with usersSetReact; Edit and Delete are its own.
//
// It hands over { users, gone }: the active people, then the ones Deactivate
// removed. Deactivate archives the row and deletes it, so "gone" is read back
// out of the delete archive and each row carries archive_id — Activate is the
// same restore the Logs page runs. They sit under a separator at the bottom so
// the active list reads exactly as it did before.
import { useEffect, useState } from 'react';
import { legacy, css } from '../lib/app.js';

const roleLabel = r => (r === 'admin' ? '👑 Admin' : r === 'hod' ? '🏢 HOD' : r === 'pc' ? '🖥️ PC' : '👤 User');
const roleCls = r => (['admin', 'hod', 'pc', 'user'].includes(r) ? r : 'user');

export default function UsersRows() {
  const [v, setV] = useState(null);
  useEffect(() => {
    // Accepts the old bare array too, so an older users.js cannot blank the page.
    legacy('usersSetReact', d => setV(Array.isArray(d) ? { users: d, gone: [] }
      : { users: Array.isArray(d?.users) ? d.users : [], gone: Array.isArray(d?.gone) ? d.gone : [] }));
    return () => legacy('usersSetReact', null);
  }, []);

  if (!v) return null;
  const { users, gone } = v;
  if (!users.length && !gone.length) {
    return <tr><td colSpan={6} ref={css('text-align:center;padding:24px;color:#94a3b8')}>No users found</td></tr>;
  }

  const active = users.map(u => {
    const userRole = u.user_role || u.role;
    return (
      <tr key={u.id}>
        <td ref={css('font-weight:600')}>{u.name}</td>
        <td ref={css('color:#64748b')}>{u.email}</td>
        <td ref={css('color:#64748b')}>{u.phone || '—'}</td>
        <td ref={css('color:#64748b')}>{u.department || '—'}</td>
        <td>
          <span className={`role-badge ${roleCls(u.role)}`} title="App Role — permissions">{roleLabel(u.role)}</span>
          {userRole !== u.role ? <>{' '}<br /><span className={`role-badge ${roleCls(userRole)}`} ref={css('font-size:10px;margin-top:3px;display:inline-block;opacity:.85')} title="User Role — leave hierarchy">{`→ ${roleLabel(userRole)}`}</span></> : null}
        </td>
        <td>
          <button className="action-btn edit" onClick={() => legacy('openEditUser', u.id)}>Edit</button>
          {' '}
          <button className="action-btn delete" ref={css('margin-left:6px')} onClick={() => legacy('deactivateUser', u.id)}>Deactivate</button>
        </td>
      </tr>
    );
  });

  if (!gone.length) return active;

  const head = (
    <tr key="gone-head">
      <td colSpan={6} ref={css('padding:14px 10px 7px;border-top:1.5px solid #e2e8f0;font-size:11px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:#94a3b8')}>
        {`Deactivated · ${gone.length}`}
      </td>
    </tr>
  );

  const rows = gone.map(u => (
    // Dimmed, not hidden: these accounts cannot sign in and appear in no list
    // anywhere else in the app.
    <tr key={`gone-${u.archive_id}`} ref={css('background:#fcfcfd')}>
      <td ref={css('font-weight:600;color:#94a3b8')}>{u.name || '—'}</td>
      <td ref={css('color:#cbd5e1')}>{u.email || '—'}</td>
      <td ref={css('color:#cbd5e1')}>{u.phone || '—'}</td>
      <td ref={css('color:#cbd5e1')}>{u.department || '—'}</td>
      <td>
        <span className="role-badge" ref={css('background:#f1f5f9;color:#94a3b8')} title={u.reason || 'Deactivated'}>
          {u.deleted_on ? `Deactivated ${u.deleted_on}` : 'Deactivated'}
        </span>
        {u.deleted_by_name ? <><br /><span ref={css('font-size:10px;color:#cbd5e1')}>{`by ${u.deleted_by_name}`}</span></> : null}
      </td>
      <td>
        <button className="action-btn done" onClick={() => legacy('activateUser', u.archive_id, u.name)}>Activate</button>
      </td>
    </tr>
  ));

  return [...active, head, ...rows];
}
