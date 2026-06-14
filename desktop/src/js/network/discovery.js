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

    this.socket.on('listening', () => {
      this.socket.setBroadcast(true);
      this.socket.setMulticastTTL(128);
      try {
        this.socket.addMembership(this.MULTICAST_ADDR);
      } catch (err) {
        console.error("Could not add multicast membership:", err);
      }
      console.log(`Discovery listening on ${this.MULTICAST_ADDR}:${this.PORT}`);

      this.beaconInterval = setInterval(() => this.broadcastBeacon(), 5000);
      this.broadcastBeacon();
    });

    this.socket.on('message', (msg, rinfo) => {
      try {
        // Skip self-beacon from local IPs (BUG-DT-5)
        if (this._localIps.has(rinfo.address)) return;

        let payloadStr = msg.toString('utf8');
        if (msg.length > 4 && msg.readUInt32BE(0) === msg.length - 4) {
          payloadStr = msg.subarray(4).toString('utf8');
        } else if (msg.length > 4 && msg.toString('utf8', 0, 1) !== '{') {
           payloadStr = msg.subarray(4).toString('utf8');
        }

        console.log('[Discovery] Raw beacon from ' + rinfo.address + ': ' + payloadStr.substring(0, 500));
        const packet = JSON.parse(payloadStr);
        if (packet.type === Protocol.Types.BEACON) {
          const myId = this.identityProvider().userId;
          const packetFrom = packet.from || packet.senderId;
          if (packetFrom && packetFrom !== myId) {
            this.handleBeacon(packet, rinfo.address);
          }
        }
      } catch (err) {
        // Ignore invalid packets
      }
    });

    this.socket.on('error', (err) => {
      console.error('Discovery socket error:', err.message);
    });

    this.socket.bind(this.PORT);
  }

  broadcastBeacon() {
    if (!this._started) return;
    const identity = this.identityProvider();
    if (!identity || !identity.userId) return;

    var broadcastStatus = identity.status === 'invisible' ? 'offline' : (identity.status || 'online');

    const beaconData = {
      userId: identity.userId,
      username: identity.username,
      usertag: identity.usertag,
      avatarHash: identity.avatar ? 'has_avatar' : null,
      status: broadcastStatus,
      bio: identity.bio,
      publicKey: identity.publicKey || null,
      profileFrame: identity.profileFrame || null,
      tcpPort: 46000
    };

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

    if (!existing || existing.status !== peerData.status || existing.username !== peerData.username || existing.ip !== ip) {
      this.onPeerFound({
        ...peerData,
        ip: ip,
        lastSeen: now
      });
    }

    this.peers.set(peerId, { ...peerData, ip, lastSeen: now });
  }

  stop() {
    this._started = false;
    if (this.beaconInterval) {
      clearInterval(this.beaconInterval);
      this.beaconInterval = null;
    }
    if (this.socket) {
      try { this.socket.close(); } catch(e) {}
    }
    this.peers.clear();
  }
}

module.exports = Discovery;
