import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

const STORAGE_BUCKET = 'pbc-uploads';

const STATUS_STYLES = {
  pending:  { label: 'Pending',  bg: '#f0f0f0', color: '#555' },
  uploaded: { label: 'Uploaded', bg: '#dbeafe', color: '#1d4ed8' },
  reviewed: { label: 'Reviewed', bg: '#fef9c3', color: '#a16207' },
  complete: { label: 'Complete', bg: '#dcfce7', color: '#15803d' },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return (
    <span style={{ ...styles.badge, backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function formatDeadline(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function isOverdue(dateStr, status) {
  if (!dateStr || status === 'complete') return false;
  return new Date(dateStr) < new Date();
}

export default function UploadPage() {
  const { requestId } = useParams();
  const navigate = useNavigate();

  const [request, setRequest] = useState(null);
  const [items, setItems] = useState([]);
  const [clientEmail, setClientEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(new Set());

  const fileInputRefs = useRef({});
  const shareToken = localStorage.getItem('share_token');

  // ─── Auth guard + fetch ───────────────────────────────────

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        navigate(shareToken ? `/request/${shareToken}` : '/');
        return;
      }

      const email = session.user.email.toLowerCase();
      setClientEmail(email);

      const [{ data: req, error: reqErr }, { data: itemRows, error: itemErr }] =
        await Promise.all([
          supabase
            .from('requests')
            .select('id, project_name, status')
            .eq('id', requestId)
            .single(),
          supabase
            .from('request_items')
            .select('id, area, item_name, contact_email, owner, deadline, status, file_path, uploaded_at, notes')
            .eq('request_id', requestId)
            .order('area', { ascending: true, nullsFirst: false })
            .order('deadline', { ascending: true, nullsFirst: false }),
        ]);

      if (reqErr || !req) {
        setError('Request not found.');
      } else if (itemErr) {
        setError('Failed to load items.');
      } else {
        setRequest(req);
        setItems(itemRows || []);
      }

      setLoading(false);
    }

    init();

    // Redirect to login if session expires mid-visit
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        navigate(shareToken ? `/request/${shareToken}` : '/');
      }
    });

    return () => subscription.unsubscribe();
  }, [requestId, shareToken, navigate]);

  // ─── File upload ──────────────────────────────────────────

  async function handleFileSelect(itemId, file) {
    if (!file) return;

    setUploading((prev) => new Set(prev).add(itemId));

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${requestId}/${itemId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      alert('Upload failed. Please try again.');
      setUploading((prev) => { const n = new Set(prev); n.delete(itemId); return n; });
      if (fileInputRefs.current[itemId]) fileInputRefs.current[itemId].value = '';
      return;
    }

    const currentStatus = items.find((i) => i.id === itemId)?.status;
    const newStatus = currentStatus === 'pending' ? 'uploaded' : currentStatus;

    const { data: updatedItem, error: updateError } = await supabase
      .from('request_items')
      .update({
        file_path: storagePath,
        uploaded_at: new Date().toISOString(),
        status: newStatus,
      })
      .eq('id', itemId)
      .select('id, area, item_name, owner, deadline, status, file_path, uploaded_at, notes')
      .single();

    if (!updateError && updatedItem) {
      setItems((prev) => prev.map((i) => (i.id === itemId ? updatedItem : i)));
    }

    setUploading((prev) => { const n = new Set(prev); n.delete(itemId); return n; });
    if (fileInputRefs.current[itemId]) fileInputRefs.current[itemId].value = '';
  }

  // ─── Render ───────────────────────────────────────────────

  if (loading) {
    return <div style={styles.center}><p style={{ color: '#888' }}>Loading your request…</p></div>;
  }

  if (error) {
    return <div style={styles.center}><p style={{ color: '#c0392b' }}>{error}</p></div>;
  }

  const completedCount = items.filter((i) => i.status === 'complete').length;

  // Group by area preserving order
  const grouped = new Map();
  for (const item of items) {
    const key = item.area?.trim() || '—';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* Header */}
        <div style={styles.header}>
          <div>
            <p style={styles.eyebrow}>Data request</p>
            <h1 style={styles.heading}>{request?.project_name ?? 'Your Request'}</h1>
          </div>
          <div style={styles.progress}>
            <span style={styles.progressLabel}>
              {completedCount} / {items.length} complete
            </span>
            <div style={styles.progressTrack}>
              <div
                style={{
                  ...styles.progressFill,
                  width: items.length ? `${(completedCount / items.length) * 100}%` : '0%',
                }}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        {items.length === 0 ? (
          <p style={{ color: '#888', marginTop: 32 }}>No items found for this request.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Item</th>
                  <th style={styles.th}>Assigned to</th>
                  <th style={styles.th}>Owner</th>
                  <th style={styles.th}>Deadline</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>File</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {Array.from(grouped.entries()).map(([area, areaItems]) => (
                  <>
                    <tr key={`area-${area}`}>
                      <td colSpan={7} style={styles.areaHeader}>{area}</td>
                    </tr>
                    {areaItems.map((item) => {
                      const isUploading = uploading.has(item.id);
                      const overdue = isOverdue(item.deadline, item.status);
                      const isOwn = item.contact_email?.toLowerCase() === clientEmail;

                      return (
                        <tr key={item.id} style={styles.tr}>
                          <td style={styles.td}>
                            <span style={styles.itemName}>{item.item_name}</span>
                            {item.notes && <span style={styles.notes}>{item.notes}</span>}
                          </td>
                          <td style={styles.td}>
                            <span style={{ fontSize: '13px', color: '#555' }}>
                              {item.contact_email}
                            </span>
                            {isOwn && (
                              <span style={styles.youBadge}>you</span>
                            )}
                          </td>
                          <td style={styles.td}>{item.owner || '—'}</td>
                          <td style={{ ...styles.td, color: overdue ? '#c0392b' : 'inherit' }}>
                            {formatDeadline(item.deadline)}
                            {overdue && <span style={styles.overdueTag}>Overdue</span>}
                          </td>
                          <td style={styles.td}>
                            <StatusBadge status={item.status} />
                          </td>
                          <td style={styles.td}>
                            {item.file_path ? (
                              <span style={styles.fileName}>
                                {item.file_path.split('/').pop().replace(/^\d+-/, '')}
                              </span>
                            ) : (
                              <span style={{ color: '#bbb' }}>—</span>
                            )}
                          </td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>
                            <input
                              ref={(el) => (fileInputRefs.current[item.id] = el)}
                              type="file"
                              style={{ display: 'none' }}
                              onChange={(e) => handleFileSelect(item.id, e.target.files[0])}
                            />
                            <button
                              style={{
                                ...styles.uploadBtn,
                                ...(isUploading ? styles.uploadBtnDisabled : {}),
                              }}
                              disabled={isUploading}
                              onClick={() => fileInputRefs.current[item.id]?.click()}
                            >
                              {isUploading ? 'Uploading…' : item.file_path ? 'Replace' : 'Upload'}
                            </button>
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
    padding: '40px 24px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  center: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    width: '100%',
    maxWidth: '900px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: '28px',
    flexWrap: 'wrap',
    gap: '16px',
  },
  eyebrow: {
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#888',
    margin: '0 0 4px',
  },
  heading: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#111',
    margin: 0,
  },
  progress: {
    textAlign: 'right',
  },
  progressLabel: {
    fontSize: '13px',
    color: '#555',
    display: 'block',
    marginBottom: '6px',
  },
  progressTrack: {
    width: '160px',
    height: '6px',
    backgroundColor: '#e0e0e0',
    borderRadius: '99px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: '99px',
    transition: 'width 0.3s ease',
  },
  tableWrapper: {
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
    color: '#888',
    textAlign: 'left',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
  },
  tr: {
    borderBottom: '1px solid #f5f5f5',
  },
  td: {
    padding: '14px 16px',
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
    color: '#888',
    marginTop: '2px',
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
  badge: {
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: '99px',
    fontSize: '12px',
    fontWeight: '600',
  },
  fileName: {
    fontSize: '13px',
    color: '#555',
    fontFamily: 'monospace',
  },
  uploadBtn: {
    padding: '6px 14px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#1a1a1a',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  uploadBtnDisabled: {
    backgroundColor: '#999',
    cursor: 'not-allowed',
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
  youBadge: {
    display: 'inline-block',
    marginLeft: '6px',
    fontSize: '10px',
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#1d4ed8',
    backgroundColor: '#dbeafe',
    padding: '1px 5px',
    borderRadius: '4px',
  },
};
