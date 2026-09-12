# PBC List Beta — CLAUDE.md

## Project

Data request tracker for client advisory engagements. Riveron team members (advisors)
create a request — a named list of items to collect — and share a link with their client.
Clients authenticate with their email address and an OTP magic link, then upload files
against each item assigned to them. Advisors track item status, download files, and
manage the overall request lifecycle in real time.

Currently hosted on a personal Supabase project and Vercel. The plan is to migrate to
Riveron-hosted Supabase and Railway. All provider configuration must stay in environment
variables. Never hardcode project URLs, region strings, bucket names, or JWT secrets
anywhere in the source tree.

**Known gap:** `frontend/src/pages/RequestDetailPage.jsx` and `UploadPage.jsx` each
contain `const STORAGE_BUCKET = 'pbc-uploads'` hardcoded. This should be moved to an
env var (`VITE_SUPABASE_STORAGE_BUCKET`) before the infrastructure migration.

---

## Stack

### Frontend
| Package | Version | Role |
|---|---|---|
| react | 18.3.1 | UI framework |
| react-dom | 18.3.1 | DOM renderer |
| react-router-dom | 6.26.1 | Client-side routing (SPA) |
| @supabase/supabase-js | 2.45.0 | Auth, database, and storage client |
| xlsx | 0.18.5 | Excel template export and import |
| vite | 5.4.1 | Build tool and dev server |

No CSS framework. No UI component library. All styles are inline style objects using
hex tokens from `src/lib/theme.js`. See the **Styling** section under Conventions.

### Backend
| Package | Version | Role |
|---|---|---|
| express | 4.19.2 | HTTP server |
| @supabase/supabase-js | 2.45.0 | Supabase client (service role) |
| jsonwebtoken | 9.0.2 | Signs and verifies client session JWTs |
| bcryptjs | 2.4.3 | Hashes OTP codes before storage |
| resend | 3.4.0 | Sends OTP emails |
| multer | 1.4.5-lts.1 | Parses multipart file uploads |
| cors | 2.8.5 | CORS headers |
| dotenv | 16.4.5 | Loads `.env` |
| nodemon | 3.1.4 (dev) | Auto-restarts backend during development |

---

## Architecture

### Two auth systems — know which one is active

**Advisors** authenticate entirely through Supabase Auth. The frontend calls
`supabase.auth.signInWithPassword` or `supabase.auth.signInWithOtp` (magic link)
directly. No backend involvement.

**Clients** (historically) were meant to go through the Express backend's custom OTP
flow: `POST /api/auth/request-otp` → email code → `POST /api/auth/verify-otp` →
custom JWT. This system is fully built (see `backend/routes/auth.js`) but is
**not currently wired to the frontend**. The frontend `LoginPage.jsx` and
`AuthCallbackPage.jsx` instead use Supabase Auth magic links directly, bypassing
the backend entirely.

The backend OTP system is preserved in case it's needed for the Railway migration
or for scenarios where Supabase Auth is not available. Do not delete it, but do not
assume the frontend is using it.

### Data access

Advisor flows (dashboard, request detail, create request) call Supabase directly from
the frontend using the Supabase anon key and RLS policies. Mutations are not routed
through the Express backend.

The Express backend has two route groups with different auth:

**Client routes** — validated by `verifyJWT` (custom JWT signed with `JWT_SECRET`):
- `GET /api/requests/:requestId/my-items` — returns only the client's own items
- `POST /api/requests/:requestId/items/:itemId/upload` — file upload

**Advisor routes** — validated by `verifyAdvisorJWT` (calls `supabase.auth.getUser()`):
- `GET /api/requests/:requestId` — project + vocabulary for the advisor dashboard
- `GET /api/requests/:requestId/items` — full-featured item list: filtering, sorting,
  pagination, and facet counts against `request_items_enriched`
- `POST /api/requests/:requestId/items` — creates an item, generating a ref_code

All backend mutations write to `audit_log`; Supabase-direct frontend mutations do not.

### audit_log coverage

The `audit_log` table exists and is written by all backend routes. Frontend
direct-Supabase mutations (item status changes, request status changes, item
add/edit/delete) currently bypass the backend and therefore do not write audit
entries. Routing these operations through the backend API is the intended fix.

---

## Database schema (`db/schema.sql`)

Four tables:

| Table | Purpose |
|---|---|
| `requests` | One row per data request. `share_token` is the URL-safe identifier sent to clients. |
| `request_items` | Each item a client must upload. One row per file slot; `contact_email` controls who can upload. |
| `auth_sessions` | Backend OTP sessions: hashed code, attempt count, expiry, and the JWT issued after verification. |
| `audit_log` | Append-only event log: action, actor (email), request_id, details (JSONB). |

**Status enums (enforced by CHECK constraints):**
- `requests.status`: `active`, `completed`, `archived`
- `request_items.status`: `pending`, `uploaded`, `reviewed`, `needs_revision`, `complete`, `not_applicable` (widened in migration 20260911000001)

**`requests.metadata` (added in migration 20260911000002):**
JSONB column storing per-engagement vocabulary. Shape:
```json
{
  "areas":       [{"value": "finance", "label": "Finance"}, ...],
  "workstreams": [{"value": "asc_606", "label": "ASC 606"}, ...],
  "defaults":    {"expected_format": "xlsx"}
}
```
Default vocabulary (7 IPO readiness areas, no workstreams) is applied via SQL column
DEFAULT so every request created — even from the frontend — gets a vocabulary
automatically. The advisor backend route `GET /api/requests/:id` returns it as
`vocabulary` so the frontend can render dropdowns from config.

Row-level security is enabled on `requests` and `request_items`. Advisors (Supabase
`authenticated` role) can read all rows; inserts are gated to the authenticated user's
own `created_by` / `auth.uid()`.

**Note on timestamps:** The schema uses `TIMESTAMP` (no time zone) for most columns.
When this schema is recreated for the migration, change these to `TIMESTAMPTZ` to
avoid timezone ambiguity. New columns added in the meantime should use `TIMESTAMPTZ`.

---

## Directory layout

```
PBC-List-Beta/
  frontend/
    public/
      hero-river.png          # Background photo used on auth pages
      riveron-wordmark.png    # Logo; apply filter:brightness(0)invert(1) on dark bg
    src/
      index.css               # Global reset: Verdana font, margin:0, canvas bg
      main.jsx                # React root
      App.jsx                 # Router: all routes and the ProtectedRoute guard
      lib/
        supabase.js           # Supabase client (anon key)
        theme.js              # Riveron design tokens — all color/font/spacing values
        parseXlsx.js          # Excel import parser: alias map, normalisation, validation report
        __tests__/
          parseXlsx.test.js   # Vitest tests — programmatic xlsx fixtures, all-or-nothing behaviour
      hooks/
        useItemFilters.js     # URL-backed filter state: toggle, set, clearAll, activeFilterCount, debounced q
        useItemsList.js       # Fetch /api/requests/:id/items with auth; stale-while-revalidate + AbortController
      components/
        Header.jsx            # Sticky top bar: logo, page title slot, right slot
        ProtectedRoute.jsx    # Redirects to / if no Supabase session
        FilterPanel.jsx       # Faceted filter UI: chips (area/status/priority/req-by), date range, search.
                              #   Desktop: inline card. Mobile (<768 px): "Filters (N)" → bottom sheet.
                              #   All colors use CSS custom properties; dark mode via @media prefers-color-scheme.
      pages/
        AdvisorLoginPage.jsx  # /  — advisor sign-in (password or magic link)
        AuthCallbackPage.jsx  # /auth/callback — Supabase magic link landing
        CreateRequestPage.jsx # /dashboard/new — create request, manual or Excel import
        DashboardPage.jsx     # /dashboard — request list for the authenticated advisor
        LoginPage.jsx         # /request/:shareToken — client OTP entry
        RequestDetailPage.jsx # /dashboard/:requestId — item table, status, file mgmt
        UploadPage.jsx        # /upload/:requestId — client-facing upload portal
    index.html
    vite.config.js
    package.json
    vercel.json               # SPA rewrite: all paths → index.html
  backend/
    server.js                 # Express entry: mounts /api/auth and /api/requests
    package.json
    config/
      supabase.js             # Supabase client with SERVICE ROLE key (server-side only)
    lib/
      refCode.js              # generateRefCode + insertItemWithRefCode (concurrent-safe)
      vocabulary.js           # DEFAULT_VOCABULARY constant (mirrors the SQL column default)
      itemsQuery.js           # parseSort, parseFilters, applyFilters, computeFacet helpers
    middleware/
      auth.js                 # verifyJWT: validates custom client JWT
      advisorAuth.js          # verifyAdvisorJWT: validates Supabase Auth token via getUser()
    routes/
      auth.js                 # POST /api/auth/request-otp, POST /api/auth/verify-otp
      requests.js             # Advisor: GET /:id, POST /:id/items — Client: GET /:id/items, POST /:id/items/:id/upload
    __tests__/
      refCode.test.js         # Jest unit tests including concurrent-insert case
      itemsQuery.test.js      # Unit tests for all filter/sort/pagination helpers
      itemsList.test.js       # Integration tests for GET /:requestId/items (Supertest)
  db/
    schema.sql                # Canonical Postgres schema: tables, RLS, indexes
  riveron_tracker_complete_flow.svg   # Architecture diagram (not served in the app)
```

---

## Environment variables

### Frontend (`frontend/.env`)

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=http://localhost:3001
```

`VITE_API_URL` is the base URL for the Express backend. Set it to the Railway URL in
production. Defaults to empty string (same origin) if not set, which works when frontend
and backend are served from the same host.

### Backend (`backend/.env`)

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
JWT_SECRET=
RESEND_API_KEY=
PORT=3001
SUPABASE_STORAGE_BUCKET=pbc-uploads
```

Never commit either `.env` file. The Supabase service role key must never reach the
frontend bundle.

---

## Conventions

### Status values

Enum-like status strings are stored lowercase in Postgres and enforced with CHECK
constraints. Format them for display only at the component level (capitalize the first
letter or use a label lookup object). Never compare a display string to a database value.

```js
// correct
const STATUS_STYLES = {
  pending:  { label: 'Pending',  bg: '...', color: '...' },
  complete: { label: 'Complete', bg: '...', color: '...' },
};

// wrong
if (item.status === 'Pending') { ... }
```

### Timestamps

`TIMESTAMPTZ` in Postgres (new columns), ISO 8601 strings over the wire. Format for
display only at the component level using `toLocaleDateString`. Never store a
locale-formatted string or compare two formatted strings.

### Styling

All styles are **inline style objects** applied via React's `style` prop. There is no
CSS class-based styling beyond the global reset in `index.css` and the `@keyframes`
animation injected for the auth spinner.

All color, font, spacing, and radius values come from `src/lib/theme.js`. Never
introduce a hardcoded hex value in a component file — add a token to `theme.js` and
reference it by name. The aspirational direction is CSS custom properties with light
and dark mode support; `theme.js` is an intermediate step toward that.

```js
// correct
import { theme } from '../lib/theme.js';
style={{ color: theme.colors.ink, backgroundColor: theme.colors.canvas }}

// wrong
style={{ color: '#071739', backgroundColor: '#fafbfc' }}
```

### Icons

There is no icon library. UI controls use Unicode characters as icon substitutes:
`←` `→` `↓` `↑` `✓` `✎` `×` `✕`. Do not add an emoji or a character not in this set
without discussion — status is always conveyed by a text label; the symbol is secondary
reinforcement only.

### Copy and labels

Sentence case for all user-visible strings: button labels, page headings, modal titles,
and form labels. "Mark reviewed", not "Mark Reviewed". "Create request", not "Create
Request".

Exception: table column headers and area group labels use `textTransform: uppercase`
with tracked letter-spacing as a deliberate design choice — this is intentional and
should stay consistent.

### Authorization

Backend routes validate the caller's JWT on every request via the `verifyJWT`
middleware. The `request_id` embedded in the token must match the URL parameter before
any database query runs — never trust a `request_id` or `item_id` from the client body
without checking it against `req.user`.

The frontend advisor flows rely on Supabase RLS for authorization (the anon key +
Supabase session JWT). Supabase RLS policies are the guard; never disable RLS on a
table that the frontend queries directly.

### audit_log

All backend-routed mutations write a row to `audit_log`. The insert is non-fatal:
if it fails, log the error server-side and let the user operation succeed. Do not block
a user flow on an audit failure.

Frontend mutations that go directly to Supabase currently do not write audit entries.
Before adding new advisor-side mutations (status changes, deletes), evaluate whether
they should be routed through the backend so they appear in the log.

---

## Running locally

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
npm run build        # production build
npm run preview      # preview the production build locally
```

Requires `frontend/.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

### Backend

```bash
cd backend
npm install
npm run dev          # nodemon on http://localhost:3001
npm start            # production (no auto-restart)
```

Requires `backend/.env` with all variables listed above.

The frontend and backend run as separate processes. The frontend dev server does not
proxy to the backend automatically — if you need to test backend routes during local
development, run both and call `http://localhost:3001` directly.

---

## Testing

### Backend

Jest (`jest@^29`) is installed as a dev dependency. Run with `npm test` from `backend/`.
Test files live in `backend/__tests__/`. Jest is configured via its defaults (no config
file); it picks up any file matching `**/__tests__/**/*.js` or `**/*.test.js`.

Current coverage:
- `backend/__tests__/refCode.test.js` — unit tests for `generateRefCode` and
  `insertItemWithRefCode`, including prefix mapping, zero-padding, count-based sequencing,
  and the concurrent-insert retry scenario (23505 unique violation).
- `backend/__tests__/itemsQuery.test.js` — unit tests for `parseSort`, `parseCommaList`,
  `parsePagination`, `parseFilters`, and `applyFilters`. Uses a recording builder to
  verify each filter calls the correct Supabase method with correct args, AND/OR
  combination semantics, facet-skip behaviour, SQL-injection rejection via sort
  allowlist, and due_within date bounds.
- `backend/__tests__/itemsList.test.js` — Supertest integration tests for
  `GET /:requestId/items`: auth/ownership check, sort validation (400 on invalid
  field), response shape (items/total/page/limit/facets), pagination clamping, and
  every filter parameter accepted without 4xx.

Supertest (`supertest@^7`) is also installed as a dev dependency.

### Frontend

Vitest is the chosen runner (integrates with Vite; no separate config file needed).
Install with `npm install --save-dev vitest` from `frontend/`. Run with `npm test`.

Current coverage:
- `frontend/src/lib/__tests__/parseXlsx.test.js` — unit tests for the Excel import
  parser: header alias mapping, area normalisation, priority normalisation, date
  parsing (serial numbers, string formats, unparseable values), missing required
  columns, invalid emails, and all-or-nothing import behaviour.
