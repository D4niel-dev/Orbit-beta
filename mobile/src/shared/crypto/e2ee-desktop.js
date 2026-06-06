// shared/crypto/e2ee-desktop.js
// Desktop E2EE implementation — wraps window.orbitAPI.e2ee* IPC calls

window.Orbit = window.Orbit || {};

Orbit.E2EE = {
  getPublicKey() {
    if (window.orbitAPI && window.orbitAPI.e2eeGetPublicKey) {
      return window.orbitAPI.e2eeGetPublicKey();
    }
    return null;
  },

  encrypt(plaintext, publicKeyPem) {
    if (window.orbitAPI && window.orbitAPI.e2eeEncrypt) {
      return window.orbitAPI.e2eeEncrypt(plaintext, publicKeyPem);
    }
    return null;
  },

  decrypt(ciphertext, nonce, publicKeyPem) {
    if (window.orbitAPI && window.orbitAPI.e2eeDecrypt) {
      return window.orbitAPI.e2eeDecrypt(ciphertext, nonce, publicKeyPem);
    }
    return null;
  }
};
