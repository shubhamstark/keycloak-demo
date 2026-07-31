# CLAUDE.md

Guidance for AI agents working in this repository. Read this before making changes.

## What this repo is

A teaching demo for OAuth 2.0 and OpenID Connect on Keycloak, deployed to
minikube. The domain is **Tajir**, a B2B platform where companies manage
banking, VAT filing, and team access. It is the runnable companion to
`keycloak-mapped.md`. Clarity beats cleverness everywhere: this code is
read more than it is run. If a change makes the auth flow harder to follow,
it is probably the wrong change.

## Golden rules

- Do not add a database or persistence layer to the two Go services. They serve
  in-memory data on purpose, so the reader's attention stays on auth. Bank
  accounts and VAT filings are hardcoded.
- Do not weaken token validation to "make it work". Every service must verify
  signature, `iss`, `aud`, and `exp` on every request. If validation fails,
  return 401, never fall through. The whole point of the demo is that these
  checks are non-negotiable (see `keycloak-mapped.md`, "decoding is not trusting").
- Keep secrets out of committed code except in the clearly-marked demo realm
  export and k8s Secret, which use obviously fake values. Never introduce a real
  credential. If a change needs a secret, it goes in `k8s/secrets.yaml` as a
  placeholder and is documented.
- Do not silently upgrade the Keycloak image tag. It is pinned deliberately
  (26.3). If you bump it, verify Standard Token Exchange V2 behaviour still
  holds and update `README.md` and `docs/`.

## Architecture in one paragraph

`tajir-app` (React SPA, public client) does authorization code + PKCE via
`oidc-client-ts` and ends up with a user access token. It calls
`dashboard-service` (resource server) with it. `dashboard-service` validates
the token against Keycloak's JWKS. When `dashboard-service` needs
`admin-service`, it uses token exchange (acting on behalf of the user).
`admin-service` validates and enforces org boundaries, then calls Keycloak's
Admin REST API using client credentials (acting as itself). Auth is token-based:
no sessions, refresh rotation, localStorage persistence.

## Where things live

- `tajir-app/` React SPA: Vite + React + oidc-client-ts. Token-based auth
  with refresh rotation. Pages: Dashboard, Token Inspector, API Explorer,
  Refresh Demo, Users & Orgs, Roles & Groups.
- `k8s/` one manifest per component. Names match the diagrams in `docs/`.
- `keycloak/realm-export.json` the source of truth for realm config: clients,
  client scopes, protocol mappers, roles, groups, organizations, users, service
  accounts. Change realm behaviour here, not by hand-clicking the admin console
  (document why in the PR).
- `dashboard-service/` and `admin-service/` Go, standard library plus a
  JWT/JWKS library. Auth logic is isolated in `auth.go` in each.
- `docs/` prose. `AUTH-FLOWS.md` is the canonical description of the three flows.

## When you change auth behaviour

1. Update the realm export if it involves clients, scopes, mappers, or accounts.
2. Update the relevant service's `auth.go`.
3. Update the React app's `config.ts` (scopes, issuer, clientId) and
   `auth/oidc-config.ts` (OIDC client settings) if the change affects what
   the SPA requests or how it talks to Keycloak.
4. Update `docs/AUTH-FLOWS.md` so the prose still matches the wire.
5. Keep the three docs (`ARCHITECTURE.md`, `AUTH-FLOWS.md`, `RUNNING.md`)
   internally consistent.
6. Update `keycloak-mapped.md` if the change affects a concept it describes.

## What good looks like

A reader can open any one file and understand its job without reading the others.
Auth steps are commented with the concept they implement ("Token exchange: the
returned token has the same sub but new aud"). Nothing is magic; everything maps
to a named idea from the articles.
