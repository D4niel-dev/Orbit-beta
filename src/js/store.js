// src/js/store.js
class Store {
  constructor(initialState = {}) {
    const savedSettings = window.orbitAPI ? window.orbitAPI.dbGetSetting('settings', {}) : (window.Storage ? window.Storage.get('settings', {}) : {});
    const savedNetwork = window.orbitAPI ? window.orbitAPI.dbGetSetting('networkSettings', {}) : (window.Storage ? window.Storage.get('networkSettings', {}) : {});
    
    let dbFriends = window.orbitAPI ? window.orbitAPI.dbGetFriends() : (window.Storage ? (window.Storage.get('appData', {}).friends || []) : []);
    if (!dbFriends || dbFriends.length === 0) {
      dbFriends = [
        {
          userId: 'local-echo',
          username: 'Orbit Echo',
          usertag: 'BOT',
          status: 'online',
          avatar: 'icons/orbit/orbit_default.png',
          bio: 'A local echo channel for testing messages.'
        }
      ];
    }
    
    const dbMessages = window.orbitAPI ? window.orbitAPI.dbAllMessagesRaw() : (window.Storage ? (window.Storage.get('appData', {}).messages || {}) : {});
    const uiState = window.orbitAPI ? window.orbitAPI.dbGetSetting('uiState', { activeTab: 'dms', activeChatId: 'local-echo' }) : { activeTab: 'dms', activeChatId: 'local-echo' };

    this.state = {
      currentUser: {
        id: null,
        username: 'User',
        usertag: '0000',
        status: 'online',
        avatar: null
      },
      settings: {
        theme: 'dark',
        fontSize: 'Medium',
        messageBubbles: 'Modern',
        appZoom: 100,
        animations: true,
        timeFormat24: false,
        bgPattern: 'None',
        ...savedSettings
      },
      networkSettings: {
        mode: 'LAN Auto-Discovery',
        udpPort: 45678,
        tcpPort: 46000,
        maxFileSize: 500,
        webrtcFallback: true,
        logLevel: 'None',
        ...savedNetwork
      },
      friends: dbFriends,
      groups: window.orbitAPI ? [] : (window.Storage ? (window.Storage.get('appData', {}).groups || []) : []),
      activeView: 'friends',
      activeTab: uiState.activeTab || 'dms',
      activeChatId: uiState.activeChatId || 'local-echo',
      messages: dbMessages,
      transferProgress: {}, // { fileId: { received, total, isSending } }
      ...initialState
    };
    this.listeners = [];
  }

  addOrUpdatePeer(peer) {
    const friends = [...this.state.friends];
    const existingIndex = friends.findIndex(f => f.userId === peer.userId);
    
    if (existingIndex >= 0) {
      friends[existingIndex] = { ...friends[existingIndex], ...peer };
    } else {
      friends.push(peer);
    }
    
    if (window.orbitAPI) window.orbitAPI.dbSaveFriend(peer);
    this.setState({ friends });
  }

  handleTransferProgress(data) {
    const { fileId, received, total, isSending } = data;
    const currentProgress = { ...this.state.transferProgress };
    
    if (received >= total) {
      delete currentProgress[fileId];
    } else {
      currentProgress[fileId] = { received, total, isSending };
    }
    
    this.setState({ transferProgress: currentProgress });
  }

  handleIncomingPacket(packet) {
    // Basic message handling logic for now
    if (packet.type === 'MESSAGE' || !packet.type) {
      const fromId = packet.from;
      const text = packet.payload.text || (typeof packet.payload === 'string' ? packet.payload : '');
      
      this.addMessage(fromId, {
        id: packet.payload.msgId || packet.packetId || Date.now(),
        sender: fromId,
        text: text,
        timestamp: packet.timestamp || new Date().toISOString(),
        replyTo: packet.payload.replyTo,
        attachments: packet.payload.attachments
      });

      // Notifications
      if (this.state.activeChatId !== fromId || document.hidden) {
        const friend = this.state.friends.find(f => f.userId === fromId) || { username: 'Unknown', avatar: null };
        let preview = text;
        if (preview.length > 50) preview = preview.substring(0, 50) + '...';
        
        if (document.hidden) {
           if (window.orbitAPI && window.orbitAPI.showNotification) {
             window.orbitAPI.showNotification('New message from ' + friend.username, preview);
           }
        } else if (window.Toast) {
           window.Toast.show(friend.username, preview, friend.avatar);
        }
      }
    } else if (packet.type === 'SYSTEM') {
      // Handle edit/delete sync
      const payload = packet.payload;
      if (payload && payload.action === 'delete' && payload.msgId) {
        this.deleteMessage(packet.from, payload.msgId);
      }
    } else if (packet.type === 'MESSAGE_EDIT') {
      const { msgId, newText } = packet.payload;
      this.editMessage(packet.from, msgId, newText);
    } else if (packet.type === 'MESSAGE_DELETE') {
      const { msgId } = packet.payload;
      this.deleteMessage(packet.from, msgId);
    }
  }

  addMessage(chatId, messageObj) {
    const msgs = { ...this.state.messages };
    if (!msgs[chatId]) msgs[chatId] = [];
    msgs[chatId].push(messageObj);
    
    if (window.orbitAPI) window.orbitAPI.dbAddMessage(chatId, messageObj);
    this.setState({ messages: msgs });
  }

  editMessage(chatId, msgId, newText) {
    const msgs = { ...this.state.messages };
    if (msgs[chatId]) {
      const msg = msgs[chatId].find(m => m.id == msgId);
      if (msg) {
        msg.text = newText;
        msg.edited = true;
        if (window.orbitAPI) window.orbitAPI.dbEditMessage(chatId, msgId, newText);
        this.setState({ messages: msgs });
      }
    }
  }

  deleteMessage(chatId, msgId) {
    const msgs = { ...this.state.messages };
    if (msgs[chatId]) {
      msgs[chatId] = msgs[chatId].filter(m => m.id != msgId);
      if (window.orbitAPI) window.orbitAPI.dbDeleteMessage(chatId, msgId);
      this.setState({ messages: msgs });
    }
  }

  getState() {
    return this.state;
  }

  setState(newState) {
    this.state = { ...this.state, ...newState };
    
    // Automatically persist app data if changed (only for web fallback now)
    if (!window.orbitAPI && (newState.messages || newState.friends || newState.groups)) {
      if (window.Storage) {
        window.Storage.set('appData', {
          friends: this.state.friends,
          messages: this.state.messages,
          groups: this.state.groups
        });
      }
    }
    
    if (window.orbitAPI && (newState.activeTab !== undefined || newState.activeChatId !== undefined)) {
       window.orbitAPI.dbSetSetting('uiState', {
         activeTab: this.state.activeTab,
         activeChatId: this.state.activeChatId
       });
    }
    
    this.notify();
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach(listener => listener(this.state));
  }
}

// Global singleton store
window.store = new Store();
