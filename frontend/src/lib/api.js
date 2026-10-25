// Thin fetch wrapper. All requests go to /api/* and carry the JWT.
// Authorization is ALWAYS enforced by the backend; the UI only hides what a role can't use.

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const API = `${BASE}/api`;
const KEY = 'hcm_token';

export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t) => localStorage.setItem(KEY, t);
export const clearToken = () => localStorage.removeItem(KEY);

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const DEFAULT_MESSAGES = {
  400: 'Please check the entered data.',
  401: 'Your session has expired. Please sign in again.',
  403: "You don't have permission to do that.",
  404: 'We could not find what you were looking for.',
  409: 'This was already done (conflict).',
  422: 'Please check the entered data.',
  429: 'Too many requests. Please slow down and try again shortly.',
};

function qs(params) {
  if (!params) return '';
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.append(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function request(method, path, { body, params, form, raw, timeout = 30000 } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(`${API}${path}${qs(params)}`, { method, headers, body: payload, signal: ctrl.signal });
  } catch (e) {
    clearTimeout(timer);
    throw new ApiError(
      e.name === 'AbortError'
        ? 'The request timed out. Please try again.'
        : 'Cannot reach the server. Check your connection and try again.',
      0
    );
  }
  clearTimeout(timer);

  if (raw && res.ok) return res;

  let data = null;
  if (res.status !== 204) {
    const ct = res.headers.get('content-type') || '';
    data = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text().catch(() => null);
  }

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      clearToken();
      window.dispatchEvent(new Event('hcm:unauthorized'));
    }
    const message =
      (data && typeof data === 'object' && (data.message || data.error)) ||
      (typeof data === 'string' && data.length < 200 && data) ||
      DEFAULT_MESSAGES[res.status] ||
      (res.status >= 500 ? 'Server error. Please try again.' : 'Request failed.');
    throw new ApiError(message, res.status, data && typeof data === 'object' ? data.errors || data : data);
  }
  return data;
}

export const api = {
  get: (path, params, opts) => request('GET', path, { params, ...opts }),
  post: (path, body, opts) => request('POST', path, { body: body ?? {}, ...opts }),
  put: (path, body, opts) => request('PUT', path, { body: body ?? {}, ...opts }),
  patch: (path, body, opts) => request('PATCH', path, { body: body ?? {}, ...opts }),
  del: (path, opts) => request('DELETE', path, opts),
  upload: (path, form, params) => request('POST', path, { form, params, timeout: 60000 }),
  async download(path, filename, params) {
    const res = await request('GET', path, { params, raw: true, timeout: 60000 });
    saveBlob(await res.blob(), filename);
  },
};

/** Map backend validation errors ([{field,message}]) to { field: message } for forms. */
export function fieldErrors(err) {
  const out = {};
  const d = err?.details;
  if (Array.isArray(d)) {
    d.forEach((x) => {
      if (x?.field) out[x.field] = x.reason || x.message;
    });
  }
  return out;
}

export const errMsg = (e) => e?.message || 'Something went wrong. Please try again.';
