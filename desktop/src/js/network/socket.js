const net = require('net');
const Protocol = require('./protocol');
const EventEmitter = require('events');

const MAX_PAYLOAD_SIZE = 4194304; // 4 MB — prevent oversized frames

class SocketManager extends EventEmitter {
  constructor(identityProvider) {
    super();
    this.TCP_PORT = 46000;
    this.server = null;
    this.identityProvider = identityProvider;

    // Map of peerId -> net.Socket
    this.connections = new Map();

    // Per-socket write queues to prevent interleaving on shared sockets
    this._writeQueues = new Map();
    this._writing = new Set();
  }

  // Serialize writes to a socket so concurrent sendMessage/Broadcast calls
  // never interleave bytes on the length-prefixed TCP stream.
  _enqueueWrite(socket, buffer) {
    const key = socket.remoteAddress + ':' + socket.remotePort || socket.__orbitKey;
    if (!this._writeQueues.has(key)) {
      this._writeQueues.set(key, []);
    }
    this._writeQueues.get(key).push(buffer);
    this._processQueue(socket, key);
  }

  _processQueue(socket, key) {
    if (this._writing.has(key)) return;
    const queue = this._writeQueues.get(key);
    if (!queue || queue.length === 0) return;

    this._writing.add(key);
    const buffer = queue.shift();

    if (socket && !socket.destroyed) {
      socket.write(buffer, () => {
        this._writing.delete(key);
        this._processQueue(socket, key);
      });
    } else {
      this._writing.delete(key);
      this._writeQueues.delete(key);
    }
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
      if (socket && !socket.destroyed) this._enqueueWrite(socket, serialized);
    } catch (e) {
      // Ignore write errors on beacon
    }
  }

  connectToPeer(peerId, ip, port = 46000) {
    const existing = this.connections.get(peerId);
    if (existing && !existing.destroyed) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.__orbitKey = peerId;

      socket.connect(port, ip, () => {
        console.log(`Connected to peer ${peerId} at ${ip}:${port}`);
        this.connections.set(peerId, socket);
        this.setupSocket(socket, peerId);

        // Send identity beacon over TCP so peer can discover us
        this.sendBeacon(socket);
        resolve(socket);
      });

      socket.on('error', (err) => {
        console.error(`Connection error to ${ip}:`, err.message);
        this.connections.delete(peerId);
        reject(err);
      });
    });
  }

  setupSocket(socket, knownPeerId) {
    let buffer = Buffer.alloc(0);
    let currentPeerId = knownPeerId;

    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);

      // Basic framing loop
      while (buffer.length >= 4) {
        const payloadLength = buffer.readUInt32BE(0);

        if (payloadLength > 100 * 1024) {
          console.log('[RECV] frame size=' + (payloadLength / 1024).toFixed(1) + 'KB from=' + (currentPeerId || socket.remoteAddress));
        }

        // Guard against oversized frames (BUG-DT-2)
        if (payloadLength <= 0 || payloadLength > MAX_PAYLOAD_SIZE) {
          console.error(`Invalid payload length ${payloadLength}, closing connection`);
          socket.destroy();
          return;
        }

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
              // Track socket for write queue cleanup
              socket.__orbitKey = currentPeerId;
              // Send our BEACON so the connecting peer can identify us
              this.sendBeacon(socket);
            }

            // Attach sender IP for BEACON IP fallback (Bug #1)
            packet._fromIp = socket.remoteAddress;

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

    socket.on('error', (err) => {
      console.error(`Socket error for peer ${currentPeerId || 'unknown'}:`, err.message);
      // close event will fire after error, handling cleanup
    });

    socket.on('close', () => {
      console.log(`Connection closed with peer ${currentPeerId || 'unknown'}`);
      if (currentPeerId) {
        this.connections.delete(currentPeerId);
        this._writeQueues.delete(currentPeerId);
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
      // Fire-and-forget connect — connection success/failure handled internally
      this.connectToPeer(toPeerId, toIp).then((s) => {
        this._enqueueWrite(s, serialized);
      }).catch(() => {
        console.error(`Cannot send message: Connection to ${toPeerId} failed.`);
      });
      return true; // optimistic
    }

    if (socket && !socket.destroyed) {
      this._enqueueWrite(socket, serialized);
      return true;
    } else {
      console.error(`Cannot send message: Peer ${toPeerId} not connected and no IP provided.`);
      return false;
    }
  }

  broadcastToGroup(members, type, payload, senderId) {
    const identity = this.identityProvider();
    if (!identity || !identity.userId) return 0;

    let sentCount = 0;
    members.forEach(m => {
      if (m.userId !== senderId && m.ip) {
        const packet = Protocol.createPacket(type, identity.userId, m.userId, { ...payload, chatId: m.groupId || payload.chatId });
        const serialized = Protocol.serialize(packet);
        let socket = this.connections.get(m.userId);
        if (!socket) {
          // Fire-and-forget connect
          this.connectToPeer(m.userId, m.ip).then((s) => {
            this._enqueueWrite(s, serialized);
          }).catch(() => {});
          sentCount++;
        } else if (socket && !socket.destroyed) {
          this._enqueueWrite(socket, serialized);
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
    this._writeQueues.clear();
    this._writing.clear();
  }
}

module.exports = SocketManager;
