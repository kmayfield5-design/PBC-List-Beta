'use strict';

// ─── Sort allowlist ───────────────────────────────────────────
// An unvalidated sort field is an injection vector. Every field
// accepted here must be a real column or computed column on the
// request_items_enriched view.

const SORTABLE_FIELDS = new Set([
  'deadline',
  'ref_code',
  'item_name',
  'area',
  'status',
  'priority',
  'requested_at',
  'reviewed_at',
  'sensitivity',
  'workstream',
  'period',
  'reminder_count',
  'revision_round',
  // Computed view columns
  'is_overdue',
  'days_overdue',
  'days_outstanding',
]);

/**
 * Parse the `sort` query parameter.
 * A leading '-' means descending; no prefix means ascending.
 *
 * @param {string|undefined} sortParam
 * @returns {{ field: string, ascending: boolean, nullsFirst: boolean }
 *           | { error: string }}
 */
function parseSort(sortParam) {
  if (!sortParam) {
    return { field: 'deadline', ascending: true, nullsFirst: false };
  }
  const descending = sortParam.startsWith('-');
  const field = descending ? sortParam.slice(1) : sortParam;
  if (!SORTABLE_FIELDS.has(field)) {
    return { error: `"${field}" is not a valid sort field.` };
  }
  return { field, ascending: !descending, nullsFirst: false };
}

/**
 * Split a comma-separated query parameter value into a trimmed array.
 * Returns null when the parameter is absent or empty.
 *
 * @param {string|undefined} val
 * @returns {string[]|null}
 */
function parseCommaList(val) {
  if (!val) return null;
  const parts = String(val).split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : null;
}

/**
 * Parse pagination parameters.
 *
 * @param {object} query - Express req.query
 * @returns {{ page: number, limit: number, offset: number }}
 */
function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Apply all active filters to a Supabase query builder.
 *
 * Each call is safe against injection: list filters use `.in()`,
 * range filters use `.gte()` / `.lte()`, and free-text search uses
 * `.or()` with a sanitised pattern. No query value is interpolated
 * directly into a SQL string.
 *
 * @param {object} builder - Supabase query builder (from `.select()`)
 * @param {object} filters - parsed filter object from `parseFilters()`
 * @param {{ skip?: string }} [opts] - omit one facet's own filter for
 *   facet-count queries (so selecting Finance doesn't hide Legal)
 * @returns {object} builder with filters chained
 */
function applyFilters(builder, filters, { skip = null } = {}) {
  if (filters.area?.length && skip !== 'area') {
    builder = builder.in('area', filters.area);
  }
  if (filters.status?.length && skip !== 'status') {
    builder = builder.in('status', filters.status);
  }
  if (filters.priority?.length && skip !== 'priority') {
    builder = builder.in('priority', filters.priority);
  }
  if (filters.requested_by?.length && skip !== 'requested_by') {
    builder = builder.in('requested_by', filters.requested_by);
  }
  if (filters.reviewer?.length && skip !== 'reviewer') {
    builder = builder.in('reviewer', filters.reviewer);
  }
  if (filters.workstream?.length && skip !== 'workstream') {
    builder = builder.in('workstream', filters.workstream);
  }
  if (filters.sensitivity?.length && skip !== 'sensitivity') {
    builder = builder.in('sensitivity', filters.sensitivity);
  }

  if (filters.due_from) builder = builder.gte('deadline', filters.due_from);
  if (filters.due_to)   builder = builder.lte('deadline', filters.due_to);

  if (filters.uploaded_from) builder = builder.gte('uploaded_at', filters.uploaded_from);
  if (filters.uploaded_to)   builder = builder.lte('uploaded_at', filters.uploaded_to);

  if (filters.overdue === true)  builder = builder.eq('is_overdue', true);
  if (filters.overdue === false) builder = builder.eq('is_overdue', false);

  if (filters.due_within != null) {
    const today  = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + filters.due_within * 86_400_000)
      .toISOString().slice(0, 10);
    builder = builder.gte('deadline', today).lte('deadline', future);
  }

  if (filters.q) {
    // Strip characters that would break PostgREST's filter string syntax,
    // then build a multi-column OR ilike. Individual column filters use
    // PostgREST's own parameterisation so the pattern value is safe.
    const safe = filters.q.replace(/[,()"%\\]/g, '').trim().slice(0, 200);
    if (safe) {
      builder = builder.or(
        [
          `item_name.ilike.%${safe}%`,
          `ref_code.ilike.%${safe}%`,
          `description.ilike.%${safe}%`,
          `contact_email.ilike.%${safe}%`,
          `period.ilike.%${safe}%`,
        ].join(',')
      );
    }
  }

  return builder;
}

/**
 * Parse all recognised filter parameters from req.query into a
 * canonical filters object. Does not touch the Supabase builder.
 *
 * @param {object} query - Express req.query
 * @returns {object} filters
 */
function parseFilters(query) {
  const filters = {
    area:         parseCommaList(query.area),
    status:       parseCommaList(query.status),
    priority:     parseCommaList(query.priority),
    requested_by: parseCommaList(query.requested_by),
    reviewer:     parseCommaList(query.reviewer),
    workstream:   parseCommaList(query.workstream),
    sensitivity:  parseCommaList(query.sensitivity),
    due_from:     query.due_from     || null,
    due_to:       query.due_to       || null,
    uploaded_from: query.uploaded_from || null,
    uploaded_to:   query.uploaded_to   || null,
    q:            query.q ? String(query.q).trim() : null,
  };

  // overdue: 'true' | 'false' | undefined → boolean | undefined
  if (query.overdue === 'true')       filters.overdue = true;
  else if (query.overdue === 'false') filters.overdue = false;

  // due_within: positive integer days
  if (query.due_within) {
    const n = parseInt(query.due_within, 10);
    if (!isNaN(n) && n >= 0) filters.due_within = n;
  }

  return filters;
}

/**
 * Compute facet counts for one field.
 * Applies all filters except that field's own filter, fetches the
 * column, and counts values in JavaScript.
 *
 * @param {object} supabase
 * @param {string} requestId
 * @param {object} filters
 * @param {string} field - facet column name
 * @returns {Promise<Record<string,number>>}
 */
async function computeFacet(supabase, requestId, filters, field) {
  const { data, error } = await applyFilters(
    supabase
      .from('request_items_enriched')
      .select(field)
      .eq('request_id', requestId),
    filters,
    { skip: field }
  );

  if (error || !data) return {};

  const counts = {};
  for (const row of data) {
    const val = row[field] != null ? String(row[field]) : 'unknown';
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

module.exports = {
  SORTABLE_FIELDS,
  parseSort,
  parseCommaList,
  parsePagination,
  parseFilters,
  applyFilters,
  computeFacet,
};
