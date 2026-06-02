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
    const dbGroups = window.orbitAPI ? window.orbitAPI.dbGetGroups() : (window.Storage ? (window.Storage.get('appData', {}).groups || []) : []);
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
        animSpeed: 'normal',
        reduceMotion: false,
        messageAnim: 'slide',
        timeFormat24: false,
        bgPattern: 'None',
        notifySound: true,
        notifyPreview: true,
        notifyGroupMentions: false,
        notifyDnd: false,
        devMode: false,
        debugDisplay: false,
        showMessageIds: false,
        logNetworkPackets: false,
        showConnectionStats: false,
        enableExperimental: false,
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
      groups: dbGroups,
      activeView: 'friends',
      activeTab: uiState.activeTab || 'dms',
      activeChatId: uiState.activeChatId || 'local-echo',
      sidebarMiddleVisible: true,
      messages: dbMessages,
      transferProgress: {}, // { fileId: { received, total, isSending } }
      pinnedMessages: {}, // { chatId: [{ msgId, text, sender, timestamp }] }
      ...initialState
    };
    this.listeners = [];
  }

  addOrUpdatePeer(peer) {
    const friends = [...this.state.friends];
    const existingIndex = friends.findIndex(f => f.userId === peer.userId);
    
    if (existingIndex >= 0) {
      // Preserve lastSeen from incoming beacon data
      var existing = friends[existingIndex];
      var updated = { ...existing, ...peer };
      if (peer.lastSeen) updated.lastSeen = peer.lastSeen;
      friends[existingIndex] = updated;
    } else {
      friends.push(peer);
    }
    
    if (window.orbitAPI) window.orbitAPI.dbSaveFriend(peer);
    this.setState({ friends });
  }

  handleTransferProgress(data) {
    const { fileId, received, total, isSending, name } = data;
    const currentProgress = { ...this.state.transferProgress };
    if (received >= total) {
      delete currentProgress[fileId];
    } else {
      // Preserve name if previously set, or use name from event, or use existing
      const existing = currentProgress[fileId];
      currentProgress[fileId] = { received, total, isSending, name: name || (existing ? existing.name : undefined) };
    }
    this.setState({ transferProgress: currentProgress });
  }

  addTransferProgress(name, fileId) {
    const currentProgress = { ...this.state.transferProgress };
    if (!fileId) {
      fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    }
    currentProgress[fileId] = { received: 0, total: 1, isSending: true, name: name };
    this.setState({ transferProgress: currentProgress });
    return fileId;
  }

  addGroup(group) {
    const groups = [...this.state.groups];
    const existing = groups.findIndex(g => g.groupId === group.groupId);
    
    // Generate invite code for new groups
    if (!group.inviteCode) {
      group.inviteCode = require('crypto').randomBytes(4).toString('hex');
    }
    
    if (existing >= 0) {
      groups[existing] = { ...groups[existing], ...group };
    } else {
      groups.push(group);
    }
    if (window.orbitAPI) window.orbitAPI.dbSaveGroup(group);
    this.setState({ groups });
  }

  removeGroup(groupId) {
    const groups = this.state.groups.filter(g => g.groupId !== groupId);
    if (window.orbitAPI) window.orbitAPI.dbDeleteGroup(groupId);
    this.setState({ groups });
  }

  removeGroupMember(groupId, userId) {
    const groups = this.state.groups.map(g => {
      if (g.groupId === groupId) {
        return { ...g, members: g.members.filter(m => m.userId !== userId) };
      }
      return g;
    });
    if (window.orbitAPI) window.orbitAPI.dbRemoveGroupMember(groupId, userId);
    this.setState({ groups });
  }

  addMemberToGroup(groupId, user) {
    const groups = this.state.groups.map(g => {
      if (g.groupId === groupId) {
        if (!g.members.find(m => m.userId === user.userId)) {
          return { ...g, members: [...g.members, user] };
        }
      }
      return g;
    });
    if (window.orbitAPI) window.orbitAPI.dbAddGroupMember(groupId, user);
    this.setState({ groups });
  }

  updateGroupField(groupId, field, value) {
    const groups = this.state.groups.map(g => {
      if (g.groupId === groupId) return { ...g, [field]: value };
      return g;
    });
    this.setState({ groups });
    if (window.orbitAPI) window.orbitAPI.dbUpdateGroupField(groupId, field, value);
  }

  addMemberToGroup(groupId, user) {
    const groups = this.state.groups.map(g => {
      if (g.groupId !== groupId) return g;
      const members = g.members || [];
      if (!members.find(m => m.userId === user.userId)) {
        if (window.orbitAPI) window.orbitAPI.dbAddGroupMember(groupId, user);
        return { ...g, members: [...members, { ...user, joinedAt: new Date().toISOString() }] };
      }
      return g;
    });
    this.setState({ groups });
  }

  getGroupMembers(groupId) {
    const group = this.state.groups.find(g => g.groupId === groupId);
    return group ? (group.members || []) : [];
  }

  handleIncomingPacket(packet) {
    // Group packets
    if (packet.type === 'GROUP_CREATE') {
      const { groupId, groupName, ownerId, members } = packet.payload;
      const existingGroup = this.state.groups.find(g => g.groupId === groupId);
      if (!existingGroup) {
        const group = {
          groupId,
          groupName,
          ownerId,
          members: members || [],
          createdAt: packet.timestamp || new Date().toISOString()
        };
        this.addGroup(group);
        if (window.Toast) window.Toast.show('New Group', 'You were added to ' + groupName);
        if (document.hidden && window.orbitAPI && window.orbitAPI.showNotification) {
          window.orbitAPI.showNotification('New Group', 'You were added to ' + groupName);
        }
      }
      return;
    }

    if (packet.type === 'GROUP_INVITE') {
      const { groupId, groupName, inviter } = packet.payload;
      if (window.Toast) window.Toast.show('Group Invite', inviter + ' invited you to ' + groupName);
      if (document.hidden && window.orbitAPI && window.orbitAPI.showNotification) {
        window.orbitAPI.showNotification('Group Invite', inviter + ' invited you to ' + groupName);
      }
      return;
    }

    if (packet.type === 'GROUP_JOIN_REQUEST') {
      const { inviteCode, userId, username } = packet.payload;
      var myGroup = this.state.groups.find(function(g) { return g.inviteCode === inviteCode && g.ownerId === this.state.currentUser.userId; }.bind(this));
      if (myGroup) {
        var members = myGroup.members || [];
        var alreadyMember = members.some(function(m) { return m.userId === userId; });
        if (!alreadyMember) {
          var newMember = { userId: userId, username: username, status: 'online', ip: null };
          this.addMemberToGroup(myGroup.groupId, newMember);
          var requester = this.state.friends.find(function(f) { return f.userId === userId; });
          if (window.orbitAPI && requester && requester.ip) {
            window.orbitAPI.networkSend(userId, requester.ip, window.Protocol.Types.GROUP_JOIN_RESPONSE, {
              groupId: myGroup.groupId,
              groupName: myGroup.groupName,
              accepted: true,
              members: [...members, newMember]
            });
          }
        }
      }
      return;
    }

    if (packet.type === 'GROUP_JOIN_RESPONSE') {
      const { groupId, groupName, accepted, members } = packet.payload;
      if (accepted && groupId) {
        var existing = this.state.groups.find(function(g) { return g.groupId === groupId; });
        if (!existing) {
          var group = {
            groupId: groupId,
            groupName: groupName || 'Group',
            ownerId: packet.from,
            members: members || [],
            createdAt: new Date().toISOString()
          };
          this.addGroup(group);
          var msgs = this.state.messages;
          msgs[groupId] = msgs[groupId] || [];
          this.setState({ messages: msgs, activeChatId: groupId });
          if (window.Toast) window.Toast.show('Joined Group', 'You are now a member of ' + (groupName || 'Group'));
        }
      } else {
        if (window.Toast) window.Toast.show('Join Denied', 'Your request to join was denied.');
      }
      return;
    }

    if (packet.type === 'REACTION') {
      const { msgId, emoji, action, userId } = packet.payload;
      const chatId = packet.to || packet.from;
      const msgs = { ...this.state.messages };
      if (msgs[chatId]) {
        msgs[chatId] = msgs[chatId].map(m => {
          if (String(m.id) === String(msgId)) {
            const reactions = m.reactions ? [...m.reactions] : [];
            const existingIdx = reactions.findIndex(r => r.emoji === emoji && r.userId === userId);
            if (action === 'add' && existingIdx < 0) {
              reactions.push({ emoji, userId });
            } else if (action === 'remove' && existingIdx >= 0) {
              reactions.splice(existingIdx, 1);
            }
            return { ...m, reactions };
          }
          return m;
        });
        this.setState({ messages: msgs });
      }
      return;
    }

    // Typing indicator — handled via direct listener in app.js
    if (packet.type === 'TYPING') {
      return;
    }

    // Basic message handling logic
    if (packet.type === 'MESSAGE' || !packet.type) {
      const fromId = packet.payload.chatId || packet.from;
      const text = packet.payload.text || (typeof packet.payload === 'string' ? packet.payload : '');
      
      this.addMessage(fromId, {
        id: packet.payload.msgId || packet.packetId || Date.now(),
        sender: fromId,
        text: text,
        timestamp: packet.timestamp || new Date().toISOString(),
        replyTo: packet.payload.replyTo,
        attachments: packet.payload.attachments
      });

      // Clear typing indicator for sender
      if (window.TypingState) {
        window.TypingState.removeUser(fromId, packet.from);
      }

      // Play notification sound
      var settings = this.state.settings || {};
      if (settings.notifySound && !settings.notifyDnd && window.NotificationSound) {
        window.NotificationSound.play();
      }

      // Notifications
      if (this.state.activeChatId !== fromId || document.hidden) {
        const isGroup = this.state.groups.find(g => g.groupId === fromId);
        if (isGroup && isGroup.notificationMuted) return;
        let senderName = 'Unknown';
        let senderAvatar = null;
        if (isGroup) {
          const member = isGroup.members.find(m => m.userId === packet.from);
          senderName = member ? member.username : (isGroup.groupName || 'Group');
          senderAvatar = member ? member.avatar : null;
        } else {
          const friend = this.state.friends.find(f => f.userId === fromId);
          if (friend) {
            senderName = friend.username;
            senderAvatar = friend.avatar;
          }
        }
        let preview = text;
        if (preview.length > 50) preview = preview.substring(0, 50) + '...';
        const title = isGroup ? senderName + ' in ' + isGroup.groupName : senderName;
        
        if (document.hidden) {
           if (window.orbitAPI && window.orbitAPI.showNotification) {
             window.orbitAPI.showNotification('New message from ' + title, preview);
           }
        } else if (window.Toast) {
           window.Toast.show(title, preview, senderAvatar);
        }
      }
    } else if (packet.type === 'SYSTEM') {
      // Handle edit/delete sync
      const payload = packet.payload;
      if (payload && payload.action === 'delete' && payload.msgId) {
        this.deleteMessage(packet.from, payload.msgId);
      }
    } else if (packet.type === 'PIN_MESSAGE') {
      const { msgId } = packet.payload;
      this.pinMessage(packet.from, msgId);
      return;
    } else if (packet.type === 'UNPIN_MESSAGE') {
      const { msgId } = packet.payload;
      this.unpinMessage(packet.from, msgId);
      return;
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

  sendReaction(chatId, msgId, emoji, action) {
    const state = this.state;
    const members = this.getGroupMembers(chatId);

    if (members.length > 0) {
      // Group chat: send to all members
      members.forEach(m => {
        if (m.userId !== state.currentUser.userId && m.ip) {
          window.orbitAPI.networkSend(m.userId, m.ip, window.Protocol.Types.REACTION, { msgId, emoji, action, userId: state.currentUser.userId });
        }
      });
    } else {
      // DM: send to the single peer
      const friend = state.friends.find(f => f.userId === chatId);
      if (friend && friend.ip) {
        window.orbitAPI.networkSend(chatId, friend.ip, window.Protocol.Types.REACTION, { msgId, emoji, action, userId: state.currentUser.userId });
      }
    }

    // Update locally immediately
    const msgs = { ...state.messages };
    if (msgs[chatId]) {
      msgs[chatId] = msgs[chatId].map(m => {
        if (String(m.id) === String(msgId)) {
          const reactions = m.reactions ? [...m.reactions] : [];
          const existingIdx = reactions.findIndex(r => r.emoji === emoji && r.userId === state.currentUser.userId);
          if (action === 'add' && existingIdx < 0) {
            reactions.push({ emoji, userId: state.currentUser.userId });
          } else if (action === 'remove' && existingIdx >= 0) {
            reactions.splice(existingIdx, 1);
          }
          return { ...m, reactions };
        }
        return m;
      });
      this.setState({ messages: msgs });
    }
  }

  pinMessage(chatId, msgId) {
    var msgs = this.state.messages[chatId];
    if (!msgs) return;
    var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
    if (!msg) return;

    var pinned = { ...this.state.pinnedMessages };
    if (!pinned[chatId]) pinned[chatId] = [];
    
    // Don't allow duplicates
    if (pinned[chatId].some(function(p) { return String(p.msgId) === String(msgId); })) return;
    
    pinned[chatId] = pinned[chatId].concat([{
      msgId: msg.id,
      text: msg.text || '(attachment)',
      sender: msg.sender,
      timestamp: msg.timestamp || new Date().toISOString(),
      pinnedBy: this.state.currentUser.userId,
      pinnedAt: new Date().toISOString()
    }]);

    this.setState({ pinnedMessages: pinned });
  }

  unpinMessage(chatId, msgId) {
    var pinned = { ...this.state.pinnedMessages };
    if (!pinned[chatId]) return;
    pinned[chatId] = pinned[chatId].filter(function(p) { return String(p.msgId) !== String(msgId); });
    if (pinned[chatId].length === 0) delete pinned[chatId];
    this.setState({ pinnedMessages: pinned });
  }

  getPinnedMessages(chatId) {
    var pinned = this.state.pinnedMessages[chatId];
    return pinned || [];
  }

  sendPinMessage(chatId, msgId) {
    var state = this.state;
    var members = this.getGroupMembers(chatId);
    var recipients = [];
    if (members.length > 0) {
      members.forEach(function(m) {
        if (m.userId !== state.currentUser.userId && m.ip) {
          recipients.push({ userId: m.userId, ip: m.ip });
        }
      });
    } else {
      var friend = state.friends.find(function(f) { return f.userId === chatId; });
      if (friend && friend.ip) {
        recipients.push({ userId: friend.userId, ip: friend.ip });
      }
    }
    recipients.forEach(function(r) {
      if (window.orbitAPI) {
        window.orbitAPI.networkSend(r.userId, r.ip, window.Protocol.Types.PIN_MESSAGE, { msgId: msgId });
      }
    });
    this.pinMessage(chatId, msgId);
  }

  sendUnpinMessage(chatId, msgId) {
    var state = this.state;
    var members = this.getGroupMembers(chatId);
    var recipients = [];
    if (members.length > 0) {
      members.forEach(function(m) {
        if (m.userId !== state.currentUser.userId && m.ip) {
          recipients.push({ userId: m.userId, ip: m.ip });
        }
      });
    } else {
      var friend = state.friends.find(function(f) { return f.userId === chatId; });
      if (friend && friend.ip) {
        recipients.push({ userId: friend.userId, ip: friend.ip });
      }
    }
    recipients.forEach(function(r) {
      if (window.orbitAPI) {
        window.orbitAPI.networkSend(r.userId, r.ip, window.Protocol.Types.UNPIN_MESSAGE, { msgId: msgId });
      }
    });
    this.unpinMessage(chatId, msgId);
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

    // Persist groups in SQLite when they change
    if (window.orbitAPI && newState.groups) {
      newState.groups.forEach(g => window.orbitAPI.dbSaveGroup(g));
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
