# login-mobile

A web-based simulation of a mobile app doing OAuth 2.0 + OIDC. It uses the
same authorization code + PKCE flow as `login-web`, but with three critical
differences:

1. **localStorage persistence** — tokens survive page reloads, just like a
   real mobile app stores tokens in the OS keychain.
2. **Refresh token rotation** — when the access token expires, a refresh
   token exchanges it for a new one. The old refresh token becomes invalid
   (rotation), so a leaked refresh token is usable only once.
3. **No server-side sessions** — there is no `AUTH_SESSION_ID` cookie and no
   SSO. "Logout" just deletes local tokens.

## Phone-styled UI

The page is styled to look like a phone screen (375px wide, centered) to make
the mobile concept visually obvious. But it runs in any desktop browser — no
Android Studio or Xcode required.

## Mapping to real mobile apps

| Concept | This demo | iOS | Android |
|---|---|---|---|
| Token storage | `localStorage` | Keychain (`SecItemAdd`) | EncryptedSharedPreferences + Keystore |
| PKCE | `crypto.getRandomValues` | `SecRandomCopyBytes` | `SecureRandom` |
| SHA-256 | Pure JS | `CC_SHA256` (CommonCrypto) | `MessageDigest` |
| Browser redirect | `window.location.assign` | `ASWebAuthenticationSession` | Chrome Custom Tabs |
| Callback | URL code param | Custom URL scheme | Intent filter / App Links |
| Refresh | `fetch` to token endpoint | `URLSession` | `OkHttp` / `Retrofit` |

## Running

Part of the `mobile` branch. Deployed alongside `login-web`:

```
make up
# open http://app.demo.local/mobile
```
