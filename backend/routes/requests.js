const express = require('express');
const multer = require('multer');
const supabase = require('../config/supabase');
const { verifyJWT } = require('../middleware/auth');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// All routes in this file require a valid JWT
router.use(verifyJWT);

async function insertAuditLog({ action, actor, request_id, details = {} }) {
  const { error } = await supabase
    .from('audit_log')
    .insert({ action, actor, request_id, details });
  if (error) console.error('audit_log insert failed:', error.message);
}

/**
 * GET /api/requests/:requestId/items
 *
 * Returns the request and the authenticated user's items.
 * JWT payload must contain a request_id matching the URL param —
 * this prevents a client from using their token to read a different request.
 */
router.get('/:requestId/items', async (req, res) => {
  const { requestId } = req.params;
  const { request_id, email } = req.user;

  // Ensure the token was issued for this specific request
  if (request_id !== requestId) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  // Fetch the parent request
  const { data: request, error: requestError } = await supabase
    .from('requests')
    .select('id, project_name, status, created_at')
    .eq('id', requestId)
    .single();

  if (requestError || !request) {
    return res.status(404).json({ success: false, message: 'Request not found.' });
  }

  // Fetch only the items assigned to this user's email
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

    // Confirm item belongs to this request and email before touching storage
    const { data: item, error: itemError } = await supabase
      .from('request_items')
      .select('id')
      .eq('id', itemId)
      .eq('request_id', requestId)
      .eq('contact_email', email.toLowerCase())
      .single();

    if (itemError || !item) {
      return res.status(404).json({ success: false, message: 'Item not found.' });
    }

    // Timestamp prefix prevents collisions when replacing a file
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

    // Update item row — only set status to 'uploaded' if still pending
    // (don't downgrade reviewed/complete items on re-upload)
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
      // File is in storage but the DB record didn't update — flag clearly
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
