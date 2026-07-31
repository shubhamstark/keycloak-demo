// admin.ts — API calls to the admin-service.
//
// Admin operations go through admin-service (never directly to Keycloak).
// This is the delegated admin pattern from keycloak-mapped.md: the backend
// holds the service account with management roles and enforces tenant
// boundaries. The React app only sends the user's token — the admin-service
// exchanges it / verifies it before calling Keycloak's Admin REST API.

import { config } from '../config';

const BASE = config.adminServiceUrl;

async function apiCall(method: string, path: string, token: string, body?: any): Promise<any> {
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  return {
    status: res.status,
    ok: res.ok,
    data,
    curl: `curl -s -X ${method} -H "Authorization: Bearer ${token.substring(0, 30)}..." ${BASE}${path}`,
  };
}

export async function getTeam(token: string) {
  return apiCall('GET', '/api/team', token);
}

export async function createUser(token: string, user: { username: string; email: string; password: string }) {
  return apiCall('POST', '/api/users', token, user);
}

export async function getRoles(token: string) {
  return apiCall('GET', '/api/roles', token);
}

export async function assignRole(token: string, userId: string, roles: { id: string; name: string }[]) {
  return apiCall('POST', `/api/users/${userId}/roles`, token, { roles });
}

export async function removeRole(token: string, userId: string, roles: { id: string; name: string }[]) {
  return apiCall('DELETE', `/api/users/${userId}/roles`, token, { roles });
}

export async function getGroups(token: string) {
  return apiCall('GET', '/api/groups', token);
}

export async function createGroup(token: string, name: string) {
  return apiCall('POST', '/api/groups', token, { name });
}

export async function assignGroupRole(token: string, groupId: string, roles: { id: string; name: string }[]) {
  return apiCall('POST', `/api/groups/${groupId}/roles`, token, { roles });
}

export async function getOrganizations(token: string) {
  return apiCall('GET', '/api/organizations', token);
}
