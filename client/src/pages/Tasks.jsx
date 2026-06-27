import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { fmtDate, daysLeftLabel } from '../constants';
import { Card, Spinner, Button, Modal, Field, Input, Textarea, Select, Empty } from '../components';

function AddReminderModal({ users, projects, onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', description: '', due_date: '', assigned_to: '', project_id: '' });
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    await api.post('/tasks', {
      title: form.title,
      description: form.description,
      due_date: form.due_date || null,
      assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
      project_id: form.project_id ? Number(form.project_id) : null,
    });
    onSaved();
    onClose();
  }
  return (
    <Modal title="New Reminder" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Title" required><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Description"><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date"><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
          <Field label="Assign to">
            <Select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
              <option value="">— Anyone —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Related project">
          <Select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
            <option value="">— None —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.job_order_number} · {p.customer_name}</option>)}
          </Select>
        </Field>
        <div className="flex justify-end gap-2"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button variant="gold" disabled={busy}>Save</Button></div>
      </form>
    </Modal>
  );
}

export default function Tasks() {
  const { user, isAdmin } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [filter, setFilter] = useState({ assigned_to: '', done: '' });

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    // Non-admins only ever see their own tasks.
    if (!isAdmin) params.set('assigned_to', user.id);
    else if (filter.assigned_to) params.set('assigned_to', filter.assigned_to);
    if (filter.done !== '') params.set('done', filter.done);
    setTasks(await api.get(`/tasks${params.toString() ? '?' + params : ''}`));
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter, isAdmin]);
  useEffect(() => {
    if (isAdmin) {
      api.get('/users').then(setUsers).catch(() => {});
      api.get('/projects').then(setProjects).catch(() => {});
    }
  }, [isAdmin]);

  async function toggle(t) {
    await api.put(`/tasks/${t.id}/done`, { is_done: t.is_done ? 0 : 1 });
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy">{isAdmin ? 'Reminders' : 'My Tasks'}</h1>
          <p className="text-gray-500 text-sm">{tasks.filter((t) => !t.is_done).length} open</p>
        </div>
        {isAdmin && <Button variant="gold" onClick={() => setShow(true)}>+ New Reminder</Button>}
      </div>

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap gap-3">
          {isAdmin && (
            <Select value={filter.assigned_to} onChange={(e) => setFilter({ ...filter, assigned_to: e.target.value })} className="max-w-xs">
              <option value="">All people</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          )}
          <Select value={filter.done} onChange={(e) => setFilter({ ...filter, done: e.target.value })} className="max-w-xs">
            <option value="">All tasks</option>
            <option value="0">Open only</option>
            <option value="1">Completed only</option>
          </Select>
        </div>
      </Card>

      {loading ? <Spinner /> : tasks.length === 0 ? (
        <Card className="p-8"><Empty>No tasks here. 🎉</Empty></Card>
      ) : (
        <Card className="divide-y divide-gray-100">
          {tasks.map((t) => {
            const d = t.due_date ? daysLeftLabel(t.due_date) : null;
            return (
              <div key={t.id} className="flex items-start gap-3 p-4">
                <input type="checkbox" checked={!!t.is_done} onChange={() => toggle(t)} className="mt-1 h-5 w-5 accent-navy flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className={`font-medium ${t.is_done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.title}</div>
                  {t.description && <div className="text-sm text-gray-500">{t.description}</div>}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-400">
                    {t.assigned_name && <span>👤 {t.assigned_name}</span>}
                    {t.job_order_number && (
                      <Link to={`/projects/${t.project_id}`} className="text-navy hover:underline font-medium">{t.job_order_number}</Link>
                    )}
                    {t.due_date && (
                      <span className={d.overdue && !t.is_done ? 'text-red-600 font-semibold' : ''}>
                        📅 {fmtDate(t.due_date)}{!t.is_done && d.overdue ? ` (${d.text})` : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {show && <AddReminderModal users={users} projects={projects} onClose={() => setShow(false)} onSaved={load} />}
    </div>
  );
}
