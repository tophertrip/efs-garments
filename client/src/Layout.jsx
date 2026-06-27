import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { ROLE_LABELS } from './constants';

const adminNav = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/projects', label: 'Projects', icon: '📁' },
  { to: '/customers', label: 'Customers', icon: '👥' },
  { to: '/reports', label: 'Reports', icon: '📈' },
  { to: '/tasks', label: 'Reminders', icon: '🔔' },
];

const teamNav = [
  { to: '/', label: 'My Work', icon: '🧰', end: true },
  { to: '/tasks', label: 'My Tasks', icon: '🔔' },
];

// Finance sees their stage (Delivered) plus all projects & customers.
const financeNav = [
  { to: '/', label: 'My Work', icon: '🧰', end: true },
  { to: '/projects', label: 'Projects', icon: '📁' },
  { to: '/customers', label: 'Customers', icon: '👥' },
  { to: '/reports', label: 'Reports', icon: '📈' },
  { to: '/tasks', label: 'My Tasks', icon: '🔔' },
];

export default function Layout({ children }) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const nav = isAdmin ? adminNav : user?.role === 'finance' ? financeNav : teamNav;

  const initials = (user?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('');

  function doLogout() {
    logout();
    navigate('/login');
  }

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-5 flex items-center gap-3 border-b border-white/10">
        <div className="h-10 w-10 rounded-xl bg-gold text-navy font-extrabold flex items-center justify-center">EFS</div>
        <div>
          <div className="text-white font-bold leading-tight">EFS Garments</div>
          <div className="text-gray-400 text-xs">Production Tracker</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                isActive ? 'bg-gold text-navy' : 'text-gray-300 hover:bg-white/10'
              }`
            }
          >
            <span>{item.icon}</span>{item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-2 mb-3">
          <div className="h-9 w-9 rounded-full bg-navy-light text-white text-sm font-bold flex items-center justify-center uppercase">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-white text-sm font-semibold truncate">{user?.name}</div>
            <div className="text-gray-400 text-xs">{ROLE_LABELS[user?.role] || user?.role}</div>
          </div>
        </div>
        <button onClick={doLogout} className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-white/10">
          ↩ Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-cloud">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 bg-navy flex-shrink-0">{sidebar}</aside>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="w-64 bg-navy">{sidebar}</div>
          <div className="flex-1 bg-black/40" onClick={() => setOpen(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between bg-navy px-4 py-3">
          <button onClick={() => setOpen(true)} className="text-white text-2xl">☰</button>
          <span className="text-white font-bold">EFS Garments</span>
          <div className="h-8 w-8 rounded-full bg-gold text-navy text-xs font-bold flex items-center justify-center uppercase">
            {initials}
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
