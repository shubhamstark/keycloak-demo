# login-web

The public client: a single-page app with no framework and no build step, so the
entire OpenID Connect flow is readable in one file (`app.js`).

## What it demonstrates

- Authorization code + PKCE, done by hand: generate a verifier, send only its
  SHA-256 challenge, redeem the code with the verifier.
- `state` and `nonce` checks.
- Reading the ID token's claims to show "who am I".
- Calling `music-service` with the access token (user-to-service).
- Triggering the two downstream service-to-service patterns via query params, so
  you can watch them from the browser.

## Files

- `index.html` the shell and buttons.
- `app.js` the flow, top to bottom, commented with the concept each step
  implements. Read this alongside the OAuth and OIDC articles.
- `config.js` issuer, client id, redirect URI, and the music-service URL.

## Important

Tokens are held in a JavaScript variable, in memory only. A refresh logs you out.
This is deliberate: it avoids the token-storage security question entirely for
the demo. Decoding the ID token here is only to display claims; the trustworthy
validation happens server-side in the Go services.

## Config

Edit `config.js` to match your ingress hostnames. See `docs/RUNNING.md` for the
minikube hostnames used here (`keycloak.demo.local`, `app.demo.local`,
`music.demo.local`).
