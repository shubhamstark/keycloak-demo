// Layout.tsx — Tajir navigation shell.
//
// Shows the nav bar with logo, navigation links, user badge, and
// logout button. The <Outlet /> renders the current route's content.
// Navigation links are only visible when authenticated.

import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const claims = user?.profile ?? ({} as Record<string, any>);
  const displayName = claims.preferred_username || claims.name || claims.sub || 'User';
  const orgName = claims.organization ? Object.keys(claims.organization)[0] : '';

  const navLink = (to: string, label: string) => {
    const active = location.pathname === to;
    return (
      <Link
        to={to}
        style={{
          color: active ? '#fff' : 'rgba(255,255,255,0.7)',
          textDecoration: 'none',
          padding: '6px 14px',
          borderRadius: 6,
          background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
          fontSize: 14,
          fontWeight: active ? 600 : 400,
          transition: 'background 0.15s',
        }}
      >
        {label}
      </Link>
    );
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Nav bar */}
      <header
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
          color: '#fff',
          padding: '0 24px',
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Link to="/" style={{ textDecoration: 'none', color: '#fff', fontWeight: 700, fontSize: 20 }}>
            🏢 Tajir
          </Link>
          {user && (
            <nav style={{ display: 'flex', gap: 4 }}>
              {navLink('/', 'Dashboard')}
              {navLink('/tokens', 'Tokens')}
              {navLink('/explorer', 'API Explorer')}
              {navLink('/refresh', 'Refresh')}
              {navLink('/admin/users', 'Users & Orgs')}
              {navLink('/admin/roles', 'Roles & Groups')}
            </nav>
          )}
        </div>

        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{displayName}</div>
              {orgName && (
                <div style={{ fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {orgName}
                </div>
              )}
            </div>
            <button
              onClick={logout}
              style={{
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                padding: '6px 14px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Log out
            </button>
          </div>
        )}
      </header>

      {/* Page content */}
      <main style={{ flex: 1, padding: 32, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <Outlet />
      </main>
    </div>
  );
}
