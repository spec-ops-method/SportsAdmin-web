import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCarnival } from '../context/CarnivalContext';
import { useApi } from '../hooks/useApi';
import type { DashboardResponse } from '@sportsadmin/shared';
import styles from './DashboardPage.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export default function DashboardPage() {
  const { user } = useAuth();
  const { activeCarnival } = useCarnival();
  const navigate = useNavigate();

  const { data, loading, error } = useApi<DashboardResponse>(
    activeCarnival ? `${API}/carnivals/${activeCarnival.id}/dashboard` : null,
  );

  if (!activeCarnival) {
    return (
      <div className={styles.welcome}>
        <div className={styles.welcomeCard}>
          <span className={styles.welcomeIcon}>🏆</span>
          <h2>Welcome, {user?.displayName}!</h2>
          <p>Select a carnival to get started, or create a new one.</p>
          <button className={styles.btn} onClick={() => navigate('/carnivals')}>
            Select a Carnival
          </button>
        </div>
      </div>
    );
  }

  const carnival = data?.carnival;
  const stats = data?.stats;
  const recentResults = data?.recentResults ?? [];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.carnivalName}>{activeCarnival.name}</h2>
          {carnival?.settings?.title && carnival.settings.title !== activeCarnival.name && (
            <p className={styles.carnivalTitle}>{carnival.settings.title}</p>
          )}
        </div>
      </div>

      {error && <p className={styles.error}>Failed to load dashboard: {error}</p>}

      {/* Stats */}
      <div className={styles.statsGrid}>
        <StatCard
          icon="👥"
          label="Competitors"
          value={loading ? '…' : String(stats?.competitorCount ?? 0)}
        />
        <StatCard
          icon="🏃"
          label="Events"
          value={loading ? '…' : String(stats?.eventCount ?? 0)}
        />
        <StatCard
          icon="✅"
          label="Heats Complete"
          value={loading ? '…' : String(stats?.completedHeatCount ?? 0)}
        />
        <StatCard
          icon="🏅"
          label="Records"
          value={loading ? '…' : String(stats?.recordCount ?? 0)}
        />
      </div>

      {/* Recent results */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Recent Results</h3>
        {loading ? (
          <p className={styles.hint}>Loading…</p>
        ) : recentResults.length === 0 ? (
          <p className={styles.hint}>No results recorded yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Competitor</th>
                <th>Event</th>
                <th>Result</th>
                <th>Place</th>
              </tr>
            </thead>
            <tbody>
              {recentResults.map((r, i) => (
                <tr key={i}>
                  <td>{r.competitorName}</td>
                  <td>{r.eventTypeName}</td>
                  <td>{r.result}</td>
                  <td>{r.place ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Quick actions */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Quick Actions</h3>
        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={() => navigate('/competitors')}>
            👥 Competitors
          </button>
          <button className={styles.actionBtn} onClick={() => navigate('/event-types')}>
            🏃 Events
          </button>
          <button className={styles.actionBtn} onClick={() => navigate('/reports')}>
            📊 Reports
          </button>
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statIcon}>{icon}</span>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
