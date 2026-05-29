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
    });

    this.server.on('error', (err) => {
      console.error('TCP Server error:', err);
    });

    this.server.listen(this.TCP_PORT, () => {
      console.log(`TCP Server listening on port ${this.TCP_PORT}`);
    });
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
      
      // Handshake or ping could go here
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
            if (!currentPeerId && packet.from) {
              currentPeerId = packet.from;
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
