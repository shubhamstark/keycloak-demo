# Architecture

How the pieces fit, and how each maps to OAuth / OIDC concepts.

## The domain

**Tajir** is a B2B platform that helps companies with business services:
opening bank accounts, filing VAT returns, and managing team access.
Multiple companies use Tajir, each with their own users and roles.

The domain directly maps to the multi-tenancy, organizations, delegated
admin, and token-exchange stories in `keycloak-mapped.md`.

## The components

```
               browser (Tajir React SPA)
                    |
        (1) authorization code + PKCE
                    |
              +-----------+
              |  Keycloak |  authorization server + OIDC provider
              |  (Quarkus)|  issues + signs tokens, hosts login
              +-----------+
                    |
              +-----------+
              | Postgres  |  durable source of truth (realm, users, sessions)
              +-----------+

 browser --Bearer access token--> dashboard-service  (business API)
                                      |
                       (2) token exchange (RFC 8693)
                                      |
                               admin-service  (delegated admin backend)
                                      |
                       (3) client credentials
                                      |
                               Keycloak Admin REST API
```

## The three flows

All three are described step-by-step in `AUTH-FLOWS.md`.

### 1. User-to-service (authorization code + PKCE)

The Tajir React SPA (a public client with no secret) logs in via Keycloak, gets
an access token, and calls dashboard-service with it.

- `tajir-app` uses `oidc-client-ts` for PKCE: code verifier + challenge, state,
  nonce. No sessions — token-based auth with refresh tokens.
- Keycloak authenticates the user and returns an authorization code.
- `oidc-client-ts` exchanges the code for tokens (access + ID + refresh).
- The ID token is decoded and displayed. The access token is sent to
  `dashboard-service` in an `Authorization: Bearer` header.
- `dashboard-service` validates the token: signature (JWKS), issuer, audience,
  expiry. It derives the user's organization first from the `organization`
  claim (when present) and falls back to the email domain (e.g.
  `shubham@acme.com` → `acme`). It returns data scoped to that company.

### 2. Direct forwarding / token exchange (service on behalf of user)

When `dashboard-service` needs to call `admin-service` (e.g. to list team
members), it must preserve the user's identity (`sub`) and organization.
The demo shows two approaches:

**Direct forwarding** (used by `/dashboard/team`): the user's access token
already carries `admin-service` in its audience (the SPA requests the
`admin-audience` scope at login), so `dashboard-service` forwards the token
directly — no exchange step needed.

**Token exchange** (RFC 8693, implemented in `downstream.go`): when a
token does NOT have the downstream audience, `dashboard-service` exchanges
it for one that does.

- `dashboard-service` POSTs to Keycloak's token endpoint with
  `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`.
- Keycloak returns a token with the same `sub` but `aud=admin-service`
  and `azp=dashboard-service`.
- `admin-service` validates it and sees the real user.

Both paths preserve user identity and organization downstream.

### 3. Client credentials (service as itself)

`admin-service` holds a service account with Keycloak management roles
(`manage-users`, `view-users`, etc.). When it needs to call Keycloak's
Admin REST API, it gets a token via `grant_type=client_credentials`.

- The resulting token has `sub=service-account-admin-service`,
  `aud=realm-management`, and the management roles.
- No user identity is present — this is machine-to-machine.
- `admin-service` enforces tenant boundaries in code before calling
  Keycloak's Admin API. The service account can touch every user in
  the realm; the handlers layer decides which users to touch.

## Token-based auth (no sessions)

Tajir uses token-based authentication, not sessions:
- Tokens (access, ID, refresh) are stored in localStorage by `oidc-client-ts`.
- Tokens survive page reloads (simulating mobile keychain storage).
- Access tokens are short-lived (5 min). Refresh tokens are rotated on each use.
- Logout deletes local tokens — there is no server-side session to destroy.
- The `offline_access` scope enables long-lived refresh tokens.

See `RefreshDemo` page and `keycloak-mapped.md`, lines 456-539.

## Token validation (both Go services)

Every request to `dashboard-service` or `admin-service` goes through the
same checks:

1. **Signature**: fetch JWKS from Keycloak, verify the JWT signature
2. **Issuer**: must match `http://keycloak.demo.local/realms/demo`
3. **Audience**: must match the service's own audience (`dashboard-service` or
   `admin-service`). This single check defeats the confused deputy problem.
4. **Expiry**: handled by `go-oidc`

## Audience mapping

Client scopes add audience claims to access tokens:

| Scope | Mapper | Adds |
|---|---|---|
| `dashboard-audience` | `oidc-audience-mapper` | `aud: dashboard-service` |
| `dashboard-audience` | `oidc-usermodel-realm-role-mapper` | `realm_access.roles` |
| `admin-audience` | `oidc-audience-mapper` | `aud: admin-service` |

The `dashboard-audience` scope is a default scope on `tajir-app` and carries
both the audience mapper AND the realm-roles mapper. The SPA explicitly
requests `admin-audience` in its scope parameter so the access token also
includes `aud: admin-service`, enabling direct forwarding to `admin-service`
(Flow 2). The `organization` scope adds the org claim so services know which
tenant the user belongs to.

## Identity propagation

| Pattern | Token subject | Caller identity downstream |
|---|---|---|
| User calls dashboard-service | User (e.g. `shubham`) | User authenticated at `tajir-app` |
| dashboard → admin (direct forward) | User (`shubham`) | User, token passed through |
| dashboard → admin (token exchange) | User (`shubham`) | `dashboard-service` on behalf of user |
| admin → Keycloak Admin API (client creds) | Service account | `admin-service` acting as itself |

## Multi-tenancy

Companies are Keycloak organizations. Each user belongs to one organization
(their employer). The `organization` claim in the access token tells services
which company the user is acting for.

- **Acme Corp**: shubham (company-admin), alice (tax-filer)
- **Globex Industries**: bob (viewer)

Company admins can manage users within their own organization via the
delegated admin pattern: Tajir React app → admin-service → Keycloak Admin API.

## Roles & groups

| Role | Description | Who has it |
|---|---|---|
| `company-admin` | Can manage users and roles in their company | shubham (via Acme Admins group) |
| `tax-filer` | Can file and view VAT returns | alice (via Acme Tax Team group) |
| `viewer` | Read-only access to company services | bob |

Groups bundle users so roles can be assigned in bulk. Services authorize on
roles, not groups. The role lands in the token's `realm_access.roles` claim.

## On Kubernetes

Each component is a Deployment plus a Service. One Ingress gives each a
stable hostname:
- `keycloak.demo.local` — Keycloak
- `app.demo.local` — Tajir React SPA
- `api.demo.local` — dashboard-service
- `admin.demo.local` — admin-service

CoreDNS is patched at cluster bootstrap (`make cluster`) so pods can resolve
these hostnames. The host machine needs `/etc/hosts` entries pointing to
`127.0.0.1` (the minikube tunnel endpoint).

Keycloak is pinned to `quay.io/keycloak/keycloak:26.3`.

## Hostname consistency

The token's `iss` claim is `http://keycloak.demo.local/realms/demo`. Every
party — browser, Go services, and Keycloak itself — sees Keycloak at this
same hostname. This ensures token validation never fails with an issuer
mismatch.

See `RUNNING.md` to stand it up on minikube, and `AUTH-FLOWS.md` for what
happens on the wire.
