// mobile/src/js/components/account-receive.js
// The receiving half of "Pair a desktop" — pull an account off a desktop.
//
// The phone scans a code that carries a link token. Holding that token IS the
// authorisation: the desktop will not build or send anything until the phone
// proves it has it, by deriving the same key from it.
//
// Two rules, both about not destroying what is already on the device:
//   1. The account is imported into a NEW namespace. It is never written over the
//      active account, and it is only switched to once the whole bundle has
//      arrived, decrypted and validated.
//   2. Nothing is written until validateBundle has passed. A truncated or
//      tampered transfer must leave the device exactly as it was.

window.OrbitAccountReceive = {

  // { token, peerId, peerIp, transferId, salt, iterations, iv, manifest, chunks,
  //   key, done }
  _rx: null,

  /** True when a scanned payload is offering an account transfer. */
  isTransferPayload: function (data) {
    return !!(data && typeof data.linkToken === 'string' && data.linkToken.length);
  },

  /**
   * Kick off a pull from the desktop we just paired with.
   * `data` is the parsed QR payload (see Orbit.QRPairing.parsePayload).
   */
  start: function (data) {
    if (!this.isTransferPayload(data)) return false;
    if (!window.MStore || !window.Orbit || !Orbit.P2P) return false;

    this._rx = {
      token: data.linkToken,
      peerId: data.id,
      peerIp: (data.ips && data.ips.length) ? data.ips[0] : null,
      transferId: null, salt: null, iterations: null, iv: null,
      manifest: null, chunks: [], key: null, done: false
    };

    this.setStatus('Asking your desktop…');

    var me = MStore.user ? (MStore.user.id || MStore.user.userId) : '';
    try {
      Orbit.P2P.send(data.id, Orbit.Protocol.createPacket(
        Orbit.Protocol.Types.TRANSFER_REQUEST, me, data.id,
        { token: data.linkToken, deviceName: this._deviceName() }));
    } catch (e) {
      this.setStatus('Could not reach the desktop', 'error');
      this._rx = null;
      return false;
    }
    return true;
  },

  _deviceName: function () {
    try {
      if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Device) return 'This phone';
    } catch (e) {}
    return 'This phone';
  },

  /* ── UI hooks, overridden by the pair screen ───────────────────────────── */

  setStatus: function (text, kind) {
    var el = document.getElementById('qr-scan-status-text');
    var box = document.getElementById('qr-scan-status');
    if (el) el.textContent = text;
    if (box) {
      box.style.color = kind === 'error' ? 'var(--accent-danger)'
                      : kind === 'ok' ? 'var(--accent-success)'
                      : '';
    }
  },

  setProgress: function (fraction) {
    var bar = document.getElementById('qr-scan-bar');
    if (!bar) return;
    bar.style.display = '';
    bar.style.width = Math.round(Math.max(0, Math.min(1, fraction)) * 100) + '%';
  },

  /* ── incoming packets ──────────────────────────────────────────────────── */

  handleOffer: function (packet) {
    if (!this._rx) return;
    var T = window.OrbitAccountTransfer;
    var res = T.validateOffer(packet.payload);
    if (!res.ok) {
      this.setStatus(T.describeReason(res.reason), 'error');
      this._rx = null;
      return;
    }
    // An offer for a transfer we did not ask for.
    if (packet.from !== this._rx.peerId) return;

    this._rx.transferId = res.transferId;
    this._rx.salt = res.salt;
    this._rx.iterations = res.iterations;
    this._rx.iv = packet.payload.iv;
    this._rx.manifest = res.manifest;
    this._rx.chunks = new Array(res.manifest.total);
    this._rx.received = 0;

    this.setStatus('Receiving ' + res.manifest.total + ' pieces…');
    this.setProgress(0);
  },

  handleChunk: function (packet) {
    var rx = this._rx;
    if (!rx || !rx.transferId) return;
    var T = window.OrbitAccountTransfer;

    var res = T.validateChunk(packet.payload, rx.transferId, rx.manifest.total);
    if (!res.ok) {
      this.setStatus(T.describeReason(res.reason), 'error');
      this._rx = null;
      return;
    }
    if (rx.chunks[res.seq] === undefined) {
      rx.chunks[res.seq] = res.data;
      rx.received++;
    }
    this.setProgress(rx.received / rx.manifest.total);
    this.setStatus('Receiving… ' + Math.round((rx.received / rx.manifest.total) * 100) + '%');
  },

  handleDone: function (packet) {
    var rx = this._rx;
    if (!rx || !rx.transferId) return;
    if (packet.payload && packet.payload.transferId !== rx.transferId) return;

    var T = window.OrbitAccountTransfer;
    var self = this;

    // Every piece, in order. A gap means the transfer was cut short.
    for (var i = 0; i < rx.manifest.total; i++) {
      if (rx.chunks[i] === undefined) {
        self._fail('size-mismatch');
        return;
      }
    }
    rx.done = true;
    self.setStatus('Decrypting…');

    var body = rx.chunks.join('');
    var dot = body.indexOf('.');
    if (dot < 0) { self._fail('malformed'); return; }
    var ivB64 = body.slice(0, dot);
    var ctB64 = body.slice(dot + 1);

    T.deriveKey(rx.token, rx.salt, rx.iterations)
      .then(function (key) {
        // The IV travels in the offer; use it rather than trusting the body's
        // prefix, so a body that was reordered still fails cleanly.
        return T.open(key, rx.iv || ivB64, ctB64);
      })
      .then(function (bundle) {
        var check = T.validateBundle(bundle, rx.manifest.bytes);
        if (!check.ok) throw new Error(check.reason);
        return self._import(bundle, packet);
      })
      .catch(function (e) {
        self._fail(e.message || 'malformed');
      });
  },

  _fail: function (reason) {
    var T = window.OrbitAccountTransfer;
    var rx = this._rx;
    this.setStatus(T.describeReason(reason), 'error');
    if (rx && rx.transferId && window.Orbit && Orbit.P2P) {
      try {
        Orbit.P2P.send(rx.peerId, Orbit.Protocol.createPacket(
          Orbit.Protocol.Types.TRANSFER_RESULT,
          MStore.user ? (MStore.user.id || MStore.user.userId) : '', rx.peerId,
          { transferId: rx.transferId, ok: false, error: reason }));
      } catch (e) {}
    }
    this._rx = null;
  },

  /* ── import ────────────────────────────────────────────────────────────── */

  _import: function (bundle, packet) {
    var self = this;
    var account = bundle.data;
    if (!account || !account.user) { self._fail('malformed'); return; }

    this.setStatus('Saving…');

    // A NEW account, never over the active one. createAccount() switches to it
    // and leaves a default identity, which is then replaced wholesale.
    var newId;
    try {
      newId = MStore.createAccount();
    } catch (e) {
      self._fail('malformed');
      return;
    }

    MStore.user = account.user;
    MStore.friends = Array.isArray(account.friends) ? account.friends : [];
    MStore.chats = Array.isArray(account.chats) ? account.chats : [];
    MStore.groups = Array.isArray(account.groups) ? account.groups : [];
    MStore.messages = (account.messages && typeof account.messages === 'object') ? account.messages : {};

    // Settings: only keys this build already knows. An unfamiliar key from a
    // newer desktop must not land in here and confuse the app later.
    var defaults = MStore._settingsDefaults || {};
    var importedSettings = account.settings || {};
    Object.keys(importedSettings).forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(defaults, k)) {
        MStore.settings[k] = importedSettings[k];
      }
    });

    try {
      MStore.save();
      // save() does NOT persist messages — there is no set('messages') in it.
      // They are written one chat at a time. Without this the whole imported
      // history would sit in memory, look fine, and be gone on the next boot.
      Object.keys(MStore.messages).forEach(function (chatId) {
        try { MStore.set('msg_' + chatId, MStore.messages[chatId]); } catch (e) {}
      });
      if (MStore.syncAccountRecord) MStore.syncAccountRecord();
    } catch (e) {
      self._fail('malformed');
      return;
    }

    this.setProgress(1);
    this.setStatus('Done — ' + (account.user.name || 'account') + ' is on this phone', 'ok');

    if (window.Orbit && Orbit.P2P) {
      try {
        Orbit.P2P.send(this._rx.peerId, Orbit.Protocol.createPacket(
          Orbit.Protocol.Types.TRANSFER_RESULT,
          account.user.id, this._rx.peerId,
          { transferId: this._rx.transferId, ok: true }));
      } catch (e) {}
    }
    this._rx = null;

    // Reload so the app boots as the imported account — the same thing switching
    // accounts does, and the only way the network layer picks up the new identity.
    setTimeout(function() { window.location.reload(); }, 1400);
  }
};
