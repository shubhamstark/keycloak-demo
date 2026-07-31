// oidc-config.ts — oidc-client-ts UserManager setup.
//
// Tajir uses pure token-based auth (no sessions, like a mobile app).
// ID token + refresh token stored in localStorage, access token in memory.
// Refresh rotation keeps the user logged in without SSO cookies.
//
// Key decisions:
// - prompt=login: always show login form (mobile apps don't use SSO)
// - No server-side session — logout just deletes tokens
// - automaticSilentRenew=false — we use refresh token grant manually
// - loadUserInfo=false — claims come in the ID token

import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { config } from '../config';

export const userManager = new UserManager({
  authority: config.issuer,
  client_id: config.clientId,
  redirect_uri: config.redirectUri,
  post_logout_redirect_uri: config.postLogoutRedirectUri,
  response_type: 'code',
  scope: config.scope,
  prompt: 'login',
  loadUserInfo: false,
  automaticSilentRenew: false,

  // localStorage simulates iOS Keychain / Android Keystore.
  userStore: new WebStorageStateStore({ store: window.localStorage }),
});
