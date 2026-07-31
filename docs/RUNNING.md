# Running the Tajir demo on minikube

A full local bring-up. Expect ~12 minutes the first time (image pulls).

## Prerequisites

- `minikube`, `kubectl`, `docker`
- About 4GB free RAM for the cluster

## 1. Start the cluster and enable ingress

```
minikube start --memory=4096 --cpus=2
minikube addons enable ingress
```

## 2. Patch CoreDNS for in-cluster hostname resolution

Pods inside minikube need to resolve the demo hostnames
(`keycloak.demo.local`, `api.demo.local`, etc.) to the minikube IP.
Patch CoreDNS to add local A-records:

```
MINIKUBE_IP=$(minikube ip)
kubectl -n kube-system get configmap coredns -o yaml | \
  sed "s/192.168.65.254 host.minikube.internal/192.168.65.254 host.minikube.internal\n        $MINIKUBE_IP keycloak.demo.local app.demo.local api.demo.local admin.demo.local/" | \
  kubectl apply -f -
kubectl -n kube-system rollout restart deploy/coredns
kubectl -n kube-system rollout status deploy/coredns
```

This ensures that Keycloak, dashboard-service, and admin-service can all
reach each other at the same hostnames the browser uses. Without this,
in-cluster callers would fail DNS resolution.

## 3. Point the demo hostnames at minikube (your host machine)

The demo uses four hostnames. Add them to your hosts file:

```
echo "$(minikube ip) keycloak.demo.local app.demo.local api.demo.local admin.demo.local" | sudo tee -a /etc/hosts
```

## 4. Build the service images into minikube's Docker

Point your shell at minikube's Docker daemon:

```
eval $(minikube docker-env)

docker build -t dashboard-service:demo ./dashboard-service
docker build -t admin-service:demo ./admin-service
docker build -t tajir-app:demo ./tajir-app
```

## 5. Create the realm ConfigMap

Keycloak imports the realm from a mounted ConfigMap:

```
kubectl create namespace keycloak-demo --dry-run=client -o yaml | kubectl apply -f -
kubectl -n keycloak-demo create configmap keycloak-realm \
  --from-file=realm-export.json=keycloak/realm-export.json \
  --dry-run=client -o yaml | kubectl apply -f -
```

## 6. Apply the manifests

```
kubectl apply -f k8s/
```

Watch them come up (Keycloak takes a bit; it waits for Postgres and imports the
realm):

```
kubectl -n keycloak-demo get pods -w
```

You should see `keycloak`, `postgres`, `dashboard-service`, `admin-service`,
and `tajir-app` all `Running` / ready.

## 7. Use it

- Open `http://app.demo.local` — the Tajir React app.
- Click "Sign in with your company account".
- Log in as `shubham` / `password` (Acme Corp, company-admin).
- **Dashboard**: company overview, bank accounts, VAT filings, team size.
- **Tokens**: decoded access, ID, and refresh tokens with claim annotations.
- **API Explorer**: call services, see tokens in flight, curl equivalents.
- **Refresh**: trigger refresh rotation, simulate token reuse.
- **Users & Orgs**: view team, invite users, assign roles (company-admin only).
- **Roles & Groups**: create groups, assign roles to groups (company-admin only).
- Try logging in as `alice` / `password` (Acme Corp, tax-filer) — sees fewer
  permissions; admin pages are read-only.
- Try `bob` / `password` (Globex Industries, viewer) — sees Globex data,
  cannot see Acme users.

## 8. Explore Keycloak (optional)

`http://keycloak.demo.local`, admin console, log in as `admin` / `admin`. Look at
Realm `demo` → Clients, Client scopes, Roles, Groups, Organizations, Users.

## Teardown

```
minikube delete
# and remove the /etc/hosts line you added
```

## Troubleshooting

- Token validation fails with an issuer mismatch: the browser and the services
  must all see Keycloak at the same hostname (`keycloak.demo.local`). Check the
  `/etc/hosts` entry and `KC_HOSTNAME`.
- `tajir-app` cannot reach `dashboard-service`: the SPA calls `api.demo.local`;
  confirm that ingress host resolves and the service is ready.
- Keycloak CrashLoopBackOff: usually Postgres is not ready yet, or the realm
  ConfigMap is missing. Check `kubectl -n keycloak-demo logs deploy/keycloak`.
- Admin operations fail: confirm `admin-service`'s service account has
  management roles in the realm export.
