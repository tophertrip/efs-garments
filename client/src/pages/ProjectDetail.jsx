import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import {
  STAGES, STAGE_MAP, STAGE_KEYS, nextStageKey, prevStageKey, peso, fmtDate, fmtDateTime,
} from '../constants';
import {
  Card, Spinner, Button, StageBadge, CategoryBadge, PriorityBadge, DaysLeft, Modal, Field, Input, Textarea, Select, ConfirmDialog,
} from '../components';
import ProjectForm from '../ProjectForm';

function Timeline({ project }) {
  const currentIdx = STAGE_KEYS.indexOf(project.status);
  // Map each stage to the most recent log entry that moved INTO it.
  const reachedAt = {};
  project.logs.forEach((l) => { reachedAt[l.to_status] = l.created_at; });

  return (
    <ol className="space-y-0">
      {STAGES.map((stage, i) => {
        const done = i < currentIdx;
        const current = i === currentIdx;
        return (
          <li key={stage.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold
                ${done ? 'bg-green-500 text-white' : current ? 'bg-gold text-navy ring-4 ring-gold/30' : 'bg-gray-200 text-gray-400'}`}>
                {done ? '✓' : i + 1}
              </div>
              {i < STAGES.length - 1 && <div className={`w-0.5 flex-1 min-h-[24px] ${done ? 'bg-green-400' : 'bg-gray-200'}`} />}
            </div>
            <div className={`pb-4 ${current ? '' : 'opacity-90'}`}>
              <div className="text-sm font-semibold text-gray-800">{stage.emoji} {stage.label}</div>
              <div className="text-xs text-gray-400">
                {reachedAt[stage.key] ? fmtDateTime(reachedAt[stage.key]) : current ? 'In progress' : 'Pending'}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function AddTaskModal({ projectId, users, onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', description: '', due_date: '', assigned_to: '' });
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    await api.post('/tasks', {
      project_id: projectId,
      title: form.title,
      description: form.description,
      due_date: form.due_date || null,
      assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
    });
    onSaved();
    onClose();
  }
  return (
    <Modal title="Add Reminder / Task" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Title" required><Input value={form.title} required onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Description"><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date"><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
          <Field label="Assign to">
            <Select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
              <option value="">— Unassigned —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button variant="gold" disabled={busy}>Save</Button></div>
      </form>
    </Modal>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [project, setProject] = useState(null);
  const [users, setUsers] = useState([]);
  const [advancing, setAdvancing] = useState(false);
  const [returning, setReturning] = useState(false);
  const [showTask, setShowTask] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const p = await api.get(`/projects/${id}`);
    setProject(p);
  }
  useEffect(() => { load(); api.get('/users').then(setUsers).catch(() => {}); }, [id]);

  if (!project) return <Spinner />;

  const next = nextStageKey(project.status);
  const prev = prevStageKey(project.status);

  async function advance() {
    if (!next) return;
    setAdvancing(true);
    try {
      await api.put(`/projects/${id}/status`, {});
      await load();
    } finally { setAdvancing(false); }
  }

  async function goBack() {
    if (!prev) return;
    setReturning(true);
    try {
      await api.put(`/projects/${id}/status`, {
        status: prev,
        skipTask: true,
        notes: `Returned to ${STAGE_MAP[prev].label}`,
      });
      await load();
    } finally { setReturning(false); }
  }

  async function toggleTask(t) {
    await api.put(`/tasks/${t.id}/done`, { is_done: t.is_done ? 0 : 1 });
    load();
  }

  async function remove() {
    setDeleting(true);
    try {
      await api.del(`/projects/${id}`);
      navigate('/projects');
    } finally { setDeleting(false); }
  }

  return (
    <div>
      <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-navy mb-4 print:hidden">← Back</button>

      <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold text-navy">{project.job_order_number}</h1>
            <StageBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
          </div>
          {project.project_name && <p className="text-lg font-semibold text-gray-800 mt-1">{project.project_name}</p>}
          <p className="text-gray-600 mt-0.5">{project.customer_name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap print:hidden">
          <Button variant="outline" onClick={() => window.print()}>🖨️ Print / PDF</Button>
          {isAdmin && (
            <Button variant="outline" onClick={() => setShowEdit(true)}>✏️ Edit</Button>
          )}
          {isAdmin && (
            <Button variant="outline" onClick={() => setShowDelete(true)}
              className="text-red-600 border-red-200 hover:bg-red-50">🗑 Delete</Button>
          )}
          {prev && (
            <Button variant="outline" onClick={goBack} disabled={returning}
              title="Undo — move this job order back one stage">
              {returning ? 'Returning…' : `← Return to ${STAGE_MAP[prev].label}`}
            </Button>
          )}
          {next && (
            <Button variant="gold" onClick={advance} disabled={advancing} className="text-base px-6 py-3">
              {advancing ? 'Advancing…' : `Advance to ${STAGE_MAP[next].emoji} ${STAGE_MAP[next].label} →`}
            </Button>
          )}
          {!next && <span className="px-4 py-2 rounded-lg bg-emerald-100 text-emerald-800 font-semibold text-sm">💰 Paid — complete</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: details + tasks */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5">
            <h2 className="font-bold text-navy mb-3">Project Details</h2>
            <div className="mb-4">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Project Name</div>
              <div className="text-base font-semibold text-navy">{project.project_name || <span className="text-gray-400 font-normal">—</span>}</div>
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-4 text-sm">
              <Detail label="Category"><CategoryBadge category={project.category} /></Detail>
              <Detail label="Quantity">{project.quantity}</Detail>
              <Detail label="Target Date"><span className="block">{fmtDate(project.target_date)}</span><DaysLeft targetDate={project.target_date} className="text-xs" /></Detail>
              <Detail label="Unit Price">{peso(project.unit_price)}</Detail>
              <Detail label="Total Amount"><span className="font-bold text-navy">{peso(project.total_amount)}</span></Detail>
              <Detail label="Created">{fmtDate(project.created_at)}</Detail>
            </dl>
            {project.description && <Detail label="Description" className="mt-4 block">{project.description}</Detail>}
            {project.design_notes && (
              <div className="mt-4">
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Design Notes</div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap bg-cloud rounded-lg p-3">{project.design_notes}</p>
              </div>
            )}
            {project.remarks && (
              <div className="mt-4">
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Remarks</div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap bg-amber-50 border border-amber-100 rounded-lg p-3">{project.remarks}</p>
              </div>
            )}
            {project.design_file_url && (
              <a href={project.design_file_url} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-2 mt-4 text-sm text-navy font-semibold hover:underline">
                🔗 Open design file
              </a>
            )}
          </Card>

          {/* Tasks */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-navy">Tasks & Reminders</h2>
              <Button variant="outline" onClick={() => setShowTask(true)} className="py-1.5 px-3 text-xs print:hidden">+ Add</Button>
            </div>
            {project.tasks.length === 0 && <p className="text-sm text-gray-400">No tasks yet.</p>}
            <ul className="space-y-2">
              {project.tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-cloud">
                  <input type="checkbox" checked={!!t.is_done} onChange={() => toggleTask(t)} className="mt-1 h-4 w-4 accent-navy" />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${t.is_done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.title}</div>
                    {t.description && <div className="text-xs text-gray-500">{t.description}</div>}
                    <div className="text-xs text-gray-400 mt-0.5">
                      {t.assigned_name ? `👤 ${t.assigned_name}` : 'Unassigned'}{t.due_date ? ` · due ${fmtDate(t.due_date)}` : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Right: timeline + activity log */}
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-bold text-navy mb-4">Status Timeline</h2>
            <Timeline project={project} />
          </Card>

          <Card className="p-5">
            <h2 className="font-bold text-navy mb-3">Activity Log</h2>
            <ul className="space-y-3">
              {[...project.logs].reverse().map((l) => (
                <li key={l.id} className="text-sm border-l-2 border-gray-200 pl-3">
                  <div className="text-gray-800">
                    {l.from_status ? (
                      <>Moved <b>{STAGE_MAP[l.from_status]?.label || l.from_status}</b> → <b>{STAGE_MAP[l.to_status]?.label || l.to_status}</b></>
                    ) : (
                      <>Created at <b>{STAGE_MAP[l.to_status]?.label || l.to_status}</b></>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">{l.changed_by_name || 'System'} · {fmtDateTime(l.created_at)}</div>
                  {l.notes && <div className="text-xs text-gray-500 italic">“{l.notes}”</div>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {showTask && <AddTaskModal projectId={project.id} users={users} onClose={() => setShowTask(false)} onSaved={load} />}
      {showEdit && (
        <ProjectForm
          project={project}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => setProject(updated)}
        />
      )}
      {showDelete && (
        <ConfirmDialog
          title={`Delete ${project.job_order_number}?`}
          message="This permanently removes the job order along with its activity log and tasks. This cannot be undone."
          confirmLabel="Delete project"
          busy={deleting}
          onConfirm={remove}
          onClose={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}

function Detail({ label, children, className = '' }) {
  return (
    <div className={className}>
      <dt className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-gray-800">{children}</dd>
    </div>
  );
}
