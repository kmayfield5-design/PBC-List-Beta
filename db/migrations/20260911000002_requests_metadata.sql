-- ============================================================
-- Migration: 20260911000002_requests_metadata
-- Adds a metadata JSONB column to requests for per-engagement
-- vocabulary (areas, workstreams, defaults).
--
-- The DEFAULT includes a sensible starting vocabulary for an IPO
-- readiness engagement. Advisors can override this per project
-- via the project detail API or directly in the DB.
-- ============================================================

BEGIN;

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{
    "areas": [
      {"value": "finance", "label": "Finance"},
      {"value": "legal",   "label": "Legal"},
      {"value": "tax",     "label": "Tax"},
      {"value": "hr",      "label": "HR"},
      {"value": "it",      "label": "IT"},
      {"value": "ops",     "label": "Operations"},
      {"value": "other",   "label": "Other"}
    ],
    "workstreams": [],
    "defaults": {
      "expected_format": "xlsx"
    }
  }'::jsonb;

COMMIT;
