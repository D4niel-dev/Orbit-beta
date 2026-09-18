/**
 * Outbox — hold messages for peers who are not reachable right now, and deliver
 * them the moment they come back.
 *
 * WHY THIS EXISTS
 * ---------------
 * Orbit had no send queue at all. Every `Orbit.P2P.send()` was fire-and-forget: if
 * the peer was not currently connected the call did nothing, and the message was
 * simply gone. On a LAN that is not an edge case — peers come and go constantly.
 * A laptop lid closes, a phone leaves Wi-Fi range, someone walks out of the room.
 * Each of those moments silently dropped a message, which is the fastest way to
 * make people stop trusting a messenger.
 *
 * Messages are queued in localStorage (not memory) so they survive the app being
 * killed, which on Android is routine.
 *
 * WHAT IS DELIBERATELY NOT QUEUED
 * -------------------------------
 * Only real message content goes in here — text, media metadata, polls, edits.
 * Ephemeral packets (typing, presence, reactions, call signalling) are NOT queued:
 * delivering a typing indicator five minutes late is worse than not delivering it,
 * and a stale call offer is actively harmful. Those keep using P2P.send directly.
 */
(function () {
  'use strict';

  var STORE_KEY = 'orbit_outbox';
  var MAX_ENTRIES = 500;                       // hard cap so storage cannot grow forever
  var MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;    // give up after a week
  var RETRY_INTERVAL_MS = 15000;

  var _timer = null;
  var _flushing = false;
  var _rerun = false;   // a flush was asked for while one was already running

  /* ── storage ── */

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return [];
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function save(list) {
    try {
      // Keep the newest if we are over the cap — dropping the oldest is better than
      // dropping everything, and the alternative is unbounded growth.
      if (list.length > MAX_ENTRIES) list = list.slice(list.length - MAX_ENTRIES);
      localStorage.setItem(STORE_KEY, JSON.stringify(list));
    } catch (e) {
      // Quota exceeded: drop the oldest half and try once more, rather than losing
      // the newest messages entirely.
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(Math.floor(list.length / 2))));
      } catch (e2) { /* give up quietly — the queue is best-effort */ }
    }
  }

  /* ── reachability ──
     Mirrors _netMapIsConnected in app.js: a peer may be known by its user id, its
     connection id, or its IP, and only one of those is guaranteed to be registered
     with the P2P layer. */
  function reachable(peerId) {
    if (!peerId) return false;
    if (!window.Orbit || !Orbit.P2P || typeof Orbit.P2P.isPeerConnected !== 'function') return false;
    try {
      if (Orbit.P2P.isPeerConnected(peerId)) return true;

      var friend = null;
      if (window.MStore && MStore.friends) {
        friend = MStore.friends.find(function (f) {
          return f.id === peerId || f.connectionId === peerId || f.ip === peerId;
        });
      }
      if (friend) {
        if (friend.connectionId && Orbit.P2P.isPeerConnected(friend.connectionId)) return true;
        if (friend.ip && Orbit.P2P.isPeerConnected(friend.ip)) return true;
      }

      // The P2P layer may know the connection only by host. app.js does exactly this
      // at its own check (`isPeerConnected(peerId) || isPeerConnected(data.host)`),
      // and without it a perfectly live link reads as unreachable — which queued
      // messages that could have gone straight out.
      var hosts = [];
      if (friend) {
        if (friend.ip) hosts.push(friend.ip);
        if (friend.host) hosts.push(friend.host);
      }
      for (var i = 0; i < hosts.length; i++) {
        if (Orbit.P2P.isPeerConnected(hosts[i])) return true;
      }
      if (typeof Orbit.P2P.getConnections === 'function') {
        var conns = Orbit.P2P.getConnections() || [];
        for (var j = 0; j < conns.length; j++) {
          var c = conns[j] || {};
          if (c.peerId === peerId || c.id === peerId) return true;
          if (friend && (c.host === friend.ip || c.ip === friend.ip)) return true;
        }
      }
    } catch (e) { /* treat as unreachable */ }
    return false;
  }

  /* ── public API ── */

  /**
   * Send now if we can, otherwise queue.
   *
   * @param {string} peerId
   * @param {object} packet  already-built protocol packet
   * @param {object} [opts]  { chatId, msgId, kind }
   * @returns {boolean} true if it went out immediately, false if it was queued
   */
  function send(peerId, packet, opts) {
    opts = opts || {};
    if (!peerId || !packet) return false;

    // Write-ahead, deliberately: enqueue FIRST, then try to drain immediately.
    //
    // Gating delivery on a reachability pre-check is what broke this — the P2P layer
    // can know a peer by user id, connection id, host or IP, and a wrong "unreachable"
    // silently queued messages that could have been delivered (and, before the flush
    // triggers were right, could sit there indefinitely). Enqueueing first makes a
    // wrong answer cost a retry instead of a stuck message: flush() removes the entry
    // the moment it actually goes out, and the pending flag clears with it.
    var list = load();
    list.push({
      peerId: peerId,
      packet: packet,
      chatId: opts.chatId || peerId,
      msgId: opts.msgId || null,
      kind: opts.kind || 'message',
      queuedAt: Date.now(),
      attempts: 0
    });
    save(list);
    _emit();

    var lookedReachable = reachable(peerId);
    flush();   // async — delivers now if the link is up, and clears the entry
    return lookedReachable;
  }

  /** Try to deliver everything that is now deliverable. Safe to call often. */
  function flush() {
    if (_flushing) {
      // send() enqueues then flushes; if a flush is already in flight that call would
      // be skipped and the new entry would wait for the next timer tick. Remember it
      // and drain again on the way out instead.
      _rerun = true;
      return Promise.resolve(0);
    }
    _flushing = true;

    return Promise.resolve().then(function () {
      var list = load();
      if (!list.length) return 0;

      var now = Date.now();
      var remaining = [];
      var delivered = 0;

      list.forEach(function (entry) {
        // Expire rather than retry forever.
        if (now - (entry.queuedAt || 0) > MAX_AGE_MS) return;

        if (!reachable(entry.peerId)) { remaining.push(entry); return; }

        try {
          Orbit.P2P.send(entry.peerId, entry.packet);
          delivered++;
        } catch (e) {
          entry.attempts = (entry.attempts || 0) + 1;
          remaining.push(entry);
        }
      });

      if (delivered) {
        save(remaining);
        _emit();
        if (window.showToast) {
          showToast('Sent ' + delivered + ' queued message' + (delivered === 1 ? '' : 's'), 'success');
        }
      } else if (remaining.length !== list.length) {
        save(remaining);
        _emit();
      }
      return delivered;
    }).then(function (n) {
      _flushing = false;
      if (_rerun) { _rerun = false; return flush().then(function (m) { return n + m; }); }
      return n;
    }).catch(function () {
      _flushing = false;
      _rerun = false;
      return 0;
    });
  }

  /** Message ids still waiting for a given chat — used to mark bubbles as pending. */
  function pendingFor(chatId) {
    var out = {};
    load().forEach(function (e) {
      if (!chatId || e.chatId === chatId) {
        if (e.msgId) out[String(e.msgId)] = true;
      }
    });
    return out;
  }

  /** How many messages are waiting, optionally for one chat. */
  function count(chatId) {
    return load().filter(function (e) { return !chatId || e.chatId === chatId; }).length;
  }

  function _emit() {
    try {
      window.dispatchEvent(new CustomEvent('orbit-outbox-changed'));
    } catch (e) { /* older WebView */ }
  }

  function start() {
    if (_timer) return;
    // A timer is the safety net; the real triggers are the explicit flush() calls
    // when the app foregrounds or a peer appears.
    _timer = setInterval(function () { flush(); }, RETRY_INTERVAL_MS);
  }

  function stop() {
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  window.OrbitOutbox = {
    send: send,
    flush: flush,
    pendingFor: pendingFor,
    count: count,
    reachable: reachable,
    start: start,
    stop: stop,
    _load: load          // exposed for tests
  };

  start();
})();
