import { useState, useEffect, useRef } from 'react';
import type { EventOrderItem } from '@sportsadmin/shared';
import { useApi, apiRequest } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useCarnival } from '../context/CarnivalContext';
import styles from './EventOrder.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

type SortField = 'eventNumber' | 'eventTime' | 'eventTypeDescription' | 'sex' | 'age' | 'finalLevel' | 'heatNumber' | 'status';

const SORT_BY_OPTIONS: { value: string; label: string }[] = [
  { value: 'description', label: 'Description' },
  { value: 'age', label: 'Age' },
  { value: 'sex', label: 'Sex' },
  { value: 'final_level', label: 'Final Level' },
  { value: 'heat', label: 'Heat' },
];

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'active'
      ? styles.badgeActive
      : status === 'completed'
        ? styles.badgeCompleted
        : status === 'promoted'
          ? styles.badgePromoted
          : styles.badgeFuture;
  return <span className={cls}>{status}</span>;
}

// ─── Inline edit cell ─────────────────────────────────────────────────────────

interface InlineEditProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
  className?: string;
}

function InlineEdit({ value, onChange, placeholder, type = 'text', className }: InlineEditProps) {
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function handleBlur() {
    if (draft !== value) onChange(draft);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDraft(e.target.value);
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === 'Escape') {
      setDraft(value);
    }
  }

  return (
    <input
      className={className}
      type={type}
      value={draft}
      placeholder={placeholder}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EventOrder() {
  const { token } = useAuth();
  const { activeCarnival } = useCarnival();
  const cid = activeCarnival?.id;

  const { data: orderData, loading, error, refetch } = useApi<EventOrderItem[]>(
    cid ? `${API}/carnivals/${cid}/event-order` : null,
  );

  const [localOrder, setLocalOrder] = useState<EventOrderItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Auto-number form
  const [showAutoForm, setShowAutoForm] = useState(false);
  const [autoSortBy, setAutoSortBy] = useState<string[]>(['description', 'sex', 'age', 'final_level', 'heat']);
  const [autoStart, setAutoStart] = useState('1');

  // Table sort
  const [sortField, setSortField] = useState<SortField>('eventNumber');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (orderData) {
      setLocalOrder(orderData);
      setDirty(false);
    }
  }, [orderData]);

  function updateItem(heatId: number, field: 'eventNumber' | 'eventTime', raw: string) {
    setLocalOrder((prev) =>
      prev.map((item) => {
        if (item.heatId !== heatId) return item;
        if (field === 'eventNumber') {
          return { ...item, eventNumber: raw.trim() ? parseInt(raw, 10) : null };
        }
        return { ...item, eventTime: raw.trim() || null };
      }),
    );
    setDirty(true);
  }

  async function handleSaveAll() {
    setSaving(true);
    setSaveMsg('');
    try {
      await apiRequest(`${API}/carnivals/${cid}/event-order`, 'PUT', token, localOrder);
      setSaveMsg('✓ Saved.');
      setDirty(false);
      refetch();
    } catch (err) {
      setSaveMsg(`Error: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleAutoNumber(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await apiRequest<EventOrderItem[]>(
        `${API}/carnivals/${cid}/event-order/auto-number`,
        'POST',
        token,
        { sortBy: autoSortBy, startNumber: parseInt(autoStart, 10) || 1 },
      );
      setLocalOrder(result);
      setDirty(false);
      setShowAutoForm(false);
      setSaveMsg('✓ Auto-numbered.');
      refetch();
    } catch (err) {
      setSaveMsg(`Error: ${(err as Error).message}`);
    }
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function sortedOrder() {
    return [...localOrder].sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  function SortTh({
    field,
    children,
    right,
  }: {
    field: SortField;
    children: React.ReactNode;
    right?: boolean;
  }) {
    const active = sortField === field;
    return (
      <th
        className={`${styles.sortable} ${right ? styles.right : ''}`}
        onClick={() => handleSort(field)}
      >
        {children}
        {active && <span className={styles.sortArrow}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </th>
    );
  }

  function toggleSortBy(val: string) {
    setAutoSortBy((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val],
    );
  }

  if (!cid) {
    return (
      <div className={styles.container}>
        <p className={styles.notice}>Select an active carnival to manage the programme.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Programme — {activeCarnival.name}</h1>
        <div className={styles.toolbar}>
          <button className={styles.btnSecondary} onClick={() => setShowAutoForm(!showAutoForm)}>
            ⚡ Auto-Number
          </button>
          {dirty && (
            <button
              className={styles.btnPrimary}
              onClick={() => void handleSaveAll()}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save All'}
            </button>
          )}
        </div>
      </header>

      {saveMsg && <p className={styles.infoMsg}>{saveMsg}</p>}

      {showAutoForm && (
        <form className={styles.autoForm} onSubmit={(e) => void handleAutoNumber(e)}>
          <p className={styles.autoFormTitle}>Auto-Number Heats</p>
          <div className={styles.autoFormRow}>
            <label className={styles.fieldLabel}>
              Sort by
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                {SORT_BY_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}
                  >
                    <input
                      type="checkbox"
                      checked={autoSortBy.includes(opt.value)}
                      onChange={() => toggleSortBy(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </label>
            <label className={styles.fieldLabel}>
              Start Number
              <input
                className={styles.input}
                type="number"
                min={1}
                value={autoStart}
                onChange={(e) => setAutoStart(e.target.value)}
                style={{ width: 80 }}
              />
            </label>
          </div>
          <div className={styles.formActions}>
            <button type="submit" className={styles.btnPrimary}>
              Apply
            </button>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => setShowAutoForm(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && <p className={styles.status}>Loading…</p>}
      {error && <p className={styles.errorMsg}>{error}</p>}

      {localOrder.length === 0 && !loading && !error && (
        <p className={styles.empty}>No heats in the programme yet.</p>
      )}

      {localOrder.length > 0 && (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <SortTh field="eventNumber">Event #</SortTh>
                <SortTh field="eventTime">Time</SortTh>
                <SortTh field="eventTypeDescription">Event Type</SortTh>
                <SortTh field="sex">Sex</SortTh>
                <SortTh field="age">Age</SortTh>
                <SortTh field="finalLevel">Level</SortTh>
                <SortTh field="heatNumber" right>Heat</SortTh>
                <SortTh field="status">Status</SortTh>
              </tr>
            </thead>
            <tbody>
              {sortedOrder().map((item) => (
                <tr key={item.heatId}>
                  <td>
                    <InlineEdit
                      className={styles.inlineInput}
                      value={item.eventNumber != null ? String(item.eventNumber) : ''}
                      onChange={(v) => updateItem(item.heatId, 'eventNumber', v)}
                      placeholder="—"
                      type="number"
                    />
                  </td>
                  <td>
                    <InlineEdit
                      className={styles.inlineInputTime}
                      value={item.eventTime ?? ''}
                      onChange={(v) => updateItem(item.heatId, 'eventTime', v)}
                      placeholder="HH:MM"
                    />
                  </td>
                  <td>{item.eventTypeDescription}</td>
                  <td>{item.sex}</td>
                  <td>{item.age}</td>
                  <td>{item.finalLevelLabel}</td>
                  <td className={styles.right}>{item.heatNumber}</td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {dirty && (
            <div className={styles.saveAllBar}>
              <button
                className={styles.btnPrimary}
                onClick={() => void handleSaveAll()}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save All'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
