import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { HeatDetailResponse, CompEvent, Competitor } from '@sportsadmin/shared';
import { useApi, apiRequest } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import styles from './HeatDetail.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

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

// ─── Editable cell ────────────────────────────────────────────────────────────

interface EditableCellProps {
  value: string;
  onSave: (v: string) => void;
  type?: 'text' | 'number';
  width?: number;
}

function EditableCell({ value, onSave, type = 'text', width }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function commit() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  if (editing) {
    return (
      <input
        className={styles.cellInput}
        type={type}
        value={draft}
        style={width ? { width } : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        autoFocus
      />
    );
  }

  return (
    <span
      className={styles.editableCell}
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      {value || '—'}
    </span>
  );
}

// ─── Add Competitor panel ─────────────────────────────────────────────────────

interface AddCompetitorPanelProps {
  heatId: number;
  carnivalId: number;
  sex: string;
  token: string | null;
  onAdded: () => void;
  onClose: () => void;
}

function AddCompetitorPanel({
  heatId,
  carnivalId,
  sex,
  token,
  onAdded,
  onClose,
}: AddCompetitorPanelProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => setDebouncedQuery(query), 350);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  const searchParams = new URLSearchParams({ perPage: '15', page: '1' });
  if (debouncedQuery) searchParams.set('search', debouncedQuery);
  if (sex && sex !== '-') searchParams.set('sex', sex);

  const { data: results, loading } = useApi<{ data: Competitor[] }>(
    debouncedQuery.length >= 1
      ? `${API}/carnivals/${carnivalId}/competitors?${searchParams.toString()}`
      : null,
  );

  async function handleAdd(competitorId: number) {
    setAdding(true);
    setAddError('');
    try {
      await apiRequest(`${API}/heats/${heatId}/competitors`, 'POST', token, { competitorId });
      onAdded();
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('409') || msg.toLowerCase().includes('already')) {
        setAddError('This competitor is already in the heat.');
      } else {
        setAddError(msg);
      }
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className={styles.addPanel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p className={styles.addPanelTitle}>Add Competitor</p>
        <button className={styles.btnLink} onClick={onClose}>
          Close
        </button>
      </div>
      <input
        className={styles.searchInput}
        type="search"
        placeholder="Search by name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      {loading && <p className={styles.status}>Searching…</p>}
      {results && results.data.length === 0 && debouncedQuery && (
        <p className={styles.empty}>No competitors found.</p>
      )}
      {results && results.data.length > 0 && (
        <div className={styles.searchResults}>
          {results.data.map((c) => (
            <div
              key={c.id}
              className={styles.searchResultItem}
              onClick={() => !adding && void handleAdd(c.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && !adding && void handleAdd(c.id)}
            >
              <span className={styles.searchResultName}>{c.fullName}</span>
              <span className={styles.searchResultMeta}>
                {c.houseCode} · Age {c.age} · {c.sex}
              </span>
            </div>
          ))}
        </div>
      )}
      {addError && <p className={styles.addError}>{addError}</p>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HeatDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const { data: heat, loading: heatLoading, error: heatError, refetch: refetchHeat } =
    useApi<HeatDetailResponse>(id ? `${API}/heats/${id}` : null);

  const {
    data: competitors,
    loading: compLoading,
    error: compError,
    refetch: refetchComps,
  } = useApi<CompEvent[]>(id ? `${API}/heats/${id}/competitors` : null);

  // Pending inline edits: compEventId → partial CompEvent
  const [edits, setEdits] = useState<Record<number, Partial<CompEvent>>>({});
  const [statusBusy, setStatusBusy] = useState(false);
  const [eventNumberDraft, setEventNumberDraft] = useState<string>('');
  const [eventTimeDraft, setEventTimeDraft] = useState<string>('');
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (heat) {
      setEventNumberDraft(heat.eventNumber != null ? String(heat.eventNumber) : '');
      setEventTimeDraft(heat.eventTime ?? '');
    }
  }, [heat]);

  async function patchHeat(body: Record<string, unknown>) {
    await apiRequest(`${API}/heats/${id}`, 'PATCH', token, body);
    refetchHeat();
  }

  async function toggleStatus() {
    if (!heat) return;
    setStatusBusy(true);
    try {
      const newStatus = heat.status === 'completed' ? 'active' : 'completed';
      await patchHeat({ status: newStatus });
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setStatusBusy(false);
    }
  }

  async function saveEventNumber() {
    const n = eventNumberDraft.trim() ? parseInt(eventNumberDraft, 10) : null;
    try {
      await patchHeat({ eventNumber: n });
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function saveEventTime() {
    const t = eventTimeDraft.trim() || null;
    try {
      await patchHeat({ eventTime: t });
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function saveCompetitorField(compEventId: number, field: keyof CompEvent, raw: string) {
    const pending = edits[compEventId] ?? {};
    const value = field === 'lane' || field === 'place' || field === 'points' || field === 'numericResult'
      ? (raw === '' ? null : Number(raw))
      : raw || null;
    const next = { ...pending, [field]: value };
    setEdits((prev) => ({ ...prev, [compEventId]: next }));
    try {
      await apiRequest(`${API}/heats/${id}/competitors/${compEventId}`, 'PUT', token, next);
      refetchComps();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function removeCompetitor(compEventId: number, name: string) {
    if (!window.confirm(`Remove ${name} from this heat?`)) return;
    try {
      await apiRequest(`${API}/heats/${id}/competitors/${compEventId}`, 'DELETE', token);
      refetchComps();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function getDisplayValue(comp: CompEvent, field: keyof CompEvent): string {
    const editedVal = edits[comp.id]?.[field];
    const raw = editedVal !== undefined ? editedVal : comp[field];
    return raw != null ? String(raw) : '';
  }

  if (heatLoading) {
    return (
      <div className={styles.container}>
        <p className={styles.status}>Loading…</p>
      </div>
    );
  }

  if (heatError) {
    return (
      <div className={styles.container}>
        <p className={styles.errorMsg}>{heatError}</p>
      </div>
    );
  }

  if (!heat) return null;

  const backPath = `/event-types/${heat.eventTypeId}`;

  return (
    <div className={styles.container}>
      <button className={styles.backLink} onClick={() => navigate(backPath)}>
        ← {heat.eventTypeDescription}
      </button>

      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h1>
            {heat.eventTypeDescription} — {heat.sex} {heat.age}
          </h1>
          <StatusBadge status={heat.status} />
        </div>
        <div className={styles.headerMeta}>
          <span className={styles.headerMetaItem}>{heat.finalLevelLabel}</span>
          <span className={styles.headerMetaItem}>Heat {heat.heatNumber}</span>
          <span className={styles.headerMetaItem}>
            {heat.laneCount === 0 ? 'Unlimited lanes' : `${heat.laneCount} lanes`}
          </span>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className={styles.controls}>
        <button
          className={heat.status === 'completed' ? styles.btnSecondary : styles.btnPrimary}
          onClick={() => void toggleStatus()}
          disabled={statusBusy}
        >
          {statusBusy
            ? 'Saving…'
            : heat.status === 'completed'
              ? 'Mark Active'
              : 'Mark Complete'}
        </button>

        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Event #</span>
          <input
            className={styles.input}
            type="number"
            value={eventNumberDraft}
            onChange={(e) => setEventNumberDraft(e.target.value)}
            onBlur={() => void saveEventNumber()}
            onKeyDown={(e) => e.key === 'Enter' && void saveEventNumber()}
            placeholder="—"
          />
        </div>

        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Time</span>
          <input
            className={styles.input}
            type="text"
            value={eventTimeDraft}
            onChange={(e) => setEventTimeDraft(e.target.value)}
            onBlur={() => void saveEventTime()}
            onKeyDown={(e) => e.key === 'Enter' && void saveEventTime()}
            placeholder="HH:MM"
            style={{ width: 90 }}
          />
        </div>
      </div>

      {/* ── Competitors ── */}
      {compLoading && <p className={styles.status}>Loading competitors…</p>}
      {compError && <p className={styles.errorMsg}>{compError}</p>}

      {competitors && (
        <>
          {competitors.length === 0 && !showAdd && (
            <p className={styles.empty}>No competitors in this heat yet.</p>
          )}
          {competitors.length > 0 && (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Lane</th>
                  <th>Name</th>
                  <th>House</th>
                  <th>Place</th>
                  <th>Result</th>
                  <th className={styles.right}>Points</th>
                  <th>Memo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {competitors.map((comp) => (
                  <tr key={comp.id}>
                    <td>
                      <EditableCell
                        value={getDisplayValue(comp, 'lane')}
                        type="number"
                        onSave={(v) => void saveCompetitorField(comp.id, 'lane', v)}
                        width={50}
                      />
                    </td>
                    <td>{comp.competitorFullName}</td>
                    <td>
                      <code>{comp.houseCode}</code>
                    </td>
                    <td>
                      <EditableCell
                        value={getDisplayValue(comp, 'place')}
                        type="number"
                        onSave={(v) => void saveCompetitorField(comp.id, 'place', v)}
                        width={50}
                      />
                    </td>
                    <td>
                      <EditableCell
                        value={getDisplayValue(comp, 'result')}
                        onSave={(v) => void saveCompetitorField(comp.id, 'result', v)}
                        width={80}
                      />
                    </td>
                    <td className={styles.right}>
                      <EditableCell
                        value={getDisplayValue(comp, 'points')}
                        type="number"
                        onSave={(v) => void saveCompetitorField(comp.id, 'points', v)}
                        width={60}
                      />
                    </td>
                    <td>
                      <EditableCell
                        value={getDisplayValue(comp, 'memo')}
                        onSave={(v) => void saveCompetitorField(comp.id, 'memo', v)}
                        width={120}
                      />
                    </td>
                    <td>
                      <button
                        className={styles.btnLinkDanger}
                        onClick={() =>
                          void removeCompetitor(comp.id, comp.competitorFullName)
                        }
                        title="Remove from heat"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <div style={{ marginTop: '1rem' }}>
        {!showAdd && (
          <button className={styles.btnSecondary} onClick={() => setShowAdd(true)}>
            + Add Competitor
          </button>
        )}
      </div>

      {showAdd && (
        <AddCompetitorPanel
          heatId={heat.id}
          carnivalId={heat.carnivalId}
          sex={heat.sex}
          token={token}
          onAdded={() => {
            refetchComps();
            refetchHeat();
          }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
