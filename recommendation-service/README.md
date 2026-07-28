# recommendation-service

A pure OAuth 2.0 resource server. It is the downstream service in the demo: the
thing `music-service` calls. Its whole purpose is to show what a resource server
does and, just as importantly, what it refuses to do.

## What it does

- Exposes `GET /recommendations`, protected by a bearer access token.
- Validates every token: signature (via Keycloak's JWKS), issuer, audience,
  expiry. See `auth.go`. Validation failure is always a 401.
- Enforces that the token's audience is `recommendation-service`. A token minted
  for some other service is rejected even though it is validly signed.
- Serves hardcoded, in-memory recommendations. There is no database on purpose.

## What it does not do

- It never logs a user in.
- It never calls Keycloak's token endpoint.
- It holds no client secret for request-serving.

## Why the audience check matters

`music-service` can reach this service in two ways (see `docs/AUTH-FLOWS.md`):
client credentials (token subject is the service account) or token exchange
(token subject is the end user). In both cases the token's audience must include
`recommendation-service`, which is exactly what stops a token meant for something
else from being replayed here.

## Config (environment variables)

| Variable | Example | Meaning |
|---|---|---|
| `OIDC_ISSUER` | `http://keycloak/realms/demo` | Realm issuer URL |
| `OIDC_AUDIENCE` | `recommendation-service` | Required token audience |
| `PORT` | `8081` | Listen port |
