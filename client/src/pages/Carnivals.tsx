import { useState, useEffect, useRef } from 'react';
import { CarnivalSummary } from '@sportsadmin/shared';
import { useApi, apiRequest } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useCarnival } from '../context/CarnivalContext';
import styles from './Carnivals.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export default function Carnivals() {
  const { token } = useAuth();
  const { activeCarnival, setActiveCarnival } = useCarnival();
  const { data: carnivals, loading, error, refetch } = useApi<CarnivalSummary[]>(
    `${API}/carnivals`,
  );

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{ version: string; carnivalName: string; counts: Record<string, number> } | null>(null);
  const [importName, setImportName] = useState('');
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showForm) nameRef.current?.focus();
  }, [showForm]);

  // Restore last active carnival from the list once loaded
  useEffect(() => {
    if (!carnivals || activeCarnival) return;
    const stored = localStorage.getItem('sa_active_carnival_id');
    if (stored) {
      const found = carnivals.find((c) => c.id === parseInt(stored, 10));
      if (found) setActiveCarnival(found);
    }
  }, [carnivals, activeCarnival, setActiveCarnival]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = nameRef.current?.value.trim();
    if (!name) return;
    setSubmitting(true);
    setFormError('');
    try {
      await apiRequest(`${API}/carnivals`, 'POST', token, { name });
      setShowForm(false);
      if (nameRef.current) nameRef.current.value = '';
      refetch();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(c: CarnivalSummary) {
    if (!window.confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    try {
      await apiRequest(`${API}/carnivals/${c.id}?confirm=true`, 'DELETE', token);
      if (activeCarnival?.id === c.id) setActiveCarnival(null);
      refetch();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function handleExport(c: CarnivalSummary) {
    // Trigger file download via hidden link
    const url = `${API}/carnivals/${c.id}/export`;
    const a = document.createElement('a');
    a.href = url;
    if (token) {
      // Use fetch + blob to carry auth header
      void (async () => {
        try {
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) throw new Error(await res.text());
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          const disposition = res.headers.get('Content-Disposition') ?? '';
          const match = disposition.match(/filename="([^"]+)"/);
          link.download = match ? match[1] : `carnival-${c.id}.json`;
          link.click();
          URL.revokeObjectURL(blobUrl);
        } catch (err) {
          alert((err as Error).message);
        }
      })();
    } else {
      a.click();
    }
  }

  async function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImportFile(file);
    setImportPreview(null);
    setImportError('');
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API}/carnivals/import/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Preview failed');
      setImportPreview(data);
      setImportName(data.carnivalName);
    } catch (err) {
      setImportError((err as Error).message);
    }
  }

  async function handleImportConfirm() {
    if (!importFile) return;
    setImporting(true);
    setImportError('');
    const formData = new FormData();
    formData.append('file', importFile);
    if (importName) formData.append('name', importName);
    try {
      const res = await fetch(`${API}/carnivals/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Import failed');
      setImportFile(null);
      setImportPreview(null);
      setImportName('');
      if (importFileRef.current) importFileRef.current.value = '';
      refetch();
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Carnivals</h1>
        <div className={styles.headerActions}>
          <button className={styles.btnSecondary} onClick={() => importFileRef.current?.click()}>
            Import Carnival
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(e) => void handleImportFileChange(e)}
          />
          <button className={styles.btnPrimary} onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : '+ New Carnival'}
          </button>
        </div>
      </header>

      {importPreview && (
        <div className={styles.importPanel}>
          <h3>Import Preview — {importPreview.carnivalName}</h3>
          <ul className={styles.importCounts}>
            {Object.entries(importPreview.counts).map(([k, v]) => (
              <li key={k}><strong>{v}</strong> {k}</li>
            ))}
          </ul>
          <label className={styles.fieldLabel}>
            Carnival name
            <input
              className={styles.input}
              value={importName}
              onChange={(e) => setImportName(e.target.value)}
            />
          </label>
          {importError && <p className={styles.formError}>{importError}</p>}
          <div className={styles.formActions}>
            <button className={styles.btnPrimary} onClick={() => void handleImportConfirm()} disabled={importing}>
              {importing ? 'Importing…' : 'Confirm Import'}
            </button>
            <button className={styles.btnSecondary} onClick={() => { setImportPreview(null); setImportFile(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!importPreview && importError && <p className={styles.formError}>{importError}</p>}

      {showForm && (
        <form className={styles.form} onSubmit={(e) => void handleCreate(e)}>
          <input ref={nameRef} className={styles.input} placeholder="Carnival name" required />
          {formError && <p className={styles.formError}>{formError}</p>}
          <button type="submit" className={styles.btnPrimary} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}

      {loading && <p className={styles.status}>Loading…</p>}
      {error && <p className={styles.errorMsg}>{error}</p>}

      {carnivals && carnivals.length === 0 && (
        <p className={styles.empty}>No carnivals yet — create one above.</p>
      )}

      <ul className={styles.list}>
        {carnivals?.map((c) => (
          <li
            key={c.id}
            className={`${styles.item} ${activeCarnival?.id === c.id ? styles.active : ''}`}
          >
            <button
              className={styles.itemName}
              onClick={() => setActiveCarnival(activeCarnival?.id === c.id ? null : c)}
            >
              {c.name}
              {activeCarnival?.id === c.id && <span className={styles.activeBadge}> ✓ Active</span>}
            </button>
            <span className={styles.meta}>
              {c.houseCount} houses · {c.competitorCount} competitors
            </span>
            <div className={styles.actions}>
              <button
                className={styles.btnLink}
                onClick={() => setActiveCarnival(c)}
              >
                Open
              </button>
              <button
                className={styles.btnLink}
                onClick={() => handleExport(c)}
              >
                Export
              </button>
              <button
                className={`${styles.btnLink} ${styles.danger}`}
                onClick={() => void handleDelete(c)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
