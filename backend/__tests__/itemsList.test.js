'use strict';

/**
 * Integration tests for GET /api/requests/:requestId/items.
 *
 * Strategy: mount the Express router with Supabase and advisor auth
 * mocked at the module level. Tests verify HTTP response shape,
 * auth rejection, sort validation, and pagination boundaries.
 *
 * Filter-application correctness (which Supabase methods are called
 * with which args) is covered by itemsQuery.test.js, which tests the
 * helpers directly without HTTP overhead.
 */

const request = require('supertest');
const express = require('express');

// ─── Mocks ────────────────────────────────────────────────────

// Inject advisor without calling Supabase.auth.getUser()
jest.mock('../middleware/advisorAuth', () => ({
  verifyAdvisorJWT: (req, _res, next) => {
    req.advisor = { id: 'advisor-uid', email: 'advisor@riveron.com' };
    next();
  },
}));

// verifyJWT not needed for advisor routes in this test file
jest.mock('../middleware/auth', () => ({
  verifyJWT: (_req, res) => res.status(401).json({ success: false }),
}));

// Mock refCode helpers (not under test here)
jest.mock('../lib/refCode', () => ({
  AREA_PREFIXES: { finance: 'FIN', legal: 'LEG' },
  insertItemWithRefCode: jest.fn(),
  generateRefCode: jest.fn(),
}));

// Supabase mock: context-aware by table name
const mockRequestRow  = { id: 'req-1' };
const mockItems       = [
  { id: 'item-1', item_name: 'Audited financials', area: 'finance', status: 'pending',
    priority: 'normal', requested_by: 'uid-a', is_overdue: false },
  { id: 'item-2', item_name: 'Cap table',          area: 'legal',   status: 'uploaded',
    priority: 'high',   requested_by: 'uid-b', is_overdue: true },
];
const mockCount = 2;

// Build a chainable mock builder that resolves to a preset value
function chainFor(resolveValue) {
  const b = {
    _resolve: resolveValue,
    then: (resolve) => resolve(resolveValue),
  };
  for (const m of [
    'select', 'eq', 'in', 'gte', 'lte', 'or', 'order', 'range', 'single', 'insert',
  ]) {
    b[m] = (..._args) => b;
  }
  return b;
}

// Mock the Supabase module.
// from('requests') → auth check (single → request row or error)
// from('request_items_enriched') → items or facet data
// from('audit_log') → insert (success)
let supabaseFromImpl;
jest.mock('../config/supabase', () => ({
  get from() { return supabaseFromImpl; },
  auth: { getUser: jest.fn() },
}));

// ─── App setup ────────────────────────────────────────────────

let app;
beforeAll(() => {
  const requestsRouter = require('../routes/requests');
  app = express();
  app.use(express.json());
  app.use('/api/requests', requestsRouter);
});

// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────

function setSuccessfulMocks({ items = mockItems, count = mockCount } = {}) {
  supabaseFromImpl = jest.fn((table) => {
    if (table === 'requests') {
      return chainFor({ data: mockRequestRow, error: null });
    }
    if (table === 'audit_log') {
      return chainFor({ data: null, error: null });
    }
    // request_items_enriched — main query returns items+count; facet queries return arrays
    const chain = chainFor({ data: items, count, error: null });
    // Override .select() to carry count through so range() can resolve correctly
    chain.select = (_sel, opts) => {
      if (opts?.count === 'exact') return chainFor({ data: items, count, error: null });
      // Facet select (just a column name, no opts) — return rows with that column only
      return chain;
    };
    return chain;
  });
}

function setRequestNotFound() {
  supabaseFromImpl = jest.fn((table) => {
    if (table === 'requests') {
      return chainFor({ data: null, error: { message: 'not found' } });
    }
    return chainFor({ data: [], count: 0, error: null });
  });
}

// ─── Auth / authorization ─────────────────────────────────────

describe('GET /api/requests/:requestId/items — authorization', () => {
  it('returns 404 when the request does not belong to the advisor', async () => {
    setRequestNotFound();
    const res = await request(app).get('/api/requests/req-1/items');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 when the advisor owns the request', async () => {
    setSuccessfulMocks();
    const res = await request(app).get('/api/requests/req-1/items');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─── Sort validation ──────────────────────────────────────────

describe('GET /api/requests/:requestId/items — sort validation', () => {
  it('returns 400 for a non-allowlisted sort field', async () => {
    setSuccessfulMocks();
    const res = await request(app)
      .get('/api/requests/req-1/items?sort=contact_email');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/"contact_email"/);
  });

  it('returns 400 for a SQL-injection attempt via sort param', async () => {
    setSuccessfulMocks();
    const res = await request(app)
      .get('/api/requests/req-1/items?sort=deadline%3B%20DROP%20TABLE%20request_items--');
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid ascending sort field', async () => {
    setSuccessfulMocks();
    const res = await request(app)
      .get('/api/requests/req-1/items?sort=area');
    expect(res.status).toBe(200);
  });

  it('returns 200 for a valid descending sort (prefixed with -)', async () => {
    setSuccessfulMocks();
    const res = await request(app)
      .get('/api/requests/req-1/items?sort=-requested_at');
    expect(res.status).toBe(200);
  });

  it('returns 400 for descending on a non-allowlisted field', async () => {
    setSuccessfulMocks();
    const res = await request(app)
      .get('/api/requests/req-1/items?sort=-created_by');
    expect(res.status).toBe(400);
  });
});

// ─── Response shape ───────────────────────────────────────────

describe('GET /api/requests/:requestId/items — response shape', () => {
  it('includes items, total, page, limit, and facets keys', async () => {
    setSuccessfulMocks();
    const res = await request(app).get('/api/requests/req-1/items');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      items:   expect.any(Array),
      total:   expect.any(Number),
      page:    expect.any(Number),
      limit:   expect.any(Number),
      facets:  expect.objectContaining({
        area:         expect.any(Object),
        status:       expect.any(Object),
        priority:     expect.any(Object),
        requested_by: expect.any(Object),
      }),
    });
  });

  it('returns items as an array (not null) even when no results', async () => {
    setSuccessfulMocks({ items: [], count: 0 });
    const res = await request(app).get('/api/requests/req-1/items');
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });
});

// ─── Pagination ───────────────────────────────────────────────

describe('GET /api/requests/:requestId/items — pagination', () => {
  it('returns default page=1 and limit=50 when none specified', async () => {
    setSuccessfulMocks();
    const res = await request(app).get('/api/requests/req-1/items');
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(50);
  });

  it('reflects the requested page and limit in the response', async () => {
    setSuccessfulMocks();
    const res = await request(app)
      .get('/api/requests/req-1/items?page=3&limit=25');
    expect(res.body.page).toBe(3);
    expect(res.body.limit).toBe(25);
  });

  it('clamps limit to 200', async () => {
    setSuccessfulMocks();
    const res = await request(app)
      .get('/api/requests/req-1/items?limit=999');
    expect(res.body.limit).toBe(200);
  });

  it('clamps page to minimum 1', async () => {
    setSuccessfulMocks();
    const res = await request(app)
      .get('/api/requests/req-1/items?page=0');
    expect(res.body.page).toBe(1);
  });

  it('reports total from the count, not from items array length', async () => {
    // items array is paginated slice; total reflects the full result count
    setSuccessfulMocks({ items: [mockItems[0]], count: 42 });
    const res = await request(app).get('/api/requests/req-1/items?limit=1');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(42);
  });
});

// ─── Filter params reach the route ───────────────────────────

describe('GET /api/requests/:requestId/items — filter params accepted', () => {
  // These tests verify that filter params don't cause a 4xx/5xx —
  // the filter-to-query-builder mapping is covered by itemsQuery.test.js.

  const filters = [
    'area=finance',
    'status=pending,uploaded',
    'priority=critical',
    'requested_by=uid-1',
    'reviewer=uid-2',
    'workstream=asc_606',
    'sensitivity=pii',
    'due_from=2026-10-01',
    'due_to=2026-12-31',
    'uploaded_from=2026-09-01',
    'uploaded_to=2026-09-30',
    'overdue=true',
    'overdue=false',
    'due_within=14',
    'q=board+minutes',
  ];

  for (const filter of filters) {
    it(`accepts filter: ${filter}`, async () => {
      setSuccessfulMocks();
      const res = await request(app)
        .get(`/api/requests/req-1/items?${filter}`);
      expect(res.status).toBe(200);
    });
  }

  it('accepts combined area+status filter (AND/OR semantics)', async () => {
    setSuccessfulMocks();
    const res = await request(app)
      .get('/api/requests/req-1/items?area=finance,legal&status=pending');
    expect(res.status).toBe(200);
  });
});

// ─── Computed filters ─────────────────────────────────────────

describe('GET /api/requests/:requestId/items — computed filters', () => {
  it('overdue=true returns 200 (is_overdue applied server-side)', async () => {
    setSuccessfulMocks();
    const res = await request(app)
      .get('/api/requests/req-1/items?overdue=true');
    expect(res.status).toBe(200);
  });

  it('due_within=0 returns 200 (items due today)', async () => {
    setSuccessfulMocks();
    const res = await request(app)
      .get('/api/requests/req-1/items?due_within=0');
    expect(res.status).toBe(200);
  });

  it('due_within=30 returns 200', async () => {
    setSuccessfulMocks();
    const res = await request(app)
      .get('/api/requests/req-1/items?due_within=30');
    expect(res.status).toBe(200);
  });
});
