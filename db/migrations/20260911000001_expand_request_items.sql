-- ============================================================
-- Migration: 20260911000001_expand_request_items
-- Adds metadata columns to request_items, widens the status
-- enum to include needs_revision and not_applicable, adds check
-- constraints on area / priority / sensitivity, backfills existing
-- rows, and creates the request_items_enriched view.
--
-- not_applicable exists so items the client confirms are
-- inapplicable are excluded from "outstanding" counts without
-- being deleted from the audit trail.
-- ============================================================

BEGIN;

-- ─── 1. Add new columns ──────────────────────────────────────
-- All nullable or with defaults so the ALTER is instantaneous on
-- existing rows — no table rewrite required.

ALTER TABLE request_items
  ADD COLUMN IF NOT EXISTS ref_code         TEXT,
  ADD COLUMN IF NOT EXISTS workstream       TEXT,
  ADD COLUMN IF NOT EXISTS priority         TEXT         NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS description      TEXT,
  ADD COLUMN IF NOT EXISTS period           TEXT,
  ADD COLUMN IF NOT EXISTS expected_format  TEXT,
  ADD COLUMN IF NOT EXISTS sensitivity      TEXT         NOT NULL DEFAULT 'standard',
  -- TODO: When a riveron_users table is introduced, replace these TEXT
  -- columns with UUID FKs:
  --   requested_by UUID REFERENCES riveron_users(id)
  --   reviewer     UUID REFERENCES riveron_users(id)
  -- Until then, store the Supabase auth UID (a UUID printed as text)
  -- from the parent request's created_by column.
  ADD COLUMN IF NOT EXISTS requested_by     TEXT,
  ADD COLUMN IF NOT EXISTS reviewer         TEXT,
  ADD COLUMN IF NOT EXISTS requested_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reviewed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_notes     TEXT,
  ADD COLUMN IF NOT EXISTS revision_round   INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocked_reason   TEXT,
  ADD COLUMN IF NOT EXISTS reminder_count   INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_row       INT;

-- ─── 2. Backfill existing rows ───────────────────────────────

-- 2a. Coerce free-text area values that don't match the new enum
-- (including NULLs) to 'other' so the check constraint can be added.
UPDATE request_items
SET area = 'other'
WHERE area IS NULL
   OR area NOT IN ('finance', 'legal', 'tax', 'hr', 'it', 'ops', 'other');

-- 2b. Assign ref_codes to rows that don't have one yet.
-- Format: GEN-001, GEN-002, … restarting per request_id.
WITH ranked AS (
  SELECT
    id,
    'GEN-' || LPAD(
      ROW_NUMBER() OVER (PARTITION BY request_id ORDER BY id)::text,
      3, '0'
    ) AS new_ref_code
  FROM request_items
  WHERE ref_code IS NULL
)
UPDATE request_items ri
SET ref_code = ranked.new_ref_code
FROM ranked
WHERE ri.id = ranked.id;

-- 2c. Set requested_by from the parent request's created_by UUID.
-- Stored as text until the riveron_users table and FK exist.
UPDATE request_items ri
SET requested_by = r.created_by::text
FROM requests r
WHERE r.id = ri.request_id
  AND ri.requested_by IS NULL
  AND r.created_by IS NOT NULL;

-- ─── 3. Widen the status check constraint ────────────────────
-- The original constraint was added without a name, so Postgres
-- assigned one automatically. Find and drop it dynamically rather
-- than assuming the auto-generated name.

DO $$
DECLARE v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'request_items'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';
  IF v_constraint IS NOT NULL THEN
    EXECUTE 'ALTER TABLE request_items DROP CONSTRAINT ' || quote_ident(v_constraint);
  END IF;
END $$;

ALTER TABLE request_items
  ADD CONSTRAINT chk_request_items_status
    CHECK (status IN (
      'pending',
      'uploaded',
      'reviewed',
      'needs_revision',
      'complete',
      'not_applicable'
    ));

-- ─── 4. Add check constraints for new enum columns ───────────
-- Run after the backfill so existing rows already comply.

ALTER TABLE request_items
  ADD CONSTRAINT chk_request_items_area
    CHECK (area IN ('finance', 'legal', 'tax', 'hr', 'it', 'ops', 'other'));

ALTER TABLE request_items
  ADD CONSTRAINT chk_request_items_priority
    CHECK (priority IN ('critical', 'high', 'normal'));

ALTER TABLE request_items
  ADD CONSTRAINT chk_request_items_sensitivity
    CHECK (sensitivity IN ('standard', 'pii', 'privileged'));

-- ─── 5. Indexes ──────────────────────────────────────────────

-- Unique per request: two items in the same request cannot share a
-- ref_code. NULL values are distinct in Postgres unique indexes, so
-- rows without a ref_code don't conflict with each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_request_items_ref_code
  ON request_items (request_id, ref_code);

CREATE INDEX IF NOT EXISTS idx_request_items_area
  ON request_items (request_id, area);

-- Note: the column is named 'deadline' in this schema. A future rename
-- to 'due_date' would require a separate migration.
CREATE INDEX IF NOT EXISTS idx_request_items_deadline
  ON request_items (request_id, deadline);

CREATE INDEX IF NOT EXISTS idx_request_items_requested_by
  ON request_items (requested_by);

-- ─── 6. request_items_enriched view ─────────────────────────
-- Computed columns are derived at query time — never stored —
-- so they stay accurate without any background job.
--
-- is_overdue      true when the item is open and past its deadline
-- days_overdue    calendar days past deadline (0 when not overdue)
-- days_outstanding calendar days since the item was added

CREATE VIEW request_items_enriched AS
SELECT
  *,
  COALESCE(
    status IN ('pending', 'needs_revision') AND deadline < CURRENT_DATE,
    FALSE
  ) AS is_overdue,
  CASE
    WHEN status IN ('pending', 'needs_revision') AND deadline < CURRENT_DATE
      THEN CURRENT_DATE - deadline
    ELSE 0
  END AS days_overdue,
  CURRENT_DATE - requested_at::date AS days_outstanding
FROM request_items;

COMMIT;
