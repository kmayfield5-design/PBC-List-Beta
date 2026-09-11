-- ============================================================
-- PBC List Beta — Supabase PostgreSQL Schema
-- ============================================================

-- ─── requests ────────────────────────────────────────────────

CREATE TABLE requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name TEXT        NOT NULL,
  created_by   UUID,
  share_token  TEXT        UNIQUE NOT NULL,
  created_at   TIMESTAMP   DEFAULT now(),
  status       TEXT        CHECK (status IN ('active', 'archived', 'completed'))
);

-- ─── request_items ───────────────────────────────────────────

CREATE TABLE request_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID        NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  contact_email TEXT      NOT NULL,
  area        TEXT,
  item_name   TEXT        NOT NULL,
  deadline    DATE,
  owner       TEXT,
  status      TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'uploaded', 'reviewed', 'complete')),
  file_path   TEXT,
  uploaded_at TIMESTAMP,
  notes       TEXT
);

-- ─── auth_sessions ───────────────────────────────────────────
-- verified_at doubles as the verification timestamp (NULL = unverified)
-- session_token stores the signed JWT after successful OTP verification

CREATE TABLE auth_sessions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID        NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  email         TEXT        NOT NULL,
  otp_code      TEXT        NOT NULL,
  created_at    TIMESTAMP   NOT NULL DEFAULT now(),
  expires_at    TIMESTAMP   NOT NULL,
  attempts      INT         NOT NULL DEFAULT 0,
  verified_at   TIMESTAMP,
  session_token TEXT
);

-- ─── audit_log ───────────────────────────────────────────────

CREATE TABLE audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID        REFERENCES requests(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL,
  actor       TEXT        NOT NULL,
  timestamp   TIMESTAMP   NOT NULL DEFAULT now(),
  ip_address  INET,
  details     JSONB       NOT NULL DEFAULT '{}'
);

-- ─── RLS Policies ────────────────────────────────────────────

ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can read requests"
  ON requests FOR SELECT TO authenticated USING (true);

CREATE POLICY "Advisors can insert requests"
  ON requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

ALTER TABLE request_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can read items"
  ON request_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Advisors can insert items"
  ON request_items FOR INSERT TO authenticated
  WITH CHECK (true);

-- ─── Indexes ─────────────────────────────────────────────────

CREATE UNIQUE INDEX idx_requests_share_token
  ON requests (share_token);

CREATE INDEX idx_auth_sessions_request_email
  ON auth_sessions (request_id, email);

CREATE INDEX idx_audit_log_request_timestamp
  ON audit_log (request_id, timestamp DESC);
