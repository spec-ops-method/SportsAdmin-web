import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCarnival } from '../context/CarnivalContext';
import type { CarnivalDiskImportResult } from '@sportsadmin/shared';
import styles from './CarnivalDisk.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export default function CarnivalDisk() {
  const { token } = useAuth();
  const { activeCarnival } = useCarnival();
  const navigate = useNavigate();

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<CarnivalDiskImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleExport() {
    try {
      const res = await fetch(
        `${API}/carnivals/${activeCarnival!.id}/exports/carnival-disk`,
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
      a.download = 'carnival-disk.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Export failed');
    }
  }

  async function handleImport() {
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) {
      setImportError('Please select one or more CSV files to import.');
      return;
    }

    setImporting(true);
    setImportResult(null);
    setImportError(null);

    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }

      const res = await fetch(
        `${API}/carnivals/${activeCarnival!.id}/imports/carnival-disk`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }

      const result = await res.json() as CarnivalDiskImportResult;
      setImportResult(result);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>Carnival Disk</h2>
      <p className={styles.subtitle}>{activeCarnival.name}</p>

      {/* Export section */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Export</h3>
        <p className={styles.hint}>
          Download a ZIP archive containing one CSV file per house with competitor data and points.
        </p>
        <button className={styles.btn} onClick={handleExport}>
          📦 Export Carnival Disk (ZIP)
        </button>
      </section>

      {/* Import section */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Import</h3>
        <p className={styles.hint}>
          Upload per-house CSV files (named <code>HOUSECODE.csv</code>) to update competitor
          total points. Competitors are matched by PIN if available, otherwise by name.
        </p>

        <div className={styles.fileRow}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            multiple
            className={styles.fileInput}
            aria-label="Select CSV files to import"
          />
          <button
            className={styles.btn}
            onClick={handleImport}
            disabled={importing}
          >
            {importing ? 'Importing…' : '⬆ Upload & Import'}
          </button>
        </div>

        {importError && <p className={styles.error}>{importError}</p>}

        {importResult && (
          <div className={styles.resultCard}>
            <h4 className={styles.resultTitle}>Import Complete</h4>
            <dl className={styles.resultList}>
              <dt>Houses processed</dt>
              <dd>{importResult.housesProcessed}</dd>
              <dt>Competitors updated</dt>
              <dd>{importResult.competitorsUpdated}</dd>
              <dt>Competitors created</dt>
              <dd>{importResult.competitorsCreated}</dd>
            </dl>
            {importResult.errors.length > 0 && (
              <div className={styles.errorList}>
                <strong>Errors ({importResult.errors.length}):</strong>
                <ul>
                  {importResult.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
