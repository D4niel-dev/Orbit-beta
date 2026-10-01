// shared/network/settings-sync.js
//
// Carrying a few settings between your own devices.
//
// Orbit has no settings sync at all today: the protocol's packet types are messages,
// reactions, file transfers, discovery, beacons and group operations. So a custom
// theme built on the desktop cannot reach a phone, even when both are signed into the
// same account and sitting on the same network.
//
// This module is the part that decides WHAT travels and whether an incoming payload
// may be applied. The transport (a SETTINGS_SYNC packet, sent to peers whose userId
// matches your own) is wired up separately, because the rules are worth testing on
// their own — and because the receive side must never trust the sender.
//
// Deliberately conservative:
//   * an explicit whitelist, not "everything" — a settings blob that carries all of
//     `settings` would ship unrelated preferences (and anything added later) without
//     anyone deciding that it should
//   * versioned, so a future format change is detectable rather than misread
//   * validated on receive: unknown keys are dropped, wrong types are dropped, and
//     the whole payload is size-capped so a peer cannot send a megabyte of colours
//   * last-write-wins by timestamp, which is predictable and needs no merge logic
//
// Shared by both platforms like the other modules in shared/: edit this file, then
// run `npm run shared:sync` in mobile/.
(function () {
  'use strict';

  var VERSION = 1;

  // The whitelist. Adding a key here is a decision, which is the point.
  var SYNC_KEYS = ['theme', 'customThemeColors'];

  // Themes the app actually has. 'custom' is the one the colour editor sets.
  var KNOWN_THEMES = [
    'dark', 'light', 'system', 'custom', 'seasonal',
    'dark-purple', 'midnight', 'sunset', 'nord',
    'seasonal-spring', 'seasonal-summer', 'seasonal-fall', 'seasonal-winter'
  ];

  // A custom theme has 17 tokens. The cap is generous but finite: without one, a peer
  // could send an object with a hundred thousand entries and the app would apply them
  // all as CSS variables.
  var MAX_COLOUR_KEYS = 64;
  var MAX_VALUE_LENGTH = 64;

  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  // A colour value the browser will accept. Same trick the colour editor uses: hand it
  // to a style object and see whether it survives. Anything that does not is dropped.
  function isColour(v) {
    if (typeof v !== 'string') return false;
    if (!v.length || v.length > MAX_VALUE_LENGTH) return false;
    if (typeof document === 'undefined') {
      // No DOM (unit tests, or a bare Node context). Deliberately STRICTER than the
      // browser: hex, rgb() and hsl() only. A bare word cannot be checked without the
      // named-colour table, and accepting anything alphabetic means accepting "nope" —
      // which then becomes an invalid CSS custom property on the receiving device.
      return /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i.test(v.trim());
    }
    var probe = document.createElement('span');
    probe.style.color = '';
    probe.style.color = v;
    return probe.style.color !== '';
  }

  function sanitiseColours(value) {
    if (!isPlainObject(value)) return null;
    var out = {};
    var keys = Object.keys(value);
    for (var i = 0; i < keys.length && i < MAX_COLOUR_KEYS; i++) {
      var k = keys[i];
      // Custom property names only, and short ones.
      // Keys are stored WITHOUT the leading -- : app.js prepends it when it applies them
      // (setProperty('--' + key, ...)). Requiring the dashes here rejected every real key, and
      // the unit test caught exactly that when I tried it.
      if (!/^[a-z][a-z0-9-]{0,31}$/.test(k)) continue;
      if (!isColour(value[k])) continue;
      out[k] = value[k].trim();
    }
    return out;
  }

  window.OrbitSettingsSync = {
    VERSION: VERSION,
    SYNC_KEYS: SYNC_KEYS,

    // What to send. Returns null when there is nothing worth sending, so the caller
    // can skip the packet entirely.
    build: function (settings, now) {
      settings = settings || {};
      var data = {};
      var has = false;

      if (typeof settings.theme === 'string' && KNOWN_THEMES.indexOf(settings.theme) !== -1) {
        data.theme = settings.theme;
        has = true;
      }
      var colours = sanitiseColours(settings.customThemeColors);
      if (colours && Object.keys(colours).length) {
        data.customThemeColors = colours;
        has = true;
      }
      if (!has) return null;

      return { v: VERSION, at: (typeof now === 'number' ? now : Date.now()), data: data };
    },

    // Whether an incoming payload is worth applying.
    //
    // `settings.settingsSyncedAt` is the timestamp of the last payload this device
    // accepted. Anything not strictly newer is ignored: two devices that each applied
    // the other's older state would otherwise bounce it back and forth.
    apply: function (settings, payload) {
      settings = settings || {};
      if (!isPlainObject(payload)) return null;
      if (payload.v !== VERSION) return null;
      if (typeof payload.at !== 'number' || !isFinite(payload.at)) return null;
      if (!isPlainObject(payload.data)) return null;

      var last = typeof settings.settingsSyncedAt === 'number' ? settings.settingsSyncedAt : 0;
      if (payload.at <= last) return null;

      var next = Object.assign({}, settings);
      var changed = false;

      // Only the whitelisted keys, and only in a shape the app understands.
      var theme = payload.data.theme;
      if (typeof theme === 'string' && KNOWN_THEMES.indexOf(theme) !== -1 && next.theme !== theme) {
        next.theme = theme;
        changed = true;
      }
      if (Object.prototype.hasOwnProperty.call(payload.data, 'customThemeColors')) {
        var colours = sanitiseColours(payload.data.customThemeColors);
        if (colours && Object.keys(colours).length && JSON.stringify(next.customThemeColors || {}) !== JSON.stringify(colours)) {
          next.customThemeColors = colours;
          changed = true;
        }
      }

      // Record the timestamp even when nothing changed: it is still the newest state we
      // have seen, and not recording it would let the same payload be re-evaluated.
      if (payload.at > last) next.settingsSyncedAt = payload.at;
      if (!changed && next.settingsSyncedAt === last) return null;

      return { settings: next, changed: changed };
    },

    // Whether a settings change is worth broadcasting — i.e. whether anything on the
    // whitelist actually moved. Saves a packet per keystroke in a colour field.
    worthSending: function (before, after) {
      var a = this.build(before, 1);
      var b = this.build(after, 1);
      if (!b) return false;
      if (!a) return true;
      return JSON.stringify(a.data) !== JSON.stringify(b.data);
    },

    // Only your own devices may sync to you. A peer with the same userId is you on
    // another machine; anyone else is someone else, and their theme is their business.
    isOwnDevice: function (peerUserId, myUserId) {
      if (!peerUserId || !myUserId) return false;
      return String(peerUserId) === String(myUserId);
    },

    // Exposed for the unit tests.
    _sanitiseColours: sanitiseColours,
    _isColour: isColour,
    _KNOWN_THEMES: KNOWN_THEMES,
    _MAX_COLOUR_KEYS: MAX_COLOUR_KEYS
  };
})();
