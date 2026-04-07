import { useState, useEffect } from 'react';
import type { Competitor, CompetitorListResponse, House } from '@sportsadmin/shared';
import { useApi, apiRequest } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useCarnival } from '../context/CarnivalContext';
import ImportPanel from './ImportPanel';
import styles from './Competitors.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const PER_PAGE = 25;

interface CompetitorForm {
  givenName: string;
  surname: string;
  sex: 'M' | 'F' | '';
  age: string;
  dob: string;
  houseId: string;
  include: boolean;
  externalId: string;
  comments: string;
}

const emptyForm: CompetitorForm = {
  givenName: '', surname: '', sex: '', age: '', dob: '',
  houseId: '', include: true, externalId: '', comments: '',
};

// ─── Include toggle (defined at module level to avoid re-mounting on parent renders) ──

interface IncludeToggleProps {
  checked: boolean;
  onChange: (v: boolean) => Promise<void>;
}

function IncludeToggle({ checked, onChange }: IncludeToggleProps) {
  const [busy, setBusy] = useState(false);
  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    setBusy(true);
    try { await onChange(e.target.checked); } finally { setBusy(false); }
  }
  return <input type="checkbox" checked={checked} onChange={handle} disabled={busy} />;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Competitors() {
  const { token } = useAuth();
  const { activeCarnival } = useCarnival();
  const cid = activeCarnival?.id;

  // ── Filter / search state ──
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sexFilter, setSexFilter] = useState('');
  const [houseFilter, setHouseFilter] = useState('');
  const [includeOnly, setIncludeOnly] = useState(false);
  const [page, setPage] = useState(1);

  // ── Form state ──
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Competitor | null>(null);
  const [form, setForm] = useState<CompetitorForm>(emptyForm);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Selection ──
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // ── Import panel ──
  const [showImport, setShowImport] = useState(false);

  // ── Debounce search ──
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Reset page when filters change ──
  useEffect(() => { setPage(1); }, [sexFilter, houseFilter, includeOnly]);

  // ── Build list URL ──
  const listUrl = cid
    ? (() => {
        const params = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) });
        if (search) params.set('search', search);
        if (sexFilter) params.set('sex', sexFilter);
        if (houseFilter) params.set('houseId', houseFilter);
        if (includeOnly) params.set('includeOnly', 'true');
        return `${API}/carnivals/${cid}/competitors?${params.toString()}`;
      })()
    : null;

  const { data: listData, loading, error, refetch } = useApi<CompetitorListResponse>(listUrl);
  const { data: houses } = useApi<House[]>(cid ? `${API}/carnivals/${cid}/houses` : null);

  // ── Reset selection when URL changes ──
  useEffect(() => { setSelected(new Set()); }, [listUrl]);

  const competitors = listData?.data ?? [];
  const totalPages = listData ? Math.ceil(listData.pagination.total / PER_PAGE) : 1;

  // ── Form helpers ──
  function calcAge(dob: string): number | null {
    if (!dob) return null;
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }

  function handleFormChange(field: keyof CompetitorForm, value: string | boolean) {
    setForm((prev) => {
      const next = { ...prev, [field]: value } as CompetitorForm;
      if (field === 'dob' && typeof value === 'string' && value) {
        const age = calcAge(value);
        if (age !== null) next.age = String(age);
      }
      return next;
    });
  }

  function openCreate() {
    setEditTarget(null);
    setForm(emptyForm);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(c: Competitor) {
    setEditTarget(c);
    setForm({
      givenName: c.givenName,
      surname: c.surname,
      sex: c.sex,
      age: String(c.age),
      dob: c.dob ?? '',
      houseId: String(c.houseId),
      include: c.include,
      externalId: c.externalId ?? '',
      comments: c.comments ?? '',
    });
    setFormError('');
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.givenName.trim()) { setFormError('Given name is required.'); return; }
    if (!form.surname.trim()) { setFormError('Surname is required.'); return; }
    if (!form.sex) { setFormError('Sex is required.'); return; }
    if (!form.houseId) { setFormError('House is required.'); return; }
    if (!form.age && !form.dob) { setFormError('Age or date of birth is required.'); return; }

    setSubmitting(true);
    setFormError('');
    const payload = {
      givenName: form.givenName.trim(),
      surname: form.surname.trim(),
      sex: form.sex as 'M' | 'F',
      age: form.age ? parseInt(form.age, 10) : undefined,
      dob: form.dob || undefined,
      houseId: parseInt(form.houseId, 10),
      include: form.include,
      externalId: form.externalId.trim() || undefined,
      comments: form.comments.trim() || undefined,
    };
    try {
      if (editTarget) {
        await apiRequest(`${API}/carnivals/${cid}/competitors/${editTarget.id}`, 'PUT', token, payload);
      } else {
        await apiRequest(`${API}/carnivals/${cid}/competitors`, 'POST', token, payload);
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

  async function handleDelete(c: Competitor) {
    const msg = c.eventCount > 0
      ? `"${c.fullName}" has ${c.eventCount} event entr${c.eventCount === 1 ? 'y' : 'ies'}. Delete anyway?`
      : `Delete "${c.fullName}"?`;
    if (!window.confirm(msg)) return;
    try {
      await apiRequest(`${API}/carnivals/${cid}/competitors/${c.id}`, 'DELETE', token);
      refetch();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === competitors.length && competitors.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(competitors.map((c) => c.id)));
    }
  }

  async function bulkSetInclude(include: boolean) {
    try {
      await apiRequest(`${API}/carnivals/${cid}/competitors/bulk-include`, 'POST', token, {
        ids: Array.from(selected), include,
      });
      setSelected(new Set());
      refetch();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function bulkDelete() {
    if (!window.confirm(`Delete ${selected.size} competitor(s)?`)) return;
    try {
      await apiRequest(`${API}/carnivals/${cid}/competitors/bulk`, 'DELETE', token, {
        ids: Array.from(selected),
      });
      setSelected(new Set());
      refetch();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleRollOver() {
    if (!window.confirm('Roll over competitors to the next carnival? This copies all competitors forward.')) return;
    try {
      await apiRequest(`${API}/carnivals/${cid}/rollover`, 'POST', token);
      alert('Roll over complete.');
      refetch();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleRollBack() {
    if (!window.confirm("Roll back competitors? This removes this carnival's competitors and restores the previous state.")) return;
    try {
      await apiRequest(`${API}/carnivals/${cid}/rollback`, 'POST', token);
      alert('Roll back complete.');
      refetch();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  // ── No carnival guard ──
  if (!cid) {
    return (
      <div className={styles.container}>
        <p className={styles.notice}>Select an active carnival to manage competitors.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {showImport && (
        <ImportPanel
          carnivalId={cid}
          token={token}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); refetch(); }}
        />
      )}

      <header className={styles.header}>
        <h1>Competitors — {activeCarnival.name}</h1>
        <div className={styles.headerActions}>
          <button className={styles.btnSecondary} onClick={() => setShowImport(true)}>⬆ Import CSV</button>
          <button className={styles.btnSecondary} onClick={() => void handleRollOver()}>Roll Over</button>
          <button className={styles.btnSecondary} onClick={() => void handleRollBack()}>Roll Back</button>
          <button className={styles.btnPrimary} onClick={openCreate}>+ Add Competitor</button>
        </div>
      </header>

      {/* ── Add / Edit form ── */}
      {showForm && (
        <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
          <h3 className={styles.formTitle}>{editTarget ? 'Edit Competitor' : 'Add Competitor'}</h3>
          <div className={styles.formGrid}>
            <label className={styles.fieldLabel}>
              Given Name *
              <input
                className={styles.input}
                value={form.givenName}
                onChange={(e) => handleFormChange('givenName', e.target.value)}
                placeholder="Given name"
              />
            </label>
            <label className={styles.fieldLabel}>
              Surname *
              <input
                className={styles.input}
                value={form.surname}
                onChange={(e) => handleFormChange('surname', e.target.value)}
                placeholder="Surname"
              />
            </label>
            <label className={styles.fieldLabel}>
              Sex *
              <select
                className={styles.input}
                value={form.sex}
                onChange={(e) => handleFormChange('sex', e.target.value)}
              >
                <option value="">Select…</option>
                <option value="M">Male (M)</option>
                <option value="F">Female (F)</option>
              </select>
            </label>
            <label className={styles.fieldLabel}>
              House *
              <select
                className={styles.input}
                value={form.houseId}
                onChange={(e) => handleFormChange('houseId', e.target.value)}
              >
                <option value="">Select house…</option>
                {(houses ?? []).map((h) => (
                  <option key={h.id} value={h.id}>{h.code} — {h.name}</option>
                ))}
              </select>
            </label>
            <label className={styles.fieldLabel}>
              Age
              <input
                className={styles.input}
                type="number"
                min={1}
                max={100}
                value={form.age}
                onChange={(e) => handleFormChange('age', e.target.value)}
                placeholder="Age"
              />
            </label>
            <label className={styles.fieldLabel}>
              Date of Birth
              <input
                className={styles.input}
                type="date"
                value={form.dob}
                onChange={(e) => handleFormChange('dob', e.target.value)}
              />
            </label>
            <label className={styles.fieldLabel}>
              External ID
              <input
                className={styles.input}
                value={form.externalId}
                onChange={(e) => handleFormChange('externalId', e.target.value)}
                placeholder="Optional"
              />
            </label>
            <label className={styles.fieldLabel}>
              Comments
              <input
                className={styles.input}
                value={form.comments}
                onChange={(e) => handleFormChange('comments', e.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={form.include}
              onChange={(e) => handleFormChange('include', e.target.checked)}
            />
            Include in events
          </label>
          {formError && <p className={styles.formError}>{formError}</p>}
          <div className={styles.formActions}>
            <button type="submit" className={styles.btnPrimary} disabled={submitting}>
              {submitting ? 'Saving…' : editTarget ? 'Update' : 'Create'}
            </button>
            <button type="button" className={styles.btnSecondary} onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search by name…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select className={styles.filterSelect} value={sexFilter} onChange={(e) => setSexFilter(e.target.value)}>
          <option value="">All sexes</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </select>
        <select className={styles.filterSelect} value={houseFilter} onChange={(e) => setHouseFilter(e.target.value)}>
          <option value="">All houses</option>
          {(houses ?? []).map((h) => (
            <option key={h.id} value={h.id}>{h.code} — {h.name}</option>
          ))}
        </select>
        <label className={styles.checkLabel}>
          <input type="checkbox" checked={includeOnly} onChange={(e) => setIncludeOnly(e.target.checked)} />
          Include only
        </label>
      </div>

      {/* ── Bulk actions bar ── */}
      {selected.size > 0 && (
        <div className={styles.bulkBar}>
          <span className={styles.bulkCount}>{selected.size} selected</span>
          <button className={styles.btnSmall} onClick={() => void bulkSetInclude(true)}>Set Include ON</button>
          <button className={styles.btnSmall} onClick={() => void bulkSetInclude(false)}>Set Include OFF</button>
          <button className={`${styles.btnSmall} ${styles.danger}`} onClick={() => void bulkDelete()}>
            Delete Selected
          </button>
          <button className={styles.btnSmallSecondary} onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {loading && <p className={styles.status}>Loading…</p>}
      {error && <p className={styles.errorMsg}>{error}</p>}
      {!loading && !error && competitors.length === 0 && (
        <p className={styles.empty}>No competitors found.</p>
      )}

      {competitors.length > 0 && (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={selected.size === competitors.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </th>
                <th>Full Name</th>
                <th>Sex</th>
                <th>Age</th>
                <th>House</th>
                <th className={styles.right}>Points</th>
                <th className={styles.right}>Events</th>
                <th>Include</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {competitors.map((c) => (
                <tr key={c.id} className={!c.include ? styles.excluded : ''}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                      aria-label={`Select ${c.fullName}`}
                    />
                  </td>
                  <td>{c.fullName}</td>
                  <td>{c.sex}</td>
                  <td>{c.age}</td>
                  <td><code>{c.houseCode}</code> {c.houseName}</td>
                  <td className={styles.right}>{c.totalPoints}</td>
                  <td className={styles.right}>{c.eventCount}</td>
                  <td>
                    <IncludeToggle
                      checked={c.include}
                      onChange={async (val) => {
                        await apiRequest(
                          `${API}/carnivals/${cid}/competitors/${c.id}`,
                          'PATCH', token, { include: val },
                        );
                        refetch();
                      }}
                    />
                  </td>
                  <td className={styles.actions}>
                    <button className={styles.btnLink} onClick={() => openEdit(c)}>Edit</button>
                    <button
                      className={`${styles.btnLink} ${styles.danger}`}
                      onClick={() => void handleDelete(c)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                className={styles.btnSecondary}
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ‹ Prev
              </button>
              <span className={styles.pageInfo}>
                Page {page} of {totalPages} ({listData?.pagination.total ?? 0} total)
              </span>
              <button
                className={styles.btnSecondary}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
