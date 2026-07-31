// ApiExplorer.tsx — call dashboard-service and see tokens in flight.
//
// Demonstrates the three token flows from the article:
//   1. PKCE user login → call dashboard-service directly
//   2. Token exchange → dashboard-service calls admin-service on behalf of user
//   3. Client credentials → described with diagram (admin-service → Keycloak Admin API)
//
// Each panel shows the curl equivalent, the decoded token being sent,
// and the HTTP response. This is the "see it running" page.

import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getDashboard, getBanking, getTax, getTeam } from '../services/dashboard';
import TokenViewer from '../components/TokenViewer';

type FlowResult = {
  label: string;
  curl: string;
  status: number;
  response: any;
  flowDescription: string;
};

export default function ApiExplorer() {
  const { accessToken, decodeToken } = useAuth();
  const [results, setResults] = useState<FlowResult[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  const call = async (label: string, fn: () => Promise<any>, desc: string) => {
    setLoading(label);
    const res = await fn();
    setResults(prev => [...prev, {
      label,
      curl: res.curl,
      status: res.status,
      response: res.data,
      flowDescription: desc,
    }]);
    setLoading(null);
  };

  const decodedAccess = accessToken ? decodeToken(accessToken) : null;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>API Explorer</h1>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
        Call services with your access token and see the request, response, and token side by side.
      </p>

      {/* Current access token summary */}
      {decodedAccess && (
        <div style={{
          background: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: 10,
          padding: 16,
          marginBottom: 24,
        }}>
          <strong style={{ fontSize: 13 }}>Your access token claims:</strong>
          <div style={{ fontSize: 12, marginTop: 4, color: '#334155' }}>
            sub={decodedAccess.payload.sub} · aud={JSON.stringify(decodedAccess.payload.aud)} ·
            azp={decodedAccess.payload.azp} · org={JSON.stringify(decodedAccess.payload.organization)}
          </div>
        </div>
      )}

      {/* Flow 1: User → Dashboard */}
      <div style={panelStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Flow 1: User → Dashboard (PKCE)</h2>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>
          Your access token (from the authorization code + PKCE login) is sent directly to dashboard-service.
          dashboard-service validates it, extracts your org and roles, and returns data scoped to your company.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <ActionButton label="GET /dashboard" loading={loading} onClick={() =>
            call('GET /dashboard', () => getDashboard(accessToken!), 'PKCE: user access token → dashboard-service')
          } />
          <ActionButton label="GET /dashboard/banking" loading={loading} onClick={() =>
            call('GET /dashboard/banking', () => getBanking(accessToken!), 'PKCE + role check (tax-filer or company-admin)')
          } />
          <ActionButton label="GET /dashboard/tax" loading={loading} onClick={() =>
            call('GET /dashboard/tax', () => getTax(accessToken!), 'PKCE + role check (tax-filer or company-admin)')
          } />
        </div>
      </div>

      {/* Flow 2: Token Exchange */}
      <div style={panelStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Flow 2: Dashboard → Admin (Token Exchange)</h2>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>
          dashboard-service exchanges your token for one targeting admin-service. The new token has the
          same sub (you) and org (your company), but aud=admin-service and azp=dashboard-service.
          admin-service knows WHO made the request, not just which service called it.
        </p>
        <ActionButton label="GET /dashboard/team (token exchange)" loading={loading} onClick={() =>
          call('GET /dashboard/team', () => getTeam(accessToken!),
            'Token Exchange (RFC 8693): dashboard-service exchanges user token → admin-service. User identity + org preserved downstream.')
        } />
      </div>

      {/* Flow 3: Client Credentials */}
      <div style={panelStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Flow 3: Admin → Keycloak (Client Credentials)</h2>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>
          When admin-service calls Keycloak's Admin REST API, it uses its own service-account token
          (client credentials grant). This token has sub=service-account-admin-service, no user identity,
          and carries realm-management roles. This is the machine-to-machine identity from the article.
        </p>
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 16,
          fontSize: 12,
          color: '#475569',
        }}>
          <p>This flow happens internally in admin-service. The service-account token looks like:</p>
          <pre style={{
            background: '#1e293b',
            color: '#e2e8f0',
            padding: 8,
            borderRadius: 6,
            marginTop: 8,
            fontSize: 11,
          }}>
{`{
  "sub": "service-account-admin-service",
  "aud": "realm-management",
  "azp": "admin-service",
  "realm_access": {
    "roles": ["manage-users", "view-users", "query-users", ...]
  }
}`}
          </pre>
          <p style={{ marginTop: 8 }}>
            <strong>No user identity, no organization.</strong> This is "I am admin-service" — the
            client credentials flow from the OAuth article, made concrete. The handlers layer
            enforces the tenant boundary before calling this; the service-account token grants
            realm-wide access, and it is our code that decides which users to touch.
          </p>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Results</h2>
          {results.map((r, i) => (
            <div key={i} style={{
              background: r.status < 400 ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${r.status < 400 ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: 10,
              padding: 16,
              marginBottom: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontSize: 14 }}>{r.label}</strong>
                <span style={{
                  padding: '2px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  background: r.status < 400 ? '#d1fae5' : '#fee2e2',
                  color: r.status < 400 ? '#065f46' : '#991b1b',
                }}>
                  HTTP {r.status}
                </span>
              </div>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{r.flowDescription}</p>
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: '#666' }}>curl · response</summary>
                <pre style={codeStyle}>{r.curl}</pre>
                <pre style={codeStyle}>{JSON.stringify(r.response, null, 2)}</pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, loading, onClick }: { label: string; loading: string | null; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading !== null}
      style={{
        padding: '10px 20px',
        border: '1px solid #0f172a',
        borderRadius: 8,
        background: '#0f172a',
        color: '#fff',
        fontWeight: 600,
        fontSize: 13,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading === label ? '⏳ Calling…' : label}
    </button>
  );
}

const panelStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 20,
  marginBottom: 16,
};

const codeStyle: React.CSSProperties = {
  background: '#1e293b',
  color: '#e2e8f0',
  padding: 10,
  borderRadius: 6,
  fontSize: 11,
  overflowX: 'auto',
  marginTop: 8,
};
