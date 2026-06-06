// shared/network/p2p-mobile.js
// P2P networking bridge — calls Capacitor OrbitP2P plugin

window.Orbit = window.Orbit || {};

Orbit.P2P = (function() {
  var plugin = null;
  var listeners = {};
  var connections = {};
  var discoveryActive = false;

  function getPlugin() {
    if (plugin) return plugin;
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.OrbitP2P) {
      plugin = window.Capacitor.Plugins.OrbitP2P;
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
      listeners[name].forEach(function(h) {
        if (h && h.remove) h.remove();
      });
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
      try {
        var result = await p.connect({
          host: host,
          port: port || 46000,
          peerId: peerId || (host + ':' + (port || 46000))
        });
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
    }
  };
})();

console.log('[P2P] Mobile networking module loaded');
