import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCarnival } from '../context/CarnivalContext';
import { apiRequest } from '../hooks/useApi';
import type { MeetManagerDivision } from '@sportsadmin/shared';
import styles from './MeetManager.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

type Tab = 'divisions' | 'export';

export default function MeetManager() {
  const { token } = useAuth();
  const { activeCarnival } = useCarnival();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('divisions');
  const [divisions, setDivisions] = useState<MeetManagerDivision[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeCarnival) return;
    setLoading(true);
    apiRequest<MeetManagerDivision[]>(
      `${API}/carnivals/${activeCarnival.id}/meet-manager/divisions`,
      'GET',
      token,
    )
      .then((data) => setDivisions(data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeCarnival, token]);

  if (!activeCarnival) {
    return (
      <div className={styles.noCarni}>
        <p>No active carnival selected. Please select a carnival first.</p>
        <button onClick={() => navigate('/carnivals')} className={styles.btn}>
          Go to Carnivals
        </button>
      </div>
    );
  }

  function handleMdivChange(eventAge: string, mdiv: string) {
    setDivisions((prev) => prev.map((d) => (d.eventAge === eventAge ? { ...d, mdiv } : d)));
  }

  async function saveDivisions() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await apiRequest(
        `${API}/carnivals/${activeCarnival!.id}/meet-manager/divisions`,
        'PUT',
        token,
        divisions,
      );
      setMessage('Division mapping saved.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function downloadFile(url: string) {
    const a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function handleExport(endpoint: string, filename: string) {
    setError(null);
    try {
      const res = await fetch(
        `${API}/carnivals/${activeCarnival!.id}/meet-manager/export/${endpoint}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  }

  void downloadFile;

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>Meet Manager</h2>
      <p className={styles.subtitle}>{activeCarnival.name}</p>

      <div className={styles.tabs} role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'divisions'}
          className={tab === 'divisions' ? styles.tabActive : styles.tab}
          onClick={() => setTab('divisions')}
        >
          Division Mapping
        </button>
        <button
          role="tab"
          aria-selected={tab === 'export'}
          className={tab === 'export' ? styles.tabActive : styles.tab}
          onClick={() => setTab('export')}
        >
          Export
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {message && <p className={styles.success}>{message}</p>}

      {tab === 'divisions' && (
        <div className={styles.panel}>
          <p className={styles.hint}>
            Map each event age to a Meet Manager division code (e.g. <code>12</code>,{' '}
            <code>OB</code>).
          </p>
          {loading ? (
            <p>Loading divisions…</p>
          ) : divisions.length === 0 ? (
            <p className={styles.empty}>
              No event age mappings found. Configure age groups in Age Mapping first.
            </p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Event Age</th>
                  <th>Division Code (mdiv)</th>
                </tr>
              </thead>
              <tbody>
                {divisions.map((d) => (
                  <tr key={d.eventAge}>
                    <td>{d.eventAge}</td>
                    <td>
                      <input
                        type="text"
                        maxLength={2}
                        value={d.mdiv}
                        onChange={(e) => handleMdivChange(d.eventAge, e.target.value)}
                        className={styles.input}
                        aria-label={`Division for ${d.eventAge}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {divisions.length > 0 && (
            <button onClick={saveDivisions} disabled={saving} className={styles.btn}>
              {saving ? 'Saving…' : 'Save Division Mapping'}
            </button>
          )}
        </div>
      )}

      {tab === 'export' && (
        <div className={styles.panel}>
          <p className={styles.hint}>
            Download files for import into Meet Manager. Ensure division mapping and event settings
            (Meet Event codes) are configured before exporting.
          </p>
          <div className={styles.exportGroup}>
            <div className={styles.exportCard}>
              <h3>Entries</h3>
              <p>Top-place results per event, formatted for Meet Manager entry import.</p>
              <button
                className={styles.btn}
                onClick={() => handleExport('entries', 'meet-manager-entries.txt')}
              >
                Export Entries
              </button>
            </div>
            <div className={styles.exportCard}>
              <h3>Athletes</h3>
              <p>All competitor athlete records for Meet Manager.</p>
              <button
                className={styles.btn}
                onClick={() => handleExport('athletes', 'meet-manager-athletes.txt')}
              >
                Export Athletes
              </button>
            </div>
            <div className={styles.exportCard}>
              <h3>RE1 Format</h3>
              <p>Full results in RE1 format for direct Meet Manager import.</p>
              <button
                className={styles.btn}
                onClick={() => handleExport('re1', 'meet-manager.re1')}
              >
                Export RE1
              </button>
            </div>
          </div>
          <div className={styles.settingsNote}>
            <strong>Note:</strong> Team name, team code, and top-N cutoff are set in{' '}
            <a href={`/carnivals/${activeCarnival.id}/settings`}>Carnival Settings</a>.
          </div>
        </div>
      )}
    </div>
  );
}
