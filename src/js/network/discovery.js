const dgram = require('dgram');
const Protocol = require('./protocol');

class Discovery {
  constructor(identityProvider, onPeerFound) {
    this.PORT = 45678;
    this.MULTICAST_ADDR = '224.0.0.251';
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.identityProvider = identityProvider; // Function to get current identity
    this.onPeerFound = onPeerFound;
    this.beaconInterval = null;
    this.peers = new Map(); // track last seen
  }

  start() {
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
      this.broadcastBeacon(); // send one immediately
    });

    this.socket.on('message', (msg, rinfo) => {
      try {
        // Find JSON payload ignoring 4-byte length prefix if any
        let payloadStr = msg.toString('utf8');
        if (msg.length > 4 && msg.readUInt32BE(0) === msg.length - 4) {
          payloadStr = msg.subarray(4).toString('utf8');
        } else if (msg.length > 4 && msg.toString('utf8', 0, 1) !== '{') {
           // Skip prefix
           payloadStr = msg.subarray(4).toString('utf8');
        }
        
        const packet = JSON.parse(payloadStr);
        if (packet.type === Protocol.Types.BEACON) {
          const myId = this.identityProvider().userId;
          if (packet.from !== myId) {
            this.handleBeacon(packet, rinfo.address);
          }
        }
      } catch (err) {
        // Ignore invalid packets
      }
    });

    this.socket.bind(this.PORT);
  }

  broadcastBeacon() {
    const identity = this.identityProvider();
    if (!identity || !identity.userId) return;

    const beaconData = {
      userId: identity.userId,
      username: identity.username,
      usertag: identity.usertag,
      avatarHash: identity.avatar ? 'has_avatar' : null,
      status: identity.status,
      bio: identity.bio,
      tcpPort: 46000 // default port
    };

    const packet = Protocol.createPacket(Protocol.Types.BEACON, identity.userId, "ALL", beaconData);
    const buffer = Protocol.serialize(packet);

    this.socket.send(buffer, 0, buffer.length, this.PORT, this.MULTICAST_ADDR);
  }

  handleBeacon(packet, ip) {
    const peerData = packet.payload;
    const peerId = peerData.userId;
    
    // Update or add peer
    const now = Date.now();
    const existing = this.peers.get(peerId);
    
    if (!existing || existing.status !== peerData.status || existing.username !== peerData.username) {
      this.onPeerFound({
        ...peerData,
        ip: ip,
        lastSeen: now
      });
    }
    
    this.peers.set(peerId, { ...peerData, ip, lastSeen: now });
  }

  stop() {
    if (this.beaconInterval) clearInterval(this.beaconInterval);
    if (this.socket) {
      try { this.socket.close(); } catch(e) {}
    }
  }
}

module.exports = Discovery;
