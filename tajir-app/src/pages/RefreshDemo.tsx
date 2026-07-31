// RefreshDemo.tsx — token refresh rotation demonstration.
//
// Tajir uses token-based auth (no sessions). Tokens are kept fresh via
// refresh token rotation. This page lets you trigger a refresh manually
// and see the old and new tokens side by side.
//
// The key security property: each refresh invalidates the old refresh
// token. If a leaked refresh token is reused, Keycloak detects it and
// revokes the entire grant. See keycloak-mapped.md, lines 496-503.

import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import TokenViewer from '../components/TokenViewer';

export default function RefreshDemo() {
  const { accessToken, refreshToken, user, refreshTokens, error } = useAuth();
  const [prevAccess, setPrevAccess] = useState<string | null>(null);
  const [prevRefresh, setPrevRefresh] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [reuseResult, setReuseResult] = useState<string | null>(null);

  const claims = user?.profile ?? ({} as Record<string, any>);
  const exp = claims.exp ? new Date(claims.exp * 1000) : null;

  const handleRefresh = async () => {
    setPrevAccess(accessToken);
    setPrevRefresh(refreshToken);
    setReuseResult(null);
    setRefreshing(true);
    try {
      await refreshTokens();
      setRefreshCount(c => c + 1);
    } finally {
      setRefreshing(false);
    }
  };

  // Try to use the OLD refresh token — simulates a leaked token reuse attack.
  const handleSimulateReuse = async () => {
    if (!prevRefresh) return;
    setReuseResult('Attempting to use the old refresh token…');
    try {
      const res = await fetch(
        'http://keycloak.demo.local/realms/demo/protocol/openid-connect/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: prevRefresh,
            client_id: 'tajir-app',
          }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        setReuseResult('UNEXPECTED: old refresh token was accepted. Rotation may be disabled.');
      } else {
        setReuseResult(`REJECTED (HTTP ${res.status}): ${data.error_description || data.error || 'Token reuse detected — grant revoked'}`);
      }
    } catch (err: any) {
      setReuseResult(`Error: ${err.message}`);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Refresh Token Demo</h1>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
        Token-based auth refreshes tokens silently. This page lets you trigger refreshes manually
        and see the rotation. Each refresh invalidates the old token — if it is reused, Keycloak detects it.
      </p>

      {/* Status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
        <StatusCard label="Access Token Expiry" value={exp ? exp.toLocaleTimeString() : '—'} />
        <StatusCard label="Refreshes This Session" value={String(refreshCount)} />
        <StatusCard label="Auth Mode" value="Token-based (no session cookie)" />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button onClick={handleRefresh} disabled={refreshing} style={btnStyle}>
          {refreshing ? '⏳ Refreshing…' : '🔄 Refresh Now'}
        </button>
        <button onClick={handleSimulateReuse} disabled={!prevRefresh} style={{ ...btnStyle, background: '#991b1b' }}>
          ⚠️ Simulate Token Reuse (use old refresh token)
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {reuseResult && (
        <div style={{
          padding: 16,
          background: reuseResult.includes('REJECTED') ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${reuseResult.includes('REJECTED') ? '#bbf7d0' : '#fecaca'}`,
          borderRadius: 10,
          marginBottom: 16,
          fontSize: 13,
        }}>
          <strong>{reuseResult.includes('REJECTED') ? '✅ ' : '❌ '}</strong>
          {reuseResult}
          {reuseResult.includes('REJECTED') && (
            <p style={{ marginTop: 8, color: '#64748b' }}>
              Keycloak detected that this refresh token was already used (rotation) and rejected it.
              In a real attack, the entire grant would be revoked and both the attacker and
              legitimate client would be forced to re-authenticate. See keycloak-mapped.md, lines 498-503.
            </p>
          )}
        </div>
      )}

      {/* Side-by-side tokens */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <TokenViewer token={prevAccess} label="Previous Access Token" />
        <TokenViewer token={accessToken} label="Current Access Token" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <TokenViewer token={prevRefresh} label="Previous Refresh Token (now invalid)" />
        <TokenViewer token={refreshToken} label="Current Refresh Token" />
      </div>

      {/* Rotation explanation */}
      <div style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: 20,
        marginTop: 24,
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>How refresh rotation works</h2>
        <pre style={{ fontSize: 12, color: '#334155', lineHeight: 1.8 }}>
{`Login    → access_token_1 + refresh_token_A
Refresh  → access_token_2 + refresh_token_B  (A is now INVALID)
Refresh  → access_token_3 + refresh_token_C  (B is now INVALID)

If refresh_token_A is leaked between steps 1 and 2:
  - Attacker uses it once → gets token pair, A invalidated
  - Legitimate client tries A next → Keycloak sees reuse
  - Entire grant revoked → both attacker AND legitimate client must re-auth

This is replay detection. A leaked refresh token is usable exactly once,
and its use is immediately detected. Keycloak configuration:
  revokeRefreshToken: true
  refreshTokenMaxReuse: 0`}
        </pre>
      </div>
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      padding: 16,
    }}>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{value}</div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '12px 24px',
  background: '#0f172a',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
};
