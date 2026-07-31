// dashboard.ts — API calls to the dashboard-service.
//
// Every call sends the user's access token in the Authorization header.
// dashboard-service validates the token, extracts the user's organization
// and roles, and returns data scoped to that company.

import { config } from '../config';

const BASE = config.dashboardServiceUrl;

async function apiCall(path: string, token: string): Promise<any> {
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
    // Return the curl equivalent for teaching.
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
