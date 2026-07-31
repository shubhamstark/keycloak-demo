# Tajir — an OAuth 2.0 + OIDC demo on Keycloak

A runnable companion to `keycloak-mapped.md`, deployed to minikube. The domain
is **Tajir**, a B2B platform where companies manage banking, VAT filing, and
team access.

## What this repo demonstrates

Three core token flows, each mapping to a concept from the article:

1. **User → API (authorization code + PKCE)**: a React SPA logs in, gets an access
   token, and calls a backend that scopes data to the user's company.
2. **Service → Service (token exchange, RFC 8693)**: the backend calls a
   downstream service on behalf of the user, preserving identity and org.
3. **Service → Keycloak (client credentials)**: the admin backend holds a
   service account and calls Keycloak's Admin REST API to manage users,
   roles, and groups — enforcing tenant boundaries in code.

It also shows:
- **Multi-tenancy**: multiple companies (Keycloak organizations)
- **Delegated administration**: company admins manage their own team
- **Token-based auth**: refresh token rotation, replay detection, no sessions
- **Token inspection**: decoded JWT viewer with claim annotations

## Quick start

```
make cluster   # start minikube + enable ingress + patch CoreDNS
make up        # build images + create realm ConfigMap + apply manifests
minikube tunnel
# Add to /etc/hosts: 127.0.0.1 keycloak.demo.local app.demo.local api.demo.local admin.demo.local
```

Open `http://app.demo.local`. Log in as `shubham` / `password`.

## Demo accounts

| Username | Password | Company | Roles |
|---|---|---|---|
| `shubham` | `password` | Acme Corp | company-admin |
| `alice` | `password` | Acme Corp | tax-filer |
| `bob` | `password` | Globex Industries | viewer |
| `admin` | `admin` | — | Keycloak admin (keycloak.demo.local) |

## Layout

```
tajir-app/              React SPA (Vite + React + oidc-client-ts)
dashboard-service/      Go business API (resource server + token exchange)
admin-service/          Go admin backend (delegated admin + client credentials)
keycloak/               Realm export (clients, scopes, roles, groups, orgs, users)
k8s/                    Kubernetes manifests (Deployments, Services, Ingress)
docs/                   Architecture, auth flows, running guide
keycloak-mapped.md      The article this demo illustrates
```

## Branches

- `tajir-web` — Tajir React SPA + Go services + token-based auth (this branch)
- `mobile` — previous iteration: plain JS SPA + mobile demo + music services
- `main` — original music-service demo

See `docs/RUNNING.md` for the full bring-up walkthrough.
