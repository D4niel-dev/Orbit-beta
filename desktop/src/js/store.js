// src/js/store.js
class Store {
  constructor(initialState = {}) {
    var data, savedSettings, savedNetwork, dbFriends, dbMessages, dbGroups, uiState, savedMutedChats, lastReadIds, savedBlockedUsers;

    // Batch all DB reads into a single IPC call
    if (window.orbitAPI && window.orbitAPI.dbGetAllStartupData) {
      data = window.orbitAPI.dbGetAllStartupData();
      savedSettings = data.settings || {};
      savedNetwork = data.networkSettings || {};
      dbFriends = (data.friends || []).map(function(f) {
        if (f.userId === 'local-echo') {
          f.lastSeen = Date.now();
          f.status = 'online';
        } else {
          f.lastSeen = 0;
          f.status = 'offline';
        }
        return f;
      });
      dbMessages = data.messages || {};
      dbGroups = data.groups || [];
      uiState = data.uiState || { activeTab: 'dms', activeChatId: 'local-echo' };
      savedMutedChats = data.mutedChats || {};
      lastReadIds = data.readStates || {};
      savedBlockedUsers = data.blockedUsers || [];
    } else {
      savedSettings = window.Storage ? window.Storage.get('settings', {}) : {};
      savedNetwork = window.Storage ? window.Storage.get('networkSettings', {}) : {};
      dbFriends = window.Storage ? (window.Storage.get('appData', {}).friends || []).map(function(f) { if (f.userId === 'local-echo') { f.lastSeen = Date.now(); f.status = 'online'; } else { f.lastSeen = 0; f.status = 'offline'; } return f; }) : [];
      dbMessages = window.Storage ? (window.Storage.get('appData', {}).messages || {}) : {};
      dbGroups = window.Storage ? (window.Storage.get('appData', {}).groups || []) : [];
      uiState = { activeTab: 'dms', activeChatId: 'local-echo' };
      savedMutedChats = {};
      lastReadIds = {};
      savedBlockedUsers = window.Storage ? window.Storage.get('blockedUsers', []) : [];
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
      if (window.orbitAPI && window.orbitAPI.dbSaveFriend) window.orbitAPI.dbSaveFriend(echoFriend);
    }

    this.state = {
      currentUser: {
        userId: null,
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
        swipeToReply: true,
        showChatAvatars: true,
        showImagePreviews: true,
        galleryViewMode: 'grid',
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
        experimentalMessageTranslate: true,
        messageTranslate: true,
        translateTargetLang: '',
        autoDetectSource: true,
        experimentalCompactSpacing: false,
        experimentalFpsMonitor: false,
        experimentalDevOverlay: false,
        experimentalPerformanceMode: false,
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
      transferProgress: {},
      transferErrors: {},
      pinnedMessages: {},
      unreadCounts: {},
      mentionCounts: {},
      lastReadIds: lastReadIds,
      mutedChats: savedMutedChats,
      closedDMs: {},
      pinnedDMs: {},
      readReceipts: {},
      peerPublicKeys: {},
      blockedUsers: savedBlockedUsers,
      ...initialState
    };
    this.listeners = [];
    this._prevActiveChatId = this.state.activeChatId;
    this._messagesFullyLoaded = {};
  }

  // Lazy-load full messages for a chat that was only partially loaded at startup
  loadFullChatMessages(chatId) {
    if (!chatId || this._messagesFullyLoaded[chatId]) return;
    var allMsgs = window.orbitAPI ? window.orbitAPI.dbGetMessages(chatId) : [];
    if (!allMsgs || allMsgs.length === 0) {
      this._messagesFullyLoaded[chatId] = true;
      return;
    }
    if (allMsgs.length > 500) allMsgs = allMsgs.slice(-500);
    this.state.messages[chatId] = allMsgs;
    this.setState({ messages: { ...this.state.messages } });
    this._messagesFullyLoaded[chatId] = true;
  }

  // Force-load ALL messages, images, and files from the database into memory
  loadAllMessages() {
    if (!window.orbitAPI) return;
    var raw = window.orbitAPI.dbAllMessagesRaw();
    if (!raw) return;
    this.state.messages = raw;
    this._messagesFullyLoaded = {};
    Object.keys(raw).forEach(function(id) { this._messagesFullyLoaded[id] = true; }, this);
    this.setState({ messages: raw });
  }

  // Per-account closedDMs helpers
  _loadUserClosedDMs(uid) {
    if (!uid || !window.orbitAPI) return {};
    var allMaps = window.orbitAPI.dbGetSetting('userClosedDMs', {});
    return allMaps[uid] || {};
  }
  _saveUserClosedDMs(uid, map) {
    if (!uid || !window.orbitAPI) return;
    var allMaps = window.orbitAPI.dbGetSetting('userClosedDMs', {});
    allMaps[uid] = map;
    window.orbitAPI.dbSetSetting('userClosedDMs', allMaps);
  }
  // Per-account pinnedDMs helpers
  _loadUserPinnedDMs(uid) {
    if (!uid || !window.orbitAPI) return {};
    var allMaps = window.orbitAPI.dbGetSetting('userPinnedDMs', {});
    return allMaps[uid] || {};
  }
  _saveUserPinnedDMs(uid, map) {
    if (!uid || !window.orbitAPI) return;
    var allMaps = window.orbitAPI.dbGetSetting('userPinnedDMs', {});
    allMaps[uid] = map;
    window.orbitAPI.dbSetSetting('userPinnedDMs', allMaps);
  }

  // Re-load messages from DB filtered to the current user (for account switching)
  reloadDataForCurrentUser() {
    var state = this.state;
    var uid = state.currentUser && state.currentUser.userId;
    if (!uid || !window.orbitAPI) return;
    // On first load for this user, auto-track friends/groups tagged with this account
    var allMaps = window.orbitAPI.dbGetSetting('userChatIds', {});
    var chatIds = allMaps[uid];
    if (!chatIds || chatIds.length === 0) {
      chatIds = ['local-echo'];
      state.friends.forEach(function(f) { if (f.accountOwnerId === uid && f.userId !== 'local-echo' && chatIds.indexOf(f.userId) === -1) chatIds.push(f.userId); });
      state.groups.forEach(function(g) { if (g.accountOwnerId === uid && chatIds.indexOf(g.groupId) === -1) chatIds.push(g.groupId); });
      allMaps[uid] = chatIds;
      window.orbitAPI.dbSetSetting('userChatIds', allMaps);
    } else {
      // Clean stale chat IDs that belong to other accounts (from old auto-track)
      var cleaned = chatIds.filter(function(id) {
        if (id === 'local-echo') return true;
        var friend = state.friends.find(function(f) { return f.userId === id; });
        if (friend && friend.accountOwnerId && friend.accountOwnerId !== uid) return false;
        var group = state.groups.find(function(g) { return g.groupId === id; });
        if (group && group.accountOwnerId && group.accountOwnerId !== uid) return false;
        return true;
      });
      if (cleaned.length !== chatIds.length) {
        allMaps[uid] = cleaned;
        window.orbitAPI.dbSetSetting('userChatIds', allMaps);
        chatIds = cleaned;
      }
    }
    var data = window.orbitAPI.dbGetAllStartupData(uid);
    if (!data) return;
    // Load per-account closedDMs and pinnedDMs
    var closedDMs = this._loadUserClosedDMs(uid);
    var pinnedDMs = this._loadUserPinnedDMs(uid);
    // Reset messages and UI to Echo for the new account
    var dbFriends = state.friends;
    var echoFriend = {
      userId: 'local-echo', username: 'Orbit Echo', usertag: 'BOT',
      status: 'online', avatar: 'icons/orbit/orbit_default.png',
      bio: 'A local echo channel for testing messages.'
    };
    if (!dbFriends.some(function(f) { return f.userId === 'local-echo'; })) {
      dbFriends = [echoFriend].concat(dbFriends);
      if (window.orbitAPI && window.orbitAPI.dbSaveFriend) window.orbitAPI.dbSaveFriend(echoFriend);
    }
    this.setState({
      messages: data.messages || {},
      activeChatId: 'local-echo',
      activeTab: 'dms',
      unreadCounts: {},
      mentionCounts: {},
      lastReadIds: data.readStates || {},
      closedDMs: closedDMs,
      pinnedDMs: pinnedDMs,
      _userChatIds: allMaps[uid] || []
    });
    if (window.SidebarMiddle) {
      var s = this.state;
      window.SidebarMiddle.renderList(s);
      window.SidebarMiddle.renderGroups();
    }
    console.log('[Store] Messages reloaded for user:', uid);
  }

  // Ensure a chatId is tracked for the current user (per-account message isolation)
  trackChatForCurrentUser(chatId) {
    if (!chatId || !window.orbitAPI) return;
    var uid = this.state.currentUser && this.state.currentUser.userId;
    if (!uid) return;
    var allMaps = window.orbitAPI.dbGetSetting('userChatIds', {});
    if (!allMaps[uid]) allMaps[uid] = [];
    if (allMaps[uid].indexOf(chatId) === -1) {
      allMaps[uid].push(chatId);
      window.orbitAPI.dbSetSetting('userChatIds', allMaps);
      // Sync in-memory state for render filters
      var ids = this.state._userChatIds || [];
      if (ids.indexOf(chatId) === -1) this.state._userChatIds = ids.concat([chatId]);
    }
  }

  addOrUpdatePeer(peer) {
    const friends = [...this.state.friends];
    const existingIndex = friends.findIndex(f => f.userId === peer.userId);
    
    if (existingIndex >= 0) {
      var existing = friends[existingIndex];
      var updated = { ...existing, ...peer };
      if (peer.lastSeen) updated.lastSeen = peer.lastSeen;
      if (!updated.accountOwnerId) updated.accountOwnerId = existing.accountOwnerId || (this.state.currentUser && this.state.currentUser.userId) || null;
      friends[existingIndex] = updated;
      
      // Track for current account so friend shows up in filtered list
      this.trackChatForCurrentUser(peer.userId);
      
      // If status changed to online
      if (existing.status !== 'online' && peer.status === 'online') {
        this.addSystemLog('peer_connect', 'Peer connected: ' + peer.username);
      } else if (existing.status === 'online' && peer.status === 'offline') {
        this.addSystemLog('peer_disconnect', 'Peer disconnected: ' + peer.username);
      }
      
      // Store peer's public key for E2EE
      if (peer.publicKey) {
        this.setPeerPublicKey(peer.userId, peer.publicKey);
      }
      
      if (window.orbitAPI) window.orbitAPI.dbSaveFriend(updated);
      this.setState({ friends });
      return;
    } else {
      var newPeer = { ...peer };
      if (!newPeer.accountOwnerId) newPeer.accountOwnerId = this.state.currentUser && this.state.currentUser.userId || null;
      if (peer.publicKey) {
        this.setPeerPublicKey(peer.userId, peer.publicKey);
      }
      friends.push(newPeer);
      this.addSystemLog('peer_connect', 'New peer discovered: ' + peer.username);
      this.trackChatForCurrentUser(peer.userId);
      if (window.orbitAPI) window.orbitAPI.dbSaveFriend(newPeer);
      this.setState({ friends });
      return;
    }
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

  setStateBatch(newState) {
    if (!this._batchQueue) this._batchQueue = {};
    Object.assign(this._batchQueue, newState);
    if (!this._batchScheduled) {
      this._batchScheduled = true;
      Promise.resolve().then(() => {
        this._batchScheduled = false;
        const batch = this._batchQueue || {};
        this._batchQueue = null;
        if (Object.keys(batch).length > 0) this.setState(batch);
      });
    }
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
    this.setStateBatch({ transferProgress: currentProgress });
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
    const currentErrors = { ...this.state.transferErrors };
    currentErrors[fileId] = { error, name };
    this.setStateBatch({ transferProgress: currentProgress, transferErrors: currentErrors });
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
      var arr = new Uint8Array(4);
      if (window.crypto) window.crypto.getRandomValues(arr);
      else arr = [Math.random()*255|0, Math.random()*255|0, Math.random()*255|0, Math.random()*255|0];
      group.inviteCode = Array.prototype.map.call(arr, function(b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
    }
    
    var tagged = { ...group };
    if (!tagged.accountOwnerId) tagged.accountOwnerId = this.state.currentUser && this.state.currentUser.userId || null;
    
    if (existing >= 0) {
      groups[existing] = { ...groups[existing], ...tagged };
    } else {
      groups.push(tagged);
    }
    if (window.orbitAPI) window.orbitAPI.dbSaveGroup(tagged);
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

  closeDM(userId) {
    // Don't delete friend globally — just close the DM for this account
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
    const uid = this.state.currentUser && this.state.currentUser.userId;
    var closedDMs = this._loadUserClosedDMs(uid);
    closedDMs = { ...closedDMs, [userId]: true };
    this._saveUserClosedDMs(uid, closedDMs);
    var pinnedDMs = this._loadUserPinnedDMs(uid);
    delete pinnedDMs[userId];
    this._saveUserPinnedDMs(uid, pinnedDMs);
    this.setState({ messages, pinnedMessages, unreadCounts, mentionCounts, lastReadIds, mutedChats, pinnedDMs, closedDMs, activeChatId: 'local-echo' });
    if (window.Toast) window.Toast.show('Closed', 'DM closed');
  }

  togglePinDM(userId) {
    const uid = this.state.currentUser && this.state.currentUser.userId;
    var pinnedDMs = this._loadUserPinnedDMs(uid);
    if (pinnedDMs[userId]) {
      delete pinnedDMs[userId];
    } else {
      pinnedDMs = { ...pinnedDMs, [userId]: true };
    }
    this._saveUserPinnedDMs(uid, pinnedDMs);
    this.setState({ pinnedDMs });
  }

  reopenDM(userId) {
    const uid = this.state.currentUser && this.state.currentUser.userId;
    var closedDMs = this._loadUserClosedDMs(uid);
    delete closedDMs[userId];
    this._saveUserClosedDMs(uid, closedDMs);
    this.setState({ closedDMs, activeChatId: userId });
  }

  removeGroupMember(groupId, userId) {
    const groups = this.state.groups.map(g => {
      if (g.groupId === groupId) {
        return { ...g, members: g.members.filter(m => m.userId !== userId) };
      }
      return g;
    });
    if (window.orbitAPI) window.orbitAPI.dbRemoveGroupMember(groupId, userId);
    // If removing self, untrack this chat for the current account
    var uid = this.state.currentUser && this.state.currentUser.userId;
    if (uid && userId === uid) {
      var allMaps = window.orbitAPI.dbGetSetting('userChatIds', {});
      if (allMaps[uid]) {
        allMaps[uid] = allMaps[uid].filter(function(id) { return id !== groupId; });
        window.orbitAPI.dbSetSetting('userChatIds', allMaps);
      }
      var ids = this.state._userChatIds || [];
      this.state._userChatIds = ids.filter(function(id) { return id !== groupId; });
    }
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
        var friend = this.state.friends.find(function(f) { return f.userId === user.userId; });
        var enrichedUser = friend
          ? { ...user, username: user.username || friend.username, avatar: user.avatar || friend.avatar || null, usertag: user.usertag || friend.usertag || '', publicKey: user.publicKey || friend.publicKey || null }
          : { ...user, avatar: user.avatar || null };
        if (window.orbitAPI) window.orbitAPI.dbAddGroupMember(groupId, enrichedUser);
        return { ...g, members: [...members, { ...enrichedUser, joinedAt: user.joinedAt || new Date().toISOString() }] };
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

    // Block messages from blocked users
    if (packet.from && this.state.blockedUsers && this.state.blockedUsers.indexOf(packet.from) !== -1) {
      return;
    }
    if (packet.type === window.Protocol.Types.GROUP_CREATE) {
      const { groupId, groupName, ownerId, members, groupAvatar } = packet.payload;
      const existingGroup = this.state.groups.find(g => g.groupId === groupId);
      if (!existingGroup) {
        var enrichedMembers = (members || []).map(function(m) {
          var friend = window.store ? window.store.getState().friends.find(function(f) { return f.userId === m.userId; }) : null;
          if (friend) {
            return { ...m, username: m.username || friend.username, avatar: m.avatar || friend.avatar || null, usertag: m.usertag || friend.usertag || '', publicKey: m.publicKey || friend.publicKey || null };
          }
          return m;
        });
        for (var mi = 0; mi < enrichedMembers.length; mi++) {
          if (enrichedMembers[mi].publicKey) {
            this.setPeerPublicKey(enrichedMembers[mi].userId, enrichedMembers[mi].publicKey);
          }
        }
        const group = {
          groupId,
          groupName,
          ownerId,
          avatarDataUrl: groupAvatar || null,
          members: enrichedMembers,
          createdAt: packet.timestamp || new Date().toISOString()
        };
        this.addGroup(group);
        var msgs = { ...this.state.messages };
        if (!msgs[groupId]) msgs[groupId] = [];
        this.setState({ messages: msgs });
        if (window.Toast) window.Toast.show('New Group', 'You were added to ' + groupName);
        if (document.hidden && window.orbitAPI && window.orbitAPI.showNotification) {
          window.orbitAPI.showNotification('New Group', 'You were added to ' + groupName);
        }
      }
      return;
    }

    if (packet.type === window.Protocol.Types.GROUP_INVITE) {
      const { groupId, groupName, inviter, members, groupAvatar } = packet.payload;
      var inviteGroup = this.state.groups.find(function(g) { return g.groupId === groupId; });
      if (!inviteGroup && groupId) {
        var group = {
          groupId: groupId,
          groupName: groupName || 'Invited Group',
          ownerId: packet.from,
          avatarDataUrl: groupAvatar || null,
          members: members || [],
          createdAt: new Date().toISOString()
        };
        this.addGroup(group);
        var msgs = { ...this.state.messages };
        if (!msgs[groupId]) msgs[groupId] = [];
        this.setState({ messages: msgs });
      }
      if (window.Toast) window.Toast.show('Group Invite', inviter + ' invited you to ' + (groupName || 'a group'));
      if (document.hidden && window.orbitAPI && window.orbitAPI.showNotification) {
        window.orbitAPI.showNotification('Group Invite', inviter + ' invited you to ' + (groupName || 'a group'));
      }
      return;
    }

    if (packet.type === window.Protocol.Types.GROUP_JOIN_REQUEST) {
      return;
    }

    if (packet.type === window.Protocol.Types.GROUP_JOIN_RESPONSE) {
      const { groupId, groupName, groupAvatar, accepted, members } = packet.payload;
      if (accepted && groupId) {
        var existing = this.state.groups.find(function(g) { return g.groupId === groupId; });
        if (!existing) {
          // Store group member public keys for E2EE
          if (members) {
            var self = this;
            members.forEach(function(m) {
              if (m.publicKey) {
                self.setPeerPublicKey(m.userId, m.publicKey);
              }
            });
          }
          var group = {
            groupId: groupId,
            groupName: groupName || 'Group',
            ownerId: packet.from,
            avatarDataUrl: groupAvatar || null,
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

    if (packet.type === window.Protocol.Types.GROUP_LEAVE) {
      const { groupId, userId } = packet.payload;
      var leaverGroup = this.state.groups.find(function(g) { return g.groupId === groupId; });
      if (leaverGroup) {
        var leaver = leaverGroup.members ? leaverGroup.members.find(function(m) { return m.userId === userId; }) : null;
        var isSelf = userId === this.state.currentUser.userId;
        if (isSelf) {
          this.removeGroup(groupId);
        } else {
          this.removeGroupMember(groupId, userId);
        }
        if (window.Toast) {
          window.Toast.show(isSelf ? 'Left Group' : 'Member Left', (isSelf ? 'You left ' : (leaver ? leaver.username : 'Someone') + ' left ') + leaverGroup.groupName);
          if (isSelf && this.state.activeChatId === groupId) {
            this.setState({ activeChatId: null });
          }
        }
      }
      return;
    }

    if (packet.type === window.Protocol.Types.GROUP_MEMBER_ADDED) {
      const { groupId, user } = packet.payload;
      if (groupId && user && user.userId) {
        this.addMemberToGroup(groupId, user);
        var gmGroup = this.state.groups.find(function(gg) { return gg.groupId === groupId; });
        if (gmGroup && gmGroup.members && gmGroup.members.some(function(m) { return m.userId === user.userId; })) {
          var updatedGroups = this.state.groups.map(function(gg) {
            if (gg.groupId === groupId && gg.members) {
              return {
                ...gg,
                members: gg.members.map(function(m) {
                  if (m.userId === user.userId) {
                    var updated = { ...m };
                    if (user.avatar !== undefined) updated.avatar = user.avatar;
                    if (user.usertag !== undefined) updated.usertag = user.usertag;
                    if (user.status !== undefined) updated.status = user.status;
                    if (user.publicKey !== undefined) updated.publicKey = user.publicKey;
                    return updated;
                  }
                  return m;
                })
              };
            }
            return gg;
          });
          this.setState({ groups: updatedGroups });
        }
        gmGroup = this.state.groups.find(function(gg) { return gg.groupId === groupId; });
        if (user.publicKey) {
          this.setPeerPublicKey(user.userId, user.publicKey);
        }
        if (window.Toast) window.Toast.show('New Member', (user.username || 'Someone') + ' was added to ' + (gmGroup ? gmGroup.groupName : 'group'));
      }
      return;
    }

    if (packet.type === window.Protocol.Types.GROUP_OWNER_TRANSFER) {
      const { groupId, newOwnerId } = packet.payload;
      if (groupId && newOwnerId) {
        var tGroup = this.state.groups.find(function(gg) { return gg.groupId === groupId; });
        if (tGroup) {
          var oldOwnerId = tGroup.ownerId;
          this.updateGroupField(groupId, 'ownerId', newOwnerId);
          if (oldOwnerId) this.setMemberRole(groupId, oldOwnerId, 'member');
          this.setMemberRole(groupId, newOwnerId, 'owner');
          if (window.Toast) {
            var newOwner = tGroup.members ? tGroup.members.find(function(m) { return m.userId === newOwnerId; }) : null;
            window.Toast.show('Ownership Transferred', 'Group ownership transferred to ' + (newOwner ? newOwner.username : 'someone'));
          }
        }
      }
      return;
    }

    if (packet.type === window.Protocol.Types.REACTION) {
      const { msgId, emoji, action, userId, chatId: payloadChatId, groupId } = packet.payload;
      // Defensive: trust groupId for group reactions, otherwise fall back to packet.from (DM sender)
      const chatId = groupId || payloadChatId || packet.to || packet.from;
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
    if (packet.type === window.Protocol.Types.TYPING) {
      return;
    }

    // Basic message handling logic
    if (packet.type === window.Protocol.Types.MESSAGE) {
      if (window._p2pRecvCount !== undefined) window._p2pRecvCount++;
      const fromId = packet.payload.chatId || packet.payload.groupId || packet.from;
      var text = packet.payload.text || (typeof packet.payload === 'string' ? packet.payload : '');

      // Decrypt E2EE messages
      if (packet.payload.e2ee && this.state.settings.e2eeEnabled) {
        var decrypted = this.e2eeDecryptMessage(text, packet.from);
        if (decrypted) text = decrypted;
      }

      this.addMessage(fromId, {
        id: packet.payload.msgId || packet.packetId || Date.now(),
        sender: packet.from,
        text: text,
        timestamp: packet.timestamp || new Date().toISOString(),
        replyTo: packet.payload.replyTo,
        attachments: packet.payload.attachments
      });

      // Auto-reopen DM if it was closed
      if (this.state.closedDMs && this.state.closedDMs[fromId]) {
        const uid = this.state.currentUser && this.state.currentUser.userId;
        var closedDMs = this._loadUserClosedDMs(uid);
        delete closedDMs[fromId];
        this._saveUserClosedDMs(uid, closedDMs);
        this.setState({ closedDMs });
      }

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
          const friend = this.state.friends.find(f => f.userId === packet.from);
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
             window.orbitAPI.showNotification('New message from ' + title, preview, senderAvatar);
           }
        } else if (window.Toast) {
           window.Toast.show(title, preview, senderAvatar);
        }
      }
    } else if (packet.type === window.Protocol.Types.SYSTEM) {
      // Handle edit/delete sync
      const payload = packet.payload;
      if (payload && payload.action === 'delete' && payload.msgId) {
        this.deleteMessage(payload.chatId || packet.from, payload.msgId);
      }
    } else if (packet.type === window.Protocol.Types.PIN_MESSAGE) {
      const { msgId, groupId } = packet.payload;
      this.pinMessage(groupId || packet.from, msgId);
      return;
    } else if (packet.type === window.Protocol.Types.UNPIN_MESSAGE) {
      const { msgId, groupId } = packet.payload;
      this.unpinMessage(groupId || packet.from, msgId);
      return;
    } else if (packet.type === window.Protocol.Types.MESSAGE_EDIT) {
      const { msgId, newText, chatId } = packet.payload;
      this.editMessage(chatId || packet.from, msgId, newText);
    } else if (packet.type === window.Protocol.Types.MESSAGE_DELETE) {
      const { msgId, chatId } = packet.payload;
      this.deleteMessage(chatId || packet.from, msgId);
    } else if (packet.type === window.Protocol.Types.READ) {
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
    // Check all group members (for non-friend group members)
    for (var gi = 0; gi < state.groups.length; gi++) {
      var gMembers = state.groups[gi].members || [];
      for (var mj = 0; mj < gMembers.length; mj++) {
        if (gMembers[mj].userId === peerId && gMembers[mj].publicKey) return gMembers[mj].publicKey;
      }
    }
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
    const MAX_MSGS = 500;
    const msgs = { ...this.state.messages };
    if (!msgs[chatId]) msgs[chatId] = [];
    if (messageObj.id && msgs[chatId].some(function(m) { return m.id === messageObj.id; })) return;
    msgs[chatId] = [...msgs[chatId], messageObj];
    if (msgs[chatId].length > MAX_MSGS) msgs[chatId] = msgs[chatId].slice(-MAX_MSGS);

    if (window.orbitAPI) {
      window.orbitAPI.dbAddMessage(chatId, messageObj);
      this.trackChatForCurrentUser(chatId);
    }

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
          if (m.userId !== state.currentUser.userId) {
            window.orbitAPI.networkSend(m.userId, m.ip || '', window.Protocol.Types.REACTION, { msgId, emoji, action, userId: state.currentUser.userId, groupId: chatId });
          }
        });
      } else {
        const friend = state.friends.find(f => f.userId === chatId);
        if (friend) {
          // DM reaction: NO chatId in payload (would overwrite receiver's chat lookup)
          window.orbitAPI.networkSend(chatId, friend.ip || '', window.Protocol.Types.REACTION, { msgId, emoji, action, userId: state.currentUser.userId });
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
        if (m.userId !== state.currentUser.userId) {
          recipients.push({ userId: m.userId, ip: m.ip || '' });
        }
      });
    } else {
      var friend = state.friends.find(function(f) { return f.userId === chatId; });
      if (friend) {
        recipients.push({ userId: friend.userId, ip: friend.ip || '' });
      }
    }
    recipients.forEach(function(r) {
      if (window.orbitAPI) {
        window.orbitAPI.networkSend(r.userId, r.ip, window.Protocol.Types.PIN_MESSAGE, { msgId: msgId, groupId: chatId });
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
        if (m.userId !== state.currentUser.userId) {
          recipients.push({ userId: m.userId, ip: m.ip || '' });
        }
      });
    } else {
      var friend = state.friends.find(function(f) { return f.userId === chatId; });
      if (friend) {
        recipients.push({ userId: friend.userId, ip: friend.ip || '' });
      }
    }
    recipients.forEach(function(r) {
      if (window.orbitAPI) {
        window.orbitAPI.networkSend(r.userId, r.ip, window.Protocol.Types.UNPIN_MESSAGE, { msgId: msgId, groupId: chatId });
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

    // Groups are persisted individually by each mutating method (addGroup, addMemberToGroup, etc.)
    // No bulk save needed here to avoid data corruption from partial groups arrays.

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

    this.notify(newState);
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
        if (m.userId !== state.currentUser.userId) {
          window.orbitAPI.networkSend(m.userId, m.ip || '', window.Protocol.Types.READ, { chatId, lastReadMsgId: lastId });
        }
      });
    } else {
      const friend = state.friends.find(f => f.userId === chatId);
      if (friend) {
        window.orbitAPI.networkSend(chatId, friend.ip || '', window.Protocol.Types.READ, { chatId, lastReadMsgId: lastId });
      }
    }
  }

  blockUser(userId) {
    var blockedUsers = this.state.blockedUsers || [];
    if (blockedUsers.indexOf(userId) !== -1) return;
    blockedUsers = blockedUsers.concat([userId]);
    this.setState({ blockedUsers });
    if (window.Storage) window.Storage.set('blockedUsers', blockedUsers);
    if (window.Toast) window.Toast.show('User Blocked', 'Messages from this user will be ignored');
  }

  unblockUser(userId) {
    var blockedUsers = (this.state.blockedUsers || []).filter(function(id) { return id !== userId; });
    this.setState({ blockedUsers });
    if (window.Storage) window.Storage.set('blockedUsers', blockedUsers);
    if (window.Toast) window.Toast.show('User Unblocked', 'Messages from this user will now be received');
  }

  isUserBlocked(userId) {
    return (this.state.blockedUsers || []).indexOf(userId) !== -1;
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify(changedState) {
    this.listeners.forEach(listener => listener(this.state, changedState));
  }
}

// Global singleton store
window.store = new Store();

// Backfill avatarDataUrl for existing groups that only have file-based avatarPath
setTimeout(function() {
  var s = window.store ? window.store.getState() : null;
  if (!s || !s.groups) return;
  s.groups.forEach(function(g) {
    if (g.avatarPath && !g.avatarDataUrl && g.groupId) {
      fetch('orbit-avatar://' + g.groupId + '?t=' + (g.avatarUpdatedAt || 0))
        .then(function(r) { return r.blob(); })
        .then(function(blob) {
          return new Promise(function(resolve) {
            var reader = new FileReader();
            reader.onload = function() { resolve(reader.result); };
            reader.readAsDataURL(blob);
          });
        })
        .then(function(dataUrl) {
          window.store.updateGroupField(g.groupId, 'avatarDataUrl', dataUrl);
        })
        .catch(function() {});
    }
  });
}, 100);
