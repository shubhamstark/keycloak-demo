# Convenience targets for the demo. See docs/RUNNING.md for the full walkthrough.
NS = keycloak-demo

.PHONY: images realm apply up logs-recs down

images:
	eval $$(minikube docker-env) && \
	docker build -t music-service:demo ./music-service && \
	docker build -t recommendation-service:demo ./recommendation-service && \
	docker build -t login-web:demo ./login-web

realm:
	kubectl create namespace $(NS) --dry-run=client -o yaml | kubectl apply -f -
	kubectl -n $(NS) create configmap keycloak-realm \
	  --from-file=realm-export.json=keycloak/realm-export.json \
	  --dry-run=client -o yaml | kubectl apply -f -

apply:
	kubectl apply -f k8s/

# Full bring-up (after `minikube start` and `minikube addons enable ingress`)
up: images realm apply
	@echo "Applied. Watch: kubectl -n $(NS) get pods -w"

logs-recs:
	kubectl -n $(NS) logs deploy/recommendation-service -f

down:
	kubectl delete namespace $(NS) --ignore-not-found
