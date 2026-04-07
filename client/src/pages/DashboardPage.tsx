import { useAuth } from '../context/AuthContext';

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div>
      <h2>Welcome, {user?.displayName}!</h2>
      <p style={{ marginTop: '0.5rem', color: '#6b7280' }}>
        Select a carnival to get started, or create a new one from the Carnivals menu.
      </p>
    </div>
  );
}
