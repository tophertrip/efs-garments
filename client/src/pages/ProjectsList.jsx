import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { STAGES, fmtDate } from '../constants';
import { parseCsv, downloadText } from '../csv';
import { useCategories } from '../categories';
import { useAuth } from '../auth';
import { Card, Spinner, Button, StageBadge, CategoryBadge, PriorityBadge, DaysLeft, Input, Select } from '../components';
import ProjectForm from '../ProjectForm';
import CategoryManager from '../CategoryManager';

export default function ProjectsList() {
  const { categories, label: catLabel, reload: reloadCategories } = useCategories();
  const { isAdmin } = useAuth();
  const [showCats, setShowCats] = useState(false);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({ status: '', category: '', from: '', to: '', search: '' });
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState(null); // { ok, text }

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
    const headers = ['Job Order', 'Project Name', 'Customer', 'Category', 'Quantity', 'Unit Price', 'Total', 'Target Date', 'Status', 'Priority'];
    const rows = projects.map((p) => [
      p.job_order_number, p.project_name || '', p.customer_name, catLabel(p.category),
      p.quantity, p.unit_price ?? '', p.total_amount ?? '', p.target_date, p.status, p.priority,
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
          <Input placeholder="🔍 Search customer / JO #" value={filters.search} onChange={(e) => set('search', e.target.value)} />
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
                  {['Job Order', 'Project Name', 'Category', 'Qty', 'Target Date', 'Status', 'Priority', 'Days Left'].map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {projects.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-gray-400 py-10">No projects match your filters.</td></tr>
                )}
                {projects.map((p) => (
                  <tr key={p.id} className="hover:bg-cloud cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
                    <td className="px-4 py-3 font-bold text-navy whitespace-nowrap">{p.job_order_number}</td>
                    <td className="px-4 py-3">{p.project_name || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3"><CategoryBadge category={p.category} /></td>
                    <td className="px-4 py-3">{p.quantity}</td>
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
