// app.js: a public OAuth client doing authorization code + PKCE, by hand.
//
// This is intentionally written without an auth library so you can read the
// whole OIDC flow top to bottom. It maps one-to-one onto the OAuth and OIDC
// articles. Nothing here is production-hardened (tokens live in memory only,
// which is deliberate; see docs/NOT-FOR-PRODUCTION.md).
//
// CONFIG comes from config.js (window.DEMO_CONFIG): issuer, clientId, redirectUri,
// musicServiceUrl.

const cfg = window.DEMO_CONFIG;

// ---------------------------------------------------------------------------
// In-memory token store. On purpose: no localStorage. A page refresh logs you
// out. Real SPAs face a storage-security tradeoff (see the OIDC article's
// "can I skip sessions" section); we sidestep it by keeping tokens in a variable.
// ---------------------------------------------------------------------------
let tokens = null; // { access_token, id_token, ... }

// ---------------------------------------------------------------------------
// PKCE helpers. The verifier is a fresh random secret per login. We send only
// its SHA-256 hash (the challenge) in the front channel, and reveal the raw
// verifier later on the back-channel token call.
// ---------------------------------------------------------------------------
function randomString(len) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function sha256(str) {
  // Pure-JS SHA-256 so the demo works in non-secure contexts (http://app.demo.local
  // isn't "localhost" to the browser, so crypto.subtle is unavailable).
  const msg = new TextEncoder().encode(str);
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  // Padding (FIPS 180-4 §5.1.1)
  const ml = msg.length * 8;
  const padLen = (448 - ml - 1 + 512) % 512;
  const totalBits = ml + 1 + padLen + 64;
  const buf = new ArrayBuffer(totalBits >>> 3);
  const dv = new DataView(buf);
  const w = new Uint8Array(buf);
  w.set(msg);
  w[msg.length] = 0x80;
  dv.setUint32(buf.byteLength - 4, ml, false); // big-endian bit length
  // Initial hash
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const W = new Uint32Array(64);
  // Process each 512-bit chunk
  for (let off = 0; off < buf.byteLength; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = (rotr(W[i-15],7)^rotr(W[i-15],18)^(W[i-15]>>>3));
      const s1 = (rotr(W[i-2],17)^rotr(W[i-2],19)^(W[i-2]>>>10));
      W[i] = (W[i-16] + s0 + W[i-7] + s1) | 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(e,6)^rotr(e,11)^rotr(e,25));
      const ch = ((e & f) ^ (~e & g));
      const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
      const S0 = (rotr(a,2)^rotr(a,13)^rotr(a,22));
      const maj = ((a&b)^(a&c)^(b&c));
      const t2 = (S0 + maj) | 0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    H[0]=(H[0]+a)|0; H[1]=(H[1]+b)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0;
    H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) { out[i*4]=(H[i]>>>24); out[i*4+1]=(H[i]>>>16)&0xff; out[i*4+2]=(H[i]>>>8)&0xff; out[i*4+3]=H[i]&0xff; }
  return base64url(out);
}
function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

function base64url(bytes) {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Discovery: fetch the well-known document once to learn the endpoints, exactly
// as a library or a backend would. This is the OIDC article's section 8.
async function discover() {
  const res = await fetch(`${cfg.issuer}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error("discovery failed");
  return res.json();
}

// ---------------------------------------------------------------------------
// Step 1: begin login. Generate verifier + challenge + state + nonce, stash the
// ones we need to check later, and redirect the browser to the authorization
// endpoint. This is the front channel.
// ---------------------------------------------------------------------------
async function login() {
  setLoading("btn-login", true);
  console.log("login: starting discovery...");
  const meta = await discover();
  console.log("login: discovery ok, building auth URL...");

  const verifier = randomString(32);       // the PKCE secret, kept locally
  const challenge = await sha256(verifier); // only the hash goes out
  const state = randomString(16);           // CSRF / mixup guard
  const nonce = randomString(16);           // binds the ID token to this login

  // sessionStorage here is a transient stash for the redirect round-trip only,
  // not token storage. It holds the verifier/state/nonce across the redirect.
  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("oidc_state", state);
  sessionStorage.setItem("oidc_nonce", nonce);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: "openid profile email music-audience",   // music-audience adds aud:music-service to the access token
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  window.location.assign(`${meta.authorization_endpoint}?${params}`);
}

// ---------------------------------------------------------------------------
// Step 2: handle the redirect back. Keycloak sent us ?code=...&state=.... We
// check state, then exchange the code for tokens on the back channel, revealing
// the verifier. This is where the ID token and access token arrive together.
// ---------------------------------------------------------------------------
async function handleRedirect() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) return false; // not a redirect callback

  const returnedState = url.searchParams.get("state");
  if (returnedState !== sessionStorage.getItem("oidc_state")) {
    // Stale redirect (e.g. after hard reload). Clean the URL and let the user retry.
    console.warn("state mismatch — clearing stale code from URL");
    window.history.replaceState({}, document.title, cfg.redirectUri);
    throw new Error("stale login: session was cleared. Please log in again.");
  }

  const meta = await discover();
  const verifier = sessionStorage.getItem("pkce_verifier");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    code_verifier: verifier, // proving we started this login
  });

  const res = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`token endpoint returned ${res.status}`);
  tokens = await res.json();

  // Clean the code out of the URL bar so it is not left lying around.
  window.history.replaceState({}, document.title, cfg.redirectUri);

  // Show the ID token's claims. Note: we decode here only to DISPLAY them. The
  // trustworthy validation of the access token happens server-side in the Go
  // services. Decoding is not trusting (OIDC article, section 5).
  const claims = decodeJwtPayload(tokens.id_token);
  if (claims.nonce !== sessionStorage.getItem("oidc_nonce")) {
    throw new Error("nonce mismatch: ID token not for this login");
  }

  render(claims);
  return true;
}

// ---------------------------------------------------------------------------
// Step 3: call music-service with the access token. This is the user-to-service
// call. music-service validates the token; this page just presents it.
// ---------------------------------------------------------------------------
async function callMusic(query = "") {
  if (!tokens) { setText("apiout", "log in first"); return; }
  // Show spinner on the clicked button, plus the main Call button.
  var which = query.includes("client_credentials") ? "btn-call-cc" :
              query.includes("token_exchange") ? "btn-call-tx" : "btn-call";
  setLoading(which, true);
  setLoading("btn-call", true);
  console.log("callMusic: access_token type:", typeof tokens.access_token);
  console.log("callMusic: access_token first 50 chars:", tokens.access_token?.substring(0, 50));
  const res = await fetch(`${cfg.musicServiceUrl}/favourites${query}`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const text = await res.text();
  setText("apiout", `HTTP ${res.status}\n\n${pretty(text)}`);
  setLoading(which, false);
  setLoading("btn-call", false);
}

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------
function decodeJwtPayload(jwt) {
  const part = jwt.split(".")[1];
  const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json);
}

function render(claims) {
  setText("whoami", `${claims.name || claims.preferred_username || claims.sub}`);
  setText("idclaims", JSON.stringify(claims, null, 2));
}

function pretty(text) {
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
}

function setText(id, text) { document.getElementById(id).textContent = text; }

// Show/hide a spinner on a button during async work.
function setLoading(id, loading) {
  var btn = document.getElementById(id);
  if (!btn) return;
  if (loading) { btn.classList.add("loading"); btn.disabled = true; }
  else         { btn.classList.remove("loading"); btn.disabled = false; }
}

function logout() {
  tokens = null;
  setText("whoami", "not logged in");
  setText("idclaims", "-");
  setText("apiout", "-");
}

// Wire up buttons (IDs no longer shadow function names — see index.html).
document.getElementById("btn-login").addEventListener("click", () => login().catch(showErr));
document.getElementById("btn-logout").addEventListener("click", logout);
document.getElementById("btn-call").addEventListener("click", () => callMusic().catch(showErr));
document.getElementById("btn-call-cc").addEventListener("click",
  () => callMusic("?with=recs&mode=client_credentials").catch(showErr));
document.getElementById("btn-call-tx").addEventListener("click",
  () => callMusic("?with=recs&mode=token_exchange").catch(showErr));

function showErr(e) {
  console.error(e);
  var msg = "error: " + (e.message || e);
  setText("apiout", msg);
  setText("idclaims", msg);
  setLoading("btn-login", false);
  setLoading("btn-call", false);
  setLoading("btn-call-cc", false);
  setLoading("btn-call-tx", false);
}

// Expose for inline onclick handlers (button IDs would shadow function names).
window.doLogin = login;
window.doLogout = logout;
window.doCallMusic = callMusic;
window.showError = showErr;

// On load, see if we are coming back from a redirect.
console.log("app.js loaded, DEMO_CONFIG:", cfg);
console.log("current tokens:", tokens);
console.log("URL:", window.location.href);
handleRedirect().catch(showErr);
