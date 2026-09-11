import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

const STATUS_STYLES = {
  active:    { label: 'Active',    bg: '#dcfce7', color: '#15803d' },
  completed: { label: 'Completed', bg: '#dbeafe', color: '#1d4ed8' },
  archived:  { label: 'Archived',  bg: '#f0f0f0', color: '#555' },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.archived;
  return (
    <span style={{ ...styles.badge, backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function CompletionBar({ items = [] }) {
  const total = items.length;
  const complete = items.filter((i) => i.status === 'complete').length;
  const pct = total ? Math.round((complete / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={styles.progressTrack}>
        <div style={{ ...styles.progressFill, width: `${pct}%` }} />
      </div>
      <span style={styles.progressLabel}>{complete}/{total}</span>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('mine'); // 'mine' | 'all'
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchRequests();
  }, [user, filter]);

  async function fetchRequests() {
    setLoading(true);
    setError('');

    let query = supabase
      .from('requests')
      .select('id, project_name, status, created_at, created_by, share_token, request_items(id, status)')
      .order('created_at', { ascending: false });

    if (filter === 'mine') {
      query = query.eq('created_by', user.id);
    }

    const { data, error } = await query;

    if (error) {
      setError('Failed to load requests.');
      console.error(error.message);
    } else {
      setRequests(data || []);
    }

    setLoading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/');
  }

  function copyShareLink(shareToken, requestId) {
    const url = `${window.location.origin}/request/${shareToken}`;
    navigator.clipboard.writeText(url);
    setCopiedId(requestId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* Header */}
        <div style={styles.header}>
          <div>
            <span style={styles.logoText}>Riveron</span>
            <span style={styles.logoBadge}>Advisor</span>
          </div>
          <div style={styles.headerRight}>
            <span style={styles.userEmail}>{user?.email}</span>
            <button style={styles.signOutBtn} onClick={handleSignOut}>Sign out</button>
          </div>
        </div>

        {/* Toolbar */}
        <div style={styles.toolbar}>
          <h1 style={styles.heading}>Data requests</h1>
          <div style={styles.toolbarRight}>
            {/* Filter toggle */}
            <div style={styles.filterGroup}>
              {['mine', 'all'].map((f) => (
                <button
                  key={f}
                  style={{ ...styles.filterBtn, ...(filter === f ? styles.filterBtnActive : {}) }}
                  onClick={() => setFilter(f)}
                >
                  {f === 'mine' ? 'My requests' : 'All requests'}
                </button>
              ))}
            </div>
            <button style={styles.newBtn} onClick={() => navigate('/dashboard/new')}>
              + New request
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <p style={styles.muted}>Loading…</p>
        ) : error ? (
          <p style={styles.errorText}>{error}</p>
        ) : requests.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.muted}>
              {filter === 'mine' ? "You haven't created any requests yet." : 'No requests found.'}
            </p>
            <button style={styles.newBtn} onClick={() => navigate('/dashboard/new')}>
              Create your first request
            </button>
          </div>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Project</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Progress</th>
                  <th style={styles.th}>Created</th>
                  <th style={styles.th}>Share link</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr
                    key={req.id}
                    style={styles.tr}
                    onClick={() => navigate(`/dashboard/${req.id}`)}
                  >
                    <td style={styles.td}>
                      <span style={styles.projectName}>{req.project_name}</span>
                    </td>
                    <td style={styles.td}>
                      <StatusBadge status={req.status} />
                    </td>
                    <td style={styles.td}>
                      <CompletionBar items={req.request_items} />
                    </td>
                    <td style={styles.td}>{formatDate(req.created_at)}</td>
                    <td style={styles.td} onClick={(e) => e.stopPropagation()}>
                      <button
                        style={styles.copyBtn}
                        onClick={() => copyShareLink(req.share_token, req.id)}
                      >
                        {copiedId === req.id ? 'Copied!' : 'Copy link'}
                      </button>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      <span style={styles.viewArrow}>→</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    fontFamily: 'sans-serif',
  },
  container: {
    maxWidth: '1000px',
    margin: '0 auto',
    padding: '0 24px 60px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 0',
    borderBottom: '1px solid #e8e8e8',
    marginBottom: '32px',
  },
  logoText: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#111',
    marginRight: '8px',
  },
  logoBadge: {
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#888',
    backgroundColor: '#f0f0f0',
    padding: '2px 7px',
    borderRadius: '99px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  userEmail: {
    fontSize: '13px',
    color: '#888',
  },
  signOutBtn: {
    fontSize: '13px',
    color: '#555',
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: '6px',
    padding: '5px 12px',
    cursor: 'pointer',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '12px',
  },
  heading: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#111',
    margin: 0,
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  filterGroup: {
    display: 'flex',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #ddd',
  },
  filterBtn: {
    padding: '7px 14px',
    fontSize: '13px',
    fontWeight: '500',
    background: '#fff',
    border: 'none',
    cursor: 'pointer',
    color: '#555',
  },
  filterBtnActive: {
    background: '#1a1a1a',
    color: '#fff',
  },
  newBtn: {
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#1a1a1a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
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
    cursor: 'pointer',
  },
  td: {
    padding: '14px 16px',
    fontSize: '14px',
    color: '#222',
    verticalAlign: 'middle',
  },
  projectName: {
    fontWeight: '500',
  },
  badge: {
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: '99px',
    fontSize: '12px',
    fontWeight: '600',
  },
  progressTrack: {
    width: '80px',
    height: '6px',
    backgroundColor: '#e8e8e8',
    borderRadius: '99px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: '99px',
    transition: 'width 0.3s ease',
  },
  progressLabel: {
    fontSize: '12px',
    color: '#888',
    whiteSpace: 'nowrap',
  },
  copyBtn: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#1a1a1a',
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: '6px',
    padding: '4px 10px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  viewArrow: {
    color: '#bbb',
    fontSize: '16px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 0',
  },
  muted: {
    color: '#888',
    marginBottom: '16px',
  },
  errorText: {
    color: '#c0392b',
    fontSize: '14px',
  },
};
