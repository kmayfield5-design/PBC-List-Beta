import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import Header from '../components/Header.jsx';
import { FilterPanel } from '../components/FilterPanel.jsx';
import { ItemsTable } from '../components/ItemsTable.jsx';
import { useItemFilters } from '../hooks/useItemFilters.js';
import { useItemsList } from '../hooks/useItemsList.js';

const STORAGE_BUCKET = 'pbc-uploads';
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const REQUEST_STATUS_OPTIONS = ['active', 'completed', 'archived'];
const REQUEST_STATUS_STYLES = {
  active:    { bg: '#d1fae5', color: '#059669' },
  completed: { bg: '#dbeafe', color: '#2563eb' },
  archived:  { bg: '#f0f1f5', color: '#6b7d94' },
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function RequestDetailPage() {
  const { requestId } = useParams();
  const navigate = useNavigate();

  const {
    filters, queryString, searchText, setSearchText,
    toggle, set, setMultiple, clearAll, activeFilterCount,
  } = useItemFilters();

  const { items, total, facets, loading: itemsLoading, error: itemsError, refresh } = useItemsList(requestId, queryString);

  // Request metadata + vocabulary (fetched via backend API so we get vocabulary too)
  const [request, setRequest]       = useState(null);
  const [vocabulary, setVocabulary] = useState({});
  const [currentUserId, setCurrentUserId] = useState(null);
  const [requestLoading, setRequestLoading] = useState(true);
  const [requestError, setRequestError]     = useState('');

  // Track unfiltered total for "Showing N of M" label
  const grandTotalRef = useRef(null);
  useEffect(() => {
    if (!itemsLoading && activeFilterCount === 0) {
      grandTotalRef.current = total;
    }
  }, [itemsLoading, activeFilterCount, total]);

  const [copiedLink, setCopiedLink]               = useState(false);
  const [requestStatusUpdating, setRequestStatusUpdating] = useState(false);

  // ─── Fetch request metadata + vocabulary ──────────────────────────

  useEffect(() => {
    async function fetchRequest() {
      setRequestLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setRequestError('Not signed in.');
        setRequestLoading(false);
        return;
      }

      setCurrentUserId(session.user.id);

      const res = await fetch(`${API_BASE}/api/requests/${requestId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        setRequestError('Request not found.');
        setRequestLoading(false);
        return;
      }

      const body = await res.json();
      setRequest(body.request);
      setVocabulary(body.vocabulary ?? {});
      setRequestLoading(false);
    }

    fetchRequest();
  }, [requestId]);

  // ─── Item status update ───────────────────────────────────────────

  async function handleItemStatusChange(itemId, newStatus) {
    const { error } = await supabase
      .from('request_items')
      .update({ status: newStatus })
      .eq('id', itemId);
    if (error) console.error('Status update failed:', error.message);
    else await refresh();
  }

  // ─── Request status update ────────────────────────────────────────

  async function handleRequestStatusChange(newStatus) {
    setRequestStatusUpdating(true);
    const { error } = await supabase
      .from('requests')
      .update({ status: newStatus })
      .eq('id', requestId);
    if (!error) setRequest((prev) => ({ ...prev, status: newStatus }));
    else console.error('Request status update failed:', error.message);
    setRequestStatusUpdating(false);
  }

  // ─── File download ────────────────────────────────────────────────

  async function handleDownload(item) {
    if (!item.file_path) return;
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(item.file_path, 120);
    if (error || !data?.signedUrl) {
      alert('Could not generate download link. Please try again.');
    } else {
      window.open(data.signedUrl, '_blank');
    }
  }

  // ─── Edit item ────────────────────────────────────────────────────

  async function handleEditSave(itemId, formData) {
    const { error } = await supabase
      .from('request_items')
      .update(formData)
      .eq('id', itemId);
    if (error) {
      console.error('Edit save failed:', error.message);
      return error.message;
    }
    await refresh();
    return null;
  }

  // ─── Delete item ──────────────────────────────────────────────────

  async function handleDeleteItem(itemId) {
    const { error } = await supabase
      .from('request_items')
      .delete()
      .eq('id', itemId);
    if (error) console.error('Delete failed:', error.message);
    else await refresh();
  }

  // ─── Add item ─────────────────────────────────────────────────────

  async function handleAddSubmit(formData) {
    const { error } = await supabase
      .from('request_items')
      .insert({ request_id: requestId, ...formData, status: 'pending' });
    if (error) {
      console.error('Add item failed:', error.message);
      return error.message;
    }
    await refresh();
    return null;
  }

  // ─── Share link ───────────────────────────────────────────────────

  function copyShareLink() {
    if (!request?.share_token) return;
    navigator.clipboard.writeText(`${window.location.origin}/request/${request.share_token}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  // ─── Derived stats ────────────────────────────────────────────────

  const completeCount = items.filter((i) => i.status === 'complete').length;
  const uploadedCount = items.filter((i) => i.status === 'uploaded').length;
  const pct = total ? Math.round((completeCount / total) * 100) : 0;

  // ─── Render ───────────────────────────────────────────────────────

  if (requestLoading) {
    return <div style={styles.center}>Loading…</div>;
  }

  if (requestError) {
    return <div style={styles.center}><p style={{ color: '#c0392b' }}>{requestError}</p></div>;
  }

  const reqStatus = REQUEST_STATUS_STYLES[request.status] || REQUEST_STATUS_STYLES.active;

  return (
    <div style={styles.page}>
      <Header
        title={request?.project_name ?? 'Request detail'}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <select
              value={request.status}
              onChange={(e) => handleRequestStatusChange(e.target.value)}
              disabled={requestStatusUpdating}
              style={{ ...styles.statusSelect, backgroundColor: reqStatus.bg, color: reqStatus.color }}
            >
              {REQUEST_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <button style={styles.copyBtn} onClick={copyShareLink}>
              {copiedLink ? 'Copied!' : 'Copy share link'}
            </button>
          </div>
        }
      />

      <div style={styles.container}>
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
          </div>
          <div style={styles.progressRow}>
            <div style={styles.progressTrack}>
              <div style={{ ...styles.progressFill, width: `${pct}%` }} />
            </div>
            <span style={styles.progressLabel}>
              {completeCount}/{total} complete
              {uploadedCount > 0 && ` · ${uploadedCount} awaiting review`}
            </span>
          </div>
        </div>

        {/* Filter panel */}
        <FilterPanel
          vocabulary={vocabulary}
          facets={facets}
          filters={filters}
          toggle={toggle}
          set={set}
          setMultiple={setMultiple}
          clearAll={clearAll}
          searchText={searchText}
          setSearchText={setSearchText}
          activeFilterCount={activeFilterCount}
          total={total}
          grandTotal={grandTotalRef.current}
          currentUserId={currentUserId}
          loading={itemsLoading}
        />

        {/* Items error */}
        {itemsError && (
          <p style={{ padding: '12px 0', color: '#b91c1c', margin: 0, fontSize: '13px' }}>{itemsError}</p>
        )}

        {/* Items table */}
        <div style={{ opacity: itemsLoading && items.length === 0 ? 0.5 : 1, transition: 'opacity 0.15s' }}>
          <ItemsTable
            items={items}
            sort={filters.sort ?? ''}
            setSort={(val) => set('sort', val)}
            clearAll={clearAll}
            activeFilterCount={activeFilterCount}
            currentUserId={currentUserId}
            onStatusChange={handleItemStatusChange}
            onEditSave={handleEditSave}
            onDelete={handleDeleteItem}
            onDownload={handleDownload}
            onAddSubmit={handleAddSubmit}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────

const styles = {
  page: { minHeight: '100vh', backgroundColor: '#fafbfc' },
  container: { maxWidth: '1050px', margin: '0 auto', padding: '24px 24px 60px' },
  center: {
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', color: '#6b7d94',
  },
  backBtn: {
    background: 'none', border: 'none', color: '#6b7d94', fontSize: '13px',
    fontFamily: 'Arial, Helvetica, sans-serif', cursor: 'pointer', padding: '0 0 16px', display: 'block',
  },
  headerCard: {
    backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #dadde6',
    boxShadow: '0 1px 4px rgba(7,23,57,0.06)', padding: '28px', marginBottom: '16px',
  },
  headerTop: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    flexWrap: 'wrap', gap: '16px', marginBottom: '20px',
  },
  eyebrow: {
    fontSize: '11px', fontWeight: '700', fontFamily: 'Arial, Helvetica, sans-serif',
    textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7d94', margin: '0 0 4px',
  },
  heading: {
    fontSize: '22px', fontWeight: '700', fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#071739', margin: '0 0 4px',
  },
  meta: { fontSize: '13px', color: '#6b7d94', margin: 0 },
  statusSelect: {
    padding: '6px 10px', fontSize: '13px', fontWeight: '600',
    fontFamily: 'Arial, Helvetica, sans-serif', border: 'none', borderRadius: '99px',
    cursor: 'pointer', outline: 'none',
  },
  copyBtn: {
    padding: '7px 14px', fontSize: '13px', fontWeight: '500',
    fontFamily: 'Arial, Helvetica, sans-serif', color: '#071739', backgroundColor: '#fff',
    border: '1px solid #dadde6', borderRadius: '8px', cursor: 'pointer',
  },
  progressRow: { display: 'flex', alignItems: 'center', gap: '12px' },
  progressTrack: {
    flex: 1, height: '6px', backgroundColor: '#dadde6',
    borderRadius: '99px', overflow: 'hidden', maxWidth: '320px',
  },
  progressFill: {
    height: '100%', backgroundColor: '#379190', borderRadius: '99px', transition: 'width 0.3s ease',
  },
  progressLabel: { fontSize: '13px', color: '#6b7d94', whiteSpace: 'nowrap' },
};
