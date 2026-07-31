// Dashboard.tsx — Tajir company overview.
//
// Shows the user's company info, role badges, and quick stats for
// banking and tax services. Data comes from dashboard-service, which
// validates the user's token and scopes data to their organization.

import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getDashboard, getBanking, getTax } from '../services/dashboard';
import RoleBadge from '../components/RoleBadge';

export default function Dashboard() {
  const { accessToken, user } = useAuth();
  const claims = user?.profile ?? ({} as Record<string, any>);
  const roles: string[] = Array.isArray(claims.realm_access) ? claims.realm_access : (claims.realm_access?.roles ?? []);
  const email: string = claims.email || '';
  const orgName = email.endsWith('@acme.com') ? 'acme' : email.endsWith('@globex.com') ? 'globex' : '';
  const orgDisplay = orgName === 'acme' ? 'Acme Corp' : orgName === 'globex' ? 'Globex Industries' : '';
  const displayName = claims.preferred_username || claims.name || claims.sub || 'User';

  const [dash, setDash] = useState<any>(null);
  const [banking, setBanking] = useState<any>(null);
  const [tax, setTax] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    (async () => {
      setLoading(true);
      const [d, b, t] = await Promise.all([
        getDashboard(accessToken),
        getBanking(accessToken).catch(() => null),
        getTax(accessToken).catch(() => null),
      ]);
      setDash(d?.data);
      setBanking(b?.data);
      setTax(t?.data);
      setLoading(false);
    })();
  }, [accessToken]);

  if (loading) return <p style={{ color: '#666' }}>Loading dashboard…</p>;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
          Welcome, {displayName}
        </h1>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {orgDisplay && (
            <span style={{
              padding: '4px 14px',
              borderRadius: 8,
              background: '#e0e7ff',
              color: '#3730a3',
              fontSize: 13,
              fontWeight: 600,
            }}>
              🏢 {orgDisplay}
            </span>
          )}
          {roles.map(r => <RoleBadge key={r} role={r} />)}
        </div>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatCard
          title="Bank Accounts"
          value={banking?.accounts?.length ?? '—'}
          detail={banking?.accounts?.map((a: any) => `${a.bank}: ${a.status}`).join(', ')}
          icon="🏦"
        />
        <StatCard
          title="VAT Filings"
          value={tax?.filings?.filter((f: any) => f.status === 'filed').length ?? '—'}
          detail={tax?.filings?.map((f: any) => `${f.period}: ${f.status}`).join(', ')}
          icon="📋"
        />
        <StatCard
          title="Company Plan"
          value={dash?.company?.plan ?? '—'}
          detail={`${dash?.company?.members ?? 0} team members`}
          icon="💼"
        />
      </div>

      {/* Raw response for teaching */}
      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: '#64748b' }}>
          Raw API responses
        </summary>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
          <pre style={preStyle}>{JSON.stringify(dash, null, 2)}</pre>
          <pre style={preStyle}>{JSON.stringify(banking, null, 2)}</pre>
          <pre style={preStyle}>{JSON.stringify(tax, null, 2)}</pre>
        </div>
      </details>
    </div>
  );
}

function StatCard({ title, value, detail, icon }: { title: string; value: string | number; detail?: string; icon: string }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      padding: 20,
    }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{value}</div>
      {detail && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{detail}</div>}
    </div>
  );
}

const preStyle: React.CSSProperties = {
  background: '#1e293b',
  color: '#e2e8f0',
  padding: 12,
  borderRadius: 8,
  fontSize: 10,
  overflowX: 'auto',
  maxHeight: 300,
  overflowY: 'auto',
};
