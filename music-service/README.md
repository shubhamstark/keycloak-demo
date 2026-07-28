# music-service

The service that plays two roles at once, which is exactly why it is the centre
of the demo.

## Role 1: resource server (for the user)

It accepts the user's access token (which `login-web` obtained via authorization
code + PKCE), validates it against Keycloak's JWKS, checks issuer, audience, and
expiry, and returns that user's favourite songs. Validation lives in `auth.go`
and is the same job every resource server does.

## Role 2: client (to the downstream service)

To enrich the response with recommendations it calls `recommendation-service`,
and it must authenticate for that call. It shows both service-to-service
patterns, selectable at request time. Logic is in `downstream.go`.

## Endpoints

`GET /favourites`
Returns the user's favourites. Requires a valid user access token.

`GET /favourites?with=recs&mode=client_credentials`
Also calls the downstream service using the client credentials grant.
music-service authenticates as itself; the downstream token's subject is the
service account. No user identity reaches the downstream service.

`GET /favourites?with=recs&mode=token_exchange`
Also calls the downstream service using RFC 8693 token exchange. music-service
trades the user's token for one aud'd at `recommendation-service`; the downstream
token's subject is still the user. Use this when the downstream service needs to
know which user the work is for.

## The difference, in one line

- client credentials: "I am music-service."
- token exchange: "I am music-service, acting for user X."

Watch `recommendation-service`'s logs while calling each mode: the `sub` it logs
changes from the service account to the real user.

## Config (environment variables)

| Variable | Example | Meaning |
|---|---|---|
| `OIDC_ISSUER` | `http://keycloak/realms/demo` | Realm issuer URL |
| `OIDC_AUDIENCE` | `music-service` | Audience this service demands on incoming tokens |
| `OIDC_TOKEN_ENDPOINT` | `http://keycloak/realms/demo/protocol/openid-connect/token` | Where to request downstream tokens |
| `CLIENT_ID` | `music-service` | This service's client id |
| `CLIENT_SECRET` | (demo secret) | This service's client secret |
| `RECOMMENDATION_URL` | `http://recommendation-service:8081` | Downstream base URL |
| `RECOMMENDATION_AUDIENCE` | `recommendation-service` | Audience to request for downstream tokens |
| `PORT` | `8080` | Listen port |
