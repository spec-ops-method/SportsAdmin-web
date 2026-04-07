import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

type FetchState<T> = { data: T | null; loading: boolean; error: string | null };

export function useApi<T>(url: string | null): FetchState<T> & { refetch: () => void } {
  const { token } = useAuth();
  const [state, setState] = useState<FetchState<T>>({ data: null, loading: false, error: null });
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<T>;
      })
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch((err: Error) => { if (!cancelled) setState({ data: null, loading: false, error: err.message }); });

    return () => { cancelled = true; };
  }, [url, token, tick]);

  return { ...state, refetch };
}

export async function apiRequest<T>(
  url: string,
  method: string,
  token: string | null,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error?.message ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
