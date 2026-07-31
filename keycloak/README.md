# keycloak

Configuration for the Keycloak side of the Tajir demo. The one file that matters
is `realm-export.json`: it is the source of truth for the realm and is imported
at startup (`start-dev --import-realm`).

## Why a realm export instead of clicking the console

Reproducibility. Everything the demo needs — clients, client scopes, protocol
mappers, roles, groups, organizations, users, service accounts — is declared
here, so anyone can bring the system up identically. If you change realm
behaviour, change it here and re-import, rather than hand-editing in the admin
console. (You can still explore the console at `http://keycloak.demo.local`,
admin / admin.)

## What is declared, and why

**Four clients**, matching the roles from the article:

- `tajir-app` public client (React SPA). No secret, PKCE enforced (S256). Does
  authorization code + PKCE. Token-based auth (no sessions).
- `dashboard-service` confidential client. Service accounts enabled and standard
  token exchange enabled (for RFC 8693). Its tokens are also what
  dashboard-service validates as a resource server.
- `admin-service` confidential client. Service account with realm-management
  roles (`manage-users`, `view-users`, etc.) for the delegated admin pattern.
- `login-mobile` public client for the phone-styled mobile auth demo.

**Client scopes** carry the audience mappers and organization mapper:

- `dashboard-audience` puts `aud: dashboard-service` into tajir-app's tokens,
  so dashboard-service's audience check passes.
- `admin-audience` puts `aud: admin-service` into dashboard-service's tokens.
- `organization` adds the `organization` claim for multi-tenancy.
- `profile`, `email`, `web-origins` — standard OIDC built-in scopes.

**Roles and groups:**

- `company-admin`, `tax-filer`, `viewer` — realm roles for authorization.
- `Acme Admins` and `Acme Tax Team` — groups that assign roles in bulk.

**Organizations:** `acme` (Acme Corp) and `globex` (Globex Industries) for
multi-tenancy.

**Three users:** `shubham` (admin@acme), `alice` (tax-filer@acme),
`bob` (viewer@globex). All with password `password`.

## Secrets

The client secrets here are fake, demo-only values, duplicated in
`k8s/secrets.yaml` where the services read them. Never replace them with real
secrets in a committed file.

## Token exchange note

Standard Token Exchange V2 (RFC 8693) is enabled per-client via
`standard.token.exchange.enabled` on `dashboard-service` and is supported by
default in Keycloak 26.2+. No server build-time feature flag is required.
