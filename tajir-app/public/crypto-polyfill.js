// crypto-polyfill.js — pure-JS SHA-256 for non-secure contexts (HTTP).
//
// Browsers block crypto.subtle on non-HTTPS origins. The demo runs on
// http://app.demo.local, which is not "localhost", so crypto.subtle is
// unavailable. This polyfill provides a pure-JS SHA-256 digest so
// oidc-client-ts can generate PKCE code challenges without it.
//
// Adapted from login-web/app.js (the old demo had the same problem).

(function() {
  if (window.crypto && window.crypto.subtle) return; // Already available

  function sha256(message) {
    var msg = typeof message === 'string'
      ? new TextEncoder().encode(message)
      : new Uint8Array(message);

    var K = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
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
    return out.buffer;
  }

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

  // Polyfill crypto.subtle.digest for SHA-256 only.
  if (!window.crypto) window.crypto = {};
  if (!window.crypto.subtle) {
    window.crypto.subtle = {
      digest: function(algorithm, data) {
        var algo = (typeof algorithm === 'string' ? algorithm : algorithm.name || '').toUpperCase();
        if (algo !== 'SHA-256') {
          return Promise.reject(new Error('Only SHA-256 is polyfilled, got: ' + algo));
        }
        return Promise.resolve(sha256(data));
      }
    };
  }

  console.log('crypto-polyfill: SHA-256 digest polyfilled for non-secure context');
})();
