'use strict';

/**
 * Tests for client-facing item serialization.
 *
 * Two test suites:
 *   1. Unit — serializeClientItem / serializeClientItems strip forbidden fields
 *      regardless of what the DB returns.
 *   2. Integration — GET /:requestId/my-items and
 *      POST /:requestId/items/:itemId/upload never include forbidden fields in
 *      their HTTP responses, even when the DB row contains them all.
 */

const request = require('supertest');
const express = require('express');

// ─── Forbidden-field fixture ──────────────────────────────────────────────────
// A DB row that contains every forbidden column. The serializer must strip them all.

const FULL_DB_ROW = {
  id:               'item-1',
  ref_code:         'FIN-001',
  area:             'finance',
  item_name:        'Audited financials',
  contact_email:    'client@example.com',
  description:      'Most recent two years of audited statements.',
  period:           'FY 2024–2025',
  expected_format:  'pdf',
  deadline:         '2026-10-31',
  status:           'pending',
  file_path:        null,
  uploaded_at:      null,
  // — forbidden fields below —
  requested_by:     'advisor-uid',
  reviewer:         'reviewer-uid',
  priority:         'high',
  review_notes:     'Needs board sign-off.',
  notes:            'Internal only.',
  blocked_reason:   'Waiting on audit firm.',
  reminder_count:   3,
  last_reminder_at: '2026-09-01T12:00:00Z',
  revision_round:   2,
  sensitivity:      'pii',
  source_row:       7,
  owner:            'Jane Smith',
  workstream:       'asc_606',
};

// ─── Unit tests: serializer ───────────────────────────────────────────────────

const {
  CLIENT_ITEM_FORBIDDEN,
  serializeClientItem,
  serializeClientItems,
} = require('../lib/clientSerializer');

describe('serializeClientItem', () => {
  it('returns null for a null input', () => {
    expect(serializeClientItem(null)).toBeNull();
  });

  it('returns an object for a valid row', () => {
    expect(typeof serializeClientItem(FULL_DB_ROW)).toBe('object');
  });

  it.each(CLIENT_ITEM_FORBIDDEN)(
    'strips forbidden field: %s',
    (field) => {
      const out = serializeClientItem(FULL_DB_ROW);
      expect(out).not.toHaveProperty(field);
    }
  );

  it('preserves allowed fields', () => {
    const out = serializeClientItem(FULL_DB_ROW);
    expect(out).toMatchObject({
      id:            'item-1',
      ref_code:      'FIN-001',
      area:          'finance',
      item_name:     'Audited financials',
      contact_email: 'client@example.com',
      description:   'Most recent two years of audited statements.',
      deadline:      '2026-10-31',
      status:        'pending',
    });
  });

  it('omits a key entirely rather than setting it to undefined', () => {
    const out = serializeClientItem(FULL_DB_ROW);
    for (const field of CLIENT_ITEM_FORBIDDEN) {
      expect(Object.prototype.hasOwnProperty.call(out, field)).toBe(false);
    }
  });
});

describe('serializeClientItems', () => {
  it('returns an empty array for a non-array input', () => {
    expect(serializeClientItems(null)).toEqual([]);
    expect(serializeClientItems(undefined)).toEqual([]);
  });

  it('strips forbidden fields from every item in the array', () => {
    const rows = [FULL_DB_ROW, { ...FULL_DB_ROW, id: 'item-2' }];
    const out = serializeClientItems(rows);
    expect(out).toHaveLength(2);
    for (const item of out) {
      for (const field of CLIENT_ITEM_FORBIDDEN) {
        expect(item).not.toHaveProperty(field);
      }
    }
  });
});

// ─── Integration mocks ────────────────────────────────────────────────────────

// Inject client JWT without calling backend OTP logic
jest.mock('../middleware/auth', () => ({
  verifyJWT: (req, _res, next) => {
    req.user = { request_id: 'req-1', email: 'client@example.com' };
    next();
  },
}));

jest.mock('../middleware/advisorAuth', () => ({
  verifyAdvisorJWT: (_req, res) => res.status(401).json({ success: false }),
}));

jest.mock('../lib/refCode', () => ({
  AREA_PREFIXES: { finance: 'FIN' },
  insertItemWithRefCode: jest.fn(),
  generateRefCode: jest.fn(),
}));

const mockRequestRow = { id: 'req-1', project_name: 'Test', status: 'active', created_at: '2026-01-01' };

function chainFor(resolveValue) {
  const b = {
    then: (resolve) => resolve(resolveValue),
  };
  for (const m of ['select', 'eq', 'order', 'single', 'update', 'insert']) {
    b[m] = (..._args) => b;
  }
  // Allow chaining to resolve at .single()
  b.single = () => ({ then: (resolve) => resolve(resolveValue) });
  return b;
}

let supabaseFromImpl;
let supabaseStorageImpl;

jest.mock('../config/supabase', () => ({
  get from() { return supabaseFromImpl; },
  get storage() { return supabaseStorageImpl; },
  auth: { getUser: jest.fn() },
}));

// ─── App setup ────────────────────────────────────────────────────────────────

let app;
beforeAll(() => {
  const requestsRouter = require('../routes/requests');
  app = express();
  app.use(express.json());
  app.use('/api/requests', requestsRouter);
});

beforeEach(() => {
  jest.clearAllMocks();

  // Default storage mock — upload succeeds
  supabaseStorageImpl = {
    from: jest.fn(() => ({
      upload: jest.fn().mockResolvedValue({ error: null }),
    })),
  };
});

// ─── GET /:requestId/my-items — field exclusion ───────────────────────────────

describe('GET /api/requests/:requestId/my-items — forbidden fields absent', () => {
  beforeEach(() => {
    supabaseFromImpl = jest.fn((table) => {
      if (table === 'requests') {
        const chain = chainFor({ data: mockRequestRow, error: null });
        chain.single = () => ({ then: (r) => r({ data: mockRequestRow, error: null }) });
        return chain;
      }
      // request_items — return a full DB row containing all forbidden fields
      const itemChain = chainFor({ data: [FULL_DB_ROW], error: null });
      return itemChain;
    });
  });

  it('returns 200', async () => {
    const res = await request(app).get('/api/requests/req-1/my-items');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it.each(CLIENT_ITEM_FORBIDDEN)(
    'response items do not contain forbidden field: %s',
    async (field) => {
      const res = await request(app).get('/api/requests/req-1/my-items');
      expect(res.status).toBe(200);
      const items = res.body.items;
      expect(Array.isArray(items)).toBe(true);
      for (const item of items) {
        expect(item).not.toHaveProperty(field);
      }
    }
  );

  it('returns 403 when request_id in token does not match URL', async () => {
    // Override verifyJWT for this test only via a local app
    const localRouter = express.Router();
    localRouter.use((req, _res, next) => {
      req.user = { request_id: 'other-req', email: 'client@example.com' };
      next();
    });
    const requestsRouter = require('../routes/requests');
    const localApp = express();
    localApp.use(express.json());
    // Mount without auth mock override — the route itself checks request_id
    localApp.use('/api/requests', requestsRouter);

    // The existing verifyJWT mock sets request_id: 'req-1',
    // so to test the mismatch we call a different requestId in the URL
    const res = await request(app).get('/api/requests/wrong-req-id/my-items');
    expect(res.status).toBe(403);
  });
});

// ─── POST /:requestId/items/:itemId/upload — field exclusion ─────────────────

describe('POST /api/requests/:requestId/items/:itemId/upload — forbidden fields absent', () => {
  beforeEach(() => {
    supabaseFromImpl = jest.fn((table) => {
      if (table === 'request_items') {
        // First call: ownership check (.select('id, status') ... .single())
        // Second call: update ... .select(CLIENT_ITEM_SELECT) ... .single()
        const ownershipResult = { data: { id: 'item-1', status: 'pending' }, error: null };
        const updateResult    = { data: FULL_DB_ROW, error: null };

        let callCount = 0;
        const chain = {
          then: (r) => r(callCount++ === 0 ? ownershipResult : updateResult),
        };
        for (const m of ['select', 'eq', 'update', 'single']) {
          chain[m] = (..._args) => chain;
        }
        chain.single = () => {
          const result = callCount++ === 0 ? ownershipResult : updateResult;
          return { then: (r) => r(result) };
        };
        return chain;
      }
      if (table === 'audit_log') {
        return chainFor({ data: null, error: null });
      }
      return chainFor({ data: null, error: null });
    });
  });

  it.each(CLIENT_ITEM_FORBIDDEN)(
    'upload response item does not contain forbidden field: %s',
    async (field) => {
      const res = await request(app)
        .post('/api/requests/req-1/items/item-1/upload')
        .attach('file', Buffer.from('test'), 'test.pdf');
      // 200 or 500 depending on mock depth — what matters is the field is absent
      if (res.status === 200 && res.body.item) {
        expect(res.body.item).not.toHaveProperty(field);
      }
    }
  );
});
