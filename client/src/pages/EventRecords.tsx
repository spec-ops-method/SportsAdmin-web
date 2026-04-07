import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { EventRecord, EventDivision } from '@sportsadmin/shared';
import { useApi, apiRequest } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useCarnival } from '../context/CarnivalContext';
import Toast from '../components/Toast';
import styles from './EventRecords.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

interface ToastState { message: string; type: 'success' | 'error' | 'info'; }

export default function EventRecords() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { activeCarnival } = useCarnival();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [surname, setSurname] = useState('');
  const [givenName, setGivenName] = useState('');
  const [houseCode, setHouseCode] = useState('');
  const [date, setDate] = useState('');
  const [result, setResult] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const showToast = (message: string, type: ToastState['type']) => setToast({ message, type });

  const cid = activeCarnival?.id;

  const { data: division, loading: divLoading, error: divError } = useApi<EventDivision>(
    cid && id ? `${API}/carnivals/${cid}/event-types/divisions/${id}` : null,
  );

  const {
    data: records,
    loading: recLoading,
    error: recError,
    refetch: refetchRecords,
  } = useApi<EventRecord[]>(cid && id ? `${API}/carnivals/${cid}/events/${id}/records` : null);

  const currentRecord = records?.find((r) => r.isCurrent);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!surname.trim()) { setFormError('Surname is required.'); return; }
    if (!givenName.trim()) { setFormError('Given name is required.'); return; }
    if (!date.trim()) { setFormError('Date is required.'); return; }
    if (!result.trim()) { setFormError('Result is required.'); return; }
    setSubmitting(true);
    try {
      await apiRequest(
        `${API}/carnivals/${cid}/events/${id}/records`,
        'POST',
        token,
        { surname: surname.trim(), givenName: givenName.trim(), houseCode: houseCode.trim() || null, date, result: result.trim() },
      );
      setSurname(''); setGivenName(''); setHouseCode(''); setDate(''); setResult('');
      setShowForm(false);
      refetchRecords();
      showToast('Record added', 'success');
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(recId: number) {
    if (!window.confirm('Delete this record entry?')) return;
    try {
      await apiRequest(`${API}/carnivals/${cid}/events/${id}/records/${recId}`, 'DELETE', token);
      refetchRecords();
      showToast('Record deleted', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }

  if (!activeCarnival) {
    return (
      <div className={styles.container}>
        <p className={styles.notice}>Select an active carnival to view records.</p>
      </div>
    );
  }

  const loading = divLoading || recLoading;
  const error = divError || recError;

  return (
    <div className={styles.container}>
      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}

      <button className={styles.backLink} onClick={() => navigate(-1)}>
        ← Back
      </button>

      {loading && <p className={styles.status}>Loading…</p>}
      {error && <p className={styles.errorMsg}>{error}</p>}

      {division && (
        <div className={styles.header}>
          <h1 className={styles.title}>
            Records — {division.sex} {division.age}
          </h1>
        </div>
      )}

      {/* ── Current record ── */}
      {currentRecord && (
        <div className={styles.currentRecord}>
          <div className={styles.recordBadge}>🏆 Current Record</div>
          <p className={styles.recordResult}>{currentRecord.result}</p>
          <p className={styles.recordHolder}>
            {currentRecord.givenName} {currentRecord.surname}
            {currentRecord.houseCode && <span> · {currentRecord.houseCode}</span>}
          </p>
          <p className={styles.recordDate}>{currentRecord.date}</p>
        </div>
      )}

      {!currentRecord && records && records.length === 0 && (
        <p className={styles.noRecord}>No record set for this event.</p>
      )}

      {/* ── History table ── */}
      {records && records.length > 0 && (
        <div className={styles.section}>
          <h2>Record History</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Competitor</th>
                <th>House</th>
                <th>Result</th>
                <th>Current?</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {records.map((rec) => (
                <tr key={rec.id} className={rec.isCurrent ? styles.currentRow : ''}>
                  <td>{rec.date}</td>
                  <td>{rec.givenName} {rec.surname}</td>
                  <td><code>{rec.houseCode ?? '—'}</code></td>
                  <td className={styles.resultCell}>{rec.result}</td>
                  <td>
                    {rec.isCurrent && (
                      <span className={styles.currentBadge}>✓ Current</span>
                    )}
                  </td>
                  <td>
                    <button
                      className={styles.btnLinkDanger}
                      onClick={() => void handleDelete(rec.id)}
                      title="Delete record"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add record ── */}
      <div className={styles.section}>
        <button className={styles.btnSecondary} onClick={() => setShowForm((x) => !x)}>
          {showForm ? 'Cancel' : '+ Add Record'}
        </button>

        {showForm && (
          <form className={styles.addForm} onSubmit={(e) => void handleAdd(e)}>
            <div className={styles.formGrid}>
              <label className={styles.fieldLabel}>
                Surname *
                <input className={styles.input} value={surname} onChange={(e) => setSurname(e.target.value)} />
              </label>
              <label className={styles.fieldLabel}>
                Given Name *
                <input className={styles.input} value={givenName} onChange={(e) => setGivenName(e.target.value)} />
              </label>
              <label className={styles.fieldLabel}>
                House Code
                <input className={styles.input} value={houseCode} onChange={(e) => setHouseCode(e.target.value)} maxLength={10} />
              </label>
              <label className={styles.fieldLabel}>
                Date *
                <input className={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className={styles.fieldLabel}>
                Result *
                <input className={styles.input} value={result} onChange={(e) => setResult(e.target.value)} placeholder="e.g. 12.34" />
              </label>
            </div>
            {formError && <p className={styles.formError}>{formError}</p>}
            <button className={styles.btnPrimary} type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Add Record'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
