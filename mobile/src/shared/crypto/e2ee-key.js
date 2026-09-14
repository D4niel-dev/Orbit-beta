// shared/crypto/e2ee-key.js
// Platform-agnostic E2EE key and KDF specification.
//
// This module contains NO crypto calls. It holds the constants and pure byte
// conversions that both platforms must agree on, so the two implementations can
// be checked against one shared definition instead of drifting apart again.
//
// WHY THIS EXISTS
// ---------------
// Desktop and mobile currently encrypt DMs incompatibly. Three separate
// divergences were confirmed by direct measurement (see
// tests/unit/e2ee-key.test.js):
//
//   1. KEY ENCODING   desktop: 130-char hex, raw uncompressed P-256 point
//                     mobile : SPKI DER, base64, PEM-armoured
//   2. KEY DERIVATION desktop: AES key = SHA-256(sharedSecret)
//                     mobile : AES key = HKDF-SHA256(sharedSecret, salt, info)
//   3. ENVELOPE       desktop: payload.text = base64(iv || ct || tag)
//                     mobile : payload.ciphertext + payload.nonce, separate
//
// What the measurements also showed: the underlying ECDH shared secret is
// IDENTICAL on both platforms (both return the raw 32-byte X coordinate). So
// only the encoding, the KDF, and the envelope need to be reconciled — the
// elliptic-curve maths is already in agreement.
//
// The target scheme below is mobile's, because it is the more standard one and
// WebCrypto implements it natively. Unifying therefore means teaching desktop to
// speak it; mobile's crypto does not change.

(function() {

var api = (function() {

  // Fixed DER prefix of an SPKI-wrapped P-256 public key (26 bytes):
  //   SEQUENCE { SEQUENCE { OID ecPublicKey, OID prime256v1 }, BIT STRING }
  // Prepend to the 65-byte uncompressed point to build a full SPKI (91 bytes);
  // strip it to recover the raw point. Verified against WebCrypto output.
  var SPKI_P256_HEADER_HEX = '3059301306072a8648ce3d020106082a8648ce3d030107034200';

  // The same prefix as it appears at the start of the base64 form. 36 chars
  // because base64 covers 27 bytes — the 26-byte header plus the point's 0x04
  // uncompressed marker.
  var SPKI_P256_PREFIX_B64 = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE';

  var RAW_POINT_BYTES = 65;
  var SPKI_BYTES = 91;
  var SPKI_B64_LEN = 124;

  // The one derivation both platforms must use.
  var KDF = {
    name: 'HKDF',
    hash: 'SHA-256',
    // Mobile currently passes a 16-byte all-zero salt. Kept as-is so existing
    // mobile ciphertexts stay decryptable; the info string carries the domain
    // separation instead.
    saltBytes: 16,
    saltIsZero: true,
    info: 'orbit-e2ee-v1',
    outputBytes: 32
  };

  // AES-GCM envelope: 12-byte IV, then ciphertext, then the 16-byte tag.
  var ENVELOPE = {
    ivBytes: 12,
    tagBytes: 16,
    // Canonical field names on the wire (mobile's layout).
    ciphertextField: 'ciphertext',
    nonceField: 'nonce'
  };

  /* -- byte helpers (pure, so this module runs in Node and in a WebView) -- */

  function hexToBytes(hex) {
    if (typeof hex !== 'string') return null;
    var clean = hex.trim().toLowerCase();
    if (clean.length % 2 !== 0) return null;
    if (!/^[0-9a-f]*$/.test(clean)) return null;
    var out = new Uint8Array(clean.length / 2);
    for (var i = 0; i < out.length; i++) {
      out[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return out;
  }

  function bytesToHex(bytes) {
    if (!bytes) return null;
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
      s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    }
    return s;
  }

  var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function bytesToBase64(bytes) {
    if (!bytes) return null;
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i];
      var b1 = i + 1 < bytes.length ? bytes[i + 1] : NaN;
      var b2 = i + 2 < bytes.length ? bytes[i + 2] : NaN;
      out += B64_CHARS[b0 >> 2];
      out += B64_CHARS[((b0 & 3) << 4) | (isNaN(b1) ? 0 : b1 >> 4)];
      out += isNaN(b1) ? '=' : B64_CHARS[((b1 & 15) << 2) | (isNaN(b2) ? 0 : b2 >> 6)];
      out += isNaN(b2) ? '=' : B64_CHARS[b2 & 63];
    }
    return out;
  }

  function base64ToBytes(b64) {
    if (typeof b64 !== 'string') return null;
    var clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
    var len = Math.floor(clean.length * 3 / 4);
    if (len === 0) return new Uint8Array(0);
    var out = new Uint8Array(len);
    var p = 0;
    while (clean.length % 4 !== 0) clean += 'A';
    for (var i = 0; i + 3 < clean.length; i += 4) {
      var a = B64_CHARS.indexOf(clean[i]);
      var b = B64_CHARS.indexOf(clean[i + 1]);
      var c = B64_CHARS.indexOf(clean[i + 2]);
      var d = B64_CHARS.indexOf(clean[i + 3]);
      if (p < len) out[p++] = (a << 2) | (b >> 4);
      if (p < len) out[p++] = ((b & 15) << 4) | (c >> 2);
      if (p < len) out[p++] = ((c & 3) << 6) | d;
    }
    return out;
  }

  /* -- PEM -- */

  function stripPem(pem) {
    return String(pem)
      .replace(/-----BEGIN PUBLIC KEY-----/g, '')
      .replace(/-----END PUBLIC KEY-----/g, '')
      .replace(/\s/g, '');
  }

  function wrapPem(b64) {
    var lines = ['-----BEGIN PUBLIC KEY-----'];
    for (var i = 0; i < b64.length; i += 64) lines.push(b64.slice(i, i + 64));
    lines.push('-----END PUBLIC KEY-----');
    return lines.join('\n');
  }

  /* -- format detection and conversion -- */

  // -> 'hex' | 'spki' | null
  function detectFormat(key) {
    if (typeof key !== 'string') return null;
    var s = key.trim();
    if (s.length === 0) return null;

    if (s.indexOf('-----BEGIN') !== -1) {
      var body = stripPem(s);
      return isSpkiBase64(body) ? 'spki' : null;
    }

    // Legacy raw uncompressed point (130 hex chars).
    if (/^[0-9a-fA-F]{130}$/.test(s) && s.slice(0, 2).toLowerCase() === '04') {
      return 'hex';
    }

    // SPKI as hex (182 chars) — what desktop advertises. Without this branch a
    // desktop-to-desktop pair is rejected as an unrecognised key format.
    if (isSpkiHex(s)) return 'spki';

    return isSpkiBase64(s) ? 'spki' : null;
  }

  function isSpkiHex(hex) {
    return typeof hex === 'string' &&
      hex.length === SPKI_BYTES * 2 &&
      hex.slice(0, 4).toLowerCase() === '3059' &&
      /^[0-9a-fA-F]+$/.test(hex);
  }

  function isSpkiBase64(b64) {
    return typeof b64 === 'string' &&
      b64.length === SPKI_B64_LEN &&
      b64.indexOf(SPKI_P256_PREFIX_B64) === 0;
  }

  // Raw 65-byte uncompressed point -> 91-byte SPKI DER (hex in, hex out).
  function rawPointToSpki(raw) {
    var bytes = typeof raw === 'string' ? hexToBytes(raw) : raw;
    if (!bytes || bytes.length !== RAW_POINT_BYTES) return null;
    if (bytes[0] !== 0x04) return null;
    var header = hexToBytes(SPKI_P256_HEADER_HEX);
    var out = new Uint8Array(header.length + bytes.length);
    out.set(header, 0);
    out.set(bytes, header.length);
    return bytesToHex(out);
  }

  // 91-byte SPKI DER -> raw 65-byte point (hex in, hex out).
  function spkiToRawPoint(spki) {
    var bytes = typeof spki === 'string' ? hexToBytes(spki) : spki;
    if (!bytes || bytes.length !== SPKI_BYTES) return null;
    var header = hexToBytes(SPKI_P256_HEADER_HEX);
    for (var i = 0; i < header.length; i++) {
      if (bytes[i] !== header[i]) return null;
    }
    var point = bytes.slice(header.length);
    if (point[0] !== 0x04) return null;
    return bytesToHex(point);
  }

  // Normalise any accepted key form to a canonical { format, hex, base64, pem }.
  function normalize(key) {
    var format = detectFormat(key);
    if (!format) return null;

    if (format === 'hex') {
      var spkiHexFromRaw = rawPointToSpki(key.trim().toLowerCase());
      if (!spkiHexFromRaw) return null;
      var spkiB64FromRaw = bytesToBase64(hexToBytes(spkiHexFromRaw));
      return {
        format: 'hex',
        hex: key.trim().toLowerCase(),
        spkiHex: spkiHexFromRaw,
        base64: spkiB64FromRaw,
        pem: wrapPem(spkiB64FromRaw)
      };
    }

    // SPKI arrives in three shapes: hex (desktop), bare base64 (QR payload), or
    // PEM (mobile). Normalise all of them to the same set of representations so
    // callers never have to care which one they were handed.
    var s = key.trim();
    var derHex;
    if (s.indexOf('-----BEGIN') !== -1) {
      derHex = bytesToHex(base64ToBytes(stripPem(s)));
    } else if (isSpkiHex(s)) {
      derHex = s.toLowerCase();
    } else {
      derHex = bytesToHex(base64ToBytes(s));
    }

    var rawHex = spkiToRawPoint(derHex);
    if (!rawHex) return null;
    var b64 = bytesToBase64(hexToBytes(derHex));
    return {
      format: 'spki',
      hex: rawHex,
      spkiHex: derHex,
      base64: b64,
      pem: wrapPem(b64)
    };
  }

  /* -- envelope layout conversion -- */

  // Desktop currently packs iv || ciphertext || tag into ONE base64 string and
  // sends it as payload.text. Mobile sends payload.ciphertext (base64 of
  // ciphertext || tag, exactly what WebCrypto's AES-GCM returns) plus
  // payload.nonce (base64 of the iv) as separate fields.
  //
  // The canonical layout is mobile's. These two helpers let desktop convert in
  // either direction without re-implementing the byte splitting.

  function packedToFields(packedB64) {
    var bytes = base64ToBytes(packedB64);
    if (!bytes || bytes.length <= ENVELOPE.ivBytes + ENVELOPE.tagBytes) return null;
    var iv = bytes.slice(0, ENVELOPE.ivBytes);
    var body = bytes.slice(ENVELOPE.ivBytes);            // ciphertext || tag
    return {
      nonce: bytesToBase64(iv),
      ciphertext: bytesToBase64(body)
    };
  }

  function fieldsToPacked(ciphertextB64, nonceB64) {
    var body = base64ToBytes(ciphertextB64);
    var iv = base64ToBytes(nonceB64);
    if (!body || !iv || iv.length !== ENVELOPE.ivBytes) return null;
    var out = new Uint8Array(iv.length + body.length);
    out.set(iv, 0);
    out.set(body, iv.length);
    return bytesToBase64(out);
  }

  return {
    SPKI_P256_HEADER_HEX: SPKI_P256_HEADER_HEX,
    SPKI_P256_PREFIX_B64: SPKI_P256_PREFIX_B64,
    RAW_POINT_BYTES: RAW_POINT_BYTES,
    SPKI_BYTES: SPKI_BYTES,
    SPKI_B64_LEN: SPKI_B64_LEN,
    KDF: KDF,
    ENVELOPE: ENVELOPE,

    hexToBytes: hexToBytes,
    bytesToHex: bytesToHex,
    bytesToBase64: bytesToBase64,
    base64ToBytes: base64ToBytes,
    stripPem: stripPem,
    wrapPem: wrapPem,

    detectFormat: detectFormat,
    isSpkiBase64: isSpkiBase64,
    isSpkiHex: isSpkiHex,
    rawPointToSpki: rawPointToSpki,
    spkiToRawPoint: spkiToRawPoint,
    normalize: normalize,

    packedToFields: packedToFields,
    fieldsToPacked: fieldsToPacked
  };
})();

// Browser: expose as a global alongside the other Orbit modules.
// Node (desktop main process): also export, so main.js can require() this file
// instead of keeping a second copy of the constants that would drift.
if (typeof window !== 'undefined') {
  window.Orbit = window.Orbit || {};
  window.Orbit.E2EEKey = api;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

})();
