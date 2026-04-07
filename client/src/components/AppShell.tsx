import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCarnival } from '../context/CarnivalContext';
import styles from './AppShell.module.css';

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { activeCarnival } = useCarnival();

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          🏆 Sports Administrator
        </Link>
        <nav className={styles.nav}>
          <Link to="/carnivals" className={styles.navLink}>Carnivals</Link>
          {activeCarnival && (
            <>
              <span className={styles.navSep}>›</span>
              <span className={styles.activeName}>{activeCarnival.name}</span>
              <Link to="/houses" className={styles.navLink}>Houses</Link>
              <Link to="/competitors" className={styles.navLink}>Competitors</Link>
              <Link to="/event-types" className={styles.navLink}>Events</Link>
              <Link to="/event-order" className={styles.navLink}>Programme</Link>
              <Link to="/point-scales" className={styles.navLink}>Scoring</Link>
              <Link to={`/carnivals/${activeCarnival.id}/age-mapping`} className={styles.navLink}>Age Mapping</Link>
              <Link to={`/carnivals/${activeCarnival.id}/settings`} className={styles.navLink}>Settings</Link>
            </>
          )}
        </nav>
        <div className={styles.userMenu}>
          <span className={styles.userName}>{user?.displayName}</span>
          <button onClick={logout} className={styles.logoutBtn}>
            Log out
          </button>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
