# Not for production

This repo teaches. It deliberately cuts corners a real deployment must not.

- HTTP, not HTTPS. Everything runs over plain HTTP on `*.demo.local`. Real
  deployments require TLS end to end; tokens over plain HTTP are exposed.
- Committed secrets. Client secrets and admin passwords are fake values in
  `k8s/secrets.yaml` and the realm export, committed for reproducibility. Real
  secrets come from a secret manager and never touch git.
- `start-dev`. Keycloak runs in dev mode (`start-dev`), which disables several
  production safeguards and hostname strictness. Production uses `start` with a
  proper hostname and TLS configuration.
- Single replicas. One Keycloak, one Postgres. No high availability.
- Local Postgres in-cluster. Fine for a demo; production uses a managed
  database with backups.
- Tokens in localStorage. The React app stores tokens in localStorage via
  `oidc-client-ts`. A real app should use secure storage (iOS Keychain,
  Android Keystore, or a BFF pattern).
- No rate limiting, no brute-force tuning, no logging/observability, no network
  policies.
- The admin-service enforces role checks (`company-admin`) but does not yet
  enforce cross-organization tenant boundaries — it returns all users in the
  realm rather than filtering by the caller's organization. A real
  implementation must verify org membership against the database, not just
  the token claim, and scope all operations to the caller's tenant.

Use this to understand the flows, then build the real thing with the corners
uncut.
