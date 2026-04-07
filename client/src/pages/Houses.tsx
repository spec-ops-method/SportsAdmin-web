import { useState, useEffect, useRef } from 'react';
import { House } from '@sportsadmin/shared';
import { useApi, apiRequest } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useCarnival } from '../context/CarnivalContext';
import styles from './Houses.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

function FlagToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    setBusy(true);
    try {
      await onChange(e.target.checked);
    } finally {
      setBusy(false);
    }
  }
  return <input type="checkbox" checked={checked} onChange={handle} disabled={busy} title="Flag — include in report queries" />;
}

export default function Houses() {
  const { token } = useAuth();
  const { activeCarnival } = useCarnival();
  const cid = activeCarnival?.id;

  const { data: houses, loading, error, refetch } = useApi<House[]>(
    cid ? `${API}/carnivals/${cid}/houses` : null,
  );

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<House | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showForm) codeRef.current?.focus();
  }, [showForm]);

  // Pre-fill when editing
  useEffect(() => {
    if (editTarget) {
      if (codeRef.current) codeRef.current.value = editTarget.code;
      if (nameRef.current) nameRef.current.value = editTarget.name;
    }
  }, [editTarget]);

  function openCreate() {
    setEditTarget(null);
    if (codeRef.current) codeRef.current.value = '';
    if (nameRef.current) nameRef.current.value = '';
    setShowForm(true);
    setFormError('');
  }

  function openEdit(h: House) {
    setEditTarget(h);
    setShowForm(true);
    setFormError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = codeRef.current?.value.trim();
    const name = nameRef.current?.value.trim();
    if (!code || !name) return;
    setSubmitting(true);
    setFormError('');
    try {
      if (editTarget) {
        await apiRequest(`${API}/carnivals/${cid}/houses/${editTarget.id}`, 'PUT', token, {
          code, name,
        });
      } else {
        await apiRequest(`${API}/carnivals/${cid}/houses`, 'POST', token, { code, name });
      }
      setShowForm(false);
      setEditTarget(null);
      refetch();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(h: House) {
    if (!window.confirm(`Delete house "${h.name}"?`)) return;
    try {
      await apiRequest(`${API}/carnivals/${cid}/houses/${h.id}?confirm=true`, 'DELETE', token);
      refetch();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  if (!cid) {
    return (
      <div className={styles.container}>
        <p className={styles.notice}>Select an active carnival to manage houses.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Houses — {activeCarnival.name}</h1>
        <button className={styles.btnPrimary} onClick={openCreate}>
          + Add House
        </button>
      </header>

      {showForm && (
        <form className={styles.form} onSubmit={handleSubmit}>
          <input ref={codeRef} className={styles.input} placeholder="Code (e.g. RED)" required />
          <input ref={nameRef} className={styles.input} placeholder="Full name" required />
          {formError && <p className={styles.formError}>{formError}</p>}
          <div className={styles.formActions}>
            <button type="submit" className={styles.btnPrimary} disabled={submitting}>
              {submitting ? 'Saving…' : editTarget ? 'Update' : 'Create'}
            </button>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && <p className={styles.status}>Loading…</p>}
      {error && <p className={styles.errorMsg}>{error}</p>}

      {houses && houses.length === 0 && (
        <p className={styles.empty}>No houses yet.</p>
      )}

      {houses && houses.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th className={styles.right}>Points</th>
              <th>Flag</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {houses.map((h) => (
              <tr key={h.id}>
                <td><code>{h.code}</code></td>
                <td>{h.name}</td>
                <td className={styles.right}>{h.totalPoints ?? 0}</td>
                <td>
                  <FlagToggle
                    checked={h.flag}
                    onChange={async (val) => {
                      await apiRequest(
                        `${API}/carnivals/${cid}/houses/${h.id}`,
                        'PUT',
                        token,
                        { flag: val },
                      );
                      refetch();
                    }}
                  />
                </td>
                <td className={styles.actions}>
                  <button className={styles.btnLink} onClick={() => openEdit(h)}>Edit</button>
                  <button className={`${styles.btnLink} ${styles.danger}`} onClick={() => void handleDelete(h)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
