/**
 * Ambient type declarations for all database tables and views.
 * Kept in sync with db/schema.sql and db/migrations/.
 *
 * This project is JavaScript (no tsc). VS Code's language server
 * reads .d.ts files automatically. Reference these types in .jsx
 * files via JSDoc:
 *
 *   @type {import('../types/database').RequestItem}
 *   @param {import('../types/database').RequestItemEnriched} item
 */

// ─── Enums ───────────────────────────────────────────────────

/** Lifecycle status of an individual request item. */
export type ItemStatus =
  | 'pending'
  | 'uploaded'
  | 'reviewed'
  | 'needs_revision'
  | 'complete'
  | 'not_applicable';

/**
 * Functional area the item belongs to.
 * Stored lowercase; format for display at the component level only.
 */
export type ItemArea =
  | 'finance'
  | 'legal'
  | 'tax'
  | 'hr'
  | 'it'
  | 'ops'
  | 'other';

/**
 * Collection priority.
 * 'normal' is the default; 'critical' items appear first in sorted views.
 */
export type ItemPriority = 'critical' | 'high' | 'normal';

/**
 * Data-handling sensitivity classification.
 * 'pii' and 'privileged' items must not be displayed to unauthorized users.
 */
export type ItemSensitivity = 'standard' | 'pii' | 'privileged';

/** Lifecycle status of a request (the parent container). */
export type RequestLifecycleStatus = 'active' | 'completed' | 'archived';

// ─── Tables ──────────────────────────────────────────────────

/** Row type for the `requests` table. */
export interface Request {
  id: string;
  project_name: string;
  /** Supabase auth UID of the advisor who created the request. */
  created_by: string | null;
  share_token: string;
  /** ISO timestamp string. Note: stored as TIMESTAMP (no tz) in DB. */
  created_at: string | null;
  status: RequestLifecycleStatus | null;
}

/**
 * Row type for the `request_items` table.
 * Columns added in migration 20260911000001 are grouped at the bottom.
 */
export interface RequestItem {
  // ── Original columns ─────────────────────────────────────
  id: string;
  request_id: string;
  contact_email: string;
  area: ItemArea | null;
  item_name: string;
  /** ISO date string (YYYY-MM-DD). Column is stored as DATE in Postgres. */
  deadline: string | null;
  owner: string | null;
  status: ItemStatus;
  file_path: string | null;
  /** ISO timestamp string. Note: stored as TIMESTAMP (no tz) in DB. */
  uploaded_at: string | null;
  /** Client-visible notes. */
  notes: string | null;

  // ── Added in migration 20260911000001 ────────────────────
  /** Human-readable ID, e.g. "FIN-002". Unique within a request when set. */
  ref_code: string | null;
  /** Optional second axis, e.g. "asc_606". */
  workstream: string | null;
  priority: ItemPriority;
  /** The detailed ask shown to the client. */
  description: string | null;
  /** Reporting period, e.g. "q3_fy26" or "as_of_2026_08_31". */
  period: string | null;
  /** Expected file format, e.g. "xlsx", "pdf", "native_export". */
  expected_format: string | null;
  sensitivity: ItemSensitivity;
  /**
   * The advisor who added this item.
   * Currently stored as the Supabase auth UID (text) from requests.created_by.
   * TODO: Change to UUID FK when a riveron_users table is introduced.
   */
  requested_by: string | null;
  /**
   * The advisor responsible for reviewing this item.
   * TODO: Change to UUID FK when a riveron_users table is introduced.
   */
  reviewer: string | null;
  /** ISO timestamp string (TIMESTAMPTZ). When the item was added. */
  requested_at: string;
  /** ISO timestamp string (TIMESTAMPTZ). When the item was last reviewed. */
  reviewed_at: string | null;
  /** Internal review notes. Never sent to the client. */
  review_notes: string | null;
  /** Increments each time the client resubmits after needs_revision. */
  revision_round: number;
  /** Free-text explanation of why the item is blocked. */
  blocked_reason: string | null;
  /** Number of reminder emails sent for this item. */
  reminder_count: number;
  /** ISO timestamp string (TIMESTAMPTZ). When the last reminder was sent. */
  last_reminder_at: string | null;
  /** Row number from the originating Excel import. Null if added manually. */
  source_row: number | null;
}

/**
 * Row type for the `request_items_enriched` view.
 * Extends RequestItem with three columns computed at query time.
 * Do not store these values — they are derived from deadline and
 * requested_at and go stale the moment they are written to disk.
 */
export interface RequestItemEnriched extends RequestItem {
  /**
   * True when status is 'pending' or 'needs_revision' AND deadline
   * is before today. False when deadline is NULL.
   */
  is_overdue: boolean;
  /**
   * Calendar days past deadline when is_overdue is true, otherwise 0.
   * Integer (Postgres interval in days).
   */
  days_overdue: number;
  /**
   * Calendar days since the item was added (CURRENT_DATE - requested_at::date).
   * Always >= 0.
   */
  days_outstanding: number;
}

// ─── Supporting tables ────────────────────────────────────────

/** Row type for the `auth_sessions` table (backend OTP flow). */
export interface AuthSession {
  id: string;
  request_id: string;
  email: string;
  /** bcrypt hash of the OTP code. Never expose to the client. */
  otp_code: string;
  /** ISO timestamp string. */
  created_at: string;
  /** ISO timestamp string. */
  expires_at: string;
  attempts: number;
  /** ISO timestamp string. Null until the OTP is successfully verified. */
  verified_at: string | null;
  /** Signed JWT issued after successful verification. */
  session_token: string | null;
}

/** Row type for the `audit_log` table. */
export interface AuditLog {
  id: string;
  request_id: string | null;
  action: string;
  /** Email address or Supabase auth UID of the actor. */
  actor: string;
  /** ISO timestamp string. */
  timestamp: string;
  /** INET address as a string, or null if not captured. */
  ip_address: string | null;
  details: Record<string, unknown>;
}
