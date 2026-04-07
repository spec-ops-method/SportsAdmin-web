import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CarnivalSettings as CarnivalSettingsType } from '@sportsadmin/shared';
import { useApi, apiRequest } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import styles from './CarnivalSettings.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export default function CarnivalSettings() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const { data, loading, error, refetch } = useApi<CarnivalSettingsType>(
    id ? `${API}/carnivals/${id}/settings` : null,
  );

  const [form, setForm] = useState<Partial<CarnivalSettingsType>>({});
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  function update(field: keyof CarnivalSettingsType, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSaveError('');
    setSaved(false);
    try {
      await apiRequest(`${API}/carnivals/${id}/settings`, 'PUT', token, form);
      setSaved(true);
      refetch();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className={styles.status}>Loading…</p>;
  if (error) return <p className={styles.errorMsg}>{error}</p>;
  if (!data) return null;

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Carnival Settings</h1>
      <form className={styles.form} onSubmit={handleSubmit}>

        <fieldset className={styles.fieldset}>
          <legend>General</legend>
          <label className={styles.field}>
            <span>Carnival Title</span>
            <input
              className={styles.input}
              value={form.title ?? ''}
              onChange={(e) => update('title', e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>Footer Text</span>
            <input
              className={styles.input}
              value={form.footer ?? ''}
              onChange={(e) => update('footer', e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>Open Age (maximum age treated as "open")</span>
            <input
              type="number"
              className={styles.input}
              style={{ maxWidth: 80 }}
              value={form.openAge ?? ''}
              onChange={(e) => update('openAge', parseInt(e.target.value, 10) || null)}
            />
          </label>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>Access</legend>
          <label className={styles.checkField}>
            <input
              type="checkbox"
              checked={form.publicAccess ?? false}
              onChange={(e) => update('publicAccess', e.target.checked)}
            />
            <span>Allow public access to results (no login required)</span>
          </label>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>Meet Manager Integration</legend>
          <label className={styles.field}>
            <span>Meet Manager Team Name</span>
            <input
              className={styles.input}
              value={form.meetManagerTeam ?? ''}
              onChange={(e) => update('meetManagerTeam', e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>Meet Manager Code</span>
            <input
              className={styles.input}
              value={form.meetManagerCode ?? ''}
              onChange={(e) => update('meetManagerCode', e.target.value)}
            />
          </label>
        </fieldset>

        {saveError && <p className={styles.errorMsg}>{saveError}</p>}
        {saved && <p className={styles.successMsg}>Settings saved.</p>}

        <button type="submit" className={styles.btnPrimary} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
