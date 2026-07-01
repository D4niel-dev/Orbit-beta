// shared/crypto/e2ee-mobile.js
// Mobile E2EE implementation using Web Crypto API (SubtleCrypto)
// Works in Android WebView / Chrome

window.Orbit = window.Orbit || {};

Orbit.E2EE = (function() {
  var keyPair = null;
  var keyId = null;

  function _safeB64ToArrayBuffer(b64) {
    var lookup = [], chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (var li = 0; li < 64; li++) lookup[chars.charCodeAt(li)] = li;
    var clean = '';
    for (var si = 0; si < b64.length; si++) {
      var cc = b64.charCodeAt(si);
      if (lookup[cc] !== undefined) clean += b64[si];
    }
    var binLen = Math.floor(clean.length * 3 / 4);
    if (binLen === 0) return new ArrayBuffer(0);
    var buf = new ArrayBuffer(binLen), bytes = new Uint8Array(buf);
    while (clean.length % 4 !== 0) clean += 'A';
    var p = 0;
    for (var bi = 0; bi + 3 < clean.length; bi += 4) {
      var a = lookup[clean.charCodeAt(bi)], b = lookup[clean.charCodeAt(bi + 1)];
      var c = lookup[clean.charCodeAt(bi + 2)], d = lookup[clean.charCodeAt(bi + 3)];
      if (p < binLen) bytes[p++] = (a << 2) | (b >> 4);
      if (p < binLen) bytes[p++] = ((b & 0x0F) << 4) | (c >> 2);
      if (p < binLen) bytes[p++] = ((c & 0x03) << 6) | d;
    }
    return buf;
  }

  function arrayBufferToBase64(buf) {
    var binary = '';
    var bytes = new Uint8Array(buf);
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToArrayBuffer(b64) {
    return _safeB64ToArrayBuffer(b64);
  }

  function pemToArrayBuffer(pem) {
    var b64 = pem.replace(/-----BEGIN PUBLIC KEY-----/g, '').replace(/-----END PUBLIC KEY-----/g, '').replace(/\s/g, '');
    return base64ToArrayBuffer(b64);
  }

  function arrayBufferToPem(buf) {
    var b64 = arrayBufferToBase64(buf);
    var lines = ['-----BEGIN PUBLIC KEY-----'];
    for (var i = 0; i < b64.length; i += 64) {
      lines.push(b64.slice(i, i + 64));
    }
    lines.push('-----END PUBLIC KEY-----');
    return lines.join('\n');
  }

  function deriveAesKey(sharedSecret) {
    return crypto.subtle.importKey(
      'raw', sharedSecret, { name: 'HKDF' }, false, ['deriveKey']
    ).then(function(hkdfKey) {
      return crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          salt: new Uint8Array(16),
          info: new TextEncoder().encode('orbit-e2ee-v1')
        },
        hkdfKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    });
  }

  return {
    async init() {
      try {
        var stored = localStorage.getItem('orbit_e2ee_keys');
        if (stored) {
          var parsed = JSON.parse(stored);
          keyId = parsed.keyId;

          var privateKeyRaw = base64ToArrayBuffer(parsed.privateKey);
          var publicKeyRaw = base64ToArrayBuffer(parsed.publicKey);

          keyPair = {
            privateKey: await crypto.subtle.importKey(
              'pkcs8', privateKeyRaw,
              { name: 'ECDH', namedCurve: 'P-256' },
              false, ['deriveKey', 'deriveBits']
            ),
            publicKey: await crypto.subtle.importKey(
              'spki', publicKeyRaw,
              { name: 'ECDH', namedCurve: 'P-256' },
              true, []
            )
          };
          return true;
        }

        // Generate new key pair
        keyPair = await crypto.subtle.generateKey(
          { name: 'ECDH', namedCurve: 'P-256' },
          true,
          ['deriveKey', 'deriveBits']
        );

        var rawPublic = await crypto.subtle.exportKey('spki', keyPair.publicKey);
        var rawPrivate = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
        keyId = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

        localStorage.setItem('orbit_e2ee_keys', JSON.stringify({
          keyId: keyId,
          publicKey: arrayBufferToBase64(rawPublic),
          privateKey: arrayBufferToBase64(rawPrivate)
        }));

        return true;
      } catch(e) {
        console.error('[E2EE] Init failed:', e);
        return false;
      }
    },

    getPublicKey() {
      if (!keyPair) return null;
      try {
        if (!keyPair._publicKeyPem) {
          var exportPromise = crypto.subtle.exportKey('spki', keyPair.publicKey);
        }
        return null;
      } catch(e) {
        return null;
      }
    },

    async getPublicKeyAsync() {
      if (!keyPair) return null;
      var raw = await crypto.subtle.exportKey('spki', keyPair.publicKey);
      return arrayBufferToPem(raw);
    },

    async encrypt(plaintext, peerPublicKeyPem) {
      if (!keyPair) return null;

      try {
        var peerKey = await crypto.subtle.importKey(
          'spki', pemToArrayBuffer(peerPublicKeyPem),
          { name: 'ECDH', namedCurve: 'P-256' },
          false, []
        );

        var sharedBits = await crypto.subtle.deriveBits(
          { name: 'ECDH', public: peerKey },
          keyPair.privateKey,
          256
        );

        var aesKey = await deriveAesKey(sharedBits);

        var nonce = crypto.getRandomValues(new Uint8Array(12));
        var encoded = new TextEncoder().encode(plaintext);

        var ciphertext = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: nonce },
          aesKey,
          encoded
        );

        return {
          ciphertext: arrayBufferToBase64(ciphertext),
          nonce: arrayBufferToBase64(nonce)
        };
      } catch(e) {
        console.error('[E2EE] Encrypt failed:', e);
        return null;
      }
    },

    async decrypt(ciphertextB64, nonceB64, senderPublicKeyPem) {
      if (!keyPair) return null;

      try {
        var senderKey = await crypto.subtle.importKey(
          'spki', pemToArrayBuffer(senderPublicKeyPem),
          { name: 'ECDH', namedCurve: 'P-256' },
          false, []
        );

        var sharedBits = await crypto.subtle.deriveBits(
          { name: 'ECDH', public: senderKey },
          keyPair.privateKey,
          256
        );

        var aesKey = await deriveAesKey(sharedBits);

        var ciphertext = base64ToArrayBuffer(ciphertextB64);
        var nonce = base64ToArrayBuffer(nonceB64);

        var decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: new Uint8Array(nonce) },
          aesKey,
          ciphertext
        );

        return new TextDecoder().decode(decrypted);
      } catch(e) {
        console.error('[E2EE] Decrypt failed:', e);
        return null;
      }
    },

    getKeyId() {
      return keyId;
    }
  };
})();

console.log('[E2EE] Mobile module loaded');
