import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

// ─── Static option sets ───────────────────────────────────────────────

const DEFAULT_AREAS = [
  { value: 'finance', label: 'Finance' },
  { value: 'legal', label: 'Legal' },
  { value: 'tax', label: 'Tax' },
  { value: 'hr', label: 'HR' },
  { value: 'it', label: 'IT' },
  { value: 'ops', label: 'Operations' },
  { value: 'other', label: 'Other' },
];

const STATUS_OPTIONS = [
  { value: 'pending',        label: 'Pending' },
  { value: 'uploaded',       label: 'Uploaded' },
  { value: 'reviewed',       label: 'Reviewed' },
  { value: 'needs_revision', label: 'Needs revision' },
  { value: 'complete',       label: 'Complete' },
  { value: 'not_applicable', label: 'N/A' },
];

const PRIORITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'high',     label: 'High' },
  { value: 'normal',   label: 'Normal' },
];

// ─── Chip ─────────────────────────────────────────────────────────────

function Chip({ label, count, selected, empty, onClick }) {
  return (
    <button
      type="button"
      className="filter-chip"
      aria-pressed={selected}
      onClick={onClick}
      style={{
        ...s.chip,
        ...(selected ? s.chipSelected : empty ? s.chipEmpty : s.chipDefault),
      }}
    >
      {label}
      {count != null && (
        <span aria-hidden="true" style={selected ? s.countSelected : empty ? s.countEmpty : s.count}>
          ({count})
        </span>
      )}
    </button>
  );
}

// ─── ChipRow ──────────────────────────────────────────────────────────

function ChipRow({ label, field, options, facets, selected, onToggle }) {
  const sel = selected ?? [];
  return (
    <div style={s.row}>
      <span style={s.rowLabel} id={`fl-${field}`}>{label}</span>
      <div style={s.chipSet} role="group" aria-labelledby={`fl-${field}`}>
        {options.map(({ value, chipLabel }) => {
          const count = facets?.[value] ?? 0;
          const isSelected = sel.includes(value);
          // A chip is "empty" if the API gave facet counts AND this value has zero
          // AND it isn't selected (selected chips stay prominent even at zero)
          const isEmpty = facets != null && count === 0 && !isSelected;
          return (
            <Chip
              key={value}
              label={chipLabel}
              count={facets != null ? count : null}
              selected={isSelected}
              empty={isEmpty}
              onClick={() => onToggle(field, value)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── FilterContent ────────────────────────────────────────────────────

function FilterContent({ vocabulary, facets, filters, toggle, set, setMultiple, searchText, setSearchText, currentUserId }) {
  const areas = vocabulary?.areas?.length ? vocabulary.areas : DEFAULT_AREAS;

  // Normalise options to { value, chipLabel } shape
  const areaOpts     = areas.map((a) => ({ value: a.value, chipLabel: a.label }));
  const statusOpts   = STATUS_OPTIONS.map((o) => ({ ...o, chipLabel: o.label }));
  const priorityOpts = PRIORITY_OPTIONS.map((o) => ({ ...o, chipLabel: o.label }));

  const reqByEntries = Object.entries(facets?.requested_by ?? {})
    .sort((a, b) => b[1] - a[1]);

  const overdueActive = filters.overdue === 'true';
  const due7Active    = filters.due_within === '7';

  function handleOverdueToggle() {
    overdueActive
      ? set('overdue', '')
      : setMultiple({ overdue: 'true', due_within: '' });
  }

  function handleDue7Toggle() {
    due7Active
      ? set('due_within', '')
      : setMultiple({ due_within: '7', overdue: '' });
  }

  return (
    <>
      {/* Search */}
      <div style={s.row}>
        <label htmlFor="fp-search" style={s.rowLabel}>Search</label>
        <input
          id="fp-search"
          type="search"
          placeholder="Name, ref code, description…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={s.searchInput}
        />
      </div>

      {/* Area */}
      <ChipRow
        label="Area"
        field="area"
        options={areaOpts}
        facets={facets?.area}
        selected={filters.area}
        onToggle={toggle}
      />

      {/* Status */}
      <ChipRow
        label="Status"
        field="status"
        options={statusOpts}
        facets={facets?.status}
        selected={filters.status}
        onToggle={toggle}
      />

      {/* Priority */}
      <ChipRow
        label="Priority"
        field="priority"
        options={priorityOpts}
        facets={facets?.priority}
        selected={filters.priority}
        onToggle={toggle}
      />

      {/* Requested by — only shown when the API has returned facet data */}
      {reqByEntries.length > 0 && (
        <div style={s.row}>
          <span style={s.rowLabel} id="fl-requested_by">Requested by</span>
          <div style={s.chipSet} role="group" aria-labelledby="fl-requested_by">
            {reqByEntries.map(([uid, count]) => {
              const isSelected = (filters.requested_by ?? []).includes(uid);
              const chipLabel = uid === currentUserId ? 'You' : uid.slice(0, 8) + '…';
              return (
                <Chip
                  key={uid}
                  label={chipLabel}
                  count={count}
                  selected={isSelected}
                  empty={false}
                  onClick={() => toggle('requested_by', uid)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Due date */}
      <div style={s.row}>
        <span style={s.rowLabel} id="fl-due">Due date</span>
        <div style={s.dueDateGroup} role="group" aria-labelledby="fl-due">
          <label style={s.dateLabel}>
            From
            <input
              type="date"
              value={filters.due_from ?? ''}
              onChange={(e) => set('due_from', e.target.value)}
              aria-label="Due date from"
              style={s.dateInput}
            />
          </label>
          <label style={s.dateLabel}>
            To
            <input
              type="date"
              value={filters.due_to ?? ''}
              onChange={(e) => set('due_to', e.target.value)}
              aria-label="Due date to"
              style={s.dateInput}
            />
          </label>
          <Chip
            label="Overdue only"
            selected={overdueActive}
            empty={false}
            onClick={handleOverdueToggle}
          />
          <Chip
            label="Due in 7 days"
            selected={due7Active}
            empty={false}
            onClick={handleDue7Toggle}
          />
        </div>
      </div>
    </>
  );
}

// ─── FilterPanel (public export) ──────────────────────────────────────

/**
 * Props
 *   vocabulary       { areas: [{value, label}] }   from GET /api/requests/:id
 *   facets           { area, status, priority, requested_by }  from useItemsList
 *   filters          parsed filter object           from useItemFilters
 *   toggle           (field, value) => void
 *   set              (field, value) => void
 *   setMultiple      ({ field: value, … }) => void
 *   clearAll         () => void
 *   searchText       string
 *   setSearchText    (text) => void
 *   activeFilterCount number
 *   total            server-filtered item count
 *   grandTotal       unfiltered total (null until first unfilterd load)
 *   currentUserId    for labelling "You" in requested-by chips
 *   loading          boolean — shows subtle "Updating…" hint
 */
export function FilterPanel({
  vocabulary,
  facets,
  filters,
  toggle,
  set,
  setMultiple,
  clearAll,
  searchText,
  setSearchText,
  activeFilterCount,
  total,
  grandTotal,
  currentUserId,
  loading,
}) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 767px)').matches
      : false
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e) => {
      setIsMobile(e.matches);
      if (!e.matches) setSheetOpen(false);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Focus close button on open; dismiss on Escape
  useEffect(() => {
    if (!sheetOpen) return;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') setSheetOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  const countLabel =
    grandTotal != null && grandTotal !== total
      ? `Showing ${total.toLocaleString()} of ${grandTotal.toLocaleString()} items`
      : `Showing ${total.toLocaleString()} item${total !== 1 ? 's' : ''}`;

  const contentProps = {
    vocabulary, facets, filters, toggle, set, setMultiple,
    searchText, setSearchText, currentUserId,
  };

  // ── Mobile ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        <div style={s.mobileTriggerRow}>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-expanded={sheetOpen}
            aria-haspopup="dialog"
            style={s.mobileTriggerBtn}
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            <ChevronDown size={16} aria-hidden={true} style={{ marginLeft: '4px', verticalAlign: 'text-bottom' }} />
          </button>
          <span style={s.countText}>
            {countLabel}
            {loading && <span style={s.updatingHint}> · Updating…</span>}
          </span>
        </div>

        {sheetOpen && (
          <>
            <div aria-hidden="true" onClick={() => setSheetOpen(false)} style={s.backdrop} />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Filters"
              style={s.sheet}
            >
              <div style={s.sheetHeader}>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  aria-label="Close filters"
                  style={s.sheetCloseBtn}
                >
                  ✕
                </button>
                <span style={s.sheetTitle}>Filters</span>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => { clearAll(); setSheetOpen(false); }}
                    style={s.sheetClearBtn}
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div style={{ padding: '0 16px 32px' }}>
                <FilterContent {...contentProps} />
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  // ── Desktop ─────────────────────────────────────────────────────────
  return (
    <div style={s.panel}>
      <div style={s.panelHeader}>
        <span style={s.countText}>
          {countLabel}
          {loading && <span style={s.updatingHint}> · Updating…</span>}
        </span>
        {activeFilterCount > 0 && (
          <button type="button" onClick={clearAll} style={s.clearAllBtn}>
            Clear all
          </button>
        )}
      </div>
      <FilterContent {...contentProps} />
    </div>
  );
}

// ─── Styles (all colors via CSS custom properties) ────────────────────

const s = {
  // Desktop panel
  panel: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-line)',
    borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(7,23,57,0.06)',
    padding: '14px 20px 16px',
    marginBottom: '12px',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
    gap: '12px',
  },
  countText: {
    fontSize: '13px',
    color: 'var(--color-muted)',
    fontFamily: 'Verdana, Geneva, sans-serif',
  },
  updatingHint: {
    fontStyle: 'italic',
    color: 'var(--color-muted)',
  },
  clearAllBtn: {
    padding: '4px 10px',
    fontSize: '12px',
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: 'var(--color-body)',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-line)',
    borderRadius: '6px',
    cursor: 'pointer',
  },

  // Filter content rows
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
    padding: '10px 0',
    borderTop: '1px solid var(--color-line)',
  },
  rowLabel: {
    fontSize: '11px',
    fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: 'var(--color-muted)',
  },
  chipSet: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },

  // Individual chips
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 10px',
    fontSize: '12px',
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontWeight: '500',
    lineHeight: '1.4',
    borderRadius: '99px',
    border: '1.5px solid',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.12s, color 0.12s, border-color 0.12s',
  },
  chipDefault: {
    backgroundColor: 'var(--chip-bg)',
    color: 'var(--chip-color)',
    borderColor: 'var(--chip-border)',
  },
  chipSelected: {
    backgroundColor: 'var(--chip-selected-bg)',
    color: 'var(--chip-selected-color)',
    borderColor: 'var(--chip-selected-border)',
    fontWeight: '600',
  },
  chipEmpty: {
    backgroundColor: 'var(--chip-bg)',
    color: 'var(--chip-zero-color)',
    borderColor: 'var(--chip-border)',
    opacity: 0.6,
  },

  // Chip count badge
  count: {
    fontSize: '11px',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-muted)',
  },
  countSelected: {
    fontSize: '11px',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--chip-selected-color)',
  },
  countEmpty: {
    fontSize: '11px',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--chip-zero-color)',
  },

  // Search input
  searchInput: {
    width: '100%',
    maxWidth: '440px',
    padding: '6px 12px',
    fontSize: '13px',
    fontFamily: 'Verdana, Geneva, sans-serif',
    color: 'var(--color-ink)',
    backgroundColor: 'var(--color-surface)',
    border: '1.5px solid var(--color-line)',
    borderRadius: '8px',
    outline: 'none',
  },

  // Due date section
  dueDateGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '8px',
  },
  dateLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: 'var(--color-muted)',
    cursor: 'default',
  },
  dateInput: {
    padding: '4px 8px',
    fontSize: '12px',
    fontFamily: 'Verdana, Geneva, sans-serif',
    color: 'var(--color-ink)',
    backgroundColor: 'var(--color-surface)',
    border: '1.5px solid var(--color-line)',
    borderRadius: '6px',
    outline: 'none',
  },

  // Mobile trigger row
  mobileTriggerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
    flexWrap: 'wrap',
  },
  mobileTriggerBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '7px 14px',
    fontSize: '13px',
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontWeight: '600',
    color: 'var(--color-body)',
    backgroundColor: 'var(--color-surface)',
    border: '1.5px solid var(--color-line)',
    borderRadius: '8px',
    cursor: 'pointer',
  },

  // Mobile sheet
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 200,
  },
  sheet: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '85vh',
    backgroundColor: 'var(--color-surface)',
    borderRadius: '16px 16px 0 0',
    overflowY: 'auto',
    zIndex: 201,
    display: 'flex',
    flexDirection: 'column',
  },
  sheetHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '16px 16px 14px',
    borderBottom: '1px solid var(--color-line)',
    position: 'sticky',
    top: 0,
    backgroundColor: 'var(--color-surface)',
    zIndex: 1,
  },
  sheetTitle: {
    flex: 1,
    fontSize: '15px',
    fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: 'var(--color-ink)',
  },
  sheetCloseBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--color-muted)',
    fontSize: '16px',
    lineHeight: 1,
    padding: '2px 6px',
    borderRadius: '4px',
  },
  sheetClearBtn: {
    padding: '5px 10px',
    fontSize: '12px',
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: 'var(--color-body)',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-line)',
    borderRadius: '6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
};
