# Auth flows

This is the canonical, on-the-wire description of the four flows the demo shows.
Keep it in sync with the code (see `CLAUDE.md`).

## Flow 1: user-to-service (authorization code + PKCE)

The browser logs a user in and calls `music-service` as that user.

1. `login-web` generates a PKCE `code_verifier`, hashes it to a `code_challenge`,
   generates `state` and `nonce`, and redirects the browser to Keycloak's
   authorization endpoint with `scope=openid profile email`.
2. The user authenticates on Keycloak. Keycloak redirects back to `login-web`
   with a single-use `code` (and the `state`).
3. `login-web` checks `state`, then POSTs the `code` plus the `code_verifier` to
   the token endpoint. Back come `access_token`, `id_token`, `refresh_token`.
4. `login-web` checks the ID token's `nonce`, displays the claims, and calls
   `GET music-service/favourites` with `Authorization: Bearer <access_token>`.
5. `music-service` validates the access token: signature via JWKS, `iss`, `aud`
   (must include `music-service`), `exp`. It reads `sub` and returns favourites.

The token here represents a user. `music-service` knows who the user is from the
validated `sub`.

## Flow 2: service-to-service (client credentials)

Triggered by `GET music-service/favourites?with=recs&mode=client_credentials`.

`music-service` needs data from `recommendation-service`, but this is a
machine-to-machine call: no user, no browser.

1. `music-service` POSTs to the token endpoint with
   `grant_type=client_credentials`, its own `client_id` and `client_secret`
   (HTTP Basic), and `audience=recommendation-service`.
2. Keycloak returns an access token whose subject is `music-service`'s service
   account, aud'd at `recommendation-service`.
3. `music-service` calls `GET recommendation-service/recommendations` with that
   token.
4. `recommendation-service` validates it and sees `azp=music-service` and a
   service-account `sub`. No end-user identity is present.

Use this when the downstream service does not need to know which user the work is
ultimately for. The caller's identity is the service itself.

## Flow 3: service-to-service (standard token exchange, RFC 8693)

Triggered by `GET music-service/favourites?with=recs&mode=token_exchange`.

Same downstream call, but now `music-service` acts on behalf of the user.

1. `music-service` POSTs to the token endpoint with
   `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`,
   `subject_token=<the user's access token>`,
   `subject_token_type=...:access_token`, and
   `audience=recommendation-service`. It authenticates with its own client
   credentials.
2. Keycloak (Standard Token Exchange V2, on by default in 26.2+) returns a new
   access token whose subject is still the original user, aud'd at
   `recommendation-service`.
3. `music-service` calls the downstream with that token.
4. `recommendation-service` validates it and sees the real user's `sub`, with
   `music-service` recorded as the authorized party.

Use this when the downstream service needs the user's identity. The token says
"music-service, acting for user X."

## Flow 4: mobile (PKCE + refresh + localStorage)

The same authorization code + PKCE flow as Flow 1, but optimized for a native
app that has no browser session to lean on.

1. On first launch, `login-mobile` shows "not logged in". The user taps "Log in".
2. Same PKCE + redirect dance as Flow 1, but `scope=openid profile email
   music-audience offline_access`. The `offline_access` scope tells Keycloak
   to return a long-lived `refresh_token`.
3. After token exchange, `login-mobile` writes `{access_token, id_token,
   refresh_token}` to `localStorage`. The tokens survive page reloads.
4. On subsequent launches, `login-mobile` reads tokens from `localStorage`.
   If the access token is still valid, the user is shown as logged in —
   no network call, no Keycloak redirect.
5. If the access token has expired, `login-mobile` silently POSTs
   `grant_type=refresh_token` with the stored refresh token. Keycloak returns
   a new access token AND a new refresh token. The old refresh token is
   invalidated server-side. The new pair is stored in `localStorage`.
6. All API calls to `music-service` use `Authorization: Bearer <access_token>`,
   identical to Flow 1. If the access token expired, step 5 runs first.

**Replay detection**: if a leaked refresh token is reused, Keycloak sees that
it was already consumed, and invalidates the entire grant. Both the attacker's
and the legitimate client's tokens stop working, forcing a full re-auth.

**No SSO**: the `AUTH_SESSION_ID` cookie is never set. Each app instance
manages its own tokens independently. There is no shared session to log out
of — "Forget tokens" simply deletes localStorage.

See `docs/MOBILE.md` for the full comparison between web and mobile auth.

## The one-line contrast

- Client credentials: "I am music-service."
- Token exchange: "I am music-service, acting for user X."

Watch `recommendation-service`'s logs while triggering each mode. The `sub` it
logs flips from the service account to the real user.

## What every service does the same

Every resource server (both Go services) validates every token the same way:
signature via JWKS, then `iss`, `aud`, `exp`. There is no path that trusts a
token without validating it. That is the point.
