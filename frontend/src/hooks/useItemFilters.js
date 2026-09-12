import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

const MULTI_FIELDS = ['area', 'status', 'priority', 'requested_by', 'reviewer', 'workstream', 'sensitivity'];
const SCALAR_FIELDS = ['sort', 'due_from', 'due_to', 'uploaded_from', 'uploaded_to', 'overdue', 'due_within'];

function parseFilters(params) {
  const filters = {};
  for (const field of MULTI_FIELDS) {
    const val = params.get(field);
    if (val) filters[field] = val.split(',').filter(Boolean);
  }
  for (const field of SCALAR_FIELDS) {
    const val = params.get(field);
    if (val) filters[field] = val;
  }
  const q = params.get('q');
  if (q) filters.q = q;
  return filters;
}

function countActive(params) {
  let n = 0;
  for (const field of [...MULTI_FIELDS, ...SCALAR_FIELDS, 'q']) {
    if (params.get(field)) n++;
  }
  return n;
}

export function useItemFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchText, setSearchText] = useState(searchParams.get('q') ?? '');
  const debounceRef = useRef(null);

  // Debounce: flush searchText → URL after 300 ms without adding a history entry
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        const trimmed = searchText.trim();
        if (trimmed) next.set('q', trimmed);
        else next.delete('q');
        return next;
      }, { replace: true });
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchText, setSearchParams]);

  // Toggle one value in a multi-select field (comma-separated in URL)
  const toggle = useCallback((field, value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const current = (next.get(field) ?? '').split(',').filter(Boolean);
      const idx = current.indexOf(String(value));
      if (idx === -1) current.push(String(value));
      else current.splice(idx, 1);
      if (current.length) next.set(field, current.join(','));
      else next.delete(field);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Set a scalar field value (or delete it when value is null/empty)
  const set = useCallback((field, value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value == null || value === '') next.delete(field);
      else next.set(field, String(value));
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Set multiple scalar fields atomically in a single history replace
  const setMultiple = useCallback((updates) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [field, value] of Object.entries(updates)) {
        if (value == null || value === '') next.delete(field);
        else next.set(field, String(value));
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const clearAll = useCallback(() => {
    setSearchText('');
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  return {
    filters: parseFilters(searchParams),
    queryString: searchParams.toString(),
    searchText,
    setSearchText,
    toggle,
    set,
    setMultiple,
    clearAll,
    activeFilterCount: countActive(searchParams),
  };
}
