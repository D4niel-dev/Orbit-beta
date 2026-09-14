// shared/network/qr-pairing.js
// QR pairing payload — build, validate, and parse. Shared by desktop and mobile.
//
// A QR code is UNTRUSTED INPUT. Every field is validated here so no platform
// can accidentally skip a check. See plans/docs/Orbit QR Pairing v2 Design.md.
//
// Payload v2: { v, id, n, t, ips: [...], port, pk, pkf }
//   v    2 (discriminator)
//   id   userId                       (required)
//   n    username
//   t    usertag
//   ips  candidate IPv4 addresses, most likely reachable first
//   port TCP port (default 46000)
//   pk   E2EE public key (see KEY FORMATS below)
//   pkf  key format tag: 'hex' | 'spki'
//
// Payload v1: { v: 1, id, n, t } — identity only, no reachability. Still parsed.
//
// ---------------------------------------------------------------------------
// KEY FORMATS — the two platforms do NOT agree
// ---------------------------------------------------------------------------
// Desktop (main.js:238) generates its key with Node's ECDH API:
//     ecdh.getPublicKey('hex')  -> 130 hex chars, raw uncompressed P-256 point
// Mobile (e2ee-mobile.js:113) exports via WebCrypto:
//     exportKey('spki', ...)    -> SPKI DER, base64-wrapped into a PEM block
//
// These are not two encodings of the same bytes: the desktop key is a bare
// point, the mobile key is a DER structure with an algorithm identifier. They
// cannot be converted without ASN.1 work, and the E2EE layer on each platform
// only understands its own (this is the known cross-platform E2EE mismatch).
//
// Consequence: a key carried in a QR is only usable by a peer on the SAME
// platform. We therefore tag the format with `pkf` and expose isUsableKey() so
// callers can refuse to store a key they cannot actually encrypt to. A
// cross-platform QR still pairs and connects — it just skips key pinning.
//
// The PEM armor is stripped before encoding (it is ~54 bytes of pure overhead
// and is trivially reconstructed on read).

window.Orbit = window.Orbit || {};

Orbit.QRPairing = (function() {
  var VERSION = 2;
  var DEFAULT_PORT = 46000;
  var MAX_PAYLOAD_BYTES = 2048;
  var MAX_IPS = 8;
  var MAX_ID_LEN = 128;
  var MAX_KEY_B64 = 512;

  // Private ranges we accept as connect targets. Deliberately excludes loopback,
  // multicast, and anything public — a QR must not be able to point Orbit at an
  // arbitrary host (LAN-local SSRF), and Orbit is a LAN product by design.
  //
  // Note this is a SAFETY check, not a reachability one. Virtual adapters
  // (Docker 172.17/16, WSL, VPN) live inside RFC1918 and are indistinguishable
  // from a real LAN address by address alone, so they pass here. They are
  // deprioritized or dropped during enumeration instead, where the platform can
  // see interface names ("Wi-Fi" vs "docker0" vs "vEthernet (WSL)"). A stale
  // virtual address in a QR is harmless: the scanner just tries the next one.
  var ALLOWED_RANGES = [
    { name: 'rfc1918-10', a: 10, b: 0, bMask: 0 },
    { name: 'rfc1918-172', a: 172, b: 16, bMask: 0xF0 },
    { name: 'rfc1918-192', a: 192, b: 168, bMask: 0xFF },
    { name: 'link-local', a: 169, b: 254, bMask: 0xFF }
  ];

  var HEX_KEY_RE = /^[0-9a-fA-F]{130}$/;
  var B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

  // Fixed DER header for an SPKI-wrapped P-256 public key, base64-encoded:
  // SEQUENCE { AlgorithmIdentifier { id-ecPublicKey, prime256v1 }, BIT STRING }
  // followed by the 0x04 uncompressed-point marker. Every WebCrypto export of
  // this key type starts with these exact 36 characters and totals 124.
  // Requiring it stops a malformed hex key from being silently reinterpreted as
  // base64 (both use characters that are valid in the other's alphabet).
  var SPKI_P256_PREFIX = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE';
  var SPKI_P256_LEN = 124;

  /* -- IPv4 helpers -- */

  function parseIPv4(str) {
    if (typeof str !== 'string') return null;
    var parts = str.trim().split('.');
    if (parts.length !== 4) return null;
    var out = [];
    for (var i = 0; i < 4; i++) {
      var p = parts[i];
      if (!/^\d{1,3}$/.test(p)) return null;
      var n = parseInt(p, 10);
      if (n < 0 || n > 255) return null;
      out.push(n);
    }
    return out;
  }

  function isAllowedAddress(str) {
    var o = parseIPv4(str);
    if (!o) return false;
    if (o[0] === 127) return false;                 // loopback
    if (o[0] === 0) return false;                   // 0.0.0.0/8
    if (o[0] >= 224) return false;                  // multicast + reserved + broadcast
    for (var i = 0; i < ALLOWED_RANGES.length; i++) {
      var r = ALLOWED_RANGES[i];
      if (o[0] === r.a && (o[1] & r.bMask) === (r.b & r.bMask)) return true;
    }
    return false;
  }

  /* -- Key format helpers -- */

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

  // Which key encoding does THIS device speak? null when unknown (plain web).
  //
  // Both platforms now speak SPKI — desktop moved to it as part of the E2EE
  // unification — so a key carried in a QR is usable across platforms, and
  // isUsableKey() no longer rejects a key just because it came from the other
  // platform.
  //
  // Detects directly rather than relying on shared/core/env.js having been
  // loaded first — desktop does not load it, and a silent wrong answer here
  // would disable key pinning without any visible failure.
  function localKeyFormat() {
    try {
      var env = (typeof Orbit !== 'undefined' && Orbit.env) || null;
      if (env) {
        if (env.isElectron || env.isAndroid || env.isIOS) return 'spki';
      }
      if (typeof window !== 'undefined') {
        if (window.orbitAPI) return 'spki';
        if (window.Capacitor && window.Capacitor.getPlatform) {
          var p = window.Capacitor.getPlatform();
          if (p === 'android' || p === 'ios') return 'spki';
        }
      }
    } catch (e) {
      // fall through
    }
    return null;
  }

  function isSpkiP256(b64) {
    return typeof b64 === 'string' &&
      b64.length === SPKI_P256_LEN &&
      b64.indexOf(SPKI_P256_PREFIX) === 0 &&
      B64_RE.test(b64);
  }

  // -> { format, value } or null. `value` is the compact on-the-wire form:
  //    'hex'  -> 130 hex chars
  //    'spki' -> base64 body with the PEM armor removed
  function normalizeKey(raw) {
    if (typeof raw !== 'string') return null;
    var s = raw.trim();
    if (s.length === 0) return null;

    if (s.indexOf('-----BEGIN') !== -1) {
      var body = stripPem(s);
      if (!isSpkiP256(body)) return null;
      return { format: 'spki', value: body };
    }

    if (HEX_KEY_RE.test(s) && s.slice(0, 2).toLowerCase() === '04') {
      return { format: 'hex', value: s.toLowerCase() };
    }

    // Bare base64 body, as carried in the QR
    if (isSpkiP256(s)) {
      return { format: 'spki', value: s };
    }

    return null;
  }

  function isValidPublicKey(raw) {
    return normalizeKey(raw) !== null;
  }

  // The key as the local platform's crypto layer needs it.
  function exportKey(key) {
    if (!key || !key.value) return null;
    return key.format === 'spki' ? wrapPem(key.value) : key.value;
  }

  /* -- Build -- */

  // Accepts either identity shape: desktop uses {userId,username,usertag},
  // mobile uses {id,name,tag}.
  function normalizeUser(user) {
    if (!user) return null;
    var id = user.userId || user.id;
    if (!id) return null;
    return {
      id: String(id),
      n: user.username || user.name || '',
      t: user.usertag || user.tag || ''
    };
  }

  function buildPayload(user, opts) {
    opts = opts || {};
    var u = normalizeUser(user);
    if (!u) return null;

    var ips = [];
    if (Array.isArray(opts.ips)) {
      for (var i = 0; i < opts.ips.length && ips.length < MAX_IPS; i++) {
        if (isAllowedAddress(opts.ips[i]) && ips.indexOf(opts.ips[i]) === -1) {
          ips.push(opts.ips[i]);
        }
      }
    }

    var port = parseInt(opts.port, 10);
    if (!(port > 0 && port <= 65535)) port = DEFAULT_PORT;

    var payload = { v: VERSION, id: u.id, n: u.n, t: u.t, ips: ips, port: port };

    var key = normalizeKey(opts.publicKey);
    if (key) {
      payload.pk = key.value;
      payload.pkf = key.format;
    }

    return JSON.stringify(payload);
  }

  /* -- Parse + validate -- */

  function fail(reason) {
    return { ok: false, reason: reason };
  }

  // opts.ownIps — the scanner's own addresses. Candidates matching these are
  // dropped (never connect to yourself). If that empties the list the caller
  // should fall back to discovery, which is not an error.
  function parsePayload(raw, opts) {
    opts = opts || {};

    if (typeof raw !== 'string' || raw.length === 0) return fail('malformed');
    if (raw.length > MAX_PAYLOAD_BYTES) return fail('too-large');

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return fail('malformed');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('not-orbit');

    var v = parsed.v;
    if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v) return fail('not-orbit');
    if (v > VERSION) return fail('newer-version');
    if (v !== 1 && v !== 2) return fail('not-orbit');

    if (typeof parsed.id !== 'string' || parsed.id.length === 0) return fail('malformed');
    if (parsed.id.length > MAX_ID_LEN) return fail('malformed');
    if (!/^[A-Za-z0-9_-]+$/.test(parsed.id)) return fail('malformed');

    var data = {
      id: parsed.id,
      n: typeof parsed.n === 'string' ? parsed.n.slice(0, 64) : '',
      t: typeof parsed.t === 'string' ? parsed.t.slice(0, 64) : '',
      ips: [],
      port: DEFAULT_PORT,
      key: null,
      keyUsable: false
    };

    // v1 carries no reachability or key — caller falls back to discovery.
    if (v === 1) {
      return { ok: true, version: 1, data: data };
    }

    var own = Array.isArray(opts.ownIps) ? opts.ownIps : [];
    if (Array.isArray(parsed.ips)) {
      for (var i = 0; i < parsed.ips.length && data.ips.length < MAX_IPS; i++) {
        var cand = parsed.ips[i];
        if (!isAllowedAddress(cand)) continue;
        if (own.indexOf(cand) !== -1) continue;      // don't connect to ourselves
        if (data.ips.indexOf(cand) === -1) data.ips.push(cand);
      }
    }

    var port = parseInt(parsed.port, 10);
    if (port > 0 && port <= 65535) data.port = port;

    var key = normalizeKey(parsed.pk);
    if (key) {
      // A declared pkf that contradicts the actual encoding is a malformed
      // payload, not a key we should guess at.
      if (typeof parsed.pkf === 'string' && parsed.pkf !== key.format) {
        key = null;
      }
    }
    if (key) {
      data.key = key;
      data.keyUsable = (key.format === localKeyFormat());
    }

    return { ok: true, version: 2, data: data };
  }

  // True when the peer's pinned key is one this device can actually encrypt to.
  // False across platforms (see KEY FORMATS at the top of this file).
  function isUsableKey(data) {
    return !!(data && data.key && data.keyUsable);
  }

  /* -- Local address enumeration -- */

  // Sanitize whatever the platform hands back. Ordering by interface name is
  // done natively (main.js / the Android service) because only there do we know
  // which adapter is Wi-Fi and which is a Docker bridge.
  function filterLocalIps(ips) {
    var out = [];
    if (!Array.isArray(ips)) return out;
    for (var i = 0; i < ips.length; i++) {
      var ip = ips[i];
      if (!isAllowedAddress(ip)) continue;
      if (out.indexOf(ip) === -1) out.push(ip);
    }
    return out;
  }

  // Resolves to [] when the platform cannot tell us — callers must degrade to
  // discovery rather than fail. A v2 payload with an empty ips[] is valid.
  // Capability-detected, not env-detected, for the same reason as localKeyFormat.
  function listLocalIPv4() {
    return new Promise(function(resolve) {
      try {
        if (typeof window !== 'undefined' && window.orbitAPI && window.orbitAPI.getLocalIPv4s) {
          window.orbitAPI.getLocalIPv4s().then(function(ips) {
            resolve(filterLocalIps(ips));
          }).catch(function() { resolve([]); });
          return;
        }

        var p2p = (typeof window !== 'undefined' && window.Capacitor &&
                   window.Capacitor.Plugins && window.Capacitor.Plugins.OrbitP2P) || null;
        if (p2p && p2p.getLocalIps) {
          p2p.getLocalIps().then(function(res) {
            resolve(filterLocalIps(res && res.ips));
          }).catch(function() { resolve([]); });
          return;
        }
      } catch (e) {
        // fall through
      }
      resolve([]);
    });
  }

  // Human-readable reason for a failed parse.
  function describeReason(reason) {
    if (reason === 'newer-version') return 'This QR code needs a newer version of Orbit.';
    if (reason === 'too-large') return 'That QR code is too large to be an Orbit code.';
    return "That doesn't look like an Orbit code.";
  }

  return {
    VERSION: VERSION,
    DEFAULT_PORT: DEFAULT_PORT,
    MAX_PAYLOAD_BYTES: MAX_PAYLOAD_BYTES,
    MAX_IPS: MAX_IPS,
    buildPayload: buildPayload,
    parsePayload: parsePayload,
    listLocalIPv4: listLocalIPv4,
    filterLocalIps: filterLocalIps,
    isAllowedAddress: isAllowedAddress,
    isValidPublicKey: isValidPublicKey,
    normalizeKey: normalizeKey,
    exportKey: exportKey,
    localKeyFormat: localKeyFormat,
    isUsableKey: isUsableKey,
    parseIPv4: parseIPv4,
    describeReason: describeReason
  };
})();
