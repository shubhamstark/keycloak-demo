# CLAUDE.md

Guidance for AI agents working in this repository. Read this before making changes.

## What this repo is

A teaching demo for OAuth 2.0 and OpenID Connect on Keycloak, deployed to
minikube. It is the runnable companion to a series of articles. Clarity beats
cleverness everywhere: this code is read more than it is run. If a change makes
the auth flow harder to follow, it is probably the wrong change.

## Golden rules

- Do not add a database or persistence layer to the two Go services. They serve
  in-memory data on purpose, so the reader's attention stays on auth. Favourites
  and recommendations are hardcoded maps.
- Do not weaken token validation to "make it work". Every service must verify
  signature, `iss`, `aud`, and `exp` on every request. If validation fails,
  return 401, never fall through. The whole point of the demo is that these
  checks are non-negotiable (see the OIDC article's "decoding is not trusting").
- Keep secrets out of committed code except in the clearly-marked demo realm
  export and k8s Secret, which use obviously fake values. Never introduce a real
  credential. If a change needs a secret, it goes in `k8s/secrets.yaml` as a
  placeholder and is documented.
- Do not silently upgrade the Keycloak image tag. It is pinned deliberately
  (26.3). If you bump it, verify Standard Token Exchange V2 behaviour still
  holds and update `README.md` and `docs/`.

## Architecture in one paragraph

`login-web` (public SPA client) does authorization code + PKCE and ends up with a
user access token. It calls `music-service` (resource server) with it.
`music-service` validates the token against Keycloak's JWKS. When `music-service`
needs `recommendation-service`, it uses one of two service-to-service patterns:
client credentials (acting as itself) or standard token exchange (acting on
behalf of the user). `recommendation-service` validates and enforces that the
token's audience is itself.

## Where things live

- `k8s/` one manifest per component. Names match the diagrams in `docs/`.
- `keycloak/realm-export.json` the source of truth for realm config: clients,
  client scopes, protocol mappers, users, service accounts. Change realm
  behaviour here, not by hand-clicking the admin console (document why in the PR).
- `music-service/` and `recommendation-service/` Go, standard library plus a
  JWT/JWKS library. Auth logic is isolated in `auth.go` in each.
- `login-web/` plain HTML/JS, no framework, no build step. The PKCE logic is in
  `app.js` and is meant to be read top to bottom.
- `docs/` prose. `AUTH-FLOWS.md` is the canonical description of the three flows.

## When you change auth behaviour

1. Update the realm export if it involves clients, scopes, mappers, or accounts.
2. Update the relevant service's `auth.go`.
3. Update `docs/AUTH-FLOWS.md` so the prose still matches the wire.
4. Keep the three docs (`ARCHITECTURE.md`, `AUTH-FLOWS.md`, `RUNNING.md`)
   internally consistent.

## What good looks like

A reader can open any one file and understand its job without reading the others.
Auth steps are commented with the concept they implement ("PKCE: send the
challenge, keep the verifier"). Nothing is magic; everything maps to a named idea
from the articles.
