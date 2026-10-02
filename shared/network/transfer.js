// shared/network/transfer.js
// Account transfer — carrying a whole account from a desktop to a phone.
//
// Threat model, because it drives every decision here:
//
//   The desktop listens on the LAN. Anything on that network can open a socket to
//   it. What stops a stranger pulling someone's account is the LINK TOKEN: 128
//   random bits, generated when the user asks to link a phone, shown only as a QR
//   on the desktop's own screen, and never sent over the network in the clear.
//   The phone proves it by deriving the same encryption key from it.
//
//   So the token is the whole authorisation. It is single-use, short-lived, and
//   its entropy is what the security rests on — not the KDF. The KDF is PBKDF2
//   anyway, for consistency with the vault, but stretching adds nothing to a
//   128-bit random secret; do not be tempted to lower the token size because
//   "there are 100k iterations".
//
//   The receive side must NEVER trust the sender. Everything arriving over the
//   socket is validated before it is used for anything — sizes, counts, types,
//   and the assembled length against the manifest. See validateManifest and
//   validateChunk.

// Flat global, matching the other shared modules (OrbitQRPairing, OrbitSettingsSync).
window.OrbitAccountTransfer = (function () {

  var TOKEN_BYTES = 16;          // 128 bits
  var SALT_BYTES = 16;
  var IV_BYTES = 12;             // AES-GCM standard
  var KDF_ITERATIONS = 100000;   // matches the vault
  var MIN_ITERATIONS = 10000;    // refuse a peer asking for a weak KDF
  var MAX_ITERATIONS = 1000000;

  // Base64 characters per chunk. 48KB of base64 is ~36KB of ciphertext — small
  // enough to stay well under any single-packet limit on the transport, large
  // enough that a few thousand messages is a handful of round trips.
  var CHUNK_CHARS = 48 * 1024;

  // Refuse anything larger than this. A hostile or broken peer must not be able
  // to make the phone allocate without bound.
  var MAX_BUNDLE_BYTES = 64 * 1024 * 1024;

  var MAX_ID_LEN = 128;
  var MAX_NAME_LEN = 64;

  /* -- base64 -- */

  function bytesToB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function b64ToBytes(b64) {
    var s = atob(b64);
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function randomBytes(n) {
    var b = new Uint8Array(n);
    (window.crypto || window.msCrypto).getRandomValues(b);
    return b;
  }

  /* -- link token -- */

  // URL-safe so it survives being pasted anywhere, and short enough to sit in a
  // QR next to the rest of the pairing payload.
  function makeToken() {
    return bytesToB64(randomBytes(TOKEN_BYTES))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function isValidToken(t) {
    if (typeof t !== 'string') return false;
    // 16 bytes base64url is 22 chars; allow 20-24 so a future size change does
    // not need a protocol version.
    if (t.length < 20 || t.length > 24) return false;
    return /^[A-Za-z0-9_-]+$/.test(t);
  }

  /* -- key derivation + sealing -- */

  function deriveKey(token, saltB64, iterations) {
    var iters = parseInt(iterations, 10);
    if (!(iters >= MIN_ITERATIONS && iters <= MAX_ITERATIONS)) iters = KDF_ITERATIONS;

    var enc = new TextEncoder();
    return window.crypto.subtle
      .importKey('raw', enc.encode(token), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return window.crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: b64ToBytes(saltB64), iterations: iters, hash: 'SHA-256' },
          base,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']);
      });
  }

  /** Encrypt a JSON-serialisable object. Returns { iv, ct } both base64. */
  function seal(key, obj) {
    var iv = randomBytes(IV_BYTES);
    var data = new TextEncoder().encode(JSON.stringify(obj));
    return window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data)
      .then(function (ct) {
        return { iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
      });
  }

  /** Decrypt. Rejects on a wrong key or a tampered payload — GCM authenticates. */
  function open(key, ivB64, ctB64) {
    if (typeof ivB64 !== 'string' || typeof ctB64 !== 'string') {
      return Promise.reject(new Error('malformed sealed payload'));
    }
    return window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(ivB64) }, key, b64ToBytes(ctB64)
    ).then(function (plain) {
      return JSON.parse(new TextDecoder().decode(plain));
    });
  }

  /* -- chunking -- */

  function chunkString(s, size) {
    var out = [];
    for (var i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
    return out;
  }

  /* -- the bundle -- */

  /**
   * Everything that travels. Kept as one JSON document so the receive side has a
   * single thing to validate and nothing to reassemble across keys.
   */
  function buildBundle(account, data) {
    return {
      kind: 'orbit-account',
      v: 1,
      exportedAt: new Date().toISOString(),
      account: {
        id: String(account.id || ''),
        name: String(account.name || '').slice(0, MAX_NAME_LEN),
        tag: String(account.tag || '').slice(0, MAX_NAME_LEN)
      },
      // The same shape the mobile's per-account storage uses, minus the prefix:
      // { friends, chats, groups, messages: { chatId: [...] }, settings, user }
      data: data
    };
  }

  /* -- validation (receive side) -- */

  function fail(reason) { return { ok: false, reason: reason }; }

  function validateOffer(payload) {
    if (!payload || typeof payload !== 'object') return fail('malformed');
    var id = payload.transferId;
    if (typeof id !== 'string' || !id.length || id.length > MAX_ID_LEN) return fail('malformed');
    if (typeof payload.salt !== 'string' || payload.salt.length > 64) return fail('malformed');

    var iters = parseInt(payload.iterations, 10);
    if (!(iters >= MIN_ITERATIONS && iters <= MAX_ITERATIONS)) return fail('bad-kdf');

    var m = payload.manifest;
    if (!m || typeof m !== 'object') return fail('malformed');
    var bytes = parseInt(m.bytes, 10);
    var total = parseInt(m.total, 10);
    if (!(bytes > 0 && bytes <= MAX_BUNDLE_BYTES)) return fail('too-large');
    if (!(total > 0 && total <= 100000)) return fail('too-large');

    return {
      ok: true,
      transferId: id,
      salt: payload.salt,
      iterations: iters,
      manifest: {
        bytes: bytes,
        total: total,
        accountName: typeof m.accountName === 'string' ? m.accountName.slice(0, MAX_NAME_LEN) : '',
        counts: (m.counts && typeof m.counts === 'object') ? m.counts : {}
      }
    };
  }

  function validateChunk(payload, expectTransferId, total) {
    if (!payload || typeof payload !== 'object') return fail('malformed');
    if (payload.transferId !== expectTransferId) return fail('wrong-transfer');
    var seq = parseInt(payload.seq, 10);
    if (!(seq >= 0 && seq < total)) return fail('bad-seq');
    if (typeof payload.data !== 'string' || payload.data.length > CHUNK_CHARS) return fail('bad-chunk');
    return { ok: true, seq: seq, data: payload.data };
  }

  /**
   * Final check before anything is written. The assembled length must match what
   * the offer promised — a truncated transfer must not look like a complete one.
   */
  function validateBundle(bundle, expectedBytes) {
    if (!bundle || typeof bundle !== 'object') return fail('malformed');
    if (bundle.kind !== 'orbit-account') return fail('not-a-bundle');
    if (!bundle.account || typeof bundle.account.id !== 'string' || !bundle.account.id) {
      return fail('malformed');
    }
    if (!bundle.data || typeof bundle.data !== 'object') return fail('malformed');
    var actual = JSON.stringify(bundle).length;
    // Allow a little slack: expectedBytes is measured on the desktop's copy and
    // JSON key order can differ by a few bytes.
    if (expectedBytes && Math.abs(actual - expectedBytes) > 1024) {
      return fail('size-mismatch');
    }
    return { ok: true, bundle: bundle };
  }

  function describeReason(reason) {
    switch (reason) {
      case 'malformed':       return 'That transfer looked incomplete';
      case 'not-a-bundle':    return 'That is not an Orbit account';
      case 'too-large':       return 'That account is too large to transfer';
      case 'bad-kdf':         return 'That transfer used unsupported settings';
      case 'wrong-transfer':  return 'The transfer got out of step';
      case 'bad-seq':         return 'A piece of the transfer arrived out of order';
      case 'bad-chunk':       return 'A piece of the transfer was damaged';
      case 'size-mismatch':   return 'The transfer did not arrive in full';
      case 'bad-token':       return 'That code has expired — generate a new one';
      case 'declined':        return 'The desktop declined the transfer';
      default:                return 'The transfer failed';
    }
  }

  return {
    TOKEN_BYTES: TOKEN_BYTES,
    CHUNK_CHARS: CHUNK_CHARS,
    KDF_ITERATIONS: KDF_ITERATIONS,
    MAX_BUNDLE_BYTES: MAX_BUNDLE_BYTES,

    makeToken: makeToken,
    isValidToken: isValidToken,
    deriveKey: deriveKey,
    seal: seal,
    open: open,
    chunkString: chunkString,
    buildBundle: buildBundle,

    validateOffer: validateOffer,
    validateChunk: validateChunk,
    validateBundle: validateBundle,
    describeReason: describeReason,

    // exposed for the unit tests
    _bytesToB64: bytesToB64,
    _b64ToBytes: b64ToBytes
  };
})();
