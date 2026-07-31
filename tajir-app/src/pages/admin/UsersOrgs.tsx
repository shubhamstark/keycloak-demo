// UsersOrgs.tsx — team management for company admins.
//
// Company admins can view their team, invite new users, and assign/remove
// roles. All operations go through admin-service, which enforces the tenant
// boundary: you can only manage users in your own organization.
// Non-admin users see a read-only view.
//
// This is the delegated admin pattern from keycloak-mapped.md, lines 350-425.

import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { getTeam, createUser, getRoles, assignRole, removeRole } from '../../services/admin';
import RoleBadge from '../../components/RoleBadge';

export default function UsersOrgs() {
  const { accessToken, user } = useAuth();
  const claims = user?.profile ?? ({} as Record<string, any>);
  const roles: string[] = Array.isArray(claims.realm_access) ? claims.realm_access : (claims.realm_access?.roles ?? []);
  const isAdmin = roles.includes('company-admin');

  // Derive company from email domain (same logic as Go's companyFromEmail).
  const email: string = claims.email || '';
  const orgName = email.endsWith('@acme.com') ? 'acme' : email.endsWith('@globex.com') ? 'globex' : '';
  const orgDisplay = orgName === 'acme' ? 'Acme Corp' : orgName === 'globex' ? 'Globex Industries' : 'Unknown';

  const [team, setTeam] = useState<any[]>([]);
  const [realmRoles, setRealmRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // Invite form
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('password');

  const loadData = async () => {
    if (!accessToken) return;
    setLoading(true);
    const [t, r] = await Promise.all([
      getTeam(accessToken).catch(() => ({ data: { members: [] } })),
      getRoles(accessToken).catch(() => ({ data: [] })),
    ]);
    setTeam(t.data?.members ?? []);
    setRealmRoles(r.data ?? []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [accessToken]);

  const handleInvite = async () => {
    if (!inviteUsername || !inviteEmail) return;
    setMsg(null);
    const res = await createUser(accessToken!, { username: inviteUsername, email: inviteEmail, password: invitePassword });
    if (res.ok) {
      setMsg(`User "${inviteUsername}" created and added to ${orgName}.`);
      setInviteUsername('');
      setInviteEmail('');
      loadData();
    } else {
      setMsg(`Error: ${res.data?.error || res.data?.raw || 'Unknown error'}`);
    }
  };

  const handleAssignRole = async (userId: string, role: any) => {
    const res = await assignRole(accessToken!, userId, [{ id: role.id, name: role.name }]);
    setMsg(res.ok ? `Role "${role.name}" assigned.` : `Error: ${res.data?.error || 'Failed'}`);
    loadData();
  };

  const handleRemoveRole = async (userId: string, role: any) => {
    const res = await removeRole(accessToken!, userId, [{ id: role.id, name: role.name }]);
    setMsg(res.ok ? `Role "${role.name}" removed.` : `Error: ${res.data?.error || 'Failed'}`);
    loadData();
  };

  if (loading) return <p style={{ color: '#666' }}>Loading team…</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Users & Organizations</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>
            {isAdmin ? 'Manage your team and assign roles.' : 'View your team. Contact your company admin to make changes.'}
          </p>
        </div>
        <span style={{
          padding: '6px 16px',
          borderRadius: 8,
          background: isAdmin ? '#d1fae5' : '#f1f5f9',
          color: isAdmin ? '#065f46' : '#64748b',
          fontSize: 13,
          fontWeight: 600,
        }}>
          {isAdmin ? 'Company Admin' : 'Viewer'}
        </span>
      </div>

      {msg && (
        <div style={{
          padding: '10px 16px',
          borderRadius: 8,
          marginBottom: 16,
          background: msg.startsWith('Error') ? '#fee2e2' : '#d1fae5',
          color: msg.startsWith('Error') ? '#991b1b' : '#065f46',
          fontSize: 13,
        }}>
          {msg}
          <button onClick={() => setMsg(null)} style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>×</button>
        </div>
      )}

      {/* Organization badge */}
      <div style={{ marginBottom: 24 }}>
        <span style={{ fontSize: 13, color: '#64748b' }}>Your organization: </span>
        <span style={{
          padding: '4px 12px',
          borderRadius: 6,
          background: '#e0e7ff',
          color: '#3730a3',
          fontSize: 13,
          fontWeight: 600,
        }}>
          🏢 {orgDisplay}
        </span>
      </div>

      {/* Invite form (admin only) */}
      {isAdmin && (
        <div style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          padding: 20,
          marginBottom: 24,
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Invite a team member</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <InputField label="Username" value={inviteUsername} onChange={setInviteUsername} placeholder="john" />
            <InputField label="Email" value={inviteEmail} onChange={setInviteEmail} placeholder="john@acme.com" type="email" />
            <InputField label="Password" value={invitePassword} onChange={setInvitePassword} type="text" />
            <button onClick={handleInvite} style={btnStyle}>Invite</button>
          </div>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
            New users are created in the realm. Assign roles after creation.
          </p>
        </div>
      )}

      {/* Team list */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={thStyle}>User</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Roles</th>
              {isAdmin && <th style={thStyle}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {team.map((member: any) => (
              <tr key={member.id || member.username}>
                <td style={tdStyle}>
                  <strong>{member.firstName} {member.lastName}</strong>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>@{member.username}</div>
                </td>
                <td style={tdStyle}>{member.email}</td>
                <td style={tdStyle}>
                  {(member.realmRoles || member.roles || []).map((r: any) => (
                    <RoleBadge key={typeof r === 'string' ? r : r.name} role={typeof r === 'string' ? r : r.name} />
                  ))}
                </td>
                {isAdmin && (
                  <td style={tdStyle}>
                    <select
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const role = realmRoles.find((r: any) => r.name === e.target.value);
                        if (role) handleAssignRole(member.id || member.userId, role);
                        e.target.value = '';
                      }}
                      style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e8f0' }}
                    >
                      <option value="">+ Assign role</option>
                      {realmRoles.filter((r: any) => r.name !== 'default-roles-demo').map((r: any) => (
                        <option key={r.id} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                  </td>
                )}
              </tr>
            ))}
            {team.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 4 : 3} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}>
                  No team members found. {isAdmin && 'Invite someone to get started.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, width: 160 }}
      />
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '10px 20px',
  background: '#0f172a',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
  height: 42,
};

const thStyle: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #e2e8f0', fontSize: 12, color: '#64748b', textTransform: 'uppercase' };
const tdStyle: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid #f1f5f9' };
