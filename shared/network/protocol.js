// shared/network/protocol.js
// Packet protocol definitions — unified between desktop and mobile

window.Orbit = window.Orbit || {};

Orbit.Protocol = {
  Types: {
    // Core messaging
    MESSAGE: 'MESSAGE',
    TYPING: 'TYPING',
    REACTION: 'REACTION',
    MESSAGE_EDIT: 'MESSAGE_EDIT',
    MESSAGE_DELETE: 'MESSAGE_DELETE',
    READ: 'READ',
    READ_RECEIPT: 'READ_RECEIPT',
    EDIT_MESSAGE: 'EDIT_MESSAGE',
    SYSTEM: 'SYSTEM',

    // Discovery & presence
    BEACON: 'BEACON',
    DISCOVERY: 'DISCOVERY',
    DISCOVERY_RESPONSE: 'DISCOVERY_RESPONSE',
    ONLINE: 'ONLINE',
    OFFLINE: 'OFFLINE',
    PING: 'PING',
    PONG: 'PONG',
    FIND: 'FIND',
    REQUEST: 'REQUEST',
    ACCEPT: 'ACCEPT',

    // File transfer (desktop chunk-based)
    FILE_TRANSFER_START: 'FILE_TRANSFER_START',
    FILE_CHUNK: 'FILE_CHUNK',
    FILE_TRANSFER_END: 'FILE_TRANSFER_END',
    // File transfer (mobile offer-based)
    FILE_TRANSFER_OFFER: 'FILE_TRANSFER_OFFER',
    FILE_TRANSFER_ACCEPT: 'FILE_TRANSFER_ACCEPT',
    FILE_TRANSFER_PROGRESS: 'FILE_TRANSFER_PROGRESS',
    FILE_TRANSFER_COMPLETE: 'FILE_TRANSFER_COMPLETE',
    // Shared file transfer types
    FILE_TRANSFER_CANCEL: 'FILE_TRANSFER_CANCEL',
    FILE_TRANSFER_REJECT: 'FILE_TRANSFER_REJECT',

    // Groups
    GROUP_CREATE: 'GROUP_CREATE',
    GROUP_INVITE: 'GROUP_INVITE',
    GROUP_JOIN: 'GROUP_JOIN',
    GROUP_JOIN_REQUEST: 'GROUP_JOIN_REQUEST',
    GROUP_JOIN_RESPONSE: 'GROUP_JOIN_RESPONSE',
    GROUP_JOIN_ACCEPT: 'GROUP_JOIN_ACCEPT',
    GROUP_JOIN_DENY: 'GROUP_JOIN_DENY',
    GROUP_LEAVE: 'GROUP_LEAVE',
    GROUP_MEMBER_ADDED: 'GROUP_MEMBER_ADDED',
    GROUP_OWNER_TRANSFER: 'GROUP_OWNER_TRANSFER',
    PIN_MESSAGE: 'PIN_MESSAGE',
    UNPIN_MESSAGE: 'UNPIN_MESSAGE',

    // WebRTC calls
    CALL_OFFER: 'CALL_OFFER',
    CALL_ANSWER: 'CALL_ANSWER',
    CALL_ICE_CANDIDATE: 'CALL_ICE_CANDIDATE',
    CALL_END: 'CALL_END',
    CALL_DECLINE: 'CALL_DECLINE',

    // E2EE
    E2EE_KEY_EXCHANGE: 'E2EE_KEY_EXCHANGE'
  },

  createPacket(type, payload, senderId) {
    return JSON.stringify({
      type: type,
      from: senderId || '',
      senderId: senderId || '',
      timestamp: new Date().toISOString(),
      payload: payload || {}
    });
  },

  parsePacket(data) {
    try {
      return JSON.parse(data);
    } catch(e) {
      return null;
    }
  }
};
