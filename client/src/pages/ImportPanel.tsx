import { useState, useRef } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import type { ImportPreviewResponse, ImportCommitResponse, ImportPreviewRow } from '@sportsadmin/shared';
import styles from './ImportPanel.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

interface Props {
  carnivalId: number;
  token: string | null;
  onClose: () => void;
  onImported: () => void;
}

export default function ImportPanel({ carnivalId, token, onClose, onImported }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [autoCreateHouses, setAutoCreateHouses] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<ImportCommitResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API}/carnivals/${carnivalId}/competitors/import/preview`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as ImportPreviewResponse;
      setPreview(data);
      setStep(2);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  async function handleCommit() {
    if (!preview) return;
    setCommitting(true);
    setUploadError('');
    try {
      const res = await fetch(`${API}/carnivals/${carnivalId}/competitors/import/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ previewToken: preview.previewToken, autoCreateHouses, skipDuplicates }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as ImportCommitResponse;
      setResult(data);
      onImported();
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setCommitting(false);
    }
  }

  function rowClass(status: ImportPreviewRow['status']): string {
    switch (status) {
      case 'valid':   return styles.rowValid;
      case 'warning': return styles.rowWarning;
      case 'skip':    return styles.rowSkip;
      case 'error':   return styles.rowError;
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Import Competitors</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {result ? (
          <div className={styles.resultBox}>
            <p className={styles.resultTitle}>✅ Import Complete</p>
            <ul className={styles.resultList}>
              <li>Imported: <strong>{result.imported}</strong></li>
              <li>Houses created: <strong>{result.housesCreated}</strong></li>
              <li>Skipped duplicates: <strong>{result.skippedDuplicates}</strong></li>
              {result.errors > 0 && <li>Errors: <strong>{result.errors}</strong></li>}
            </ul>
            <button className={styles.btnPrimary} onClick={onClose}>Done</button>
          </div>
        ) : step === 1 ? (
          <div className={styles.stepContent}>
            <p className={styles.stepLabel}>Step 1 of 2 — Upload CSV file</p>
            <div
              className={`${styles.dropZone} ${dragging ? styles.dragging : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <span>Uploading…</span>
              ) : (
                <>
                  <span className={styles.dropIcon}>📂</span>
                  <span>Drag &amp; drop a CSV, or <u>click to browse</u></span>
                  <span className={styles.dropHint}>
                    Expected columns: givenName, surname, sex, age/dob, houseCode
                  </span>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className={styles.hiddenInput}
              onChange={handleFileChange}
            />
            {uploadError && <p className={styles.error}>{uploadError}</p>}
          </div>
        ) : (
          <div className={styles.stepContent}>
            <p className={styles.stepLabel}>Step 2 of 2 — Review &amp; Confirm</p>
            {preview && (
              <>
                <div className={styles.summaryBadges}>
                  <span className={`${styles.badge} ${styles.badgeValid}`}>{preview.valid} valid</span>
                  {preview.warnings > 0 && (
                    <span className={`${styles.badge} ${styles.badgeWarning}`}>
                      {preview.warnings} warning{preview.warnings !== 1 ? 's' : ''}
                    </span>
                  )}
                  {preview.skipped > 0 && (
                    <span className={`${styles.badge} ${styles.badgeSkip}`}>{preview.skipped} skip</span>
                  )}
                  {preview.errors > 0 && (
                    <span className={`${styles.badge} ${styles.badgeError}`}>
                      {preview.errors} error{preview.errors !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className={styles.previewTableWrap}>
                  <table className={styles.previewTable}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Status</th>
                        <th>Given Name</th>
                        <th>Surname</th>
                        <th>Sex</th>
                        <th>Age</th>
                        <th>House</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row) => (
                        <tr key={row.rowNumber} className={rowClass(row.status)}>
                          <td>{row.rowNumber}</td>
                          <td><span className={styles.statusTag}>{row.status}</span></td>
                          <td>{row.data.givenName ?? '—'}</td>
                          <td>{row.data.surname ?? '—'}</td>
                          <td>{row.data.sex ?? '—'}</td>
                          <td>{row.data.age ?? '—'}</td>
                          <td>{row.data.houseCode ?? '—'}</td>
                          <td className={styles.msgCell}>{row.message ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={styles.optionsRow}>
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={autoCreateHouses}
                      onChange={(e) => setAutoCreateHouses(e.target.checked)}
                    />
                    Auto-create missing houses
                  </label>
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={skipDuplicates}
                      onChange={(e) => setSkipDuplicates(e.target.checked)}
                    />
                    Skip duplicates
                  </label>
                </div>
              </>
            )}
            {uploadError && <p className={styles.error}>{uploadError}</p>}
            <div className={styles.formActions}>
              <button
                className={styles.btnPrimary}
                onClick={() => void handleCommit()}
                disabled={committing || !preview || preview.valid === 0}
              >
                {committing ? 'Importing…' : `Import ${preview?.valid ?? 0} Competitors`}
              </button>
              <button
                className={styles.btnSecondary}
                onClick={() => { setStep(1); setPreview(null); setUploadError(''); }}
              >
                Back
              </button>
              <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
