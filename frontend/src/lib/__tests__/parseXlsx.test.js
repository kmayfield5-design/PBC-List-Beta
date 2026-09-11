/**
 * Tests for parseXlsx.
 *
 * Run with:  npm run test  (requires Vitest — add it with: npm install --save-dev vitest)
 * Config:    no config file needed; Vitest auto-discovers **\/__tests__\/*.test.js
 *
 * All fixture data is generated programmatically using the xlsx library so no
 * binary files are committed to the repo.
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseXlsx, DEFAULT_AREAS } from '../parseXlsx.js';

// ─── Fixture helper ───────────────────────────────────────────

/**
 * Build an in-memory .xlsx buffer from a header row + data rows.
 * @param {string[]} headers
 * @param {Array<Array<string|number>>} rows
 * @returns {Uint8Array}
 */
function makeXlsx(headers, rows) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

const OPTS = { areas: DEFAULT_AREAS };

// ─── Clean file ───────────────────────────────────────────────

describe('clean file — all required and optional columns present', () => {
  const buffer = makeXlsx(
    ['Item name', 'Contact email', 'Area', 'Due date', 'Description', 'Workstream', 'Period', 'Format', 'Priority', 'Reviewer', 'Sensitivity'],
    [
      ['Audited financials', 'cfo@client.com', 'Finance', '2026-10-15', 'Audited FS for FY2024', 'accounting', 'FY2024', 'pdf', 'high', 'jane@riveron.com', 'pii'],
      ['Cap table', 'legal@client.com', 'Legal', '2026-11-01', '', '', '', 'xlsx', 'normal', '', 'standard'],
    ]
  );

  it('returns two items with no errors', () => {
    const { items, errors } = parseXlsx(buffer, OPTS);
    expect(errors).toHaveLength(0);
    expect(items).toHaveLength(2);
  });

  it('maps all fields correctly on the first row', () => {
    const { items } = parseXlsx(buffer, OPTS);
    const item = items[0];
    expect(item.itemName).toBe('Audited financials');
    expect(item.contactEmail).toBe('cfo@client.com');
    expect(item.area).toBe('finance');        // normalised to value
    expect(item.deadline).toBe('2026-10-15');
    expect(item.description).toBe('Audited FS for FY2024');
    expect(item.workstream).toBe('accounting');
    expect(item.period).toBe('FY2024');
    expect(item.expected_format).toBe('pdf');
    expect(item.priority).toBe('high');
    expect(item.reviewer).toBe('jane@riveron.com');
    expect(item.sensitivity).toBe('pii');
  });

  it('sets source_row to the 1-based sheet row (header = row 1)', () => {
    const { items } = parseXlsx(buffer, OPTS);
    expect(items[0].source_row).toBe(2);
    expect(items[1].source_row).toBe(3);
  });

  it('lowercases contact_email', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email'],
      [['Tax docs', 'CFO@Client.COM']]
    );
    const { items } = parseXlsx(buf, OPTS);
    expect(items[0].contactEmail).toBe('cfo@client.com');
  });

  it('defaults priority to "normal" when the column is empty', () => {
    const { items } = parseXlsx(buffer, OPTS);
    expect(items[1].priority).toBe('normal');
  });

  it('defaults sensitivity to "standard" when the column is empty', () => {
    const { items } = parseXlsx(buffer, OPTS);
    expect(items[1].sensitivity).toBe('standard');
  });
});

// ─── Aliased headers ─────────────────────────────────────────

describe('aliased headers', () => {
  it('accepts "Request" as an alias for item name', () => {
    const buf = makeXlsx(
      ['Request', 'Client contact', 'Department'],
      [['Board minutes', 'board@client.com', 'Legal']]
    );
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(errors).toHaveLength(0);
    expect(items[0].itemName).toBe('Board minutes');
  });

  it('accepts "Client contact" as an alias for contact email', () => {
    const buf = makeXlsx(
      ['Item', 'Client contact'],
      [['Lease agreements', 'realestate@client.com']]
    );
    const { items } = parseXlsx(buf, OPTS);
    expect(items[0].contactEmail).toBe('realestate@client.com');
  });

  it('accepts "Owner" as an alias for contact email', () => {
    const buf = makeXlsx(
      ['Item name', 'Owner'],
      [['Employee census', 'hr@client.com']]
    );
    const { items } = parseXlsx(buf, OPTS);
    expect(items[0].contactEmail).toBe('hr@client.com');
  });

  it('accepts "Urgency" as an alias for priority', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email', 'Urgency'],
      [['Board resolution', 'legal@client.com', 'Critical']]
    );
    const { items } = parseXlsx(buf, OPTS);
    expect(items[0].priority).toBe('critical');
  });

  it('accepts "Deadline (YYYY-MM-DD)" — the old template header', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email', 'Deadline (YYYY-MM-DD)'],
      [['Old template item', 'finance@client.com', '2026-09-30']]
    );
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(errors).toHaveLength(0);
    expect(items[0].deadline).toBe('2026-09-30');
  });

  it('accepts "Description of request" as alias for item name', () => {
    const buf = makeXlsx(
      ['Description of request', 'Email'],
      [['Payroll register', 'payroll@client.com']]
    );
    const { items } = parseXlsx(buf, OPTS);
    expect(items[0].itemName).toBe('Payroll register');
  });

  it('ignores case and extra whitespace in headers', () => {
    const buf = makeXlsx(
      ['  ITEM NAME  ', '  CONTACT EMAIL  ', '  AREA  '],
      [['IT policy', 'it@client.com', 'IT']]
    );
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(errors).toHaveLength(0);
    expect(items[0].area).toBe('it');
  });

  it('silently ignores a "Comments" column', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email', 'Comments'],
      [['IP assignment', 'legal@client.com', 'Needs redaction']]
    );
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(errors).toHaveLength(0);
    expect(items).toHaveLength(1);
  });

  it('silently ignores an "Internal notes" column', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email', 'Internal notes'],
      [['D&O policy', 'finance@client.com', 'Draft received']]
    );
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(errors).toHaveLength(0);
    expect(items).toHaveLength(1);
  });
});

// ─── Area normalisation ───────────────────────────────────────

describe('area normalisation', () => {
  it('matches area label case-insensitively ("FINANCE" → "finance")', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email', 'Area'],
      [['Revenue model', 'cfo@client.com', 'FINANCE']]
    );
    const { items } = parseXlsx(buf, OPTS);
    expect(items[0].area).toBe('finance');
  });

  it('matches area value directly ("ops" → "ops")', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email', 'Area'],
      [['Org chart', 'ops@client.com', 'ops']]
    );
    const { items } = parseXlsx(buf, OPTS);
    expect(items[0].area).toBe('ops');
  });

  it('matches area label "Operations" → "ops"', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email', 'Area'],
      [['Vendor contracts', 'ops@client.com', 'Operations']]
    );
    const { items } = parseXlsx(buf, OPTS);
    expect(items[0].area).toBe('ops');
  });

  it('returns an error for an area not in the vocabulary', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email', 'Area'],
      [['Marketing deck', 'mkt@client.com', 'Marketing']]
    );
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(items).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('area');
    expect(errors[0].row).toBe(2);
    expect(errors[0].message).toMatch(/"Marketing"/);
  });

  it('leaves area empty and does not error when the area column is blank', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email', 'Area'],
      [['Generic item', 'info@client.com', '']]
    );
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(errors).toHaveLength(0);
    expect(items[0].area).toBe('');
  });
});

// ─── Priority normalisation ───────────────────────────────────

describe('priority normalisation', () => {
  const cases = [
    ['Critical', 'critical'],
    ['CRITICAL', 'critical'],
    ['Urgent', 'critical'],
    ['High', 'high'],
    ['Normal', 'normal'],
    ['Medium', 'normal'],
    ['Low', 'normal'],
    ['unknown_value', 'normal'],  // graceful fallback
    ['', 'normal'],
  ];

  for (const [input, expected] of cases) {
    it(`"${input}" → "${expected}"`, () => {
      const buf = makeXlsx(
        ['Item name', 'Contact email', 'Priority'],
        [['Item', 'e@client.com', input]]
      );
      const { items } = parseXlsx(buf, OPTS);
      expect(items[0].priority).toBe(expected);
    });
  }
});

// ─── Date parsing ─────────────────────────────────────────────

describe('date parsing', () => {
  it('accepts YYYY-MM-DD strings', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email', 'Due date'],
      [['Item', 'e@client.com', '2026-12-31']]
    );
    const { items } = parseXlsx(buf, OPTS);
    expect(items[0].deadline).toBe('2026-12-31');
  });

  it('accepts MM/DD/YYYY strings', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email', 'Due date'],
      [['Item', 'e@client.com', '10/15/2026']]
    );
    const { items } = parseXlsx(buf, OPTS);
    expect(items[0].deadline).toBe('2026-10-15');
  });

  it('accepts Excel date serial numbers', () => {
    // Excel serial 46375 = 2026-12-31 (date-only serial)
    const ws = XLSX.utils.aoa_to_sheet([
      ['Item name', 'Contact email', 'Due date'],
      ['Item', 'e@client.com', 46375],
    ]);
    // Force the cell type to number so xlsx doesn't auto-convert it
    ws['C2'] = { t: 'n', v: 46375 };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(errors).toHaveLength(0);
    expect(items[0].deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns an error row for an unparseable date string', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email', 'Due date'],
      [['Item', 'e@client.com', 'not-a-date']]
    );
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(items).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('deadline');
    expect(errors[0].row).toBe(2);
  });

  it('imports nothing and reports all rows when only one row has a bad date', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email', 'Due date'],
      [
        ['Good item',    'a@client.com', '2026-10-01'],
        ['Bad date item', 'b@client.com', 'tomorrow'],
      ]
    );
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(items).toBeNull();       // all-or-nothing
    expect(errors).toHaveLength(1); // only the bad row
    expect(errors[0].row).toBe(3);
  });

  it('allows blank date without error', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email', 'Due date'],
      [['Item', 'e@client.com', '']]
    );
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(errors).toHaveLength(0);
    expect(items[0].deadline).toBe('');
  });
});

// ─── Missing required column ──────────────────────────────────

describe('missing required column', () => {
  it('returns a file-level error when no item_name column is present', () => {
    const buf = makeXlsx(
      ['Contact email', 'Area'],          // no item name column
      [['finance@client.com', 'Finance']]
    );
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(items).toBeNull();
    expect(errors.some((e) => e.row === null && /item name/i.test(e.message))).toBe(true);
  });

  it('returns a file-level error when no contact_email column is present', () => {
    const buf = makeXlsx(
      ['Item name', 'Area'],              // no email column
      [['Audited financials', 'Finance']]
    );
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(items).toBeNull();
    expect(errors.some((e) => e.row === null && /contact email/i.test(e.message))).toBe(true);
  });

  it('returns per-row errors when item_name is empty in a row', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email'],
      [
        ['Good item', 'a@client.com'],
        ['',          'b@client.com'],   // missing item name in row 3
      ]
    );
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(items).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('item_name');
    expect(errors[0].row).toBe(3);
  });

  it('returns per-row errors when contact_email is empty in a row', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email'],
      [['Good item', '']]
    );
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(items).toBeNull();
    expect(errors[0].field).toBe('contact_email');
  });

  it('returns a per-row error for an invalid email address', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email'],
      [['Item', 'not-an-email']]
    );
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(items).toBeNull();
    expect(errors[0].field).toBe('contact_email');
    expect(errors[0].message).toMatch(/"not-an-email"/);
  });
});

// ─── Empty / malformed files ──────────────────────────────────

describe('empty or malformed files', () => {
  it('returns an error for a file with only a header row', () => {
    const buf = makeXlsx(['Item name', 'Contact email'], []);
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(items).toBeNull();
    expect(errors[0].row).toBeNull();
  });

  it('skips fully blank rows silently', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email'],
      [
        ['Real item', 'a@client.com'],
        ['', ''],                          // blank row — should be skipped
        ['Another item', 'b@client.com'],
      ]
    );
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(errors).toHaveLength(0);
    expect(items).toHaveLength(2);
  });
});

// ─── All-or-nothing behaviour ─────────────────────────────────

describe('all-or-nothing import', () => {
  it('returns null items (not a partial list) when any row fails', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email', 'Area'],
      [
        ['Valid item', 'a@client.com', 'Finance'],
        ['Bad area',  'b@client.com', 'Marketing'],  // not in vocabulary
      ]
    );
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(items).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(3);
  });

  it('collects all row errors before returning — does not stop at first', () => {
    const buf = makeXlsx(
      ['Item name', 'Contact email', 'Area'],
      [
        ['',          'b@client.com', 'Marketing'],  // two problems: no name, bad area
        ['Item two',  '',             'Finance'],     // missing email
      ]
    );
    const { items, errors } = parseXlsx(buf, OPTS);
    expect(items).toBeNull();
    expect(errors.length).toBeGreaterThanOrEqual(3); // at least 3 errors across 2 rows
  });
});
