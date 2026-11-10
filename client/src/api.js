// Tiny fetch wrapper that attaches the auth token and parses JSON.
const TOKEN_KEY = 'efs_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  // An expired or invalid session: clear it and return to the login screen,
  // so the user re-logs in instead of seeing broken pages. (A wrong PIN also
  // returns 401 on /auth/login — leave that one alone to show its error.)
  if (res.status === 401 && url !== '/auth/login') {
    const hadToken = !!getToken();
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem('efs_user'); } catch {}
    if (hadToken) window.location.reload(); // only when we actually had a session (no reload loop)
    throw new Error('Session expired — please log in again');
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
};
