# keycloak-demo

A small, runnable system that shows how OAuth 2.0 and OpenID Connect actually work
in Keycloak. It is the concrete companion to the "OAuth from first principles",
"OpenID Connect", and "Keycloak architecture" articles: every abstract role from
those pieces is a real process you can watch here.

## What is in the box

Four services, deployed to a local Kubernetes cluster (minikube), plus Keycloak
and its Postgres database.

| Component | Role in OAuth / OIDC terms | What it demonstrates |
|---|---|---|
| `keycloak` | Authorization server + OIDC provider | Issues and signs tokens, hosts the login page |
| `postgres` | Keycloak's durable state | Realms, users, clients, keys, sessions |
| `login-web` | Public client (SPA) | Authorization code + PKCE, reads the ID token |
| `music-service` | Resource server, and a client | Validates access tokens via JWKS; calls other services |
| `recommendation-service` | Resource server | Only accepts tokens minted for it (audience check) |

## The two things it proves

1. User-to-service auth. The browser logs in through `login-web` using
   authorization code + PKCE, then calls `music-service` with the resulting
   access token. `music-service` validates that token against Keycloak's JWKS.

2. Service-to-service auth, in the two forms that matter:
   - Client credentials: `music-service` calls `recommendation-service` as
     itself, using its own client id and secret. The token's subject is the
     service account, not a user.
   - Standard token exchange (RFC 8693): `music-service` takes the user's token
     and exchanges it at Keycloak for a new token whose audience is
     `recommendation-service`, so the downstream call still carries the user's
     identity.

See `docs/AUTH-FLOWS.md` for the step-by-step of all three flows.

## Quick start

Prerequisites: `minikube`, `kubectl`, and `docker`. See `docs/RUNNING.md` for the
full walkthrough. The short version:

```
minikube start
kubectl apply -f k8s/
# wait for pods, then import the realm (see docs/RUNNING.md)
```

## Layout

```
k8s/                     raw Kubernetes manifests, one file per component
keycloak/                realm export (clients, scopes, users) + notes
login-web/               the SPA public client (plain HTML/JS)
music-service/           Go resource server that also calls downstream services
recommendation-service/  Go resource server, downstream target
docs/                    architecture, auth flows, running guide
```

Each folder has its own README. Start with `docs/RUNNING.md` to bring it up, then
`docs/AUTH-FLOWS.md` to understand what is happening on the wire.

## Versions

Pinned to Keycloak 26.3 (`quay.io/keycloak/keycloak:26.3`). Keycloak has no LTS
release and only the newest minor gets security fixes, so treat this as a
starting point and track the current release for anything real. Standard Token
Exchange V2 (used here) is enabled by default from Keycloak 26.2 onward.

This is a teaching demo. It cuts corners that a production deployment must not:
see `docs/NOT-FOR-PRODUCTION.md`.
