import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { CarnivalProvider } from './context/CarnivalContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import Carnivals from './pages/Carnivals';
import Houses from './pages/Houses';
import CarnivalSettings from './pages/CarnivalSettings';
import Competitors from './pages/Competitors';
import CompetitorEventAgeConfig from './pages/CompetitorEventAgeConfig';
import EventTypes from './pages/EventTypes';
import EventTypeDetail from './pages/EventTypeDetail';
import HeatDetail from './pages/HeatDetail';
import EventOrder from './pages/EventOrder';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        Loading…
      </div>
    );
  }

  return (
    <CarnivalProvider>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppShell>
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/carnivals" element={<Carnivals />} />
                  <Route path="/carnivals/:id/settings" element={<CarnivalSettings />} />
                  <Route path="/houses" element={<Houses />} />
                  <Route path="/competitors" element={<Competitors />} />
                  <Route path="/carnivals/:id/age-mapping" element={<CompetitorEventAgeConfig />} />
                  <Route path="/event-types" element={<EventTypes />} />
                  <Route path="/event-types/:id" element={<EventTypeDetail />} />
                  <Route path="/heats/:id" element={<HeatDetail />} />
                  <Route path="/event-order" element={<EventOrder />} />
                </Routes>
              </AppShell>
            </ProtectedRoute>
          }
        />
      </Routes>
    </CarnivalProvider>
  );
}
