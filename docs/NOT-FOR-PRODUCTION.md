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
- Single replicas. One Keycloak, one Postgres. No high availability. See the
  Keycloak HA guide (and the stateless / multi-cluster work in 26.7+) for real
  setups.
- Local Postgres in-cluster. Fine for a demo; production typically uses a managed
  database with backups.
- Tokens in browser memory. `login-web` keeps tokens in a JS variable and has no
  refresh handling. A real SPA must think hard about token storage and refresh,
  or use a backend-for-frontend.
- No rate limiting, no brute-force tuning, no logging/observability, no network
  policies.

Use this to understand the flows, then build the real thing with the corners
uncut.
