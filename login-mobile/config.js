// Mobile demo config. Same issuer and service URLs as login-web, but a
// different clientId (login-mobile) and redirectUri (app.demo.local/mobile/).
// The mobile client has refresh tokens enabled in Keycloak.
window.MOBILE_CONFIG = {
  issuer: "http://keycloak.demo.local/realms/demo",
  clientId: "login-mobile",
  redirectUri: "http://app.demo.local/mobile/",
  musicServiceUrl: "http://music.demo.local",
};
