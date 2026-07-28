# Convenience targets for the demo. See docs/RUNNING.md for the full walkthrough.
NS = keycloak-demo

.PHONY: images realm apply up logs-recs down cluster all

# One-time cluster bootstrap.
cluster:
	minikube start --memory=4096 --cpus=2
	minikube addons enable ingress
	@echo "Patching CoreDNS for demo hostnames (keycloak|app|music.demo.local)..."
	@MINIKUBE_IP=$$(minikube ip); \
	kubectl -n kube-system get configmap coredns -o yaml | \
	  sed "s/192.168.65.254 host.minikube.internal/192.168.65.254 host.minikube.internal\\n           $$MINIKUBE_IP keycloak.demo.local app.demo.local music.demo.local/" | \
	  kubectl apply -f -
	@kubectl -n kube-system rollout restart deploy/coredns >/dev/null
	@kubectl -n kube-system rollout status deploy/coredns

images:
	eval $$(minikube docker-env) && \
	docker build -t music-service:demo ./music-service && \
	docker build -t recommendation-service:demo ./recommendation-service && \
	docker build -t login-web:demo ./login-web && \
	docker build -t login-mobile:demo ./login-mobile

realm:
	kubectl create namespace $(NS) --dry-run=client -o yaml | kubectl apply -f -
	kubectl -n $(NS) create configmap keycloak-realm \
	  --from-file=realm-export.json=keycloak/realm-export.json \
	  --dry-run=client -o yaml | kubectl apply -f -

apply:
	kubectl apply -f k8s/

# Full bring-up. Run `make cluster` first (one-time), then `make up`.
up: images realm apply
	@echo "Applied. Watch: kubectl -n $(NS) get pods -w"

# Everything from scratch (cluster + up).
all: cluster up

logs-recs:
	kubectl -n $(NS) logs deploy/recommendation-service -f

down:
	kubectl delete namespace $(NS) --ignore-not-found
