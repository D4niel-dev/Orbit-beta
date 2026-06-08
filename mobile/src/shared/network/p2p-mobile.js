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
    if (_pluginChecked) return null;
    // Capacitor plugins may register asynchronously; re-check each call until found
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.OrbitP2P) {
      plugin = window.Capacitor.Plugins.OrbitP2P;
      _pluginChecked = true;
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
      if (!p) return { success: false, error: 'Plugin not available' };
      try {
        var result = await p.startServer({ port: port || 46000 });
        return { success: true, port: result.port };
      } catch(e) {
        return { success: false, error: e.message || String(e) };
      }
    },

    async stopServer() {
      var p = getPlugin();
      if (!p) return;
      try {
        await p.stopServer();
      } catch(e) {}
    },

    async connect(host, port, peerId) {
      var p = getPlugin();
      if (!p) return { success: false, error: 'Plugin not available' };

      // Reconnect cooldown (BUG-JS-3): skip if we tried within 3s
      var key = peerId || (host + ':' + (port || 46000));
      var now = Date.now();
      var last = lastConnectAttempt[key] || 0;
      if (now - last < 3000) {
        return { success: false, error: 'Reconnect cooldown' };
      }
      lastConnectAttempt[key] = now;

      try {
        var result = await p.connect({
          host: host,
          port: port || 46000,
          peerId: key
        });
        // Track outbound connections in JS map (BUG-JS-1/2)
        if (result.connectionId) {
          connections[result.connectionId] = { status: 'connected' };
        }
        return { success: true, connectionId: result.connectionId };
      } catch(e) {
        return { success: false, error: e.message || String(e) };
      }
    },

    async disconnect(connectionId) {
      var p = getPlugin();
      if (!p || !connectionId) return;
      try {
        await p.disconnect({ connectionId: connectionId });
      } catch(e) {}
      delete connections[connectionId];
    },

    async send(connectionId, data) {
      var p = getPlugin();
      if (!p) return { success: false, error: 'Plugin not available' };
      try {
        await p.send({ connectionId: connectionId, data: data });
        return { success: true };
      } catch(e) {
        return { success: false, error: e.message || String(e) };
      }
    },

    async startDiscovery(beaconData) {
      var p = getPlugin();
      if (!p) return { success: false, error: 'Plugin not available' };
      discoveryActive = true;
      try {
        // BUG-1: startDiscovery now resolves immediately on the Java side
        await p.startDiscovery({ beacon: beaconData || {} });
        return { success: true };
      } catch(e) {
        discoveryActive = false;
        return { success: false, error: e.message || String(e) };
      }
    },

    async stopDiscovery() {
      var p = getPlugin();
      if (!p) return;
      discoveryActive = false;
      try {
        await p.stopDiscovery();
      } catch(e) {}
    },

    isDiscoveryActive() {
      return discoveryActive;
    },

    isPeerConnected(peerId) {
      return !!connections[peerId];
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
      this.stopServer();
      this.stopDiscovery();
      removeAllListeners();
      connections = {};
      lastConnectAttempt = {};
    }
  };
})();

console.log('[P2P] Mobile networking module loaded');
