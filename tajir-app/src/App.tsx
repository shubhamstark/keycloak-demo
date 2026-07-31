// App.tsx — Tajir application router.
//
// Routes:
//   /             → Dashboard (company overview)
//   /tokens       → Token Inspector (decoded JWT viewer)
//   /explorer     → API Explorer (call services, see tokens in flight)
//   /refresh      → Refresh Demo (rotation, replay detection)
//   /admin/users  → Users & Organizations management
//   /admin/roles  → Roles & Groups management
//
// All routes except the login page are protected by ProtectedRoute.
// If the user is not authenticated, they see the Login page.

import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TokenInspector from './pages/TokenInspector';
import ApiExplorer from './pages/ApiExplorer';
import RefreshDemo from './pages/RefreshDemo';
import UsersOrgs from './pages/admin/UsersOrgs';
import RolesGroups from './pages/admin/RolesGroups';

export default function App() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Tajir</h2>
          <p style={{ color: '#666' }}>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        {/* Login page: shown when not authenticated */}
        <Route
          index
          element={
            user ? <Dashboard /> : <Login />
          }
        />

        {/* Protected routes */}
        <Route path="tokens" element={<ProtectedRoute><TokenInspector /></ProtectedRoute>} />
        <Route path="explorer" element={<ProtectedRoute><ApiExplorer /></ProtectedRoute>} />
        <Route path="refresh" element={<ProtectedRoute><RefreshDemo /></ProtectedRoute>} />
        <Route path="admin/users" element={<ProtectedRoute><UsersOrgs /></ProtectedRoute>} />
        <Route path="admin/roles" element={<ProtectedRoute><RolesGroups /></ProtectedRoute>} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
