// shared/network/protocol.js
// Packet protocol definitions — shared between desktop and mobile

window.Orbit = window.Orbit || {};

Orbit.Protocol = {
  Types: {
    DISCOVERY: 'DISCOVERY',
    DISCOVERY_RESPONSE: 'DISCOVERY_RESPONSE',
    ONLINE: 'ONLINE',
    OFFLINE: 'OFFLINE',
    MESSAGE: 'MESSAGE',
    TYPING: 'TYPING',
    REACTION: 'REACTION',
    FILE_TRANSFER_OFFER: 'FILE_TRANSFER_OFFER',
    FILE_TRANSFER_ACCEPT: 'FILE_TRANSFER_ACCEPT',
    FILE_TRANSFER_REJECT: 'FILE_TRANSFER_REJECT',
    FILE_TRANSFER_CANCEL: 'FILE_TRANSFER_CANCEL',
    FILE_TRANSFER_PROGRESS: 'FILE_TRANSFER_PROGRESS',
    FILE_TRANSFER_COMPLETE: 'FILE_TRANSFER_COMPLETE',
    GROUP_CREATE: 'GROUP_CREATE',
    GROUP_LEAVE: 'GROUP_LEAVE',
    GROUP_JOIN_REQUEST: 'GROUP_JOIN_REQUEST',
    GROUP_JOIN_ACCEPT: 'GROUP_JOIN_ACCEPT',
    GROUP_JOIN_DENY: 'GROUP_JOIN_DENY',
    E2EE_KEY_EXCHANGE: 'E2EE_KEY_EXCHANGE',
    EDIT_MESSAGE: 'EDIT_MESSAGE',
    READ_RECEIPT: 'READ_RECEIPT',
    PING: 'PING',
    PONG: 'PONG'
  },

  createPacket(type, payload, senderId) {
    return JSON.stringify({
      type: type,
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
