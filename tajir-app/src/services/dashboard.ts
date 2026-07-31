// dashboard.ts — API calls to the dashboard-service.
//
// Every call sends the user's access token in the Authorization header.
// dashboard-service validates the token, extracts the user's organization
// and roles, and returns data scoped to that company.

import { config } from '../config';

const BASE = config.dashboardServiceUrl;

function decodeTokenForLog(token: string, label: string) {
  try {
    const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    console.group(`🔐 ${label}`);
    console.log('sub:', p.sub);
    console.log('aud:', p.aud);
    console.log('azp:', p.azp);
    console.log('organization:', p.organization);
    console.log('realm_access:', p.realm_access);
    console.log('email:', p.email);
    console.log('scope:', p.scope);
    console.log('exp:', new Date(p.exp * 1000).toLocaleTimeString());
    console.log('iat:', new Date(p.iat * 1000).toLocaleTimeString());
    console.log('full payload:', p);
    console.groupEnd();
  } catch {}
}

async function apiCall(path: string, token: string): Promise<any> {
  decodeTokenForLog(token, `dashboard → ${path}`);

  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = await res.text();
  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    data = { raw: body };
  }

  return {
    status: res.status,
    ok: res.ok,
    data,
    curl: `curl -s -H "Authorization: Bearer ${token.substring(0, 30)}..." ${BASE}${path}`,
  };
}

export async function getDashboard(token: string) {
  return apiCall('/dashboard', token);
}

export async function getBanking(token: string) {
  return apiCall('/dashboard/banking', token);
}

export async function getTax(token: string) {
  return apiCall('/dashboard/tax', token);
}

export async function getTeam(token: string) {
  return apiCall('/dashboard/team', token);
}
