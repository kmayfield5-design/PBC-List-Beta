'use strict';

const express = require('express');
const multer = require('multer');
const supabase = require('../config/supabase');
const { verifyJWT } = require('../middleware/auth');
const { verifyAdvisorJWT } = require('../middleware/advisorAuth');
const { insertItemWithRefCode, AREA_PREFIXES } = require('../lib/refCode');
const {
  parseSort, parseFilters, parsePagination, applyFilters, computeFacet,
} = require('../lib/itemsQuery');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

async function insertAuditLog({ action, actor, request_id, details = {} }) {
  const { error } = await supabase
    .from('audit_log')
    .insert({ action, actor, request_id, details });
  if (error) console.error('audit_log insert failed:', error.message);
}

// ─── Advisor routes ───────────────────────────────────────────
// These require a Supabase Auth JWT (issued to the logged-in advisor).
// Authorization: the request must be owned by the calling advisor.

/**
 * GET /api/requests/:requestId
 *
 * Returns project metadata including the vocabulary (areas, workstreams,
 * defaults) so the frontend can render filter chips and dropdowns from
 * config rather than hardcoded arrays.
 */
router.get('/:requestId', verifyAdvisorJWT, async (req, res) => {
  const { requestId } = req.params;
  const advisorId = req.advisor.id;

  const { data: request, error } = await supabase
    .from('requests')
    .select('id, project_name, status, share_token, created_at, metadata')
    .eq('id', requestId)
    .eq('created_by', advisorId)
    .single();

  if (error || !request) {
    return res.status(404).json({ success: false, message: 'Request not found.' });
  }

  return res.json({
    success: true,
    request,
    vocabulary: request.metadata ?? {},
  });
});

/**
 * POST /api/requests/:requestId/items
 *
 * Creates a new request item with a server-generated ref_code.
 * Concurrent-insert safe: the unique index on (request_id, ref_code) is
 * the backstop; insertItemWithRefCode retries on unique violation.
 *
 * Required body fields: item_name, contact_email, area
 * Optional: owner, deadline, description, workstream, priority,
 *           sensitivity, expected_format, period
 */
router.post('/:requestId/items', verifyAdvisorJWT, async (req, res) => {
  const { requestId } = req.params;
  const advisorId = req.advisor.id;

  // Confirm this request belongs to the calling advisor before touching it.
  const { data: request, error: reqError } = await supabase
    .from('requests')
    .select('id')
    .eq('id', requestId)
    .eq('created_by', advisorId)
    .single();

  if (reqError || !request) {
    return res.status(404).json({ success: false, message: 'Request not found.' });
  }

  const {
    item_name,
    contact_email,
    area,
    owner,
    deadline,
    description,
    workstream,
    priority,
    sensitivity,
    expected_format,
    period,
  } = req.body;

  if (!item_name || !contact_email || !area) {
    return res.status(400).json({
      success: false,
      message: 'item_name, contact_email, and area are required.',
    });
  }

  if (!AREA_PREFIXES[area]) {
    return res.status(400).json({
      success: false,
      message: `Invalid area. Must be one of: ${Object.keys(AREA_PREFIXES).join(', ')}.`,
    });
  }

  let item;
  try {
    item = await insertItemWithRefCode(supabase, requestId, area, {
      item_name,
      contact_email: contact_email.toLowerCase(),
      owner: owner ?? null,
      deadline: deadline ?? null,
      description: description ?? null,
      workstream: workstream ?? null,
      priority: priority ?? 'normal',
      sensitivity: sensitivity ?? 'standard',
      expected_format: expected_format ?? null,
      period: period ?? null,
      requested_by: advisorId,
      status: 'pending',
    });
  } catch (err) {
    console.error('insertItemWithRefCode failed:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create item.' });
  }

  await insertAuditLog({
    action: 'item_created',
    actor: req.advisor.email,
    request_id: requestId,
    details: { item_id: item.id, ref_code: item.ref_code, area, item_name },
  });

  return res.status(201).json({ success: true, item });
});

/**
 * GET /api/requests/:requestId/items
 *
 * Full-featured item list for the advisor dashboard: filtering, sorting,
 * pagination, and facet counts — all against the request_items_enriched view.
 *
 * Query parameters:
 *   area, status, priority, requested_by, reviewer, workstream, sensitivity
 *     — comma-separated; values within one param combine with OR,
 *       different params combine with AND
 *   due_from, due_to     — ISO date, inclusive deadline range
 *   uploaded_from, uploaded_to — ISO date, inclusive upload range
 *   overdue              — 'true' | 'false'
 *   due_within           — positive integer days (today … today + N)
 *   q                    — free text across item_name, ref_code, description,
 *                          contact_email, period
 *   sort                 — column name; prefix with '-' for descending
 *   page, limit          — pagination; default 50, max 200
 *
 * Response: { items, total, page, limit, facets }
 * Facets: per-value counts for area, status, priority, and requested_by,
 * computed without each facet's own constraint so counts stay accurate
 * when a filter is already active.
 */
router.get('/:requestId/items', verifyAdvisorJWT, async (req, res) => {
  const { requestId } = req.params;
  const advisorId = req.advisor.id;

  // ── 1. Validate sort before touching the DB ───────────────────
  const sort = parseSort(req.query.sort);
  if (sort.error) {
    return res.status(400).json({ success: false, message: sort.error });
  }

  // ── 2. Authorization: request must belong to this advisor ──────
  const { data: request, error: reqError } = await supabase
    .from('requests')
    .select('id')
    .eq('id', requestId)
    .eq('created_by', advisorId)
    .single();

  if (reqError || !request) {
    return res.status(404).json({ success: false, message: 'Request not found.' });
  }

  // ── 3. Parse filters and pagination ───────────────────────────
  const filters = parseFilters(req.query);
  const { page, limit, offset } = parsePagination(req.query);

  // ── 4. Main paginated query ───────────────────────────────────
  const baseBuilder = () =>
    applyFilters(
      supabase
        .from('request_items_enriched')
        .eq('request_id', requestId),
      filters
    );

  const { data: items, count, error: itemsError } = await baseBuilder()
    .select('*', { count: 'exact' })
    .order(sort.field, { ascending: sort.ascending, nullsFirst: sort.nullsFirst })
    .range(offset, offset + limit - 1);

  if (itemsError) {
    console.error('request_items_enriched fetch failed:', itemsError.message);
    return res.status(500).json({ success: false, message: 'Failed to load items.' });
  }

  // ── 5. Facet counts (each query skips its own filter) ─────────
  const [areaFacet, statusFacet, priorityFacet, requestedByFacet] = await Promise.all([
    computeFacet(supabase, requestId, filters, 'area'),
    computeFacet(supabase, requestId, filters, 'status'),
    computeFacet(supabase, requestId, filters, 'priority'),
    computeFacet(supabase, requestId, filters, 'requested_by'),
  ]);

  return res.json({
    success: true,
    items:  items ?? [],
    total:  count ?? 0,
    page,
    limit,
    facets: {
      area:         areaFacet,
      status:       statusFacet,
      priority:     priorityFacet,
      requested_by: requestedByFacet,
    },
  });
});

// ─── Client routes ────────────────────────────────────────────
// These require the custom client JWT (issued after OTP verification).
// Authorization: the token's request_id must match the URL param.

/**
 * GET /api/requests/:requestId/my-items
 *
 * Returns only the items assigned to the authenticated client's email.
 * Used by the client upload portal (OTP auth flow).
 */
router.get('/:requestId/my-items', verifyJWT, async (req, res) => {
  const { requestId } = req.params;
  const { request_id, email } = req.user;

  if (request_id !== requestId) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  const { data: request, error: requestError } = await supabase
    .from('requests')
    .select('id, project_name, status, created_at')
    .eq('id', requestId)
    .single();

  if (requestError || !request) {
    return res.status(404).json({ success: false, message: 'Request not found.' });
  }

  const { data: items, error: itemsError } = await supabase
    .from('request_items')
    .select('id, item_name, owner, deadline, status, file_path, uploaded_at, notes')
    .eq('request_id', requestId)
    .eq('contact_email', email.toLowerCase())
    .order('deadline', { ascending: true, nullsFirst: false });

  if (itemsError) {
    console.error('request_items fetch failed:', itemsError.message);
    return res.status(500).json({ success: false, message: 'Failed to load items.' });
  }

  return res.json({ success: true, request, items });
});

/**
 * POST /api/requests/:requestId/items/:itemId/upload
 *
 * Accepts a single file, pushes it to Supabase Storage, then updates
 * the item row with the storage path and marks status = 'uploaded'.
 */
router.post(
  '/:requestId/items/:itemId/upload',
  verifyJWT,
  upload.single('file'),
  async (req, res) => {
    const { requestId, itemId } = req.params;
    const { request_id, email } = req.user;

    if (request_id !== requestId) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file provided.' });
    }

    const { data: item, error: itemError } = await supabase
      .from('request_items')
      .select('id, status')
      .eq('id', itemId)
      .eq('request_id', requestId)
      .eq('contact_email', email.toLowerCase())
      .single();

    if (itemError || !item) {
      return res.status(404).json({ success: false, message: 'Item not found.' });
    }

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${requestId}/${itemId}/${Date.now()}-${safeName}`;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'pbc-uploads';

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase Storage upload failed:', uploadError.message);
      return res.status(502).json({ success: false, message: 'File upload failed. Please try again.' });
    }

    const { data: updatedItem, error: updateError } = await supabase
      .from('request_items')
      .update({
        file_path: storagePath,
        uploaded_at: new Date().toISOString(),
        status: item.status === 'pending' ? 'uploaded' : item.status,
      })
      .eq('id', itemId)
      .select('id, item_name, owner, deadline, status, file_path, uploaded_at, notes')
      .single();

    if (updateError || !updatedItem) {
      console.error('request_items update failed:', updateError?.message);
      return res.status(500).json({
        success: false,
        message: 'File saved but record update failed. Please contact support.',
      });
    }

    await insertAuditLog({
      action: 'file_uploaded',
      actor: email.toLowerCase(),
      request_id: requestId,
      details: { item_id: itemId, file_path: storagePath, file_name: req.file.originalname },
    });

    return res.json({ success: true, item: updatedItem });
  }
);

// Multer error handler — must have 4 args so Express recognises it as an error handler
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'File exceeds the 10 MB limit.' });
  }
  next(err);
});

module.exports = router;
