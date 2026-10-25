import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearToken, getToken, setToken } from './api';

const AuthCtx = createContext(null);

const normalizeUser = (u) =>
  u && {
    ...u,
    role: String(u.role || '').toLowerCase(),
    mustChangePassword: !!(u.mustChangePassword ?? u.must_change_password),
  };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());
  // null = still checking, true/false once known
  const [initialized, setInitialized] = useState(null);
  const [setupError, setSetupError] = useState(null);

  const refreshSetup = useCallback(async () => {
    try {
      const s = await api.get('/setup/status');
      setInitialized(!!(s.initialized ?? s.isSetup ?? s.completed));
      setSetupError(null);
    } catch (e) {
      setSetupError(e);
    }
  }, []);

  const loadUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.get('/auth/me');
      setUser(normalizeUser(me.user || me));
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSetup();
    loadUser();
  }, [refreshSetup, loadUser]);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('hcm:unauthorized', onUnauthorized);
    return () => window.removeEventListener('hcm:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    setToken(res.token);
    const u = normalizeUser(res.user);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* token is dropped locally either way */
    }
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, initialized, setupError, login, logout, reloadUser: loadUser, refreshSetup }),
    [user, loading, initialized, setupError, login, logout, loadUser, refreshSetup]
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
