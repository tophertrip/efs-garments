import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';

// Fallback per-role tab visibility (mirrors the backend defaults).
const DEFAULTS = {
  admin: ['dashboard', 'projects', 'calendar', 'customers', 'reports', 'payments', 'finance', 'inventory', 'store', 'tasks'],
  marketing: ['dashboard', 'projects', 'calendar', 'customers', 'tasks'],
  finance: ['projects', 'calendar', 'customers', 'reports', 'payments', 'finance', 'tasks'],
  purchasing: ['calendar', 'inventory', 'tasks'],
  printing: ['calendar', 'tasks'],
  cutting_sewing: ['calendar', 'tasks'],
  qa: ['calendar', 'tasks'],
  graphic_artist: ['calendar', 'tasks'],
};

// Fallback roles allowed to see money amounts (mirrors backend DEFAULT_PRICE_ROLES).
const DEFAULT_PRICE_ROLES = ['admin', 'finance'];

const PermissionsContext = createContext(null);

export function PermissionsProvider({ children }) {
  const [perms, setPerms] = useState(DEFAULTS);
  const [priceRoles, setPriceRoles] = useState(DEFAULT_PRICE_ROLES);

  const reload = useCallback(async () => {
    try {
      const p = await api.get('/permissions');
      if (p && typeof p === 'object') setPerms(p);
    } catch { /* keep defaults */ }
    try {
      const pr = await api.get('/price-visibility');
      if (Array.isArray(pr)) setPriceRoles(pr);
    } catch { /* keep defaults */ }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const can = useCallback(
    (role, tab) => role === 'admin' || (perms[role] || []).includes(tab),
    [perms]
  );
  const tabsFor = useCallback((role) => perms[role] || [], [perms]);
  const canSeePrice = useCallback(
    (role) => role === 'admin' || priceRoles.includes(role),
    [priceRoles]
  );

  return (
    <PermissionsContext.Provider value={{ perms, can, tabsFor, priceRoles, canSeePrice, reload }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext) || {
    perms: DEFAULTS,
    can: (role, tab) => role === 'admin' || (DEFAULTS[role] || []).includes(tab),
    tabsFor: (role) => DEFAULTS[role] || [],
    priceRoles: DEFAULT_PRICE_ROLES,
    canSeePrice: (role) => role === 'admin' || DEFAULT_PRICE_ROLES.includes(role),
    reload: async () => {},
  };
}
