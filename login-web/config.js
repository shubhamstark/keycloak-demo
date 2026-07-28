// Demo config. In a real app these would be injected at build/deploy time.
// For minikube, issuer and service URLs are reachable via the ingress host.
// Adjust the host to match your `minikube ip` / ingress setup (see docs/RUNNING.md).
window.DEMO_CONFIG = {
  issuer: "http://keycloak.demo.local/realms/demo",
  clientId: "login-web",
  redirectUri: "http://app.demo.local/",
  musicServiceUrl: "http://music.demo.local",
};
