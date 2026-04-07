import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './AppShell.module.css';

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          🏆 Sports Administrator
        </Link>
        <nav className={styles.nav}>
          {/* Navigation links are added per phase */}
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
