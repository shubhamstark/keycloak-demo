# Architecture

How the pieces fit, and how each maps to the OAuth / OIDC concepts.

## The components

```
                 browser
                    |
        (1) authorization code + PKCE
                    |
              +-----------+
              |  Keycloak |  authorization server + OIDC provider
              |  (Quarkus)|  issues + signs tokens, hosts login
              +-----------+
                    |
              +-----------+
              | Postgres  |  durable source of truth
              +-----------+

   browser --Bearer user token--> music-service  (resource server + client)
                                        |
                          (2) client credentials
                          (3) token exchange
                                        |
                                 recommendation-service  (resource server)
```

## Mapping to the articles

| Concept (OAuth / OIDC) | Here |
|---|---|
| Authorization server / OIDC provider | `keycloak` |
| Durable state | `postgres` |
| Public client | `login-web` (PKCE) |
| Confidential client | `music-service` (has a secret) |
| Resource server | `music-service` and `recommendation-service` (validate tokens) |
| Service account | `music-service`'s service account (client credentials) |
| Discovery document | `…/realms/demo/.well-known/openid-configuration` |
| JWKS | `…/realms/demo/protocol/openid-connect/certs` |
| Audience mapper | client scopes `music-audience`, `recommendation-audience` |

## On Kubernetes

Each component is a Deployment (or StatefulSet for Postgres) plus a Service. One
Ingress gives each a stable hostname so token issuers and audiences stay
consistent. Keycloak is pinned to `quay.io/keycloak/keycloak:26.3`. Running two
Keycloak replicas would demonstrate Infinispan clustering (discovery via
DNS_PING on Kubernetes); we default to one for a simpler local bring-up.

See `RUNNING.md` to stand it up on minikube, and `AUTH-FLOWS.md` for what happens
on the wire.
