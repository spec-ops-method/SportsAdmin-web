import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type {
  HeatDetailResponse,
  CompEvent,
  Competitor,
  HeatCompleteResponse,
  RecordBreaker,
} from '@sportsadmin/shared';
import { useApi, apiRequest } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import Toast from '../components/Toast';
import styles from './HeatDetail.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

// ─── Unit hints ───────────────────────────────────────────────────────────────

function unitHint(units: string): string {
  switch (units?.toLowerCase()) {
    case 'seconds': return 'SS.cc or M:SS.cc';
    case 'minutes': return 'M:SS.cc or H:MM:SS';
    case 'hours':   return 'H:MM or H:MM:SS';
    case 'meters':  return 'e.g. 5.67';
    case 'kilometers': return 'e.g. 2.50';
    case 'points':  return 'e.g. 45 or 45.5';
    default:        return '';
  }
}

// ─── Toast state helpers ──────────────────────────────────────────────────────

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

// ─── Result cell ──────────────────────────────────────────────────────────────

interface ResultCellProps {
  compEventId: number;
  carnivalId: number;
  heatId: string;
  units: string;
  initialValue: string | null;
  token: string | null;
  onSaved: () => void;
}

function ResultCell({ compEventId, carnivalId, units, initialValue, token, onSaved }: ResultCellProps) {
  const [draft, setDraft] = useState(initialValue ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(initialValue ?? ''); }, [initialValue]);

  async function commit() {
    if (draft === (initialValue ?? '')) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await apiRequest(
        `${API}/carnivals/${carnivalId}/comp-events/${compEventId}`,
        'PATCH',
        token,
        { result: draft || null },
      );
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const hint = unitHint(units);

  return (
    <div className={styles.resultCell}>
      <div className={styles.resultInputRow}>
        <input
          className={`${styles.cellInput} ${error ? styles.cellInputError : ''}`}
          type="text"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(''); setSaved(false); }}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit();
            if (e.key === 'Escape') setDraft(initialValue ?? '');
          }}
          disabled={saving}
          placeholder={hint}
          style={{ width: 120 }}
        />
        {saved && <span className={styles.savedTick} title="Saved">✓</span>}
      </div>
      {hint && <span className={styles.unitHint}>{hint}</span>}
      {error && <span className={styles.resultError}>{error}</span>}
    </div>
  );
}

// ─── Record confirmation modal ────────────────────────────────────────────────

interface RecordModalProps {
  records: RecordBreaker[];
  carnivalId: number;
  heatId: string;
  eventTypeDescription: string;
  token: string | null;
  onDone: () => void;
}

function RecordModal({ records, carnivalId, heatId, eventTypeDescription, token, onDone }: RecordModalProps) {
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);

  if (current >= records.length) {
    onDone();
    return null;
  }

  const rec = records[current];

  async function accept() {
    setBusy(true);
    try {
      await apiRequest(
        `${API}/carnivals/${carnivalId}/heats/${heatId}/accept-record`,
        'POST',
        token,
        { competitorId: rec.competitorId },
      );
    } catch {
      // best-effort
    } finally {
      setBusy(false);
      setCurrent((c) => c + 1);
    }
  }

  function skip() {
    setCurrent((c) => c + 1);
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h2 className={styles.modalTitle}>🏆 New Record!</h2>
        <p className={styles.modalMeta}>
          {current + 1} of {records.length}
        </p>
        <div className={styles.recordCard}>
          <p className={styles.recordName}>{rec.fullName}</p>
          <p className={styles.recordHouse}>{rec.houseCode}</p>
          <p className={styles.recordResult}>{rec.formattedResult}</p>
          <p className={styles.recordEvent}>{eventTypeDescription}</p>
        </div>
        <div className={styles.modalActions}>
          <button
            className={styles.btnPrimary}
            onClick={() => void accept()}
            disabled={busy}
          >
            ✓ Accept Record
          </button>
          <button className={styles.btnSecondary} onClick={skip} disabled={busy}>
            ✗ Skip
          </button>
        </div>
      </div>
    </div>
  );
}

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

// ─── Editable cell (for lane, memo, etc.) ─────────────────────────────────────

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

type SortOption = 'lane' | 'name' | 'place' | 'unsorted';

export default function HeatDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const [sort, setSort] = useState<SortOption>('lane');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [calcBusy, setCalcBusy] = useState(false);
  const [recordBreakers, setRecordBreakers] = useState<RecordBreaker[]>([]);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [eventNumberDraft, setEventNumberDraft] = useState<string>('');
  const [eventTimeDraft, setEventTimeDraft] = useState<string>('');

  const showToast = useCallback((message: string, type: ToastState['type']) => {
    setToast({ message, type });
  }, []);

  const { data: heat, loading: heatLoading, error: heatError, refetch: refetchHeat } =
    useApi<HeatDetailResponse>(id ? `${API}/heats/${id}` : null);

  const {
    data: competitors,
    loading: compLoading,
    error: compError,
    refetch: refetchComps,
  } = useApi<CompEvent[]>(
    id ? `${API}/heats/${id}/competitors?sort=${sort}` : null,
  );

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
      showToast((err as Error).message, 'error');
    } finally {
      setStatusBusy(false);
    }
  }

  async function saveEventNumber() {
    const n = eventNumberDraft.trim() ? parseInt(eventNumberDraft, 10) : null;
    try { await patchHeat({ eventNumber: n }); }
    catch (err) { showToast((err as Error).message, 'error'); }
  }

  async function saveEventTime() {
    const t = eventTimeDraft.trim() || null;
    try { await patchHeat({ eventTime: t }); }
    catch (err) { showToast((err as Error).message, 'error'); }
  }

  async function toggleDontOverride() {
    if (!heat) return;
    try {
      await patchHeat({ dontOverridePlaces: !heat.dontOverridePlaces });
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }

  async function completeHeat() {
    if (!heat) return;
    setCompleteBusy(true);
    try {
      const resp = await apiRequest<HeatCompleteResponse>(
        `${API}/carnivals/${heat.carnivalId}/heats/${id}/complete`,
        'POST',
        token,
      );
      refetchHeat();
      refetchComps();
      if (resp.recordBreakers && resp.recordBreakers.length > 0) {
        setRecordBreakers(resp.recordBreakers);
        setShowRecordModal(true);
      } else {
        showToast('Heat completed successfully', 'success');
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setCompleteBusy(false);
    }
  }

  async function calculatePlaces() {
    if (!heat) return;
    setCalcBusy(true);
    try {
      await apiRequest(
        `${API}/carnivals/${heat.carnivalId}/heats/${id}/calculate-places`,
        'POST',
        token,
      );
      refetchComps();
      showToast('Places calculated', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setCalcBusy(false);
    }
  }

  async function saveCompetitorField(compEventId: number, field: keyof CompEvent, raw: string) {
    const value =
      field === 'lane' || field === 'place' || field === 'numericResult'
        ? (raw === '' ? null : Number(raw))
        : raw || null;
    try {
      await apiRequest(
        `${API}/heats/${id}/competitors/${compEventId}`,
        'PUT',
        token,
        { [field]: value },
      );
      refetchComps();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }

  async function removeCompetitor(compEventId: number, name: string) {
    if (!window.confirm(`Remove ${name} from this heat?`)) return;
    try {
      await apiRequest(`${API}/heats/${id}/competitors/${compEventId}`, 'DELETE', token);
      refetchComps();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }

  if (heatLoading) {
    return <div className={styles.container}><p className={styles.status}>Loading…</p></div>;
  }
  if (heatError) {
    return <div className={styles.container}><p className={styles.errorMsg}>{heatError}</p></div>;
  }
  if (!heat) return null;

  const backPath = `/event-types/${heat.eventTypeId}`;

  return (
    <div className={styles.container}>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}

      {showRecordModal && (
        <RecordModal
          records={recordBreakers}
          carnivalId={heat.carnivalId}
          heatId={id!}
          eventTypeDescription={heat.eventTypeDescription}
          token={token}
          onDone={() => {
            setShowRecordModal(false);
            showToast('Heat completed successfully', 'success');
          }}
        />
      )}

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
          {heat.units && (
            <span className={styles.headerMetaItem}>Units: {heat.units}</span>
          )}
        </div>
      </div>

      {/* ── Don't Override warning ── */}
      {heat.dontOverridePlaces && (
        <div className={styles.warnBanner}>
          ⚠ Manual places locked — auto-calculation disabled
        </div>
      )}

      {/* ── Controls ── */}
      <div className={styles.controls}>
        <button
          className={styles.btnPrimary}
          onClick={() => void completeHeat()}
          disabled={completeBusy}
        >
          {completeBusy ? 'Completing…' : '✓ Complete Heat'}
        </button>

        <button
          className={styles.btnSecondary}
          onClick={() => void calculatePlaces()}
          disabled={calcBusy}
        >
          {calcBusy ? 'Calculating…' : 'Calculate Places'}
        </button>

        <button
          className={heat.status === 'completed' ? styles.btnSecondary : styles.btnSecondary}
          onClick={() => void toggleStatus()}
          disabled={statusBusy}
          style={{ marginLeft: 'auto' }}
        >
          {statusBusy
            ? 'Saving…'
            : heat.status === 'completed'
              ? 'Mark Active'
              : 'Mark Complete'}
        </button>

        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Sort</span>
          <select
            className={styles.input}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            style={{ width: 110 }}
          >
            <option value="lane">By Lane</option>
            <option value="name">By Name</option>
            <option value="place">By Place</option>
            <option value="unsorted">Unsorted</option>
          </select>
        </div>

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

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={!!heat.dontOverridePlaces}
            onChange={() => void toggleDontOverride()}
          />
          <span>Don't Override Places</span>
        </label>
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
                  <th className={styles.dimCol}>Place</th>
                  <th>Result</th>
                  <th className={`${styles.right} ${styles.dimCol}`}>Points</th>
                  <th>Memo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {competitors.map((comp) => (
                  <tr key={comp.id}>
                    <td>
                      <EditableCell
                        value={comp.lane != null ? String(comp.lane) : ''}
                        type="number"
                        onSave={(v) => void saveCompetitorField(comp.id, 'lane', v)}
                        width={50}
                      />
                    </td>
                    <td>{comp.competitorFullName}</td>
                    <td><code>{comp.houseCode}</code></td>
                    <td className={styles.dimCol}>
                      <span className={styles.readOnly}>
                        {comp.place > 0 ? comp.place : '—'}
                      </span>
                    </td>
                    <td>
                      <ResultCell
                        compEventId={comp.id}
                        carnivalId={heat.carnivalId}
                        heatId={id!}
                        units={heat.units}
                        initialValue={comp.result}
                        token={token}
                        onSaved={refetchComps}
                      />
                    </td>
                    <td className={`${styles.right} ${styles.dimCol}`}>
                      <span className={styles.readOnly}>
                        {comp.points > 0 ? comp.points : '—'}
                      </span>
                    </td>
                    <td>
                      <EditableCell
                        value={comp.memo ?? ''}
                        onSave={(v) => void saveCompetitorField(comp.id, 'memo', v)}
                        width={120}
                      />
                    </td>
                    <td>
                      <button
                        className={styles.btnLinkDanger}
                        onClick={() => void removeCompetitor(comp.id, comp.competitorFullName)}
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
          onAdded={() => { refetchComps(); refetchHeat(); }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
