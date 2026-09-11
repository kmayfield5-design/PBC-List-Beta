import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

const STORAGE_BUCKET = 'pbc-uploads';

const STATUS_OPTIONS = ['pending', 'uploaded', 'reviewed', 'complete'];

const STATUS_STYLES = {
  pending:  { bg: '#f0f0f0', color: '#555' },
  uploaded: { bg: '#dbeafe', color: '#1d4ed8' },
  reviewed: { bg: '#fef9c3', color: '#a16207' },
  complete: { bg: '#dcfce7', color: '#15803d' },
};

const REQUEST_STATUS_OPTIONS = ['active', 'completed', 'archived'];
const REQUEST_STATUS_STYLES = {
  active:    { bg: '#dcfce7', color: '#15803d' },
  completed: { bg: '#dbeafe', color: '#1d4ed8' },
  archived:  { bg: '#f0f0f0', color: '#555' },
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function isOverdue(deadline, status) {
  if (!deadline || status === 'complete') return false;
  return new Date(deadline) < new Date();
}

// Group items by area, preserving insertion order of areas
function groupByArea(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.area?.trim() || '—';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

export default function RequestDetailPage() {
  const { requestId } = useParams();
  const navigate = useNavigate();

  const [request, setRequest] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [requestStatusUpdating, setRequestStatusUpdating] = useState(false);

  // ─── Fetch ────────────────────────────────────────────────

  useEffect(() => {
    async function fetchDetail() {
      setLoading(true);

      const { data: req, error: reqErr } = await supabase
        .from('requests')
        .select('id, project_name, status, share_token, created_at')
        .eq('id', requestId)
        .single();

      if (reqErr || !req) {
        setError('Request not found.');
        setLoading(false);
        return;
      }

      const { data: itemRows, error: itemErr } = await supabase
        .from('request_items')
        .select('id, area, item_name, contact_email, deadline, owner, status, file_path, uploaded_at, notes')
        .eq('request_id', requestId)
        .order('area', { ascending: true, nullsFirst: false })
        .order('deadline', { ascending: true, nullsFirst: false });

      if (itemErr) {
        setError('Failed to load items.');
        setLoading(false);
        return;
      }

      setRequest(req);
      setItems(itemRows || []);
      setLoading(false);
    }

    fetchDetail();
  }, [requestId]);

  // ─── Item status update ───────────────────────────────────

  async function handleItemStatusChange(itemId, newStatus) {
    setUpdatingId(itemId);

    const { error } = await supabase
      .from('request_items')
      .update({ status: newStatus })
      .eq('id', itemId);

    if (!error) {
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, status: newStatus } : i))
      );
    } else {
      console.error('Status update failed:', error.message);
    }

    setUpdatingId(null);
  }

  // ─── Request status update ────────────────────────────────

  async function handleRequestStatusChange(newStatus) {
    setRequestStatusUpdating(true);

    const { error } = await supabase
      .from('requests')
      .update({ status: newStatus })
      .eq('id', requestId);

    if (!error) {
      setRequest((prev) => ({ ...prev, status: newStatus }));
    } else {
      console.error('Request status update failed:', error.message);
    }

    setRequestStatusUpdating(false);
  }

  // ─── File download ────────────────────────────────────────

  async function handleDownload(item) {
    if (!item.file_path) return;
    setDownloadingId(item.id);

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(item.file_path, 120); // 2-minute expiry

    if (error || !data?.signedUrl) {
      alert('Could not generate download link. Please try again.');
    } else {
      window.open(data.signedUrl, '_blank');
    }

    setDownloadingId(null);
  }

  // ─── Share link ───────────────────────────────────────────

  function copyShareLink() {
    if (!request) return;
    navigator.clipboard.writeText(
      `${window.location.origin}/request/${request.share_token}`
    );
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  // ─── Derived stats ────────────────────────────────────────

  const total = items.length;
  const complete = items.filter((i) => i.status === 'complete').length;
  const uploaded = items.filter((i) => i.status === 'uploaded').length;
  const pct = total ? Math.round((complete / total) * 100) : 0;

  // ─── Render ───────────────────────────────────────────────

  if (loading) {
    return <div style={styles.center}>Loading…</div>;
  }

  if (error) {
    return <div style={styles.center}><p style={{ color: '#c0392b' }}>{error}</p></div>;
  }

  const grouped = groupByArea(items);
  const reqStatus = REQUEST_STATUS_STYLES[request.status] || REQUEST_STATUS_STYLES.active;

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* Back */}
        <button style={styles.backBtn} onClick={() => navigate('/dashboard')}>
          ← Dashboard
        </button>

        {/* Header card */}
        <div style={styles.headerCard}>
          <div style={styles.headerTop}>
            <div>
              <p style={styles.eyebrow}>Data request</p>
              <h1 style={styles.heading}>{request.project_name}</h1>
              <p style={styles.meta}>Created {formatDate(request.created_at)}</p>
            </div>
            <div style={styles.headerActions}>
              {/* Request status selector */}
              <select
                value={request.status}
                onChange={(e) => handleRequestStatusChange(e.target.value)}
                disabled={requestStatusUpdating}
                style={{
                  ...styles.statusSelect,
                  backgroundColor: reqStatus.bg,
                  color: reqStatus.color,
                }}
              >
                {REQUEST_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
              <button style={styles.copyBtn} onClick={copyShareLink}>
                {copiedLink ? 'Copied!' : 'Copy share link'}
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div style={styles.progressRow}>
            <div style={styles.progressTrack}>
              <div style={{ ...styles.progressFill, width: `${pct}%` }} />
            </div>
            <span style={styles.progressLabel}>
              {complete}/{total} complete
              {uploaded > 0 && ` · ${uploaded} awaiting review`}
            </span>
          </div>
        </div>

        {/* Items */}
        {items.length === 0 ? (
          <p style={{ color: '#888', marginTop: 32 }}>No items on this request.</p>
        ) : (
          <div style={styles.tableCard}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Item</th>
                  <th style={styles.th}>Contact</th>
                  <th style={styles.th}>Owner</th>
                  <th style={styles.th}>Deadline</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>File</th>
                  <th style={styles.th}>Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(grouped.entries()).map(([area, areaItems]) => (
                  <>
                    {/* Area group header */}
                    <tr key={`area-${area}`}>
                      <td colSpan={7} style={styles.areaHeader}>
                        {area}
                      </td>
                    </tr>

                    {areaItems.map((item) => {
                      const overdue = isOverdue(item.deadline, item.status);
                      const s = STATUS_STYLES[item.status] || STATUS_STYLES.pending;

                      return (
                        <tr key={item.id} style={styles.tr}>
                          <td style={styles.td}>
                            <span style={styles.itemName}>{item.item_name}</span>
                            {item.notes && (
                              <span style={styles.notes}>{item.notes}</span>
                            )}
                          </td>
                          <td style={styles.td}>
                            <span style={styles.contactEmail}>{item.contact_email}</span>
                          </td>
                          <td style={styles.td}>{item.owner || '—'}</td>
                          <td style={{ ...styles.td, color: overdue ? '#c0392b' : '#222' }}>
                            {formatDate(item.deadline)}
                            {overdue && <span style={styles.overdueTag}>Overdue</span>}
                          </td>
                          <td style={styles.td}>
                            <select
                              value={item.status}
                              onChange={(e) => handleItemStatusChange(item.id, e.target.value)}
                              disabled={updatingId === item.id}
                              style={{
                                ...styles.itemStatusSelect,
                                backgroundColor: s.bg,
                                color: s.color,
                              }}
                            >
                              {STATUS_OPTIONS.map((o) => (
                                <option key={o} value={o}>
                                  {o.charAt(0).toUpperCase() + o.slice(1)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={styles.td}>
                            {item.file_path ? (
                              <button
                                style={styles.downloadBtn}
                                onClick={() => handleDownload(item)}
                                disabled={downloadingId === item.id}
                              >
                                {downloadingId === item.id ? '…' : '↓ Download'}
                              </button>
                            ) : (
                              <span style={{ color: '#ccc' }}>—</span>
                            )}
                          </td>
                          <td style={{ ...styles.td, fontSize: '12px', color: '#888' }}>
                            {item.uploaded_at ? formatDate(item.uploaded_at) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '32px 24px 60px',
  },
  container: {
    maxWidth: '1050px',
    margin: '0 auto',
  },
  center: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'sans-serif',
    color: '#888',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: '13px',
    cursor: 'pointer',
    padding: '0 0 16px',
    display: 'block',
  },
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
    padding: '28px',
    marginBottom: '16px',
  },
  headerTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '16px',
    marginBottom: '20px',
  },
  eyebrow: {
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#aaa',
    margin: '0 0 4px',
  },
  heading: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#111',
    margin: '0 0 4px',
  },
  meta: {
    fontSize: '13px',
    color: '#aaa',
    margin: 0,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  statusSelect: {
    padding: '6px 10px',
    fontSize: '13px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '99px',
    cursor: 'pointer',
    outline: 'none',
  },
  copyBtn: {
    padding: '7px 14px',
    fontSize: '13px',
    fontWeight: '500',
    color: '#333',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  progressTrack: {
    flex: 1,
    height: '6px',
    backgroundColor: '#e8e8e8',
    borderRadius: '99px',
    overflow: 'hidden',
    maxWidth: '320px',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: '99px',
    transition: 'width 0.3s ease',
  },
  progressLabel: {
    fontSize: '13px',
    color: '#888',
    whiteSpace: 'nowrap',
  },
  tableCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '12px 16px',
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#aaa',
    textAlign: 'left',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
    whiteSpace: 'nowrap',
  },
  areaHeader: {
    padding: '10px 16px',
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: '#888',
    backgroundColor: '#f7f7f7',
    borderTop: '1px solid #efefef',
    borderBottom: '1px solid #efefef',
  },
  tr: {
    borderBottom: '1px solid #f5f5f5',
  },
  td: {
    padding: '13px 16px',
    fontSize: '14px',
    color: '#222',
    verticalAlign: 'top',
  },
  itemName: {
    display: 'block',
    fontWeight: '500',
  },
  notes: {
    display: 'block',
    fontSize: '12px',
    color: '#aaa',
    marginTop: '2px',
  },
  contactEmail: {
    fontSize: '13px',
    color: '#555',
  },
  overdueTag: {
    display: 'inline-block',
    marginLeft: '6px',
    fontSize: '10px',
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#c0392b',
    backgroundColor: '#fde8e8',
    padding: '1px 5px',
    borderRadius: '4px',
  },
  itemStatusSelect: {
    padding: '4px 8px',
    fontSize: '12px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '99px',
    cursor: 'pointer',
    outline: 'none',
  },
  downloadBtn: {
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: '500',
    color: '#1d4ed8',
    backgroundColor: '#dbeafe',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
};
