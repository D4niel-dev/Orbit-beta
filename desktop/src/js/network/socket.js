const net = require('net');
const Protocol = require('./protocol');
const EventEmitter = require('events');

class SocketManager extends EventEmitter {
  constructor(identityProvider) {
    super();
    this.TCP_PORT = 46000;
    this.server = null;
    this.identityProvider = identityProvider;
    
    // Map of peerId -> net.Socket
    this.connections = new Map();
  }

  startServer() {
    this.server = net.createServer((socket) => {
      console.log('New incoming TCP connection from', socket.remoteAddress);
      this.setupSocket(socket, null);
      
      // Send identity beacon over TCP so peer can discover us
      this.sendBeacon(socket);
    });

    this.server.on('error', (err) => {
      console.error('TCP Server error:', err);
    });

    this.server.listen(this.TCP_PORT, () => {
      console.log(`TCP Server listening on port ${this.TCP_PORT}`);
    });
  }

  sendBeacon(socket) {
    const identity = this.identityProvider();
    if (!identity || !identity.userId) return;
    const beaconData = {
      userId: identity.userId,
      username: identity.username,
      usertag: identity.usertag,
      avatarHash: identity.avatar ? 'has_avatar' : null,
      status: identity.status || 'online',
      bio: identity.bio || '',
      publicKey: identity.publicKey || null,
      profileFrame: identity.profileFrame || null,
      tcpPort: this.TCP_PORT,
      device: 'desktop'
    };
    const packet = Protocol.createPacket(Protocol.Types.BEACON, identity.userId, 'ALL', beaconData);
    const serialized = Protocol.serialize(packet);
    try {
      if (socket && !socket.destroyed) socket.write(serialized);
    } catch (e) {
      // Ignore write errors on beacon
    }
  }

  connectToPeer(peerId, ip, port = 46000) {
    if (this.connections.has(peerId)) {
      return this.connections.get(peerId);
    }

    const socket = new net.Socket();
    
    socket.connect(port, ip, () => {
      console.log(`Connected to peer ${peerId} at ${ip}:${port}`);
      this.connections.set(peerId, socket);
      this.setupSocket(socket, peerId);
      
      // Send identity beacon over TCP so peer can discover us
      this.sendBeacon(socket);
    });

    socket.on('error', (err) => {
      console.error(`Connection error to ${ip}:`, err.message);
      this.connections.delete(peerId);
    });

    return socket;
  }

  setupSocket(socket, knownPeerId) {
    let buffer = Buffer.alloc(0);
    let currentPeerId = knownPeerId;

    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);
      
      // Basic framing loop
      while (buffer.length >= 4) {
        const payloadLength = buffer.readUInt32BE(0);
        if (buffer.length >= 4 + payloadLength) {
          const payloadBuffer = buffer.subarray(4, 4 + payloadLength);
          buffer = buffer.subarray(4 + payloadLength); // Consume
          
          try {
            const jsonStr = payloadBuffer.toString('utf8');
            const packet = JSON.parse(jsonStr);
            
            // If we didn't know the peerId (incoming conn), register it now
            var senderId = packet.from || packet.senderId;
            if (!currentPeerId && senderId) {
              currentPeerId = senderId;
              this.connections.set(currentPeerId, socket);
            }
            
            // Emit to main process which forwards to renderer
            this.emit('message', packet);
          } catch (err) {
            console.error('Failed to parse incoming packet:', err);
          }
        } else {
          break; // Wait for more data
        }
      }
    });

    socket.on('close', () => {
      console.log(`Connection closed with peer ${currentPeerId || 'unknown'}`);
      if (currentPeerId) {
        this.connections.delete(currentPeerId);
        this.emit('peer-disconnected', currentPeerId);
      }
    });
  }

  sendMessage(toPeerId, toIp, type, payload) {
    const identity = this.identityProvider();
    if (!identity || !identity.userId) return false;

    const packet = Protocol.createPacket(type, identity.userId, toPeerId, payload);
    const serialized = Protocol.serialize(packet);

    let socket = this.connections.get(toPeerId);
    if (!socket && toIp) {
      socket = this.connectToPeer(toPeerId, toIp);
    }

    if (socket && !socket.destroyed) {
      socket.write(serialized);
      return true;
    } else {
      console.error(`Cannot send message: Peer ${toPeerId} not connected and no IP provided.`);
      return false;
    }
  }

  broadcastToGroup(members, type, payload, senderId) {
    const identity = this.identityProvider();
    if (!identity || !identity.userId) return false;

    let sentCount = 0;
    members.forEach(m => {
      if (m.userId !== senderId && m.ip) {
        const packet = Protocol.createPacket(type, identity.userId, m.userId, { ...payload, chatId: m.groupId || payload.chatId });
        const serialized = Protocol.serialize(packet);
        let socket = this.connections.get(m.userId);
        if (!socket) {
          socket = this.connectToPeer(m.userId, m.ip);
        }
        if (socket && !socket.destroyed) {
          socket.write(serialized);
          sentCount++;
        }
      }
    });
    return sentCount;
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
    for (const [id, socket] of this.connections.entries()) {
      socket.destroy();
    }
    this.connections.clear();
  }
}

module.exports = SocketManager;
