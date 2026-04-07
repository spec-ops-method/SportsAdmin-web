import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { EventTypeDetail, EventDivision, FinalLevel, Heat } from '@sportsadmin/shared';
import { useApi, apiRequest } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useCarnival } from '../context/CarnivalContext';
import styles from './EventTypeDetail.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

type Tab = 'divisions' | 'final-levels' | 'heats' | 'lane-config';

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'active'
      ? styles.badgeActive
      : status === 'completed'
        ? styles.badgeCompleted
        : status === 'promoted'
          ? styles.badgePromoted
          : styles.badgeFuture;
  return <span className={cls}>{status}</span>;
}

// ─── Divisions tab ────────────────────────────────────────────────────────────

interface DivisionsTabProps {
  cid: number;
  etId: number;
  divisions: EventDivision[];
  token: string | null;
  onRefetch: () => void;
}

function DivisionsTab({ cid, etId, divisions, token, onRefetch }: DivisionsTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [sex, setSex] = useState('M');
  const [age, setAge] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!age.trim()) {
      setFormError('Age is required.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await apiRequest(`${API}/carnivals/${cid}/event-types/${etId}/divisions`, 'POST', token, {
        sex,
        age: age.trim(),
      });
      setSex('M');
      setAge('');
      setShowForm(false);
      onRefetch();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(div: EventDivision) {
    if (!window.confirm(`Delete division ${div.sex} ${div.age}?`)) return;
    try {
      await apiRequest(
        `${API}/carnivals/${cid}/event-types/${etId}/divisions/${div.id}?confirm=true`,
        'DELETE',
        token,
      );
      onRefetch();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div>
      <div className={styles.sectionHeader}>
        <h2>Divisions</h2>
        <button className={styles.btnPrimary} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Division'}
        </button>
      </div>

      {showForm && (
        <form className={styles.form} onSubmit={(e) => void handleAdd(e)}>
          <div className={styles.formRow}>
            <label className={styles.fieldLabel}>
              Sex
              <select
                className={styles.input}
                value={sex}
                onChange={(e) => setSex(e.target.value)}
              >
                <option value="M">M — Male</option>
                <option value="F">F — Female</option>
                <option value="-">- — Mixed</option>
              </select>
            </label>
            <label className={styles.fieldLabel}>
              Age *
              <input
                className={styles.input}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="e.g. 12, Open, U14"
                autoFocus
              />
            </label>
          </div>
          {formError && <p className={styles.formError}>{formError}</p>}
          <div className={styles.formActions}>
            <button type="submit" className={styles.btnPrimary} disabled={submitting}>
              {submitting ? 'Saving…' : 'Add'}
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

      {divisions.length === 0 && <p className={styles.empty}>No divisions yet.</p>}

      {divisions.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Sex</th>
              <th>Age</th>
              <th className={styles.right}>Heats</th>
              <th>Record</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {divisions.map((div) => (
              <tr key={div.id}>
                <td>{div.sex}</td>
                <td>{div.age}</td>
                <td className={styles.right}>{div.heatCount}</td>
                <td>{div.record ?? '—'}</td>
                <td className={styles.actions}>
                  <button
                    className={styles.btnLinkDanger}
                    onClick={() => void handleDelete(div)}
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

// ─── Final Levels tab ─────────────────────────────────────────────────────────

interface FinalLevelRow {
  finalLevel: number;
  label: string;
  numHeats: number;
  promotionType: 'NONE' | 'Smooth' | 'Staggered';
  promoteCount: number;
  effectsRecords: boolean;
  useTimes: boolean;
  pointScale: string;
}

function toRow(fl: FinalLevel): FinalLevelRow {
  return {
    finalLevel: fl.finalLevel,
    label: fl.label,
    numHeats: fl.numHeats,
    promotionType: fl.promotionType,
    promoteCount: fl.promoteCount,
    effectsRecords: fl.effectsRecords,
    useTimes: fl.useTimes,
    pointScale: fl.pointScale ?? '',
  };
}

interface FinalLevelsTabProps {
  cid: number;
  etId: number;
  finalLevels: FinalLevel[];
  token: string | null;
  onRefetch: () => void;
}

function FinalLevelsTab({ cid, etId, finalLevels, token, onRefetch }: FinalLevelsTabProps) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<FinalLevelRow[]>([]);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generateMsg, setGenerateMsg] = useState('');
  const [generating, setGenerating] = useState(false);

  function startEdit() {
    setRows(finalLevels.length > 0 ? finalLevels.map(toRow) : [defaultRow(0)]);
    setFormError('');
    setEditing(true);
  }

  function defaultRow(level: number): FinalLevelRow {
    return {
      finalLevel: level,
      label: level === 0 ? 'Final' : `Heat Round ${level}`,
      numHeats: 1,
      promotionType: 'NONE',
      promoteCount: 0,
      effectsRecords: level === 0,
      useTimes: true,
      pointScale: '',
    };
  }

  function addRow() {
    const maxLevel = rows.reduce((m, r) => Math.max(m, r.finalLevel), -1);
    setRows((prev) => [...prev, defaultRow(maxLevel + 1)]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, field: keyof FinalLevelRow, value: string | boolean | number) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const level0 = rows.find((r) => r.finalLevel === 0);
    if (level0 && level0.promotionType !== 'NONE') {
      setFormError('Level 0 (final) must have promotion type NONE.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await apiRequest(
        `${API}/carnivals/${cid}/event-types/${etId}/final-levels`,
        'PUT',
        token,
        rows.map((r) => ({ ...r, pointScale: r.pointScale || null })),
      );
      setEditing(false);
      onRefetch();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerate() {
    if (!window.confirm('Generate heats for all divisions? Existing heats may be replaced.')) return;
    setGenerating(true);
    setGenerateMsg('');
    try {
      const result = await apiRequest<{ heatsCreated: number }>(
        `${API}/carnivals/${cid}/event-types/${etId}/generate-heats`,
        'POST',
        token,
      );
      setGenerateMsg(`✓ ${result.heatsCreated} heat(s) generated.`);
      onRefetch();
    } catch (err) {
      setGenerateMsg(`Error: ${(err as Error).message}`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div className={styles.sectionHeader}>
        <h2>Final Levels</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={styles.btnSecondary}
            onClick={() => void handleGenerate()}
            disabled={generating}
          >
            {generating ? 'Generating…' : '⚡ Generate Heats'}
          </button>
          {!editing && (
            <button className={styles.btnPrimary} onClick={startEdit}>
              Edit Final Levels
            </button>
          )}
        </div>
      </div>

      {generateMsg && <p className={styles.infoMsg}>{generateMsg}</p>}

      {!editing && (
        <>
          {finalLevels.length === 0 && (
            <p className={styles.empty}>No final levels configured.</p>
          )}
          {finalLevels.length > 0 && (
            <table className={styles.finalLevelsTable}>
              <thead>
                <tr>
                  <th>Level</th>
                  <th>Label</th>
                  <th className={styles.right}>Heats</th>
                  <th>Promotion</th>
                  <th className={styles.right}>Promote #</th>
                  <th>Effects Records</th>
                  <th>Use Times</th>
                  <th>Point Scale</th>
                </tr>
              </thead>
              <tbody>
                {finalLevels.map((fl) => (
                  <tr key={fl.finalLevel}>
                    <td>{fl.finalLevel}</td>
                    <td>{fl.label}</td>
                    <td className={styles.right}>{fl.numHeats}</td>
                    <td>{fl.promotionType}</td>
                    <td className={styles.right}>{fl.promoteCount}</td>
                    <td>{fl.effectsRecords ? '✓' : '—'}</td>
                    <td>{fl.useTimes ? '✓' : '—'}</td>
                    <td>{fl.pointScale ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {editing && (
        <form onSubmit={(e) => void handleSave(e)}>
          <table className={styles.finalLevelsTable}>
            <thead>
              <tr>
                <th>Level</th>
                <th>Label</th>
                <th>Heats</th>
                <th>Promotion</th>
                <th>Promote #</th>
                <th>Records</th>
                <th>Times</th>
                <th>Point Scale</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  <td>
                    <input
                      className={styles.inputSmall}
                      type="number"
                      min={0}
                      value={row.finalLevel}
                      onChange={(e) =>
                        updateRow(idx, 'finalLevel', parseInt(e.target.value, 10))
                      }
                      style={{ width: 50 }}
                    />
                  </td>
                  <td>
                    <input
                      className={styles.inputSmall}
                      value={row.label}
                      onChange={(e) => updateRow(idx, 'label', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className={styles.inputSmall}
                      type="number"
                      min={1}
                      value={row.numHeats}
                      onChange={(e) =>
                        updateRow(idx, 'numHeats', parseInt(e.target.value, 10))
                      }
                      style={{ width: 55 }}
                    />
                  </td>
                  <td>
                    <select
                      className={styles.inputSmall}
                      value={row.promotionType}
                      onChange={(e) =>
                        updateRow(
                          idx,
                          'promotionType',
                          e.target.value as FinalLevelRow['promotionType'],
                        )
                      }
                    >
                      <option value="NONE">NONE</option>
                      <option value="Smooth">Smooth</option>
                      <option value="Staggered">Staggered</option>
                    </select>
                  </td>
                  <td>
                    <input
                      className={styles.inputSmall}
                      type="number"
                      min={0}
                      value={row.promoteCount}
                      onChange={(e) =>
                        updateRow(idx, 'promoteCount', parseInt(e.target.value, 10))
                      }
                      style={{ width: 55 }}
                    />
                  </td>
                  <td className={styles.center}>
                    <input
                      type="checkbox"
                      checked={row.effectsRecords}
                      onChange={(e) => updateRow(idx, 'effectsRecords', e.target.checked)}
                    />
                  </td>
                  <td className={styles.center}>
                    <input
                      type="checkbox"
                      checked={row.useTimes}
                      onChange={(e) => updateRow(idx, 'useTimes', e.target.checked)}
                    />
                  </td>
                  <td>
                    <input
                      className={styles.inputSmall}
                      value={row.pointScale}
                      onChange={(e) => updateRow(idx, 'pointScale', e.target.value)}
                      placeholder="e.g. 10,8,6…"
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.btnLinkDanger}
                      onClick={() => removeRow(idx)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className={styles.btnSecondary} onClick={addRow}>
            + Add Level
          </button>
          {formError && <p className={styles.formError}>{formError}</p>}
          <div className={styles.formActions}>
            <button type="submit" className={styles.btnPrimary} disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Heats tab ────────────────────────────────────────────────────────────────

interface HeatsTabProps {
  divisions: EventDivision[];
  heats: Heat[];
  onNavigate: (id: number) => void;
}

function HeatsTab({ divisions, heats, onNavigate }: HeatsTabProps) {
  if (heats.length === 0) {
    return <p className={styles.empty}>No heats yet. Generate heats in the Final Levels tab.</p>;
  }

  const divisionMap = new Map(divisions.map((d) => [d.id, d]));

  const grouped = new Map<number, Heat[]>();
  for (const heat of heats) {
    if (!grouped.has(heat.eventId)) grouped.set(heat.eventId, []);
    grouped.get(heat.eventId)!.push(heat);
  }

  return (
    <div>
      {[...grouped.entries()].map(([divId, divHeats]) => {
        const div = divisionMap.get(divId);
        const byLevel = new Map<number, Heat[]>();
        for (const h of divHeats) {
          if (!byLevel.has(h.finalLevel)) byLevel.set(h.finalLevel, []);
          byLevel.get(h.finalLevel)!.push(h);
        }
        return (
          <div key={divId} className={styles.heatsGroup}>
            <p className={styles.heatsGroupTitle}>
              {div ? `${div.sex} — ${div.age}` : `Division ${divId}`}
            </p>
            {[...byLevel.entries()].map(([level, levelHeats]) => (
              <div key={level} className={styles.heatLevelGroup}>
                <p className={styles.heatLevelTitle}>
                  {levelHeats[0]?.finalLevelLabel ?? `Level ${level}`}
                </p>
                <div className={styles.heatsGrid}>
                  {levelHeats.map((heat) => (
                    <div
                      key={heat.id}
                      className={styles.heatCard}
                      onClick={() => onNavigate(heat.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && onNavigate(heat.id)}
                    >
                      <span className={styles.heatCardTitle}>Heat {heat.heatNumber}</span>
                      <StatusBadge status={heat.status} />
                      <span className={styles.heatCardMeta}>
                        {heat.competitorCount} competitor{heat.competitorCount !== 1 ? 's' : ''}
                        {heat.eventNumber != null ? ` · #${heat.eventNumber}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── Lane Config tab ──────────────────────────────────────────────────────────

interface LaneConfigTabProps {
  cid: number;
  etId: number;
  laneCount: number;
  token: string | null;
}

function LaneConfigTab({ cid, etId, laneCount, token }: LaneConfigTabProps) {
  const { data: promotions, refetch: refetchPromo } = useApi<{ place: number; lane: number }[]>(
    `${API}/carnivals/${cid}/event-types/${etId}/lane-promotions`,
  );

  const defaultLanes = Array.from({ length: laneCount || 8 }, (_, i) => i + 1);
  const [laneList, setLaneList] = useState<number[]>([]);
  const [laneInput, setLaneInput] = useState('');
  const [promoRows, setPromoRows] = useState<{ place: number; lane: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setLaneList(defaultLanes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laneCount]);

  useEffect(() => {
    if (promotions) setPromoRows(promotions);
  }, [promotions]);

  function addLane() {
    const n = parseInt(laneInput, 10);
    if (!isNaN(n) && n > 0 && !laneList.includes(n)) {
      setLaneList((prev) => [...prev, n].sort((a, b) => a - b));
    }
    setLaneInput('');
  }

  function removeLane(lane: number) {
    setLaneList((prev) => prev.filter((l) => l !== lane));
  }

  function addPromoRow() {
    const maxPlace = promoRows.reduce((m, r) => Math.max(m, r.place), 0);
    setPromoRows((prev) => [...prev, { place: maxPlace + 1, lane: 1 }]);
  }

  function updatePromo(idx: number, field: 'place' | 'lane', value: number) {
    setPromoRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  function removePromo(idx: number) {
    setPromoRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSavePromo() {
    setSaving(true);
    setMsg('');
    try {
      await apiRequest(
        `${API}/carnivals/${cid}/event-types/${etId}/lane-promotions`,
        'PUT',
        token,
        promoRows,
      );
      setMsg('✓ Saved.');
      refetchPromo();
    } catch (err) {
      setMsg(`Error: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.laneGrid}>
      <div className={styles.laneSection}>
        <h3>Lane Template</h3>
        <div className={styles.laneList}>
          {laneList.map((l) => (
            <span key={l} className={styles.laneChip}>
              {l}
              <button
                className={styles.laneChipRemove}
                onClick={() => removeLane(l)}
                aria-label={`Remove lane ${l}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            className={styles.input}
            type="number"
            min={1}
            value={laneInput}
            onChange={(e) => setLaneInput(e.target.value)}
            placeholder="Lane #"
            style={{ width: 80 }}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLane())}
          />
          <button className={styles.btnSecondary} onClick={addLane}>
            Add
          </button>
        </div>
      </div>

      <div className={styles.laneSection}>
        <h3>Promotion Lane Allocation</h3>
        <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 0 }}>
          Place → Lane assignment when promoting competitors.
        </p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Place</th>
              <th>Lane</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {promoRows.map((row, idx) => (
              <tr key={idx}>
                <td>
                  <input
                    className={styles.inputSmall}
                    type="number"
                    min={1}
                    value={row.place}
                    onChange={(e) => updatePromo(idx, 'place', parseInt(e.target.value, 10))}
                    style={{ width: 60 }}
                  />
                </td>
                <td>
                  <input
                    className={styles.inputSmall}
                    type="number"
                    min={1}
                    value={row.lane}
                    onChange={(e) => updatePromo(idx, 'lane', parseInt(e.target.value, 10))}
                    style={{ width: 60 }}
                  />
                </td>
                <td>
                  <button
                    className={styles.btnLinkDanger}
                    onClick={() => removePromo(idx)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button className={styles.btnSecondary} onClick={addPromoRow}>
            + Add Row
          </button>
          <button
            className={styles.btnPrimary}
            onClick={() => void handleSavePromo()}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {msg && <p className={styles.infoMsg}>{msg}</p>}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EventTypeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { activeCarnival } = useCarnival();
  const cid = activeCarnival?.id;

  const [activeTab, setActiveTab] = useState<Tab>('divisions');

  const { data: et, loading, error, refetch } = useApi<EventTypeDetail>(
    cid && id ? `${API}/carnivals/${cid}/event-types/${id}` : null,
  );

  const { data: heats, refetch: refetchHeats } = useApi<Heat[]>(
    cid && id && activeTab === 'heats'
      ? `${API}/carnivals/${cid}/event-types/${id}/heats`
      : null,
  );

  function handleRefetch() {
    refetch();
    refetchHeats();
  }

  if (!cid) {
    return (
      <div className={styles.container}>
        <p className={styles.notice}>Select an active carnival first.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <p className={styles.status}>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <p className={styles.errorMsg}>{error}</p>
      </div>
    );
  }

  if (!et) return null;

  return (
    <div className={styles.container}>
      <button className={styles.backLink} onClick={() => navigate('/event-types')}>
        ← Event Types
      </button>

      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <h1>{et.description}</h1>
          <div className={styles.headerMeta}>
            <span>{et.unitsDisplay}</span>
            <span>{et.laneCount === 0 ? 'Unlimited lanes' : `${et.laneCount} lanes`}</span>
            <span>{et.divisionCount} division{et.divisionCount !== 1 ? 's' : ''}</span>
            <span>{et.heatCount} heat{et.heatCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </header>

      <div className={styles.tabs}>
        {(['divisions', 'final-levels', 'heats', 'lane-config'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'divisions'
              ? 'Divisions'
              : tab === 'final-levels'
                ? 'Final Levels'
                : tab === 'heats'
                  ? 'Heats'
                  : 'Lane Config'}
          </button>
        ))}
      </div>

      {activeTab === 'divisions' && (
        <DivisionsTab
          cid={cid}
          etId={et.id}
          divisions={et.divisions}
          token={token}
          onRefetch={handleRefetch}
        />
      )}

      {activeTab === 'final-levels' && (
        <FinalLevelsTab
          cid={cid}
          etId={et.id}
          finalLevels={et.finalLevels}
          token={token}
          onRefetch={handleRefetch}
        />
      )}

      {activeTab === 'heats' && (
        <HeatsTab
          divisions={et.divisions}
          heats={heats ?? []}
          onNavigate={(heatId) => navigate(`/heats/${heatId}`)}
        />
      )}

      {activeTab === 'lane-config' && (
        <LaneConfigTab cid={cid} etId={et.id} laneCount={et.laneCount} token={token} />
      )}
    </div>
  );
}
