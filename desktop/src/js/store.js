// src/js/store.js
class Store {
  constructor(initialState = {}) {
    const savedSettings = window.orbitAPI ? window.orbitAPI.dbGetSetting('settings', {}) : (window.Storage ? window.Storage.get('settings', {}) : {});
    const savedNetwork = window.orbitAPI ? window.orbitAPI.dbGetSetting('networkSettings', {}) : (window.Storage ? window.Storage.get('networkSettings', {}) : {});
    
    let dbFriends = window.orbitAPI ? window.orbitAPI.dbGetFriends() : (window.Storage ? (window.Storage.get('appData', {}).friends || []) : []);
    if (!dbFriends || dbFriends.length === 0) {
      dbFriends = [];
    }
    // Ensure Orbit Echo is always in the friends list
    var echoFriend = {
      userId: 'local-echo',
      username: 'Orbit Echo',
      usertag: 'BOT',
      status: 'online',
      avatar: 'icons/orbit/orbit_default.png',
      bio: 'A local echo channel for testing messages.'
    };
    if (!dbFriends.some(function(f) { return f.userId === 'local-echo'; })) {
      dbFriends.unshift(echoFriend);
      if (window.orbitAPI) window.orbitAPI.dbSaveFriend(echoFriend);
    }
    
    const dbMessages = window.orbitAPI ? window.orbitAPI.dbAllMessagesRaw() : (window.Storage ? (window.Storage.get('appData', {}).messages || {}) : {});
    const dbGroups = window.orbitAPI ? window.orbitAPI.dbGetGroups() : (window.Storage ? (window.Storage.get('appData', {}).groups || []) : []);
    const uiState = window.orbitAPI ? window.orbitAPI.dbGetSetting('uiState', { activeTab: 'dms', activeChatId: 'local-echo' }) : { activeTab: 'dms', activeChatId: 'local-echo' };
    const savedMutedChats = window.orbitAPI ? (window.orbitAPI.dbGetSetting('mutedChats', {}) || {}) : {};

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
        enterToSend: true,
        showChatAvatars: true,
        showImagePreviews: true,
        showLinkPreviews: true,
        notifySound: true,
        notifyVolume: 80,
        notifySoundType: 'chime',
        notifyPreview: true,
        notifyGroupMentions: false,
        notifyDnd: false,
        devMode: false,
        debugDisplay: false,
        showMessageIds: false,
        logNetworkPackets: false,
        showConnectionStats: false,
        enableExperimental: false,
        experimentalProfileFrames: false,
        experimentalMessageTranslate: false,
        experimentalCompactSpacing: false,
        profileFrame: 0,
        enableCustomColors: false,
        experimentalAnimatedAvatars: false,
        experimentalMessageFx: false,
        e2eeEnabled: false,
        tutorialCompleted: false,
        tutorialSkipped: false,
        showTutorialOnStartup: true,
        sidebarButtons: { activity: true, gallery: true, storage: true },
        ...savedSettings
      },
      networkSettings: {
        mode: 'LAN Auto-Discovery',
        udpPort: 45678,
        tcpPort: 46000,
        maxFileSize: 500,
        webrtcFallback: true,
        logLevel: 'None',
        netBandwidthLimit: 0,
        netAutoReconnect: true,
        netReconnectInterval: 10,
        netTimeout: 30,
        netKeepAlive: 30,
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
      transferErrors: {}, // { fileId: { error, name } }
      pinnedMessages: {}, // { chatId: [{ msgId, text, sender, timestamp }] }
      unreadCounts: {}, // { chatId: number }
      mentionCounts: {}, // { chatId: number }
      lastReadIds: {}, // { chatId: lastReadMsgId }
      mutedChats: savedMutedChats, // { chatId: true }
      readReceipts: {}, // { chatId: { userId: lastReadMsgId } }
      peerPublicKeys: {}, // { peerId: hexPublicKey }
      ...initialState
    };
    this.listeners = [];
    this._prevActiveChatId = this.state.activeChatId;

    // Load persisted read state for all chats
    if (window.orbitAPI) {
      try {
        const chatIds = Object.keys(this.state.messages);
        const lastReadIds = {};
        chatIds.forEach(function(id) {
          const rs = window.orbitAPI.dbGetReadState(id);
          if (rs && rs.lastReadMsgId) {
            lastReadIds[id] = rs.lastReadMsgId;
          }
        });
        this.state.lastReadIds = lastReadIds;
      } catch (e) {
        // ignore
      }
    }
  }

  addOrUpdatePeer(peer) {
    const friends = [...this.state.friends];
    const existingIndex = friends.findIndex(f => f.userId === peer.userId);
    
    if (existingIndex >= 0) {
      var existing = friends[existingIndex];
      var updated = { ...existing, ...peer };
      if (peer.lastSeen) updated.lastSeen = peer.lastSeen;
      friends[existingIndex] = updated;
      
      // If status changed to online
      if (existing.status !== 'online' && peer.status === 'online') {
        this.addSystemLog('peer_connect', 'Peer connected: ' + peer.username);
      } else if (existing.status === 'online' && peer.status === 'offline') {
        this.addSystemLog('peer_disconnect', 'Peer disconnected: ' + peer.username);
      }
    } else {
      friends.push(peer);
      this.addSystemLog('peer_connect', 'New peer discovered: ' + peer.username);
    }

    // Store peer's public key for E2EE
    if (peer.publicKey) {
      this.setPeerPublicKey(peer.userId, peer.publicKey);
    }
    
    if (window.orbitAPI) window.orbitAPI.dbSaveFriend(peer);
    this.setState({ friends });
  }

  addSystemLog(type, message) {
    var logs = this.state.activityLog || [];
    logs = logs.concat([{
      id: Date.now() + Math.random().toString(36).substring(2),
      type: type,
      message: message,
      timestamp: new Date().toISOString()
    }]);
    if (logs.length > 100) logs = logs.slice(logs.length - 100);
    this.setState({ activityLog: logs });
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

  handleTransferError(data) {
    const { fileId, error } = data;
    const currentProgress = { ...this.state.transferProgress };
    const prog = currentProgress[fileId];
    const name = prog ? prog.name : 'Unknown file';
    delete currentProgress[fileId];
    this.setState({ transferProgress: currentProgress });
    const currentErrors = { ...this.state.transferErrors };
    currentErrors[fileId] = { error, name };
    this.setState({ transferErrors: currentErrors });
    if (window.Toast) {
      window.Toast.show('Transfer Failed', name + ': ' + error);
    }
    // Auto-dismiss errors after 10s
    setTimeout(function() {
      var st = window.store.getState();
      var errs = { ...st.transferErrors };
      delete errs[fileId];
      window.store.setState({ transferErrors: errs });
    }, 10000);
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
    const messages = { ...this.state.messages };
    delete messages[groupId];
    const pinnedMessages = { ...this.state.pinnedMessages };
    delete pinnedMessages[groupId];
    const unreadCounts = { ...this.state.unreadCounts };
    delete unreadCounts[groupId];
    const mentionCounts = { ...this.state.mentionCounts };
    delete mentionCounts[groupId];
    const lastReadIds = { ...this.state.lastReadIds };
    delete lastReadIds[groupId];
    const mutedChats = { ...this.state.mutedChats };
    delete mutedChats[groupId];
    this.setState({ groups, messages, pinnedMessages, unreadCounts, mentionCounts, lastReadIds, mutedChats });
  }

  removeFriend(userId) {
    const friends = this.state.friends.filter(function(f) { return f.userId !== userId; });
    if (window.orbitAPI) window.orbitAPI.dbDeleteFriend(userId);
    const messages = { ...this.state.messages };
    delete messages[userId];
    const pinnedMessages = { ...this.state.pinnedMessages };
    delete pinnedMessages[userId];
    const unreadCounts = { ...this.state.unreadCounts };
    delete unreadCounts[userId];
    const mentionCounts = { ...this.state.mentionCounts };
    delete mentionCounts[userId];
    const lastReadIds = { ...this.state.lastReadIds };
    delete lastReadIds[userId];
    const mutedChats = { ...this.state.mutedChats };
    delete mutedChats[userId];
    this.setState({ friends, messages, pinnedMessages, unreadCounts, mentionCounts, lastReadIds, mutedChats });
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

  setMemberRole(groupId, userId, role) {
    const groups = this.state.groups.map(g => {
      if (g.groupId === groupId) {
        return { ...g, members: g.members.map(m => m.userId === userId ? { ...m, role: role } : m) };
      }
      return g;
    });
    if (window.orbitAPI) window.orbitAPI.dbSetMemberRole(groupId, userId, role);
    this.setState({ groups });
  }

  addMemberToGroup(groupId, user) {
    const groups = this.state.groups.map(g => {
      if (g.groupId !== groupId) return g;
      const members = g.members || [];
      if (!members.find(m => m.userId === user.userId)) {
        if (window.orbitAPI) window.orbitAPI.dbAddGroupMember(groupId, user);
        return { ...g, members: [...members, { ...user, joinedAt: user.joinedAt || new Date().toISOString() }] };
      }
      return g;
    });
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

  getGroupMembers(groupId) {
    const group = this.state.groups.find(g => g.groupId === groupId);
    return group ? (group.members || []) : [];
  }

  handleIncomingPacket(packet) {
    if (!packet || !packet.payload) return;
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
          var msgs = { ...this.state.messages };
          if (!msgs[groupId]) msgs[groupId] = [];
          this.setState({ messages: msgs, activeChatId: groupId });
          if (window.Toast) window.Toast.show('Joined Group', 'You are now a member of ' + (groupName || 'Group'));
        }
      } else {
        if (window.Toast) window.Toast.show('Join Denied', 'Your request to join was denied.');
      }
      return;
    }

    if (packet.type === 'GROUP_LEAVE') {
      const { groupId, userId } = packet.payload;
      var leaverGroup = this.state.groups.find(function(g) { return g.groupId === groupId; });
      if (leaverGroup) {
        var leaver = leaverGroup.members ? leaverGroup.members.find(function(m) { return m.userId === userId; }) : null;
        this.removeGroupMember(groupId, userId);
        if (window.Toast) {
          window.Toast.show('Member Left', (leaver ? leaver.username : 'Someone') + ' left ' + leaverGroup.groupName);
        }
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
    if (packet.type === 'MESSAGE') {
      const fromId = packet.payload.chatId || packet.from;
      var text = packet.payload.text || (typeof packet.payload === 'string' ? packet.payload : '');

      // Decrypt E2EE messages
      if (packet.payload.e2ee && this.state.settings.e2eeEnabled) {
        var decrypted = this.e2eeDecryptMessage(text, packet.from);
        if (decrypted) text = decrypted;
      }

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
      var isMuted = this.state.mutedChats && this.state.mutedChats[fromId];
      if (settings.notifySound && !settings.notifyDnd && !isMuted && window.NotificationSound) {
        window.NotificationSound.play({ volume: settings.notifyVolume, type: settings.notifySoundType });
      }

      // Notifications
      if (this.state.activeChatId !== fromId || document.hidden) {
        const isGroup = this.state.groups.find(g => g.groupId === fromId);
        if (isGroup && isGroup.notificationMuted) return;
        if (this.state.mutedChats && this.state.mutedChats[fromId]) return;
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
    } else if (packet.type === 'READ') {
      const { chatId, lastReadMsgId } = packet.payload;
      if (chatId && lastReadMsgId) {
        const readReceipts = { ...this.state.readReceipts };
        if (!readReceipts[chatId]) readReceipts[chatId] = {};
        readReceipts[chatId][packet.from] = lastReadMsgId;
        this.setState({ readReceipts });
      }
    }
  }

  // --- E2EE Helpers ---

  getPeerPublicKey(peerId) {
    var state = this.state;
    var friend = state.friends.find(function(f) { return f.userId === peerId; });
    if (friend && friend.publicKey) return friend.publicKey;
    var group = state.groups.find(function(g) { return g.groupId === peerId; });
    if (group && group.publicKey) return group.publicKey;
    return state.peerPublicKeys[peerId] || null;
  }

  setPeerPublicKey(peerId, publicKey) {
    var peerPublicKeys = { ...this.state.peerPublicKeys };
    peerPublicKeys[peerId] = publicKey;
    // Also store on friend if applicable
    var friends = this.state.friends.map(function(f) {
      if (f.userId === peerId) return { ...f, publicKey: publicKey };
      return f;
    });
    this.setState({ peerPublicKeys: peerPublicKeys, friends: friends });
  }

  e2eeEncryptMessage(plaintext, peerId) {
    if (!this.state.settings.e2eeEnabled) return plaintext;
    var pubKey = this.getPeerPublicKey(peerId);
    if (!pubKey || !window.orbitAPI) return plaintext;
    return window.orbitAPI.e2eeEncrypt(plaintext, pubKey) || plaintext;
  }

  e2eeDecryptMessage(ciphertext, fromId) {
    if (!ciphertext || !this.state.settings.e2eeEnabled) return ciphertext;
    var pubKey = this.getPeerPublicKey(fromId);
    if (!pubKey || !window.orbitAPI) return ciphertext;
    return window.orbitAPI.e2eeDecrypt(ciphertext, pubKey) || ciphertext;
  }

  addMessage(chatId, messageObj) {
    const msgs = { ...this.state.messages };
    if (!msgs[chatId]) msgs[chatId] = [];
    msgs[chatId] = [...msgs[chatId], messageObj];

    if (window.orbitAPI) window.orbitAPI.dbAddMessage(chatId, messageObj);

    // Track unread if not the active chat
    const isActive = this.state.activeChatId === chatId && !document.hidden;
    const unreadCounts = { ...this.state.unreadCounts };
    const mentionCounts = { ...this.state.mentionCounts };

    if (!isActive) {
      // Don't increment unread for own messages
      if (messageObj.sender !== this.state.currentUser.userId) {
        unreadCounts[chatId] = (unreadCounts[chatId] || 0) + 1;
      }
    }

    // Detect @mentions referencing current user (always, even when active)
    const currentUser = this.state.currentUser;
    if (messageObj.sender !== currentUser.userId && messageObj.text) {
      const text = messageObj.text;
      if (text.includes('@' + currentUser.username) || text.includes('@' + currentUser.usertag) || text.includes('@everyone') || text.includes('@here')) {
        mentionCounts[chatId] = (mentionCounts[chatId] || 0) + 1;
        if (window.orbitAPI) {
          window.orbitAPI.dbAddMention(chatId, messageObj.id, messageObj.sender);
        }
      }
    }

    this.setState({ messages: msgs, unreadCounts, mentionCounts });
  }

  markAsRead(chatId) {
    const unreadCounts = { ...this.state.unreadCounts };
    const mentionCounts = { ...this.state.mentionCounts };
    const lastReadIds = { ...this.state.lastReadIds };
    delete unreadCounts[chatId];
    delete mentionCounts[chatId];
    if (window.orbitAPI) {
      const msgs = this.state.messages[chatId];
      if (msgs && msgs.length > 0) {
        const lastId = msgs[msgs.length - 1].id;
        window.orbitAPI.dbSetReadState(chatId, lastId);
        lastReadIds[chatId] = lastId;
      }
      window.orbitAPI.dbClearMentions(chatId);
    }
    this.setState({ unreadCounts, mentionCounts, lastReadIds });
  }

  toggleMute(chatId) {
    const mutedChats = { ...this.state.mutedChats };
    if (mutedChats[chatId]) {
      delete mutedChats[chatId];
    } else {
      mutedChats[chatId] = true;
    }
    if (window.orbitAPI) window.orbitAPI.dbSetSetting('mutedChats', mutedChats);
    this.setState({ mutedChats });
  }

  editMessage(chatId, msgId, newText) {
    const msgs = { ...this.state.messages };
    if (msgs[chatId]) {
      msgs[chatId] = msgs[chatId].map(m => {
        if (m.id == msgId) {
          return { ...m, text: newText, edited: true };
        }
        return m;
      });
      if (window.orbitAPI) window.orbitAPI.dbEditMessage(chatId, msgId, newText);
      this.setState({ messages: msgs });

      // Broadcast edit to peers
      const state = this.state;
      const members = this.getGroupMembers(chatId);
      if (window.orbitAPI) {
        if (members.length > 0) {
          members.forEach(m => {
            if (m.userId !== state.currentUser.userId && m.ip) {
              window.orbitAPI.networkSend(m.userId, m.ip, window.Protocol.Types.MESSAGE_EDIT, { msgId, newText });
            }
          });
        } else {
          const friend = state.friends.find(f => f.userId === chatId);
          if (friend && friend.ip) {
            window.orbitAPI.networkSend(chatId, friend.ip, window.Protocol.Types.MESSAGE_EDIT, { msgId, newText });
          }
        }
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

    if (window.orbitAPI) {
      if (members.length > 0) {
        members.forEach(m => {
          if (m.userId !== state.currentUser.userId && m.ip) {
            window.orbitAPI.networkSend(m.userId, m.ip, window.Protocol.Types.REACTION, { msgId, emoji, action, userId: state.currentUser.userId });
          }
        });
      } else {
        const friend = state.friends.find(f => f.userId === chatId);
        if (friend && friend.ip) {
          window.orbitAPI.networkSend(chatId, friend.ip, window.Protocol.Types.REACTION, { msgId, emoji, action, userId: state.currentUser.userId });
        }
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

    // Auto-mark as read when switching to a chat
    if (newState.activeChatId && newState.activeChatId !== (this._prevActiveChatId || this.state.activeChatId)) {
      const chatId = this.state.activeChatId;
      if (chatId && this.state.unreadCounts[chatId]) {
        this._markAsReadInternal(chatId);
      }
      // Send read receipt to peers
      this._sendReadReceipt(chatId);
    }
    this._prevActiveChatId = this.state.activeChatId;

    this.notify();
  }

  _markAsReadInternal(chatId) {
    const unreadCounts = { ...this.state.unreadCounts };
    const mentionCounts = { ...this.state.mentionCounts };
    const lastReadIds = { ...this.state.lastReadIds };
    delete unreadCounts[chatId];
    delete mentionCounts[chatId];
    if (window.orbitAPI) {
      const msgs = this.state.messages[chatId];
      if (msgs && msgs.length > 0) {
        const lastId = msgs[msgs.length - 1].id;
        window.orbitAPI.dbSetReadState(chatId, lastId);
        lastReadIds[chatId] = lastId;
      }
      window.orbitAPI.dbClearMentions(chatId);
    }
    this.setState({ unreadCounts, mentionCounts, lastReadIds });
  }

  _sendReadReceipt(chatId) {
    if (!window.orbitAPI || chatId === 'local-echo') return;
    const msgs = this.state.messages[chatId];
    if (!msgs || msgs.length === 0) return;
    const lastId = msgs[msgs.length - 1].id;
    const state = this.state;
    const members = this.getGroupMembers(chatId);
    if (members.length > 0) {
      members.forEach(m => {
        if (m.userId !== state.currentUser.userId && m.ip) {
          window.orbitAPI.networkSend(m.userId, m.ip, window.Protocol.Types.READ, { chatId, lastReadMsgId: lastId });
        }
      });
    } else {
      const friend = state.friends.find(f => f.userId === chatId);
      if (friend && friend.ip) {
        window.orbitAPI.networkSend(chatId, friend.ip, window.Protocol.Types.READ, { chatId, lastReadMsgId: lastId });
      }
    }
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
