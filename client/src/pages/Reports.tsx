import { useState } from 'react';
import type { HousePointsRow, MarshallingHeat, AgeChampionRow, CumulativePointsData } from '@sportsadmin/shared';
import { useApi } from '../hooks/useApi';
import { useCarnival } from '../context/CarnivalContext';
import styles from './Reports.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

// ─── Report categories ───────────────────────────────────────────────────────

type ReportCategory =
  | 'house-points'
  | 'programme'
  | 'marshalling'
  | 'stats-standings'
  | 'stats-events'
  | 'champions'
  | 'competitor-list';

const CATEGORIES: Array<{ id: ReportCategory; icon: string; label: string }> = [
  { id: 'house-points',    icon: '🏆', label: 'House Points' },
  { id: 'programme',       icon: '📋', label: 'Programme' },
  { id: 'marshalling',     icon: '🏃', label: 'Marshalling Lists' },
  { id: 'stats-standings', icon: '📊', label: 'Statistics — Standings' },
  { id: 'stats-events',    icon: '📈', label: 'Statistics — Events' },
  { id: 'champions',       icon: '🥇', label: 'Champions & Records' },
  { id: 'competitor-list', icon: '👤', label: 'Competitor Lists' },
];

// ─── Medal colours ────────────────────────────────────────────────────────────

function medalClass(index: number): string {
  if (index === 0) return styles.gold;
  if (index === 1) return styles.silver;
  if (index === 2) return styles.bronze;
  return '';
}

// ─── House Points Table ───────────────────────────────────────────────────────

function HousePointsTable({ carnivalId }: { carnivalId: number }) {
  const { data, loading, error } = useApi<HousePointsRow[]>(
    `${API}/carnivals/${carnivalId}/reports/house-points`,
  );

  if (loading) return <p className={styles.loading}>Loading house points…</p>;
  if (error) return <p className={styles.error}>Error: {error}</p>;
  if (!data || data.length === 0) return <p className={styles.empty}>No house points data yet.</p>;

  return (
    <table className={styles.table} aria-label="House points">
      <thead>
        <tr>
          <th>Code</th>
          <th>House</th>
          <th>Event Pts</th>
          <th>Extra Pts</th>
          <th>Grand Total</th>
          <th>%</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={row.houseCode} className={medalClass(i)}>
            <td>{row.houseCode}</td>
            <td>{row.houseName}</td>
            <td>{row.eventPoints.toFixed(1)}</td>
            <td>{row.extraPoints.toFixed(1)}</td>
            <td className={styles.boldCell}>{row.grandTotal.toFixed(1)}</td>
            <td>{row.percentage.toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Programme Panel ─────────────────────────────────────────────────────────

function ProgrammePanel({ carnivalId }: { carnivalId: number }) {
  const [variant, setVariant] = useState<'standard' | 'three-column' | 'summary'>('standard');
  const { data, loading, error } = useApi<unknown[]>(
    `${API}/carnivals/${carnivalId}/reports/program?variant=${variant}`,
  );

  return (
    <div>
      <div className={styles.filterRow}>
        <label>
          Variant:{' '}
          <select value={variant} onChange={(e) => setVariant(e.target.value as typeof variant)}>
            <option value="standard">Standard</option>
            <option value="three-column">Three Column</option>
            <option value="summary">Summary</option>
          </select>
        </label>
      </div>
      {loading && <p className={styles.loading}>Loading programme…</p>}
      {error && <p className={styles.error}>Error: {error}</p>}
      {data && data.length === 0 && <p className={styles.empty}>No programme events found.</p>}
      {data && data.length > 0 && (
        <table className={styles.table} aria-label="Programme of events">
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th>Event</th>
              <th>Age</th>
              <th>Sex</th>
              <th>Round</th>
              <th>Heat</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(data as Array<Record<string, unknown>>).map((row, i) => (
              <tr key={i}>
                <td>{String(row.eventNumber ?? '—')}</td>
                <td>{String(row.eventTime ?? '—')}</td>
                <td>{String(row.eventTypeDescription)}</td>
                <td>{String(row.age)}</td>
                <td>{String(row.sex)}</td>
                <td>{String(row.finalLevelLabel)}</td>
                <td>{String(row.heatNumber)}</td>
                <td>{String(row.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Marshalling Panel ────────────────────────────────────────────────────────

function MarshallingPanel({ carnivalId }: { carnivalId: number }) {
  const [statusFilter, setStatusFilter] = useState('');
  const params = new URLSearchParams();
  if (statusFilter) params.set('statuses', statusFilter);

  const { data, loading, error } = useApi<MarshallingHeat[]>(
    `${API}/carnivals/${carnivalId}/reports/event-lists?${params.toString()}`,
  );

  return (
    <div>
      <div className={styles.filterRow}>
        <label>
          Status filter:{' '}
          <input
            type="text"
            placeholder="e.g. future,active"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </label>
      </div>
      {loading && <p className={styles.loading}>Loading marshalling lists…</p>}
      {error && <p className={styles.error}>Error: {error}</p>}
      {data && data.length === 0 && <p className={styles.empty}>No events found.</p>}
      {data &&
        data.map((heat, i) => (
          <div key={i} className={styles.heatBlock}>
            <h4 className={styles.heatHeading}>
              {heat.eventType} — {heat.age} {heat.sex} — {heat.finalLevelLabel} Heat{' '}
              {heat.heatNumber}
              {heat.eventNumber != null && ` (Event #${heat.eventNumber})`}
              <span className={styles.statusBadge}>{heat.status}</span>
            </h4>
            {heat.record && (
              <p className={styles.recordNote}>
                Record: {heat.record} — {heat.recordHolder}
              </p>
            )}
            {heat.competitors.length > 0 ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Lane</th>
                    <th>Name</th>
                    <th>House</th>
                  </tr>
                </thead>
                <tbody>
                  {heat.competitors.map((c, j) => (
                    <tr key={j}>
                      <td>{c.lane ?? '—'}</td>
                      <td>{c.name}</td>
                      <td>{c.houseCode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className={styles.empty}>No competitors entered.</p>
            )}
          </div>
        ))}
    </div>
  );
}

// ─── Age Champions Panel ──────────────────────────────────────────────────────

function AgeChampionsPanel({ carnivalId }: { carnivalId: number }) {
  const [count, setCount] = useState(3);
  const { data, loading, error } = useApi<AgeChampionRow[]>(
    `${API}/carnivals/${carnivalId}/reports/statistics/age-champions?age_champion_count=${count}`,
  );

  return (
    <div>
      <div className={styles.filterRow}>
        <label>
          Top N per division:{' '}
          <input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value, 10) || 3)}
            className={styles.numberInput}
          />
        </label>
      </div>
      {loading && <p className={styles.loading}>Loading age champions…</p>}
      {error && <p className={styles.error}>Error: {error}</p>}
      {data && data.length === 0 && <p className={styles.empty}>No age champion data yet.</p>}
      {data && data.length > 0 && (
        <table className={styles.table} aria-label="Age champions">
          <thead>
            <tr>
              <th>Division</th>
              <th>Name</th>
              <th>House</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>
                <td>{row.ageSexDivision}</td>
                <td>{row.fullName}</td>
                <td>{row.houseName}</td>
                <td>{row.totalPoints.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Cumulative Points Panel ──────────────────────────────────────────────────

function CumulativePanel({ carnivalId }: { carnivalId: number }) {
  const { data, loading, error } = useApi<CumulativePointsData>(
    `${API}/carnivals/${carnivalId}/reports/statistics/cumulative-by-event-number`,
  );

  if (loading) return <p className={styles.loading}>Loading cumulative data…</p>;
  if (error) return <p className={styles.error}>Error: {error}</p>;
  if (!data || data.eventNumbers.length === 0)
    return <p className={styles.empty}>No cumulative data yet.</p>;

  return (
    <div className={styles.scrollX}>
      <table className={styles.table} aria-label="Cumulative points">
        <thead>
          <tr>
            <th>House</th>
            {data.eventNumbers.map((n) => (
              <th key={n}>#{n}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.series.map((s) => (
            <tr key={s.house}>
              <td>{s.house}</td>
              {s.cumulativePoints.map((pts, i) => (
                <td key={i}>{pts.toFixed(1)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Competitor List Panel ────────────────────────────────────────────────────

function CompetitorListPanel({ carnivalId }: { carnivalId: number }) {
  const [groupBy, setGroupBy] = useState<'none' | 'team' | 'age' | 'team-age'>('none');
  const { data, loading, error } = useApi<{
    data: Array<{ id: number; fullName: string; age: number; sex: string; houseCode: string; houseName: string }>;
    pagination: { page: number; perPage: number; total: number };
  }>(`${API}/carnivals/${carnivalId}/reports/competitor-list?group_by=${groupBy}`);

  return (
    <div>
      <div className={styles.filterRow}>
        <label>
          Group by:{' '}
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}>
            <option value="none">None</option>
            <option value="team">Team</option>
            <option value="age">Age</option>
            <option value="team-age">Team + Age</option>
          </select>
        </label>
      </div>
      {loading && <p className={styles.loading}>Loading competitors…</p>}
      {error && <p className={styles.error}>Error: {error}</p>}
      {data && data.data.length === 0 && (
        <p className={styles.empty}>No competitors found.</p>
      )}
      {data && data.data.length > 0 && (
        <>
          <p className={styles.totalNote}>Total: {data.pagination.total}</p>
          <table className={styles.table} aria-label="Competitor list">
            <thead>
              <tr>
                <th>Name</th>
                <th>Age</th>
                <th>Sex</th>
                <th>House</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((c) => (
                <tr key={c.id}>
                  <td>{c.fullName}</td>
                  <td>{c.age}</td>
                  <td>{c.sex}</td>
                  <td>{c.houseCode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ─── Stats Panel ─────────────────────────────────────────────────────────────

function StatsPanel({ carnivalId, reportName, title }: { carnivalId: number; reportName: string; title: string }) {
  const { data, loading, error } = useApi<unknown[]>(
    `${API}/carnivals/${carnivalId}/reports/statistics/${reportName}`,
  );

  if (loading) return <p className={styles.loading}>Loading {title}…</p>;
  if (error) return <p className={styles.error}>Error: {error}</p>;
  if (!data || data.length === 0) return <p className={styles.empty}>No data yet.</p>;

  const columns = Object.keys(data[0] as object);

  return (
    <div className={styles.scrollX}>
      <table className={styles.table} aria-label={title}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(data as Array<Record<string, unknown>>).map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col}>{String(row[col] ?? '—')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Reports Page ────────────────────────────────────────────────────────

export default function Reports() {
  const { activeCarnival } = useCarnival();
  const [activeCategory, setActiveCategory] = useState<ReportCategory>('house-points');

  if (!activeCarnival) {
    return (
      <div className={styles.noCarival}>
        <p>Select an active carnival to view reports.</p>
      </div>
    );
  }

  const cid = activeCarnival.id;

  function renderPanel() {
    switch (activeCategory) {
      case 'house-points':
        return (
          <div>
            <h2>House Points</h2>
            <HousePointsTable carnivalId={cid} />
            <h3 className={styles.sectionHeading}>Cumulative by Event Number</h3>
            <CumulativePanel carnivalId={cid} />
          </div>
        );
      case 'programme':
        return (
          <div>
            <h2>Programme of Events</h2>
            <ProgrammePanel carnivalId={cid} />
          </div>
        );
      case 'marshalling':
        return (
          <div>
            <h2>Marshalling Lists</h2>
            <MarshallingPanel carnivalId={cid} />
          </div>
        );
      case 'stats-standings':
        return (
          <div>
            <h2>Statistics — Standings</h2>
            <h3 className={styles.sectionHeading}>By Age</h3>
            <StatsPanel carnivalId={cid} reportName="by-age" title="By Age" />
            <h3 className={styles.sectionHeading}>By Sex</h3>
            <StatsPanel carnivalId={cid} reportName="by-sex" title="By Sex" />
            <h3 className={styles.sectionHeading}>By Age + Gender</h3>
            <StatsPanel carnivalId={cid} reportName="by-age-gender" title="By Age + Gender" />
            <h3 className={styles.sectionHeading}>By Place</h3>
            <StatsPanel carnivalId={cid} reportName="by-place" title="By Place" />
          </div>
        );
      case 'stats-events':
        return (
          <div>
            <h2>Statistics — Events</h2>
            <h3 className={styles.sectionHeading}>Event Results</h3>
            <StatsPanel carnivalId={cid} reportName="event-results" title="Event Results" />
            <h3 className={styles.sectionHeading}>Best Results</h3>
            <StatsPanel carnivalId={cid} reportName="event-times-best" title="Best Results" />
            <h3 className={styles.sectionHeading}>Competitor Events</h3>
            <StatsPanel carnivalId={cid} reportName="competitor-events" title="Competitor Events" />
          </div>
        );
      case 'champions':
        return (
          <div>
            <h2>Champions &amp; Records</h2>
            <h3 className={styles.sectionHeading}>Age Champions</h3>
            <AgeChampionsPanel carnivalId={cid} />
            <h3 className={styles.sectionHeading}>Current Records</h3>
            <StatsPanel carnivalId={cid} reportName="current-records" title="Current Records" />
          </div>
        );
      case 'competitor-list':
        return (
          <div>
            <h2>Competitor Lists</h2>
            <CompetitorListPanel carnivalId={cid} />
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className={styles.page}>
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className={styles.sidebar} aria-label="Report categories">
        <h3 className={styles.sidebarTitle}>Reports</h3>
        <nav>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`${styles.catBtn} ${activeCategory === cat.id ? styles.catBtnActive : ''}`}
              onClick={() => setActiveCategory(cat.id)}
              aria-current={activeCategory === cat.id ? 'page' : undefined}
            >
              <span className={styles.catIcon}>{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <main className={styles.content}>
        <div className={styles.toolbar}>
          <button
            className={styles.printBtn}
            onClick={() => window.print()}
            aria-label="Print report"
          >
            🖨 Print
          </button>
        </div>
        <div className={styles.preview}>{renderPanel()}</div>
      </main>
    </div>
  );
}
