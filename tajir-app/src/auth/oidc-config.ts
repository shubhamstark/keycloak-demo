// oidc-config.ts — oidc-client-ts UserManager setup.
//
// Tajir uses token-based auth (no sessions). Tokens are stored in
// localStorage and kept fresh via refresh token rotation. This is the
// same pattern as login-mobile but with a proper OIDC client library.
// See keycloak-mapped.md, lines 456–539 ("Sessions, refresh, and token
// lifespans") and docs/MOBILE.md.
//
// Key decisions:
// - response_type=code (authorization code + PKCE)
// - loadUserInfo=false (claims come in the ID token, not a separate call)
// - automaticSilentRenew=true (keeps tokens fresh via iframe-based refresh)
// - No session cookie — we use refresh tokens instead.

import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { config } from '../config';

export const userManager = new UserManager({
  authority: config.issuer,
  client_id: config.clientId,
  redirect_uri: config.redirectUri,
  post_logout_redirect_uri: config.postLogoutRedirectUri,
  response_type: 'code',
  scope: config.scope,
  loadUserInfo: false,
  automaticSilentRenew: true,
  silent_redirect_uri: config.redirectUri + 'silent-renew.html',

  // Token-based auth: store tokens in localStorage, not sessionStorage.
  // sessionStorage is ephemeral (lost on tab close); localStorage persists
  // across page reloads, simulating mobile keychain storage.
  userStore: new WebStorageStateStore({ store: window.localStorage }),

  // PKCE is mandatory for public clients.
  // oidc-client-ts enables it by default when response_type=code.
});
