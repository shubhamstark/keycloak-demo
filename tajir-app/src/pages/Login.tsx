// Login.tsx — unauthenticated landing page for Tajir.

import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { login, error } = useAuth();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 'calc(100vh - 120px)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🏢</div>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, color: '#0f172a' }}>
        Tajir
      </h1>
      <p style={{ fontSize: 16, color: '#64748b', marginBottom: 32, maxWidth: 420 }}>
        Business services platform — bank accounts, VAT filing, and compliance for your company.
        Sign in with your company account to continue.
      </p>

      <button
        onClick={login}
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
          color: '#fff',
          border: 'none',
          padding: '14px 40px',
          borderRadius: 10,
          fontSize: 16,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(15, 23, 42, 0.3)',
        }}
      >
        Sign in with your company account
      </button>

      {error && (
        <div style={{
          marginTop: 24,
          padding: '12px 20px',
          background: '#fee2e2',
          color: '#991b1b',
          borderRadius: 8,
          fontSize: 13,
          maxWidth: 420,
        }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 48, fontSize: 12, color: '#94a3b8' }}>
        <p>Demo accounts:</p>
        <p style={{ marginTop: 4 }}>
          <strong>shubham</strong> / password (Acme Corp, company-admin)
          {' · '}
          <strong>alice</strong> / password (Acme Corp, tax-filer)
          {' · '}
          <strong>bob</strong> / password (Globex, viewer)
        </p>
      </div>
    </div>
  );
}
