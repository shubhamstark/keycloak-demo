# Architecture

How the pieces fit, and how each maps to OAuth / OIDC concepts.

## The components

```
               browser
                  |
      (1) authorization code + PKCE
                  |
            +-----------+
            |  Keycloak |  authorization server + OIDC provider
            |  (Quarkus)|  issues + signs tokens, hosts login, manages sessions
            +-----------+
                  |
            +-----------+
            | Postgres  |  durable source of truth (realm, users, sessions)
            +-----------+

 browser --Bearer access token--> music-service  (resource server + client)
                                        |
                         (2) client credentials
                         (3) token exchange
                                        |
                               recommendation-service  (resource server)
```

## The three flows

All three are described step-by-step in `AUTH-FLOWS.md`.

### 1. User-to-service (authorization code + PKCE)

The browser (a public client with no secret) logs in via Keycloak, gets an
access token, and calls `music-service` with it.

- `login-web` generates a PKCE code verifier + challenge, plus state and nonce.
  Verifier, state, and nonce are stashed in `sessionStorage` for the redirect
  round-trip.
- `login-web` redirects the browser to Keycloak's authorization endpoint.
- Keycloak shows the login form (or skips it if a valid session cookie exists —
  see SSO below).
- After authentication, Keycloak redirects back to `app.demo.local` with an
  authorization `code`.
- `login-web` exchanges the code for tokens (access + ID + refresh) at the
  token endpoint, revealing the PKCE verifier to prove it started the flow.
- The ID token is decoded and displayed (claims + "Who am I"). The access token
  is sent to `music-service` in an `Authorization: Bearer` header.
- `music-service` validates the token: signature (JWKS), issuer, audience,
  expiry. All three checks are non-negotiable.

### 2. Client credentials (service as itself)

`music-service` uses its own client ID and secret to request an access token
from Keycloak. The resulting token has `sub = service-account-music-service`
and `aud = recommendation-service`. It calls the downstream service as itself.

### 3. Token exchange (service on behalf of user)

`music-service` exchanges the user's access token for a new token targeting
`recommendation-service`. The downstream call still carries the real user's
identity (`sub = shubham`), and `recommendation-service` logs who the call
is for. This is Standard Token Exchange V2 (RFC 8693), enabled by default
in Keycloak 26.2+.

## SSO and session management

After a successful login, Keycloak sets an `AUTH_SESSION_ID` cookie scoped to
`keycloak.demo.local`. On subsequent logins, the browser sends this cookie
and Keycloak skips the login form — redirecting straight back with a fresh
code. This is standard OIDC Single Sign-On.

**Logout** uses OIDC RP-Initiated Logout: `login-web` redirects the browser
to Keycloak's `end_session_endpoint` with the ID token as a hint. Keycloak
destroys the server-side session and clears the `AUTH_SESSION_ID` cookie,
then redirects back to `app.demo.local`. The next login will show the form
again.

## Token validation (both Go services)

Every request to `music-service` or `recommendation-service` goes through the
same checks:

1. **Signature**: fetch JWKS from Keycloak, verify the JWT signature
2. **Issuer**: must match `http://keycloak.demo.local/realms/demo`
3. **Audience**: must match the service's own audience (`music-service` or
   `recommendation-service`). This single check defeats the confused deputy
   problem — a token minted for another service is rejected.
4. **Expiry**: handled by `go-oidc`

The first validation call takes a few seconds (cold JWKS fetch). Subsequent
calls are fast because `go-oidc` caches the keys in memory.

## Audience mapping

Client scopes add audience claims to access tokens:

| Scope | Mapper | Adds `aud` |
|---|---|---|
| `music-audience` | `oidc-audience-mapper` | `music-service` |
| `recommendation-audience` | `oidc-audience-mapper` | `recommendation-service` |

The scopes are default scopes on the relevant clients, so they are always
included even without being explicitly requested. The SPA also requests
`music-audience` explicitly in its scope parameter.

## Identity propagation

| Pattern | Token subject | Caller identity downstream |
|---|---|---|
| User calls music-service | User (`shubham`) | User authenticated at `login-web` |
| music-service → recs (client credentials) | Service account | `music-service` acting as itself |
| music-service → recs (token exchange) | User (`shubham`) | `music-service` on behalf of `shubham` |

## On Kubernetes

Each component is a Deployment (or StatefulSet for Postgres) plus a Service.
One Ingress gives each a stable hostname so token issuers and audiences stay
consistent: `keycloak.demo.local`, `app.demo.local`, `music.demo.local`.

CoreDNS is patched at cluster bootstrap (`make cluster`) so pods can resolve
these hostnames to the ingress controller. The host machine also needs a
`/etc/hosts` entry pointing to `127.0.0.1` (the minikube tunnel endpoint).

Keycloak is pinned to `quay.io/keycloak/keycloak:26.3`. Running two Keycloak
replicas would demonstrate Infinispan clustering (discovery via DNS_PING on
Kubernetes); we default to one for a simpler local bring-up.

## Hostname consistency

The token's `iss` claim is `http://keycloak.demo.local/realms/demo`. Every
party — browser, Go services, and Keycloak itself — sees Keycloak at this
same hostname. The browser resolves it via `/etc/hosts` → minikube tunnel →
Ingress → Keycloak Service. The Go services resolve it via CoreDNS hosts
plugin → Ingress controller ClusterIP → Keycloak Service. This ensures
token validation never fails with an issuer mismatch.

See `RUNNING.md` to stand it up on minikube, and `AUTH-FLOWS.md` for what
happens on the wire.
