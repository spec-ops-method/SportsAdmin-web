import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { EventType } from '@sportsadmin/shared';
import { useApi, apiRequest } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useCarnival } from '../context/CarnivalContext';
import styles from './EventTypes.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const UNITS_OPTIONS = ['Seconds', 'Minutes', 'Hours', 'Meters', 'Kilometers', 'Points'];

interface EventTypeForm {
  description: string;
  units: string;
  laneCount: string;
  entrantCount: string;
}

const emptyForm: EventTypeForm = {
  description: '',
  units: 'Seconds',
  laneCount: '8',
  entrantCount: '1',
};

function IncludeToggle({
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
  return <input type="checkbox" checked={checked} onChange={handle} disabled={busy} />;
}

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

export default function EventTypes() {
  const { token } = useAuth();
  const { activeCarnival } = useCarnival();
  const navigate = useNavigate();
  const cid = activeCarnival?.id;

  const { data: eventTypes, loading, error, refetch } = useApi<EventType[]>(
    cid ? `${API}/carnivals/${cid}/event-types` : null,
  );

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventTypeForm>(emptyForm);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleFormChange(field: keyof EventTypeForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function openCreate() {
    setForm(emptyForm);
    setFormError('');
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description.trim()) {
      setFormError('Description is required.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await apiRequest(`${API}/carnivals/${cid}/event-types`, 'POST', token, {
        description: form.description.trim(),
        units: form.units,
        laneCount: parseInt(form.laneCount, 10) || 0,
        entrantCount: parseInt(form.entrantCount, 10) || 1,
      });
      setShowForm(false);
      refetch();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(et: EventType) {
    if (!window.confirm(`Delete event type "${et.description}"? This cannot be undone.`)) return;
    try {
      await apiRequest(
        `${API}/carnivals/${cid}/event-types/${et.id}?confirm=true`,
        'DELETE',
        token,
      );
      refetch();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  if (!cid) {
    return (
      <div className={styles.container}>
        <p className={styles.notice}>Select an active carnival to manage event types.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Event Types — {activeCarnival.name}</h1>
        <button className={styles.btnPrimary} onClick={openCreate}>
          + New Event Type
        </button>
      </header>

      {showForm && (
        <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
          <div className={styles.formGrid}>
            <label className={styles.fieldLabel}>
              Description *
              <input
                className={styles.input}
                value={form.description}
                onChange={(e) => handleFormChange('description', e.target.value)}
                placeholder="e.g. 100m Sprint"
                autoFocus
              />
            </label>
            <label className={styles.fieldLabel}>
              Units
              <select
                className={styles.input}
                value={form.units}
                onChange={(e) => handleFormChange('units', e.target.value)}
              >
                {UNITS_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.fieldLabel}>
              Lane Count (0 = unlimited)
              <input
                className={styles.input}
                type="number"
                min={0}
                value={form.laneCount}
                onChange={(e) => handleFormChange('laneCount', e.target.value)}
              />
            </label>
            <label className={styles.fieldLabel}>
              Entrant Count
              <input
                className={styles.input}
                type="number"
                min={1}
                value={form.entrantCount}
                onChange={(e) => handleFormChange('entrantCount', e.target.value)}
              />
            </label>
          </div>
          {formError && <p className={styles.formError}>{formError}</p>}
          <div className={styles.formActions}>
            <button type="submit" className={styles.btnPrimary} disabled={submitting}>
              {submitting ? 'Saving…' : 'Create'}
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
      {!loading && !error && eventTypes && eventTypes.length === 0 && (
        <p className={styles.empty}>No event types yet. Create one to get started.</p>
      )}

      {eventTypes && eventTypes.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Description</th>
              <th>Units</th>
              <th>Lanes</th>
              <th className={styles.right}>Divisions</th>
              <th className={styles.right}>Heats</th>
              <th>Include</th>
              <th>Flag</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {eventTypes.map((et) => (
              <tr key={et.id}>
                <td>{et.description}</td>
                <td>{et.unitsDisplay}</td>
                <td>{et.laneCount === 0 ? '∞' : et.laneCount}</td>
                <td className={styles.right}>{et.divisionCount}</td>
                <td className={styles.right}>{et.heatCount}</td>
                <td>
                  <IncludeToggle
                    checked={et.include}
                    onChange={async (val) => {
                      await apiRequest(
                        `${API}/carnivals/${cid}/event-types/${et.id}`,
                        'PATCH',
                        token,
                        { include: val },
                      );
                      refetch();
                    }}
                  />
                </td>
                <td>
                  <FlagToggle
                    checked={et.flag}
                    onChange={async (val) => {
                      await apiRequest(
                        `${API}/carnivals/${cid}/event-types/${et.id}`,
                        'PATCH',
                        token,
                        { flag: val },
                      );
                      refetch();
                    }}
                  />
                </td>
                <td className={styles.actions}>
                  <button
                    className={styles.btnLink}
                    onClick={() => navigate(`/event-types/${et.id}`)}
                  >
                    Manage
                  </button>
                  <button
                    className={`${styles.btnLink} ${styles.danger}`}
                    onClick={() => void handleDelete(et)}
                  >
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
