'use strict';

/** Maps area values (stored lowercase) to their 2-3 letter ref_code prefixes. */
const AREA_PREFIXES = {
  finance: 'FIN',
  legal: 'LEG',
  tax: 'TAX',
  hr: 'HR',
  it: 'IT',
  ops: 'OPS',
  other: 'GEN',
};

/**
 * Reads how many items in this request already carry the given prefix
 * and returns the next candidate ref_code.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} requestId
 * @param {string} area
 * @param {number} [offset=0] Added to the count on each retry attempt.
 * @returns {Promise<string>} e.g. "FIN-003"
 */
async function generateRefCode(supabase, requestId, area, offset = 0) {
  const prefix = AREA_PREFIXES[area] ?? 'GEN';

  const { count, error } = await supabase
    .from('request_items')
    .select('id', { count: 'exact', head: true })
    .eq('request_id', requestId)
    .like('ref_code', `${prefix}-%`);

  if (error) throw error;

  const seq = (count ?? 0) + 1 + offset;
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

/**
 * Inserts a new request item, generating a unique ref_code atomically.
 *
 * Strategy: count existing items for this (request_id, prefix), compute the
 * next sequence number, and insert. The unique index on (request_id, ref_code)
 * is the backstop — if a concurrent insert landed the same code first (error
 * code 23505), increment the offset and retry.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} requestId
 * @param {string} area - must be a key of AREA_PREFIXES
 * @param {object} itemData - remaining columns to insert; must NOT include
 *   request_id, area, or ref_code (those are set here)
 * @param {number} [maxRetries=5]
 * @returns {Promise<object>} the inserted row, all columns
 */
async function insertItemWithRefCode(supabase, requestId, area, itemData, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const refCode = await generateRefCode(supabase, requestId, area, attempt);

    const { data, error } = await supabase
      .from('request_items')
      .insert({ ...itemData, request_id: requestId, area, ref_code: refCode })
      .select()
      .single();

    if (!error) return data;

    // Unique index violation — another process grabbed this code first; retry.
    if (error.code === '23505') continue;

    throw error;
  }

  throw new Error(`Failed to generate a unique ref_code after ${maxRetries} attempts`);
}

module.exports = { AREA_PREFIXES, generateRefCode, insertItemWithRefCode };
