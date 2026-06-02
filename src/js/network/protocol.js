// src/js/network/protocol.js

// Shared between main process (networking) and renderer (UI)
const Protocol = {
  Types: {
    MESSAGE: "MESSAGE",
    FILE_TRANSFER_START: "FILE_TRANSFER_START",
    FILE_CHUNK: "FILE_CHUNK",
    FILE_TRANSFER_END: "FILE_TRANSFER_END",
    TYPING: "TYPING",
    READ: "READ",
    REACTION: "REACTION",
    MESSAGE_EDIT: "MESSAGE_EDIT",
    MESSAGE_DELETE: "MESSAGE_DELETE",
    SYSTEM: "SYSTEM",
    BEACON: "BEACON",
    REQUEST: "REQUEST",
    ACCEPT: "ACCEPT",
    FIND: "FIND",
    PING: "PING",
    GROUP_CREATE: "GROUP_CREATE",
    GROUP_INVITE: "GROUP_INVITE",
    GROUP_JOIN: "GROUP_JOIN",
    GROUP_JOIN_REQUEST: "GROUP_JOIN_REQUEST",
    GROUP_JOIN_RESPONSE: "GROUP_JOIN_RESPONSE",
    PIN_MESSAGE: "PIN_MESSAGE",
    UNPIN_MESSAGE: "UNPIN_MESSAGE"
  },

  createPacket(type, fromId, toId, payload) {
    // We assume uuidv4 is available in the environment this is called
    // or we pass packetId from outside if needed. For UI, we can just let backend assign ID if null
    return {
      packetId: null, // to be assigned
      type: type,
      from: fromId,
      to: toId,
      timestamp: new Date().toISOString(),
      payload: payload
    };
  },

  serialize(packet) {
    const jsonStr = JSON.stringify(packet);
    const buffer = Buffer.from(jsonStr, 'utf8');
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32BE(buffer.length, 0);
    return Buffer.concat([lengthBuffer, buffer]);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Protocol;
}
if (typeof window !== 'undefined') {
  window.Protocol = Protocol;
}
