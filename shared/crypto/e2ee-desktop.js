// shared/crypto/e2ee-desktop.js
// Desktop E2EE — thin wrapper over the window.orbitAPI.e2ee* IPC bridge.
//
// NOTE: this module is currently NOT loaded by desktop/src/index.html.
// Desktop performs E2EE through window.orbitAPI directly — see store.js
// e2eeEncryptMessage() / e2eeDecryptMessage(). It is kept because it is the
// intended shared interface for the E2EE unification work (mobile already talks
// to Orbit.E2EE.*), but do not wire it up without testing: desktop keys are
// 130-char hex and mobile keys are SPKI base64, so the two are not
// interchangeable yet. See plans/docs/Orbit QR Pairing v2 Design.md §3.2.

window.Orbit = window.Orbit || {};

Orbit.E2EE = {
  // Returns the local public key as 130 hex chars (main.js:235-240 uses
  // crypto.createECDH('prime256v1') + getPublicKey('hex')).
  getPublicKey() {
    if (window.orbitAPI && window.orbitAPI.e2eeGetPublicKey) {
      return window.orbitAPI.e2eeGetPublicKey();
    }
    return null;
  },

  encrypt(plaintext, peerPublicKeyHex) {
    if (window.orbitAPI && window.orbitAPI.e2eeEncrypt) {
      return window.orbitAPI.e2eeEncrypt(plaintext, peerPublicKeyHex);
    }
    return null;
  },

  // Takes the peer's public key only — the IV is prepended to the ciphertext
  // envelope and read back by the main-process handler, so there is no separate
  // nonce argument. The previous signature declared one and forwarded it in the
  // key's place, which would have made every decryption use the nonce as a
  // public key.
  decrypt(ciphertext, peerPublicKeyHex) {
    if (window.orbitAPI && window.orbitAPI.e2eeDecrypt) {
      return window.orbitAPI.e2eeDecrypt(ciphertext, peerPublicKeyHex);
    }
    return null;
  }
};
