import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { STAGES, CATEGORY_MAP } from '../constants';
import { Card, Spinner, Button, CategoryBadge, PriorityBadge, DaysLeft } from '../components';
import ProjectForm from '../ProjectForm';

function StatCard({ label, value, tone }) {
  const tones = {
    navy: 'bg-navy text-white',
    gold: 'bg-gold text-navy',
    red: 'bg-red-50 text-red-700 border border-red-200',
    green: 'bg-green-50 text-green-700 border border-green-200',
    indigo: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  };
  return (
    <div className={`rounded-xl p-5 ${tones[tone]}`}>
      <div className="text-3xl font-extrabold">{value}</div>
      <div className="text-sm font-medium opacity-90 mt-1">{label}</div>
    </div>
  );
}

function KanbanCard({ project, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md hover:border-gold transition"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-navy">{project.job_order_number}</span>
        {project.priority !== 'normal' && <PriorityBadge priority={project.priority} />}
      </div>
      <div className="text-sm font-semibold text-gray-800 truncate">{project.project_name || project.customer_company || project.customer_name}</div>
      <div className="mt-2 flex items-center justify-between">
        <CategoryBadge category={project.category} />
        <span className="text-xs text-gray-500">Qty {project.quantity}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-gray-400">{project.target_date}</span>
        <DaysLeft targetDate={project.target_date} />
      </div>
    </button>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    const [s, p] = await Promise.all([api.get('/dashboard'), api.get('/projects')]);
    setStats(s);
    setProjects(p);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  if (loading) return <Spinner />;

  const byStage = (key) => projects.filter((p) => p.status === key);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy">Dashboard</h1>
          <p className="text-gray-500 text-sm">Live view of every job order in production</p>
        </div>
        <Button variant="gold" onClick={() => setShowForm(true)}>+ New Project</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard label="Active Projects" value={stats.totalActive} tone="navy" />
        <StatCard label="Due This Week" value={stats.dueThisWeek} tone="gold" />
        <StatCard label="Overdue" value={stats.overdue} tone="red" />
        <StatCard label="Completed This Month" value={stats.completedThisMonth} tone="green" />
        <StatCard label="Pieces Due This Week" value={Number(stats.unitsDueThisWeek || 0).toLocaleString()} tone="indigo" />
        <StatCard label="Pieces Due This Month" value={Number(stats.unitsDueThisMonth || 0).toLocaleString()} tone="indigo" />
      </div>

      <h2 className="text-lg font-bold text-navy mb-3">Production Pipeline</h2>
      <div className="kanban-scroll overflow-x-auto pb-4">
        <div className="flex gap-4" style={{ minWidth: 'min-content' }}>
          {STAGES.filter((s) => s.key !== 'paid').map((stage) => {
            const items = byStage(stage.key);
            return (
              <div key={stage.key} className="w-64 flex-shrink-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-sm font-bold text-gray-700">{stage.emoji} {stage.label}</span>
                  <span className="text-xs font-bold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{items.length}</span>
                </div>
                <div className="bg-gray-100/70 rounded-xl p-2 space-y-2 min-h-[120px]">
                  {items.length === 0 && <div className="text-center text-xs text-gray-300 py-6">No projects</div>}
                  {items.map((p) => (
                    <KanbanCard key={p.id} project={p} onClick={() => navigate(`/projects/${p.id}`)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showForm && (
        <ProjectForm
          onClose={() => setShowForm(false)}
          onSaved={() => load()}
        />
      )}
    </div>
  );
}
