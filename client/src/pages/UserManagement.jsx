import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { ROLE_LABELS, TABS } from '../constants';
import { usePermissions } from '../permissions';
import { useAuth } from '../auth';
import { Card, Spinner, Button, Modal, Field, Input, Select, ConfirmDialog } from '../components';

const ROLES = Object.keys(ROLE_LABELS);

function UserModal({ user, onClose, onSaved }) {
  const editing = Boolean(user);
  const [form, setForm] = useState(() => ({
    name: user?.name || '',
    role: user?.role || 'purchasing',
    pin: user?.pin || '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.role || !String(form.pin).trim()) { setError('Name, role and PIN are required'); return; }
    setBusy(true);
    try {
      if (editing) await api.put(`/admin/users/${user.id}`, form);
      else await api.post('/admin/users', form);
      onSaved(); onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={editing ? `Edit ${user.name}` : 'New User'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Role" required>
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Select>
        </Field>
        <Field label="PIN" required>
          <Input value={form.pin} inputMode="numeric" placeholder="e.g. 1234"
            onChange={(e) => setForm({ ...form, pin: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="gold" disabled={busy}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function UserManagement() {
  const { user: me } = useAuth();
  const { perms, reload: reloadPerms } = usePermissions();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState('');
  const [revealPins, setRevealPins] = useState(false);

  const [draft, setDraft] = useState({});
  const [savingPerms, setSavingPerms] = useState(false);
  const [permsSaved, setPermsSaved] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setUsers(await api.get('/admin/users'));
    setLoading(false);
  }
  useEffect(() => { loadUsers(); }, []);
  useEffect(() => { setDraft(JSON.parse(JSON.stringify(perms || {}))); }, [perms]);

  function toggleTab(role, tab) {
    setPermsSaved(false);
    setDraft((d) => {
      const cur = new Set(d[role] || []);
      cur.has(tab) ? cur.delete(tab) : cur.add(tab);
      return { ...d, [role]: [...cur] };
    });
  }

  async function savePerms() {
    setSavingPerms(true);
    try {
      await api.put('/permissions', draft);
      await reloadPerms();
      setPermsSaved(true);
    } finally { setSavingPerms(false); }
  }

  async function confirmDelete() {
    setDelBusy(true); setDelErr('');
    try {
      await api.del(`/admin/users/${toDelete.id}`);
      setToDelete(null);
      loadUsers();
    } catch (e) { setDelErr(e.message); } finally { setDelBusy(false); }
  }

  // --- Data: backup / restore / reset --------------------------------------
  const fileRef = useRef(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [pendingRestore, setPendingRestore] = useState(null); // { data, counts, fileName }
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreErr, setRestoreErr] = useState('');
  const [dataMsg, setDataMsg] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [resetText, setResetText] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetErr, setResetErr] = useState('');

  async function exportBackup() {
    setBackupBusy(true); setDataMsg(''); setRestoreErr('');
    try {
      const data = await api.get('/admin/backup');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `efs-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const total = Object.values(data.counts || {}).reduce((s, n) => s + n, 0);
      setDataMsg(`Exported a backup of ${total} records. Keep this file safe — you can re-upload it later to restore.`);
    } catch (e) { setRestoreErr(e.message); } finally { setBackupBusy(false); }
  }

  function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setRestoreErr(''); setDataMsg('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== 'object' || !parsed.tables) throw new Error('Not a valid EFS backup file.');
        setPendingRestore({ data: parsed, counts: parsed.counts || {}, fileName: file.name });
      } catch (err) { setRestoreErr(`Could not read backup file: ${err.message}`); }
    };
    reader.readAsText(file);
  }

  async function confirmRestore() {
    setRestoreBusy(true); setRestoreErr('');
    try {
      const res = await api.post('/admin/restore', pendingRestore.data);
      const total = Object.values(res.restored || {}).reduce((s, n) => s + n, 0);
      setPendingRestore(null);
      setDataMsg(`Database restored from backup — ${total} records loaded.`);
      await loadUsers(); await reloadPerms();
    } catch (e) { setRestoreErr(e.message); } finally { setRestoreBusy(false); }
  }

  async function confirmReset() {
    setResetBusy(true); setResetErr('');
    try {
      await api.post('/admin/reset', {});
      setShowReset(false); setResetText('');
      setDataMsg('Database reset — all projects, customers, payments and inventory were cleared. User accounts were kept.');
      await loadUsers();
    } catch (e) { setResetErr(e.message); } finally { setResetBusy(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy">User Management</h1>
          <p className="text-gray-500 text-sm">Manage accounts, PINs, and what each role can see</p>
        </div>
        <Button variant="gold" onClick={() => setShowAdd(true)}>+ New User</Button>
      </div>

      {/* Users + PINs */}
      <Card className="overflow-hidden mb-8">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-bold text-navy">Accounts & PINs</h2>
          <button onClick={() => setRevealPins((v) => !v)} className="text-xs font-medium text-navy hover:underline">
            {revealPins ? '🙈 Hide PINs' : '👁 Show PINs'}
          </button>
        </div>
        {loading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy text-white text-left">
                <tr>
                  {['Name', 'Role', 'PIN', ''].map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-cloud">
                    <td className="px-4 py-3 font-semibold text-navy">{u.name}{u.id === me.id && <span className="ml-2 text-[11px] text-gray-400">(you)</span>}</td>
                    <td className="px-4 py-3">{ROLE_LABELS[u.role] || u.role}</td>
                    <td className="px-4 py-3 font-mono">{revealPins ? u.pin : '••••'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button onClick={() => setEditUser(u)} className="text-xs font-medium text-navy hover:underline">✏️ Edit</button>
                      <button onClick={() => { setDelErr(''); setToDelete(u); }} className="text-xs font-medium text-red-600 hover:text-red-700 ml-3">🗑 Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Tab permissions matrix */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-navy">Tab Visibility by Role</h2>
            <p className="text-xs text-gray-500">Check which tabs each role can see. Admin always sees everything.</p>
          </div>
          <div className="flex items-center gap-3">
            {permsSaved && <span className="text-xs text-green-600 font-medium">✓ Saved</span>}
            <Button variant="gold" onClick={savePerms} disabled={savingPerms}>{savingPerms ? 'Saving…' : 'Save permissions'}</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cloud text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-navy">Role</th>
                {TABS.map((t) => (
                  <th key={t.key} className="px-3 py-3 font-semibold text-navy text-center whitespace-nowrap">{t.icon} {t.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ROLES.map((role) => {
                const isAdminRole = role === 'admin';
                const allowed = new Set(isAdminRole ? TABS.map((t) => t.key) : (draft[role] || []));
                return (
                  <tr key={role} className="hover:bg-cloud/50">
                    <td className="px-4 py-3 font-semibold text-navy whitespace-nowrap">{ROLE_LABELS[role]}</td>
                    {TABS.map((t) => (
                      <td key={t.key} className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-navy disabled:opacity-40"
                          checked={allowed.has(t.key)}
                          disabled={isAdminRole}
                          onChange={() => toggleTab(role, t.key)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Data & Backup */}
      <Card className="overflow-hidden mt-8">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-bold text-navy">Data & Backup</h2>
          <p className="text-xs text-gray-500">Export the whole database to a file, restore it later, or reset everything to start fresh.</p>
        </div>
        <div className="p-4 space-y-4">
          {dataMsg && <div className="bg-green-50 text-green-700 text-sm rounded-lg px-3 py-2">{dataMsg}</div>}
          {restoreErr && !pendingRestore && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{restoreErr}</div>}
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="border border-gray-200 rounded-xl p-4 flex flex-col">
              <div className="text-2xl mb-1">⬇️</div>
              <h3 className="font-semibold text-navy">Export backup</h3>
              <p className="text-xs text-gray-500 mb-3 flex-1">Download a full snapshot (.json) of every table — users, customers, projects, payments, inventory and settings.</p>
              <Button variant="outline" onClick={exportBackup} disabled={backupBusy}>{backupBusy ? 'Preparing…' : '⬇ Export database'}</Button>
            </div>
            <div className="border border-gray-200 rounded-xl p-4 flex flex-col">
              <div className="text-2xl mb-1">⬆️</div>
              <h3 className="font-semibold text-navy">Restore backup</h3>
              <p className="text-xs text-gray-500 mb-3 flex-1">Upload a previously exported .json file to return to that snapshot. This <strong>replaces all current data</strong>.</p>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onPickFile} />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>⬆ Choose backup file…</Button>
            </div>
            <div className="border border-red-200 bg-red-50/40 rounded-xl p-4 flex flex-col">
              <div className="text-2xl mb-1">🧨</div>
              <h3 className="font-semibold text-red-700">Reset database</h3>
              <p className="text-xs text-gray-500 mb-3 flex-1">Clear all projects, customers, payments and inventory to start new. User accounts and role settings are kept.</p>
              <Button variant="outline" className="!border-red-300 !text-red-700 hover:!bg-red-50" onClick={() => { setResetErr(''); setResetText(''); setShowReset(true); }}>Reset to start new</Button>
            </div>
          </div>
        </div>
      </Card>

      {pendingRestore && (
        <Modal title="Restore from backup?" onClose={() => setPendingRestore(null)}>
          <div className="space-y-3">
            {restoreErr && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{restoreErr}</div>}
            <div className="bg-amber-50 text-amber-800 text-sm rounded-lg px-3 py-2">
              This will <strong>delete all current data</strong> and replace it with <strong>{pendingRestore.fileName}</strong>. This cannot be undone.
            </div>
            <div className="text-sm text-gray-600">
              <div className="font-medium mb-1">Backup contents:</div>
              <ul className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
                {Object.entries(pendingRestore.counts).map(([k, v]) => (
                  <li key={k} className="flex justify-between border-b border-gray-100 py-0.5"><span className="text-gray-500">{k}</span><span className="font-mono text-navy">{v}</span></li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPendingRestore(null)}>Cancel</Button>
              <Button variant="gold" disabled={restoreBusy} onClick={confirmRestore}>{restoreBusy ? 'Restoring…' : 'Replace all data'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {showReset && (
        <Modal title="Reset database" onClose={() => setShowReset(false)}>
          <div className="space-y-3">
            {resetErr && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{resetErr}</div>}
            <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">
              This permanently clears <strong>all projects, customers, payments and inventory</strong>. User accounts and role permissions are kept so you can still log in. This cannot be undone.
            </div>
            <p className="text-xs text-gray-500">Tip: export a backup first so you can restore this data later if needed.</p>
            <Field label='Type RESET to confirm'>
              <Input value={resetText} onChange={(e) => setResetText(e.target.value)} placeholder="RESET" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowReset(false)}>Cancel</Button>
              <Button variant="danger" disabled={resetBusy || resetText !== 'RESET'} onClick={confirmReset}>{resetBusy ? 'Resetting…' : 'Reset database'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {showAdd && <UserModal onClose={() => setShowAdd(false)} onSaved={loadUsers} />}
      {editUser && <UserModal user={editUser} onClose={() => setEditUser(null)} onSaved={loadUsers} />}
      {toDelete && (
        <ConfirmDialog
          title={`Delete ${toDelete.name}?`}
          message="This permanently removes the user account. Their tasks/logs are kept but unassigned. This cannot be undone."
          confirmLabel="Delete user"
          busy={delBusy}
          error={delErr}
          onConfirm={confirmDelete}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
