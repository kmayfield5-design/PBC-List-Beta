import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function useItemsList(requestId, queryString) {
  // data persists across re-fetches so old results stay visible while loading
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const fetchItems = useCallback(async () => {
    if (!requestId) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError('Not authenticated.');
      setLoading(false);
      return;
    }

    try {
      const qs = queryString ? `?${queryString}` : '';
      const res = await fetch(
        `${API_BASE}/api/requests/${requestId}/items${qs}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }

      const json = await res.json();
      if (!controller.signal.aborted) {
        setData(json);
        setError(null);
      }
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [requestId, queryString]);

  useEffect(() => {
    fetchItems();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [fetchItems]);

  return {
    items: data?.items ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? 1,
    limit: data?.limit ?? 50,
    facets: data?.facets ?? {},
    loading,
    error,
    refresh: fetchItems,
  };
}
