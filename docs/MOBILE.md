# Mobile auth: tokens without sessions

The `main` branch demonstrates web-based OAuth (SPA + sessions + SSO). The
`mobile` branch shows the same OAuth flows but using token-based patterns
designed for native mobile apps.

## The web/mobile split

| | Web (login-web) | Mobile (login-mobile) |
|---|---|---|
| **Token storage** | In-memory JS variable | `localStorage` (simulates iOS Keychain / Android Keystore) |
| **On app restart** | Tokens lost — must re-login | Tokens loaded from storage, auto-refreshed if expired |
| **Sessions** | Keycloak `AUTH_SESSION_ID` cookie provides SSO | No cookie — no server-side session |
| **Logout** | OIDC RP-Initiated Logout (destroys session) | Delete local tokens (no session to clear) |
| **Refresh** | Not used (re-login when expired) | Refresh token rotation (each refresh invalidates the old one) |
| **Lifespan** | Ephemeral (page refresh = new login) | Persistent (1 day idle / 7 day max with refresh) |

## Why tokens, not sessions

Mobile apps face constraints that browsers don't:

1. **No shared cookie jar** — Mobile apps don't share cookies with the system
   browser. After authentication, the app has tokens but no session cookie.
   The `AUTH_SESSION_ID` cookie set by Keycloak lives in the browser, not the app.

2. **Survives restarts** — A mobile app can be killed by the OS at any time.
   Tokens persisted to the OS keychain survive app termination and device reboots.

3. **No SSO needed** — The app is the only "tab". There's nothing to share sessions
   with. Each app instance manages its own tokens.

4. **Offline resilience** — An app that starts with expired tokens can silently
   refresh them on launch, without showing a login form.

## Refresh token rotation

This is the key security property of the mobile pattern:

```
Login    → access_token_1 + refresh_token_A
Expired  → POST refresh_token_A → access_token_2 + refresh_token_B
           (refresh_token_A is now INVALID)
Expired  → POST refresh_token_B → access_token_3 + refresh_token_C
           (refresh_token_B is now INVALID)
```

If refresh_token_A is leaked between steps 1 and 2:
- The attacker can use it ONCE (getting a new token pair)
- The legitimate client tries to use it next → Keycloak detects the reuse
  and **invalidates the entire grant**
- Both the attacker's tokens AND the legitimate client's tokens stop working
- The real user must re-authenticate

This is replay detection. It raises the bar significantly over bearer access
tokens alone — a leaked refresh token is usable exactly once, and its use
is immediately detected.

Keycloak configuration for rotation:
- `use.refresh.tokens: true` — enables refresh tokens for the client
- `client.offline.session.idle.timeout: 86400` — 1 day idle timeout
- `client.offline.session.max.lifespan: 604800` — 7 day max lifespan

## How login-mobile simulates this

The `login-mobile/` directory contains a plain HTML/JS page styled to look like
a phone screen. It uses the same OIDC authorization code + PKCE flow as
`login-web`, but:

1. **`localStorage` is the keychain** — Tokens are stringified and stored in
   `localStorage` under the key `mobile_tokens`. In a real app, this would be:
   - iOS: `SecItemAdd` to the Keychain
   - Android: `EncryptedSharedPreferences` backed by Android Keystore

2. **Auto-resume on load** — `resumeOrLogin()` checks localStorage for tokens.
   If found and valid, the user is shown as logged in without any network call.
   If the access token is expired, a silent refresh is attempted.

3. **Refresh rotation** — After a successful refresh, the new tokens replace
   the old ones in localStorage. The old refresh token is discarded — it
   would fail if reused.

4. **"Forget tokens" is logout** — There is no OIDC RP-Initiated Logout
   because there is no server-side session. The button simply deletes the
   localStorage entry. A real app would additionally call Keycloak's
   revocation endpoint (`/protocol/openid-connect/revoke`) to invalidate
   the refresh token server-side.

## Mapping to production

| Concept | This demo | iOS | Android |
|---|---|---|---|
| Token storage | `localStorage` | Keychain (`SecItemAdd`) | EncryptedSharedPreferences |
| PKCE random | `crypto.getRandomValues` | `SecRandomCopyBytes` | `SecureRandom` |
| SHA-256 | Pure JS | `CC_SHA256` (CommonCrypto) | `MessageDigest` |
| Browser | `window.location.assign` | `ASWebAuthenticationSession` | Chrome Custom Tabs |
| Callback | URL `?code=` param | Custom URL scheme | Intent filter |
| HTTP calls | `fetch` | `URLSession` | OkHttp / Ktor |
| Biometric auth | N/A | `LAContext.evaluatePolicy` | `BiometricPrompt` |

## When to use tokens vs sessions

| Use case | Approach |
|---|---|
| First-party native app → first-party API | Tokens + DPoP + refresh rotation |
| Browser SPA → first-party API | Authorization code + PKCE + sessions (with BFF ideally) |
| Third-party client → your API | Authorization code + PKCE (no sessions across origins) |
| Service → service (no user) | Client credentials |
| Service → service (on behalf of user) | Token exchange (RFC 8693) |

## Exercise for the reader

Open `login-web/app.js` and `login-mobile/app.js` side by side. Both do
authorization code + PKCE. Spot the differences:

- `login-web` keeps tokens in `let tokens = null` — gone on refresh
- `login-mobile` writes to `localStorage.setItem("mobile_tokens", ...)`
- `login-web` has `end_session_endpoint` logout — `login-mobile` has `forgetTokens()`
- `login-mobile` has `refreshTokens()` — `login-web` does not
- `login-mobile` calls `resumeOrLogin()` on load — `login-web` only calls `handleRedirect()`
