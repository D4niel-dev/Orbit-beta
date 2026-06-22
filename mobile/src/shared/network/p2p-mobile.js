// shared/network/p2p-mobile.js
// P2P networking bridge — calls Capacitor OrbitP2P plugin

window.Orbit = window.Orbit || {};

Orbit.P2P = (function() {
  var plugin = null;
  var listeners = {};
  var connections = {};
  var discoveryActive = false;
  var lastConnectAttempt = {};
  var _pluginChecked = false;
  var _pendingMessages = [];
  var _maxPendingAge = 30000; // drop pending older than 30s

  function getPlugin() {
    if (plugin) return plugin;
    if (_pluginChecked) {
      if (window.MStore && window.MStore.settings && window.MStore.settings.logNetworkPackets) console.log('[P2P-Bridge] getPlugin: already checked, returning null');
      return null;
    }
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.OrbitP2P) {
      plugin = window.Capacitor.Plugins.OrbitP2P;
      _pluginChecked = true;
      console.log('[P2P-Bridge] Plugin acquired successfully');
    } else {
      console.log('[P2P-Bridge] Plugin not available yet', { hasCapacitor: !!window.Capacitor, hasPlugins: !!(window.Capacitor && window.Capacitor.Plugins) });
    }
    return plugin;
  }

  function flushPending(connectionId) {
    var remaining = [];
    _pendingMessages.forEach(function(q) {
      if (q.connectionId === connectionId || q.connectionId.indexOf(connectionId) >= 0 || connectionId.indexOf(q.connectionId) >= 0) {
        console.log('[P2P-Bridge] flushing pending message to ' + connectionId);
        (async function() {
          try {
            var p = getPlugin();
            if (p) await p.send({ connectionId: connectionId, data: q.data });
          } catch(e) { console.log('[P2P-Bridge] flush failed for ' + connectionId, e.message); }
        })();
      } else {
        remaining.push(q);
      }
    });
    _pendingMessages = remaining;
  }

  function addListener(eventName, callback) {
    var p = getPlugin();
    if (!p) return null;
    if (!listeners[eventName]) listeners[eventName] = [];
    var handler = p.addListener(eventName, function(data) {
      if (callback) callback(data);
      if (eventName === 'onConnection') {
        connections[data.connectionId] = { status: 'connected' };
        flushPending(data.connectionId);
      }
      if (eventName === 'onDisconnect') {
        delete connections[data.connectionId];
      }
    });
    listeners[eventName].push(handler);
    return handler;
  }

  function removeAllListeners() {
    var p = getPlugin();
    if (!p) return;
    for (var name in listeners) {
      if (listeners.hasOwnProperty(name)) {
        listeners[name].forEach(function(h) {
          if (h && h.remove) h.remove();
        });
      }
    }
    listeners = {};
  }

  return {
    isAvailable() {
      return !!getPlugin();
    },

    async startServer(port) {
      var p = getPlugin();
      if (!p) { console.log('[P2P-Bridge] startServer: plugin not available'); return { success: false, error: 'Plugin not available' }; }
      console.log('[P2P-Bridge] startServer port=' + (port || 46000));
      try {
        var result = await p.startServer({ port: port || 46000 });
        console.log('[P2P-Bridge] Server started on port ' + (result.port || '?'));
        return { success: true, port: result.port };
      } catch(e) {
        console.log('[P2P-Bridge] startServer error: ' + (e.message || String(e)));
        return { success: false, error: e.message || String(e) };
      }
    },

    async stopServer() {
      var p = getPlugin();
      if (!p) return;
      console.log('[P2P-Bridge] stopServer');
      try {
        await p.stopServer();
      } catch(e) { console.log('[P2P-Bridge] stopServer error: ' + (e.message || String(e))); }
    },

    async connect(host, port, peerId, timeout) {
      var p = getPlugin();
      if (!p) { console.log('[P2P-Bridge] connect: plugin not available'); return { success: false, error: 'Plugin not available' }; }

      // Reconnect cooldown (BUG-JS-3): skip if we tried within 3s
      var key = peerId || (host + ':' + (port || 46000));
      var now = Date.now();
      var last = lastConnectAttempt[key] || 0;
      if (now - last < 3000) {
        console.log('[P2P-Bridge] connect cooldown hit for ' + key);
        return { success: false, error: 'Reconnect cooldown' };
      }
      lastConnectAttempt[key] = now;

      var connectTimeout = timeout || (window.MStore && window.MStore.settings && (window.MStore.settings.netTimeout || 30) * 1000) || 30000;
      console.log('[P2P-Bridge] connecting to ' + host + ':' + (port || 46000) + ' key=' + key + ' timeout=' + connectTimeout + 'ms');
      try {
        var result = await p.connect({
          host: host,
          port: port || 46000,
          peerId: key,
          timeout: connectTimeout
        });
        console.log('[P2P-Bridge] connect result', result);
        // Track outbound connections in JS map (BUG-JS-1/2)
        if (result.connectionId) {
          connections[result.connectionId] = { status: 'connected' };
          console.log('[P2P-Bridge] tracked connection ' + result.connectionId);
          flushPending(result.connectionId);
        }
        return { success: true, connectionId: result.connectionId };
      } catch(e) {
        console.log('[P2P-Bridge] connect error: ' + (e.message || String(e)));
        return { success: false, error: e.message || String(e) };
      }
    },

    async disconnect(connectionId) {
      var p = getPlugin();
      if (!p || !connectionId) { console.log('[P2P-Bridge] disconnect: skipped (no plugin or connectionId)'); return; }
      console.log('[P2P-Bridge] disconnect ' + connectionId);
      try {
        await p.disconnect({ connectionId: connectionId });
      } catch(e) { console.log('[P2P-Bridge] disconnect error: ' + (e.message || String(e))); }
      delete connections[connectionId];
    },

    async send(connectionId, data) {
      var p = getPlugin();
      if (!p) { console.log('[P2P-Bridge] send: plugin not available'); return { success: false, error: 'Plugin not available' }; }
      console.log('[P2P-Bridge] send to ' + connectionId + ' (' + (data ? data.length : 0) + ' bytes)');
      // Purge stale pending messages
      var cutoff = Date.now() - _maxPendingAge;
      _pendingMessages = _pendingMessages.filter(function(q) { return q.time > cutoff; });
      try {
        await p.send({ connectionId: connectionId, data: data });
        return { success: true };
      } catch(e) {
        console.log('[P2P-Bridge] send error: ' + (e.message || String(e)) + ' — queuing for retry');
        _pendingMessages.push({ connectionId: connectionId, data: data, time: Date.now() });
        return { success: false, queued: true, error: e.message || String(e) };
      }
    },

    async startDiscovery(beaconData, discoveryPort) {
      var p = getPlugin();
      if (!p) { console.log('[P2P-Bridge] startDiscovery: plugin not available'); return { success: false, error: 'Plugin not available' }; }
      discoveryActive = true;
      var udpPort = discoveryPort || (window.MStore && window.MStore.settings && (window.MStore.settings.udpPort || 45678)) || 45678;
      console.log('[P2P-Bridge] startDiscovery with beacon (udpPort=' + udpPort + ')', beaconData);
      try {
        // BUG-1: startDiscovery now resolves immediately on the Java side
        await p.startDiscovery({ beacon: beaconData || {}, discoveryPort: udpPort });
        console.log('[P2P-Bridge] Discovery started');
        return { success: true };
      } catch(e) {
        discoveryActive = false;
        console.log('[P2P-Bridge] startDiscovery error: ' + (e.message || String(e)));
        return { success: false, error: e.message || String(e) };
      }
    },

    async stopDiscovery() {
      var p = getPlugin();
      if (!p) return;
      console.log('[P2P-Bridge] stopDiscovery');
      discoveryActive = false;
      try {
        await p.stopDiscovery();
      } catch(e) { console.log('[P2P-Bridge] stopDiscovery error: ' + (e.message || String(e))); }
    },

    isDiscoveryActive() {
      return discoveryActive;
    },

    isPeerConnected(peerId) {
      if (!peerId) return false;
      if (connections[peerId]) return true;
      // Broad search: connections keyed by "ip:port", but called with bare IP or userId
      for (var key in connections) {
        if (key.indexOf(peerId) === 0 || peerId.indexOf(key) === 0) return true;
      }
      return false;
    },

    getConnections() {
      return Object.keys(connections);
    },

    onConnection(callback) {
      return addListener('onConnection', callback);
    },

    onMessage(callback) {
      return addListener('onMessage', callback);
    },

    onDisconnect(callback) {
      return addListener('onDisconnect', callback);
    },

    onPeerFound(callback) {
      return addListener('onPeerFound', callback);
    },

    cleanup() {
      console.log('[P2P-Bridge] cleanup called');
      this.stopServer();
      this.stopDiscovery();
      removeAllListeners();
      connections = {};
      lastConnectAttempt = {};
      _pendingMessages = [];
    }
  };
})();

console.log('[P2P] Mobile networking module loaded');
