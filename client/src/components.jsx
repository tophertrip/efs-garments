import { STAGE_MAP, daysLeftLabel } from './constants';
import { useCategories } from './categories';

export function StageBadge({ status }) {
  const s = STAGE_MAP[status];
  if (!s) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${s.color}`}>
      <span>{s.emoji}</span>{s.label}
    </span>
  );
}

export function CategoryBadge({ category }) {
  const { label } = useCategories();
  return (
    <span className="inline-block px-2 py-0.5 rounded-md text-xs font-medium bg-navy/10 text-navy">
      {label(category)}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  if (priority === 'urgent')
    return <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-red-100 text-red-700">URGENT</span>;
  if (priority === 'low')
    return <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-500">Low</span>;
  return <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600">Normal</span>;
}

export function DaysLeft({ targetDate, className = '' }) {
  const d = daysLeftLabel(targetDate);
  const tone = d.overdue ? 'text-red-600 font-bold' : d.soon ? 'text-amber-600 font-semibold' : 'text-gray-500';
  return <span className={`${tone} ${className}`}>{d.text}</span>;
}

export function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>{children}</div>;
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-lg px-4 py-2 text-sm transition disabled:opacity-50 disabled:cursor-not-allowed';
  const styles = {
    primary: 'bg-navy text-white hover:bg-navy-light',
    gold: 'bg-gold text-navy hover:bg-gold-dark',
    outline: 'border border-gray-300 text-gray-700 bg-white hover:bg-gray-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-gray-600 hover:bg-gray-100',
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Field({ label, children, required }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/60 focus:border-gold';

export function Input(props) {
  return <input {...props} className={`${inputCls} ${props.className || ''}`} />;
}
export function Textarea(props) {
  return <textarea {...props} className={`${inputCls} ${props.className || ''}`} />;
}
export function Select(props) {
  return <select {...props} className={`${inputCls} bg-white ${props.className || ''}`} />;
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="text-lg font-bold text-navy">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ title = 'Are you sure?', message, confirmLabel = 'Delete', onConfirm, onClose, busy, error }) {
  return (
    <Modal title={title} onClose={onClose}>
      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>}
      <p className="text-sm text-gray-600 mb-5">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
        <Button variant="danger" type="button" onClick={onConfirm} disabled={busy}>
          {busy ? 'Deleting…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export function Empty({ children }) {
  return <div className="text-center text-gray-400 py-12 text-sm">{children}</div>;
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="h-8 w-8 rounded-full border-4 border-gray-200 border-t-navy animate-spin" />
    </div>
  );
}
