import { useEffect, useState } from 'react';
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
