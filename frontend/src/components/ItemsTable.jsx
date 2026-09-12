import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

// ─── Static config ────────────────────────────────────────────────────

const AREA_LABELS = {
  finance: 'Finance', legal: 'Legal', tax: 'Tax',
  hr: 'HR', it: 'IT', ops: 'Operations', other: 'Other',
};

const STATUS_CONFIG = {
  pending:        { label: 'Pending',        bg: '#fef3c7', color: '#b45309' },
  uploaded:       { label: 'Uploaded',       bg: '#e4f4f4', color: '#1d6b6a' },
  reviewed:       { label: 'Reviewed',       bg: '#d1fae5', color: '#065f46' },
  needs_revision: { label: 'Needs revision', bg: '#fee2e2', color: '#b91c1c' },
  complete:       { label: 'Complete',       bg: '#d1fae5', color: '#065f46' },
  not_applicable: { label: 'N/A',            bg: '#f0f1f5', color: '#6b7d94' },
};

const STATUS_OPTIONS = Object.entries(STATUS_CONFIG).map(([value, cfg]) => ({
  value,
  label: cfg.label,
}));

const BLANK_ADD = { area: '', item_name: '', contact_email: '', deadline: '', owner: '' };
const BLANK_EDIT = { area: '', item_name: '', contact_email: '', owner: '', deadline: '' };

// ─── Helpers ─────────────────────────────────────────────────────────

function formatDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDatetime(d) {
  if (!d) return null;
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function extractFileName(filePath) {
  if (!filePath) return null;
  const base = filePath.split('/').pop();
  // Remove leading timestamp prefix (e.g. "1723456789-document.pdf" → "document.pdf")
  return base.replace(/^\d{9,}-/, '');
}

function formatUser(uid, currentUserId) {
  if (!uid) return null;
  return uid === currentUserId ? 'You' : uid.slice(0, 8) + '…';
}

function getDueColor(item) {
  if (!item.deadline || item.status === 'complete' || item.status === 'not_applicable') {
    return '#6b7d94';
  }
  if (item.is_overdue) return '#b91c1c';
  const daysAway = Math.ceil((new Date(item.deadline) - new Date()) / 86400000);
  if (daysAway <= 3) return '#b45309';
  return '#071739';
}

// ─── SortableHeader ───────────────────────────────────────────────────

function SortableHeader({ label, sortField, sort, setSort, style }) {
  const isAsc  = sort === sortField;
  const isDesc = sort === `-${sortField}`;
  const isActive = isAsc || isDesc;
  const ariaSort = isActive ? (isDesc ? 'descending' : 'ascending') : 'none';

  function handleClick() {
    setSort(isAsc ? `-${sortField}` : sortField);
  }

  return (
    <th style={{ ...s.th, ...style }} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={handleClick}
        className="filter-chip"
        style={s.sortBtn}
        aria-label={`Sort by ${label}${isActive ? (isDesc ? ', descending' : ', ascending') : ''}`}
      >
        {label}
        <span aria-hidden="true" style={s.sortArrow}>
          {isAsc ? ' ↑' : isDesc ? ' ↓' : ''}
        </span>
      </button>
    </th>
  );
}

// ─── StatusBadge ─────────────────────────────────────────────────────

function StatusBadge({ status, onChange, disabled }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <select
      value={status}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      aria-label="Item status"
      style={{
        ...s.statusBadge,
        backgroundColor: cfg.bg,
        color: cfg.color,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {STATUS_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ─── Field (detail panel row) ─────────────────────────────────────────
// Returns null when children is null/undefined/false/empty string,
// so the detail panel automatically omits fields with no data.

function Field({ label, children }) {
  const isEmpty = children == null || children === false || children === '';
  if (isEmpty) return null;
  return (
    <div style={s.field}>
      <span style={s.fieldLabel}>{label}</span>
      <div style={s.fieldValue}>{children}</div>
    </div>
  );
}

// ─── DetailPanel ─────────────────────────────────────────────────────

function DetailPanel({ item, currentUserId, onDownload, downloadingId }) {
  const fileName = extractFileName(item.file_path);

  return (
    <div style={s.detailWrap}>
      <div style={s.detailCols}>

        {/* Left column — what was requested */}
        <dl style={s.detailLeft}>
          <Field label="Description">{item.description}</Field>
          <Field label="Period">{item.period}</Field>
          <Field label="Expected format">{item.expected_format}</Field>
          {item.sensitivity && item.sensitivity !== 'standard' && (
            <Field label="Sensitivity">{item.sensitivity}</Field>
          )}
          <Field label="Blocked">{item.blocked_reason}</Field>
        </dl>

        {/* Right column — workflow history */}
        <dl style={s.detailRight}>
          <Field label="Requested by">
            {item.requested_by ? (
              <>
                {formatUser(item.requested_by, currentUserId)}
                {item.requested_at && (
                  <span style={s.fieldSub}>{formatDatetime(item.requested_at)}</span>
                )}
              </>
            ) : null}
          </Field>

          <Field label="Reviewer">
            {item.reviewer ? formatUser(item.reviewer, currentUserId) : null}
          </Field>

          <Field label="Uploaded">
            {item.uploaded_at ? (
              <>
                {formatDate(item.uploaded_at)}
                {fileName && <span style={s.fieldSub}>{fileName}</span>}
              </>
            ) : null}
          </Field>

          <Field label="Reviewed">
            {item.reviewed_at ? formatDate(item.reviewed_at) : null}
          </Field>

          {item.revision_round > 0 && (
            <Field label="Revision round">{item.revision_round}</Field>
          )}

          {item.reminder_count > 0 && (
            <Field label="Reminders">
              {item.reminder_count}
              {item.last_reminder_at && (
                <span style={s.fieldSub}>Last: {formatDate(item.last_reminder_at)}</span>
              )}
            </Field>
          )}
        </dl>
      </div>

      {/* Footer — notes + actions */}
      {(item.review_notes || item.file_path) && (
        <div style={s.detailFooter}>
          {item.review_notes && (
            <p style={s.reviewNotes}>{item.review_notes}</p>
          )}
          <div style={s.footerLinks}>
            {item.file_path && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDownload(item); }}
                disabled={downloadingId === item.id}
                style={s.footerBtn}
              >
                {downloadingId === item.id ? '…' : '↓ Download file'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── EditRow ─────────────────────────────────────────────────────────

function EditRow({ item, editForm, setEditForm, onSave, onCancel, loading }) {
  return (
    <tr style={{ backgroundColor: '#f5f7fa' }}>
      <td style={s.td} />
      <td style={s.td}>
        <input
          style={s.editInput}
          placeholder="Item name"
          value={editForm.item_name}
          onChange={(e) => setEditForm((f) => ({ ...f, item_name: e.target.value }))}
        />
        <input
          style={{ ...s.editInput, marginTop: '4px', fontSize: '12px' }}
          placeholder="Contact email"
          type="email"
          value={editForm.contact_email}
          onChange={(e) => setEditForm((f) => ({ ...f, contact_email: e.target.value }))}
        />
      </td>
      <td style={s.td}>
        <input
          style={s.editInput}
          placeholder="Area"
          value={editForm.area}
          onChange={(e) => setEditForm((f) => ({ ...f, area: e.target.value }))}
        />
      </td>
      <td style={s.td} />
      <td style={s.td} />
      <td style={s.td}>
        <input
          style={s.editInput}
          type="date"
          value={editForm.deadline}
          onChange={(e) => setEditForm((f) => ({ ...f, deadline: e.target.value }))}
        />
      </td>
      <td style={s.td} />
      <td style={s.td}>
        <span style={{ fontSize: '12px', color: '#6b7d94' }}>Status unchanged</span>
      </td>
      <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
        <button style={s.editSaveBtn} onClick={() => onSave(item.id, editForm)} disabled={loading}>
          {loading ? '…' : 'Save'}
        </button>
        <button style={s.editCancelBtn} onClick={onCancel} disabled={loading}>
          Cancel
        </button>
      </td>
    </tr>
  );
}

// ─── ItemsTable (public export) ───────────────────────────────────────

/**
 * Props
 *   items              array from useItemsList
 *   sort               current sort string from URL ('deadline', '-area', etc.)
 *   setSort            (sortStr) => void — calls set('sort', ...) in parent
 *   clearAll           () => void — for empty state action
 *   activeFilterCount  number
 *   currentUserId      string | null
 *   onStatusChange     async (itemId, newStatus) => void
 *   onEditSave         async (itemId, formData) => null | errorMessage
 *   onDelete           async (itemId) => void
 *   onDownload         async (item) => void
 *   onAddSubmit        async (formData) => null | errorMessage
 */
export function ItemsTable({
  items,
  sort,
  setSort,
  clearAll,
  activeFilterCount,
  currentUserId,
  onStatusChange,
  onEditSave,
  onDelete,
  onDownload,
  onAddSubmit,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId]   = useState(null);
  const [editForm, setEditForm]     = useState(BLANK_EDIT);
  const [editLoading, setEditLoading]   = useState(false);
  const [editError, setEditError]       = useState(null);
  const [updatingId, setUpdatingId]     = useState(null);
  const [deletingId, setDeletingId]     = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [showAddForm, setShowAddForm]   = useState(false);
  const [addForm, setAddForm]           = useState(BLANK_ADD);
  const [addLoading, setAddLoading]     = useState(false);
  const [addError, setAddError]         = useState(null);

  // ── Handlers ────────────────────────────────────────────────────────

  function handleRowClick(itemId) {
    if (editingId === itemId) return; // don't toggle while editing
    setExpandedId((prev) => (prev === itemId ? null : itemId));
  }

  function handleEditStart(e, item) {
    e.stopPropagation();
    setEditingId(item.id);
    setExpandedId(null); // close detail if open
    setEditError(null);
    setEditForm({
      area:          item.area || '',
      item_name:     item.item_name || '',
      contact_email: item.contact_email || '',
      owner:         item.owner || '',
      deadline:      item.deadline || '',
    });
  }

  function handleEditCancel(e) {
    e?.stopPropagation();
    setEditingId(null);
    setEditError(null);
  }

  async function handleEditSave(itemId, formData) {
    setEditLoading(true);
    setEditError(null);
    const err = await onEditSave(itemId, {
      area:          formData.area.trim() || null,
      item_name:     formData.item_name.trim(),
      contact_email: formData.contact_email.trim().toLowerCase(),
      owner:         formData.owner.trim() || null,
      deadline:      formData.deadline || null,
    });
    if (err) {
      setEditError(err);
    } else {
      setEditingId(null);
    }
    setEditLoading(false);
  }

  async function handleStatusChange(itemId, newStatus) {
    setUpdatingId(itemId);
    await onStatusChange(itemId, newStatus);
    setUpdatingId(null);
  }

  async function handleDeleteClick(e, itemId) {
    e.stopPropagation();
    if (!window.confirm('Remove this item from the request?')) return;
    setDeletingId(itemId);
    await onDelete(itemId);
    setDeletingId(null);
  }

  async function handleDownloadClick(item) {
    setDownloadingId(item.id);
    await onDownload(item);
    setDownloadingId(null);
  }

  async function handleAddSubmit(e) {
    e.preventDefault();
    if (!addForm.item_name.trim() || !addForm.contact_email.trim()) return;
    setAddLoading(true);
    setAddError(null);
    const err = await onAddSubmit({
      area:          addForm.area.trim() || null,
      item_name:     addForm.item_name.trim(),
      contact_email: addForm.contact_email.trim().toLowerCase(),
      deadline:      addForm.deadline || null,
      owner:         addForm.owner.trim() || null,
    });
    if (err) {
      setAddError(err);
    } else {
      setAddForm(BLANK_ADD);
      setShowAddForm(false);
    }
    setAddLoading(false);
  }

  // ── Empty state ─────────────────────────────────────────────────────

  if (items.length === 0) {
    return (
      <div style={s.card}>
        <div style={s.emptyState}>
          <p style={s.emptyHeading}>No items match the current filters</p>
          {activeFilterCount > 0 && (
            <button type="button" onClick={clearAll} style={s.emptyClearBtn}>
              Clear all filters
            </button>
          )}
        </div>
        <div style={s.addRow}>
          <button style={s.addBtn} onClick={() => setShowAddForm(true)}>+ Add item</button>
        </div>
        {showAddForm && <AddForm {...{ addForm, setAddForm, addLoading, addError, handleAddSubmit, onCancel: () => { setShowAddForm(false); setAddForm(BLANK_ADD); setAddError(null); } }} />}
      </div>
    );
  }

  // ── Table ────────────────────────────────────────────────────────────

  return (
    <div style={s.card}>
      <div style={s.tableWrapper}>
        <table style={s.table}>
          <colgroup>
            <col style={{ width: '72px' }} />   {/* Ref */}
            <col />                              {/* Item — takes remaining space */}
            <col style={{ width: '90px' }} />   {/* Area */}
            <col style={{ width: '108px' }} />  {/* Requested by */}
            <col style={{ width: '82px' }} />   {/* Period */}
            <col style={{ width: '92px' }} />   {/* Due */}
            <col style={{ width: '56px' }} />   {/* Aging */}
            <col style={{ width: '136px' }} />  {/* Status */}
            <col style={{ width: '60px' }} />   {/* Actions */}
          </colgroup>
          <thead>
            <tr>
              <SortableHeader label="Ref"          sortField="ref_code"    sort={sort} setSort={setSort} />
              <th style={s.th}>Item</th>
              <SortableHeader label="Area"         sortField="area"        sort={sort} setSort={setSort} />
              <th style={s.th}>Requested by</th>
              <th style={s.th}>Period</th>
              <SortableHeader label="Due"          sortField="deadline"    sort={sort} setSort={setSort} />
              <SortableHeader label="Aging"        sortField="days_overdue" sort={sort} setSort={setSort} style={{ textAlign: 'right' }} />
              <SortableHeader label="Status"       sortField="status"      sort={sort} setSort={setSort} />
              <th style={s.th} />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isEditing  = editingId === item.id;
              const isExpanded = expandedId === item.id && !isEditing;
              const cfg        = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
              const areaLabel  = AREA_LABELS[item.area] ?? item.area ?? '—';
              const dueColor   = getDueColor(item);
              const agingText  = item.is_overdue && item.days_overdue > 0
                ? `${item.days_overdue}d`
                : '—';

              if (isEditing) {
                return (
                  <EditRow
                    key={item.id}
                    item={item}
                    editForm={editForm}
                    setEditForm={setEditForm}
                    onSave={handleEditSave}
                    onCancel={handleEditCancel}
                    loading={editLoading}
                  />
                );
              }

              return (
                <>
                  <tr
                    key={item.id}
                    onClick={() => handleRowClick(item.id)}
                    style={{
                      ...s.tr,
                      cursor: 'pointer',
                      backgroundColor: isExpanded ? '#f5f7fa' : undefined,
                    }}
                    aria-expanded={isExpanded}
                    aria-label={`${item.item_name} — click to ${isExpanded ? 'collapse' : 'expand'} details`}
                  >
                    {/* Ref */}
                    <td style={{ ...s.td, ...s.refCell }}>
                      {item.ref_code || '—'}
                    </td>

                    {/* Item name + email */}
                    <td style={s.td}>
                      <span style={s.itemName}>{item.item_name}</span>
                      <span style={s.itemEmail}>{item.contact_email}</span>
                    </td>

                    {/* Area chip */}
                    <td style={s.td}>
                      {item.area && (
                        <span style={s.areaChip}>{areaLabel}</span>
                      )}
                    </td>

                    {/* Requested by */}
                    <td style={{ ...s.td, color: '#6b7d94', fontSize: '12px' }}>
                      {formatUser(item.requested_by, currentUserId) || '—'}
                    </td>

                    {/* Period */}
                    <td style={{ ...s.td, color: '#6b7d94', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.period || '—'}
                    </td>

                    {/* Due date */}
                    <td style={{ ...s.td, color: dueColor, fontWeight: item.is_overdue ? '600' : '400' }}>
                      {formatDate(item.deadline) || '—'}
                    </td>

                    {/* Aging */}
                    <td style={{ ...s.td, textAlign: 'right', color: item.is_overdue ? '#b91c1c' : '#6b7d94', fontSize: '12px', fontWeight: item.is_overdue ? '600' : '400', fontVariantNumeric: 'tabular-nums' }}>
                      {agingText}
                    </td>

                    {/* Status badge */}
                    <td style={s.td} onClick={(e) => e.stopPropagation()}>
                      <StatusBadge
                        status={item.status}
                        onChange={(newStatus) => handleStatusChange(item.id, newStatus)}
                        disabled={updatingId === item.id}
                      />
                    </td>

                    {/* Actions: edit, delete, expand indicator */}
                    <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap', paddingRight: '12px' }}>
                      <button
                        type="button"
                        className="filter-chip"
                        onClick={(e) => handleEditStart(e, item)}
                        title="Edit item"
                        style={s.iconBtn}
                        aria-label={`Edit ${item.item_name}`}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="filter-chip"
                        onClick={(e) => handleDeleteClick(e, item.id)}
                        disabled={deletingId === item.id}
                        title="Remove item"
                        style={s.iconBtn}
                        aria-label={`Remove ${item.item_name}`}
                      >
                        {deletingId === item.id ? '…' : '×'}
                      </button>
                      <button
                        type="button"
                        className="filter-chip"
                        onClick={(e) => { e.stopPropagation(); handleRowClick(item.id); }}
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${item.item_name}`}
                        style={{ ...s.iconBtn, color: isExpanded ? '#1d6b6a' : '#6b7d94' }}
                      >
                        {isExpanded
                          ? <ChevronDown size={16} aria-hidden={true} />
                          : <ChevronRight size={16} aria-hidden={true} />}
                      </button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr key={`${item.id}-detail`}>
                      <td colSpan={9} style={s.detailCell}>
                        <DetailPanel
                          item={item}
                          currentUserId={currentUserId}
                          onDownload={handleDownloadClick}
                          downloadingId={downloadingId}
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {editError && (
        <p style={{ margin: '0', padding: '8px 16px', fontSize: '12px', color: '#b91c1c', borderTop: '1px solid #dadde6' }}>
          {editError}
        </p>
      )}

      {/* Add item */}
      {showAddForm ? (
        <AddForm
          addForm={addForm}
          setAddForm={setAddForm}
          addLoading={addLoading}
          addError={addError}
          handleAddSubmit={handleAddSubmit}
          onCancel={() => { setShowAddForm(false); setAddForm(BLANK_ADD); setAddError(null); }}
        />
      ) : (
        <div style={s.addRow}>
          <button style={s.addBtn} onClick={() => setShowAddForm(true)}>+ Add item</button>
        </div>
      )}
    </div>
  );
}

// ─── AddForm ─────────────────────────────────────────────────────────

function AddForm({ addForm, setAddForm, addLoading, addError, handleAddSubmit, onCancel }) {
  return (
    <form onSubmit={handleAddSubmit} style={s.addForm}>
      <input
        style={s.addInput}
        placeholder="Area"
        value={addForm.area}
        onChange={(e) => setAddForm((f) => ({ ...f, area: e.target.value }))}
      />
      <input
        style={{ ...s.addInput, flex: 2 }}
        placeholder="Item name *"
        required
        value={addForm.item_name}
        onChange={(e) => setAddForm((f) => ({ ...f, item_name: e.target.value }))}
      />
      <input
        style={{ ...s.addInput, flex: 2 }}
        placeholder="Contact email *"
        type="email"
        required
        value={addForm.contact_email}
        onChange={(e) => setAddForm((f) => ({ ...f, contact_email: e.target.value }))}
      />
      <input
        style={s.addInput}
        placeholder="Owner"
        value={addForm.owner}
        onChange={(e) => setAddForm((f) => ({ ...f, owner: e.target.value }))}
      />
      <input
        style={s.addInput}
        type="date"
        value={addForm.deadline}
        onChange={(e) => setAddForm((f) => ({ ...f, deadline: e.target.value }))}
      />
      {addError && <span style={{ fontSize: '12px', color: '#b91c1c', width: '100%' }}>{addError}</span>}
      <button type="submit" style={s.addSaveBtn} disabled={addLoading}>
        {addLoading ? 'Saving…' : 'Add'}
      </button>
      <button type="button" style={s.addCancelBtn} onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────

const s = {
  card: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    border: '1px solid #dadde6',
    boxShadow: '0 1px 4px rgba(7,23,57,0.06)',
    overflow: 'hidden',
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    tableLayout: 'fixed',
    borderCollapse: 'collapse',
    minWidth: '700px',
  },

  // Headers
  th: {
    padding: '10px 12px',
    fontSize: '11px',
    fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#6b7d94',
    textAlign: 'left',
    borderBottom: '1px solid #dadde6',
    backgroundColor: '#fafbfc',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  },
  sortBtn: {
    background: 'none',
    border: 'none',
    padding: 0,
    margin: 0,
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#6b7d94',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    borderRadius: '3px',
  },
  sortArrow: {
    fontSize: '10px',
    lineHeight: 1,
    color: '#379190',
  },

  // Rows
  tr: {
    borderBottom: '1px solid #f0f1f5',
    transition: 'background-color 0.1s',
  },
  td: {
    padding: '12px 12px',
    fontSize: '13px',
    color: '#071739',
    verticalAlign: 'middle',
    overflow: 'hidden',
  },

  // Cells
  refCell: {
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
    fontSize: '11px',
    color: '#6b7d94',
    letterSpacing: '0.02em',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  itemName: {
    display: 'block',
    fontWeight: '500',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemEmail: {
    display: 'block',
    fontSize: '11px',
    color: '#6b7d94',
    marginTop: '1px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  areaChip: {
    display: 'inline-block',
    padding: '2px 8px',
    fontSize: '11px',
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontWeight: '500',
    backgroundColor: '#f0f1f5',
    color: '#4c6382',
    borderRadius: '99px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100%',
  },
  statusBadge: {
    padding: '3px 8px',
    fontSize: '11px',
    fontWeight: '600',
    fontFamily: 'Arial, Helvetica, sans-serif',
    border: 'none',
    borderRadius: '99px',
    cursor: 'pointer',
    outline: 'none',
    width: '100%',
    maxWidth: '128px',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#6b7d94',
    fontSize: '14px',
    lineHeight: 1,
    padding: '2px 3px',
    borderRadius: '3px',
    marginLeft: '1px',
  },

  // Detail row
  detailCell: {
    padding: 0,
    backgroundColor: '#f5f7fa',
    borderBottom: '2px solid #379190',
  },
  detailWrap: {
    padding: '18px 24px 16px',
  },
  detailCols: {
    display: 'flex',
    gap: '32px',
  },
  detailLeft: {
    flex: '6',
    minWidth: 0,
    margin: 0,
    padding: 0,
  },
  detailRight: {
    flex: '4',
    minWidth: 0,
    margin: 0,
    padding: 0,
  },
  field: {
    marginBottom: '10px',
  },
  fieldLabel: {
    display: 'block',
    fontSize: '10px',
    fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6b7d94',
    marginBottom: '2px',
  },
  fieldValue: {
    display: 'block',
    fontSize: '13px',
    color: '#071739',
    lineHeight: '1.5',
    wordBreak: 'break-word',
  },
  fieldSub: {
    display: 'block',
    fontSize: '11px',
    color: '#6b7d94',
    marginTop: '1px',
  },
  detailFooter: {
    borderTop: '1px solid #dadde6',
    marginTop: '14px',
    paddingTop: '12px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    alignItems: 'flex-start',
  },
  reviewNotes: {
    flex: 1,
    margin: 0,
    fontSize: '13px',
    color: '#4c6382',
    lineHeight: '1.6',
    minWidth: '180px',
  },
  footerLinks: {
    display: 'flex',
    gap: '8px',
    flexShrink: 0,
  },
  footerBtn: {
    padding: '5px 11px',
    fontSize: '12px',
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontWeight: '500',
    color: '#1d6b6a',
    backgroundColor: '#e4f4f4',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },

  // Empty state
  emptyState: {
    padding: '40px 24px',
    textAlign: 'center',
    borderBottom: '1px solid #f0f1f5',
  },
  emptyHeading: {
    margin: '0 0 12px',
    fontSize: '14px',
    color: '#6b7d94',
  },
  emptyClearBtn: {
    padding: '7px 16px',
    fontSize: '13px',
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#1d6b6a',
    backgroundColor: '#e4f4f4',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },

  // Edit row inputs
  editInput: {
    display: 'block',
    width: '100%',
    padding: '5px 8px',
    fontSize: '12px',
    border: '1.5px solid #dadde6',
    borderRadius: '6px',
    outline: 'none',
    color: '#071739',
    backgroundColor: '#fff',
    boxSizing: 'border-box',
  },
  editSaveBtn: {
    padding: '5px 12px',
    fontSize: '12px',
    fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#fff',
    backgroundColor: '#379190',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    marginRight: '6px',
  },
  editCancelBtn: {
    padding: '5px 10px',
    fontSize: '12px',
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#4c6382',
    backgroundColor: 'transparent',
    border: '1px solid #dadde6',
    borderRadius: '6px',
    cursor: 'pointer',
  },

  // Add form
  addRow: { padding: '12px 16px', borderTop: '1px solid #dadde6' },
  addBtn: {
    background: 'none',
    border: 'none',
    color: '#4c6382',
    fontSize: '13px',
    fontWeight: '600',
    fontFamily: 'Arial, Helvetica, sans-serif',
    cursor: 'pointer',
    padding: '4px 0',
  },
  addForm: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    alignItems: 'center',
    padding: '12px 16px',
    borderTop: '1px solid #dadde6',
  },
  addInput: {
    flex: 1,
    minWidth: '90px',
    padding: '7px 10px',
    fontSize: '13px',
    border: '1.5px solid #dadde6',
    borderRadius: '6px',
    outline: 'none',
    color: '#071739',
  },
  addSaveBtn: {
    padding: '7px 16px',
    fontSize: '13px',
    fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#fff',
    backgroundColor: '#379190',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  addCancelBtn: {
    padding: '7px 12px',
    fontSize: '13px',
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#4c6382',
    backgroundColor: 'transparent',
    border: '1px solid #dadde6',
    borderRadius: '6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
};
