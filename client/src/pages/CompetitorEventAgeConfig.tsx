import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useApi, apiRequest } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import styles from './CompetitorEventAgeConfig.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

interface AgeMapping {
  id?: number;
  competitorAge: number;
  eventAge: number;
  active: boolean;
}

export default function CompetitorEventAgeConfig() {
  const { id: carnivalId } = useParams<{ id: string }>();
  const { token } = useAuth();

  const { data: fetchedMappings, loading, error } = useApi<AgeMapping[]>(
    carnivalId ? `${API}/carnivals/${carnivalId}/age-mapping` : null,
  );

  const [rows, setRows] = useState<AgeMapping[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (fetchedMappings) {
      setRows(fetchedMappings);
      setDirty(false);
    }
  }, [fetchedMappings]);

  function updateRow(index: number, field: keyof AgeMapping, value: number | boolean) {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
    setDirty(true);
  }

  function addRow() {
    setRows((prev) => [...prev, { competitorAge: 0, eventAge: 0, active: true }]);
    setDirty(true);
  }

  async function handleSave() {
    if (!carnivalId) return;
    setSaving(true);
    setSaveError('');
    try {
      await apiRequest(`${API}/carnivals/${carnivalId}/age-mapping`, 'PUT', token, { mappings: rows });
      setDirty(false);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Age Mapping</h1>
        <div className={styles.headerActions}>
          <button className={styles.btnSecondary} onClick={addRow}>+ Add Row</button>
          <button
            className={styles.btnPrimary}
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
          >
            {saving ? 'Saving…' : 'Save All'}
          </button>
        </div>
      </header>

      {loading && <p className={styles.status}>Loading…</p>}
      {error && <p className={styles.errorMsg}>{error}</p>}
      {saveError && <p className={styles.errorMsg}>{saveError}</p>}

      {!loading && rows.length === 0 && (
        <p className={styles.empty}>No age mappings yet. Click &ldquo;+ Add Row&rdquo; to create one.</p>
      )}

      {rows.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Competitor Age</th>
              <th>Event Age</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>
                  <input
                    className={styles.numInput}
                    type="number"
                    min={0}
                    value={row.competitorAge}
                    onChange={(e) => updateRow(i, 'competitorAge', parseInt(e.target.value, 10) || 0)}
                  />
                </td>
                <td>
                  <input
                    className={styles.numInput}
                    type="number"
                    min={0}
                    value={row.eventAge}
                    onChange={(e) => updateRow(i, 'eventAge', parseInt(e.target.value, 10) || 0)}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={row.active}
                    onChange={(e) => updateRow(i, 'active', e.target.checked)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
