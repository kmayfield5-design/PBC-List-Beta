import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import Header from '../components/Header.jsx';

const STATUS_STYLES = {
  active:    { label: 'Active',    bg: '#d1fae5', color: '#059669' },
  completed: { label: 'Completed', bg: '#dbeafe', color: '#2563eb' },
  archived:  { label: 'Archived',  bg: '#f3f4f6', color: '#6b7280' },
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

function SetPasswordModal({ onClose }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSetPassword(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); } else { setSuccess(true); }
    setLoading(false);
  }

  return (
    <div style={modal.overlay} onClick={onClose}>
      <div style={modal.card} onClick={(e) => e.stopPropagation()}>
        <h2 style={modal.heading}>{success ? 'Password set' : 'Set a password'}</h2>
        {success ? (
          <>
            <p style={modal.sub}>You can now sign in with your email and password.</p>
            <button style={modal.btn} onClick={onClose}>Done</button>
          </>
        ) : (
          <form onSubmit={handleSetPassword} noValidate>
            <p style={modal.sub}>Once set, you can sign in with your password instead of email links.</p>
            <label style={modal.label}>New password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters" style={modal.input} disabled={loading} autoFocus />
            <label style={modal.label}>Confirm password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter password" style={modal.input} disabled={loading} />
            {error && <p style={modal.error}>{error}</p>}
            <div style={modal.actions}>
              <button type="button" style={modal.ghostBtn} onClick={onClose} disabled={loading}>Cancel</button>
              <button type="submit" style={{ ...modal.btn, ...(loading ? modal.btnDisabled : {}) }} disabled={loading}>
                {loading ? 'Saving…' : 'Set password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('mine'); // 'mine' | 'all'
  const [copiedId, setCopiedId] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

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
      {showPasswordModal && <SetPasswordModal onClose={() => setShowPasswordModal(false)} />}
      <Header
        title="Data Request Dashboard"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>{user?.email}</span>
            <button style={styles.headerBtn} onClick={() => setShowPasswordModal(true)}>Set password</button>
            <button style={styles.headerBtn} onClick={handleSignOut}>Sign out</button>
          </div>
        }
      />
      <div style={styles.container}>

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
    backgroundColor: '#f8fafc',
  },
  container: {
    maxWidth: '1000px',
    margin: '0 auto',
    padding: '32px 24px 60px',
  },
  headerBtn: {
    fontSize: '13px',
    color: '#cbd5e1',
    background: 'none',
    border: '1px solid #334155',
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
    color: '#111827',
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
    border: '1px solid #e5e7eb',
  },
  filterBtn: {
    padding: '7px 14px',
    fontSize: '13px',
    fontWeight: '500',
    background: '#fff',
    border: 'none',
    cursor: 'pointer',
    color: '#6b7280',
  },
  filterBtnActive: {
    background: '#0f172a',
    color: '#fff',
  },
  newBtn: {
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#0f172a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  tableWrapper: {
    backgroundColor: '#fff',
    borderRadius: '11px',
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
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
    color: '#9ca3af',
    textAlign: 'left',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#f8fafc',
  },
  tr: {
    borderBottom: '1px solid #f3f4f6',
    cursor: 'pointer',
  },
  td: {
    padding: '14px 16px',
    fontSize: '14px',
    color: '#111827',
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
    backgroundColor: '#e5e7eb',
    borderRadius: '99px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0f172a',
    borderRadius: '99px',
    transition: 'width 0.3s ease',
  },
  progressLabel: {
    fontSize: '12px',
    color: '#9ca3af',
    whiteSpace: 'nowrap',
  },
  copyBtn: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#111827',
    background: 'none',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    padding: '4px 10px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  viewArrow: {
    color: '#9ca3af',
    fontSize: '16px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 0',
  },
  muted: {
    color: '#9ca3af',
    marginBottom: '16px',
  },
  errorText: {
    color: '#c0392b',
    fontSize: '14px',
  },
};

const modal = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  card: {
    backgroundColor: '#fff', borderRadius: '11px', padding: '36px',
    width: '100%', maxWidth: '400px', border: '1px solid #e5e7eb',
    boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
  },
  heading: { fontSize: '18px', fontWeight: '700', color: '#111827', margin: '0 0 8px' },
  sub: { fontSize: '14px', color: '#6b7280', lineHeight: '1.6', margin: '0 0 20px' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#111827', marginBottom: '6px' },
  input: {
    display: 'block', width: '100%', padding: '10px 12px', fontSize: '14px',
    border: '1.5px solid #e5e7eb', borderRadius: '8px', outline: 'none',
    marginBottom: '14px', color: '#111827', backgroundColor: '#fff',
  },
  error: { fontSize: '13px', color: '#c0392b', margin: '-6px 0 12px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' },
  btn: {
    padding: '9px 20px', fontSize: '14px', fontWeight: '600', color: '#fff',
    backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', cursor: 'pointer',
  },
  btnDisabled: { backgroundColor: '#9ca3af', cursor: 'not-allowed' },
  ghostBtn: {
    padding: '9px 16px', fontSize: '14px', color: '#6b7280', backgroundColor: '#fff',
    border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer',
  },
};
