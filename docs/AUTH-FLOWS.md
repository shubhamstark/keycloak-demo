# Auth flows

This is the canonical, on-the-wire description of the three flows the Tajir
demo shows. Keep it in sync with the code (see `CLAUDE.md`).

## Flow 1: user-to-service (authorization code + PKCE)

The Tajir React SPA logs a user in and calls `dashboard-service` as that user.

1. `tajir-app` (via `oidc-client-ts`) performs PKCE: code verifier, challenge,
   state, nonce. Redirects browser to Keycloak's authorization endpoint with
   `scope=openid profile email dashboard-audience offline_access organization`.
2. The user authenticates on Keycloak. Keycloak redirects back with a
   single-use `code`.
3. `oidc-client-ts` checks `state`, then POSTs the code plus the
   `code_verifier` to the token endpoint. Back come `access_token`,
   `id_token`, `refresh_token`.
4. `tajir-app` stores tokens in localStorage (token-based auth, no sessions).
5. `tajir-app` calls `GET /dashboard` on dashboard-service with
   `Authorization: Bearer <access_token>`.
6. `dashboard-service` validates the access token: signature via JWKS, `iss`,
   `aud` (must include `dashboard-service`), `exp`. It reads `sub`, `organization`,
   and `realm_access.roles` and returns data scoped to the user's company.

The token represents a user from a specific company. `dashboard-service` knows
both who the user is (`sub`) and which company they belong to (`organization`).

## Flow 2: service-to-service (standard token exchange, RFC 8693)

Triggered by `GET /dashboard/team` in the Tajir React app.

`dashboard-service` needs to list team members from `admin-service`, and it
must do so on behalf of the user so the admin-service knows which company's
team to return.

1. `dashboard-service` POSTs to the token endpoint with
   `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`,
   `subject_token=<the user's access token>`,
   `subject_token_type=...:access_token`, and
   `audience=admin-service`. It authenticates with its own client credentials.
2. Keycloak (Standard Token Exchange V2) returns a new access token whose
   subject is still the original user, aud'd at `admin-service`.
3. `dashboard-service` calls `admin-service` with that token.
4. `admin-service` validates it and sees the real user's `sub` and
   `organization`, with `dashboard-service` recorded as the authorized party.

Use this when the downstream service needs the user's identity and tenant.

## Flow 3: service-to-service (client credentials)

Triggered internally when `admin-service` needs to call Keycloak's Admin REST API.

`admin-service` needs to manage users, roles, and groups in Keycloak. This is
a machine-to-machine call: no user, no browser.

1. `admin-service` POSTs to the token endpoint with
   `grant_type=client_credentials`, its own `client_id` and `client_secret`,
   and implicitly gets a token for `realm-management`.
2. Keycloak returns an access token whose subject is `service-account-admin-service`
   and which carries realm-management roles (`manage-users`, `view-users`, etc.).
3. `admin-service` calls Keycloak's Admin REST API with that token.
4. Keycloak validates it and authorizes the management operations.

**Before making any Admin API call, `admin-service` enforces the tenant
boundary in code.** The caller's token (from Flow 1 or 2) provides the
user identity and organization; the admin-service checks that the caller
is a company-admin and that the target user is in the same organization.
Only then does it call the Admin API. This is the delegated admin pattern
from `keycloak-mapped.md`, lines 350-425.

## Token-based auth (no sessions)

Tajir uses token-based authentication. There is no `AUTH_SESSION_ID` cookie
and no server-side session.

- **Persistent tokens**: access and refresh tokens are stored in localStorage
  via `oidc-client-ts`.
- **Refresh rotation**: when the access token expires, `oidc-client-ts`
  silently refreshes it. Each refresh gets a new refresh token. The old
  one is invalidated server-side.
- **Replay detection**: if a leaked refresh token is reused, Keycloak
  detects it and revokes the entire grant.
- **Logout**: deletes local tokens. No server-side session to destroy.

## The one-line contrast

- Client credentials: "I am admin-service."
- Token exchange: "I am dashboard-service, acting for user X from company Y."

## What every service does the same

Every resource server (both Go services) validates every token the same way:
signature via JWKS, then `iss`, `aud`, `exp`. There is no path that trusts a
token without validating it. That is the point.

## The delegated admin boundary

The critical design point from the article (lines 367-374): Keycloak's Admin API
can touch every user in the realm with the service-account token. It does not by
itself know that Acme's admin may only manage Acme's users. So admin-service is
the gate. It enforces:
1. Is this caller a company-admin?
2. Is the target user in the same organization as the caller?

Only if both hold does it call Keycloak's Admin API. This is what most B2B
products do.
