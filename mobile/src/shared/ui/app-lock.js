/**
 * App lock — a PIN gate in front of the app.
 *
 * Ported from the desktop's `PinLockScreen`, with two differences forced by the
 * platform:
 *
 *  1. The desktop verifies through `window.orbitAPI.pinVerify` in Electron's
 *     main process. There is no main process here, so the hash lives in settings
 *     and is checked in JS. PBKDF2-SHA256 with a per-install salt, via WebCrypto,
 *     so the stored value is not the PIN and cannot be reversed by reading it.
 *  2. A keypad rather than a text field. A PIN on a phone is six digits and a
 *     thumb, and a keyboard covering half the screen is the wrong instrument.
 *
 * The desktop's attempt rules are kept exactly: five tries, then a 30 second
 * cooldown that survives a reload, because a cooldown you can clear by restarting
 * the app is not a cooldown.
 */
(function () {
  'use strict';

  var ITERATIONS = 120000;
  var LENGTH = 6;
  var MAX_ATTEMPTS = 5;
  var COOLDOWN_MS = 30000;
  var COOLDOWN_KEY = 'orbit_lock_cooldown_until';
  var ATTEMPTS_KEY = 'orbit_lock_attempts';

  function b64(buf) {
    var bytes = new Uint8Array(buf);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function fromB64(str) {
    var bin = atob(str);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function randomSalt() {
    var a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return b64(a);
  }

  /** PBKDF2-SHA256. Returns base64. */
  function derive(pin, saltB64) {
    var enc = new TextEncoder();
    var subtle = window.crypto && window.crypto.subtle;
    if (!subtle) return Promise.reject(new Error('no WebCrypto'));
    return subtle.importKey('raw', enc.encode(String(pin)), { name: 'PBKDF2' }, false, ['deriveBits'])
      .then(function (key) {
        return subtle.deriveBits(
          { name: 'PBKDF2', salt: fromB64(saltB64), iterations: ITERATIONS, hash: 'SHA-256' },
          key, 256
        );
      })
      .then(b64);
  }

  /** Constant-time-ish compare, so a wrong PIN does not reveal how wrong. */
  function same(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  function lockConfig(settings) {
    var s = settings || {};
    return (s.appLock && typeof s.appLock === 'object') ? s.appLock : null;
  }

  function isEnabled(settings) {
    var c = lockConfig(settings);
    return !!(c && c.enabled && c.hash && c.salt);
  }

  /** Set or replace the PIN. Resolves with the object to store on settings. */
  function setPin(pin) {
    if (!/^\d{4,8}$/.test(String(pin))) {
      return Promise.reject(new Error('A PIN is 4 to 8 digits'));
    }
    var salt = randomSalt();
    return derive(pin, salt).then(function (hash) {
      return { enabled: true, hash: hash, salt: salt, iterations: ITERATIONS, lockOnBackground: true };
    });
  }

  /** Check a PIN against the stored config. Always resolves with a boolean. */
  function verify(settings, pin) {
    var c = lockConfig(settings);
    if (!c || !c.hash || !c.salt) return Promise.resolve(false);
    return derive(pin, c.salt).then(function (hash) {
      return same(hash, c.hash);
    }).catch(function () { return false; });
  }

  // ── Attempts and cooldown ─────────────────────────────────────────────────
  // Kept in localStorage rather than on settings: this is not a preference, and
  // it must outlive a reload to mean anything.

  function cooldownLeft() {
    var until = parseInt(localStorage.getItem(COOLDOWN_KEY) || '0', 10);
    var left = until - Date.now();
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }

  function noteFailure() {
    var n = (parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0', 10) || 0) + 1;
    localStorage.setItem(ATTEMPTS_KEY, String(n));
    if (n >= MAX_ATTEMPTS) {
      localStorage.setItem(COOLDOWN_KEY, String(Date.now() + COOLDOWN_MS));
      localStorage.setItem(ATTEMPTS_KEY, '0');
      return { locked: true, seconds: Math.ceil(COOLDOWN_MS / 1000), left: 0 };
    }
    return { locked: false, left: MAX_ATTEMPTS - n };
  }

  function noteSuccess() {
    localStorage.removeItem(ATTEMPTS_KEY);
    localStorage.removeItem(COOLDOWN_KEY);
  }

  // ── The screen ────────────────────────────────────────────────────────────
  var _el = null;
  var _buf = '';
  var _onUnlock = null;

  function _render() {
    if (!_el) return;
    var dots = '';
    for (var i = 0; i < LENGTH; i++) {
      dots += '<span class="app-lock-dot' + (i < _buf.length ? ' filled' : '') + '"></span>';
    }
    _el.querySelector('.app-lock-dots').innerHTML = dots;
  }

  function _say(msg) {
    if (!_el) return;
    var err = _el.querySelector('.app-lock-msg');
    if (err) err.textContent = msg || '';
  }

  function _submit(settings) {
    var pin = _buf;
    _buf = '';
    _render();
    _say('');
    verify(settings, pin).then(function (ok) {
      if (ok) {
        noteSuccess();
        hide();
        if (typeof _onUnlock === 'function') _onUnlock();
        return;
      }
      var r = noteFailure();
      if (r.locked) {
        _say('Too many attempts. Try again in ' + r.seconds + 's');
        _startCooldownTick(settings);
      } else {
        _say('Incorrect PIN. ' + r.left + (r.left === 1 ? ' attempt' : ' attempts') + ' left');
      }
    });
  }

  var _tick = null;
  function _startCooldownTick(settings) {
    if (_tick) clearInterval(_tick);
    _tick = setInterval(function () {
      var left = cooldownLeft();
      if (left <= 0) {
        clearInterval(_tick);
        _tick = null;
        _say('');
        return;
      }
      _say('Too many attempts. Try again in ' + left + 's');
    }, 1000);
  }

  function show(settings, onUnlock) {
    hide();
    _onUnlock = onUnlock || null;
    _buf = '';

    _el = document.createElement('div');
    _el.id = 'app-lock-screen';
    _el.innerHTML =
      '<div class="app-lock-inner">' +
        '<div class="app-lock-logo"><i data-lucide="lock"></i></div>' +
        '<div class="app-lock-title">Orbit is locked</div>' +
        '<div class="app-lock-msg"></div>' +
        '<div class="app-lock-dots"></div>' +
        '<div class="app-lock-pad"></div>' +
      '</div>';
    document.body.appendChild(_el);

    var pad = _el.querySelector('.app-lock-pad');
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
    keys.forEach(function (k) {
      var b = document.createElement('button');
      b.className = 'app-lock-key' + (k === '' ? ' blank' : '');
      if (k === 'del') b.innerHTML = '<i data-lucide="delete"></i>';
      else b.textContent = k;
      if (k !== '') {
        b.addEventListener('click', function () {
          if (cooldownLeft() > 0) return;
          if (k === 'del') { _buf = _buf.slice(0, -1); _render(); return; }
          if (_buf.length >= LENGTH) return;
          _buf += k;
          _render();
          if (_buf.length === LENGTH) setTimeout(function () { _submit(settings); }, 120);
        });
      }
      pad.appendChild(b);
    });

    if (window.lucide) { try { window.lucide.createIcons({ root: _el }); } catch (e) {} }
    _render();

    var left = cooldownLeft();
    if (left > 0) { _say('Too many attempts. Try again in ' + left + 's'); _startCooldownTick(settings); }
  }

  function hide() {
    if (_tick) { clearInterval(_tick); _tick = null; }
    if (_el && _el.parentNode) _el.parentNode.removeChild(_el);
    _el = null;
    _buf = '';
  }

  function isShowing() { return !!_el; }

  window.OrbitAppLock = {
    LENGTH: LENGTH,
    isEnabled: isEnabled,
    setPin: setPin,
    verify: verify,
    show: show,
    hide: hide,
    isShowing: isShowing,
    cooldownLeft: cooldownLeft,
    clearAttempts: noteSuccess
  };
})();
