import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';
import { CATEGORIES as DEFAULTS } from './constants';

// Provides the (DB-backed) list of product categories plus a label lookup and
// an inline "add new" helper. Falls back to the built-in defaults if the API
// is unreachable so the UI never breaks.
const CategoryContext = createContext(null);

function prettify(slug) {
  if (!slug) return '—';
  return String(slug).replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export function CategoryProvider({ children }) {
  const [categories, setCategories] = useState(DEFAULTS);

  const reload = useCallback(async () => {
    try {
      const list = await api.get('/categories');
      if (Array.isArray(list) && list.length) setCategories(list);
    } catch { /* keep defaults */ }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const label = useCallback(
    (key) => categories.find((c) => c.key === key)?.label || prettify(key),
    [categories]
  );

  const addCategory = useCallback(async (name) => {
    const created = await api.post('/categories', { name });
    await reload();
    return created; // { key, label }
  }, [reload]);

  return (
    <CategoryContext.Provider value={{ categories, label, addCategory, reload }}>
      {children}
    </CategoryContext.Provider>
  );
}

export function useCategories() {
  return useContext(CategoryContext) || { categories: DEFAULTS, label: prettify, addCategory: async () => {}, reload: async () => {} };
}
