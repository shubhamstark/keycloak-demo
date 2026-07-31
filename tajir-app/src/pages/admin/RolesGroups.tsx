// RolesGroups.tsx — roles and groups management.
//
// Demonstrates the article's roles vs groups distinction:
//   Roles = what a user may do (the authorization primitive services check)
//   Groups = how to bundle users to assign roles in bulk
//   Organizations = which tenant a user belongs to
//
// Company admins can create groups and assign roles to them.
// Users in a group inherit the group's roles (the roles land in the token).
// See keycloak-mapped.md, lines 258-308.

import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { getGroups, createGroup, getRoles, assignGroupRole } from '../../services/admin';
import RoleBadge from '../../components/RoleBadge';

export default function RolesGroups() {
  const { accessToken, user } = useAuth();
  const claims = user?.profile ?? ({} as Record<string, any>);
  const roles: string[] = Array.isArray(claims.realm_access) ? claims.realm_access : (claims.realm_access?.roles ?? []);
  const isAdmin = roles.includes('company-admin');

  const [groups, setGroups] = useState<any[]>([]);
  const [realmRoles, setRealmRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'groups' | 'roles'>('groups');
  const [msg, setMsg] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');

  const loadData = async () => {
    if (!accessToken) return;
    setLoading(true);
    const [g, r] = await Promise.all([
      getGroups(accessToken).catch(() => ({ data: [] })),
      getRoles(accessToken).catch(() => ({ data: [] })),
    ]);
    setGroups(g.data ?? []);
    setRealmRoles(r.data ?? []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [accessToken]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setMsg(null);
    const res = await createGroup(accessToken!, newGroupName.trim());
    if (res.ok) {
      setMsg(`Group "${newGroupName}" created.`);
      setNewGroupName('');
      loadData();
    } else {
      setMsg(`Error: ${res.data?.error || res.data?.raw || 'Failed'}`);
    }
  };

  const handleAssignRoleToGroup = async (groupId: string, role: any) => {
    const res = await assignGroupRole(accessToken!, groupId, [{ id: role.id, name: role.name }]);
    setMsg(res.ok ? `Role "${role.name}" assigned to group. Members now inherit this role.` : `Error: ${res.data?.error || 'Failed'}`);
    loadData();
  };

  if (loading) return <p style={{ color: '#666' }}>Loading…</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Roles & Groups</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>
            {isAdmin ? 'Manage groups and assign roles. Groups bundle users so roles can be assigned in bulk.' : 'View roles and groups.'}
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {(['groups', 'roles'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 20px',
              border: `2px solid ${activeTab === tab ? '#0f172a' : '#e2e8f0'}`,
              borderRadius: 8,
              background: activeTab === tab ? '#0f172a' : '#fff',
              color: activeTab === tab ? '#fff' : '#334155',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Groups tab */}
      {activeTab === 'groups' && (
        <div>
          {/* Concept box */}
          <div style={{
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: 10,
            padding: 16,
            marginBottom: 24,
            fontSize: 13,
            color: '#0c4a6e',
          }}>
            <strong>Groups are a management convenience, not an authorization concept.</strong>
            {' '}Assign roles to a group, and members inherit them. Services should authorize on
            roles (what lands in the token), not on group membership. Groups sit one level
            above roles as a way to manage them. See keycloak-mapped.md, lines 276-284.
          </div>

          {/* Create group (admin only) */}
          {isAdmin && (
            <div style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: 20,
              marginBottom: 24,
            }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Create a group</h2>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Group name</label>
                  <input
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    placeholder="e.g. Acme Tax Team"
                    style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, width: 240 }}
                  />
                </div>
                <button onClick={handleCreateGroup} style={{
                  padding: '10px 20px',
                  background: '#0f172a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  height: 42,
                }}>
                  Create Group
                </button>
              </div>
            </div>
          )}

          {/* Groups list */}
          {groups.map((group: any) => (
            <div key={group.id} style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: 20,
              marginBottom: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 600 }}>{group.name}</h3>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    Path: {group.path}
                  </div>
                </div>
                <div>
                  {(group.realmRoles || []).map((r: any) => (
                    <RoleBadge key={typeof r === 'string' ? r : r.name} role={typeof r === 'string' ? r : r.name} />
                  ))}
                </div>
              </div>

              {/* Inheritance note */}
              {(group.realmRoles || []).length > 0 && (
                <div style={{
                  marginTop: 12,
                  padding: '10px 14px',
                  background: '#f0fdf4',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#065f46',
                }}>
                  Members of <strong>{group.name}</strong> inherit:{' '}
                  {(group.realmRoles || []).map((r: any) => typeof r === 'string' ? r : r.name).join(', ')}
                  . These roles appear in the user's realm_access.roles claim in their access token.
                </div>
              )}

              {/* Assign role (admin only) */}
              {isAdmin && (
                <div style={{ marginTop: 12 }}>
                  <select
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const role = realmRoles.find((r: any) => r.name === e.target.value);
                      if (role) handleAssignRoleToGroup(group.id, role);
                      e.target.value = '';
                    }}
                    style={{ fontSize: 12, padding: '6px 12px', borderRadius: 4, border: '1px solid #e2e8f0' }}
                  >
                    <option value="">+ Assign role to group</option>
                    {realmRoles.filter((r: any) => r.name !== 'default-roles-demo').map((r: any) => (
                      <option key={r.id} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}

          {groups.length === 0 && (
            <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>
              No groups yet. {isAdmin && 'Create one to bundle roles for your team.'}
            </p>
          )}
        </div>
      )}

      {/* Roles tab */}
      {activeTab === 'roles' && (
        <div>
          <div style={{
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: 10,
            padding: 16,
            marginBottom: 24,
            fontSize: 13,
            color: '#0c4a6e',
          }}>
            <strong>Roles are the authorization primitive that services check.</strong>
            {' '}Realm roles are global to the realm. Your services read these off the validated
            token under realm_access.roles and authorize on them. Groups assign roles in bulk;
            what flows to the service is still the role.
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {realmRoles.map((role: any) => (
              <div key={role.id} style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RoleBadge role={role.name} />
                    {role.composite && (
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>(composite)</span>
                    )}
                  </div>
                  {role.description && (
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                      {role.description}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {role.name === 'default-roles-demo' ? 'Default — assigned to all users' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
