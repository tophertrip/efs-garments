import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { STAGES, STAGE_MAP, nextStageKey, ROLE_LABELS, fmtDate } from '../constants';
import { Card, Spinner, Button, CategoryBadge, PriorityBadge, DaysLeft, Empty } from '../components';

// The stage owned by each role (first stage that role is responsible for).
const ROLE_STAGE = {
  purchasing: 'purchasing',
  printing: 'printing',
  cutting_sewing: 'cutting_sewing',
  qa: 'qa',
};

export default function TeamView() {
  const { user } = useAuth();
  const stageKey = ROLE_STAGE[user.role];
  const stage = STAGE_MAP[stageKey];
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(null);

  async function load() {
    setLoading(true);
    const [p, t] = await Promise.all([
      api.get(`/projects?status=${stageKey}`),
      api.get(`/tasks?assigned_to=${user.id}&done=0`),
    ]);
    setProjects(p);
    setTasks(t);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function advance(p) {
    setWorking(p.id);
    try {
      await api.put(`/projects/${p.id}/status`, {});
      await load();
    } finally { setWorking(null); }
  }

  async function markTaskDone(t) {
    await api.put(`/tasks/${t.id}/done`, { is_done: 1 });
    load();
  }

  if (loading) return <Spinner />;

  const next = nextStageKey(stageKey);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-navy">Hi {user.name.split(' ')[0]} 👋</h1>
        <p className="text-gray-500 text-sm">
          You handle <b>{stage?.emoji} {stage?.label}</b>. Here's what needs your attention.
        </p>
      </div>

      {/* Projects in my stage */}
      <h2 className="text-lg font-bold text-navy mb-3">
        {stage?.emoji} In {stage?.label} <span className="text-gray-400 font-normal">({projects.length})</span>
      </h2>
      {projects.length === 0 ? (
        <Card className="p-8 mb-8"><Empty>Nothing in your stage right now. 🎉</Empty></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {projects.map((p) => (
            <Card key={p.id} className="p-5">
              <div className="flex items-start justify-between mb-2">
                <Link to={`/projects/${p.id}`} className="font-bold text-navy hover:underline">{p.job_order_number}</Link>
                <PriorityBadge priority={p.priority} />
              </div>
              <div className="text-sm font-semibold text-gray-800">{p.customer_name}</div>
              <div className="text-sm text-gray-600 mt-1">{p.description}</div>
              <div className="flex items-center gap-3 mt-3 text-sm">
                <CategoryBadge category={p.category} />
                <span className="text-gray-500">Qty {p.quantity}</span>
              </div>
              <div className="flex items-center justify-between mt-3 text-sm">
                <span className="text-gray-500">🎯 {fmtDate(p.target_date)}</span>
                <DaysLeft targetDate={p.target_date} />
              </div>
              <Button
                variant="gold"
                className="w-full mt-4"
                onClick={() => advance(p)}
                disabled={working === p.id}
              >
                {working === p.id ? 'Updating…' : next ? `✓ Done → ${STAGE_MAP[next].label}` : '✓ Mark complete'}
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* My tasks */}
      <h2 className="text-lg font-bold text-navy mb-3">
        🔔 My Tasks <span className="text-gray-400 font-normal">({tasks.length})</span>
      </h2>
      {tasks.length === 0 ? (
        <Card className="p-8"><Empty>No open tasks assigned to you.</Empty></Card>
      ) : (
        <Card className="divide-y divide-gray-100">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-start gap-3 p-4">
              <input type="checkbox" onChange={() => markTaskDone(t)} className="mt-1 h-5 w-5 accent-navy" />
              <div className="flex-1">
                <div className="font-medium text-gray-800">{t.title}</div>
                {t.description && <div className="text-sm text-gray-500">{t.description}</div>}
                <div className="text-xs text-gray-400 mt-1">
                  {t.job_order_number && <Link to={`/projects/${t.project_id}`} className="text-navy hover:underline">{t.job_order_number}</Link>}
                  {t.due_date ? ` · due ${fmtDate(t.due_date)}` : ''}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
