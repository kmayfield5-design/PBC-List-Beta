'use strict';

const {
  parseSort,
  parseCommaList,
  parsePagination,
  parseFilters,
  applyFilters,
  SORTABLE_FIELDS,
} = require('../lib/itemsQuery');

// ─── Recording builder ────────────────────────────────────────
// A minimal fake of the Supabase query builder.
// Every method records its call and returns `this` for chaining.
// Awaiting it resolves to { data: [], error: null }.

function makeBuilder() {
  const calls = [];
  const builder = {
    _calls: calls,
    then: (resolve) => resolve({ data: [], error: null }),
  };
  for (const method of [
    'select', 'eq', 'in', 'gte', 'lte', 'or', 'ilike',
    'order', 'range',
  ]) {
    builder[method] = (...args) => {
      calls.push({ method, args });
      return builder;
    };
  }
  return builder;
}

function calledWith(builder, method, ...args) {
  return builder._calls.some(
    (c) => c.method === method && JSON.stringify(c.args) === JSON.stringify(args)
  );
}

// ─── parseSort ────────────────────────────────────────────────

describe('parseSort', () => {
  it('defaults to deadline ascending when no param is provided', () => {
    expect(parseSort(undefined)).toEqual({ field: 'deadline', ascending: true, nullsFirst: false });
  });

  it('parses ascending field', () => {
    expect(parseSort('area')).toMatchObject({ field: 'area', ascending: true });
  });

  it('parses descending field prefixed with -', () => {
    expect(parseSort('-requested_at')).toMatchObject({ field: 'requested_at', ascending: false });
  });

  it('returns error for a field not in the allowlist', () => {
    expect(parseSort('contact_email')).toHaveProperty('error');
    expect(parseSort('created_by')).toHaveProperty('error');
  });

  it('returns error for an attempt to inject SQL via sort param', () => {
    expect(parseSort("deadline; DROP TABLE request_items--")).toHaveProperty('error');
    expect(parseSort("1 OR 1=1")).toHaveProperty('error');
  });

  it('accepts all defined sortable fields without error', () => {
    for (const field of SORTABLE_FIELDS) {
      expect(parseSort(field)).not.toHaveProperty('error');
      expect(parseSort(`-${field}`)).not.toHaveProperty('error');
    }
  });
});

// ─── parseCommaList ───────────────────────────────────────────

describe('parseCommaList', () => {
  it('returns null for undefined', () => {
    expect(parseCommaList(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseCommaList('')).toBeNull();
  });

  it('splits a comma-separated string', () => {
    expect(parseCommaList('finance,legal')).toEqual(['finance', 'legal']);
  });

  it('trims whitespace from each value', () => {
    expect(parseCommaList('finance, legal , tax')).toEqual(['finance', 'legal', 'tax']);
  });

  it('drops empty segments', () => {
    expect(parseCommaList('finance,,tax')).toEqual(['finance', 'tax']);
  });
});

// ─── parsePagination ─────────────────────────────────────────

describe('parsePagination', () => {
  it('defaults to page 1, limit 50', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 50, offset: 0 });
  });

  it('computes offset from page and limit', () => {
    expect(parsePagination({ page: '3', limit: '20' })).toEqual({ page: 3, limit: 20, offset: 40 });
  });

  it('clamps limit to hard maximum of 200', () => {
    expect(parsePagination({ limit: '999' }).limit).toBe(200);
  });

  it('clamps page to minimum of 1', () => {
    expect(parsePagination({ page: '0' }).page).toBe(1);
    expect(parsePagination({ page: '-5' }).page).toBe(1);
  });

  it('ignores non-numeric values and falls back to defaults', () => {
    expect(parsePagination({ page: 'abc', limit: 'xyz' })).toEqual({ page: 1, limit: 50, offset: 0 });
  });
});

// ─── parseFilters ─────────────────────────────────────────────

describe('parseFilters', () => {
  it('parses comma-separated list params into arrays', () => {
    const f = parseFilters({ area: 'finance,legal', status: 'pending' });
    expect(f.area).toEqual(['finance', 'legal']);
    expect(f.status).toEqual(['pending']);
  });

  it('parses overdue=true as boolean true', () => {
    expect(parseFilters({ overdue: 'true' }).overdue).toBe(true);
  });

  it('parses overdue=false as boolean false', () => {
    expect(parseFilters({ overdue: 'false' }).overdue).toBe(false);
  });

  it('omits overdue when not provided', () => {
    const f = parseFilters({});
    expect(f).not.toHaveProperty('overdue');
  });

  it('parses due_within as a non-negative integer', () => {
    expect(parseFilters({ due_within: '14' }).due_within).toBe(14);
  });

  it('ignores negative due_within', () => {
    expect(parseFilters({ due_within: '-1' })).not.toHaveProperty('due_within');
  });

  it('passes q through as a trimmed string', () => {
    expect(parseFilters({ q: '  board minutes  ' }).q).toBe('board minutes');
  });
});

// ─── applyFilters ─────────────────────────────────────────────

describe('applyFilters — list filters', () => {
  it('calls .in("area", [...]) for area filter', () => {
    const b = makeBuilder();
    applyFilters(b, { area: ['finance', 'legal'] });
    expect(calledWith(b, 'in', 'area', ['finance', 'legal'])).toBe(true);
  });

  it('calls .in("status", [...]) for status filter', () => {
    const b = makeBuilder();
    applyFilters(b, { status: ['pending', 'uploaded'] });
    expect(calledWith(b, 'in', 'status', ['pending', 'uploaded'])).toBe(true);
  });

  it('calls .in("priority", [...]) for priority filter', () => {
    const b = makeBuilder();
    applyFilters(b, { priority: ['critical'] });
    expect(calledWith(b, 'in', 'priority', ['critical'])).toBe(true);
  });

  it('calls .in for requested_by, reviewer, workstream, sensitivity', () => {
    const b = makeBuilder();
    applyFilters(b, {
      requested_by: ['uid-1'],
      reviewer: ['uid-2'],
      workstream: ['asc_606'],
      sensitivity: ['pii'],
    });
    expect(calledWith(b, 'in', 'requested_by', ['uid-1'])).toBe(true);
    expect(calledWith(b, 'in', 'reviewer',     ['uid-2'])).toBe(true);
    expect(calledWith(b, 'in', 'workstream',   ['asc_606'])).toBe(true);
    expect(calledWith(b, 'in', 'sensitivity',  ['pii'])).toBe(true);
  });

  it('does not call .in when a filter is null/absent', () => {
    const b = makeBuilder();
    applyFilters(b, { area: null, status: null });
    expect(b._calls.some((c) => c.method === 'in')).toBe(false);
  });
});

describe('applyFilters — date range filters', () => {
  it('calls .gte("deadline", ...) for due_from', () => {
    const b = makeBuilder();
    applyFilters(b, { due_from: '2026-10-01' });
    expect(calledWith(b, 'gte', 'deadline', '2026-10-01')).toBe(true);
  });

  it('calls .lte("deadline", ...) for due_to', () => {
    const b = makeBuilder();
    applyFilters(b, { due_to: '2026-12-31' });
    expect(calledWith(b, 'lte', 'deadline', '2026-12-31')).toBe(true);
  });

  it('applies both .gte and .lte when both range ends are provided', () => {
    const b = makeBuilder();
    applyFilters(b, { due_from: '2026-10-01', due_to: '2026-12-31' });
    expect(calledWith(b, 'gte', 'deadline', '2026-10-01')).toBe(true);
    expect(calledWith(b, 'lte', 'deadline', '2026-12-31')).toBe(true);
  });

  it('applies gte/lte on uploaded_at for uploaded_from/uploaded_to', () => {
    const b = makeBuilder();
    applyFilters(b, { uploaded_from: '2026-09-01', uploaded_to: '2026-09-30' });
    expect(calledWith(b, 'gte', 'uploaded_at', '2026-09-01')).toBe(true);
    expect(calledWith(b, 'lte', 'uploaded_at', '2026-09-30')).toBe(true);
  });
});

describe('applyFilters — overdue', () => {
  it('calls .eq("is_overdue", true) when overdue is true', () => {
    const b = makeBuilder();
    applyFilters(b, { overdue: true });
    expect(calledWith(b, 'eq', 'is_overdue', true)).toBe(true);
  });

  it('calls .eq("is_overdue", false) when overdue is false', () => {
    const b = makeBuilder();
    applyFilters(b, { overdue: false });
    expect(calledWith(b, 'eq', 'is_overdue', false)).toBe(true);
  });

  it('does not apply overdue filter when overdue is undefined', () => {
    const b = makeBuilder();
    applyFilters(b, {});
    expect(b._calls.some((c) => c.method === 'eq' && c.args[0] === 'is_overdue')).toBe(false);
  });
});

describe('applyFilters — due_within', () => {
  it('adds deadline gte today and lte today+N when due_within is set', () => {
    const b = makeBuilder();
    const today = new Date().toISOString().slice(0, 10);
    applyFilters(b, { due_within: 7 });
    const gteCalls = b._calls.filter((c) => c.method === 'gte' && c.args[0] === 'deadline');
    const lteCalls = b._calls.filter((c) => c.method === 'lte' && c.args[0] === 'deadline');
    expect(gteCalls.length).toBe(1);
    expect(lteCalls.length).toBe(1);
    expect(gteCalls[0].args[1]).toBe(today);
    // Upper bound should be N days in the future
    const upper = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    expect(lteCalls[0].args[1]).toBe(upper);
  });
});

describe('applyFilters — free text search (q)', () => {
  it('calls .or() with ilike patterns across all text columns', () => {
    const b = makeBuilder();
    applyFilters(b, { q: 'board' });
    const orCalls = b._calls.filter((c) => c.method === 'or');
    expect(orCalls.length).toBe(1);
    const filterStr = orCalls[0].args[0];
    expect(filterStr).toContain('item_name.ilike.%board%');
    expect(filterStr).toContain('ref_code.ilike.%board%');
    expect(filterStr).toContain('description.ilike.%board%');
    expect(filterStr).toContain('contact_email.ilike.%board%');
    expect(filterStr).toContain('period.ilike.%board%');
  });

  it('strips characters that could break PostgREST filter syntax', () => {
    const b = makeBuilder();
    applyFilters(b, { q: 'bad"value,with(parens)' });
    const orCall = b._calls.find((c) => c.method === 'or');
    // Stripped chars should not appear in the filter string
    expect(orCall.args[0]).not.toContain('"');
    expect(orCall.args[0]).not.toContain(',value,');
    expect(orCall.args[0]).not.toContain('(');
  });

  it('does not call .or() when q is empty', () => {
    const b = makeBuilder();
    applyFilters(b, { q: '   ' });
    expect(b._calls.some((c) => c.method === 'or')).toBe(false);
  });
});

describe('applyFilters — AND/OR combination semantics', () => {
  it('combines area and status with AND (both .in() calls present)', () => {
    const b = makeBuilder();
    applyFilters(b, { area: ['finance', 'legal'], status: ['pending'] });
    // Both filters applied → each returns items matching area OR area,
    // and items must satisfy both → AND across parameters
    expect(calledWith(b, 'in', 'area',   ['finance', 'legal'])).toBe(true);
    expect(calledWith(b, 'in', 'status', ['pending'])).toBe(true);
    // Should be exactly 2 .in() calls
    expect(b._calls.filter((c) => c.method === 'in').length).toBe(2);
  });
});

describe('applyFilters — facet skip option', () => {
  it('omits the area filter when skip="area"', () => {
    const b = makeBuilder();
    applyFilters(b, { area: ['finance'], status: ['pending'] }, { skip: 'area' });
    expect(b._calls.some((c) => c.method === 'in' && c.args[0] === 'area')).toBe(false);
    expect(calledWith(b, 'in', 'status', ['pending'])).toBe(true);
  });

  it('omits the status filter when skip="status"', () => {
    const b = makeBuilder();
    applyFilters(b, { area: ['finance'], status: ['pending'] }, { skip: 'status' });
    expect(calledWith(b, 'in', 'area', ['finance'])).toBe(true);
    expect(b._calls.some((c) => c.method === 'in' && c.args[0] === 'status')).toBe(false);
  });
});
