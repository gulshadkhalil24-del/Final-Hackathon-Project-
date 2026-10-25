import { useCallback, useEffect, useRef, useState } from 'react';
import { errMsg } from './api';
import { useToast } from '../components/toast.jsx';

/** Run an async loader on mount and whenever `deps` change. Ignores stale responses. */
export function useFetch(fn, deps = []) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);
  const [state, setState] = useState({ data: null, loading: true, error: null });

  const load = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      if (id === seq.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (id === seq.current) setState({ data: null, loading: false, error });
    }
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload: load };
}

export function useDebounce(value, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** Wrap a mutation: busy flag + success/error toasts. Returns the result, or undefined on failure. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (fn, { success, onError } = {}) => {
      setBusy(true);
      try {
        const r = await fn();
        if (success) toast.success(success);
        return r === undefined ? true : r;
      } catch (e) {
        toast.error(errMsg(e));
        onError?.(e);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast]
  );
  return [run, busy];
}
