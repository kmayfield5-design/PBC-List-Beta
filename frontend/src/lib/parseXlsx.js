import * as XLSX from 'xlsx';

// ─── Vocabulary defaults ──────────────────────────────────────

export const DEFAULT_AREAS = [
  { value: 'finance', label: 'Finance' },
  { value: 'legal',   label: 'Legal' },
  { value: 'tax',     label: 'Tax' },
  { value: 'hr',      label: 'HR' },
  { value: 'it',      label: 'IT' },
  { value: 'ops',     label: 'Operations' },
  { value: 'other',   label: 'Other' },
];

// ─── Header alias map ─────────────────────────────────────────
// Keys are normalised (lowercase, collapsed whitespace).
// Value is the canonical field name used in BLANK_ITEM / the DB row.

const COLUMN_ALIASES = {
  // item_name
  'item':                   'item_name',
  'item name':              'item_name',
  'request':                'item_name',
  'description of request': 'item_name',
  // description
  'description': 'description',
  'detail':      'description',
  'notes':       'description',
  'specifics':   'description',
  // area
  'area':             'area',
  'department':       'area',
  'function':         'area',
  'workstream owner': 'area',
  // workstream
  'workstream': 'workstream',
  'topic':      'workstream',
  'phase':      'workstream',
  // contact_email — 'Owner' intentionally maps here; aliases mirror the old template too
  'owner':          'contact_email',
  'contact':        'contact_email',
  'client contact': 'contact_email',
  'contact email':  'contact_email',  // old template header
  'email':          'contact_email',
  // deadline — include old template form "Deadline (YYYY-MM-DD)"
  'due':                     'deadline',
  'due date':                'deadline',
  'deadline':                'deadline',
  'deadline (yyyy-mm-dd)':   'deadline',  // backward-compat with old template
  'needed by':               'deadline',
  // period
  'period':        'period',
  'as of':         'period',
  'fiscal period': 'period',
  'periods':       'period',
  // expected_format
  'format':          'expected_format',
  'expected format': 'expected_format',
  'file type':       'expected_format',
  // priority
  'priority': 'priority',
  'urgency':  'priority',
  // reviewer
  'reviewer':         'reviewer',
  'riveron reviewer': 'reviewer',
  // sensitivity
  'sensitivity':    'sensitivity',
  'confidentiality': 'sensitivity',
};

// Columns whose presence in the sheet should be silently ignored
// rather than generating any kind of unrecognised-column noise.
const IGNORED_HEADERS = new Set([
  'comments',
  'comment',
  'internal notes',
  'internal note',
  'note',
  'for internal use',
  'for riveron use',
  'do not fill',
  'n/a',
  'na',
  '',
]);

// Valid priority values and common display aliases → canonical value
const PRIORITY_ALIASES = {
  critical: 'critical',
  urgent:   'critical',
  high:     'high',
  normal:   'normal',
  medium:   'normal',
  standard: 'normal',
  low:      'normal',
};

// ─── Internal helpers ─────────────────────────────────────────

function normaliseHeader(raw) {
  return String(raw).toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Normalise an Excel date serial or string to YYYY-MM-DD.
 * Returns '' when the input is empty/falsy.
 * Returns null when the input is non-empty but cannot be parsed
 * (the caller should treat null as a validation error).
 */
function normaliseDate(value) {
  if (value === '' || value === null || value === undefined) return '';
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    const mm = String(date.m).padStart(2, '0');
    const dd = String(date.d).padStart(2, '0');
    return `${date.y}-${mm}-${dd}`;
  }
  const str = String(value).trim();
  if (!str) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normaliseArea(raw, areas) {
  const trimmed = String(raw).trim();
  const lower = trimmed.toLowerCase();
  const byValue = areas.find((a) => a.value === lower);
  if (byValue) return byValue.value;
  const byLabel = areas.find((a) => a.label.toLowerCase() === lower);
  if (byLabel) return byLabel.value;
  return null;
}

function normalisePriority(raw) {
  if (!raw) return 'normal';
  const lower = String(raw).trim().toLowerCase();
  return PRIORITY_ALIASES[lower] ?? 'normal';
}

// ─── Main export ──────────────────────────────────────────────

/**
 * Parse an .xlsx / .xls / .csv ArrayBuffer into structured item rows.
 *
 * @param {ArrayBuffer} buffer - raw file bytes from FileReader
 * @param {object} [options]
 * @param {Array<{value:string,label:string}>} [options.areas] - valid area vocab;
 *   defaults to DEFAULT_AREAS
 * @returns {{ items: object[]|null, errors: object[] }}
 *   items  — null when any row has errors; array of BLANK_ITEM-compatible objects otherwise
 *   errors — array of { row: number|null, field: string|null, message: string }
 *            row===null means a file-level or column-level problem
 */
export function parseXlsx(buffer, { areas = DEFAULT_AREAS } = {}) {
  let allRows;
  try {
    const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // header:1 gives array-of-arrays; first element is the header row.
    allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  } catch {
    return {
      items: null,
      errors: [{ row: null, field: null, message: 'Could not read the file. Make sure it is a valid .xlsx, .xls, or .csv.' }],
    };
  }

  // Filter out trailing empty rows that sheet_to_json sometimes appends
  while (allRows.length > 0 && allRows[allRows.length - 1].every((c) => String(c).trim() === '')) {
    allRows.pop();
  }

  if (allRows.length < 2) {
    return {
      items: null,
      errors: [{ row: null, field: null, message: 'The file appears to be empty or has only a header row.' }],
    };
  }

  const rawHeaders = allRows[0].map((h) => String(h));
  const dataRows = allRows.slice(1);

  // Build column-index map: field → column index (first match wins)
  const colIndex = {};
  for (let i = 0; i < rawHeaders.length; i++) {
    const norm = normaliseHeader(rawHeaders[i]);
    if (IGNORED_HEADERS.has(norm)) continue;
    if (norm in COLUMN_ALIASES) {
      const field = COLUMN_ALIASES[norm];
      if (!(field in colIndex)) colIndex[field] = i;
    }
  }

  // Validate that required columns are present
  const missingCols = [];
  if (!('item_name' in colIndex)) {
    missingCols.push('item name — expected a header like "Item", "Item name", or "Request"');
  }
  if (!('contact_email' in colIndex)) {
    missingCols.push('contact email — expected a header like "Contact email", "Owner", or "Email"');
  }
  if (missingCols.length > 0) {
    return {
      items: null,
      errors: missingCols.map((msg) => ({ row: null, field: null, message: `Missing required column: ${msg}.` })),
    };
  }

  const errors = [];
  const items = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    // +2: header is row 1, data starts at row 2
    const sheetRow = i + 2;

    // Skip fully blank rows
    if (row.every((c) => String(c).trim() === '')) continue;

    const get = (field) => {
      const idx = colIndex[field];
      return idx !== undefined ? String(row[idx] ?? '').trim() : '';
    };

    const rowErrors = [];

    // ── item_name (required) ──────────────────────────────────
    const item_name = get('item_name');
    if (!item_name) {
      rowErrors.push({ row: sheetRow, field: 'item_name', message: `Row ${sheetRow}: item name is required.` });
    }

    // ── contact_email (required, must be valid) ───────────────
    const rawEmail = get('contact_email');
    const contact_email = rawEmail.toLowerCase();
    if (!contact_email) {
      rowErrors.push({ row: sheetRow, field: 'contact_email', message: `Row ${sheetRow}: contact email is required.` });
    } else if (!isValidEmail(contact_email)) {
      rowErrors.push({ row: sheetRow, field: 'contact_email', message: `Row ${sheetRow}: "${rawEmail}" is not a valid email address.` });
    }

    // ── area (optional but must match vocabulary when provided) ─
    const rawArea = get('area');
    let area = '';
    if (rawArea) {
      const matched = normaliseArea(rawArea, areas);
      if (matched === null) {
        rowErrors.push({
          row: sheetRow,
          field: 'area',
          message: `Row ${sheetRow}: "${rawArea}" is not a recognised area. Valid values: ${areas.map((a) => a.label).join(', ')}.`,
        });
      } else {
        area = matched;
      }
    }

    // ── deadline (optional but must be parseable when provided) ─
    const rawDeadline = colIndex['deadline'] !== undefined ? row[colIndex['deadline']] : '';
    const deadline = normaliseDate(rawDeadline);
    if (deadline === null) {
      rowErrors.push({
        row: sheetRow,
        field: 'deadline',
        message: `Row ${sheetRow}: "${rawDeadline}" is not a recognisable date. Use YYYY-MM-DD or MM/DD/YYYY.`,
      });
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    items.push({
      _id: crypto.randomUUID(),
      // Fields shown in the form grid
      area,
      itemName: item_name,
      contactEmail: contact_email,
      deadline: deadline ?? '',
      owner: '',
      // New fields — carried invisibly to handleSubmit
      description:     get('description'),
      workstream:      get('workstream'),
      period:          get('period'),
      expected_format: get('expected_format'),
      priority:        normalisePriority(get('priority')),
      reviewer:        get('reviewer'),
      sensitivity:     get('sensitivity') || 'standard',
      source_row:      sheetRow,
    });
  }

  if (errors.length > 0) {
    return { items: null, errors };
  }

  if (items.length === 0) {
    return {
      items: null,
      errors: [{ row: null, field: null, message: 'No data rows found in the file.' }],
    };
  }

  return { items, errors: [] };
}
