import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';

// Fallback per-role tab visibility (mirrors the backend defaults).
const DEFAULTS = {
  admin: ['dashboard', 'projects', 'calendar', 'customers', 'reports', 'tasks'],
  marketing: ['dashboard', 'projects', 'calendar', 'customers', 'tasks'],
  finance: ['projects', 'calendar', 'customers', 'reports', 'tasks'],
  purchasing: ['calendar', 'tasks'],
  printing: ['calendar', 'tasks'],
  cutting_sewing: ['calendar', 'tasks'],
  qa: ['calendar', 'tasks'],
  graphic_artist: ['calendar', 'tasks'],
};

const PermissionsContext = createContext(null);

export function PermissionsProvider({ children }) {
  const [perms, setPerms] = useState(DEFAULTS);

  const reload = useCallback(async () => {
    try {
      const p = await api.get('/permissions');
      if (p && typeof p === 'object') setPerms(p);
    } catch { /* keep defaults */ }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const can = useCallback(
    (role, tab) => role === 'admin' || (perms[role] || []).includes(tab),
    [perms]
  );
  const tabsFor = useCallback((role) => perms[role] || [], [perms]);

  return (
    <PermissionsContext.Provider value={{ perms, can, tabsFor, reload }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext) || {
    perms: DEFAULTS,
    can: (role, tab) => role === 'admin' || (DEFAULTS[role] || []).includes(tab),
    tabsFor: (role) => DEFAULTS[role] || [],
    reload: async () => {},
  };
}
