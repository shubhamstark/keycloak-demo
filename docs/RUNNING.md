# Running the demo on minikube

A full local bring-up. Expect ~10 minutes the first time (image pulls).

## Prerequisites

- `minikube`, `kubectl`, `docker`
- About 4GB free RAM for the cluster

## 1. Start the cluster and enable ingress

```
minikube start --memory=4096 --cpus=2
minikube addons enable ingress
```

## 2. Point the demo hostnames at minikube

The demo uses three hostnames so token issuers and audiences stay consistent.
Add them to your hosts file, mapped to the minikube IP:

```
echo "$(minikube ip) keycloak.demo.local app.demo.local music.demo.local" | sudo tee -a /etc/hosts
```

## 3. Build the three service images into minikube's Docker

Point your shell at minikube's Docker daemon so the images are available to the
cluster without a registry:

```
eval $(minikube docker-env)

docker build -t music-service:demo ./music-service
docker build -t recommendation-service:demo ./recommendation-service
docker build -t login-web:demo ./login-web
```

## 4. Create the realm ConfigMap

Keycloak imports the realm from a mounted ConfigMap. Create it from the export:

```
kubectl create namespace keycloak-demo --dry-run=client -o yaml | kubectl apply -f -
kubectl -n keycloak-demo create configmap keycloak-realm \
  --from-file=realm-export.json=keycloak/realm-export.json \
  --dry-run=client -o yaml | kubectl apply -f -
```

## 5. Apply the manifests

```
kubectl apply -f k8s/
```

Watch them come up (Keycloak takes a bit; it waits for Postgres and imports the
realm):

```
kubectl -n keycloak-demo get pods -w
```

You should eventually see `keycloak`, `postgres`, `music-service`,
`recommendation-service`, and `login-web` all `Running` / ready.

## 6. Use it

- Open `http://app.demo.local` (the SPA).
- Click "Log in", authenticate as `shubham` / `password`.
- You should see the ID token claims render ("who am I").
- Click "Call music-service" to see the user's favourites (user-to-service).
- Click "+ recommendations (client credentials)" and
  "+ recommendations (token exchange)" to trigger the two service-to-service
  patterns.

Watch the downstream identity change:

```
kubectl -n keycloak-demo logs deploy/recommendation-service -f
```

With client credentials, the logged `sub` is the service account. With token
exchange, it is the real user (`shubham`).

## 7. Explore Keycloak (optional)

`http://keycloak.demo.local`, admin console, log in as `admin` / `admin`. Look at
Realm `demo` → Clients, Client scopes (the audience mappers), and Users.

## Optional: demonstrate clustering

Scale Keycloak to two replicas to see the Infinispan cluster form (discovery via
DNS_PING on Kubernetes). On single-node minikube this shows the shape, not true
HA:

```
kubectl -n keycloak-demo scale deploy/keycloak --replicas=2
kubectl -n keycloak-demo logs deploy/keycloak | grep -i infinispan
```

## Teardown

```
minikube delete
# and remove the /etc/hosts line you added
```

## Troubleshooting

- Token validation fails with an issuer mismatch: the browser and the services
  must all see Keycloak at the same hostname (`keycloak.demo.local`). Check the
  `/etc/hosts` entry and `KC_HOSTNAME`.
- `login-web` cannot reach `music-service`: the SPA calls `music.demo.local`;
  confirm that ingress host resolves and the service is ready.
- Keycloak CrashLoopBackOff: usually Postgres is not ready yet, or the realm
  ConfigMap is missing. Check `kubectl -n keycloak-demo logs deploy/keycloak`.
