// Stage + display metadata shared across the UI.
export const STAGES = [
  { key: 'inquiry',        label: 'Inquiry',            emoji: '📋', owner: 'admin',          color: 'bg-slate-100 text-slate-700 border-slate-300' },
  { key: 'quotation',      label: 'Quotation',          emoji: '💬', owner: 'admin',          color: 'bg-violet-100 text-violet-700 border-violet-300' },
  { key: 'confirmed',      label: 'Confirmed',          emoji: '✅', owner: 'admin',          color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { key: 'layout_pattern', label: 'Layout / Pattern',   emoji: '📐', owner: 'graphic_artist', color: 'bg-indigo-100 text-indigo-700 border-indigo-300' },
  { key: 'purchasing',     label: 'Purchasing',         emoji: '🛒', owner: 'purchasing',     color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { key: 'printing',       label: 'Printing',           emoji: '🖨️', owner: 'printing',       color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { key: 'cutting_sewing', label: 'Cutting & Sewing',   emoji: '✂️', owner: 'cutting_sewing', color: 'bg-pink-100 text-pink-700 border-pink-300' },
  { key: 'qa',             label: 'Quality Check',      emoji: '🔍', owner: 'qa',             color: 'bg-teal-100 text-teal-700 border-teal-300' },
  { key: 'ready',          label: 'Ready',              emoji: '📦', owner: 'admin',          color: 'bg-lime-100 text-lime-700 border-lime-300' },
  { key: 'delivered',      label: 'Delivered',          emoji: '🎉', owner: 'admin',          color: 'bg-green-100 text-green-700 border-green-300' },
  { key: 'paid',           label: 'Paid',               emoji: '💰', owner: 'admin',          color: 'bg-emerald-200 text-emerald-900 border-emerald-400' },
];

export const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.key, s]));
export const STAGE_KEYS = STAGES.map((s) => s.key);

export function nextStageKey(key) {
  const i = STAGE_KEYS.indexOf(key);
  return i >= 0 && i < STAGE_KEYS.length - 1 ? STAGE_KEYS[i + 1] : null;
}

export function prevStageKey(key) {
  const i = STAGE_KEYS.indexOf(key);
  return i > 0 ? STAGE_KEYS[i - 1] : null;
}

export const CATEGORIES = [
  { key: 'sportswear', label: 'Sportswear' },
  { key: 'activewear', label: 'Activewear' },
  { key: 'corporate', label: 'Corporate Uniform' },
  { key: 'school', label: 'School Uniform' },
];
export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

export const ROLE_LABELS = {
  admin: 'Admin',
  purchasing: 'Purchasing',
  printing: 'Printing',
  cutting_sewing: 'Cutting & Sewing',
  qa: 'Quality Check',
  finance: 'Finance',
  graphic_artist: 'Graphic Artist',
};

// Currency formatting (PHP).
export function peso(n) {
  if (n === null || n === undefined || n === '') return '—';
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Whole-day difference between target date and today. Negative = overdue.
export function daysLeft(targetDate) {
  if (!targetDate) return null;
  const target = new Date(targetDate + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

export function daysLeftLabel(targetDate) {
  const d = daysLeft(targetDate);
  if (d === null) return { text: '—', overdue: false, soon: false };
  if (d < 0) return { text: `${Math.abs(d)}d overdue`, overdue: true, soon: false };
  if (d === 0) return { text: 'Due today', overdue: false, soon: true };
  if (d <= 3) return { text: `${d}d left`, overdue: false, soon: true };
  return { text: `${d}d left`, overdue: false, soon: false };
}

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtDateTime(d) {
  if (!d) return '—';
  // SQLite stores UTC without timezone marker; treat as UTC.
  const iso = d.includes('T') ? d : d.replace(' ', 'T') + 'Z';
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
