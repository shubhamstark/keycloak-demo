// TokenInspector.tsx — decoded JWT viewer for all three token types.
//
// Shows the access token, ID token, and refresh token side by side
// with full decoded claims. This is the concrete home of the article's
// "decode your tokens and see the mapping" instruction.

import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import TokenViewer from '../components/TokenViewer';

export default function TokenInspector() {
  const { accessToken, idToken, refreshToken } = useAuth();
  const [activeTab, setActiveTab] = useState<'access' | 'id' | 'refresh'>('access');

  const tabs: { key: 'access' | 'id' | 'refresh'; label: string; token: string | null; desc: string }[] = [
    {
      key: 'access',
      label: 'Access Token',
      token: accessToken,
      desc: 'Sent to dashboard-service as Bearer token. Contains sub, aud, realm_access.roles, organization. Validated by every service on every request.',
    },
    {
      key: 'id',
      label: 'ID Token',
      token: idToken,
      desc: 'Proves authentication happened. Contains user profile claims (name, email). Not sent to services — only the client reads it.',
    },
    {
      key: 'refresh',
      label: 'Refresh Token',
      token: refreshToken,
      desc: 'Used to get a new access token without re-authenticating. Rotated on every use (old one invalidated). Bounded by SSO session max.',
    },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Token Inspector</h1>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
        Decoded JWT tokens from the current session. Each claim maps to a concept from the article.
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '10px 20px',
              border: `2px solid ${activeTab === t.key ? '#0f172a' : '#e2e8f0'}`,
              borderRadius: 8,
              background: activeTab === t.key ? '#0f172a' : '#fff',
              color: activeTab === t.key ? '#fff' : '#334155',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Active token */}
      {tabs.filter(t => t.key === activeTab).map(t => (
        <div key={t.key}>
          <p style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>{t.desc}</p>
          <TokenViewer token={t.token} label={t.label} defaultExpanded />
        </div>
      ))}

      {/* Token comparison table */}
      <div style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Token Identity Comparison</h2>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>
          How the three token types differ in who they represent. See keycloak-mapped.md, lines 391–454.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={thStyle}>Claim</th>
              <th style={thStyle}>Access Token</th>
              <th style={thStyle}>ID Token</th>
              <th style={thStyle}>Refresh Token</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}><strong>sub</strong></td>
              <td style={tdStyle}>User's UUID</td>
              <td style={tdStyle}>User's UUID</td>
              <td style={tdStyle}>Not a JWT (opaque handle)</td>
            </tr>
            <tr>
              <td style={tdStyle}><strong>aud</strong></td>
              <td style={tdStyle}>dashboard-service</td>
              <td style={tdStyle}>tajir-app</td>
              <td style={tdStyle}>—</td>
            </tr>
            <tr>
              <td style={tdStyle}><strong>azp</strong></td>
              <td style={tdStyle}>tajir-app</td>
              <td style={tdStyle}>tajir-app</td>
              <td style={tdStyle}>—</td>
            </tr>
            <tr>
              <td style={tdStyle}><strong>Contains roles?</strong></td>
              <td style={tdStyle}>✅ realm_access, resource_access</td>
              <td style={tdStyle}>❌</td>
              <td style={tdStyle}>—</td>
            </tr>
            <tr>
              <td style={tdStyle}><strong>Contains org?</strong></td>
              <td style={tdStyle}>✅ if organization scope requested</td>
              <td style={tdStyle}>✅ if organization scope requested</td>
              <td style={tdStyle}>—</td>
            </tr>
            <tr>
              <td style={tdStyle}><strong>Sent to</strong></td>
              <td style={tdStyle}>Resource servers (dashboard, admin)</td>
              <td style={tdStyle}>Client only (decoded, displayed)</td>
              <td style={tdStyle}>Token endpoint (to refresh)</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #e2e8f0' };
const tdStyle: React.CSSProperties = { padding: '10px 14px', borderBottom: '1px solid #e2e8f0' };
