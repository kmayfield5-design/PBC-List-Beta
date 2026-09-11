import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import Header from '../components/Header.jsx';
import { useItemFilters } from '../hooks/useItemFilters.js';
import { useItemsList } from '../hooks/useItemsList.js';

const STORAGE_BUCKET = 'pbc-uploads';

const STATUS_OPTIONS = ['pending', 'uploaded', 'reviewed', 'needs_revision', 'complete', 'not_applicable'];

const STATUS_LABELS = {
  pending:        'Pending',
  uploaded:       'Uploaded',
  reviewed:       'Reviewed',
  needs_revision: 'Needs revision',
  complete:       'Complete',
  not_applicable: 'N/A',
};

const STATUS_STYLES = {
  pending:        { bg: '#f0f1f5', color: '#6b7d94' },
  uploaded:       { bg: '#dbeafe', color: '#2563eb' },
  reviewed:       { bg: '#fef3c7', color: '#d97706' },
  needs_revision: { bg: '#fde8e8', color: '#c0392b' },
  complete:       { bg: '#d1fae5', color: '#059669' },
  not_applicable: { bg: '#f0f1f5', color: '#6b7d94' },
};

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

  const { searchText, setSearchText, clearAll, activeFilterCount, queryString } = useItemFilters();
  const { items, loading: itemsLoading, error: itemsError, refresh } = useItemsList(requestId, queryString);

  const [request, setRequest] = useState(null);
  const [requestLoading, setRequestLoading] = useState(true);
  const [requestError, setRequestError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [requestStatusUpdating, setRequestStatusUpdating] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ area: '', item_name: '', contact_email: '', deadline: '', owner: '' });
  const [addLoading, setAddLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editLoading, setEditLoading] = useState(false);

  // ─── Fetch request metadata ────────────────────────────────────

  useEffect(() => {
    async function fetchRequest() {
      setRequestLoading(true);
      const { data: req, error: reqErr } = await supabase
        .from('requests')
        .select('id, project_name, status, share_token, created_at')
        .eq('id', requestId)
        .single();
      if (reqErr || !req) {
        setRequestError('Request not found.');
        setRequestLoading(false);
        return;
      }
      setRequest(req);
      setRequestLoading(false);
    }
    fetchRequest();
  }, [requestId]);

  // ─── Item status update ───────────────────────────────────────

  async function handleItemStatusChange(itemId, newStatus) {
    setUpdatingId(itemId);
    const { error } = await supabase
      .from('request_items')
      .update({ status: newStatus })
      .eq('id', itemId);
    if (error) console.error('Status update failed:', error.message);
    else await refresh();
    setUpdatingId(null);
  }

  // ─── Request status update ────────────────────────────────────

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

  // ─── File download ────────────────────────────────────────────

  async function handleDownload(item) {
    if (!item.file_path) return;
    setDownloadingId(item.id);
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(item.file_path, 120);
    if (error || !data?.signedUrl) {
      alert('Could not generate download link. Please try again.');
    } else {
      window.open(data.signedUrl, '_blank');
    }
    setDownloadingId(null);
  }

  // ─── Edit item ────────────────────────────────────────────────

  function handleEditStart(item) {
    setEditingId(item.id);
    setEditForm({
      area: item.area || '',
      item_name: item.item_name || '',
      contact_email: item.contact_email || '',
      owner: item.owner || '',
      deadline: item.deadline || '',
    });
  }

  async function handleEditSave(itemId) {
    setEditLoading(true);
    const { error } = await supabase
      .from('request_items')
      .update({
        area: editForm.area.trim() || null,
        item_name: editForm.item_name.trim(),
        contact_email: editForm.contact_email.trim().toLowerCase(),
        owner: editForm.owner.trim() || null,
        deadline: editForm.deadline || null,
      })
      .eq('id', itemId);
    if (!error) {
      setEditingId(null);
      await refresh();
    } else {
      console.error('Edit save failed:', error?.message);
    }
    setEditLoading(false);
  }

  // ─── Delete item ──────────────────────────────────────────────

  async function handleDeleteItem(itemId) {
    if (!window.confirm('Remove this item from the request?')) return;
    setDeletingId(itemId);
    const { error } = await supabase
      .from('request_items')
      .delete()
      .eq('id', itemId);
    if (error) console.error('Delete failed:', error.message);
    else await refresh();
    setDeletingId(null);
  }

  // ─── Add item ─────────────────────────────────────────────────

  async function handleAddItem(e) {
    e.preventDefault();
    if (!addForm.item_name.trim() || !addForm.contact_email.trim()) return;
    setAddLoading(true);
    const { error } = await supabase
      .from('request_items')
      .insert({
        request_id: requestId,
        area: addForm.area.trim() || null,
        item_name: addForm.item_name.trim(),
        contact_email: addForm.contact_email.trim().toLowerCase(),
        deadline: addForm.deadline || null,
        owner: addForm.owner.trim() || null,
        status: 'pending',
      });
    if (!error) {
      setAddForm({ area: '', item_name: '', contact_email: '', deadline: '', owner: '' });
      setShowAddForm(false);
      await refresh();
    } else {
      console.error('Add item failed:', error?.message);
    }
    setAddLoading(false);
  }

  // ─── Share link ───────────────────────────────────────────────

  function copyShareLink() {
    if (!request) return;
    navigator.clipboard.writeText(`${window.location.origin}/request/${request.share_token}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  // ─── Derived stats ────────────────────────────────────────────

  const itemCount = items.length;
  const completeCount = items.filter((i) => i.status === 'complete').length;
  const uploadedCount = items.filter((i) => i.status === 'uploaded').length;
  const pct = itemCount ? Math.round((completeCount / itemCount) * 100) : 0;

  // ─── Render ───────────────────────────────────────────────────

  if (requestLoading) {
    return <div style={styles.center}>Loading…</div>;
  }

  if (requestError) {
    return <div style={styles.center}><p style={{ color: '#c0392b' }}>{requestError}</p></div>;
  }

  const grouped = groupByArea(items);
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
              {completeCount}/{itemCount} complete
              {uploadedCount > 0 && ` · ${uploadedCount} awaiting review`}
            </span>
          </div>
        </div>

        {/* Filter bar */}
        <div style={styles.filterBar}>
          <input
            type="search"
            placeholder="Search items…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={styles.searchInput}
          />
          {activeFilterCount > 0 && (
            <>
              <span style={styles.filterCount}>
                {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
              </span>
              <button style={styles.clearBtn} onClick={clearAll}>Clear all</button>
            </>
          )}
          {itemsLoading && items.length > 0 && (
            <span style={styles.loadingHint}>Updating…</span>
          )}
        </div>

        {/* Items table */}
        <div style={{ ...styles.tableCard, opacity: itemsLoading && items.length === 0 ? 0.5 : 1 }}>
          {itemsError && (
            <p style={{ padding: '16px', color: '#c0392b', margin: 0 }}>{itemsError}</p>
          )}
          {!itemsError && items.length === 0 && !itemsLoading && (
            <p style={{ padding: '24px 16px', color: '#6b7d94', margin: 0, textAlign: 'center' }}>
              No items match the current filters.
            </p>
          )}
          {items.length > 0 && (
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
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {Array.from(grouped.entries()).map(([area, areaItems]) => (
                  <>
                    <tr key={`area-${area}`}>
                      <td colSpan={8} style={styles.areaHeader}>{area}</td>
                    </tr>
                    {areaItems.map((item) => {
                      const isEditing = editingId === item.id;
                      // Prefer the computed is_overdue from the enriched view; fall back to client-side check
                      const overdue = item.is_overdue ?? (
                        item.deadline && item.status !== 'complete' && item.status !== 'not_applicable'
                          ? new Date(item.deadline) < new Date()
                          : false
                      );
                      const s = STATUS_STYLES[item.status] || STATUS_STYLES.pending;

                      if (isEditing) {
                        return (
                          <tr key={item.id} style={{ ...styles.tr, backgroundColor: '#f5f6fa' }}>
                            <td style={styles.td}>
                              <input
                                style={styles.editInput}
                                placeholder="Item name"
                                value={editForm.item_name}
                                onChange={(e) => setEditForm((f) => ({ ...f, item_name: e.target.value }))}
                              />
                              <input
                                style={{ ...styles.editInput, marginTop: '4px', fontSize: '12px' }}
                                placeholder="Area"
                                value={editForm.area}
                                onChange={(e) => setEditForm((f) => ({ ...f, area: e.target.value }))}
                              />
                            </td>
                            <td style={styles.td}>
                              <input
                                style={styles.editInput}
                                placeholder="Contact email"
                                type="email"
                                value={editForm.contact_email}
                                onChange={(e) => setEditForm((f) => ({ ...f, contact_email: e.target.value }))}
                              />
                            </td>
                            <td style={styles.td}>
                              <input
                                style={styles.editInput}
                                placeholder="Owner"
                                value={editForm.owner}
                                onChange={(e) => setEditForm((f) => ({ ...f, owner: e.target.value }))}
                              />
                            </td>
                            <td style={styles.td}>
                              <input
                                style={styles.editInput}
                                type="date"
                                value={editForm.deadline}
                                onChange={(e) => setEditForm((f) => ({ ...f, deadline: e.target.value }))}
                              />
                            </td>
                            <td style={styles.td} colSpan={3}>
                              <span style={{ fontSize: '12px', color: '#6b7d94' }}>Status & file unchanged</span>
                            </td>
                            <td style={{ ...styles.td, textAlign: 'right', padding: '13px 12px', whiteSpace: 'nowrap' }}>
                              <button
                                style={styles.editSaveBtn}
                                onClick={() => handleEditSave(item.id)}
                                disabled={editLoading}
                              >
                                {editLoading ? '…' : 'Save'}
                              </button>
                              <button
                                style={styles.editCancelBtn}
                                onClick={() => setEditingId(null)}
                                disabled={editLoading}
                              >
                                Cancel
                              </button>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={item.id} style={styles.tr}>
                          <td style={styles.td}>
                            <span style={styles.itemName}>{item.item_name}</span>
                            {item.ref_code && (
                              <span style={styles.refCode}>{item.ref_code}</span>
                            )}
                            {item.notes && <span style={styles.notes}>{item.notes}</span>}
                          </td>
                          <td style={styles.td}>
                            <span style={styles.contactEmail}>{item.contact_email}</span>
                          </td>
                          <td style={styles.td}>{item.owner || '—'}</td>
                          <td style={{ ...styles.td, color: overdue ? '#c0392b' : '#071739' }}>
                            {formatDate(item.deadline)}
                            {overdue && <span style={styles.overdueTag}>Overdue</span>}
                          </td>
                          <td style={styles.td}>
                            <select
                              value={item.status}
                              onChange={(e) => handleItemStatusChange(item.id, e.target.value)}
                              disabled={updatingId === item.id}
                              style={{ ...styles.itemStatusSelect, backgroundColor: s.bg, color: s.color }}
                            >
                              {STATUS_OPTIONS.map((o) => (
                                <option key={o} value={o}>{STATUS_LABELS[o] ?? o}</option>
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
                              <span style={{ color: '#dadde6' }}>—</span>
                            )}
                          </td>
                          <td style={{ ...styles.td, fontSize: '12px', color: '#6b7d94' }}>
                            {item.uploaded_at ? formatDate(item.uploaded_at) : '—'}
                          </td>
                          <td style={{ ...styles.td, textAlign: 'right', padding: '13px 12px', whiteSpace: 'nowrap' }}>
                            <button
                              style={styles.editIconBtn}
                              onClick={() => handleEditStart(item)}
                              title="Edit item"
                            >
                              ✎
                            </button>
                            <button
                              style={styles.deleteBtn}
                              onClick={() => handleDeleteItem(item.id)}
                              disabled={deletingId === item.id}
                              title="Remove item"
                            >
                              {deletingId === item.id ? '…' : '×'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </>
                ))}
              </tbody>
            </table>
          )}

          {/* Add item form */}
          {showAddForm ? (
            <form onSubmit={handleAddItem} style={styles.addForm}>
              <input
                style={styles.addInput}
                placeholder="Area"
                value={addForm.area}
                onChange={(e) => setAddForm((f) => ({ ...f, area: e.target.value }))}
              />
              <input
                style={{ ...styles.addInput, flex: 2 }}
                placeholder="Item name *"
                required
                value={addForm.item_name}
                onChange={(e) => setAddForm((f) => ({ ...f, item_name: e.target.value }))}
              />
              <input
                style={{ ...styles.addInput, flex: 2 }}
                placeholder="Contact email *"
                type="email"
                required
                value={addForm.contact_email}
                onChange={(e) => setAddForm((f) => ({ ...f, contact_email: e.target.value }))}
              />
              <input
                style={styles.addInput}
                placeholder="Owner"
                value={addForm.owner}
                onChange={(e) => setAddForm((f) => ({ ...f, owner: e.target.value }))}
              />
              <input
                style={styles.addInput}
                type="date"
                value={addForm.deadline}
                onChange={(e) => setAddForm((f) => ({ ...f, deadline: e.target.value }))}
              />
              <button type="submit" style={styles.addSaveBtn} disabled={addLoading}>
                {addLoading ? 'Saving…' : 'Add'}
              </button>
              <button
                type="button"
                style={styles.addCancelBtn}
                onClick={() => {
                  setShowAddForm(false);
                  setAddForm({ area: '', item_name: '', contact_email: '', deadline: '', owner: '' });
                }}
              >
                Cancel
              </button>
            </form>
          ) : (
            <div style={styles.addRow}>
              <button style={styles.addBtn} onClick={() => setShowAddForm(true)}>
                + Add item
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────

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
  filterBar: {
    display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap',
  },
  searchInput: {
    flex: '1 1 220px', maxWidth: '360px', padding: '7px 12px', fontSize: '13px',
    border: '1.5px solid #dadde6', borderRadius: '8px', outline: 'none',
    color: '#071739', backgroundColor: '#fff', fontFamily: 'Verdana, Geneva, sans-serif',
  },
  filterCount: {
    fontSize: '12px', fontWeight: '600', fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#4c6382', whiteSpace: 'nowrap',
  },
  clearBtn: {
    padding: '5px 10px', fontSize: '12px', fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#4c6382', backgroundColor: 'transparent', border: '1px solid #dadde6',
    borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  loadingHint: { fontSize: '12px', color: '#6b7d94', fontStyle: 'italic' },
  tableCard: {
    backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #dadde6',
    boxShadow: '0 1px 4px rgba(7,23,57,0.06)', overflow: 'hidden', transition: 'opacity 0.15s',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '12px 16px', fontSize: '11px', fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif', textTransform: 'uppercase', letterSpacing: '0.06em',
    color: '#6b7d94', textAlign: 'left', borderBottom: '1px solid #dadde6',
    backgroundColor: '#fafbfc', whiteSpace: 'nowrap',
  },
  areaHeader: {
    padding: '10px 16px', fontSize: '11px', fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif', textTransform: 'uppercase', letterSpacing: '0.07em',
    color: '#4c6382', backgroundColor: '#fafbfc',
    borderTop: '1px solid #dadde6', borderBottom: '1px solid #dadde6',
  },
  tr: { borderBottom: '1px solid #f0f1f5' },
  td: { padding: '13px 16px', fontSize: '14px', color: '#071739', verticalAlign: 'top' },
  itemName: { display: 'block', fontWeight: '500' },
  refCode: {
    display: 'block', fontSize: '11px', color: '#6b7d94', marginTop: '2px',
    fontFamily: 'Arial, Helvetica, sans-serif', letterSpacing: '0.04em',
  },
  notes: { display: 'block', fontSize: '12px', color: '#6b7d94', marginTop: '2px' },
  contactEmail: { fontSize: '13px', color: '#4c6382' },
  overdueTag: {
    display: 'inline-block', marginLeft: '6px', fontSize: '10px', fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif', textTransform: 'uppercase',
    color: '#c0392b', backgroundColor: '#fde8e8', padding: '1px 5px', borderRadius: '4px',
  },
  itemStatusSelect: {
    padding: '4px 8px', fontSize: '12px', fontWeight: '600',
    fontFamily: 'Arial, Helvetica, sans-serif', border: 'none', borderRadius: '99px',
    cursor: 'pointer', outline: 'none',
  },
  downloadBtn: {
    padding: '4px 10px', fontSize: '12px', fontWeight: '500',
    fontFamily: 'Arial, Helvetica, sans-serif', color: '#2563eb', backgroundColor: '#dbeafe',
    border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  deleteBtn: {
    background: 'none', border: 'none', color: '#6b7d94', fontSize: '18px',
    lineHeight: 1, cursor: 'pointer', padding: '0 4px', borderRadius: '4px',
  },
  editIconBtn: {
    background: 'none', border: 'none', color: '#6b7d94', fontSize: '15px',
    lineHeight: 1, cursor: 'pointer', padding: '0 4px', borderRadius: '4px', marginRight: '2px',
  },
  editInput: {
    display: 'block', width: '100%', padding: '5px 8px', fontSize: '13px',
    border: '1.5px solid #dadde6', borderRadius: '6px', outline: 'none',
    color: '#071739', backgroundColor: '#fff',
  },
  editSaveBtn: {
    padding: '5px 12px', fontSize: '12px', fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif', color: '#fff', backgroundColor: '#379190',
    border: 'none', borderRadius: '6px', cursor: 'pointer', marginRight: '6px',
  },
  editCancelBtn: {
    padding: '5px 10px', fontSize: '12px', fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#4c6382', backgroundColor: 'transparent', border: '1px solid #dadde6',
    borderRadius: '6px', cursor: 'pointer',
  },
  addRow: { padding: '12px 16px', borderTop: '1px solid #dadde6' },
  addBtn: {
    background: 'none', border: 'none', color: '#4c6382', fontSize: '13px', fontWeight: '600',
    fontFamily: 'Arial, Helvetica, sans-serif', cursor: 'pointer', padding: '4px 0',
  },
  addForm: {
    display: 'flex', gap: '8px', alignItems: 'center',
    padding: '12px 16px', borderTop: '1px solid #dadde6', flexWrap: 'wrap',
  },
  addInput: {
    flex: 1, minWidth: '100px', padding: '7px 10px', fontSize: '13px',
    border: '1.5px solid #dadde6', borderRadius: '6px', outline: 'none', color: '#071739',
  },
  addSaveBtn: {
    padding: '7px 16px', fontSize: '13px', fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif', color: '#fff', backgroundColor: '#379190',
    border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  addCancelBtn: {
    padding: '7px 12px', fontSize: '13px', fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#4c6382', backgroundColor: 'transparent', border: '1px solid #dadde6',
    borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap',
  },
};
