// config.ts — OIDC and service endpoint configuration for Tajir.
//
// All values use the demo's real hostnames so a reader can run against
// the cluster described in docs/RUNNING.md. The issuer, clientId, and
// redirectUri match the realm-export.json configuration.

export const config = {
  issuer: 'http://keycloak.demo.local/realms/demo',
  clientId: 'tajir-app',
  redirectUri: 'http://app.demo.local/',
  postLogoutRedirectUri: 'http://app.demo.local/',

  // Service endpoints
  dashboardServiceUrl: 'http://api.demo.local',
  adminServiceUrl: 'http://admin.demo.local',

  // OIDC scopes requested at login.
  // - openid: gets us the ID token
  // - profile: user claims (name, preferred_username)
  // - email: email, email_verified
  // - dashboard-audience: adds aud=dashboard-service to the access token
  // - offline_access: enables refresh tokens (token-based auth, no sessions)
  // - organization: adds the organization claim (tenant identity)
  scope: 'openid profile email dashboard-audience offline_access organization',
};
