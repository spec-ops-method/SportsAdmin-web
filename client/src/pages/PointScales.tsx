import { useState } from 'react';
import type { PointScale, PointScaleEntry, BulkRecalcResponse } from '@sportsadmin/shared';
import { useApi, apiRequest } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useCarnival } from '../context/CarnivalContext';
import Toast from '../components/Toast';
import styles from './PointScales.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

interface ToastState { message: string; type: 'success' | 'error' | 'info'; }

// ─── Scale row ────────────────────────────────────────────────────────────────

interface ScaleRowProps {
  scale: PointScale;
  carnivalId: number;
  token: string | null;
  onRefetch: () => void;
  onToast: (msg: string, type: ToastState['type']) => void;
}

function ScaleRow({ scale, carnivalId, token, onRefetch, onToast }: ScaleRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(scale.name);
  const [entries, setEntries] = useState<PointScaleEntry[]>(scale.entries);
  const [addPlacesForm, setAddPlacesForm] = useState(false);
  const [numPlaces, setNumPlaces] = useState('');
  const [ptsPerPlace, setPtsPerPlace] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const canDelete = scale.usedByHeatCount === 0;

  async function handleRename() {
    if (!renameDraft.trim()) return;
    setBusy(true);
    try {
      await apiRequest(
        `${API}/carnivals/${carnivalId}/point-scales/${encodeURIComponent(scale.name)}`,
        'PATCH',
        token,
        { name: renameDraft.trim() },
      );
      setRenaming(false);
      onRefetch();
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete point scale "${scale.name}"?`)) return;
    setBusy(true);
    try {
      await apiRequest(
        `${API}/carnivals/${carnivalId}/point-scales/${encodeURIComponent(scale.name)}`,
        'DELETE',
        token,
      );
      onRefetch();
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleAllocate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    const n = parseInt(numPlaces, 10);
    const p = parseFloat(ptsPerPlace);
    if (!n || n < 1) { setFormError('Num places must be a positive integer.'); return; }
    if (isNaN(p) || p < 0) { setFormError('Points per place must be a non-negative number.'); return; }
    setBusy(true);
    try {
      const updated = await apiRequest<PointScale>(
        `${API}/carnivals/${carnivalId}/point-scales/${encodeURIComponent(scale.name)}/allocate-defaults`,
        'POST',
        token,
        { numPlaces: n, pointsPerPlace: p },
      );
      setEntries(updated.entries);
      setAddPlacesForm(false);
      setNumPlaces('');
      setPtsPerPlace('');
      onRefetch();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEntries() {
    setBusy(true);
    try {
      await apiRequest(
        `${API}/carnivals/${carnivalId}/point-scales/${encodeURIComponent(scale.name)}/entries`,
        'PUT',
        token,
        entries,
      );
      onToast('Entries saved', 'success');
      onRefetch();
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function updateEntry(place: number, points: string) {
    setEntries((prev) =>
      prev.map((e) => (e.place === place ? { ...e, points: parseFloat(points) || 0 } : e)),
    );
  }

  return (
    <div className={styles.scaleCard}>
      <div className={styles.scaleHeader}>
        {renaming ? (
          <div className={styles.renameRow}>
            <input
              className={styles.input}
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              maxLength={10}
              autoFocus
            />
            <button className={styles.btnPrimary} onClick={() => void handleRename()} disabled={busy}>
              Save
            </button>
            <button className={styles.btnSecondary} onClick={() => setRenaming(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className={styles.scaleName} onClick={() => setExpanded((x) => !x)}>
            {expanded ? '▼' : '▶'} {scale.name}
          </button>
        )}
        <div className={styles.scaleMeta}>
          <span className={styles.metaTag}>{scale.entries.length} places</span>
          <span className={styles.metaTag}>
            Used by {scale.usedByHeatCount} heat{scale.usedByHeatCount !== 1 ? 's' : ''}
          </span>
          <button className={styles.btnLink} onClick={() => setRenaming(true)}>
            Rename
          </button>
          <button
            className={styles.btnLinkDanger}
            onClick={() => void handleDelete()}
            disabled={!canDelete || busy}
            title={!canDelete ? `In use by ${scale.usedByHeatCount} heat(s)` : 'Delete scale'}
          >
            Delete
          </button>
        </div>
      </div>

      {expanded && (
        <div className={styles.scaleBody}>
          {entries.length > 0 && (
            <table className={styles.entriesTable}>
              <thead>
                <tr>
                  <th>Place</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.place}>
                    <td>{entry.place}</td>
                    <td>
                      <input
                        className={styles.entryInput}
                        type="number"
                        step="0.5"
                        value={entry.points}
                        onChange={(e) => updateEntry(entry.place, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {entries.length === 0 && (
            <p className={styles.empty}>No entries yet. Use "Add Places" to populate.</p>
          )}

          <div className={styles.scaleActions}>
            <button className={styles.btnPrimary} onClick={() => void handleSaveEntries()} disabled={busy}>
              Save Entries
            </button>
            <button
              className={styles.btnSecondary}
              onClick={() => setAddPlacesForm((x) => !x)}
            >
              {addPlacesForm ? 'Cancel' : 'Add Places'}
            </button>
          </div>

          {addPlacesForm && (
            <form className={styles.addPlacesForm} onSubmit={(e) => void handleAllocate(e)}>
              <div className={styles.formRow}>
                <label className={styles.fieldLabel}>
                  Num Places
                  <input
                    className={styles.input}
                    type="number"
                    min="1"
                    value={numPlaces}
                    onChange={(e) => setNumPlaces(e.target.value)}
                    style={{ width: 80 }}
                  />
                </label>
                <label className={styles.fieldLabel}>
                  Points Per Place
                  <input
                    className={styles.input}
                    type="number"
                    step="0.5"
                    min="0"
                    value={ptsPerPlace}
                    onChange={(e) => setPtsPerPlace(e.target.value)}
                    style={{ width: 90 }}
                  />
                </label>
                <button className={styles.btnPrimary} type="submit" disabled={busy}>
                  Apply
                </button>
              </div>
              {formError && <p className={styles.formError}>{formError}</p>}
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PointScales() {
  const { token } = useAuth();
  const { activeCarnival } = useCarnival();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [showRecalcConfirm, setShowRecalcConfirm] = useState(false);

  const showToast = (message: string, type: ToastState['type']) => setToast({ message, type });

  const { data: scales, loading, error, refetch } = useApi<PointScale[]>(
    activeCarnival ? `${API}/carnivals/${activeCarnival.id}/point-scales` : null,
  );

  if (!activeCarnival) {
    return (
      <div className={styles.container}>
        <p className={styles.notice}>Select an active carnival to manage point scales.</p>
      </div>
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    if (!createName.trim()) { setCreateError('Name is required.'); return; }
    setCreating(true);
    try {
      await apiRequest(
        `${API}/carnivals/${activeCarnival!.id}/point-scales`,
        'POST',
        token,
        { name: createName.trim() },
      );
      setCreateName('');
      setShowCreate(false);
      refetch();
      showToast('Point scale created', 'success');
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleRecalculate() {
    setShowRecalcConfirm(false);
    setRecalcBusy(true);
    try {
      const resp = await apiRequest<BulkRecalcResponse>(
        `${API}/carnivals/${activeCarnival!.id}/recalculate-points?confirm=true`,
        'POST',
        token,
      );
      showToast(
        `Recalculated: ${resp.compEventsUpdated} entries, ${resp.competitorsUpdated} competitors updated`,
        'success',
      );
      refetch();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setRecalcBusy(false);
    }
  }

  return (
    <div className={styles.container}>
      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}

      <div className={styles.pageHeader}>
        <div>
          <h1>Point Scales</h1>
          <p className={styles.subtitle}>{activeCarnival.name}</p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.btnSecondary}
            onClick={() => setShowRecalcConfirm(true)}
            disabled={recalcBusy}
          >
            {recalcBusy ? 'Recalculating…' : '↺ Recalculate All Points'}
          </button>
          <button className={styles.btnPrimary} onClick={() => setShowCreate((x) => !x)}>
            {showCreate ? 'Cancel' : '+ New Scale'}
          </button>
        </div>
      </div>

      {showRecalcConfirm && (
        <div className={styles.confirmBanner}>
          <span>Recalculate points for all competitors? This may take a moment.</span>
          <button className={styles.btnPrimary} onClick={() => void handleRecalculate()}>
            Confirm
          </button>
          <button className={styles.btnSecondary} onClick={() => setShowRecalcConfirm(false)}>
            Cancel
          </button>
        </div>
      )}

      {showCreate && (
        <form className={styles.createForm} onSubmit={(e) => void handleCreate(e)}>
          <label className={styles.fieldLabel}>
            Scale Name (max 10 chars)
            <input
              className={styles.input}
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              maxLength={10}
              placeholder="e.g. Standard"
              autoFocus
            />
          </label>
          <button className={styles.btnPrimary} type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create'}
          </button>
          {createError && <p className={styles.formError}>{createError}</p>}
        </form>
      )}

      {loading && <p className={styles.status}>Loading…</p>}
      {error && <p className={styles.errorMsg}>{error}</p>}

      {scales && scales.length === 0 && (
        <p className={styles.empty}>No point scales yet. Create one above.</p>
      )}

      {scales && scales.length > 0 && (
        <div className={styles.scaleList}>
          {scales.map((scale) => (
            <ScaleRow
              key={scale.name}
              scale={scale}
              carnivalId={activeCarnival.id}
              token={token}
              onRefetch={refetch}
              onToast={showToast}
            />
          ))}
        </div>
      )}
    </div>
  );
}
