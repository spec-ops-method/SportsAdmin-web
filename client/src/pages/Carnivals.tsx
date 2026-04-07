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

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Carnivals</h1>
        <button className={styles.btnPrimary} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : '+ New Carnival'}
        </button>
      </header>

      {showForm && (
        <form className={styles.form} onSubmit={handleCreate}>
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
                className={`${styles.btnLink} ${styles.danger}`}
                onClick={() => handleDelete(c)}
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
