import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { Card } from './components';

// Derive low-stock items from an inventory summary array (total <= threshold).
function deriveLow(items) {
  return (items || [])
    .map((it) => ({ ...it, total: it.total ?? 0 }))
    .filter((it) => it.total <= (it.low_stock_threshold ?? 0))
    .sort((a, b) => a.total - b.total);
}

// Low-stock summary card. Pass `items` (an inventory summary array) to compute
// locally, or omit to fetch /inventory/low-stock. `showLink` adds an Inventory link.
export default function LowStockCard({ items, showLink = true, limit = 6, className = '' }) {
  const [low, setLow] = useState(items ? deriveLow(items) : null);

  useEffect(() => {
    if (items) { setLow(deriveLow(items)); return; }
    let alive = true;
    api.get('/inventory/low-stock').then((d) => { if (alive) setLow(d.items || []); }).catch(() => { if (alive) setLow([]); });
    return () => { alive = false; };
  }, [items]);

  const outCount = (low || []).filter((i) => i.total <= 0).length;

  return (
    <Card className={`overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="font-bold text-navy flex items-center gap-2">
          ⚠️ Low Stock
          {low && low.length > 0 && <span className="text-xs font-bold text-red-700 bg-red-100 rounded-full px-2 py-0.5">{low.length}</span>}
        </h2>
        {showLink && <Link to="/inventory" className="text-xs font-medium text-navy hover:underline">View Inventory →</Link>}
      </div>

      {low === null ? (
        <div className="px-4 py-6 text-center text-gray-400 text-sm">Loading…</div>
      ) : low.length === 0 ? (
        <div className="px-4 py-6 text-center text-gray-500 text-sm">✓ All items are above their low-stock levels.</div>
      ) : (
        <>
          {outCount > 0 && (
            <div className="px-4 py-2 bg-red-50 text-red-700 text-xs font-semibold border-b border-red-100">
              {outCount} item{outCount !== 1 ? 's' : ''} out of stock
            </div>
          )}
          <ul className="divide-y divide-gray-100">
            {low.slice(0, limit).map((it) => (
              <li key={it.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-navy truncate">{it.name}</div>
                  <div className="text-xs text-gray-400">{it.category}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-bold ${it.total <= 0 ? 'text-red-600' : 'text-orange-600'}`}>{it.total} {it.unit || ''}</div>
                  <div className="text-[11px] text-gray-400">min {it.low_stock_threshold}</div>
                </div>
              </li>
            ))}
          </ul>
          {low.length > limit && (
            <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">
              + {low.length - limit} more{showLink ? ' — ' : ''}
              {showLink && <Link to="/inventory" className="text-navy hover:underline font-medium">see all in Inventory</Link>}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
