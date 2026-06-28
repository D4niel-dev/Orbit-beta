// mobile/src/js/store.js
// Orbit Mobile — Data Store
// Ported from desktop Store class with full MStore backward compatibility

class Store {
  constructor(initialState = {}) {
    // ── Data properties (direct access, backward compat with MStore) ──
    this.friends = [];
    this.chats = [];
    this.groups = [];
    this.messages = {};
    this.blockedUsers = [];
    this.user = null;
    this.settings = {
      theme: 'dark',
      enterToSend: true,
      swipeToReply: true,
      privacyMode: false,
      e2eeEnabled: false,
      timeFormat24: true,
      messageBubbles: 'Modern',
      showChatAvatars: true,
      showImagePreviews: true,
      showLinkPreviews: true,
      bgPattern: 'None',
      animations: true,
      animSpeed: 'normal',
      reduceMotion: false,
      devMode: false,
      debugDisplay: false,
      showMessageIds: false,
      logNetworkPackets: false,
      showConnectionStats: false,
      enableExperimental: false,
      experimentalProfileFrames: false,
      experimentalAnimatedAvatars: false,
      experimentalMessageFx: false,
      messageTranslate: true,
      experimentalCompactSpacing: false,
      enableCustomColors: false,
      experimentalPerformanceMode: false,
      notifyPreview: true,
      notifySound: true,
      notifyVolume: 80,
      notifySoundType: 'chime',
      notifyDnd: false,
      notifyGroupMentions: false,
      translateTargetLang: '',
      autoDetectSource: true,
      deleteAttachmentsAfter: 0,
      networkMode: 'LAN Auto-Discovery',
      udpPort: 45678,
      tcpPort: 46000,
      maxFileSize: 500,
      fontSize: 'Medium',
      messageAnim: 'slide',
      netAutoReconnect: true,
      netReconnectInterval: 10,
      netTimeout: 30,
      netKeepAlive: 30,
      webrtcFallback: true,
      logLevel: 'None',
      netBandwidthLimit: 0,
      experimentalFpsMonitor: false,
      experimentalDevOverlay: false,
      mutedChats: {},      // stored inside settings for backward compat (app.js uses MStore.settings.mutedChats)
      ...initialState.settings
    };

    // ── Desktop-style state extras ──
    this.unreadCounts = {};
    this.mentionCounts = {};
    this.lastReadIds = {};
    this.pinnedMessages = {};
    this.closedDMs = {};
    this.pinnedDMs = {};
    this.peerPublicKeys = {};
    this.activeChatId = null;
    this.activeView = 'chats';
    this.transferProgress = {};
    this.transferErrors = {};

    // ── Listeners (subscribe/notify) ──
    this.listeners = [];

    // Sync any initial state
    Object.assign(this, initialState);

    // this.mutedChats aliases this.settings.mutedChats for desktop-style code
    this.mutedChats = this.settings.mutedChats;
  }

  // ════════════════════════════════════════════
  // MStore-compatible API (backward compat)
  // ════════════════════════════════════════════

  get(key, fallback) {
    if (key.indexOf('msg_') === 0) {
      try { var d = JSON.parse(localStorage.getItem('orbit_' + key)); return d !== null ? d : fallback; }
      catch(e) { return fallback; }
    }
    try { var d = JSON.parse(localStorage.getItem('orbit_' + key)); return d !== null ? d : fallback; }
    catch(e) { return fallback; }
  }

  set(key, val) {
    if (key === 'messages') {
      for (var cid in val) {
        if (val.hasOwnProperty(cid)) {
          this.set('msg_' + cid, val[cid]);
        }
      }
      try { localStorage.removeItem('orbit_messages'); } catch(_) {}
      return;
    }
    if (key.indexOf('msg_') === 0) {
      var chatId = key.substring(4);
      try {
        localStorage.setItem('orbit_' + key, JSON.stringify(val));
      } catch(e) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
          console.error('Storage quota exceeded for messages of', chatId);
          if (typeof showToast === 'function') {
            showToast('Storage full! Old messages trimmed for this chat.', 'warning');
          }
          var limits = [30, 15, 5];
          for (var li = 0; li < limits.length; li++) {
            var trimmed = val.slice(-limits[li]);
            try {
              localStorage.setItem('orbit_' + key, JSON.stringify(trimmed));
              if (this.messages) this.messages[chatId] = trimmed;
              return;
            } catch(e2) {}
          }
          console.error('Failed to save messages for', chatId);
          try { localStorage.removeItem('orbit_' + key); } catch(_) {}
          if (this.messages) delete this.messages[chatId];
        }
      }
      return;
    }
    try {
      localStorage.setItem('orbit_' + key, JSON.stringify(val));
    } catch(e) {
      if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        console.error('Storage quota exceeded for', key);
        if (typeof showToast === 'function') {
          showToast('Storage full! Clear some chat history or use smaller images.', 'error');
        }
      }
    }
  }

  // Lazy-load messages for a chat
  getMessages(chatId) {
    if (!this.messages[chatId]) {
      this.messages[chatId] = this.get('msg_' + chatId, []);
    }
    return this.messages[chatId];
  }

  _saveMsgs(chatId) {
    if (this.messages[chatId]) {
      this.set('msg_' + chatId, this.messages[chatId]);
    }
  }

  // Migrate old combined orbit_messages key to per-chat keys
  _migrateOldMessages() {
    try {
      var old = JSON.parse(localStorage.getItem('orbit_messages'));
      if (old && typeof old === 'object') {
        console.log('[Store] Migrating old combined messages to per-chat keys');
        for (var cid in old) {
          if (old.hasOwnProperty(cid) && old[cid]) {
            this.set('msg_' + cid, old[cid]);
          }
        }
        localStorage.removeItem('orbit_messages');
      }
    } catch(e) { console.warn('[Store] migrateOldData failed', e); }
  }

  // Compress large images before storing
  compressImage(dataUrl, maxWidth, maxHeight, quality, callback) {
    if (!dataUrl || !dataUrl.startsWith('data:image')) {
      return callback(dataUrl);
    }
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var w = img.width;
      var h = img.height;
      if (w > maxWidth || h > maxHeight) {
        if (w / h > maxWidth / maxHeight) {
          h = Math.round(h * maxWidth / w);
          w = maxWidth;
        } else {
          w = Math.round(w * maxHeight / h);
          h = maxHeight;
        }
      }
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = function() { callback(dataUrl); };
    img.src = dataUrl;
  }

  // Load all data from localStorage
  load() {
    this.friends = this.get('friends', []).map(function(f) { f.lastSeen = 0; f.status = 'offline'; return f; });
    this.chats = this.get('chats', []);
    this.groups = this.get('groups', []);
    this.messages = {};
    this._migrateOldMessages();
    this.blockedUsers = this.get('blockedUsers', []);
    this.pinnedMessages = this.get('pinnedMessages', {});
    this.unreadCounts = this.get('unreadCounts', {});
    this.mentionCounts = this.get('mentionCounts', {});
    this.lastReadIds = this.get('lastReadIds', {});
    this.peerPublicKeys = this.get('peerPublicKeys', {});

    // Merge saved settings over defaults
    var savedSettings = this.get('settings', {});
    this.settings = Object.assign({}, this.settings, savedSettings);

    // Re-sync mutedChats alias (must point to same object as settings.mutedChats for backward compat)
    this.mutedChats = this.settings.mutedChats;

    this.user = this.get('user', null);
    this._migrateGroups();

    // Generate default user identity if missing
    if (!this.user) {
      this.user = {
        id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: 'User',
        tag: Math.floor(1000 + Math.random() * 9000).toString(),
        status: 'online',
        avatar: null,
        banner: null,
        bio: '',
        publicKey: null
      };
      this.save();
    }

    if (this.settings.profileFrame === undefined) this.settings.profileFrame = 0;

    // Ensure echo bot exists
    var echoFriend = this.friends.find(function(f) { return f.id === 'echo'; });
    if (!echoFriend) {
      this.friends.unshift({
        id: 'echo', name: 'Orbit Echo', tag: 'BOT', status: 'online',
        avatar: 'icons/app/orbit_1024.png', bio: 'Local echo channel for testing'
      });
    } else {
      echoFriend.avatar = 'icons/app/orbit_1024.png';
      echoFriend.status = 'online';
    }
    // Ensure echo chat exists
    var echoChat = this.chats.find(function(c) { return c.id === 'echo'; });
    if (!echoChat) {
      this.chats.unshift({
        id: 'echo', name: 'Orbit Echo', avatar: 'icons/app/orbit_1024.png',
        lastMessage: '', lastTime: '', unread: 0
      });
    } else {
      echoChat.avatar = 'icons/app/orbit_1024.png';
    }
    // Add default echo messages
    if (this.getMessages('echo').length === 0) {
      this.messages['echo'] = [
        { id: 'e1', from: 'echo', text: "Hi! I'm Orbit Echo! You can call me Bit if you want.", time: new Date().toISOString() },
        { id: 'e2', from: 'echo', text: "You can send messages in here and i'll echo it back at you! (except for images, files, folders and sounds files)", time: new Date().toISOString() },
        { id: 'e3', from: 'echo', text: 'THIS MESSAGE WILL SELF-DESTRUCT AFTER 5s', time: new Date().toISOString() },
        { id: 'e4', from: 'echo', text: 'Just kidding..', time: new Date().toISOString() }
      ];
      this._saveMsgs('echo');
    }
    this.save();
  }

  // Save all data to localStorage
  save() {
    this.set('friends', this.friends);
    this.set('chats', this.chats);
    this.set('groups', this.groups);
    this.set('blockedUsers', this.blockedUsers);
    // Sync mutedChats back into settings before persisting (app.js reads MStore.settings.mutedChats)
    this.settings.mutedChats = this.mutedChats;
    this.set('settings', this.settings);
    this.set('user', this.user);
    this.set('pinnedMessages', this.pinnedMessages);
    this.set('unreadCounts', this.unreadCounts);
    this.set('mentionCounts', this.mentionCounts);
    this.set('lastReadIds', this.lastReadIds);
    this.set('peerPublicKeys', this.peerPublicKeys);
  }

  // Enriched chat list
  getChats() {
    var self = this;
    return this.chats.map(function(c) {
      var msgs = self.getMessages(c.id);
      var last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
      var friend = self.friends.find(function(f) { return f.id === c.id; });
      return {
        id: c.id,
        name: c.name,
        avatar: c.avatar || (friend ? friend.avatar : null),
        status: friend ? friend.status : null,
        lastMessage: last ? last.text : '',
        lastTime: last ? last.time : '',
        unread: c.unread || 0
      };
    });
  }

  addMessage(chatId, msg) {
    if (!this.messages[chatId]) this.messages[chatId] = [];
    // Deduplicate
    if (msg.id && this.messages[chatId].some(function(m) { return String(m.id) === String(msg.id); })) return;
    this.messages[chatId].push(msg);
    // Update chat summary
    var chat = this.chats.find(function(c) { return c.id === chatId; });
    if (chat) {
      chat.lastMessage = msg.text;
      chat.lastTime = msg.time;
    }
    this._saveMsgs(chatId);
    this.set('chats', this.chats);
    this.notify({ messages: this.messages, chats: this.chats });
  }

  sendMessage(chatId, text) {
    var msg = {
      id: 'm' + Date.now() + Math.random().toString(36).slice(2, 6),
      from: 'me',
      text: text,
      time: new Date().toISOString()
    };
    this.addMessage(chatId, msg);
    return msg;
  }

  editMessage(chatId, msgId, newText) {
    var msgs = this.messages[chatId];
    if (!msgs) return;
    for (var i = 0; i < msgs.length; i++) {
      if (String(msgs[i].id) === String(msgId)) {
        msgs[i].text = newText;
        msgs[i].edited = true;
        break;
      }
    }
    this._saveMsgs(chatId);
    this.notify({ messages: this.messages });
  }

  deleteMessage(chatId, msgId) {
    var msgs = this.messages[chatId];
    if (!msgs) return;
    this.messages[chatId] = msgs.filter(function(m) { return String(m.id) !== String(msgId); });
    this._saveMsgs(chatId);
    this.notify({ messages: this.messages });
  }

  _migrateGroups() {
    var changed = false;
    var self = this;
    this.groups.forEach(function(g) {
      if (!g.ownerId) { g.ownerId = (self.user ? self.user.id : ''); changed = true; }
      if (g.description === undefined) { g.description = ''; changed = true; }
      if (!g.inviteCode) {
        var arr = new Uint8Array(4);
        if (window.crypto) window.crypto.getRandomValues(arr);
        g.inviteCode = Array.from(arr, function(b) { return b.toString(16).padStart(2, '0'); }).join('');
        changed = true;
      }
      if (g.pinned === undefined) { g.pinned = false; changed = true; }
      if (g.notificationMuted === undefined) { g.notificationMuted = false; changed = true; }
      if (g.pinnedMessages === undefined) { g.pinnedMessages = []; changed = true; }
      if (g.members && g.members.length > 0 && typeof g.members[0] === 'string') {
        g.members = g.members.map(function(id) {
          return { userId: id, role: 'member', joinedAt: g.createdAt || new Date().toISOString() };
        });
        var ownerEntry = g.members.find(function(m) { return m.userId === g.ownerId; });
        if (ownerEntry) ownerEntry.role = 'owner';
        changed = true;
      }
    });
    if (changed) { console.log('[Store] Migrated ' + this.groups.length + ' group(s) — added missing fields'); this.save(); }
  }

  // Helper: current user's ID
  getMyId() {
    return this.user ? (this.user.id || this.user.userId) : '';
  }

  // ════════════════════════════════════════════
  // Desktop Store API (subscribe / notify / state)
  // ════════════════════════════════════════════

  getState() {
    return {
      friends: this.friends,
      chats: this.chats,
      groups: this.groups,
      messages: this.messages,
      blockedUsers: this.blockedUsers,
      user: this.user,
      currentUser: this.user,
      settings: this.settings,
      unreadCounts: this.unreadCounts,
      mentionCounts: this.mentionCounts,
      lastReadIds: this.lastReadIds,
      mutedChats: this.mutedChats,
      pinnedMessages: this.pinnedMessages,
      closedDMs: this.closedDMs,
      pinnedDMs: this.pinnedDMs,
      peerPublicKeys: this.peerPublicKeys,
      activeChatId: this.activeChatId,
      activeView: this.activeView,
      transferProgress: this.transferProgress,
      transferErrors: this.transferErrors
    };
  }

  setState(newState) {
    // Sync to direct properties for backward compat
    var keys = ['friends', 'chats', 'groups', 'messages', 'blockedUsers', 'user',
                'settings', 'unreadCounts', 'mentionCounts', 'lastReadIds',
                'mutedChats', 'pinnedMessages', 'closedDMs', 'pinnedDMs',
                'peerPublicKeys', 'activeChatId', 'activeView',
                'transferProgress', 'transferErrors'];
    for (var k in newState) {
      if (newState.hasOwnProperty(k) && keys.indexOf(k) !== -1) {
        this[k] = newState[k];
      }
    }
    // Map currentUser (desktop convention) → user (mobile convention)
    if (newState.currentUser !== undefined) {
      this.user = newState.currentUser;
    }
    // Persist core data
    if (newState.friends !== undefined || newState.chats !== undefined ||
        newState.groups !== undefined || newState.blockedUsers !== undefined ||
        newState.user !== undefined || newState.settings !== undefined) {
      this.save();
    }
    this.notify(newState);
  }

  setStateBatch(newState) {
    this.setState(newState);
  }

  subscribe(listener) {
    this.listeners.push(listener);
    var self = this;
    return function() {
      self.listeners = self.listeners.filter(function(l) { return l !== listener; });
    };
  }

  notify(changedState) {
    var state = this.getState();
    this.listeners.forEach(function(listener) { listener(state, changedState); });
  }

  // ════════════════════════════════════════════
  // Friends / Peers
  // ════════════════════════════════════════════

  addOrUpdatePeer(peer) {
    if (!peer || !peer.userId) return;
    var idx = this.friends.findIndex(function(f) { return f.userId === peer.userId || f.id === peer.userId; });
    var friend = this.friends[idx];
    if (idx >= 0) {
      this.friends[idx] = Object.assign({}, friend, peer);
    } else {
      this.friends.push(Object.assign({}, peer, { lastSeen: Date.now(), status: peer.status || 'offline' }));
    }
    if (peer.publicKey) this.setPeerPublicKey(peer.userId, peer.publicKey);
    this.save();
    this.notify({ friends: this.friends });
  }

  removeFriend(userId) {
    this.friends = this.friends.filter(function(f) { return f.userId !== userId && f.id !== userId; });
    delete this.messages[userId];
    delete this.pinnedMessages[userId];
    delete this.unreadCounts[userId];
    delete this.mentionCounts[userId];
    delete this.lastReadIds[userId];
    delete this.mutedChats[userId];
    this.save();
    this.notify({ friends: this.friends });
  }

  // ════════════════════════════════════════════
  // Groups
  // ════════════════════════════════════════════

  addGroup(group) {
    if (!group || !group.groupId) return;
    var idx = this.groups.findIndex(function(g) { return g.groupId === group.groupId; });
    if (!group.inviteCode) {
      var arr = new Uint8Array(4);
      if (window.crypto) window.crypto.getRandomValues(arr);
      group.inviteCode = Array.prototype.map.call(arr, function(b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
    }
    if (idx >= 0) {
      this.groups[idx] = Object.assign({}, this.groups[idx], group);
    } else {
      this.groups.push(group);
    }
    this.save();
    this.notify({ groups: this.groups });
  }

  removeGroup(groupId) {
    this.groups = this.groups.filter(function(g) { return g.groupId !== groupId; });
    delete this.messages[groupId];
    delete this.pinnedMessages[groupId];
    delete this.unreadCounts[groupId];
    delete this.mentionCounts[groupId];
    delete this.lastReadIds[groupId];
    delete this.mutedChats[groupId];
    this.save();
    this.notify({ groups: this.groups });
  }

  removeGroupMember(groupId, userId) {
    this.groups = this.groups.map(function(g) {
      if (g.groupId === groupId && g.members) {
        g.members = g.members.filter(function(m) { return m.userId !== userId; });
      }
      return g;
    });
    this.save();
    this.notify({ groups: this.groups });
  }

  setMemberRole(groupId, userId, role) {
    this.groups = this.groups.map(function(g) {
      if (g.groupId === groupId && g.members) {
        g.members = g.members.map(function(m) {
          return m.userId === userId ? Object.assign({}, m, { role: role }) : m;
        });
      }
      return g;
    });
    this.save();
    this.notify({ groups: this.groups });
  }

  addMemberToGroup(groupId, user) {
    this.groups = this.groups.map(function(g) {
      if (g.groupId === groupId) {
        var members = g.members || [];
        if (!members.find(function(m) { return m.userId === user.userId; })) {
          members = members.concat([Object.assign({}, user, { joinedAt: user.joinedAt || new Date().toISOString() })]);
        }
        return Object.assign({}, g, { members: members });
      }
      return g;
    });
    this.save();
    this.notify({ groups: this.groups });
  }

  updateGroupField(groupId, field, value) {
    this.groups = this.groups.map(function(g) {
      if (g.groupId === groupId) {
        var updated = {};
        updated[field] = value;
        return Object.assign({}, g, updated);
      }
      return g;
    });
    this.save();
    this.notify({ groups: this.groups });
  }

  getGroupMembers(groupId) {
    var group = this.groups.find(function(g) { return g.groupId === groupId; });
    return group ? (group.members || []) : [];
  }

  // ════════════════════════════════════════════
  // DM management
  // ════════════════════════════════════════════

  closeDM(userId) {
    delete this.messages[userId];
    delete this.pinnedMessages[userId];
    delete this.unreadCounts[userId];
    delete this.mentionCounts[userId];
    delete this.lastReadIds[userId];
    delete this.mutedChats[userId];
    this.closedDMs[userId] = true;
    delete this.pinnedDMs[userId];
    this.activeChatId = 'echo';
    this.save();
    this.notify({ closedDMs: this.closedDMs, pinnedDMs: this.pinnedDMs, activeChatId: 'echo' });
  }

  togglePinDM(userId) {
    if (this.pinnedDMs[userId]) {
      delete this.pinnedDMs[userId];
    } else {
      this.pinnedDMs[userId] = true;
    }
    this.save();
    this.notify({ pinnedDMs: this.pinnedDMs });
  }

  reopenDM(userId) {
    delete this.closedDMs[userId];
    this.activeChatId = userId;
    this.save();
    this.notify({ closedDMs: this.closedDMs, activeChatId: userId });
  }

  // ════════════════════════════════════════════
  // Read / Unread
  // ════════════════════════════════════════════

  markAsRead(chatId) {
    delete this.unreadCounts[chatId];
    delete this.mentionCounts[chatId];
    var msgs = this.messages[chatId];
    if (msgs && msgs.length > 0) {
      this.lastReadIds[chatId] = msgs[msgs.length - 1].id;
    }
    this.save();
    this.notify({ unreadCounts: this.unreadCounts, mentionCounts: this.mentionCounts, lastReadIds: this.lastReadIds });
  }

  toggleMute(chatId) {
    if (this.mutedChats[chatId]) {
      delete this.mutedChats[chatId];
    } else {
      this.mutedChats[chatId] = true;
    }
    this.save();
    this.notify({ mutedChats: this.mutedChats });
  }

  // ════════════════════════════════════════════
  // Pinned messages
  // ════════════════════════════════════════════

  pinMessage(chatId, msgId) {
    var msgs = this.messages[chatId];
    if (!msgs) return;
    var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
    if (!msg) return;
    if (!this.pinnedMessages[chatId]) this.pinnedMessages[chatId] = [];
    if (this.pinnedMessages[chatId].some(function(p) { return String(p.msgId) === String(msgId); })) return;
    this.pinnedMessages[chatId] = this.pinnedMessages[chatId].concat([{
      msgId: msg.id,
      text: msg.text || '(attachment)',
      from: msg.from || msg.sender,
      timestamp: msg.time || msg.timestamp || new Date().toISOString(),
      pinnedAt: new Date().toISOString()
    }]);
    this.save();
    this.notify({ pinnedMessages: this.pinnedMessages });
  }

  unpinMessage(chatId, msgId) {
    if (!this.pinnedMessages[chatId]) return;
    this.pinnedMessages[chatId] = this.pinnedMessages[chatId].filter(function(p) { return String(p.msgId) !== String(msgId); });
    if (this.pinnedMessages[chatId].length === 0) delete this.pinnedMessages[chatId];
    this.save();
    this.notify({ pinnedMessages: this.pinnedMessages });
  }

  getPinnedMessages(chatId) {
    return this.pinnedMessages[chatId] || [];
  }

  // ════════════════════════════════════════════
  // Blocking
  // ════════════════════════════════════════════

  blockUser(userId) {
    if (this.blockedUsers.indexOf(userId) !== -1) return;
    this.blockedUsers = this.blockedUsers.concat([userId]);
    this.save();
    this.notify({ blockedUsers: this.blockedUsers });
  }

  unblockUser(userId) {
    this.blockedUsers = this.blockedUsers.filter(function(id) { return id !== userId; });
    this.save();
    this.notify({ blockedUsers: this.blockedUsers });
  }

  isUserBlocked(userId) {
    return this.blockedUsers.indexOf(userId) !== -1;
  }

  // ════════════════════════════════════════════
  // E2EE key management
  // ════════════════════════════════════════════

  setPeerPublicKey(peerId, publicKey) {
    if (!peerId || !publicKey) return;
    this.peerPublicKeys[peerId] = publicKey;
    this.set('peerPublicKeys', this.peerPublicKeys);
  }

  getPeerPublicKey(peerId) {
    return this.peerPublicKeys[peerId] || null;
  }

  // ════════════════════════════════════════════
  // Transfer tracking
  // ════════════════════════════════════════════

  addTransferProgress(name, fileId) {
    this.transferProgress[name] = fileId;
    this.notify({ transferProgress: this.transferProgress });
  }

  handleTransferProgress(data) {
    var p = this.transferProgress[data.name] || {};
    p.bytes = data.bytes;
    p.total = data.total;
    p.speed = data.speed;
    this.transferProgress[data.name] = p;
    this.notify({ transferProgress: this.transferProgress });
  }

  handleTransferError(data) {
    var errs = Object.assign({}, this.transferErrors);
    errs[data.name] = data.error || 'Transfer failed';
    this.transferErrors = errs;
    this.notify({ transferErrors: errs });
  }

  // ════════════════════════════════════════════
  // System log
  // ════════════════════════════════════════════

  addSystemLog(type, message) {
    console.log('[System] ' + type + ': ' + message);
  }
}

// Global singleton — named MStore for backward compat with existing mobile code
window.MStore = new Store();
