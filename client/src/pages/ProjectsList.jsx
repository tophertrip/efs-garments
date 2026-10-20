import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { STAGES, fmtDate } from '../constants';
import { parseCsv, downloadText } from '../csv';
import { useCategories } from '../categories';
import { useAuth } from '../auth';
import { usePermissions } from '../permissions';
import { Card, Spinner, Button, StageBadge, CategoryBadge, PriorityBadge, DaysLeft, Input, Select, Money } from '../components';
import ProjectForm from '../ProjectForm';
import CategoryManager from '../CategoryManager';

export default function ProjectsList() {
  const { categories, label: catLabel, reload: reloadCategories } = useCategories();
  const { user, isAdmin } = useAuth();
  const { canSeePrice } = usePermissions();
  const showPrice = canSeePrice(user?.role);
  const [showCats, setShowCats] = useState(false);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({ status: '', category: '', from: '', to: '', search: '' });
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState(null); // { ok, text }
  const [sort, setSort] = useState({ key: null, dir: 'asc' }); // null = server order (newest first)

  function downloadTemplate() {
    downloadText('efs-projects-template.csv',
      'customer,company,project_name,category,description,quantity,unit_price,target_date,priority,status\n' +
      'Juan Dela Cruz,ABC Corp,Team Jerseys,sportswear,Full sublimation,50,350,2026-08-15,normal,inquiry\n');
  }

  async function onImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true); setImportMsg(null);
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error('No rows found in the file.');
      const res = await api.post('/projects/import', { rows });
      const parts = [`${res.created} project${res.created !== 1 ? 's' : ''} imported`];
      if (res.skipped?.length) parts.push(`${res.skipped.length} skipped`);
      setImportMsg({ ok: true, text: parts.join(' · '), skipped: res.skipped || [] });
      await load();
    } catch (err) {
      setImportMsg({ ok: false, text: err.message });
    } finally { setImporting(false); }
  }

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    const data = await api.get(`/projects${params.toString() ? '?' + params : ''}`);
    setProjects(data);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters]);

  function set(k, v) { setFilters((f) => ({ ...f, [k]: v })); }

  function exportCsv() {
    // Roles without price permission get the amount columns blanked out.
    const headers = ['Job Order', 'Project Name', 'Customer', 'Category', 'Quantity', 'Unit Price', 'Total', 'Target Date', 'Status', 'Priority'];
    const rows = projects.map((p) => [
      p.job_order_number, p.project_name || '', p.customer_name, catLabel(p.category),
      p.quantity, showPrice ? (p.unit_price ?? '') : '', showPrice ? (p.total_amount ?? '') : '', p.target_date, p.status, p.priority,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `efs-projects-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Clickable, sortable columns. `num` = numeric sort (defaults to descending first).
  const COLUMNS = [
    { label: 'Job Order', key: 'job_order_number' },
    { label: 'Project Name', key: 'project_name' },
    { label: 'Category', key: 'category' },
    { label: 'Qty', key: 'quantity', num: true },
    { label: 'Total', key: 'total_amount', num: true },
    { label: 'Target Date', key: 'target_date' },
    { label: 'Status', key: 'status' },
    { label: 'Priority', key: 'priority' },
    { label: 'Days Left', key: 'days' },
  ];
  const STAGE_ORDER = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));
  const PRIORITY_ORDER = { urgent: 0, normal: 1, low: 2 };

  function toggleSort(col) {
    setSort((s) => s.key === col.key
      ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { key: col.key, dir: col.num ? 'desc' : 'asc' });
  }

  const sortedProjects = useMemo(() => {
    if (!sort.key) return projects;
    const dir = sort.dir === 'asc' ? 1 : -1;
    const valOf = (p) => {
      switch (sort.key) {
        case 'job_order_number': return (p.job_order_number || '').toLowerCase();
        case 'project_name': return (p.project_name || '').toLowerCase();
        case 'category': return catLabel(p.category).toLowerCase();
        case 'quantity': return Number(p.quantity) || 0;
        case 'total_amount': return Number(p.total_amount) || 0;
        case 'target_date':
        case 'days': return p.target_date ? new Date(p.target_date).getTime() : Infinity;
        case 'status': return STAGE_ORDER[p.status] ?? 99;
        case 'priority': return PRIORITY_ORDER[p.priority] ?? 1;
        default: return 0;
      }
    };
    return [...projects].sort((a, b) => {
      const av = valOf(a), bv = valOf(b);
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, sort, catLabel]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy">Projects</h1>
          <p className="text-gray-500 text-sm">{projects.length} job order{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onImportFile} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>{importing ? 'Importing…' : '⬆ Import CSV'}</Button>
          <Button variant="outline" onClick={exportCsv}>⬇ Export CSV</Button>
          {isAdmin && <Button variant="outline" onClick={() => setShowCats(true)}>🏷 Categories</Button>}
          <Button variant="gold" onClick={() => setShowForm(true)}>+ New Project</Button>
        </div>
      </div>

      {showCats && (
        <CategoryManager
          title="Manage Project Categories"
          subtitle="Rename or delete product categories. Projects keep their category if it's deleted (shown by its label)."
          load={() => api.get('/categories').then((cs) => cs.map((c) => ({ id: c.key, label: c.label })))}
          onAdd={(name) => api.post('/categories', { name })}
          onRename={(item, name) => api.put(`/categories/${item.id}`, { name })}
          onDelete={(item) => api.del(`/categories/${item.id}`)}
          onChanged={reloadCategories}
          onClose={() => { setShowCats(false); reloadCategories(); }}
        />
      )}

      {importMsg && (
        <div className={`rounded-lg px-4 py-3 mb-4 text-sm ${importMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          <div className="flex items-center justify-between gap-2">
            <span>{importMsg.ok ? '✓ ' : '⚠ '}{importMsg.text}</span>
            <button onClick={() => setImportMsg(null)} className="text-xs opacity-60 hover:opacity-100">✕</button>
          </div>
          {importMsg.skipped?.length > 0 && (
            <ul className="mt-1 text-xs text-gray-500 list-disc pl-5 max-h-24 overflow-y-auto">
              {importMsg.skipped.slice(0, 20).map((s, i) => <li key={i}>Line {s.line}: {s.reason}</li>)}
            </ul>
          )}
          <button onClick={downloadTemplate} className="text-xs underline mt-1 opacity-70 hover:opacity-100">Download CSV template</button>
        </div>
      )}

      <Card className="p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Input placeholder="🔍 Search project, JO #, customer…" value={filters.search} onChange={(e) => set('search', e.target.value)} />
          <Select value={filters.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">All statuses</option>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
          <Select value={filters.category} onChange={(e) => set('category', e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </Select>
          <Input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} title="Target from" />
          <Input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} title="Target to" />
        </div>
      </Card>

      {loading ? <Spinner /> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy text-white text-left">
                <tr>
                  {COLUMNS.map((c) => {
                    const active = sort.key === c.key;
                    return (
                      <th
                        key={c.key}
                        onClick={() => toggleSort(c)}
                        title="Click to sort"
                        className="px-4 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-white/10"
                      >
                        <span className="inline-flex items-center gap-1">
                          {c.label}
                          <span className={active ? 'text-gold' : 'text-white/30'}>{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedProjects.length === 0 && (
                  <tr><td colSpan={COLUMNS.length} className="text-center text-gray-400 py-10">No projects match your filters.</td></tr>
                )}
                {sortedProjects.map((p) => (
                  <tr key={p.id} className="hover:bg-cloud cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
                    <td className="px-4 py-3 font-bold text-navy whitespace-nowrap">{p.job_order_number}</td>
                    <td className="px-4 py-3">{p.project_name || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3"><CategoryBadge category={p.category} /></td>
                    <td className="px-4 py-3">{p.quantity}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-navy"><Money value={p.total_amount} /></td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmtDate(p.target_date)}</td>
                    <td className="px-4 py-3"><StageBadge status={p.status} /></td>
                    <td className="px-4 py-3"><PriorityBadge priority={p.priority} /></td>
                    <td className="px-4 py-3 whitespace-nowrap"><DaysLeft targetDate={p.target_date} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showForm && <ProjectForm onClose={() => setShowForm(false)} onSaved={() => load()} />}
    </div>
  );
}
