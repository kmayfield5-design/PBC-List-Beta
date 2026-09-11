-- ============================================================
-- Down migration: 20260911000001_expand_request_items
-- Reverses the expand_request_items migration.
--
-- WARNING: rows with status 'needs_revision' or 'not_applicable'
-- will be reset to 'pending' because those values don't exist in
-- the original constraint. This data loss is intentional and
-- expected when rolling back.
-- ============================================================

BEGIN;

-- ─── 1. Drop the enriched view ───────────────────────────────

DROP VIEW IF EXISTS request_items_enriched;

-- ─── 2. Drop new indexes ─────────────────────────────────────

DROP INDEX IF EXISTS idx_request_items_ref_code;
DROP INDEX IF EXISTS idx_request_items_area;
DROP INDEX IF EXISTS idx_request_items_deadline;
DROP INDEX IF EXISTS idx_request_items_requested_by;

-- ─── 3. Drop new check constraints ───────────────────────────

ALTER TABLE request_items
  DROP CONSTRAINT IF EXISTS chk_request_items_status,
  DROP CONSTRAINT IF EXISTS chk_request_items_area,
  DROP CONSTRAINT IF EXISTS chk_request_items_priority,
  DROP CONSTRAINT IF EXISTS chk_request_items_sensitivity;

-- ─── 4. Reset status values that won't satisfy the old constraint

UPDATE request_items
SET status = 'pending'
WHERE status IN ('needs_revision', 'not_applicable');

-- ─── 5. Restore the original status check constraint ─────────
-- Named to match what Postgres auto-generates for an unnamed CHECK,
-- so it's consistent with the original schema.sql.

ALTER TABLE request_items
  ADD CONSTRAINT request_items_status_check
    CHECK (status IN ('pending', 'uploaded', 'reviewed', 'complete'));

-- ─── 6. Drop new columns ─────────────────────────────────────

ALTER TABLE request_items
  DROP COLUMN IF EXISTS ref_code,
  DROP COLUMN IF EXISTS workstream,
  DROP COLUMN IF EXISTS priority,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS period,
  DROP COLUMN IF EXISTS expected_format,
  DROP COLUMN IF EXISTS sensitivity,
  DROP COLUMN IF EXISTS requested_by,
  DROP COLUMN IF EXISTS reviewer,
  DROP COLUMN IF EXISTS requested_at,
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS review_notes,
  DROP COLUMN IF EXISTS revision_round,
  DROP COLUMN IF EXISTS blocked_reason,
  DROP COLUMN IF EXISTS reminder_count,
  DROP COLUMN IF EXISTS last_reminder_at,
  DROP COLUMN IF EXISTS source_row;

COMMIT;
