-- ============================================================
-- Down migration: 20260911000002_requests_metadata
-- Removes the metadata column from requests.
--
-- WARNING: all per-engagement vocabulary customisations stored in
-- metadata will be permanently deleted. Back up the column first
-- if any projects have non-default vocabulary.
-- ============================================================

BEGIN;

ALTER TABLE requests
  DROP COLUMN IF EXISTS metadata;

COMMIT;
