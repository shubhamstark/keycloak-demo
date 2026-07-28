// app.js: mobile auth demo — PKCE + refresh tokens + localStorage persistence.
//
// This is the mobile counterpart to login-web/app.js. It uses the same OIDC
// authorization code + PKCE flow, but differs in three critical ways:
//
//   1. Tokens are persisted in localStorage (simulates iOS Keychain / Android
//      Keystore). They survive page reloads.
//   2. When the access token expires, a refresh token silently gets a new one.
//      The old refresh token is invalidated (rotation) — a leaked refresh is
//      usable only once.
//   3. There is no server-side session. The AUTH_SESSION_ID cookie is never
//      set. "Logout" just deletes local tokens.
//
// CONFIG comes from config.js (window.MOBILE_CONFIG).

var cfg = window.MOBILE_CONFIG;
var STORAGE_KEY = "mobile_tokens";

// ---------------------------------------------------------------------------
// In-memory token cache (backed by localStorage).
// ---------------------------------------------------------------------------
var tokens = null; // { access_token, id_token, refresh_token, stored_at }

// ---------------------------------------------------------------------------
// PKCE helpers (same as login-web/app.js).
// ---------------------------------------------------------------------------
function randomString(len) {
  var bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function sha256(str) {
  var msg = new TextEncoder().encode(str);
  var K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  var ml = msg.length * 8;
  var padLen = (448 - ml - 1 + 512) % 512;
  var totalBits = ml + 1 + padLen + 64;
  var buf = new ArrayBuffer(totalBits >>> 3);
  var dv = new DataView(buf);
  var w = new Uint8Array(buf);
  w.set(msg);
  w[msg.length] = 0x80;
  dv.setUint32(buf.byteLength - 4, ml, false);
  var H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  var W = new Uint32Array(64);
  for (var off = 0; off < buf.byteLength; off += 64) {
    for (var i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4, false);
    for (var i = 16; i < 64; i++) {
      var s0 = (rotr(W[i-15],7)^rotr(W[i-15],18)^(W[i-15]>>>3));
      var s1 = (rotr(W[i-2],17)^rotr(W[i-2],19)^(W[i-2]>>>10));
      W[i] = (W[i-16] + s0 + W[i-7] + s1) | 0;
    }
    var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for (var i = 0; i < 64; i++) {
      var S1 = (rotr(e,6)^rotr(e,11)^rotr(e,25));
      var ch = ((e & f) ^ (~e & g));
      var t1 = (h + S1 + ch + K[i] + W[i]) | 0;
      var S0 = (rotr(a,2)^rotr(a,13)^rotr(a,22));
      var maj = ((a&b)^(a&c)^(b&c));
      var t2 = (S0 + maj) | 0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    H[0]=(H[0]+a)|0; H[1]=(H[1]+b)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0;
    H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
  }
  var out = new Uint8Array(32);
  for (var i = 0; i < 8; i++) { out[i*4]=(H[i]>>>24); out[i*4+1]=(H[i]>>>16)&0xff; out[i*4+2]=(H[i]>>>8)&0xff; out[i*4+3]=H[i]&0xff; }
  return base64url(out);
}
function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

function base64url(bytes) {
  var s = btoa(String.fromCharCode.apply(null, bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// Discovery (same as login-web/app.js).
// ---------------------------------------------------------------------------
async function discover() {
  var res = await fetch(cfg.issuer + "/.well-known/openid-configuration");
  if (!res.ok) throw new Error("discovery failed");
  return res.json();
}

// ---------------------------------------------------------------------------
// Token helpers.
// ---------------------------------------------------------------------------
function decodeJwtPayload(jwt) {
  var part = jwt.split(".")[1];
  var json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json);
}

function isExpired(jwt) {
  if (!jwt) return true;
  try {
    var claims = decodeJwtPayload(jwt);
    return (claims.exp * 1000) < Date.now();
  } catch(e) { return true; }
}

function expiryText(jwt) {
  if (!jwt) return "";
  try {
    var claims = decodeJwtPayload(jwt);
    var remaining = (claims.exp * 1000) - Date.now();
    if (remaining <= 0) return "EXPIRED";
    var mins = Math.floor(remaining / 60000);
    var secs = Math.floor((remaining % 60000) / 1000);
    return "expires in " + mins + "m " + secs + "s";
  } catch(e) { return ""; }
}

// ---------------------------------------------------------------------------
// localStorage persistence (simulates iOS Keychain / Android Keystore).
// ---------------------------------------------------------------------------
function storeTokens(tok) {
  tokens = tok;
  tokens.stored_at = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

function loadTokens() {
  var raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch(e) { return null; }
}

function clearTokens() {
  tokens = null;
  localStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Step 1: Login (authorization code + PKCE). Same as login-web, but also
// requests offline_access so Keycloak returns a refresh_token.
// ---------------------------------------------------------------------------
async function login() {
  setLoading("btn-login", true);
  var meta = await discover();

  var verifier = randomString(32);
  var challenge = await sha256(verifier);
  var state = randomString(16);
  var nonce = randomString(16);

  sessionStorage.setItem("mobile_pkce_verifier", verifier);
  sessionStorage.setItem("mobile_oidc_state", state);
  sessionStorage.setItem("mobile_oidc_nonce", nonce);

  var params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: "openid profile email music-audience offline_access",
    state: state,
    nonce: nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  window.location.assign(meta.authorization_endpoint + "?" + params);
}

// ---------------------------------------------------------------------------
// Step 2: Handle redirect back. Exchange code for tokens, persist to
// localStorage, and update the UI.
// ---------------------------------------------------------------------------
async function handleRedirect() {
  var url = new URL(window.location.href);
  var code = url.searchParams.get("code");
  if (!code) return false;

  var returnedState = url.searchParams.get("state");
  if (returnedState !== sessionStorage.getItem("mobile_oidc_state")) {
    window.history.replaceState({}, document.title, cfg.redirectUri);
    throw new Error("stale login: session was cleared. Please log in again.");
  }

  var meta = await discover();
  var verifier = sessionStorage.getItem("mobile_pkce_verifier");

  var body = new URLSearchParams({
    grant_type: "authorization_code",
    code: code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    code_verifier: verifier,
  });

  var res = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body,
  });
  if (!res.ok) throw new Error("token endpoint returned " + res.status);
  var tok = await res.json();

  window.history.replaceState({}, document.title, cfg.redirectUri);

  var claims = decodeJwtPayload(tok.id_token);
  if (claims.nonce !== sessionStorage.getItem("mobile_oidc_nonce")) {
    throw new Error("nonce mismatch: ID token not for this login");
  }

  // Persist to localStorage (mobile pattern — tokens survive restarts).
  storeTokens(tok);
  render(claims, tok);
  return true;
}

// ---------------------------------------------------------------------------
// Step 3: Refresh an expired access token using the refresh token.
// This is the key mobile pattern — no re-login, no Keycloak redirect.
// Keycloak rotates the refresh token: the old one becomes invalid.
// ---------------------------------------------------------------------------
async function refreshTokens() {
  if (!tokens || !tokens.refresh_token) {
    throw new Error("no refresh token available — log in first");
  }

  setLoading("btn-refresh", true);
  var meta = await discover();

  var body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    client_id: cfg.clientId,
  });

  var res = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body,
  });
  if (!res.ok) {
    // Refresh failed — token was likely rotated or expired. Clear and force re-auth.
    clearTokens();
    renderUnauthenticated();
    throw new Error("refresh failed — tokens cleared, please log in again");
  }

  var newTok = await res.json();
  // Keycloak returns a NEW refresh_token on rotation. Store it.
  storeTokens(newTok);
  var claims = decodeJwtPayload(newTok.id_token);
  render(claims, newTok);
  setText("apiout", "Token refreshed at " + new Date().toLocaleTimeString());
  setLoading("btn-refresh", false);
}

// ---------------------------------------------------------------------------
// Step 4: Call music-service with the access token.
// ---------------------------------------------------------------------------
async function callMusic() {
  if (!tokens) { setText("apiout", "log in first"); return; }

  // Auto-refresh if expired.
  if (isExpired(tokens.access_token)) {
    setText("apiout", "Access token expired, refreshing...");
    await refreshTokens();
  }

  setLoading("btn-call", true);
  var res = await fetch(cfg.musicServiceUrl + "/favourites", {
    headers: { Authorization: "Bearer " + tokens.access_token },
  });
  var text = await res.text();
  setText("apiout", "HTTP " + res.status + "\n\n" + pretty(text));
  setLoading("btn-call", false);
}

// ---------------------------------------------------------------------------
// UI helpers.
// ---------------------------------------------------------------------------
function render(claims, tok) {
  var id = document.getElementById("auth-status");
  id.className = "auth-status logged-in";
  id.querySelector(".text").textContent = "logged in as " + (claims.preferred_username || claims.sub);

  setText("whoami", claims.name || claims.preferred_username || claims.sub);
  setText("accesstoken", "sub: " + claims.sub + "\nexp: " + new Date(claims.exp * 1000).toLocaleString() + "\naud: " + (claims.aud || " — ") + "\n\n" + pretty(tok.access_token));
  setText("refreshtoken", tok.refresh_token ? "present (stored in localStorage)" : "none — re-login to get one");
  setText("token-expiry", expiryText(tok.access_token));

  var expiryEl = document.getElementById("token-expiry");
  if (isExpired(tok.access_token)) {
    expiryEl.className = "expiry";
  } else {
    expiryEl.className = "expiry ok";
  }

  document.getElementById("btn-refresh").disabled = !tok.refresh_token;
  document.getElementById("btn-call").disabled = false;
  document.getElementById("btn-forget").disabled = false;
  document.getElementById("btn-login").classList.remove("primary");
}

function renderUnauthenticated() {
  var id = document.getElementById("auth-status");
  id.className = "auth-status";
  id.querySelector(".text").textContent = "not logged in";

  setText("whoami", "not logged in");
  setText("accesstoken", "-");
  setText("refreshtoken", "-");
  setText("token-expiry", "");
  setText("apiout", "-");

  document.getElementById("btn-refresh").disabled = true;
  document.getElementById("btn-call").disabled = true;
  document.getElementById("btn-forget").disabled = true;
  document.getElementById("btn-login").classList.add("primary");
}

function setText(id, text) { document.getElementById(id).textContent = text; }

function pretty(text) {
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch(e) { return text; }
}

function setLoading(id, loading) {
  var btn = document.getElementById(id);
  if (!btn) return;
  if (loading) { btn.classList.add("loading"); btn.disabled = true; }
  else         { btn.classList.remove("loading"); btn.disabled = false; }
}

function showErr(e) {
  console.error(e);
  setText("apiout", "error: " + (e.message || e));
  setLoading("btn-login", false);
  setLoading("btn-refresh", false);
  setLoading("btn-call", false);
}

// ---------------------------------------------------------------------------
// "Forget tokens" — the mobile equivalent of logout. Just deletes local state.
// There is no server-side session to end. Real apps would also call Keycloak's
// revocation endpoint to invalidate the refresh token server-side.
// ---------------------------------------------------------------------------
function forgetTokens() {
  clearTokens();
  renderUnauthenticated();
  setText("apiout", "Tokens deleted from localStorage.\nNo server-side session to clear — the AUTH_SESSION_ID cookie was never set.");
}

// ---------------------------------------------------------------------------
// On page load: try to resume from localStorage. If the access token expired,
// attempt a silent refresh. If the refresh fails, show the login button.
// This is exactly how a mobile app starts up.
// ---------------------------------------------------------------------------
async function resumeOrLogin() {
  var stored = loadTokens();
  if (!stored) {
    renderUnauthenticated();
    // Still check for a redirect callback.
    return handleRedirect().catch(showErr);
  }

  tokens = stored;
  var claims = decodeJwtPayload(tokens.id_token);

  if (isExpired(tokens.access_token)) {
    setText("apiout", "Access token expired. Attempting refresh...");
    try {
      await refreshTokens();
      setText("apiout", "Auto-refreshed from localStorage on page load.");
    } catch(e) {
      // Refresh failed — re-auth needed.
      setText("apiout", "Auto-refresh failed: " + e.message);
      return handleRedirect().catch(showErr);
    }
  } else {
    render(claims, tokens);
    setText("apiout", "Resumed from localStorage. No re-auth needed.");
  }

  // Also check for a fresh redirect callback (takes priority).
  var redirected = await handleRedirect().catch(showErr);
  if (!redirected) {
    // Periodically update the expiry countdown.
    setInterval(function() {
      if (tokens) setText("token-expiry", expiryText(tokens.access_token));
    }, 10000);
  }
}

// ---------------------------------------------------------------------------
// Wire up buttons and expose globals for inline onclick handlers.
// ---------------------------------------------------------------------------
window.doLogin = login;
window.doRefresh = refreshTokens;
window.doCallMusic = callMusic;
window.doForget = forgetTokens;
window.showError = showErr;

resumeOrLogin().catch(showErr);
