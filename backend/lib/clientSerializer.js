'use strict';

// Permitted fields for the client-facing item shape.
//
// This is an allowlist: new columns added to request_items are NEVER exposed
// to clients until explicitly added here. A deny-list would break the moment
// someone runs a migration — this won't.
const CLIENT_ITEM_FIELDS = [
  'id',
  'ref_code',
  'area',
  'item_name',
  'contact_email',
  'description',
  'period',
  'expected_format',
  'deadline',
  'status',
  'file_path',
  'uploaded_at',
];

// Supabase select string derived from the allowlist so the two never drift.
const CLIENT_ITEM_SELECT = CLIENT_ITEM_FIELDS.join(', ');

// Fields that must never appear in a client response.
// Used only in tests; the serializer enforces the boundary by picking, not rejecting.
const CLIENT_ITEM_FORBIDDEN = [
  'requested_by',
  'reviewer',
  'priority',
  'review_notes',
  'notes',
  'blocked_reason',
  'reminder_count',
  'last_reminder_at',
  'revision_round',
  'sensitivity',
  'source_row',
  'owner',
  'workstream',
];

function serializeClientItem(row) {
  if (!row) return null;
  const out = {};
  for (const field of CLIENT_ITEM_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(row, field)) {
      out[field] = row[field];
    }
  }
  return out;
}

function serializeClientItems(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(serializeClientItem);
}

module.exports = {
  CLIENT_ITEM_FIELDS,
  CLIENT_ITEM_SELECT,
  CLIENT_ITEM_FORBIDDEN,
  serializeClientItem,
  serializeClientItems,
};
