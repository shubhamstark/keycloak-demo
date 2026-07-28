# keycloak-demo

A small, runnable system that shows how OAuth 2.0 and OpenID Connect actually work
in Keycloak. It is the concrete companion to the "OAuth from first principles",
"OpenID Connect", and "Keycloak architecture" articles: every abstract role from
those pieces is a real process you can watch here.

## What is in the box

Five services, deployed to a local Kubernetes cluster (minikube), plus Keycloak
and its Postgres database.

| Component | Role in OAuth / OIDC terms | What it demonstrates |
|---|---|---|
| `keycloak` | Authorization server + OIDC provider | Issues and signs tokens, hosts the login page |
| `postgres` | Keycloak's durable state | Realms, users, clients, keys, sessions |
| `login-web` | Public client (SPA) | Authorization code + PKCE, session-based SSO |
| `login-mobile` | Public client (mobile simulation) | PKCE + refresh rotation + localStorage persistence |
| `music-service` | Resource server, and a client | Validates access tokens via JWKS; calls other services |
| `recommendation-service` | Resource server | Only accepts tokens minted for it (audience check) |

## The three things it proves

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

3. Mobile token-based auth. `login-mobile` demonstrates the patterns that native
   apps use: tokens persisted to `localStorage` (simulating OS keychains),
   refresh token rotation, and no server-side sessions. Open
   **http://app.demo.local/mobile** to see it. Compare `login-web/app.js` and
   `login-mobile/app.js` side by side — same OAuth, different persistence.

See `docs/AUTH-FLOWS.md` for the step-by-step of all four flows, and
`docs/MOBILE.md` for the web vs mobile comparison.

## Branches: web vs mobile

This branch (`mobile`) includes both `login-web` and `login-mobile`.
The `web` branch keeps only the session-based SPA. Switch between them:

```bash
git checkout web    # SPA + sessions only
git checkout mobile # SPA + mobile token-based demo
```

| Branch | Client | Token handling | Refresh | Sessions |
|---|---|---|---|---|
| [web](https://github.com/shubhamstark/keycloak-demo/tree/web) | `login-web` (SPA) | In-memory only | None | Keycloak SSO cookie |
| [mobile](https://github.com/shubhamstark/keycloak-demo/tree/mobile) | both | localStorage (mobile) | Rotating | None on mobile |

## Quick start

Prerequisites: `minikube`, `kubectl`, `docker`, `jq`.

```bash
# 1. Bootstrap the cluster (one time)
make cluster

# 2. Deploy everything
make up

# 3. In a separate terminal, expose the ingress
minikube tunnel
```

Add this to `/etc/hosts` (the tunnel maps ingress to 127.0.0.1):

```
127.0.0.1 keycloak.demo.local app.demo.local music.demo.local
```

Open **http://app.demo.local**, log in as `shubham` / `password`, and try the
three call buttons. To tear down:

```bash
make down       # delete the namespace
minikube delete # destroy the cluster
```

See `docs/RUNNING.md` for the full walkthrough with troubleshooting.

## Layout

```
k8s/                     raw Kubernetes manifests, one file per component
keycloak/                realm export (clients, scopes, users) + notes
login-web/               the SPA public client (plain HTML/JS)
login-mobile/            mobile auth demo (phone-styled, PKCE + refresh + localStorage)
music-service/           Go resource server that also calls downstream services
recommendation-service/  Go resource server, downstream target
docs/                    architecture, auth flows, mobile guide, running guide
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
