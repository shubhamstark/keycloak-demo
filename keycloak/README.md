# keycloak

Configuration for the Keycloak side of the demo. The one file that matters is
`realm-export.json`: it is the source of truth for the realm and is imported at
startup (`start-dev --import-realm`).

## Why a realm export instead of clicking the console

Reproducibility. Everything the demo needs, clients, client scopes, protocol
mappers, users, service accounts, is declared here, so anyone can bring the
system up identically. If you change realm behaviour, change it here and
re-import, rather than hand-editing in the admin console. (You can still explore
the console at `http://keycloak.demo.local`, admin / admin.)

## What is declared, and why

Three clients, matching the three roles from the articles:

- `login-web` public client (the SPA). No secret, PKCE enforced (S256). Does
  authorization code + PKCE.
- `music-service` confidential client. Service accounts enabled (for client
  credentials) and standard token exchange enabled (for RFC 8693). Its tokens
  are also what music-service validates as a resource server.
- `recommendation-service` confidential client for the downstream resource
  server, mostly an identity to aud tokens at.

Two client scopes carry the audience mappers, which are the crux of the whole
demo:

- `music-audience` puts `aud: music-service` into login-web's tokens, so
  music-service's audience check passes.
- `recommendation-audience` puts `aud: recommendation-service` into the tokens
  music-service obtains for the downstream call.

These audience mappers are where the confused-deputy defence is configured: the
token names the resource server it is for, and each service rejects tokens not
aud'd at it.

One user, `shubham` (password `password`), for logging in through the SPA.

## Secrets

The client secrets here are fake, demo-only values, duplicated in
`k8s/secrets.yaml` where the services read them. Never replace them with real
secrets in a committed file.

## Token exchange note

Standard Token Exchange V2 (RFC 8693) is enabled per-client via
`standard.token.exchange.enabled` on `music-service` and is supported by default
in Keycloak 26.2+. No server build-time feature flag is required.
