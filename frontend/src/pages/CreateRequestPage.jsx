import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase.js';
import { parseXlsx, DEFAULT_AREAS } from '../lib/parseXlsx.js';
import Header from '../components/Header.jsx';

function generateShareToken() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

const BLANK_ITEM = () => ({
  _id: crypto.randomUUID(),
  // Fields shown in the manual entry grid
  area: '',
  itemName: '',
  contactEmail: '',
  deadline: '',
  owner: '',
  // Additional fields populated by Excel import; not shown in the grid
  description: '',
  workstream: '',
  period: '',
  expected_format: '',
  priority: 'normal',
  reviewer: '',
  sensitivity: 'standard',
  source_row: null,
});

export default function CreateRequestPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [items, setItems] = useState([BLANK_ITEM()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importError, setImportError] = useState(null); // string | string[] | null
  const [created, setCreated] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const importRef = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  // ─── Item helpers ─────────────────────────────────────────

  function addItem() {
    setImportError(null);
    setItems((prev) => [...prev, BLANK_ITEM()]);
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((item) => item._id !== id));
  }

  function updateItem(id, field, value) {
    setItems((prev) =>
      prev.map((item) => (item._id === id ? { ...item, [field]: value } : item))
    );
  }

  // ─── Excel export (template) ──────────────────────────────

  function exportTemplate() {
    const rows = [
      [
        'Item name', 'Contact email', 'Area', 'Due date',
        'Description', 'Workstream', 'Period', 'Format', 'Priority', 'Owner',
      ],
      [
        'Audited financials FY2024', 'cfo@client.com', 'Finance', '2026-10-15',
        'Most recent audited financial statements', '', 'FY2024', 'pdf', 'normal', 'Jane Smith',
      ],
      [
        'Articles of incorporation', 'legal@client.com', 'Legal', '2026-10-20',
        '', '', '', 'pdf', 'normal', 'John Doe',
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 32 }, { wch: 28 }, { wch: 14 }, { wch: 14 },
      { wch: 36 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 18 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Request Items');
    XLSX.writeFile(wb, 'data-request-template.xlsx');
  }

  // ─── Excel import ─────────────────────────────────────────

  function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const { items, errors } = parseXlsx(evt.target.result, { areas: DEFAULT_AREAS });

      if (errors.length > 0) {
        // Separate file-level errors from per-row errors for display
        const fileLevelErrors = errors.filter((err) => err.row === null);
        const rowErrors = errors.filter((err) => err.row !== null);

        if (fileLevelErrors.length > 0 && rowErrors.length === 0) {
          // Simple single message (e.g. empty file, missing column)
          setImportError(fileLevelErrors.map((err) => err.message).join(' '));
        } else {
          // Per-row validation report — show all so the team can fix at once
          setImportError(
            [...fileLevelErrors, ...rowErrors].map((err) => err.message)
          );
        }
      } else {
        setItems(items);
      }

      // Reset so the same file can be re-imported after fixing it
      if (importRef.current) importRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  // ─── Submit ───────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!projectName.trim()) {
      setError('Project name is required.');
      return;
    }

    const validItems = items.filter((i) => i.itemName.trim() && i.contactEmail.trim());
    if (validItems.length === 0) {
      setError('Add at least one item with a name and contact email.');
      return;
    }

    const invalidEmail = validItems.find(
      (i) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.contactEmail)
    );
    if (invalidEmail) {
      setError(`"${invalidEmail.contactEmail}" is not a valid email address.`);
      return;
    }

    setLoading(true);

    const shareToken = generateShareToken();

    const { data: request, error: requestError } = await supabase
      .from('requests')
      .insert({
        project_name: projectName.trim(),
        created_by: user.id,
        share_token: shareToken,
        status: 'active',
      })
      .select('id, share_token')
      .single();

    if (requestError || !request) {
      setError('Failed to create request. Please try again.');
      console.error(requestError?.message);
      setLoading(false);
      return;
    }

    const { error: itemsError } = await supabase.from('request_items').insert(
      validItems.map((item) => ({
        request_id:      request.id,
        area:            item.area.trim() || null,
        item_name:       item.itemName.trim(),
        contact_email:   item.contactEmail.trim().toLowerCase(),
        deadline:        item.deadline || null,
        owner:           item.owner?.trim() || null,
        description:     item.description?.trim() || null,
        workstream:      item.workstream?.trim() || null,
        period:          item.period?.trim() || null,
        expected_format: item.expected_format?.trim() || null,
        priority:        item.priority || 'normal',
        reviewer:        item.reviewer?.trim() || null,
        sensitivity:     item.sensitivity || 'standard',
        requested_by:    user?.id || null,
        requested_at:    new Date().toISOString(),
        source_row:      item.source_row ?? null,
      }))
    );

    if (itemsError) {
      setError('Request created but items failed to save. Please contact support.');
      console.error(itemsError.message);
      setLoading(false);
      return;
    }

    setCreated({ shareToken: request.share_token, requestId: request.id });
    setLoading(false);
  }

  function copyShareLink() {
    const url = `${window.location.origin}/request/${created.shareToken}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  // ─── Success state ────────────────────────────────────────

  if (created) {
    const shareUrl = `${window.location.origin}/request/${created.shareToken}`;
    return (
      <div style={styles.page}>
        <Header title="New Data Request" right={null} />
        <div style={styles.successCard}>
          <div style={styles.successIcon}>✓</div>
          <h1 style={styles.successHeading}>Request created</h1>
          <p style={styles.successSub}>
            Share this link with your client. They'll use their email to verify and
            access the upload portal.
          </p>
          <div style={styles.linkBox}>
            <span style={styles.linkText}>{shareUrl}</span>
          </div>
          <div style={styles.successActions}>
            <button style={styles.primaryBtn} onClick={copyShareLink}>
              {copiedLink ? 'Copied!' : 'Copy link'}
            </button>
            <button style={styles.ghostBtn} onClick={() => navigate('/dashboard')}>
              Go to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Form ─────────────────────────────────────────────────

  return (
    <div style={styles.page}>
      <Header title="New Data Request" right={null} />
      <div style={styles.container}>

        <div style={styles.header}>
          <button style={styles.backBtn} onClick={() => navigate('/dashboard')}>
            ← Dashboard
          </button>
          <h1 style={styles.heading}>Create New Client Data Request Manager</h1>
        </div>

        <form onSubmit={handleSubmit}>

          {/* Project name */}
          <div style={styles.section}>
            <label style={styles.label} htmlFor="project-name">Project name</label>
            <input
              id="project-name"
              type="text"
              placeholder="e.g. Acme Corp — Series B Due Diligence"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              style={styles.input}
              disabled={loading}
            />
          </div>

          {/* Items */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <div>
                <span style={styles.sectionTitle}>Request items</span>
                <span style={styles.sectionHint}>
                  Each item will appear as a row the client uploads to.
                </span>
              </div>
              <div style={styles.importExportGroup}>
                <button type="button" style={styles.outlineBtn} onClick={exportTemplate}>
                  ↓ Download template
                </button>
                <button
                  type="button"
                  style={styles.outlineBtn}
                  onClick={() => importRef.current?.click()}
                >
                  ↑ Import from Excel
                </button>
                <input
                  ref={importRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: 'none' }}
                  onChange={handleImport}
                />
              </div>
            </div>

            {importError && (
              <div style={styles.importError}>
                {Array.isArray(importError) ? (
                  <>
                    <p style={{ margin: '0 0 6px', fontWeight: '600' }}>
                      {importError.length} error{importError.length !== 1 ? 's' : ''} found — fix the spreadsheet and import again:
                    </p>
                    <ul style={{ margin: 0, paddingLeft: '18px' }}>
                      {importError.map((msg, i) => <li key={i} style={{ marginBottom: '2px' }}>{msg}</li>)}
                    </ul>
                  </>
                ) : importError}
              </div>
            )}

            {/* Column headers */}
            <div style={styles.itemHeader}>
              <span style={{ ...styles.col, flex: 2 }}>Area</span>
              <span style={{ ...styles.col, flex: 3 }}>Item name <span style={styles.req}>*</span></span>
              <span style={{ ...styles.col, flex: 3 }}>Contact email <span style={styles.req}>*</span></span>
              <span style={{ ...styles.col, flex: 2 }}>Deadline</span>
              <span style={{ ...styles.col, flex: 2 }}>Owner</span>
              <span style={{ width: 32 }} />
            </div>

            {items.map((item, idx) => (
              <div key={item._id} style={styles.itemRow}>
                <input
                  type="text"
                  placeholder="e.g. Legal"
                  value={item.area}
                  onChange={(e) => updateItem(item._id, 'area', e.target.value)}
                  style={{ ...styles.cellInput, flex: 2 }}
                  disabled={loading}
                />
                <input
                  type="text"
                  placeholder={`Item ${idx + 1}`}
                  value={item.itemName}
                  onChange={(e) => updateItem(item._id, 'itemName', e.target.value)}
                  style={{ ...styles.cellInput, flex: 3 }}
                  disabled={loading}
                />
                <input
                  type="email"
                  placeholder="client@company.com"
                  value={item.contactEmail}
                  onChange={(e) => updateItem(item._id, 'contactEmail', e.target.value)}
                  style={{ ...styles.cellInput, flex: 3 }}
                  disabled={loading}
                />
                <input
                  type="date"
                  value={item.deadline}
                  onChange={(e) => updateItem(item._id, 'deadline', e.target.value)}
                  style={{ ...styles.cellInput, flex: 2 }}
                  disabled={loading}
                />
                <input
                  type="text"
                  placeholder="Owner"
                  value={item.owner}
                  onChange={(e) => updateItem(item._id, 'owner', e.target.value)}
                  style={{ ...styles.cellInput, flex: 2 }}
                  disabled={loading}
                />
                <button
                  type="button"
                  style={styles.removeBtn}
                  onClick={() => removeItem(item._id)}
                  disabled={items.length === 1 || loading}
                  title="Remove item"
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              type="button"
              style={styles.addItemBtn}
              onClick={addItem}
              disabled={loading}
            >
              + Add item
            </button>
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <div style={styles.formActions}>
            <button
              type="button"
              style={styles.ghostBtn}
              onClick={() => navigate('/dashboard')}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{ ...styles.primaryBtn, ...(loading ? styles.btnDisabled : {}) }}
              disabled={loading}
            >
              {loading ? 'Creating…' : 'Create request'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#fafbfc',
  },
  container: {
    maxWidth: '1000px',
    margin: '0 auto',
    padding: '32px 24px 60px',
  },
  header: {
    marginBottom: '32px',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#6b7d94',
    fontSize: '13px',
    fontFamily: 'Arial, Helvetica, sans-serif',
    cursor: 'pointer',
    padding: '0 0 12px',
    display: 'block',
  },
  heading: {
    fontSize: '22px',
    fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#071739',
    margin: 0,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    border: '1px solid #dadde6',
    boxShadow: '0 1px 4px rgba(7,23,57,0.06)',
    padding: '24px',
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#071739',
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1.5px solid #dadde6',
    borderRadius: '8px',
    outline: 'none',
    color: '#071739',
    backgroundColor: '#fff',
    boxSizing: 'border-box',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '16px',
    flexWrap: 'wrap',
  },
  sectionTitle: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#071739',
    marginBottom: '2px',
  },
  sectionHint: {
    fontSize: '12px',
    color: '#6b7d94',
  },
  importExportGroup: {
    display: 'flex',
    gap: '8px',
    flexShrink: 0,
  },
  outlineBtn: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '500',
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#4c6382',
    backgroundColor: '#fff',
    border: '1px solid #dadde6',
    borderRadius: '6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  importError: {
    fontSize: '13px',
    color: '#c0392b',
    backgroundColor: '#fde8e8',
    padding: '10px 14px',
    borderRadius: '6px',
    marginBottom: '12px',
    lineHeight: '1.5',
  },
  itemHeader: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '6px',
    paddingLeft: '2px',
  },
  col: {
    fontSize: '11px',
    fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#6b7d94',
  },
  req: {
    color: '#c0392b',
  },
  itemRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '8px',
  },
  cellInput: {
    padding: '9px 10px',
    fontSize: '13px',
    border: '1.5px solid #dadde6',
    borderRadius: '7px',
    outline: 'none',
    color: '#071739',
    backgroundColor: '#fff',
    minWidth: 0,
  },
  removeBtn: {
    width: '32px',
    height: '32px',
    flexShrink: 0,
    background: 'none',
    border: '1px solid #dadde6',
    borderRadius: '6px',
    color: '#6b7d94',
    cursor: 'pointer',
    fontSize: '11px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addItemBtn: {
    marginTop: '8px',
    background: 'none',
    border: '1.5px dashed #dadde6',
    borderRadius: '8px',
    color: '#4c6382',
    fontSize: '13px',
    fontWeight: '500',
    fontFamily: 'Arial, Helvetica, sans-serif',
    padding: '9px 16px',
    cursor: 'pointer',
    width: '100%',
  },
  error: {
    fontSize: '13px',
    color: '#c0392b',
    margin: '0 0 16px',
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '8px',
  },
  primaryBtn: {
    padding: '10px 24px',
    fontSize: '14px',
    fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#fff',
    backgroundColor: '#379190',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(55,145,144,0.3)',
  },
  ghostBtn: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '500',
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#4c6382',
    backgroundColor: '#fff',
    border: '1px solid #dadde6',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  btnDisabled: {
    backgroundColor: '#6b7d94',
    boxShadow: 'none',
    cursor: 'not-allowed',
  },
  successCard: {
    maxWidth: '480px',
    margin: '60px auto 0',
    backgroundColor: '#fff',
    borderRadius: '12px',
    border: '1px solid #dadde6',
    boxShadow: '0 1px 4px rgba(7,23,57,0.06)',
    padding: '48px 40px',
    textAlign: 'center',
  },
  successIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: '#dceeed',
    color: '#379190',
    fontSize: '22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
    fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif',
  },
  successHeading: {
    fontSize: '20px',
    fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#071739',
    margin: '0 0 8px',
  },
  successSub: {
    fontSize: '14px',
    color: '#4c6382',
    lineHeight: '1.6',
    margin: '0 0 24px',
  },
  linkBox: {
    backgroundColor: '#fafbfc',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '20px',
    textAlign: 'left',
    overflowX: 'auto',
    border: '1px solid #dadde6',
  },
  linkText: {
    fontSize: '13px',
    fontFamily: 'monospace',
    color: '#071739',
    wordBreak: 'break-all',
  },
  successActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
};
