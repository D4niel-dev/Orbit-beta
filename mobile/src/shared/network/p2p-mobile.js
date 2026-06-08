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

  function addListener(eventName, callback) {
    var p = getPlugin();
    if (!p) return null;
    if (!listeners[eventName]) listeners[eventName] = [];
    var handler = p.addListener(eventName, function(data) {
      if (callback) callback(data);
      if (eventName === 'onConnection') {
        connections[data.connectionId] = { status: 'connected' };
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

    async connect(host, port, peerId) {
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

      console.log('[P2P-Bridge] connecting to ' + host + ':' + (port || 46000) + ' key=' + key);
      try {
        var result = await p.connect({
          host: host,
          port: port || 46000,
          peerId: key
        });
        console.log('[P2P-Bridge] connect result', result);
        // Track outbound connections in JS map (BUG-JS-1/2)
        if (result.connectionId) {
          connections[result.connectionId] = { status: 'connected' };
          console.log('[P2P-Bridge] tracked connection ' + result.connectionId);
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
      try {
        await p.send({ connectionId: connectionId, data: data });
        return { success: true };
      } catch(e) {
        console.log('[P2P-Bridge] send error: ' + (e.message || String(e)));
        return { success: false, error: e.message || String(e) };
      }
    },

    async startDiscovery(beaconData) {
      var p = getPlugin();
      if (!p) { console.log('[P2P-Bridge] startDiscovery: plugin not available'); return { success: false, error: 'Plugin not available' }; }
      discoveryActive = true;
      console.log('[P2P-Bridge] startDiscovery with beacon', beaconData);
      try {
        // BUG-1: startDiscovery now resolves immediately on the Java side
        await p.startDiscovery({ beacon: beaconData || {} });
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
      var connected = !!connections[peerId];
      return connected;
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
    }
  };
})();

console.log('[P2P] Mobile networking module loaded');
