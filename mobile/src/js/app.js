// mobile/src/js/app.js
// Orbit Mobile — Main App Controller

/* ---- Data Store ---- */
var MStore = {
  get(key, fallback) {
    try { var d = JSON.parse(localStorage.getItem('orbit_' + key)); return d !== null ? d : fallback; }
    catch(e) { return fallback; }
  },
  set(key, val) { localStorage.setItem('orbit_' + key, JSON.stringify(val)); },

  friends: [],
  chats: [],
  groups: [],
  messages: {},
  user: null,
  settings: {
    theme: 'dark',
    enterToSend: true,
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
    experimentalMessageTranslate: false,
    experimentalCompactSpacing: false,
    enableCustomColors: false,
    notifyPreview: true,
    notifySound: true,
    notifyDnd: false,
    notifyGroupMentions: false,
    deleteAttachmentsAfter: 0,
    networkMode: 'LAN Auto-Discovery',
    udpPort: 45678,
    tcpPort: 46000,
    maxFileSize: 500,
    fontSize: 'Medium',
    messageAnim: 'slide',
    netAutoReconnect: true,
    netTimeout: 30
  },

  load() {
    this.friends = this.get('friends', []);
    this.chats = this.get('chats', []);
    this.groups = this.get('groups', []);
    this.messages = this.get('messages', {});
    this.settings = Object.assign(this.settings, this.get('settings', {}));
    this.user = this.get('user', null);
    this._migrateGroups(); // must be after user is loaded

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

    // Ensure echo bot exists and update avatar
    var echoFriend = this.friends.find(function(f) { return f.id === 'echo'; });
    if (!echoFriend) {
      this.friends.unshift({
        id: 'echo',
        name: 'Orbit Echo',
        tag: 'BOT',
        status: 'online',
        avatar: 'icons/app/orbit_1024.png',
        bio: 'Local echo channel for testing'
      });
    } else {
      echoFriend.avatar = 'icons/app/orbit_1024.png';
    }
    // Ensure echo chat exists and update avatar
    var echoChat = this.chats.find(function(c) { return c.id === 'echo'; });
    if (!echoChat) {
      this.chats.unshift({
        id: 'echo',
        name: 'Orbit Echo',
        avatar: 'icons/app/orbit_1024.png',
        lastMessage: '',
        lastTime: '',
        unread: 0
      });
    } else {
      echoChat.avatar = 'icons/app/orbit_1024.png';
    }
    // Add default messages for echo
    if (!this.messages['echo'] || this.messages['echo'].length === 0) {
      this.messages['echo'] = [
        { id: 'e1', from: 'echo', text: 'Welcome to Orbit Mobile!', time: new Date().toISOString() },
        { id: 'e2', from: 'echo', text: 'Send a message and I will echo it back.', time: new Date().toISOString() }
      ];
    }
    this.save();
  },

  save() {
    this.set('friends', this.friends);
    this.set('chats', this.chats);
    this.set('groups', this.groups);
    this.set('messages', this.messages);
    this.set('settings', this.settings);
    this.set('user', this.user);
  },

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
      // Upgrade members from string[] to object[] with roles
      if (g.members && g.members.length > 0 && typeof g.members[0] === 'string') {
        g.members = g.members.map(function(id) {
          return { userId: id, role: 'member', joinedAt: g.createdAt || new Date().toISOString() };
        });
        // Ensure owner has owner role
        var ownerEntry = g.members.find(function(m) { return m.userId === g.ownerId; });
        if (ownerEntry) ownerEntry.role = 'owner';
        changed = true;
      }
    });
    if (changed) this.save();
  },

  getChats() {
    var self = this;
    return this.chats.map(function(c) {
      var msgs = self.messages[c.id] || [];
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
  },

  addMessage(chatId, msg) {
    if (!this.messages[chatId]) this.messages[chatId] = [];
    this.messages[chatId].push(msg);
    var chat = this.chats.find(function(c) { return c.id === chatId; });
    if (chat) {
      chat.lastMessage = msg.text;
      chat.lastTime = msg.time;
    }
    this.save();
  },

  sendMessage(chatId, text) {
    var msg = {
      id: 'm' + Date.now() + Math.random().toString(36).slice(2, 6),
      from: 'me',
      text: text,
      time: new Date().toISOString()
    };
    this.addMessage(chatId, msg);
    return msg;
  },

  editMessage(chatId, msgId, newText) {
    var msgs = this.messages[chatId];
    if (!msgs) return;
    for (var i = 0; i < msgs.length; i++) {
      if (msgs[i].id === msgId) {
        msgs[i].text = newText;
        msgs[i].edited = true;
        break;
      }
    }
    this.save();
  },

  deleteMessage(chatId, msgId) {
    var msgs = this.messages[chatId];
    if (!msgs) return;
    this.messages[chatId] = msgs.filter(function(m) { return m.id !== msgId; });
    this.save();
  }
};

/* ---- Message Action State ---- */
var editingMsg = null;
var replyingTo = null;

/* ---- Mobile App ---- */
document.addEventListener('DOMContentLoaded', function() {
  // Init env
  if (!window.Orbit) window.Orbit = {};
  if (!window.Orbit.env) {
    window.Orbit.env = {
      isElectron: false,
      isAndroid: true,
      isMobile: true,
      isTouchDevice: true,
      platform: 'android'
    };
  }

  MStore.load();

  var activeChatId = null;

  /* -- Navigation -- */
  var TAB_ORDER = ['chats', 'friends', 'activity', 'settings'];
  var _currentTabIndex = 0;
  var navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var view = this.getAttribute('data-view');
      var newIndex = TAB_ORDER.indexOf(view);
      if (newIndex === _currentTabIndex) return;

      navBtns.forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      var panels = document.querySelectorAll('.mobile-panel');
      panels.forEach(function(p) {
        p.classList.remove('active', 'panel-slide-right', 'panel-slide-left');
      });
      var target = document.getElementById('panel-' + view);
      if (target) {
        target.classList.add(newIndex > _currentTabIndex ? 'panel-slide-right' : 'panel-slide-left');
        target.classList.add('active');
      }
      _currentTabIndex = newIndex;
    });
  });

  /* -- Search -- */
  var searchFilter = '';
  var chatSearchFilter = '';

  /* -- Render Chat List -- */
  function renderChatList() {
    var container = document.getElementById('chat-list');
    var chats = MStore.getChats();
    var filtered = chats;

    if (searchFilter) {
      var lower = searchFilter.toLowerCase();
      filtered = chats.filter(function(c) {
        return c.name.toLowerCase().indexOf(lower) !== -1;
      });
    }

    if (filtered.length === 0) {
      container.innerHTML =
        '<div class="empty-state"><i data-lucide="message-square"></i>' +
        '<div class="empty-state-text">' + (searchFilter ? 'No matching chats' : 'No conversations yet') + '</div>' +
        '<div class="empty-state-sub">' + (searchFilter ? 'Try a different search' : 'Start a new chat from the Friends tab') + '</div></div>';
      renderLucide({ root: container });
      return;
    }

    // Split into Direct Messages and Groups
    var groupIds = {};
    MStore.groups.forEach(function(g) { groupIds[g.id] = g; });
    var dms = [];
    var grpChats = [];
    filtered.forEach(function(c) {
      if (groupIds[c.id]) {
        grpChats.push(c);
      } else {
        dms.push(c);
      }
    });

    function renderChatRow(c, isGroup) {
      var timeStr = c.lastTime ? formatTime(c.lastTime) : '';
      var avatarHtml = '';
      var statusDot = '';
      if (MStore.settings.showChatAvatars !== false) {
        var initial = c.name ? c.name.charAt(0).toUpperCase() : '?';
        avatarHtml = c.avatar
          ? '<img src="' + escapeHtml(c.avatar) + '" alt="">'
          : initial;
        if (isGroup) {
          var group = groupIds[c.id];
          var memberCount = group && group.members ? group.members.length : 0;
          statusDot = '<span style="font-size:11px;color:var(--text-muted);margin-left:auto;">' + memberCount + ' members</span>';
        } else {
          var statusClass = c.status && c.status !== 'offline' ? c.status : '';
          statusDot = statusClass ? '<div class="chat-row-status-dot ' + statusClass + '"></div>' : '';
        }
      }
      return '<div class="chat-row" data-chat="' + c.id + '">' +
        (MStore.settings.showChatAvatars !== false
          ? '<div class="chat-row-avatar-wrapper">' +
            '<div class="chat-row-avatar"' + (isGroup ? ' style="border-radius:12px;"' : '') + '>' + avatarHtml + '</div>' +
            statusDot +
          '</div>'
          : '') +
        '<div class="chat-row-info">' +
          '<div class="chat-row-name">' + escapeHtml(c.name) + '</div>' +
          '<div class="chat-row-preview">' + escapeHtml(c.lastMessage || 'No messages yet') + '</div>' +
        '</div>' +
        '<div class="chat-row-meta">' +
          '<div class="chat-row-time">' + timeStr + '</div>' +
          (c.unread > 0 ? '<div class="chat-row-badge">' + c.unread + '</div>' : '') +
        '</div>' +
      '</div>';
    }

    var html = '';

    // Direct Messages section
    if (dms.length > 0) {
      html += '<div class="chat-section-header"><i data-lucide="message-circle" style="width:14px;height:14px;"></i> Direct Messages</div>';
      dms.forEach(function(c) { html += renderChatRow(c, false); });
    }

    // Groups section
    if (grpChats.length > 0) {
      html += '<div class="chat-section-header"><i data-lucide="users" style="width:14px;height:14px;"></i> Groups</div>';
      grpChats.forEach(function(c) { html += renderChatRow(c, true); });
    }

    // Create Group button
    html += '<div class="create-group-btn" id="btn-create-group"><i data-lucide="plus-circle" style="width:16px;height:16px;"></i> Create Group</div>';

    container.innerHTML = html;
    renderLucide({ root: container });

    container.querySelectorAll('.chat-row').forEach(function(row) {
      row.addEventListener('click', function() {
        openChat(this.getAttribute('data-chat'));
      });
    });

    var createBtn = document.getElementById('btn-create-group');
    if (createBtn) {
      createBtn.addEventListener('click', showCreateGroup);
    }
  }

  /* -- Render Chat View -- */
  function openChat(chatId) {
    activeChatId = chatId;
    editingMsg = null;
    replyingTo = null;
    updateReplyEditBar();
    var chat = MStore.chats.find(function(c) { return c.id === chatId; });
    if (!chat) return;

    // Check if group chat
    var group = MStore.groups.find(function(g) { return g.id === chatId; });

    // Find friend for status
    var friend = MStore.friends.find(function(f) { return f.id === chatId; });
    var statusText = '';
    var statusDot = '';
    if (group) {
      statusText = (group.members ? group.members.length : 0) + ' members';
    } else if (chatId === 'echo') {
      statusText = 'Bot · Online';
    } else if (friend) {
      var statusLabels = { online: 'Online', away: 'Away', busy: 'Busy', offline: 'Offline' };
      statusText = statusLabels[friend.status] || 'Offline';
      statusDot = friend && friend.status
        ? '<span style="width:7px;height:7px;border-radius:50%;background:' + getStatusColor(friend.status) + ';display:inline-block;"></span>'
        : '';
    }

    // Set header
    var headerInfo = document.getElementById('chat-header-info');
    headerInfo.innerHTML =
      '<div style="font-size:15px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(chat.name) + '</div>' +
      '<div style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:4px;">' +
        statusDot + escapeHtml(statusText) +
      '</div>';

    // Show/hide members button for groups
    var galleryBtn = document.getElementById('btn-gallery');
    var moreBtn = document.getElementById('btn-chat-more');
    if (group) {
      galleryBtn.style.display = 'flex';
      // Add members button next to gallery if not exists
      var membersBtn = document.getElementById('btn-chat-members');
      if (!membersBtn) {
        membersBtn = document.createElement('button');
        membersBtn.id = 'btn-chat-members';
        membersBtn.title = 'Members';
        membersBtn.innerHTML = '<i data-lucide="users"></i>';
        galleryBtn.parentNode.insertBefore(membersBtn, moreBtn);
        membersBtn.addEventListener('click', showGroupInfo);
        renderLucide({ root: membersBtn });
      }
      membersBtn.style.display = 'flex';
    } else {
      var membersBtn = document.getElementById('btn-chat-members');
      if (membersBtn) membersBtn.style.display = 'none';
    }

    // Show/hide privacy badge
    var privacyBtn = document.getElementById('btn-privacy-badge');
    if (MStore.settings.privacyMode) {
      privacyBtn.style.display = 'flex';
    } else {
      privacyBtn.style.display = 'none';
    }

    // Hide nav bar, show chat panel
    document.getElementById('mobile-nav').style.display = 'none';
    var panel = document.getElementById('panel-chat');
    panel.classList.add('active', 'open');

    // Highlight active chat in list
    document.querySelectorAll('.chat-row').forEach(function(r) { r.classList.remove('active-chat'); });
    var activeRow = document.querySelector('.chat-row[data-chat="' + chatId + '"]');
    if (activeRow) activeRow.classList.add('active-chat');

    renderMessages(chatId);
  }

  var _groupCreateMode = false;
  var _settingsOverlayOpen = false;
  var _settingsInSection = false;

  function showCreateGroup() {
    var modalTitle = document.querySelector('#modal-overlay .modal-header h3');
    var modalInput = document.getElementById('modal-input');
    var modalAvatarInput = document.getElementById('modal-avatar-input');
    var modalConfirm = document.getElementById('btn-modal-confirm');
    var modalCancel = document.getElementById('btn-modal-cancel');
    var modalClose = document.getElementById('btn-close-modal');
    var modalOverlay = document.getElementById('modal-overlay');
    var memberList = document.getElementById('modal-member-list');
    var modalTabs = document.querySelector('.modal-tabs');

    // Hide tabs, show add tab content for group creation
    if (modalTabs) modalTabs.style.display = 'none';
    document.querySelectorAll('.modal-tab-content').forEach(function(c) { c.style.display = 'none'; });
    var addTab = document.getElementById('modal-tab-add');
    if (addTab) addTab.style.display = 'block';

    modalTitle.textContent = 'Create Group';
    modalInput.placeholder = 'Group name...';
    modalInput.value = '';
    modalAvatarInput.value = '';
    modalAvatarInput.style.display = 'block';
    modalConfirm.textContent = 'Create';
    _groupCreateMode = true;

    // Show member selection
    var friends = MStore.friends;
    if (friends.length > 0) {
      var mlHtml = '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">Add members:</div>';
      friends.forEach(function(f) {
        mlHtml += '<label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;">' +
          '<input type="checkbox" class="group-member-cb" value="' + f.id + '" style="width:16px;height:16px;accent-color:var(--accent-primary);">' +
          '<span style="font-size:13px;color:var(--text-primary);">' + escapeHtml(f.name) + '</span>' +
        '</label>';
      });
      memberList.innerHTML = mlHtml;
      memberList.style.display = 'block';
    } else {
      memberList.style.display = 'none';
    }

    modalOverlay.style.display = 'flex';
    modalInput.focus();

    modalConfirm.onclick = function() {
      var name = modalInput.value.trim();
      if (!name) return;

      // Collect checked members
      var selectedMembers = [];
      var cbs = document.querySelectorAll('.group-member-cb:checked');
      cbs.forEach(function(cb) { selectedMembers.push(cb.value); });

      var groupAvatar = modalAvatarInput.value.trim() || null;

      var groupId = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      var codeArr = new Uint8Array(4);
      if (window.crypto) window.crypto.getRandomValues(codeArr);
      var inviteCode = Array.from(codeArr, function(b) { return b.toString(16).padStart(2, '0'); }).join('');
      var memberList = [];
      var myId = MStore.user ? MStore.user.id : '';
      if (myId) memberList.push({ userId: myId, role: 'owner', joinedAt: new Date().toISOString() });
      selectedMembers.forEach(function(id) {
        if (id !== myId) memberList.push({ userId: id, role: 'member', joinedAt: new Date().toISOString() });
      });
      var newGroup = {
        id: groupId, name: name, avatar: groupAvatar,
        description: '',
        inviteCode: inviteCode,
        pinned: false,
        notificationMuted: false,
        pinnedMessages: [],
        ownerId: myId,
        members: memberList,
        createdAt: new Date().toISOString()
      };
      MStore.groups.push(newGroup);
      MStore.chats.push({ id: groupId, name: name, avatar: groupAvatar, lastMessage: '', lastTime: '', unread: 0 });
      MStore.save();

      // Broadcast GROUP_CREATE to each member
      if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
        memberList.forEach(function(m) {
          if (m.userId !== myId) {
            var packet = Orbit.Protocol.createPacket(Orbit.Protocol.Types.GROUP_CREATE, {
              groupId: groupId,
              groupName: name,
              groupAvatar: groupAvatar,
              ownerId: myId,
              members: memberList,
              inviteCode: inviteCode,
              description: ''
            }, myId);
            Orbit.P2P.send(m.userId, packet);
          }
        });
      }

      _finishGroupCreate();
      renderChatList();
      showToast('Group "' + name + '" created' + (selectedMembers.length > 0 ? ' with ' + selectedMembers.length + ' member' + (selectedMembers.length !== 1 ? 's' : '') : ''), 'info');
      openChat(groupId);
    };
  }

  function _finishGroupCreate() {
    resetModalToAddFriend();
    hideModal();
  }

  function closeChat() {
    document.getElementById('panel-chat').classList.remove('open', 'active');
    document.getElementById('mobile-nav').style.display = 'flex';
    activeChatId = null;
    // Clear search bar
    chatSearchFilter = '';
    var csb = document.getElementById('message-search-bar');
    if (csb) csb.style.display = 'none';
    var csi = document.getElementById('chat-search-input');
    if (csi) csi.value = '';
    // Clear all row highlights
    document.querySelectorAll('.chat-row.active-chat').forEach(function(r) { r.classList.remove('active-chat'); });
    document.querySelectorAll('.friend-row.highlighted').forEach(function(r) { r.classList.remove('highlighted'); });
  }

  function getStatusColor(status) {
    var colors = { online: 'var(--accent-success)', away: 'var(--accent-warning)', busy: 'var(--accent-danger)', offline: 'var(--text-muted)' };
    return colors[status] || 'var(--text-muted)';
  }

  /* -- Reply/Edit Bar -- */
  function updateReplyEditBar() {
    var bar = document.getElementById('reply-edit-bar');
    if (!bar) return;
    if (editingMsg) {
      bar.style.display = 'flex';
      bar.style.background = 'rgba(255,170,0,0.1)';
      bar.style.border = '1px solid rgba(255,170,0,0.3)';
      bar.innerHTML =
        '<i data-lucide="pencil" style="width:14px;height:14px;flex-shrink:0;color:#ffaa00;"></i>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Editing message</span>' +
        '<button id="btn-cancel-edit-reply" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px;font-size:16px;">&times;</button>';
      renderLucide({ root: bar });
    } else if (replyingTo) {
      bar.style.display = 'flex';
      bar.style.background = 'var(--bg-hover)';
      bar.style.border = '1px solid var(--border-subtle)';
      var rText = (replyingTo.text || '').substring(0, 80);
      bar.innerHTML =
        '<i data-lucide="reply" style="width:14px;height:14px;flex-shrink:0;"></i>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Replying to <b>' + escapeHtml(replyingTo.senderName || 'message') + '</b>: ' + escapeHtml(rText) + '</span>' +
        '<button id="btn-cancel-edit-reply" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px;font-size:16px;">&times;</button>';
      renderLucide({ root: bar });
    } else {
      bar.style.display = 'none';
    }
  }

  function startReply(msgId) {
    var msgs = MStore.messages[activeChatId] || [];
    var msg = msgs.find(function(m) { return m.id === msgId; });
    if (!msg) return;
    var senderName = 'Unknown';
    if (msg.from === 'me') {
      senderName = MStore.user ? MStore.user.name : 'You';
    } else if (msg.from === 'echo') {
      senderName = 'Orbit Echo';
    } else {
      var friend = MStore.friends.find(function(f) { return f.id === msg.from; });
      senderName = friend ? friend.name : msg.from;
    }
    replyingTo = { id: msg.id, text: msg.text, senderName: senderName };
    editingMsg = null;
    updateReplyEditBar();
    var inp = document.getElementById('chat-input');
    if (inp) inp.focus();
  }

  function startEdit(msgId) {
    var msgs = MStore.messages[activeChatId] || [];
    var msg = msgs.find(function(m) { return m.id === msgId; });
    if (!msg) return;
    editingMsg = { id: msg.id, chatId: activeChatId, text: msg.text };
    replyingTo = null;
    updateReplyEditBar();
    var inp = document.getElementById('chat-input');
    if (inp) {
      inp.value = msg.text;
      inp.focus();
    }
  }

  function cancelReplyEdit() {
    editingMsg = null;
    replyingTo = null;
    updateReplyEditBar();
    var inp = document.getElementById('chat-input');
    if (inp) inp.value = '';
  }

  function confirmDeleteMessage(msgId) {
    if (!confirm('Delete this message? This cannot be undone.')) return;
    MStore.deleteMessage(activeChatId, msgId);
    renderMessages(activeChatId);
    renderChatList();
  }

  function injectMessageParticles(container) {
    if (!container || !MStore.settings.experimentalMessageFx) return;
    var bubbles = container.querySelectorAll('.message-row.mine .message-bubble');
    if (!bubbles.length) return;
    var colors = ['#ffd700','#ff6b6b','#48dbfb','#ff9ff3','#feca57','#a29bfe','#fd79a8','#00cec9'];
    var count = 8 + Math.floor(Math.random() * 5);
    for (var bi = 0; bi < bubbles.length; bi++) {
      for (var i = 0; i < count; i++) {
        var p = document.createElement('div');
        p.className = 'fx-particle';
        var angle = Math.random() * 360;
        var dist = 20 + Math.random() * 50;
        var rad = angle * Math.PI / 180;
        p.style.setProperty('--p-x', (Math.cos(rad) * dist) + 'px');
        p.style.setProperty('--p-y', (Math.sin(rad) * dist) + 'px');
        p.style.setProperty('--p-delay', (Math.random() * 0.12) + 's');
        var sz = 3 + Math.random() * 4;
        p.style.width = sz + 'px';
        p.style.height = sz + 'px';
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        bubbles[bi].appendChild(p);
        setTimeout(function(el) { if (el.parentNode) el.parentNode.removeChild(el); }, 1200, p);
      }
    }
  }

  function renderMessages(chatId) {
    var feed = document.getElementById('message-feed');
    var msgs = MStore.messages[chatId] || [];
    if (chatSearchFilter) {
      var cl = chatSearchFilter.toLowerCase();
      msgs = msgs.filter(function(m) { return (m.text || '').toLowerCase().indexOf(cl) !== -1; });
    }
    if (msgs.length === 0) {
      feed.innerHTML =
        '<div class="empty-state"><i data-lucide="message-circle"></i>' +
        '<div class="empty-state-text">No messages yet</div>' +
        '<div class="empty-state-sub">Send a message to start the conversation</div></div>';
      renderLucide({ root: feed });
      return;
    }
    var isGroup = MStore.groups.some(function(g) { return g.id === chatId; });
    var html = '';
    msgs.forEach(function(m) {
      var isMine = m.from === 'me';
      var senderLabel = '';
      if (isGroup && !isMine) {
        var senderFriend = MStore.friends.find(function(f) { return f.id === m.from; });
        var senderName = senderFriend ? senderFriend.name : (m.fromName || m.from);
        senderLabel = '<div style="font-size:11px;font-weight:600;color:var(--accent-primary);margin-bottom:2px;">' + escapeHtml(senderName) + '</div>';
      }
      // Reply quote
      var replyHtml = '';
      if (m.replyTo) {
        var origMsg = msgs.find(function(o) { return o.id === m.replyTo; });
        if (origMsg) {
          var rpText = (origMsg.text || '').substring(0, 60) + ((origMsg.text || '').length > 60 ? '...' : '');
          var rpUser = origMsg.from === 'me' ? 'You' : 'Unknown';
          if (origMsg.from !== 'me') {
            var rpFriend = MStore.friends.find(function(f) { return f.id === origMsg.from; });
            rpUser = rpFriend ? rpFriend.name : (origMsg.fromName || origMsg.from);
          }
          replyHtml = '<div class="reply-quote" data-reply-msg-id="' + origMsg.id + '">' +
            '<span class="reply-quote-user">' + escapeHtml(rpUser) + '</span> ' + escapeHtml(rpText) +
          '</div>';
        }
      }
      // Action buttons
      var isPinned = isGroup && (MStore.groups.find(function(g) { return g.id === chatId; }) || {}).pinnedMessages;
      var msgPinned = isPinned && isPinned.some(function(p) { return String(p.msgId) === String(m.id); });
      var pinBtn = isGroup
        ? '<button class="msg-action-btn msg-pin-btn" data-msg-id="' + m.id + '" title="' + (msgPinned ? 'Unpin' : 'Pin') + '" style="color:' + (msgPinned ? 'var(--accent-primary)' : '') + ';">' +
          '<i data-lucide="pin" style="width:13px;height:13px;' + (msgPinned ? '' : 'transform:rotate(45deg);') + '"></i></button>'
        : '';
      var actionBtns = pinBtn +
        '<button class="msg-action-btn msg-reply-btn" data-msg-id="' + m.id + '" title="Reply">' +
          '<i data-lucide="reply" style="width:13px;height:13px;"></i></button>' +
        (isMine
          ? '<button class="msg-action-btn msg-edit-btn" data-msg-id="' + m.id + '" title="Edit">' +
            '<i data-lucide="pencil" style="width:13px;height:13px;"></i></button>' +
            '<button class="msg-action-btn msg-delete-btn" data-msg-id="' + m.id + '" title="Delete" style="color:var(--accent-danger);">' +
            '<i data-lucide="trash-2" style="width:13px;height:13px;"></i></button>'
          : '<button class="msg-action-btn msg-delete-btn" data-msg-id="' + m.id + '" title="Delete" style="color:var(--accent-danger);">' +
            '<i data-lucide="trash-2" style="width:13px;height:13px;"></i></button>');
      var actionsHtml = '<div class="msg-actions-bar">' + actionBtns + '</div>';
      // Edited badge
      var editedBadge = m.edited ? '<span style="font-size:10px;color:var(--text-muted);margin-left:4px;">(edited)</span>' : '';
      // Attachments — desktop-style grid
      var attachmentsHtml = '';
      if (m.attachments && m.attachments.length > 0) {
        var gridHtml = '';
        var hasText = m.text && m.text.trim();
        var showImages = MStore.settings.showImagePreviews !== false;
        m.attachments.forEach(function(a) {
          var safeAttId = escapeHtml(String(a.id || ''));
          if (a.type === 'image' && a.url) {
            if (!showImages) return;
            // Limiting to max 4 images in the grid
            gridHtml += '<div class="att-grid-cell" data-open-image="' + safeAttId + '" data-msg-id="' + m.id + '">' +
              '<img src="' + escapeHtml(a.url) + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy">' +
            '</div>';
          } else {
            gridHtml += '<div class="att-grid-cell att-file-cell">' +
              '<i data-lucide="file" style="width:28px;height:28px;margin-bottom:6px;color:var(--text-muted);"></i>' +
              '<div class="att-file-name">' + escapeHtml(String(a.name || 'File')) + '</div>' +
            '</div>';
          }
        });
        attachmentsHtml = '<div class="att-grid" style="margin-bottom:' + (hasText ? '6px' : '0') + '">' + gridHtml + '</div>';
      }
      // Link Preview detection (mobile — basic card without OG fetch)
      var linkPreviewHtml = '';
      if (m.text && MStore.settings.showLinkPreviews !== false) {
        var urlMatch = m.text.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
          var url = urlMatch[1];
          var domain = '';
          try { domain = new URL(url).hostname; } catch(e) { domain = url; }
          linkPreviewHtml = '<div class="link-preview-mob' + (isMine ? ' mine' : '') + '" onclick="window.open(\'' + escapeHtml(url) + '\', \'_blank\')">' +
            '<div class="link-preview-mob-img"><i data-lucide="link-2" style="width:18px;height:18px;"></i></div>' +
            '<div class="link-preview-mob-body">' +
              '<div class="link-preview-mob-title">' + escapeHtml(domain) + '</div>' +
              '<div class="link-preview-mob-url">' + escapeHtml(url) + '</div>' +
            '</div>' +
          '</div>';
        }
      }
      html += '<div class="message-row ' + (isMine ? 'mine' : 'other') + '" data-msg-id="' + m.id + '" data-msg-anim="' + (MStore.settings.messageAnim || 'slide') + '">' +
        '<div class="message-bubble">' +
          actionsHtml +
          senderLabel +
          replyHtml +
          '<div>' + linkifyText(m.text) + editedBadge + '</div>' +
          attachmentsHtml +
          linkPreviewHtml +
          '<div class="message-time">' + formatTime(m.time) + '</div>' +
          (MStore.settings.showMessageIds ? '<div style="font-size:9px;color:var(--text-muted);opacity:0.5;margin-top:2px;">' + m.id + '</div>' : '') +
        '</div>' +
      '</div>';
    });
    feed.innerHTML = html;
    // Bind action buttons
    feed.querySelectorAll('.msg-reply-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); startReply(this.getAttribute('data-msg-id')); });
    });
    feed.querySelectorAll('.msg-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); startEdit(this.getAttribute('data-msg-id')); });
    });
    feed.querySelectorAll('.msg-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); confirmDeleteMessage(this.getAttribute('data-msg-id')); });
    });
    feed.querySelectorAll('.msg-pin-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var msgId = this.getAttribute('data-msg-id');
        if (!msgId || !activeChatId) return;
        var group = MStore.groups.find(function(g) { return g.id === activeChatId; });
        if (!group) return;
        if (!group.pinnedMessages) group.pinnedMessages = [];
        var idx = group.pinnedMessages.findIndex(function(p) { return String(p.msgId) === String(msgId); });
        if (idx >= 0) {
          group.pinnedMessages.splice(idx, 1);
        } else {
          var msgs = MStore.messages[activeChatId] || [];
          var msg = msgs.find(function(m) { return m.id === msgId; });
          group.pinnedMessages.push({
            msgId: msgId,
            text: msg ? (msg.text || '(attachment)').substring(0, 100) : '',
            pinnedBy: MStore.user ? MStore.user.id : '',
            pinnedAt: new Date().toISOString()
          });
        }
        MStore.save();
        renderMessages(activeChatId);
        // Broadcast to group members
        if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
          var pktType = idx >= 0 ? Orbit.Protocol.Types.UNPIN_MESSAGE : Orbit.Protocol.Types.PIN_MESSAGE;
          (group.members || []).forEach(function(m) {
            var mid = typeof m === 'string' ? m : m.userId;
            if (mid !== (MStore.user ? MStore.user.id : '')) {
              var pktPayload = { msgId: msgId, groupId: activeChatId };
              if (pktType === Orbit.Protocol.Types.PIN_MESSAGE && msg) {
                pktPayload.text = (msg.text || '(attachment)').substring(0, 100);
                pktPayload.pinnedAt = new Date().toISOString();
              }
              var pkt = Orbit.Protocol.createPacket(pktType, pktPayload, MStore.user ? MStore.user.id : '');
              Orbit.P2P.send(mid, pkt);
            }
          });
        }
      });
    });
    // Click on reply quote scrolls to target
    feed.querySelectorAll('.reply-quote').forEach(function(el) {
      el.addEventListener('click', function() {
        var targetId = this.getAttribute('data-reply-msg-id');
        if (targetId) {
          var target = feed.querySelector('[data-msg-id="' + targetId.replace(/"/g, '') + '"]');
          // We don't have data-msg-id on rows, scroll to message bubble containing the text
          // Simple approach: highlight and scroll
          feed.querySelectorAll('.message-row').forEach(function(r) { r.style.opacity = '1'; });
          var found = false;
          feed.querySelectorAll('.message-row').forEach(function(r) {
            if (!found) {
              var bubble = r.querySelector('.message-bubble');
              if (bubble && bubble.innerHTML.indexOf(targetId) > -1) {
                r.style.opacity = '0.4';
                r.scrollIntoView({ behavior: 'smooth', block: 'center' });
                found = true;
                setTimeout(function() { r.style.opacity = '1'; }, 2000);
              }
            }
          });
        }
      });
    });
    // Click image to open full-size preview
    feed.querySelectorAll('[data-open-image]').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var msgId = this.getAttribute('data-msg-id');
        var attId = this.getAttribute('data-open-image');
        var msgs = MStore.messages[activeChatId] || [];
        var msg = msgs.find(function(m) { return m.id === msgId; });
        if (msg && msg.attachments) {
          var att = msg.attachments.find(function(a) { return String(a.id) === attId; });
          if (att && att.url) {
            document.getElementById('image-preview-img').src = att.url;
            document.getElementById('image-preview-overlay').classList.add('open');
          }
        }
      });
    });
    feed.scrollTop = feed.scrollHeight;
    renderLucide({ root: feed });
    injectMessageParticles(feed);
  }

  /* -- Send Message -- */
  function sendMessage() {
    var input = document.getElementById('chat-input');
    var text = input.value.trim();
    if (!text || !activeChatId) return;

    if (editingMsg) {
      // Edit existing message
      MStore.editMessage(editingMsg.chatId, editingMsg.id, text);
      editingMsg = null;
      replyingTo = null;
      updateReplyEditBar();
      renderMessages(activeChatId);
      renderChatList();
      input.value = '';
      return;
    }

    // Build attachments array
    var attachments = stagedFiles.length > 0 ? stagedFiles.map(function(s) {
      return {
        id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        type: s.type,
        name: s.name,
        size: s.size,
        url: s.url
      };
    }) : [];

    // Send to local store — merge text + attachments in ONE message like desktop
    var msgId = 'm' + Date.now() + Math.random().toString(36).slice(2, 6);
    var newMsg = {
      id: msgId,
      from: 'me',
      text: text,
      time: new Date().toISOString(),
      attachments: attachments.length > 0 ? attachments : undefined
    };
    if (MStore.user) newMsg.fromName = MStore.user.name;
    if (replyingTo) newMsg.replyTo = replyingTo.id;
    MStore.addMessage(activeChatId, newMsg);
    stagedFiles = [];
    renderFilePreview();

    renderMessages(activeChatId);
    renderChatList();
    input.value = '';
    replyingTo = null;
    updateReplyEditBar();

    // Echo bot
    if (activeChatId === 'echo') {
      setTimeout(function() {
        MStore.addMessage('echo', {
          id: 'm' + Date.now(),
          from: 'echo',
          text: 'Echo: ' + text,
          time: new Date().toISOString()
        });
        renderMessages('echo');
        renderChatList();
      }, 500);
      return;
    }

    // Send over P2P if connected
    function _broadcastToGroupMembers(groupId, textToSend, isE2EE) {
      var grp = MStore.groups.find(function(g) { return g.id === groupId; });
      if (!grp) return;
      (grp.members || []).forEach(function(m) {
        var memberId = typeof m === 'string' ? m : m.userId;
        if (memberId === (MStore.user ? MStore.user.id : '')) return; // skip self
        var memberFriend = MStore.friends.find(function(f) { return f.id === memberId; });
        if (isE2EE && memberFriend && memberFriend.publicKey) {
          Orbit.E2EE.encrypt(textToSend, memberFriend.publicKey).then(function(encrypted) {
            if (encrypted) {
              var e2eePkt = Orbit.Protocol.createPacket(
                Orbit.Protocol.Types.MESSAGE,
                { e2ee: true, ciphertext: encrypted.ciphertext, nonce: encrypted.nonce, groupId: groupId },
                MStore.user.id
              );
              Orbit.P2P.send(memberId, e2eePkt);
              if (MStore.settings.logNetworkPackets) console.log('[NET] P2P send (e2ee group) ->', memberId, e2eePkt);
            }
          });
        } else if (!isE2EE) {
          var pkt = Orbit.Protocol.createPacket(
            Orbit.Protocol.Types.MESSAGE,
            { text: textToSend, groupId: groupId },
            MStore.user ? MStore.user.id : 'mobile'
          );
          Orbit.P2P.send(memberId, pkt);
          if (MStore.settings.logNetworkPackets) console.log('[NET] P2P send (group) ->', memberId, pkt);
        }
      });
    }

    if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
      var isGroup = MStore.groups.some(function(g) { return g.id === activeChatId; });
      var myId = MStore.user ? MStore.user.id : 'mobile';

      // Group message — broadcast to all members
      if (isGroup) {
        var useE2EE = MStore.settings.e2eeEnabled && window.Orbit.E2EE;
        _broadcastToGroupMembers(activeChatId, text, useE2EE);
        return;
      }

      // DM — send directly
      if (MStore.settings.e2eeEnabled && window.Orbit.E2EE) {
        var friend = MStore.friends.find(function(f) { return f.id === activeChatId; });
        if (friend && friend.publicKey) {
          Orbit.E2EE.encrypt(text, friend.publicKey).then(function(encrypted) {
            if (encrypted) {
              var e2eePacket = Orbit.Protocol.createPacket(
                Orbit.Protocol.Types.MESSAGE,
                { e2ee: true, ciphertext: encrypted.ciphertext, nonce: encrypted.nonce },
                myId
              );
              Orbit.P2P.send(activeChatId, e2eePacket);
              if (MStore.settings.logNetworkPackets) console.log('[NET] P2P send (e2ee dm) ->', activeChatId, e2eePacket);
            }
          });
          return;
        }
      }

      var packet = Orbit.Protocol.createPacket(
        Orbit.Protocol.Types.MESSAGE,
        { text: text },
        myId
      );
      Orbit.P2P.send(activeChatId, packet);
      if (MStore.settings.logNetworkPackets) console.log('[NET] P2P send ->', activeChatId, packet);
    }
  }

  /* -- Emoji Picker -- */
  var emojiPickerOpen = false;

  function initEmojiPicker() {
    var container = document.getElementById('emoji-picker-container');
    if (!container) return;
    var picker = document.createElement('emoji-picker');
    picker.addEventListener('emoji-click', function(e) {
      var input = document.getElementById('chat-input');
      if (input) {
        var start = input.selectionStart || input.value.length;
        input.value = input.value.slice(0, start) + e.detail.unicode + input.value.slice(start);
        input.focus();
        var pos = start + e.detail.unicode.length;
        input.setSelectionRange(pos, pos);
      }
    });
    container.appendChild(picker);
  }

  function toggleEmojiPicker() {
    var container = document.getElementById('emoji-picker-container');
    if (!container) return;
    if (emojiPickerOpen) {
      container.style.display = 'none';
      emojiPickerOpen = false;
    } else {
      var theme = document.documentElement.getAttribute('data-theme') || 'dark';
      var picker = container.querySelector('emoji-picker');
      if (picker) {
        picker.classList.remove('light', 'dark');
        picker.classList.add(theme);
      }
      container.style.display = 'block';
      emojiPickerOpen = true;
    }
  }

  /* -- File Upload -- */
  var stagedFiles = [];

  function handleFileInput(e) {
    if (!e.target.files || e.target.files.length === 0) return;
    var total = e.target.files.length;
    var done = 0;
    var maxBytes = (parseInt(MStore.settings.maxFileSize, 10) || 500) * 1024 * 1024;
    for (var i = 0; i < total; i++) {
      (function(file) {
        if (file.size > maxBytes) {
          showToast('File too large: ' + file.name + ' (max ' + (maxBytes / 1024 / 1024) + 'MB)', 'warning');
          done++;
          if (done === total) renderFilePreview();
          return;
        }
        var isImage = file.type.startsWith('image/');
        if (isImage) {
          var reader = new FileReader();
          reader.onload = function(ev) {
            stagedFiles.push({
              name: file.name,
              size: file.size,
              type: 'image',
              url: ev.target.result
            });
            done++;
            if (done === total) renderFilePreview();
          };
          reader.readAsDataURL(file);
        } else {
          stagedFiles.push({
            name: file.name,
            size: file.size,
            type: 'file',
            url: null
          });
          done++;
          if (done === total) renderFilePreview();
        }
      })(e.target.files[i]);
    }
    e.target.value = '';
  }

  function renderFilePreview() {
    var area = document.getElementById('file-preview-area');
    if (!area) return;
    if (stagedFiles.length === 0) {
      area.style.display = 'none';
      return;
    }
    area.style.display = 'flex';
    var html = '';
    stagedFiles.forEach(function(s, i) {
      if (s.type === 'image' && s.url) {
        html += '<div class="file-preview-item">' +
          '<img src="' + s.url + '" loading="lazy">' +
          '<button class="file-preview-remove" data-index="' + i + '">&times;</button></div>';
      } else {
        html += '<div class="file-preview-item">' +
          '<div class="file-icon"><i data-lucide="file"></i></div>' +
          '<button class="file-preview-remove" data-index="' + i + '">&times;</button></div>';
      }
    });
    area.innerHTML = html;
    renderLucide(area);

    area.querySelectorAll('.file-preview-remove').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var idx = parseInt(this.getAttribute('data-index'), 10);
        stagedFiles.splice(idx, 1);
        renderFilePreview();
      });
    });
  }

  /* -- DB Migration -- */
  function migrateOldData() {
    if (localStorage.getItem('orbit_migrated_v2')) return;

    // Check for old non-prefixed keys
    var oldKeys = ['friends', 'chats', 'messages', 'settings'];
    var migrated = false;
    oldKeys.forEach(function(key) {
      var val = localStorage.getItem(key);
      if (val) {
        try {
          JSON.parse(val);
          // Only migrate if we don't already have data
          var existing = localStorage.getItem('orbit_' + key);
          if (!existing || existing === 'null') {
            localStorage.setItem('orbit_' + key, val);
            localStorage.removeItem(key);
            migrated = true;
          }
        } catch(e) {}
      }
    });

    // Migrate old user data
    var oldUser = localStorage.getItem('user');
    if (oldUser) {
      try {
        JSON.parse(oldUser);
        var existingUser = localStorage.getItem('orbit_user');
        if (!existingUser || existingUser === 'null') {
          localStorage.setItem('orbit_user', oldUser);
          localStorage.removeItem('user');
          migrated = true;
        }
      } catch(e) {}
    }

    if (migrated) {
      console.log('[Orbit] Migrated old localStorage data');
    }
    localStorage.setItem('orbit_migrated_v2', 'true');
  }

  /* -- Friends -- */
  var friendsSearchFilter = '';
  var activitySearchFilter = '';

  function renderFriends() {
    var container = document.getElementById('friends-list');
    var friends = MStore.friends;
    var filtered = friends;

    if (friendsSearchFilter) {
      var lower = friendsSearchFilter.toLowerCase();
      filtered = friends.filter(function(f) {
        return f.name.toLowerCase().indexOf(lower) !== -1;
      });
    }

    if (filtered.length === 0) {
      container.innerHTML =
        '<div class="empty-state"><i data-lucide="users"></i>' +
        '<div class="empty-state-text">' + (friendsSearchFilter ? 'No matching friends' : 'No friends yet') + '</div>' +
        '<div class="empty-state-sub">' + (friendsSearchFilter ? 'Try a different search' : 'Friends will appear here when discovered on your network') + '</div></div>';
      renderLucide({ root: container });
      return;
    }
    var statusColors = { online: 'var(--accent-success)', away: 'var(--accent-warning)', busy: 'var(--accent-danger)', offline: 'var(--text-muted)' };
    var html = '';
    filtered.forEach(function(f) {
      var color = statusColors[f.status] || 'var(--text-muted)';
      var initial = f.name ? f.name.charAt(0).toUpperCase() : '?';
      html += '<div class="friend-row" data-friend="' + f.id + '">' +
        '<div class="chat-row-avatar-wrapper" style="width:44px;height:44px;">' +
          '<div class="chat-row-avatar" style="width:44px;height:44px;font-size:16px;">' + (f.avatar ? '<img src="' + escapeHtml(f.avatar) + '">' : initial) + '</div>' +
          '<div class="friend-status-dot" style="background:' + color + ';position:absolute;bottom:0;right:0;width:12px;height:12px;border-radius:50%;border:2px solid var(--bg-base);"></div>' +
        '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:15px;font-weight:600;color:var(--text-primary);">' + escapeHtml(f.name) + '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:4px;">' +
            '<span style="width:8px;height:8px;border-radius:50%;background:' + color + ';display:inline-block;"></span>' +
            (f.status || 'offline') +
          '</div>' +
        '</div>' +
      '</div>';
    });
    container.innerHTML = html;
    renderLucide({ root: container });
  }

  /* -- Settings -- */
  /* ─── Nav & panel header avatar ─── */
  function updateNavAvatar() {
    var u = MStore.user;
    var initial = u && u.name ? u.name.charAt(0).toUpperCase() : '?';

    var navEl = document.getElementById('nav-user-avatar');
    if (navEl) {
      navEl.innerHTML = u && u.avatar ? '<img src="' + escapeHtml(u.avatar) + '" alt="">' : initial;
    }

    var headerEl = document.getElementById('panel-header-avatar');
    if (headerEl) {
      headerEl.innerHTML = u && u.avatar ? '<img src="' + escapeHtml(u.avatar) + '" alt="">' : initial;
    }
  }

  /* ─── Settings Panel (simplified main view) ─── */
  function renderSettings() {
    updateNavAvatar();
    var container = document.getElementById('settings-content');
    var u = MStore.user;
    var initial = u && u.name ? u.name.charAt(0).toUpperCase() : '?';

    container.innerHTML =
      '<div class="settings-profile-card" id="settings-profile-card">' +
        '<div class="settings-profile-avatar">' + (u && u.avatar ? '<img src="' + escapeHtml(u.avatar) + '">' : initial) + '</div>' +
        '<div class="settings-profile-info">' +
          '<div class="settings-profile-name">' + escapeHtml(u ? u.name : 'User') + '</div>' +
          '<div class="settings-profile-tag">#' + escapeHtml(u ? u.tag : '0000') + '</div>' +
        '</div>' +
        '<i data-lucide="chevron-right" class="settings-profile-arrow"></i>' +
      '</div>' +
      '<div class="settings-link-card" id="open-settings-overlay">' +
        '<i data-lucide="settings" class="settings-link-icon"></i>' +
        '<span class="settings-link-text">All Settings</span>' +
        '<i data-lucide="chevron-right" class="settings-link-arrow"></i>' +
      '</div>';

    document.getElementById('settings-profile-card').addEventListener('click', showProfile);
    document.getElementById('open-settings-overlay').addEventListener('click', showSettingsOverlay);
    renderLucide({ root: container });
  }

  /* ─── Settings Overlay ─── */
  var SETTINGS_SECTIONS = [
    { key: 'appearance', icon: 'palette', title: 'Appearance', desc: 'Theme, message bubbles, 24-hour time' },
    { key: 'chat', icon: 'message-square', title: 'Chat', desc: 'Enter to send, avatars, image previews' },
    { key: 'notifications', icon: 'bell', title: 'Notifications', desc: 'Sounds, DND, @mentions' },
    { key: 'privacy', icon: 'shield', title: 'Privacy & Security', desc: 'Encryption, auto-delete' },
    { key: 'network', icon: 'wifi', title: 'Network', desc: 'Ports, file size, add friend' },
    { key: 'about', icon: 'info', title: 'About', desc: 'Version, statistics' },
    { key: 'advanced', icon: 'terminal', title: 'Advanced', desc: 'Developer tools, experimental features' }
  ];

  function showSettingsOverlay() {
    var overlay = document.getElementById('panel-settings-overlay');
    var backdrop = document.getElementById('settings-overlay-backdrop');
    overlay.classList.add('open');
    backdrop.style.display = 'block';
    document.getElementById('mobile-nav').classList.add('nav-hidden');
    _settingsOverlayOpen = true;
    _settingsInSection = false;
    renderSettingsOverview();
  }

  function hideSettingsOverlay() {
    var overlay = document.getElementById('panel-settings-overlay');
    var backdrop = document.getElementById('settings-overlay-backdrop');
    overlay.classList.remove('open');
    backdrop.style.display = 'none';
    document.getElementById('mobile-nav').classList.remove('nav-hidden');
    _settingsOverlayOpen = false;
    _settingsInSection = false;
  }

  function renderSettingsOverview() {
    document.getElementById('btn-settings-back').style.display = 'none';
    document.getElementById('settings-overlay-title').textContent = 'Settings';
    var container = document.getElementById('settings-overlay-content');
    renderSettingsOverviewInner(container, false);
  }

  function showSettingsSection(key) {
    var section = SETTINGS_SECTIONS.find(function(s) { return s.key === key; });
    if (!section) return;

    _settingsInSection = true;
    document.getElementById('btn-settings-back').style.display = '';
    document.getElementById('settings-overlay-title').textContent = section.title;

    var container = document.getElementById('settings-overlay-content');
    var s = MStore.settings;
    var html = renderSectionHtml(key, s);
    container.innerHTML = html;
    container.classList.remove('settings-slide-left');
    container.classList.add('settings-slide-right');
    bindSectionEvents(key, s);
    renderLucide({ root: container });
  }

  function backSettingsOverview() {
    _settingsInSection = false;
    document.getElementById('btn-settings-back').style.display = 'none';
    document.getElementById('settings-overlay-title').textContent = 'Settings';
    var container = document.getElementById('settings-overlay-content');
    renderSettingsOverviewInner(container, true);
  }

  function renderSettingsOverviewInner(container, animate) {
    var html = '';
    SETTINGS_SECTIONS.forEach(function(sec) {
      html +=
        '<div class="settings-section-item" data-section="' + sec.key + '">' +
          '<i data-lucide="' + sec.icon + '" class="settings-section-icon"></i>' +
          '<div class="settings-section-info">' +
            '<div class="settings-section-title">' + sec.title + '</div>' +
            '<div class="settings-section-desc">' + sec.desc + '</div>' +
          '</div>' +
          '<i data-lucide="chevron-right" class="settings-section-arrow"></i>' +
        '</div>';
    });
    container.innerHTML = html;
    if (animate) {
      container.classList.remove('settings-slide-right');
      container.classList.add('settings-slide-left');
    }

    container.querySelectorAll('.settings-section-item').forEach(function(el) {
      el.addEventListener('click', function() {
        showSettingsSection(this.getAttribute('data-section'));
      });
    });

    renderLucide({ root: container });
  }

  function renderSectionHtml(key, s) {
    function sel(name, id, current) {
      var h = '<select class="settings-select" id="' + id + '">';
      name.forEach(function(o) {
        h += '<option value="' + o.v + '"' + (o.v === current ? ' selected' : '') + '>' + escapeHtml(o.l) + '</option>';
      });
      return h + '</select>';
    }

    var themeOptions = [
      { v: 'dark', l: 'Dark' }, { v: 'light', l: 'Light' }, { v: 'system', l: 'System' },
      { v: 'dark-purple', l: 'Dark Purple' }, { v: 'midnight', l: 'Midnight' },
      { v: 'sunset', l: 'Sunset' }, { v: 'nord', l: 'Nord' }, { v: 'seasonal', l: 'Seasonal' }
    ];

    switch (key) {
      case 'appearance':
        return '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Theme</span></div>' +
          sel(themeOptions, 'set-theme', s.theme || 'dark') +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Message Bubbles</span></div>' +
          sel([{v:'Modern',l:'Modern'},{v:'Compact',l:'Compact'}], 'set-bubbles', s.messageBubbles || 'Modern') +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">24-Hour Time</span></div>' +
          '<button class="settings-toggle ' + (s.timeFormat24 ? 'on' : '') + '" id="set-24h"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Animations</span></div>' +
          '<button class="settings-toggle ' + (s.animations !== false ? 'on' : '') + '" id="set-animations"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Animation Speed</span></div>' +
          sel([{v:'normal',l:'Normal'},{v:'fast',l:'Fast'},{v:'instant',l:'Instant'}], 'set-anim-speed', s.animSpeed || 'normal') +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Font Size</span></div>' +
          sel([{v:'Small',l:'Small'},{v:'Medium',l:'Medium'},{v:'Large',l:'Large'}], 'set-font-size', s.fontSize || 'Medium') +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Reduce Motion</span><div class="settings-row-desc">Minimize animations for accessibility</div></div>' +
          '<button class="settings-toggle ' + (s.reduceMotion ? 'on' : '') + '" id="set-reduce-motion"></button>' +
        '</div>';
      case 'chat':
        return '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Enter to Send</span></div>' +
          '<button class="settings-toggle ' + (s.enterToSend ? 'on' : '') + '" id="set-enter-send"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Show Avatars</span></div>' +
          '<button class="settings-toggle ' + (s.showChatAvatars !== false ? 'on' : '') + '" id="set-chat-avatars"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Message Animation</span></div>' +
          sel([{v:'slide',l:'Slide'},{v:'fade',l:'Fade'}], 'set-msg-anim', s.messageAnim || 'slide') +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Background Pattern</span><div class="settings-row-desc">Dots or Grid on chat background</div></div>' +
          sel([{v:'None',l:'None'},{v:'Dots',l:'Dots'},{v:'Grid',l:'Grid'}], 'set-pattern', s.bgPattern || 'None') +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Image Previews</span><div class="settings-row-desc">Show inline image previews in chat</div></div>' +
          '<button class="settings-toggle ' + (s.showImagePreviews !== false ? 'on' : '') + '" id="set-image-previews"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Link Previews</span><div class="settings-row-desc">Show rich previews for shared links</div></div>' +
          '<button class="settings-toggle ' + (s.showLinkPreviews !== false ? 'on' : '') + '" id="set-link-previews"></button>' +
        '</div>';
      case 'notifications':
        return '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Message Previews</span></div>' +
          '<button class="settings-toggle ' + (s.notifyPreview !== false ? 'on' : '') + '" id="notify-preview"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Play Sound</span></div>' +
          '<button class="settings-toggle ' + (s.notifySound ? 'on' : '') + '" id="notify-sound"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Do Not Disturb</span></div>' +
          '<button class="settings-toggle ' + (s.notifyDnd ? 'on' : '') + '" id="notify-dnd"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">@Mentions Only</span><div class="settings-row-desc">Only notify when mentioned in groups</div></div>' +
          '<button class="settings-toggle ' + (s.notifyGroupMentions ? 'on' : '') + '" id="notify-mentions"></button>' +
        '</div>';
      case 'privacy':
        return '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Privacy Mode</span><div class="settings-row-desc">Attachments not saved to database</div></div>' +
          '<button class="settings-toggle ' + (s.privacyMode ? 'on' : '') + '" id="set-privacy"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">End-to-End Encryption</span><div class="settings-row-desc">AES-256-GCM for direct messages</div></div>' +
          '<button class="settings-toggle ' + (s.e2eeEnabled ? 'on' : '') + '" id="set-e2ee"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Auto-Delete Attachments</span></div>' +
          sel([
            {v:'0',l:'Never'},{v:'1',l:'1 min'},{v:'5',l:'5 min'},
            {v:'10',l:'10 min'},{v:'25',l:'25 min'},{v:'60',l:'60 min'}
          ], 'set-delete-after', String(s.deleteAttachmentsAfter || 0)) +
        '</div>';
      case 'network':
        return '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Network Mode</span></div>' +
          sel([{v:'LAN Auto-Discovery',l:'LAN Auto-Discovery'},{v:'Custom IP',l:'Custom IP'}], 'net-mode', s.networkMode || 'LAN Auto-Discovery') +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">UDP Discovery Port</span></div>' +
          '<input type="number" class="settings-input" id="net-udp" value="' + (s.udpPort || 45678) + '">' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">TCP Connection Port</span></div>' +
          '<input type="number" class="settings-input" id="net-tcp" value="' + (s.tcpPort || 46000) + '">' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Max File Size</span><div class="settings-row-desc">Megabytes</div></div>' +
          '<input type="number" class="settings-input" id="net-maxsize" value="' + (s.maxFileSize || 500) + '">' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Auto-Reconnect</span><div class="settings-row-desc">Reconnect dropped P2P connections</div></div>' +
          '<button class="settings-toggle ' + (s.netAutoReconnect !== false ? 'on' : '') + '" id="net-autoreconnect"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Connection Timeout</span><div class="settings-row-desc">Seconds</div></div>' +
          sel([{v:'5',l:'5s'},{v:'10',l:'10s'},{v:'30',l:'30s'},{v:'60',l:'60s'}], 'net-timeout', String(s.netTimeout || 30)) +
        '</div>' +
        '<div class="settings-row" id="row-add-friend" style="cursor:pointer;">' +
          '<span class="settings-row-title" style="color:var(--accent-primary);">Add Friend</span>' +
          '<i data-lucide="user-plus" style="width:18px;height:18px;color:var(--accent-primary);flex-shrink:0;"></i>' +
        '</div>';
      case 'about':
        var friendsCount = MStore.friends.length;
        var chatsCount = MStore.chats.length;
        return '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Orbit Mobile</span><div class="settings-row-desc">v0.0.9.1-beta · Capacitor Android</div></div>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Statistics</span><div class="settings-row-desc">' + friendsCount + ' friends · ' + chatsCount + ' chats</div></div>' +
        '</div>';
      case 'advanced':
        return '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Developer Mode</span></div>' +
          '<button class="settings-toggle ' + (s.devMode ? 'on' : '') + '" id="set-dev-mode"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Debug Display</span></div>' +
          '<button class="settings-toggle ' + (s.debugDisplay ? 'on' : '') + '" id="set-debug-display"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Show Message IDs</span></div>' +
          '<button class="settings-toggle ' + (s.showMessageIds ? 'on' : '') + '" id="set-msg-ids"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Log Network Packets</span></div>' +
          '<button class="settings-toggle ' + (s.logNetworkPackets ? 'on' : '') + '" id="set-log-packets"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Show Connection Stats</span></div>' +
          '<button class="settings-toggle ' + (s.showConnectionStats ? 'on' : '') + '" id="set-conn-stats"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Enable Experimental</span><div class="settings-row-desc">Unstable features</div></div>' +
          '<button class="settings-toggle ' + (s.enableExperimental ? 'on' : '') + '" id="set-experimental"></button>' +
        '</div>' +
        (s.enableExperimental ? (
          '<div class="settings-row">' +
            '<div class="settings-row-content"><span class="settings-row-title">Animated Avatars</span></div>' +
            '<button class="settings-toggle ' + (s.experimentalAnimatedAvatars ? 'on' : '') + '" id="set-exp-avatars"></button>' +
          '</div>' +
          '<div class="settings-row">' +
            '<div class="settings-row-content"><span class="settings-row-title">Message Effects</span></div>' +
            '<button class="settings-toggle ' + (s.experimentalMessageFx ? 'on' : '') + '" id="set-exp-fx"></button>' +
          '</div>' +
          '<div class="settings-row">' +
            '<div class="settings-row-content"><span class="settings-row-title">Message Translation</span></div>' +
            '<button class="settings-toggle ' + (s.experimentalMessageTranslate ? 'on' : '') + '" id="set-exp-translate"></button>' +
          '</div>' +
          '<div class="settings-row">' +
            '<div class="settings-row-content"><span class="settings-row-title">Compact Spacing</span></div>' +
            '<button class="settings-toggle ' + (s.experimentalCompactSpacing ? 'on' : '') + '" id="set-exp-spacing"></button>' +
          '</div>' +
          '<div class="settings-row">' +
            '<div class="settings-row-content"><span class="settings-row-title">Custom Colors</span></div>' +
            '<button class="settings-toggle ' + (s.enableCustomColors ? 'on' : '') + '" id="set-exp-colors"></button>' +
          '</div>' +
          '<div class="settings-row">' +
            '<div class="settings-row-content"><span class="settings-row-title">Profile Frames</span></div>' +
            '<button class="settings-toggle ' + (s.experimentalProfileFrames ? 'on' : '') + '" id="set-exp-frames"></button>' +
          '</div>'
        ) : '');
      default:
        return '';
    }
  }

  function bindSectionEvents(key, s) {
    switch (key) {
      case 'appearance':
        bindSelect('set-theme', function(v) { s.theme = v; applyTheme(v); MStore.save(); });
        bindSelect('set-bubbles', function(v) { s.messageBubbles = v; document.documentElement.setAttribute('data-bubbles', v); MStore.save(); });
        bindToggle('set-24h', function(on) { s.timeFormat24 = on; MStore.save(); renderChatList(); if (activeChatId) renderMessages(activeChatId); renderActivity(); }, s.timeFormat24);
        bindToggle('set-animations', function(on) { s.animations = on; MStore.save(); applyAnimationSettings(); }, s.animations !== false);
        bindSelect('set-anim-speed', function(v) { s.animSpeed = v; MStore.save(); applyAnimationSettings(); });
        bindToggle('set-reduce-motion', function(on) { s.reduceMotion = on; MStore.save(); applyAnimationSettings(); }, s.reduceMotion);
        bindSelect('set-font-size', function(v) { s.fontSize = v; MStore.save(); applyFontSize(); });
        break;
      case 'chat':
        bindToggle('set-enter-send', function(on) { s.enterToSend = on; MStore.save(); }, s.enterToSend);
        bindToggle('set-chat-avatars', function(on) { s.showChatAvatars = on; MStore.save(); renderChatList(); }, s.showChatAvatars !== false);
        bindSelect('set-msg-anim', function(v) { s.messageAnim = v; MStore.save(); if (activeChatId) renderMessages(activeChatId); });
        bindSelect('set-pattern', function(v) { s.bgPattern = v; MStore.save(); applyBgPattern(); });
        bindToggle('set-image-previews', function(on) { s.showImagePreviews = on; MStore.save(); if (activeChatId) renderMessages(activeChatId); }, s.showImagePreviews !== false);
        bindToggle('set-link-previews', function(on) { s.showLinkPreviews = on; MStore.save(); if (activeChatId) renderMessages(activeChatId); }, s.showLinkPreviews !== false);
        break;
      case 'notifications':
        bindToggle('notify-preview', function(on) { s.notifyPreview = on; MStore.save(); }, s.notifyPreview !== false);
        bindToggle('notify-sound', function(on) { s.notifySound = on; MStore.save(); }, s.notifySound);
        bindToggle('notify-dnd', function(on) { s.notifyDnd = on; MStore.save(); }, s.notifyDnd);
        bindToggle('notify-mentions', function(on) { s.notifyGroupMentions = on; MStore.save(); }, s.notifyGroupMentions);
        break;
      case 'privacy':
        bindToggle('set-privacy', function(on) { s.privacyMode = on; MStore.save(); var badge = document.getElementById('btn-privacy-badge'); if (badge) badge.style.display = on ? 'flex' : 'none'; }, s.privacyMode);
        bindToggle('set-e2ee', function(on) {
          s.e2eeEnabled = on; MStore.save();
          if (on && window.Orbit && window.Orbit.E2EE) {
            Orbit.E2EE.getPublicKeyAsync().then(function(pk) { if (pk) { MStore.user.publicKey = pk; MStore.save(); showToast('E2EE enabled — key ready', 'info'); } });
          } else { showToast(on ? 'E2EE enabled' : 'E2EE disabled', 'info'); }
        }, s.e2eeEnabled);
        bindSelect('set-delete-after', function(v) { s.deleteAttachmentsAfter = parseInt(v, 10); MStore.save(); });
        break;
      case 'network':
        bindSelect('net-mode', function(v) { s.networkMode = v; MStore.save(); toggleNetworkPortFields(v); });
        toggleNetworkPortFields(s.networkMode || 'LAN Auto-Discovery');
        ['net-udp', 'net-tcp', 'net-maxsize'].forEach(function(id) {
          var el = document.getElementById(id);
          if (el) {
            el.addEventListener('change', function() {
              var key = id === 'net-udp' ? 'udpPort' : id === 'net-tcp' ? 'tcpPort' : 'maxFileSize';
              s[key] = parseInt(this.value, 10) || 0;
              MStore.save();
            });
          }
        });
        bindToggle('net-autoreconnect', function(on) { s.netAutoReconnect = on; MStore.save(); }, s.netAutoReconnect !== false);
        bindSelect('net-timeout', function(v) { s.netTimeout = parseInt(v, 10); MStore.save(); });
        var addFriendRow = document.getElementById('row-add-friend');
        if (addFriendRow) addFriendRow.addEventListener('click', showAddFriendModal);
        break;
      case 'advanced':
        bindToggle('set-dev-mode', function(on) {
          s.devMode = on; MStore.save(); document.documentElement.setAttribute('data-dev-mode', on ? 'true' : ''); updateDebugOverlay();
          if (on) {
            // Load eruda for on-device devtools
            if (!window.eruda) {
              var sc = document.createElement('script');
              sc.src = 'https://cdn.jsdelivr.net/npm/eruda';
              sc.onload = function() { eruda.init(); showToast('DevTools loaded (eruda)', 'info'); };
              sc.onerror = function() { showToast('Could not load DevTools — use chrome://inspect', 'warning'); };
              document.body.appendChild(sc);
            } else {
              eruda.init();
            }
            // Show log overlay button
            if (!document.getElementById('p2p-log-btn')) {
              var btn = document.createElement('button');
              btn.id = 'p2p-log-btn';
              btn.textContent = 'P2P Log';
              btn.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:99998;background:#0a0;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:11px;font-family:monospace;cursor:pointer;opacity:0.7;';
              btn.addEventListener('click', showLogOverlay);
              document.body.appendChild(btn);
            }
            renderLogBuffer();
            showToast('Dev Mode ON — Logs enabled', 'info');
          } else {
            if (window.eruda) try { eruda.destroy(); } catch(e) {}
            var lb = document.getElementById('p2p-log-btn');
            if (lb) lb.remove();
            if (_logOverlay) { _logOverlay.remove(); _logOverlay = null; }
          }
        }, s.devMode);
        bindToggle('set-debug-display', function(on) { s.debugDisplay = on; MStore.save(); updateDebugOverlay(); }, s.debugDisplay);
        bindToggle('set-msg-ids', function(on) { s.showMessageIds = on; MStore.save(); if (activeChatId) renderMessages(activeChatId); }, s.showMessageIds);
        bindToggle('set-log-packets', function(on) { s.logNetworkPackets = on; MStore.save(); }, s.logNetworkPackets);
        bindToggle('set-conn-stats', function(on) { s.showConnectionStats = on; MStore.save(); updateDebugOverlay(); }, s.showConnectionStats);
        bindToggle('set-experimental', function(on) {
          s.enableExperimental = on; MStore.save();
          showSettingsSection('advanced');
        }, s.enableExperimental);
        bindToggle('set-exp-avatars', function(on) { s.experimentalAnimatedAvatars = on; MStore.save(); document.documentElement.setAttribute('data-exp-avatars', on ? 'true' : ''); }, s.experimentalAnimatedAvatars);
        bindToggle('set-exp-fx', function(on) { s.experimentalMessageFx = on; MStore.save(); document.documentElement.setAttribute('data-exp-fx', on ? 'true' : ''); }, s.experimentalMessageFx);
        bindToggle('set-exp-translate', function(on) { s.experimentalMessageTranslate = on; MStore.save(); document.documentElement.setAttribute('data-exp-translate', on ? 'true' : ''); }, s.experimentalMessageTranslate);
        bindToggle('set-exp-spacing', function(on) { s.experimentalCompactSpacing = on; MStore.save(); document.documentElement.setAttribute('data-compact-spacing', on ? 'true' : ''); if (activeChatId) renderMessages(activeChatId); }, s.experimentalCompactSpacing);
        bindToggle('set-exp-colors', function(on) { s.enableCustomColors = on; MStore.save(); document.documentElement.setAttribute('data-exp-colors', on ? 'true' : ''); }, s.enableCustomColors);
        bindToggle('set-exp-frames', function(on) { s.experimentalProfileFrames = on; MStore.save(); document.documentElement.setAttribute('data-exp-frames', on ? 'true' : ''); }, s.experimentalProfileFrames);
        break;
    }
  }

  function applyTheme(theme) {
    if (theme === 'system') {
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else if (theme === 'seasonal') {
      var month = new Date().getMonth();
      var seasonTheme;
      if (month >= 2 && month <= 4) seasonTheme = 'seasonal-spring';
      else if (month >= 5 && month <= 7) seasonTheme = 'seasonal-summer';
      else if (month >= 8 && month <= 9) seasonTheme = 'seasonal-fall';
      else seasonTheme = 'seasonal-winter';
      document.documentElement.setAttribute('data-theme', seasonTheme);
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  function applyBgPattern() {
    var p = MStore.settings.bgPattern || 'None';
    if (p === 'Dots') {
      document.documentElement.style.setProperty('--chat-bg-image', 'radial-gradient(var(--border-subtle) 1px, transparent 1px)');
      document.documentElement.style.setProperty('--chat-bg-size', '20px 20px');
    } else if (p === 'Grid') {
      document.documentElement.style.setProperty('--chat-bg-image', 'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)');
      document.documentElement.style.setProperty('--chat-bg-size', '20px 20px');
    } else {
      document.documentElement.style.setProperty('--chat-bg-image', 'none');
    }
  }

  function applyAnimationSettings() {
    var s = MStore.settings;
    if (s.animations === false) {
      document.documentElement.setAttribute('data-animations', 'off');
    } else {
      document.documentElement.removeAttribute('data-animations');
    }
    if (s.reduceMotion) {
      document.documentElement.setAttribute('data-reduce-motion', 'true');
    } else {
      document.documentElement.removeAttribute('data-reduce-motion');
    }
    if (s.animSpeed && s.animSpeed !== 'normal') {
      document.documentElement.setAttribute('data-anim-speed', s.animSpeed);
    } else {
      document.documentElement.removeAttribute('data-anim-speed');
    }
  }

  function applyFontSize() {
    document.documentElement.setAttribute('data-font-size', (MStore.settings.fontSize || 'Medium').toLowerCase());
  }

  function updateDebugOverlay() {
    var el = document.getElementById('debug-overlay');
    if (!el) return;
    if (!MStore.settings.debugDisplay && !MStore.settings.devMode) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    var lines = [];
    if (MStore.settings.devMode) {
      lines.push('devMode=ON');
    }
    if (MStore.settings.showConnectionStats) {
      var online = MStore.friends.filter(function(f) { return f.status && f.status !== 'offline'; }).length;
      var chatCount = MStore.chats.length;
      var msgCount = 0;
      Object.keys(MStore.messages).forEach(function(k) { msgCount += MStore.messages[k].length; });
      lines.push('friends=' + MStore.friends.length + ' online=' + online + ' chats=' + chatCount + ' msgs=' + msgCount);
      if (window.Orbit && window.Orbit.P2P) {
        lines.push('p2p=' + (Orbit.P2P.isAvailable() ? 'avail' : 'unavail'));
      }
    }
    if (MStore.settings.debugDisplay) {
      var storeSize = 0;
      try { storeSize = new Blob([JSON.stringify(MStore.settings)]).size; } catch(e) {}
      lines.push('store=' + (storeSize / 1024).toFixed(1) + 'KB theme=' + (MStore.settings.theme || 'dark'));
    }
    el.textContent = lines.join(' \u2022 ');
  }

  function updateDebugStats() {
    if (MStore.settings.showConnectionStats || MStore.settings.debugDisplay || MStore.settings.devMode) {
      updateDebugOverlay();
    }
    if (MStore.settings.showConnectionStats) {
      setTimeout(updateDebugStats, 5000);
    }
  }

  function toggleNetworkPortFields(mode) {
    var ids = ['net-udp', 'net-tcp', 'net-maxsize'];
    ids.forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      var row = el.closest('.settings-row');
      if (!row) return;
      row.style.display = (mode === 'Custom IP') ? '' : 'none';
    });
  }

  function bindSelect(id, onChange) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', function() {
      if (onChange) onChange(this.value);
    });
  }

  function bindToggle(id, onChange, initialState) {
    var btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', function() {
      var on = this.classList.toggle('on');
      if (onChange) onChange(on);
    });
  }

  /* -- Profile Panel (editable) -- */
  function renderProfile() {
    var container = document.getElementById('profile-content');
    var u = MStore.user;
    var initial = u && u.name ? u.name.charAt(0).toUpperCase() : '?';

    var bannerStyle = u && u.banner
      ? 'background-image:url(' + escapeHtml(u.banner) + ');background-size:cover;background-position:center;'
      : 'background:linear-gradient(135deg,var(--accent-primary),var(--accent-secondary,var(--accent-primary)));';

    container.innerHTML =
      '<div class="profile-banner" style="' + bannerStyle + '"></div>' +
      '<div class="profile-avatar-section">' +
        '<div class="profile-avatar">' + (u.avatar ? '<img src="' + escapeHtml(u.avatar) + '">' : initial) + '</div>' +
      '</div>' +
      '<div class="profile-name-section">' +
        '<div class="profile-name">' + escapeHtml(u ? u.name : 'User') + '</div>' +
        '<div class="profile-tag">#' + escapeHtml(u ? u.tag : '0000') + '</div>' +
      '</div>' +
      // Editable fields
      '<div class="profile-section">' +
        '<div class="profile-section-label">Username</div>' +
        '<input class="profile-input" id="edit-username" value="' + escapeHtml(u ? u.name : '') + '" maxlength="32" placeholder="Your name">' +
      '</div>' +
      '<div class="profile-section">' +
        '<div class="profile-section-label">Bio</div>' +
        '<textarea class="profile-textarea" id="edit-bio" placeholder="Tell us about yourself..." maxlength="160">' + escapeHtml(u && u.bio ? u.bio : '') + '</textarea>' +
      '</div>' +
      '<div class="profile-section">' +
        '<div class="profile-section-label">Avatar</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<input class="profile-input" id="edit-avatar" value="' + escapeHtml(u && u.avatar ? u.avatar : '') + '" placeholder="Image URL" style="flex:1;">' +
          '<button class="profile-upload-btn" id="btn-upload-avatar" data-target="avatar">Choose</button>' +
        '</div>' +
      '</div>' +
      '<div class="profile-section">' +
        '<div class="profile-section-label">Banner</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<input class="profile-input" id="edit-banner" value="' + escapeHtml(u && u.banner ? u.banner : '') + '" placeholder="Image URL" style="flex:1;">' +
          '<button class="profile-upload-btn" id="btn-upload-banner" data-target="banner">Choose</button>' +
        '</div>' +
      '</div>' +
      '<div class="profile-section">' +
        '<div class="profile-section-label">User ID</div>' +
        '<div class="profile-section-text" style="font-family:var(--font-mono);font-size:12px;word-break:break-all;">' +
          escapeHtml(u ? u.id : '') +
        '</div>' +
      '</div>' +

      '<button class="profile-save-btn" id="btn-save-profile">Save Profile</button>';

    renderLucide({ root: container });

    // File upload handlers for avatar/banner
    function setupProfileUpload(btnId, inputId) {
      var btn = document.getElementById(btnId);
      if (!btn) return;
      btn.addEventListener('click', function() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', function() {
          if (this.files && this.files[0]) {
            var reader = new FileReader();
            reader.onload = function(e) {
              document.getElementById(inputId).value = e.target.result;
            };
            reader.readAsDataURL(this.files[0]);
          }
          document.body.removeChild(input);
        });
        input.click();
      });
    }
    setupProfileUpload('btn-upload-avatar', 'edit-avatar');
    setupProfileUpload('btn-upload-banner', 'edit-banner');

    // Bind save button
    document.getElementById('btn-save-profile').addEventListener('click', function() {
      var username = document.getElementById('edit-username').value.trim();
      var bio = document.getElementById('edit-bio').value.trim();
      var avatar = document.getElementById('edit-avatar').value.trim();
      var banner = document.getElementById('edit-banner').value.trim();

      if (!username) {
        showToast('Username cannot be empty', 'info');
        return;
      }

      MStore.user.name = username;
      MStore.user.bio = bio;
      MStore.user.avatar = avatar || null;
      MStore.user.banner = banner || null;
      MStore.save();

      // Re-render affected views
      updateNavAvatar();
      renderSettings();
      renderFriends();
      renderChatList();
      // Re-render this profile with updated values
      renderProfile();
      showToast('Profile saved', 'info');
    });
  }

  function showProfile() {
    renderProfile();
    var panel = document.getElementById('panel-profile-overlay');
    var backdrop = document.getElementById('profile-overlay-backdrop');
    panel.classList.add('open');
    backdrop.style.display = 'block';
  }

  function hideProfile() {
    document.getElementById('panel-profile-overlay').classList.remove('open');
    document.getElementById('profile-overlay-backdrop').style.display = 'none';
  }

  /* -- Gallery Overlay -- */
  function renderGallery() {
    var container = document.getElementById('gallery-content');
    if (!activeChatId) {
      container.innerHTML =
        '<div class="gallery-empty"><i data-lucide="image"></i><div>Select a chat to view gallery</div></div>';
      renderLucide({ root: container });
      return;
    }
    var msgs = MStore.messages[activeChatId] || [];
    var images = msgs.filter(function(m) {
      return m.attachments && m.attachments.some(function(a) { return a.type === 'image'; });
    });

    if (images.length === 0) {
      container.innerHTML =
        '<div class="gallery-empty"><i data-lucide="image"></i><div>No images shared yet</div></div>';
      renderLucide({ root: container });
      return;
    }

    var html = '<div class="gallery-grid">';
    images.forEach(function(m) {
      if (m.attachments) {
        m.attachments.forEach(function(a) {
          if (a.type === 'image' && a.url) {
            html += '<div class="gallery-item"><img src="' + escapeHtml(a.url) + '" loading="lazy"></div>';
          }
        });
      }
    });
    html += '</div>';
    container.innerHTML = html;
    renderLucide({ root: container });
  }

  function showGallery() {
    renderGallery();
    var panel = document.getElementById('panel-gallery-overlay');
    var backdrop = document.getElementById('gallery-overlay-backdrop');
    panel.classList.add('open');
    backdrop.style.display = 'block';
  }

  function hideGallery() {
    document.getElementById('panel-gallery-overlay').classList.remove('open');
    document.getElementById('gallery-overlay-backdrop').style.display = 'none';
  }

  /* -- Group Info Panel -- */
  function _getMemberRoleBadge(role) {
    if (role === 'owner') return '<span class="group-role-badge group-role-owner">Owner</span>';
    if (role === 'admin') return '<span class="group-role-badge group-role-admin">Admin</span>';
    return '';
  }

  function _isMyGroupOwner(group) {
    return group.ownerId === (MStore.user ? MStore.user.id : '');
  }

  function _getMemberById(group, userId) {
    if (!group || !group.members) return null;
    return group.members.find(function(m) { return (typeof m === 'string' ? m : m.userId) === userId; });
  }

  function _isGroupAdmin(group, userId) {
    var mem = _getMemberById(group, userId);
    if (!mem) return false;
    if (typeof mem === 'string') return false;
    return mem.role === 'admin' || mem.role === 'owner';
  }

  function renderGroupInfo() {
    var container = document.getElementById('members-content');
    if (!activeChatId) return;
    var group = MStore.groups.find(function(g) { return g.id === activeChatId; });
    if (!group) {
      container.innerHTML = '<div class="empty-state"><i data-lucide="users"></i><div class="empty-state-text">Not a group</div></div>';
      renderLucide({ root: container });
      document.querySelector('#panel-members-overlay .overlay-panel-header h3').textContent = 'Group Info';
      return;
    }

    var isOwner = _isMyGroupOwner(group);
    var myId = MStore.user ? MStore.user.id : '';
    var members = group.members || [];
    var groupInitial = group.name.charAt(0).toUpperCase();

    // ── Avatar section ──
    var avatarSection = group.avatar
      ? '<div class="group-info-avatar"><img src="' + escapeHtml(group.avatar) + '" alt=""></div>'
      : '<div class="group-info-avatar group-info-avatar-placeholder">' + groupInitial + '</div>';

    // ── Member rows ──
    var membersHtml = '';
    members.forEach(function(m) {
      var mid = typeof m === 'string' ? m : m.userId;
      var role = (typeof m === 'string') ? 'member' : (m.role || 'member');
      var friend = MStore.friends.find(function(f) { return f.id === mid; });
      var name = friend ? friend.name : mid;
      var tag = friend ? (friend.tag || '') : '';
      var initial = name.charAt(0).toUpperCase();
      var mAvatar = friend && friend.avatar
        ? '<img src="' + escapeHtml(friend.avatar) + '" alt="">'
        : initial;
      var statusColor = friend
        ? ({ online: 'var(--accent-success)', away: 'var(--accent-warning)', busy: 'var(--accent-danger)', offline: 'var(--text-muted)' }[friend.status] || 'var(--text-muted)')
        : 'var(--text-muted)';

      var canManage = isOwner || _isGroupAdmin(group, myId);
      var isSelf = mid === myId;
      var isOwnerMember = role === 'owner';
      var removeBtn = (canManage && !isSelf && !isOwnerMember)
        ? '<button class="group-member-action group-member-remove" data-user-id="' + mid + '">✕</button>'
        : '';
      var promoteBtn = (isOwner && role === 'member')
        ? '<button class="group-member-action group-member-promote" data-user-id="' + mid + '" title="Promote to Admin">▲</button>'
        : '';
      var demoteBtn = (isOwner && role === 'admin')
        ? '<button class="group-member-action group-member-demote" data-user-id="' + mid + '" title="Demote to Member">▼</button>'
        : '';

      var joinedDate = '';
      if (m.joinedAt) {
        try {
          var jd = new Date(m.joinedAt);
          joinedDate = jd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        } catch(e) {}
      }
      membersHtml += '<div class="group-member-row">' +
        '<div class="group-member-avatar-wrap">' +
          '<div class="group-member-avatar">' + mAvatar + '</div>' +
          '<span class="group-member-status" style="background:' + statusColor + ';"></span>' +
        '</div>' +
        '<div class="group-member-info">' +
          '<div class="group-member-name">' + escapeHtml(name) + _getMemberRoleBadge(role) + '</div>' +
          '<div class="group-member-tag">@' + escapeHtml(tag) + '</div>' +
          (joinedDate ? '<div class="group-member-joined">Joined ' + joinedDate + '</div>' : '') +
        '</div>' +
        '<div class="group-member-actions">' + promoteBtn + demoteBtn + removeBtn + '</div>' +
      '</div>';
    });

    // ── Build full panel ──
    var html =
      // Avatar
      '<div class="group-info-avatar-section">' +
        avatarSection +
        (isOwner ? '<div class="group-info-change-avatar" id="btn-group-info-avatar">Change</div>' : '') +
      '</div>' +

      // Group Name
      '<div class="group-info-field">' +
        '<label class="group-info-label">Group Name</label>' +
        '<input id="group-info-name" type="text" value="' + escapeHtml(group.name) + '" class="group-info-input" ' + (isOwner ? '' : 'disabled') + '>' +
      '</div>' +

      // Description
      '<div class="group-info-field">' +
        '<label class="group-info-label">Description</label>' +
        '<textarea id="group-info-desc" rows="2" class="group-info-textarea" ' + (isOwner ? '' : 'disabled') + '>' + escapeHtml(group.description || '') + '</textarea>' +
      '</div>' +

      // Invite Code
      '<div class="group-info-field group-info-invite">' +
        '<label class="group-info-label">Invite Code</label>' +
        '<div class="group-info-invite-row">' +
          '<span class="group-info-code">' + escapeHtml(group.inviteCode || '') + '</span>' +
          '<button class="group-info-btn" id="btn-group-copy-invite">Copy</button>' +
          '<button class="group-info-btn" id="btn-group-share-invite">Share</button>' +
        '</div>' +
      '</div>' +

      // Toggles
      '<div class="group-info-toggle-row">' +
        '<span>Pin Group</span>' +
        '<label class="toggle-switch"><input type="checkbox" id="group-info-pin"' + (group.pinned ? ' checked' : '') + '><span class="toggle-slider"></span></label>' +
      '</div>' +
      '<div class="group-info-toggle-row">' +
        '<span>Mute Notifications</span>' +
        '<label class="toggle-switch"><input type="checkbox" id="group-info-mute"' + (group.notificationMuted ? ' checked' : '') + '><span class="toggle-slider"></span></label>' +
      '</div>' +

      // Pinned Messages
      '<div class="group-info-pinned-section">' +
        '<div class="group-info-pinned-header">Pinned Messages</div>' +
        '<div class="group-info-pinned-list">' +
          ((group.pinnedMessages && group.pinnedMessages.length > 0)
            ? group.pinnedMessages.map(function(pm) {
                var pmFriend = MStore.friends.find(function(f) { return f.id === pm.pinnedBy; });
                var pmName = pmFriend ? pmFriend.name : (pm.pinnedBy === (MStore.user ? MStore.user.id : '') ? 'You' : pm.pinnedBy);
                return '<div class="group-info-pinned-item" data-msg-id="' + pm.msgId + '">' +
                  '<i data-lucide="pin" style="width:14px;height:14px;flex-shrink:0;color:var(--accent-primary);"></i>' +
                  '<div class="group-info-pinned-text">' + escapeHtml(pm.text || '') + '</div>' +
                  '<span class="group-info-pinned-by">' + escapeHtml(pmName) + '</span>' +
                  '<button class="group-info-pinned-remove" data-pin-msg-id="' + pm.msgId + '" title="Unpin">✕</button>' +
                '</div>';
              }).join('')
            : '<div class="group-info-pinned-empty">No pinned messages</div>') +
        '</div>' +
      '</div>' +

      // Members header
      '<div class="group-info-members-header">Members (' + members.length + ')' +
        '<button class="group-info-btn" id="btn-group-add-member" style="margin-left:auto;"><i data-lucide="user-plus" style="width:14px;height:14px;"></i> Add</button>' +
      '</div>' +
      '<div class="group-info-members-list">' + membersHtml + '</div>' +

      // Leave / Delete
      '<div class="group-info-actions">' +
        (isOwner
          ? '<button class="group-info-btn group-info-btn-danger" id="btn-group-delete">Delete Group</button>'
          : '<button class="group-info-btn group-info-btn-danger" id="btn-group-leave">Leave Group</button>') +
      '</div>';

    container.innerHTML = html;
    document.querySelector('#panel-members-overlay .overlay-panel-header h3').textContent = 'Group Info';
    renderLucide({ root: container });
  }

  function showGroupInfo() {
    renderGroupInfo();
    document.getElementById('panel-members-overlay').classList.add('open');
    document.getElementById('members-overlay-backdrop').style.display = 'block';
  }

  function hideGroupInfo() {
    document.getElementById('panel-members-overlay').classList.remove('open');
    document.getElementById('members-overlay-backdrop').style.display = 'none';
  }

  /* -- Activity Center -- */
  function renderActivity() {
    var container = document.getElementById('activity-content');
    var chatList = MStore.getChats();
    var hasActivity = false;
    var searchLower = activitySearchFilter ? activitySearchFilter.toLowerCase() : '';

    // Sort chats by most recent message
    var sorted = chatList.slice().sort(function(a, b) {
      return new Date(b.lastTime || 0) - new Date(a.lastTime || 0);
    });

    var html = '';
    sorted.forEach(function(c) {
      var msgs = MStore.messages[c.id] || [];
      if (msgs.length === 0) return;

      // Filter messages by search term
      if (searchLower) {
        msgs = msgs.filter(function(m) {
          var text = m.text || '';
          return text.toLowerCase().indexOf(searchLower) !== -1 ||
                 c.name.toLowerCase().indexOf(searchLower) !== -1;
        });
        if (msgs.length === 0) return;
      }

      hasActivity = true;

      var initial = c.name ? c.name.charAt(0).toUpperCase() : '?';
      var avatarHtml = c.avatar
        ? '<img src="' + escapeHtml(c.avatar) + '" alt="">'
        : initial;
      var recentMsgs = msgs.slice(-5).reverse();

      html += '<div class="activity-group">' +
        '<div class="activity-group-header">' +
          '<div class="activity-group-avatar">' + avatarHtml + '</div>' +
          '<div class="activity-group-name">' + escapeHtml(c.name) + '</div>' +
          '<div class="activity-group-count">' + msgs.length + ' msgs</div>' +
        '</div>';

      recentMsgs.forEach(function(m) {
        var isMine = m.from === 'me';
        var senderName = isMine ? 'You' : c.name;
        var text = m.text || (m.attachments ? '[Attachment]' : '');
        html += '<div class="activity-item" data-chat="' + c.id + '">' +
          '<span class="activity-item-time">' + formatTime(m.time) + '</span>' +
          '<span class="activity-item-text"><strong>' + escapeHtml(senderName) + ':</strong> ' + escapeHtml(text) + '</span>' +
        '</div>';
      });

      html += '</div>';
    });

    if (!hasActivity) {
      html = '<div class="empty-state"><i data-lucide="bell"></i>' +
        '<div class="empty-state-text">No activity yet</div>' +
        '<div class="empty-state-sub">Messages from your chats will appear here</div></div>';
    }

    container.innerHTML = html;
    renderLucide({ root: container });

    // Click activity item to open chat
    container.querySelectorAll('.activity-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var chatId = this.getAttribute('data-chat');
        document.querySelector('.nav-btn[data-view="chats"]').click();
        openChat(chatId);
      });
    });
  }

  /* -- Add Friend Modal -- */
  function resetModalToAddFriend() {
    var modalTitle = document.querySelector('#modal-overlay .modal-header h3');
    var modalInput = document.getElementById('modal-input');
    var modalAvatarInput = document.getElementById('modal-avatar-input');
    var modalConfirm = document.getElementById('btn-modal-confirm');
    var memberList = document.getElementById('modal-member-list');
    var modalTabs = document.querySelector('.modal-tabs');

    // Restore tabs, switch to Add Friend tab
    if (modalTabs) modalTabs.style.display = '';
    document.querySelectorAll('.modal-tab-content').forEach(function(c) { c.style.display = 'none'; });
    var addTab = document.getElementById('modal-tab-add');
    if (addTab) addTab.style.display = 'block';
    document.querySelectorAll('.modal-tab').forEach(function(t) { t.classList.remove('active'); });
    var addTabBtn = document.querySelector('.modal-tab[data-tab="add"]');
    if (addTabBtn) addTabBtn.classList.add('active');

    if (modalTitle) modalTitle.textContent = 'Add Friend';
    if (modalInput) modalInput.placeholder = 'IP address or Peer ID...';
    if (modalAvatarInput) modalAvatarInput.style.display = 'none';
    if (memberList) memberList.style.display = 'none';
    if (modalConfirm) {
      modalConfirm.textContent = 'Connect';
      modalConfirm.onclick = confirmAddFriend;
    }
    _groupCreateMode = false;
  }

  function showAddFriendModal() {
    resetModalToAddFriend();
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('modal-input').value = '';
    document.getElementById('modal-input').focus();
  }

  function hideModal() {
    document.getElementById('modal-overlay').style.display = 'none';
  }

  function confirmAddFriend() {
    var input = document.getElementById('modal-input');
    var val = input.value.trim();
    if (!val) return;
    hideModal();

    // Parse input: "host:port" or just "host"
    var parts = val.split(':');
    var host = parts[0];
    var port = parseInt(parts[1], 10) || 46000;
    var peerId = host + ':' + port;

    // Add as friend
    var existing = MStore.friends.find(function(f) { return f.id === peerId; });
    if (!existing) {
      MStore.friends.push({
        id: peerId,
        name: host,
        tag: '',
        status: 'offline',
        avatar: null,
        bio: '',
        ip: host,
        publicKey: null
      });
      MStore.save();
      renderFriends();
    }

    // Ensure chat exists
    var chatExists = MStore.chats.find(function(c) { return c.id === peerId; });
    if (!chatExists) {
      MStore.chats.push({ id: peerId, name: host, lastMessage: '', lastTime: '', unread: 0 });
      MStore.save();
      renderChatList();
    }

    showToast('Connecting to ' + host + '...', 'info');

    // Attempt P2P connection — try even if plugin wasn't ready at boot
    if (window.Orbit && window.Orbit.P2P) {
      Orbit.P2P.connect(host, port, peerId).then(function(result) {
        if (result.success) {
          showToast('Connected to ' + host, 'info');
          // Update friend status
          var friend = MStore.friends.find(function(f) { return f.id === peerId; });
          if (friend) {
            friend.status = 'online';
            MStore.save();
            renderFriends();
            renderChatList();
          }
        } else {
          showToast('Connection failed: ' + (result.error || 'unknown'), 'info');
        }
      });
    } else {
      showToast('P2P bridge not loaded', 'error');
    }
  }

  /* -- QR Scanner -- */
  var _qrScanning = false;
  var _qrStream = null;

  function startQRScanner() {
    var overlay = document.getElementById('qr-scanner-overlay');
    var video = document.getElementById('qr-scanner-video');
    if (!overlay || !video) return;
    overlay.style.display = 'flex';

    // Request camera
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 640, height: 640 } }).then(function(stream) {
      _qrStream = stream;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.play();
      _qrScanning = true;
      scanFrame();
    }).catch(function() {
      showToast('Camera access denied', 'info');
      stopQRScanner();
    });
  }

  function scanFrame() {
    if (!_qrScanning) return;
    var video = document.getElementById('qr-scanner-video');
    var canvas = document.getElementById('qr-scanner-canvas');
    if (!video || !canvas || video.readyState < 2) {
      requestAnimationFrame(scanFrame);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (typeof jsQR !== 'undefined') {
      var code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
      if (code && code.data) {
        try {
          var parsed = JSON.parse(code.data);
          if (parsed && parsed.v === 1 && parsed.id) {
            stopQRScanner();
            // Auto-add friend from QR data
            var peerId = parsed.id;
            var peerName = parsed.n || 'Unknown';
            var peerTag = parsed.t || '';
            var existing = MStore.friends.find(function(f) { return f.id === peerId; });
            if (!existing) {
              MStore.friends.push({ id: peerId, name: peerName, tag: peerTag, status: 'offline', avatar: null, bio: '', ip: null, publicKey: null });
              MStore.chats.push({ id: peerId, name: peerName, lastMessage: '', lastTime: '', unread: 0 });
              MStore.save();
              renderFriends();
              renderChatList();
              showToast('Added ' + peerName, 'info');
            } else {
              showToast(peerName + ' is already a friend', 'info');
            }
            return;
          }
        } catch(e) {}
      }
    }
    requestAnimationFrame(scanFrame);
  }

  function stopQRScanner() {
    _qrScanning = false;
    if (_qrStream) {
      _qrStream.getTracks().forEach(function(t) { t.stop(); });
      _qrStream = null;
    }
    var overlay = document.getElementById('qr-scanner-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  /* -- Toast -- */
  function showIncomingNotification(chatId, fromId, text) {
    if (activeChatId === chatId) return;
    if (MStore.settings.notifyDnd) return;
    var friend = MStore.friends.find(function(f) { return f.id === fromId; });
    var name = friend ? friend.name : (fromId || 'Someone');
    // Group mention check
    var isGroup = MStore.groups.some(function(g) { return g.id === chatId; });
    if (isGroup && MStore.settings.notifyGroupMentions) {
      var myName = MStore.user ? MStore.user.name : '';
      if (myName && text.indexOf('@' + myName) === -1) return;
    }
    var preview = MStore.settings.notifyPreview !== false ? text : 'New message';
    showToast(name + ': ' + preview, 'info');
    if (MStore.settings.notifySound) playNotificationSound();
  }

  function playNotificationSound() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 660;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch(e) {}
  }

  function showToast(msg, type) {
    var container = document.getElementById('toast-container');
    var el = document.createElement('div');
    el.className = 'toast-mobile' + (type && type !== 'info' ? ' toast-' + type : '');

    var icons = { info: 'info', success: 'check-circle', error: 'alert-circle', warning: 'alert-triangle' };
    var iconName = icons[type] || 'info';

    el.innerHTML = '<i data-lucide="' + iconName + '"></i><span class="toast-text">' + msg + '</span><div class="toast-bar"></div>';

    container.appendChild(el);
    if (window.lucide) lucide.createIcons({ root: el });

    var duration = 2500;
    setTimeout(function() {
      el.style.opacity = '0';
      el.style.transform = 'translateY(-24px) scale(0.95)';
      el.style.transition = 'opacity 0.3s, transform 0.3s';
      setTimeout(function() { el.remove(); }, 300);
    }, duration);
  }

  /* -- Helpers -- */
  function renderLucide(container) {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      try {
        if (container && container.nodeType) {
          lucide.createIcons({ root: container });
        } else {
          lucide.createIcons(container || undefined);
        }
      } catch(e) {}
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function linkifyText(text) {
    if (!text) return '';
    var html = escapeHtml(text);
    html = html.replace(/(https?:\/\/[^\s]+)/g, function(url) {
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer" class="msg-link-mob">' + url + '</a>';
    });
    return html;
  }

  function formatTime(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (MStore.settings.timeFormat24 === false) {
        var hour = d.getHours();
        var ampm = hour >= 12 ? 'PM' : 'AM';
        hour = hour % 12;
        if (hour === 0) hour = 12;
        return hour + ':' + d.getMinutes().toString().padStart(2, '0') + ' ' + ampm;
      }
      return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    } catch(e) { return ''; }
  }

  /* -- Event Bindings -- */
  // Back button
  document.getElementById('btn-back').addEventListener('click', closeChat);

  // Send button
  document.getElementById('btn-send').addEventListener('click', sendMessage);

  // Enter to send
  document.getElementById('chat-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey && MStore.settings.enterToSend) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Search inputs
  document.getElementById('search-input').addEventListener('input', function() {
    searchFilter = this.value;
    renderChatList();
  });

  var searchFriendsEl = document.getElementById('search-friends');
  if (searchFriendsEl) {
    searchFriendsEl.addEventListener('input', function() {
      friendsSearchFilter = this.value;
      renderFriends();
    });
  }

  var searchActivityEl = document.getElementById('search-activity');
  if (searchActivityEl) {
    searchActivityEl.addEventListener('input', function() {
      activitySearchFilter = this.value;
      renderActivity();
    });
  }

  var activityBtn = document.getElementById('btn-activity-action');
  if (activityBtn) {
    activityBtn.addEventListener('click', function() {
      showToast('Activity cleared', 'info');
    });
  }

  // Chat search toggle
  var chatSearchBtn = document.getElementById('btn-chat-search');
  var chatSearchBar = document.getElementById('message-search-bar');
  var chatSearchInput = document.getElementById('chat-search-input');
  var chatSearchClose = document.getElementById('btn-chat-search-close');
  if (chatSearchBtn && chatSearchBar && chatSearchInput && chatSearchClose) {
    chatSearchBtn.addEventListener('click', function() {
      chatSearchBar.style.display = chatSearchBar.style.display === 'none' ? '' : 'none';
      if (chatSearchBar.style.display !== 'none') {
        chatSearchInput.focus();
      } else {
        chatSearchFilter = '';
        chatSearchInput.value = '';
        if (activeChatId) renderMessages(activeChatId);
      }
    });
    chatSearchInput.addEventListener('input', function() {
      chatSearchFilter = this.value;
      if (activeChatId) renderMessages(activeChatId);
    });
    chatSearchClose.addEventListener('click', function() {
      chatSearchBar.style.display = 'none';
      chatSearchFilter = '';
      chatSearchInput.value = '';
      if (activeChatId) renderMessages(activeChatId);
    });
  }

  // Friends buttons
  document.getElementById('btn-add-friend').addEventListener('click', showAddFriendModal);
  var scanBtn = document.getElementById('btn-scan-qr');
  if (scanBtn) scanBtn.addEventListener('click', startQRScanner);
  var closeScannerBtn = document.getElementById('btn-close-scanner');
  if (closeScannerBtn) closeScannerBtn.addEventListener('click', stopQRScanner);

  // Gallery button
  document.getElementById('btn-gallery').addEventListener('click', showGallery);

  // Close gallery
  document.getElementById('btn-close-gallery').addEventListener('click', hideGallery);

  // Close profile
  document.getElementById('btn-close-profile').addEventListener('click', hideProfile);

  // Settings overlay
  document.getElementById('btn-close-settings').addEventListener('click', hideSettingsOverlay);
  document.getElementById('btn-settings-back').addEventListener('click', backSettingsOverview);
  document.getElementById('settings-overlay-backdrop').addEventListener('click', hideSettingsOverlay);

  // Group members
  document.getElementById('btn-close-members').addEventListener('click', hideGroupInfo);
  document.getElementById('btn-close-image-preview').addEventListener('click', function() {
    document.getElementById('image-preview-overlay').classList.remove('open');
  });
  document.getElementById('image-preview-overlay').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });
  document.getElementById('members-overlay-backdrop').addEventListener('click', hideGroupInfo);
  document.getElementById('members-content').addEventListener('click', function(e) {
    var target = e.target;

    // Avatar upload
    if (target.id === 'btn-group-info-avatar') {
      var group = MStore.groups.find(function(g) { return g.id === activeChatId; });
      if (!group) return;
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = function(ev) {
        var file = ev.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(ev2) {
          var dataUrl = ev2.target.result;
          group.avatar = dataUrl;
          MStore.save();
          var chat = MStore.chats.find(function(c) { return c.id === activeChatId; });
          if (chat) chat.avatar = dataUrl;
          renderGroupInfo();
          renderChatList();
          showToast('Group avatar updated', 'info');
        };
        reader.readAsDataURL(file);
      };
      input.click();
      return;
    }

    // Group name change
    if (target.id === 'group-info-name' || target.id === 'group-info-desc') {
      return; // handled by change events
    }

    // Copy invite code
    if (target.id === 'btn-group-copy-invite') {
      var g = MStore.groups.find(function(gr) { return gr.id === activeChatId; });
      if (g && g.inviteCode) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(g.inviteCode);
        }
        showToast('Invite code copied', 'info');
      }
      return;
    }

    // Share invite code in current chat
    if (target.id === 'btn-group-share-invite') {
      var sg = MStore.groups.find(function(gr) { return gr.id === activeChatId; });
      if (sg) {
        if (!sg.inviteCode) {
          var codeBytes = new Uint8Array(4);
          window.crypto.getRandomValues(codeBytes);
          sg.inviteCode = Array.from(codeBytes).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
          MStore.save();
        }
        var shareText = 'Join my group "' + sg.name + '" on Orbit! Use invite code: ' + sg.inviteCode;
        var shareMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        // Send in current chat if there's an active chat
        if (activeChatId && activeChatId !== sg.id) {
          MStore.addMessage(activeChatId, {
            id: shareMsgId,
            from: 'me',
            text: shareText,
            time: new Date().toISOString()
          });
          if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
            var activeChat = MStore.chats.find(function(c) { return c.id === activeChatId; });
            if (activeChat) {
              var isGroupChat = MStore.groups.some(function(g) { return g.id === activeChatId; });
              if (isGroupChat) {
                (sg.members || []).forEach(function(m) {
                  var mid = typeof m === 'string' ? m : m.userId;
                  if (mid !== (MStore.user ? MStore.user.id : '')) {
                    var pkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.MESSAGE, { text: shareText, msgId: shareMsgId, chatId: activeChatId }, MStore.user ? MStore.user.id : '');
                    Orbit.P2P.send(mid, pkt);
                  }
                });
              } else {
                var pkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.MESSAGE, { text: shareText, msgId: shareMsgId, chatId: activeChatId }, MStore.user ? MStore.user.id : '');
                Orbit.P2P.send(activeChatId, pkt);
              }
            }
          }
          renderMessages(activeChatId);
          renderChatList();
          showToast('Invite code shared in chat', 'info');
        } else {
          showToast('Open a different chat first to share the invite', 'info');
        }
      }
      return;
    }

    // Add member
    if (target.id === 'btn-group-add-member' || target.closest('#btn-group-add-member')) {
      hideGroupInfo();
      var friendNames = MStore.friends.map(function(f) { return f.name; });
      if (friendNames.length === 0) {
        showToast('No friends to add', 'info');
        return;
      }
      var name = prompt('Enter friend name to add:\n' + friendNames.join(', '));
      if (!name || !name.trim()) return;
      var friend = MStore.friends.find(function(f) { return f.name.toLowerCase() === name.trim().toLowerCase(); });
      if (!friend) {
        showToast('Friend not found', 'info');
        return;
      }
      var grp = MStore.groups.find(function(g) { return g.id === activeChatId; });
      if (grp) {
        if (!grp.members) grp.members = [];
        var exists = grp.members.some(function(m) { return (typeof m === 'string' ? m : m.userId) === friend.id; });
        if (!exists) {
          grp.members.push({ userId: friend.id, role: 'member', joinedAt: new Date().toISOString() });
          MStore.save();
          // Send group data to the new member
          if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
            var invitePkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.GROUP_CREATE, {
              groupId: activeChatId,
              groupName: grp.name,
              groupAvatar: grp.avatar || null,
              ownerId: grp.ownerId,
              members: grp.members,
              inviteCode: grp.inviteCode,
              description: grp.description || ''
            }, MStore.user ? MStore.user.id : '');
            Orbit.P2P.send(friend.id, invitePkt);
          }
          showToast(friend.name + ' added to group', 'info');
          renderGroupInfo();
          var headerInfo = document.getElementById('chat-header-info');
          var statusDiv = headerInfo.querySelector('div:last-child');
          if (statusDiv) statusDiv.textContent = grp.members.length + ' members';
        } else {
          showToast(friend.name + ' is already in group', 'info');
        }
      }
      return;
    }

    // Remove member
    if (target.classList.contains('group-member-remove')) {
      var removeUserId = target.getAttribute('data-user-id');
      var grp2 = MStore.groups.find(function(g) { return g.id === activeChatId; });
      if (!grp2 || !removeUserId) return;
      if (confirm('Remove this member from the group?')) {
        grp2.members = (grp2.members || []).filter(function(m) {
          return (typeof m === 'string' ? m : m.userId) !== removeUserId;
        });
        // Notify remaining members about the removal
        if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
          (grp2.members || []).forEach(function(m) {
            var mid = typeof m === 'string' ? m : m.userId;
            if (mid !== (MStore.user ? MStore.user.id : '')) {
              var leavePkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.GROUP_LEAVE, {
                groupId: activeChatId, userId: removeUserId
              }, MStore.user ? MStore.user.id : '');
              Orbit.P2P.send(mid, leavePkt);
            }
          });
        }
        MStore.save();
        renderGroupInfo();
        var headerInfo = document.getElementById('chat-header-info');
        var statusDiv = headerInfo.querySelector('div:last-child');
        if (statusDiv) statusDiv.textContent = grp2.members.length + ' members';
        showToast('Member removed', 'info');
      }
      return;
    }

    // Promote to admin
    if (target.classList.contains('group-member-promote')) {
      var promoteUserId = target.getAttribute('data-user-id');
      var grp3 = MStore.groups.find(function(g) { return g.id === activeChatId; });
      if (!grp3 || !promoteUserId) return;
      grp3.members = (grp3.members || []).map(function(m) {
        if ((typeof m === 'string' ? m : m.userId) === promoteUserId) {
          return typeof m === 'string' ? { userId: m, role: 'admin', joinedAt: new Date().toISOString() } : { ...m, role: 'admin' };
        }
        return m;
      });
      MStore.save();
      renderGroupInfo();
      showToast('Member promoted to Admin', 'info');
      return;
    }

    // Demote to member
    if (target.classList.contains('group-member-demote')) {
      var demoteUserId = target.getAttribute('data-user-id');
      var grp4 = MStore.groups.find(function(g) { return g.id === activeChatId; });
      if (!grp4 || !demoteUserId) return;
      grp4.members = (grp4.members || []).map(function(m) {
        if ((typeof m === 'string' ? m : m.userId) === demoteUserId) {
          return typeof m === 'string' ? { userId: m, role: 'member', joinedAt: new Date().toISOString() } : { ...m, role: 'member' };
        }
        return m;
      });
      MStore.save();
      renderGroupInfo();
      showToast('Admin demoted to Member', 'info');
      return;
    }

    // Leave group
    if (target.id === 'btn-group-leave') {
      if (confirm('Leave this group?')) {
        var grp5 = MStore.groups.find(function(g) { return g.id === activeChatId; });
        if (grp5) {
          // Notify remaining members
          if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
            (grp5.members || []).forEach(function(m) {
              var mid = typeof m === 'string' ? m : m.userId;
              if (mid !== (MStore.user ? MStore.user.id : '')) {
                var leavePkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.GROUP_LEAVE, {
                  groupId: activeChatId, userId: MStore.user ? MStore.user.id : ''
                }, MStore.user ? MStore.user.id : '');
                Orbit.P2P.send(mid, leavePkt);
              }
            });
          }
          MStore.groups = MStore.groups.filter(function(g) { return g.id !== activeChatId; });
          MStore.chats = MStore.chats.filter(function(c) { return c.id !== activeChatId; });
          delete MStore.messages[activeChatId];
          MStore.save();
          hideGroupInfo();
          closeChat();
          renderChatList();
          showToast('Left group', 'info');
        }
      }
      return;
    }

    // Delete group (owner only)
    if (target.id === 'btn-group-delete') {
      if (confirm('Delete this group permanently? This cannot be undone.')) {
        var grp6 = MStore.groups.find(function(g) { return g.id === activeChatId; });
        if (grp6) {
          // Notify all members that they were removed
          if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
            (grp6.members || []).forEach(function(m) {
              var mid = typeof m === 'string' ? m : m.userId;
              if (mid !== (MStore.user ? MStore.user.id : '')) {
                var removePkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.GROUP_LEAVE, {
                  groupId: activeChatId, userId: mid
                }, MStore.user ? MStore.user.id : '');
                Orbit.P2P.send(mid, removePkt);
              }
            });
          }
          MStore.groups = MStore.groups.filter(function(g) { return g.id !== activeChatId; });
          MStore.chats = MStore.chats.filter(function(c) { return c.id !== activeChatId; });
          delete MStore.messages[activeChatId];
          MStore.save();
          hideGroupInfo();
          closeChat();
          renderChatList();
          showToast('Group deleted', 'info');
        }
      }
      return;
    }
  });

  // Group name/description change events (delegated)
  document.getElementById('members-content').addEventListener('change', function(e) {
    var target = e.target;
    var group = MStore.groups.find(function(g) { return g.id === activeChatId; });
    if (!group) return;

    if (target.id === 'group-info-name') {
      group.name = target.value;
      MStore.save();
      var chat = MStore.chats.find(function(c) { return c.id === activeChatId; });
      if (chat) chat.name = target.value;
      renderChatList();
      var headerInfo = document.getElementById('chat-header-info');
      if (headerInfo) {
        var nameDiv = headerInfo.querySelector('div:first-child');
        if (nameDiv) nameDiv.textContent = target.value;
      }
    }

    if (target.id === 'group-info-desc') {
      group.description = target.value;
      MStore.save();
    }

    if (target.id === 'group-info-pin') {
      group.pinned = target.checked;
      MStore.save();
    }

    if (target.id === 'group-info-mute') {
      group.notificationMuted = target.checked;
      MStore.save();
    }

    // Unpin from pinned messages section
    if (target.classList.contains('group-info-pinned-remove')) {
      var pinMsgId = target.getAttribute('data-pin-msg-id');
      if (pinMsgId && group.pinnedMessages) {
        group.pinnedMessages = group.pinnedMessages.filter(function(p) { return String(p.msgId) !== String(pinMsgId); });
        MStore.save();
        renderGroupInfo();
        if (activeChatId) renderMessages(activeChatId);
        // Broadcast UNPIN_MESSAGE
        var _myId = MStore.user ? MStore.user.id : '';
        if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
          (group.members || []).forEach(function(m) {
            var mid = typeof m === 'string' ? m : m.userId;
            if (mid !== _myId && mid !== '') {
              var pkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.UNPIN_MESSAGE, { msgId: pinMsgId, groupId: activeChatId }, _myId);
              Orbit.P2P.send(mid, pkt);
            }
          });
        }
      }
    }

    // Click pinned message item to scroll to message
    if (target.closest('.group-info-pinned-item')) {
      var pinItem = target.closest('.group-info-pinned-item');
      var scrollMsgId = pinItem.getAttribute('data-msg-id');
      if (scrollMsgId && !target.classList.contains('group-info-pinned-remove')) {
        hideGroupInfo();
        openChat(activeChatId);
        setTimeout(function() {
          var el = document.querySelector('.message-row[data-msg-id="' + scrollMsgId.replace(/"/g, '') + '"]');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
      return;
    }
  });

  // Overlay backdrops
  document.getElementById('profile-overlay-backdrop').addEventListener('click', hideProfile);
  document.getElementById('gallery-overlay-backdrop').addEventListener('click', hideGallery);

  // Emoji picker
  document.getElementById('btn-emoji').addEventListener('click', function(e) {
    e.stopPropagation();
    toggleEmojiPicker();
  });

  // Close emoji picker on outside click
  document.addEventListener('click', function(e) {
    if (emojiPickerOpen) {
      var container = document.getElementById('emoji-picker-container');
      if (container && !container.contains(e.target) && !e.target.closest('#btn-emoji')) {
        container.style.display = 'none';
        emojiPickerOpen = false;
      }
    }
  });

  // File input + drop-up menu
  var fileInput = document.getElementById('file-input');
  var dropupMenu = document.getElementById('dropup-menu');

  if (fileInput && dropupMenu) {
    var btnPlus = document.getElementById('btn-plus');
    btnPlus.addEventListener('click', function(e) {
      e.stopPropagation();
      dropupMenu.classList.toggle('active');
      if (dropupMenu.classList.contains('active')) {
        renderLucide(dropupMenu);
      }
    });

    dropupMenu.querySelectorAll('.dropup-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        dropupMenu.classList.remove('active');
        var type = this.getAttribute('data-upload');
        if (type === 'images') {
          fileInput.accept = 'image/*';
          fileInput.removeAttribute('webkitdirectory');
        } else if (type === 'files') {
          fileInput.removeAttribute('accept');
          fileInput.removeAttribute('webkitdirectory');
        } else if (type === 'folder') {
          fileInput.removeAttribute('accept');
          fileInput.setAttribute('webkitdirectory', '');
        }
        fileInput.click();
      });
    });

    fileInput.addEventListener('change', handleFileInput);

    // Close menu on outside tap
    document.addEventListener('click', function(e) {
      if (dropupMenu.classList.contains('active') &&
          !dropupMenu.contains(e.target) &&
          e.target !== btnPlus &&
          !btnPlus.contains(e.target)) {
        dropupMenu.classList.remove('active');
      }
    });
  }

  // Privacy badge (just visual, no action needed)
  document.getElementById('btn-privacy-badge').addEventListener('click', function() {
    showToast('Privacy mode is on', 'info');
  });

  // Profile button in settings header
  document.getElementById('btn-profile').addEventListener('click', showProfile);

  // New chat button
  document.getElementById('btn-new-chat').addEventListener('click', function() {
    showToast('Add friends from the Friends tab', 'info');
    document.querySelector('.nav-btn[data-view="friends"]').click();
  });

  // Modal buttons
  document.getElementById('btn-close-modal').addEventListener('click', function() {
    if (_groupCreateMode) _finishGroupCreate(); else hideModal();
  });
  document.getElementById('btn-modal-cancel').addEventListener('click', function() {
    if (_groupCreateMode) _finishGroupCreate(); else hideModal();
  });
  document.getElementById('modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) {
      if (_groupCreateMode) _finishGroupCreate(); else hideModal();
    }
  });
  document.getElementById('modal-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      if (_groupCreateMode) {
        document.getElementById('btn-modal-confirm').click();
      } else {
        confirmAddFriend();
      }
    }
  });
  document.getElementById('btn-modal-confirm').onclick = confirmAddFriend;

  // Modal tab switching
  document.querySelectorAll('.modal-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.modal-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      document.querySelectorAll('.modal-tab-content').forEach(function(c) { c.style.display = 'none'; });
      var target = document.getElementById('modal-tab-' + tab.dataset.tab);
      if (target) target.style.display = 'block';

      // Generate QR code when switching to QR tab
      if (tab.dataset.tab === 'qr') {
        var qrContainer = document.getElementById('modal-qr-code');
        if (qrContainer && !qrContainer.hasChildNodes() && typeof QRCode !== 'undefined') {
          var user = MStore.user;
          if (user) {
            var qrData = JSON.stringify({ v: 1, id: user.id, n: user.name, t: user.tag });
            try {
              var qr = QRCode(0, 'M');
              qr.addData(qrData);
              qr.make();
              qrContainer.innerHTML = qr.createImgTag(3, 0);
              var img = qrContainer.querySelector('img');
              if (img) img.style.display = 'block';
            } catch(e) {
              qrContainer.innerHTML = '<span style="color:var(--text-muted);font-size:11px;">Error</span>';
            }
          }
        }
      }
    });
  });

  // Cancel reply/edit bar (delegated since button is dynamic)
  document.addEventListener('click', function(e) {
    if (e.target.closest('#btn-cancel-edit-reply')) {
      cancelReplyEdit();
    }
  });

  // Nav activity tab: render activity when shown
  document.querySelector('.nav-btn[data-view="activity"]').addEventListener('click', function() {
    // Defer render so panel is visible
    setTimeout(renderActivity, 50);
  });

  // Friends tab: click to start chat
  document.addEventListener('click', function(e) {
    var friendRow = e.target.closest('.friend-row');
    if (friendRow) {
      var fid = friendRow.getAttribute('data-friend');
      // Ensure a chat exists for this friend
      var existing = MStore.chats.find(function(c) { return c.id === fid; });
      if (!existing) {
        var friend = MStore.friends.find(function(f) { return f.id === fid; });
        if (friend) {
          MStore.chats.push({ id: fid, name: friend.name, lastMessage: '', lastTime: '', unread: 0 });
          MStore.save();
          renderChatList();
        }
      }
      // Switch to chats tab
      document.querySelector('.nav-btn[data-view="chats"]').click();
      openChat(fid);
    }
  });

  /* -- Init E2EE (async, non-blocking) -- */
  if (window.Orbit && window.Orbit.E2EE && window.Orbit.E2EE.init) {
    Orbit.E2EE.init().then(function(ready) {
      if (ready) {
        console.log('[Orbit] E2EE initialized');
        if (MStore.settings.e2eeEnabled) {
          Orbit.E2EE.getPublicKeyAsync().then(function(pk) {
            if (pk) {
              MStore.user.publicKey = pk;
              MStore.save();
            }
          });
        }
      } else {
        console.warn('[Orbit] E2EE init failed — encryption unavailable');
      }
    });
  }

  /* -- Init P2P Networking -- */
  function buildBeacon() {
    var u = MStore.user;
    if (!u) return {};
    return {
      type: Orbit.Protocol.Types.BEACON,
      from: u.id,
      senderId: u.id,
      timestamp: new Date().toISOString(),
      payload: {
        userId: u.id,
        username: u.name,
        usertag: u.tag,
        avatarHash: u.avatar ? 'has_avatar' : null,
        avatar: u.avatar || null,
        status: u.status || 'online',
        bio: u.bio || '',
        publicKey: u.publicKey || null,
        profileFrame: null,
        tcpPort: 46000,
        device: 'android'
      }
    };
  }

  /* -- Debug log buffer (visible when devMode is on) -- */
  var _logBuffer = [];
  var _logOverlay = null;
  function escHtml(s) {
    if (typeof s !== 'string') return String(s || '');
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function debugLog(category, msg, data) {
    var entry = { t: new Date().toISOString().slice(11,23), cat: category, msg: msg, data: data || null };
    _logBuffer.push(entry);
    if (_logBuffer.length > 500) _logBuffer.shift();
    if (MStore && MStore.settings && MStore.settings.devMode) {
      console.log('[' + category + ']', msg, data || '');
    }
  }
  function showLogOverlay() {
    if (_logOverlay) { _logOverlay.style.display = 'flex'; return; }
    var overlay = document.createElement('div');
    overlay.id = 'p2p-log-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);z-index:99999;display:flex;flex-direction:column;padding:12px;font-family:monospace;font-size:11px;color:#0f0;';
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-shrink:0;';
    header.innerHTML = '<span style="font-weight:700;font-size:13px;">P2P Log</span><button id="p2p-log-close" style="background:transparent;border:1px solid #0f0;color:#0f0;border-radius:4px;padding:4px 12px;cursor:pointer;">Close</button>';
    var content = document.createElement('div');
    content.id = 'p2p-log-content';
    content.style.cssText = 'flex:1;overflow-y:auto;white-space:pre-wrap;line-height:1.5;';
    overlay.appendChild(header);
    overlay.appendChild(content);
    document.body.appendChild(overlay);
    _logOverlay = overlay;
    renderLogBuffer();
    document.getElementById('p2p-log-close').addEventListener('click', function() { overlay.style.display = 'none'; });
  }
  function renderLogBuffer() {
    var el = document.getElementById('p2p-log-content');
    if (!el) return;
    el.innerHTML = _logBuffer.map(function(e) {
      return '<span style="color:#888;">' + e.t + '</span> <span style="color:#0af;">[' + e.cat + ']</span> ' + escHtml(e.msg) + (e.data ? ' <span style="color:#fa0;">' + escHtml(JSON.stringify(e.data)) + '</span>' : '');
    }).join('\n');
    el.scrollTop = el.scrollHeight;
  }

  function initP2P() {
    if (!window.Orbit || !window.Orbit.P2P) {
      debugLog('P2P', 'initP2P aborted — Orbit.P2P not available');
      return;
    }
    debugLog('P2P', 'initP2P called');
    var u = MStore.user;

    // Remove stale listeners before re-initializing (BUG-JS-4)
    debugLog('P2P', 'Cleaning up stale listeners');
    Orbit.P2P.cleanup();

    debugLog('P2P', 'P2P plugin available: ' + Orbit.P2P.isAvailable());

    // Start TCP server
    debugLog('P2P', 'Starting TCP server on port 46000');
    Orbit.P2P.startServer(46000).then(function(result) {
      if (result.success) {
        debugLog('P2P', 'Server started on port ' + result.port);
      } else {
        debugLog('P2P', 'Server start failed: ' + (result.error || 'unknown'));
      }
    });

    // Build beacon
    var beacon = buildBeacon();
    debugLog('P2P', 'Beacon built', { userId: u ? u.id : 'none', username: u ? u.name : 'none' });

    // Start LAN discovery (sends beacon every 5s, receives beacons)
    debugLog('P2P', 'Starting LAN discovery');
    Orbit.P2P.startDiscovery(beacon).then(function(r) {
      debugLog('P2P', 'Discovery start result', r);
    });

    // Listen for incoming connections — send identity beacon over TCP
    Orbit.P2P.onConnection(function(data) {
      debugLog('P2P', 'Incoming connection', { connectionId: data.connectionId, host: data.host });
      // Send our beacon over TCP so the peer can discover us
      if (u && data.connectionId) {
        var beaconPacket = Orbit.Protocol.createPacket('BEACON', {
          userId: u.id,
          username: u.name,
          usertag: u.tag,
          status: u.status || 'online',
          bio: u.bio || '',
          avatar: u.avatar || null,
          publicKey: u.publicKey || null,
          tcpPort: 46000,
          device: 'android'
        }, u.id);
        debugLog('P2P', 'Sending TCP beacon to', { connectionId: data.connectionId, target: u.name });
        Orbit.P2P.send(data.connectionId, beaconPacket);
      }
    });

    // Listen for messages
    Orbit.P2P.onMessage(function(data) {
      if (!data || !data.data) {
        debugLog('P2P', 'onMessage received empty data');
        return;
      }
      debugLog('P2P', 'Raw message from ' + (data.connectionId || '?'), { length: data.data.length, preview: data.data.substring(0, 80) });
      var packet = Orbit.Protocol.parsePacket(data.data);
      if (!packet) {
        debugLog('P2P', 'Failed to parse packet from ' + (data.connectionId || '?'));
        return;
      }
      debugLog('P2P', 'Parsed packet type=' + packet.type + ' from=' + (packet.from || packet.senderId || '?'), packet.payload);
      if (MStore.settings.logNetworkPackets) console.log('[NET] P2P recv <-', data.connectionId, packet);

      // Handle BEACON packets received over TCP (handshake)
      if (packet.type === Orbit.Protocol.Types.BEACON) {
        var bp = packet.payload || {};
        var peerId = bp.userId || packet.from || packet.senderId;
        if (!peerId || (MStore.user && peerId === MStore.user.id)) return;
        var peerName = bp.username || bp.name || data.connectionId;
        var peerTag = bp.usertag || bp.tag || '';
        // Add or update friend
        var existing = MStore.friends.find(function(f) { return f.id === peerId; });
        if (!existing) {
          MStore.friends.push({
            id: peerId,
            name: peerName,
            tag: peerTag,
            status: bp.status || 'online',
            avatar: bp.avatar || null,
            bio: bp.bio || '',
            ip: null,
            publicKey: bp.publicKey || null
          });
        } else {
          existing.status = bp.status || 'online';
          existing.name = peerName;
          if (bp.avatar) existing.avatar = bp.avatar;
        }
        // Ensure chat exists
        var chatExists = MStore.chats.find(function(c) { return c.id === peerId; });
        if (!chatExists) {
          MStore.chats.push({ id: peerId, name: peerName, lastMessage: '', lastTime: '', unread: 0 });
        }
        MStore.save();
        renderFriends();
        renderChatList();
        console.log('[P2P] Beacon handshake from:', peerName);
        return;
      }

      var msgFrom = packet.from || packet.senderId || data.connectionId;
      var chatId = msgFrom;
      // Group messages carry the group ID in payload
      if (packet.payload && packet.payload.groupId) {
        chatId = packet.payload.groupId;
      }

      var chat = MStore.chats.find(function(c) { return c.id === chatId; });
      if (!chat) return;

      if (packet.type === Orbit.Protocol.Types.MESSAGE) {
        var msgText = packet.payload.text || '';

        if (packet.payload.e2ee && window.Orbit.E2EE) {
          var senderFriend = MStore.friends.find(function(f) { return f.id === msgFrom; });
          if (senderFriend && senderFriend.publicKey) {
            Orbit.E2EE.decrypt(
              packet.payload.ciphertext,
              packet.payload.nonce,
              senderFriend.publicKey
            ).then(function(decrypted) {
              if (decrypted) msgText = decrypted;
              MStore.addMessage(chatId, {
                id: 'p2p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                from: msgFrom,
                text: msgText,
                time: new Date().toISOString()
              });
              if (activeChatId === chatId) renderMessages(activeChatId);
              renderChatList();
              showIncomingNotification(chatId, msgFrom, msgText);
            });
            return;
          }
        }

        MStore.addMessage(chatId, {
          id: 'p2p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          from: msgFrom,
          text: msgText,
          time: new Date().toISOString()
        });
        if (activeChatId === chatId) renderMessages(activeChatId);
        renderChatList();
        showIncomingNotification(chatId, msgFrom, msgText);
      }

      // Handle typing indicators
      if (packet.type === Orbit.Protocol.Types.TYPING) {
        console.log('[P2P] Typing:', msgFrom, packet.payload && packet.payload.isTyping ? 'started' : 'stopped');
      }

      // Handle reactions
      if (packet.type === Orbit.Protocol.Types.REACTION) {
        var rPayload = packet.payload;
        if (rPayload && rPayload.msgId) {
          var msgs = MStore.messages[chatId] || [];
          var msgIdx = msgs.findIndex(function(m) { return String(m.id) === String(rPayload.msgId); });
          if (msgIdx >= 0) {
            if (rPayload.action === 'add') {
              msgs[msgIdx].reaction = rPayload.emoji;
            } else {
              delete msgs[msgIdx].reaction;
            }
            MStore.messages[chatId] = msgs;
            MStore.save();
            if (activeChatId === chatId) renderMessages(activeChatId);
          }
        }
      }

      // Handle GROUP_CREATE — receive group from peer
      if (packet.type === Orbit.Protocol.Types.GROUP_CREATE) {
        var gc = packet.payload || {};
        if (!gc.groupId || !gc.groupName) return;
        var exists = MStore.groups.find(function(g) { return g.id === gc.groupId; });
        if (exists) return;
        MStore.groups.push({
          id: gc.groupId,
          name: gc.groupName,
          avatar: gc.groupAvatar || null,
          description: gc.description || '',
          inviteCode: gc.inviteCode || '',
          pinned: false,
          notificationMuted: false,
          pinnedMessages: [],
          ownerId: gc.ownerId || msgFrom,
          members: gc.members || [{ userId: msgFrom, role: 'owner', joinedAt: new Date().toISOString() }],
          createdAt: gc.createdAt || new Date().toISOString()
        });
        var gcChatExists = MStore.chats.find(function(c) { return c.id === gc.groupId; });
        if (!gcChatExists) {
          MStore.chats.push({ id: gc.groupId, name: gc.groupName, avatar: gc.groupAvatar || null, lastMessage: '', lastTime: '', unread: 0 });
        }
        MStore.save();
        renderChatList();
        showToast('Added group "' + gc.groupName + '"', 'info');
        console.log('[P2P] Group created:', gc.groupName);
        return;
      }

      // Handle PIN_MESSAGE
      if (packet.type === Orbit.Protocol.Types.PIN_MESSAGE) {
        var pinPkt = packet.payload || {};
        var pinGroupId = pinPkt.groupId || chatId;
        var pinGroup = MStore.groups.find(function(g) { return g.id === pinGroupId; });
        if (pinGroup) {
          if (!pinGroup.pinnedMessages) pinGroup.pinnedMessages = [];
          if (!pinGroup.pinnedMessages.some(function(p) { return String(p.msgId) === String(pinPkt.msgId); })) {
            pinGroup.pinnedMessages.push({
              msgId: pinPkt.msgId,
              text: pinPkt.text || '',
              pinnedBy: msgFrom,
              pinnedAt: pinPkt.pinnedAt || new Date().toISOString()
            });
            MStore.save();
            if (activeChatId === pinGroupId) renderMessages(activeChatId);
          }
        }
        return;
      }

      // Handle UNPIN_MESSAGE
      if (packet.type === Orbit.Protocol.Types.UNPIN_MESSAGE) {
        var unpinPkt = packet.payload || {};
        var unpinGroupId = unpinPkt.groupId || chatId;
        var unpinGroup = MStore.groups.find(function(g) { return g.id === unpinGroupId; });
        if (unpinGroup && unpinGroup.pinnedMessages) {
          unpinGroup.pinnedMessages = unpinGroup.pinnedMessages.filter(function(p) { return String(p.msgId) !== String(unpinPkt.msgId); });
          MStore.save();
          if (activeChatId === unpinGroupId) renderMessages(activeChatId);
        }
        return;
      }

      // Handle GROUP_LEAVE — member left or was removed
      if (packet.type === Orbit.Protocol.Types.GROUP_LEAVE) {
        var gl = packet.payload || {};
        var leaveGroupId = gl.groupId;
        var leaveUserId = gl.userId || msgFrom;
        if (!leaveGroupId) return;
        // If I was removed, delete the group entirely
        if (leaveUserId === (MStore.user ? MStore.user.id : '')) {
          MStore.groups = MStore.groups.filter(function(g) { return g.id !== leaveGroupId; });
          MStore.chats = MStore.chats.filter(function(c) { return c.id !== leaveGroupId; });
          if (activeChatId === leaveGroupId) closeChat();
          showToast('You were removed from the group', 'info');
        } else {
          // Remove the leaving member
          var leaveGrp = MStore.groups.find(function(g) { return g.id === leaveGroupId; });
          if (leaveGrp) {
            leaveGrp.members = (leaveGrp.members || []).filter(function(m) {
              return (typeof m === 'string' ? m : m.userId) !== leaveUserId;
            });
            var leaveFriend = MStore.friends.find(function(f) { return f.id === leaveUserId; });
            if (leaveFriend) showToast(leaveFriend.name + ' left the group', 'info');
          }
        }
        MStore.save();
        renderChatList();
        if (activeChatId === leaveGroupId) {
          var headerInfo = document.getElementById('chat-header-info');
          if (headerInfo) {
            var grpAfter = MStore.groups.find(function(g) { return g.id === leaveGroupId; });
            if (grpAfter) {
              var sd = headerInfo.querySelector('div:last-child');
              if (sd) sd.textContent = (grpAfter.members || []).length + ' members';
            }
          }
        }
        return;
      }
    });

    // Listen for disconnections
    Orbit.P2P.onDisconnect(function(data) {
      debugLog('P2P', 'Disconnected', { connectionId: data.connectionId });
      var friend = MStore.friends.find(function(f) { return f.id === data.connectionId; });
      if (friend) {
        debugLog('P2P', 'Marking friend offline', { name: friend.name, id: friend.id });
        friend.status = 'offline';
        MStore.save();
        renderFriends();
        renderChatList();
      } else {
        debugLog('P2P', 'No friend found for disconnected ID', { id: data.connectionId });
      }
    });

    // Listen for peers found via discovery
    Orbit.P2P.onPeerFound(function(data) {
      if (!data || !data.host) {
        debugLog('P2P', 'onPeerFound called with invalid data', data);
        return;
      }
      debugLog('P2P', 'Peer found via discovery', { host: data.host, beaconType: typeof data.beacon });

      // Parse beacon — Java plugin sends it as a JSON string
      var beacon;
      try {
        beacon = typeof data.beacon === 'string' ? JSON.parse(data.beacon) : data.beacon;
      } catch(e) {
        debugLog('P2P', 'Failed to parse beacon JSON from', data.host);
        return;
      }
      if (!beacon) {
        debugLog('P2P', 'Empty beacon from', data.host);
        return;
      }

      var peerId = beacon.from || beacon.senderId;
      if (!peerId) {
        debugLog('P2P', 'Beacon missing from/senderId', beacon);
        return;
      }
      var pPayload = beacon.payload || beacon;
      var peerName = pPayload.username || pPayload.name || data.host;
      var peerTag = pPayload.usertag || pPayload.tag || '';

      // Filter out own beacon
      if (MStore.user && peerId === MStore.user.id) {
        debugLog('P2P', 'Ignoring own beacon from', data.host);
        return;
      }

      debugLog('P2P', 'Discovered peer', { id: peerId, name: peerName, host: data.host, device: pPayload.device || '?' });

      // Add or update friend
      var existing = MStore.friends.find(function(f) { return f.id === peerId; });
      if (!existing) {
        debugLog('P2P', 'Adding new friend from beacon', { name: peerName, id: peerId });
        MStore.friends.push({
          id: peerId,
          name: peerName,
          tag: peerTag,
          status: 'online',
          avatar: pPayload.avatar || null,
          bio: pPayload.bio || '',
          ip: data.host,
          publicKey: pPayload.publicKey || null
        });
        MStore.save();
        renderFriends();
      } else {
        debugLog('P2P', 'Updating existing friend status', { name: existing.name, id: peerId });
        existing.status = 'online';
        existing.ip = data.host;
        if (pPayload.avatar) existing.avatar = pPayload.avatar;
        MStore.save();
        renderFriends();
      }

      // Ensure chat exists
      var chatExists = MStore.chats.find(function(c) { return c.id === peerId; });
      if (!chatExists) {
        debugLog('P2P', 'Creating chat for new peer', { name: peerName, id: peerId });
        MStore.chats.push({ id: peerId, name: peerName, lastMessage: '', lastTime: '', unread: 0 });
        MStore.save();
        renderChatList();
      }

      // Auto-connect to peer (skip if already connected)
      var existingConn = Orbit.P2P.isPeerConnected(peerId);
      debugLog('P2P', 'Checking connection status for ' + peerName, { connected: !!existingConn });
      if (!existingConn) {
        var port = pPayload.tcpPort || 46000;
        debugLog('P2P', 'Auto-connecting to ' + peerName + ' at ' + data.host + ':' + port);
        Orbit.P2P.connect(data.host, port, peerId).then(function(result) {
          if (result.success) {
            debugLog('P2P', 'Connected to', { name: peerName, id: peerId, connectionId: result.connectionId });
            var friend = MStore.friends.find(function(f) { return f.id === peerId; });
            if (friend) {
              friend.status = 'online';
              MStore.save();
              renderFriends();
            }
          } else {
            debugLog('P2P', 'Connection to ' + peerName + ' failed', { error: result.error });
          }
        });
      } else {
        debugLog('P2P', 'Already connected to ' + peerName + ', skipping');
      }
    });
  }

  /* -- Android Hardware Back Button -- */
  document.addEventListener('backbutton', function(e) {
    e.preventDefault();
    // Close overlays in reverse priority
    if (emojiPickerOpen) {
      document.getElementById('emoji-picker-container').style.display = 'none';
      emojiPickerOpen = false;
      return;
    }
    if (_settingsOverlayOpen) {
      if (_settingsInSection) {
        backSettingsOverview();
      } else {
        hideSettingsOverlay();
      }
      return;
    }
    var galleryBackdrop = document.getElementById('gallery-overlay-backdrop');
    if (galleryBackdrop.style.display === 'block') {
      hideGallery();
      return;
    }
    var membersBackdrop = document.getElementById('members-overlay-backdrop');
    if (membersBackdrop.style.display === 'block') {
      hideGroupInfo();
      return;
    }
    var profileBackdrop = document.getElementById('profile-overlay-backdrop');
    if (profileBackdrop.style.display === 'block') {
      hideProfile();
      return;
    }
    var chatPanel = document.getElementById('panel-chat');
    if (chatPanel.classList.contains('open')) {
      closeChat();
      return;
    }
    // If no overlays open, minimize the app
    if (navigator.app && navigator.app.exitApp) {
      navigator.app.exitApp();
    }
  }, false);

  /* -- Keyboard handling (mobile) -- */
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function() {
      var panel = document.getElementById('panel-chat');
      if (panel && panel.classList.contains('open')) {
        panel.style.height = window.visualViewport.height + 'px';
        var input = document.getElementById('chat-input');
        if (input === document.activeElement) {
          setTimeout(function() {
            input.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }, 100);
        }
      }
    });
  }

  // Blur active element after touch to prevent persistent focus ring
  // (Skip inputs/textareas so the keyboard stays open while typing)
  document.addEventListener('touchend', function(e) {
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.target.closest('input, textarea, select')) return;
    if (e.target.closest('button, [role="button"], .btn, .chat-row, .friend-row, .nav-btn, .settings-row, .settings-toggle, .profile-upload-btn, .modal-btn, .msg-action-btn, .dropup-item, .create-group-btn, label, .search-btn')) {
      setTimeout(function() {
        var active = document.activeElement;
        if (active && active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA' && active.tagName !== 'SELECT') {
          active.blur();
        }
      }, 150);
    }
  });

  /* -- Apply saved settings -- */
  applyTheme(MStore.settings.theme || 'dark');
  applyBgPattern();
  applyAnimationSettings();
  document.documentElement.setAttribute('data-bubbles', MStore.settings.messageBubbles || 'Modern');

  // Listen for OS theme changes in system mode
  var mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', function() {
    if (MStore.settings.theme === 'system') {
      applyTheme('system');
    }
  });

  /* -- Init -- */
  debugLog('P2P', 'App initialization starting');
  initP2P();
  migrateOldData();
  initEmojiPicker();

  // Process static HTML icons (nav, headers, etc.)
  if (typeof lucide !== 'undefined' && renderLucide) {
    try {
      renderLucide();
      console.log('[Orbit] Lucide icons rendered');
    } catch(e) {
      console.warn('[Orbit] Lucide render error:', e);
    }
  } else {
    console.warn('[Orbit] Lucide not loaded — icons missing');
    showToast('Icons not loaded — check console', 'info');
  }

  renderChatList();
  renderFriends();
  renderSettings();
  renderActivity();

  // Init debug overlay
  updateDebugOverlay();

  // Init compact spacing from saved preference
  if (MStore.settings.experimentalCompactSpacing) {
    document.documentElement.setAttribute('data-compact-spacing', 'true');
  }

  // Init font size
  applyFontSize();

  // Init experimental data attributes
  var expAttrs = {
    'experimentalAnimatedAvatars': 'data-exp-avatars',
    'experimentalMessageFx': 'data-exp-fx',
    'experimentalMessageTranslate': 'data-exp-translate',
    'enableCustomColors': 'data-exp-colors',
    'experimentalProfileFrames': 'data-exp-frames'
  };
  Object.keys(expAttrs).forEach(function(key) {
    if (MStore.settings[key]) document.documentElement.setAttribute(expAttrs[key], 'true');
  });

  // Auto-delete attachments timer
  function runAutoDelete() {
    var interval = parseInt(MStore.settings.deleteAttachmentsAfter, 10);
    if (interval > 0) {
      var cutoff = Date.now() - interval * 60 * 1000;
      Object.keys(MStore.messages).forEach(function(chatId) {
        var msgs = MStore.messages[chatId];
        if (!msgs) return;
        var changed = false;
        msgs.forEach(function(m) {
          if (m.attachments && m.attachments.length > 0) {
            var msgTime = new Date(m.time).getTime();
            if (msgTime < cutoff) {
              m.attachments = [];
              changed = true;
            }
          }
        });
        if (changed) MStore.save();
      });
    }
    if (interval > 0) setTimeout(runAutoDelete, interval * 60 * 1000);
  }
  runAutoDelete();

  showToast('Orbit Mobile ready', 'info');

  // Attempt immersive mode on Android
  if (Orbit.env.isAndroid) {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar) {
        window.Capacitor.Plugins.StatusBar.setOverlaysWebView({ overlay: true });
      }
    } catch(e) {}
  }

  console.log('[Orbit Mobile] Started');

  // Pre-request Camera Permission on App Startup for QR Scanner
  if (/android|iphone|ipad|ipod/i.test(navigator.userAgent) && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(function(stream) {
        stream.getTracks().forEach(function(t) { t.stop(); });
        console.log('[Orbit] Camera permission granted on startup');
      })
      .catch(function(err) {
        console.warn('[Orbit] Camera permission denied on startup:', err);
      });
  }
});
