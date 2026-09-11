'use strict';

const { AREA_PREFIXES, generateRefCode, insertItemWithRefCode } = require('../lib/refCode');

// ─── Mock builder helpers ─────────────────────────────────────

/**
 * Returns a mock for the supabase count query chain:
 *   supabase.from().select().eq().like()  → { count, error }
 */
function countChain(count, error = null) {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        like: jest.fn().mockResolvedValue({ count, error }),
      }),
    }),
  };
}

/**
 * Returns a mock for the supabase insert query chain:
 *   supabase.from().insert().select().single()  → { data, error }
 */
function insertChain(data, error = null) {
  return {
    insert: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data, error }),
      }),
    }),
  };
}

// ─── AREA_PREFIXES ────────────────────────────────────────────

describe('AREA_PREFIXES', () => {
  it('maps all expected area values', () => {
    expect(AREA_PREFIXES).toEqual({
      finance: 'FIN',
      legal: 'LEG',
      tax: 'TAX',
      hr: 'HR',
      it: 'IT',
      ops: 'OPS',
      other: 'GEN',
    });
  });
});

// ─── generateRefCode ─────────────────────────────────────────

describe('generateRefCode', () => {
  it('returns the correct prefix for each area', async () => {
    const cases = [
      ['finance', 'FIN'],
      ['legal', 'LEG'],
      ['tax', 'TAX'],
      ['hr', 'HR'],
      ['it', 'IT'],
      ['ops', 'OPS'],
      ['other', 'GEN'],
    ];

    for (const [area, prefix] of cases) {
      const supabase = { from: jest.fn(() => countChain(0)) };
      const code = await generateRefCode(supabase, 'req-1', area);
      expect(code).toBe(`${prefix}-001`);
    }
  });

  it('falls back to GEN for an unknown area', async () => {
    const supabase = { from: jest.fn(() => countChain(0)) };
    const code = await generateRefCode(supabase, 'req-1', 'unknown_area');
    expect(code).toBe('GEN-001');
  });

  it('increments sequence based on existing count', async () => {
    const supabase = { from: jest.fn(() => countChain(4)) };
    const code = await generateRefCode(supabase, 'req-1', 'finance');
    expect(code).toBe('FIN-005');
  });

  it('zero-pads the sequence to 3 digits', async () => {
    const supabase = { from: jest.fn(() => countChain(9)) };
    const code = await generateRefCode(supabase, 'req-1', 'legal');
    expect(code).toBe('LEG-010');
  });

  it('applies the offset on top of the count', async () => {
    const supabase = { from: jest.fn(() => countChain(2)) };
    // offset=2: seq = 2 + 1 + 2 = 5
    const code = await generateRefCode(supabase, 'req-1', 'finance', 2);
    expect(code).toBe('FIN-005');
  });

  it('throws when the Supabase count query fails', async () => {
    const supabase = {
      from: jest.fn(() => countChain(null, { message: 'connection refused', code: 'PGRST000' })),
    };
    await expect(generateRefCode(supabase, 'req-1', 'finance')).rejects.toMatchObject({
      message: 'connection refused',
    });
  });
});

// ─── insertItemWithRefCode ────────────────────────────────────

describe('insertItemWithRefCode', () => {
  const requestId = 'req-abc';
  const area = 'finance';
  const itemData = { item_name: 'Audited financials', contact_email: 'client@example.com' };
  const insertedRow = { id: 'item-1', ref_code: 'FIN-001', area: 'finance', ...itemData };

  it('inserts successfully on the first attempt', async () => {
    const supabase = {
      from: jest.fn()
        .mockReturnValueOnce(countChain(0))
        .mockReturnValueOnce(insertChain(insertedRow)),
    };

    const result = await insertItemWithRefCode(supabase, requestId, area, itemData);

    expect(result).toEqual(insertedRow);
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  it('retries once on a 23505 unique violation (concurrent-insert case)', async () => {
    // Two concurrent inserts both read count=0 and both try FIN-001.
    // First insert wins. This process gets 23505, retries with offset=1 → FIN-002.
    const retryRow = { id: 'item-2', ref_code: 'FIN-002', area: 'finance', ...itemData };

    const supabase = {
      from: jest.fn()
        // attempt 0: count query
        .mockReturnValueOnce(countChain(0))
        // attempt 0: insert → 23505
        .mockReturnValueOnce(insertChain(null, { code: '23505', message: 'duplicate key' }))
        // attempt 1: count query (still returns 0; offset handles the collision)
        .mockReturnValueOnce(countChain(0))
        // attempt 1: insert → success with FIN-002
        .mockReturnValueOnce(insertChain(retryRow)),
    };

    const result = await insertItemWithRefCode(supabase, requestId, area, itemData);

    expect(result).toEqual(retryRow);
    expect(supabase.from).toHaveBeenCalledTimes(4); // 2 per attempt
  });

  it('passes request_id, area, and ref_code through to the insert', async () => {
    const insertMock = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: insertedRow, error: null }),
      }),
    });

    const supabase = {
      from: jest.fn()
        .mockReturnValueOnce(countChain(0))
        .mockReturnValueOnce({ insert: insertMock }),
    };

    await insertItemWithRefCode(supabase, requestId, area, itemData);

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        request_id: requestId,
        area,
        ref_code: 'FIN-001',
        ...itemData,
      })
    );
  });

  it('throws after exhausting all retries', async () => {
    // Every insert returns 23505.
    const alwaysFails = () =>
      insertChain(null, { code: '23505', message: 'duplicate key' });

    const fromMock = jest.fn();
    // 5 retries × 2 calls each = 10 total from() calls
    for (let i = 0; i < 5; i++) {
      fromMock.mockReturnValueOnce(countChain(0));
      fromMock.mockReturnValueOnce(alwaysFails());
    }

    const supabase = { from: fromMock };

    await expect(
      insertItemWithRefCode(supabase, requestId, area, itemData, 5)
    ).rejects.toThrow('Failed to generate a unique ref_code after 5 attempts');
  });

  it('re-throws non-23505 errors immediately without retrying', async () => {
    const supabase = {
      from: jest.fn()
        .mockReturnValueOnce(countChain(0))
        .mockReturnValueOnce(insertChain(null, { code: '42P01', message: 'relation does not exist' })),
    };

    await expect(
      insertItemWithRefCode(supabase, requestId, area, itemData)
    ).rejects.toMatchObject({ message: 'relation does not exist' });

    // Should not have retried — only 2 from() calls
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });
});
