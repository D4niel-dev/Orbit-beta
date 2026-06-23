const dgram = require('dgram');
const os = require('os');
const Protocol = require('./protocol');

class Discovery {
  constructor(identityProvider, onPeerFound) {
    this.PORT = 45678;
    this.MULTICAST_ADDR = '224.0.0.251';
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.identityProvider = identityProvider;
    this.onPeerFound = onPeerFound;
    this.beaconInterval = null;
    this.peers = new Map();
    this._started = false;
    this._localIps = null;
    this._lastBeaconAvatar = null;
  }

  _getLocalIPs() {
    if (this._localIps) return this._localIps;
    const ips = new Set(['127.0.0.1', '0.0.0.0', '::1']);
    try {
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        const iface = interfaces[name];
        if (!iface) continue;
        for (const addr of iface) {
          if (addr.address) ips.add(addr.address);
        }
      }
    } catch (e) {
      // ignore
    }
    this._localIps = ips;
    return ips;
  }

  start() {
    if (this._started) return;
    this._started = true;
    this._getLocalIPs();
    console.log('[Discovery] start() called, binding to port', this.PORT);

    this.socket.on('listening', () => {
      console.log('[Discovery] Socket listening event fired');
      this.socket.setBroadcast(true);
      this.socket.setMulticastTTL(128);
      try {
        this.socket.addMembership(this.MULTICAST_ADDR);
        console.log('[Discovery] Multicast membership added for', this.MULTICAST_ADDR);
      } catch (err) {
        console.error('[Discovery] Could not add multicast membership:', err);
      }
      console.log('[Discovery] Listening on ' + this.MULTICAST_ADDR + ':' + this.PORT);

      this.beaconInterval = setInterval(() => this.broadcastBeacon(), 10000);
      this.broadcastBeacon();

      // Prune stale peers every 60s
      this._pruneInterval = setInterval(() => this._pruneStalePeers(), 60000);
    });

    this.socket.on('message', (msg, rinfo) => {
      console.log('[Discovery] RAW UDP message from ' + rinfo.address + ':' + rinfo.port + ' len=' + msg.length);
      try {
        // Skip self-beacon from local IPs (BUG-DT-5)
        if (this._localIps.has(rinfo.address)) {
          console.log('[Discovery] Skipped self-beacon from', rinfo.address);
          return;
        }

        let payloadStr = msg.toString('utf8');
        if (msg.length > 4 && msg.readUInt32BE(0) === msg.length - 4) {
          payloadStr = msg.subarray(4).toString('utf8');
        } else if (msg.length > 4 && msg.toString('utf8', 0, 1) !== '{') {
           payloadStr = msg.subarray(4).toString('utf8');
        }

        console.log('[Discovery] Parsed beacon from ' + rinfo.address + ': ' + payloadStr.substring(0, 500));
        const packet = JSON.parse(payloadStr);
        if (packet.type === Protocol.Types.BEACON) {
          const myId = this.identityProvider().userId;
          const packetFrom = packet.from || packet.senderId;
          if (packetFrom && packetFrom !== myId) {
            this.handleBeacon(packet, rinfo.address);
          } else {
            console.log('[Discovery] Skipped own/missing-from beacon, myId=' + myId + ' from=' + packetFrom);
          }
        } else {
          console.log('[Discovery] Non-beacon packet type:', packet.type);
        }
      } catch (err) {
        console.log('[Discovery] Error parsing packet from ' + rinfo.address + ':', err.message);
      }
    });

    this.socket.on('error', (err) => {
      console.error('[Discovery] Socket error:', err.message);
    });

    console.log('[Discovery] Calling socket.bind(' + this.PORT + ')');
    this.socket.bind(this.PORT);
  }

  broadcastBeacon() {
    if (!this._started) return;
    const identity = this.identityProvider();
    if (!identity || !identity.userId) {
      console.log('[Discovery] broadcastBeacon skipped — no identity');
      return;
    }

    console.log('[Discovery] Broadcasting beacon for', identity.username);

    var broadcastStatus = identity.status === 'invisible' ? 'offline' : (identity.status || 'online');

    const avatarChanged = this._lastBeaconAvatar !== identity.avatar;

    const beaconData = {
      userId: identity.userId,
      username: identity.username,
      usertag: identity.usertag,
      avatarHash: identity.avatar ? 'has_avatar' : null,
      avatar: avatarChanged ? identity.avatar : undefined,
      status: broadcastStatus,
      bio: identity.bio || '',
      banner: identity.banner || null,
      publicKey: identity.publicKey || null,
      profileFrame: identity.profileFrame || null,
      tcpPort: 46000
    };

    if (avatarChanged) {
      this._lastBeaconAvatar = identity.avatar;
    }

    const packet = Protocol.createPacket(Protocol.Types.BEACON, identity.userId, "ALL", beaconData);
    const buffer = Protocol.serialize(packet);

    try {
      this.socket.send(buffer, 0, buffer.length, this.PORT, this.MULTICAST_ADDR);
    } catch (e) {
      console.error('Failed to broadcast beacon:', e.message);
    }
  }

  handleBeacon(packet, ip) {
    if (!packet || !packet.payload) return;
    const peerData = packet.payload;
    const peerId = peerData.userId;

    const now = Date.now();
    const existing = this.peers.get(peerId);

    if (!existing || existing.status !== peerData.status || existing.username !== peerData.username || existing.ip !== ip || existing.avatarHash !== peerData.avatarHash) {
      this.onPeerFound({
        ...peerData,
        ip: ip,
        lastSeen: now
      });
    }

    this.peers.set(peerId, { ...peerData, ip, lastSeen: now });
  }

  _pruneStalePeers() {
    var now = Date.now();
    var staleThreshold = 180000;
    var pruned = [];
    for (var [id, peer] of this.peers) {
      if (now - peer.lastSeen > staleThreshold) {
        this.peers.delete(id);
        pruned.push(id);
      }
    }
    if (pruned.length > 0) {
      console.log('[Discovery] Pruned', pruned.length, 'stale peers:', pruned);
      pruned.forEach(function(id) {
        if (typeof this.onPeerGone === 'function') {
          this.onPeerGone(id);
        }
      }, this);
    }
  }

  isPeerKnown(peerId) {
    return this.peers.has(peerId);
  }

  stop() {
    this._started = false;
    if (this.beaconInterval) {
      clearInterval(this.beaconInterval);
      this.beaconInterval = null;
    }
    if (this._pruneInterval) {
      clearInterval(this._pruneInterval);
      this._pruneInterval = null;
    }
    if (this.socket) {
      try { this.socket.close(); } catch(e) {}
    }
    this.peers.clear();
  }
}

module.exports = Discovery;
