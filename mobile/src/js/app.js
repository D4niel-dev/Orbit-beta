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
    maxFileSize: 500
  },

  load() {
    this.friends = this.get('friends', []);
    this.chats = this.get('chats', []);
    this.groups = this.get('groups', []);
    this.messages = this.get('messages', {});
    this.settings = Object.assign(this.settings, this.get('settings', {}));
    this.user = this.get('user', null);

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
        membersBtn.addEventListener('click', showMembers);
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
      MStore.groups.push({
        id: groupId, name: name, avatar: groupAvatar, members: selectedMembers, createdAt: new Date().toISOString()
      });
      MStore.chats.push({ id: groupId, name: name, avatar: groupAvatar, lastMessage: '', lastTime: '', unread: 0 });
      MStore.save();
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

  function renderMessages(chatId) {
    var feed = document.getElementById('message-feed');
    var msgs = MStore.messages[chatId] || [];
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
      var actionBtns =
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
      html += '<div class="message-row ' + (isMine ? 'mine' : 'other') + '" data-msg-id="' + m.id + '">' +
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
    if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
      var packet = Orbit.Protocol.createPacket(
        Orbit.Protocol.Types.MESSAGE,
        { text: text },
        MStore.user ? MStore.user.id : 'mobile'
      );

      var sendData = packet;
      var useE2EE = false;
      if (MStore.settings.e2eeEnabled && window.Orbit.E2EE) {
        var isGroup = MStore.groups.some(function(g) { return g.id === activeChatId; });
        if (isGroup) {
          var group = MStore.groups.find(function(g) { return g.id === activeChatId; });
          (group.members || []).forEach(function(memberId) {
            var memberFriend = MStore.friends.find(function(f) { return f.id === memberId; });
            if (memberFriend && memberFriend.publicKey) {
              Orbit.E2EE.encrypt(text, memberFriend.publicKey).then(function(encrypted) {
                if (encrypted) {
                  var e2eePkt = Orbit.Protocol.createPacket(
                    Orbit.Protocol.Types.MESSAGE,
                    { e2ee: true, ciphertext: encrypted.ciphertext, nonce: encrypted.nonce, groupId: activeChatId },
                    MStore.user.id
                  );
                  Orbit.P2P.send(memberId, e2eePkt);
                  if (MStore.settings.logNetworkPackets) console.log('[NET] P2P send (e2ee group) ->', memberId, e2eePkt);
                }
              });
              useE2EE = true;
            }
          });
        } else {
          var friend = MStore.friends.find(function(f) { return f.id === activeChatId; });
          if (friend && friend.publicKey) {
            Orbit.E2EE.encrypt(text, friend.publicKey).then(function(encrypted) {
              if (encrypted) {
                var e2eePacket = Orbit.Protocol.createPacket(
                  Orbit.Protocol.Types.MESSAGE,
                  { e2ee: true, ciphertext: encrypted.ciphertext, nonce: encrypted.nonce },
                  MStore.user.id
                );
                Orbit.P2P.send(activeChatId, e2eePacket);
                if (MStore.settings.logNetworkPackets) console.log('[NET] P2P send (e2ee dm) ->', activeChatId, e2eePacket);
              }
            });
            useE2EE = true;
          }
        }
      }

      if (useE2EE) return;
      Orbit.P2P.send(activeChatId, sendData);
      if (MStore.settings.logNetworkPackets) console.log('[NET] P2P send ->', activeChatId, sendData);
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
        '<div class="settings-row" id="row-add-friend" style="cursor:pointer;">' +
          '<span class="settings-row-title" style="color:var(--accent-primary);">Add Friend</span>' +
          '<i data-lucide="user-plus" style="width:18px;height:18px;color:var(--accent-primary);flex-shrink:0;"></i>' +
        '</div>';
      case 'about':
        var friendsCount = MStore.friends.length;
        var chatsCount = MStore.chats.length;
        return '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Orbit Mobile</span><div class="settings-row-desc">v0.0.8-beta · Capacitor Android</div></div>' +
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
        break;
      case 'chat':
        bindToggle('set-enter-send', function(on) { s.enterToSend = on; MStore.save(); }, s.enterToSend);
        bindToggle('set-chat-avatars', function(on) { s.showChatAvatars = on; MStore.save(); renderChatList(); }, s.showChatAvatars !== false);
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
        var addFriendRow = document.getElementById('row-add-friend');
        if (addFriendRow) addFriendRow.addEventListener('click', showAddFriendModal);
        break;
      case 'advanced':
        bindToggle('set-dev-mode', function(on) { s.devMode = on; MStore.save(); document.documentElement.setAttribute('data-dev-mode', on ? 'true' : ''); updateDebugOverlay(); }, s.devMode);
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

  /* -- Group Members Panel -- */
  function renderMembers() {
    var container = document.getElementById('members-content');
    if (!activeChatId) return;
    var group = MStore.groups.find(function(g) { return g.id === activeChatId; });
    if (!group) {
      container.innerHTML = '<div class="empty-state"><i data-lucide="users"></i><div class="empty-state-text">Not a group</div></div>';
      renderLucide({ root: container });
      return;
    }

    var members = group.members || [];
    var groupInitial = group.name.charAt(0).toUpperCase();
    var groupAvatarHtml = group.avatar
      ? '<img src="' + escapeHtml(group.avatar) + '" style="width:48px;height:48px;border-radius:12px;object-fit:cover;">'
      : '<div style="width:48px;height:48px;border-radius:12px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:var(--accent-primary);">' + groupInitial + '</div>';
    var html = '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border-color);margin-bottom:8px;">' +
      groupAvatarHtml +
      '<div><div style="font-size:15px;font-weight:600;color:var(--text-primary);">' + escapeHtml(group.name) + '</div><div style="font-size:12px;color:var(--text-muted);">' + members.length + ' member' + (members.length !== 1 ? 's' : '') + '</div></div>' +
    '</div>';
    html += '<div class="settings-group">';
    if (members.length === 0) {
      html += '<div class="settings-row"><span class="settings-row-title" style="color:var(--text-muted);font-weight:400;">No members yet</span></div>';
    } else {
      members.forEach(function(memberId) {
        var friend = MStore.friends.find(function(f) { return f.id === memberId; });
        var name = friend ? friend.name : memberId;
        var initial = name.charAt(0).toUpperCase();
        var memberAvatarHtml = friend && friend.avatar
          ? '<img src="' + escapeHtml(friend.avatar) + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">'
          : '<div style="width:36px;height:36px;border-radius:50%;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:var(--accent-primary);flex-shrink:0;">' + initial + '</div>';
        var statusColor = friend ? ({ online: 'var(--accent-success)', away: 'var(--accent-warning)', busy: 'var(--accent-danger)', offline: 'var(--text-muted)' }[friend.status] || 'var(--text-muted)') : 'var(--text-muted)';
        html += '<div class="settings-row">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div style="position:relative;">' +
              memberAvatarHtml +
              '<span style="position:absolute;bottom:-1px;right:-1px;width:10px;height:10px;border-radius:50%;background:' + statusColor + ';border:2px solid var(--bg-base);"></span>' +
            '</div>' +
            '<div>' +
              '<span class="settings-row-title">' + escapeHtml(name) + '</span>' +
              '<div style="font-size:11px;color:var(--text-muted);">' + (friend ? (friend.status || 'offline') : 'unknown') + '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      });
    }
    html += '</div>';
    container.innerHTML = html;
    renderLucide({ root: container });
  }

  function showMembers() {
    renderMembers();
    document.getElementById('panel-members-overlay').classList.add('open');
    document.getElementById('members-overlay-backdrop').style.display = 'block';
  }

  function hideMembers() {
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

    // Attempt P2P connection
    if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
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
      showToast('P2P not available (preview mode)', 'info');
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
  document.getElementById('btn-close-members').addEventListener('click', hideMembers);
  document.getElementById('btn-close-image-preview').addEventListener('click', function() {
    document.getElementById('image-preview-overlay').classList.remove('open');
  });
  document.getElementById('image-preview-overlay').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });
  document.getElementById('members-overlay-backdrop').addEventListener('click', hideMembers);
  document.getElementById('btn-group-avatar').addEventListener('click', function() {
    var group = MStore.groups.find(function(g) { return g.id === activeChatId; });
    if (!group) return;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        var dataUrl = ev.target.result;
        group.avatar = dataUrl;
        MStore.save();
        var chat = MStore.chats.find(function(c) { return c.id === activeChatId; });
        if (chat) chat.avatar = dataUrl;
        renderMembers();
        renderChatList();
        showToast('Group avatar updated', 'info');
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });
  document.getElementById('btn-add-member').addEventListener('click', function() {
    hideMembers();
    // Ask which friend to add
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
    var group = MStore.groups.find(function(g) { return g.id === activeChatId; });
    if (group) {
      if (!group.members) group.members = [];
      if (group.members.indexOf(friend.id) === -1) {
        group.members.push(friend.id);
        MStore.save();
        showToast(friend.name + ' added to group', 'info');
        renderMembers();
        // Update header member count
        var headerInfo = document.getElementById('chat-header-info');
        var statusDiv = headerInfo.querySelector('div:last-child');
        if (statusDiv) statusDiv.textContent = group.members.length + ' members';
      } else {
        showToast(friend.name + ' is already in group', 'info');
      }
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
        status: u.status || 'online',
        bio: u.bio || '',
        publicKey: u.publicKey || null,
        profileFrame: null,
        tcpPort: 46000,
        device: 'android'
      }
    };
  }

  function initP2P() {
    if (!window.Orbit || !window.Orbit.P2P) return;
    if (!Orbit.P2P.isAvailable()) {
      console.log('[P2P] Plugin not available (web preview)');
      return;
    }

    // Start TCP server
    Orbit.P2P.startServer(46000).then(function(result) {
      if (result.success) {
        console.log('[P2P] Server started on port ' + result.port);
      }
    });

    // Start LAN discovery (sends beacon every 5s, receives beacons)
    Orbit.P2P.startDiscovery(buildBeacon());

    // Listen for incoming connections
    Orbit.P2P.onConnection(function(data) {
      console.log('[P2P] Incoming connection:', data.connectionId);
    });

    // Listen for messages
    Orbit.P2P.onMessage(function(data) {
      if (!data || !data.data) return;
      var packet = Orbit.Protocol.parsePacket(data.data);
      if (!packet) return;
      if (MStore.settings.logNetworkPackets) console.log('[NET] P2P recv <-', data.connectionId, packet);

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
    });

    // Listen for disconnections
    Orbit.P2P.onDisconnect(function(data) {
      console.log('[P2P] Disconnected:', data.connectionId);
      var friend = MStore.friends.find(function(f) { return f.id === data.connectionId; });
      if (friend) {
        friend.status = 'offline';
        MStore.save();
        renderFriends();
        renderChatList();
      }
    });

    // Listen for peers found via discovery
    Orbit.P2P.onPeerFound(function(data) {
      if (!data || !data.host) return;
      console.log('[P2P] Peer found:', data.host);

      // Parse beacon — Java plugin sends it as a JSON string
      var beacon;
      try {
        beacon = typeof data.beacon === 'string' ? JSON.parse(data.beacon) : data.beacon;
      } catch(e) {
        return;
      }
      if (!beacon) return;

      var peerId = beacon.from || beacon.senderId;
      if (!peerId) return;
      var pPayload = beacon.payload || beacon;
      var peerName = pPayload.username || pPayload.name || data.host;
      var peerTag = pPayload.usertag || pPayload.tag || '';

      // Filter out own beacon
      if (MStore.user && peerId === MStore.user.id) return;

      // Add or update friend
      var existing = MStore.friends.find(function(f) { return f.id === peerId; });
      if (!existing) {
        MStore.friends.push({
          id: peerId,
          name: peerName,
          tag: peerTag,
          status: 'online',
          avatar: null,
          bio: pPayload.bio || '',
          ip: data.host,
          publicKey: pPayload.publicKey || null
        });
        MStore.save();
        renderFriends();
      } else {
        existing.status = 'online';
        existing.ip = data.host;
        MStore.save();
        renderFriends();
      }

      // Ensure chat exists
      var chatExists = MStore.chats.find(function(c) { return c.id === peerId; });
      if (!chatExists) {
        MStore.chats.push({ id: peerId, name: peerName, lastMessage: '', lastTime: '', unread: 0 });
        MStore.save();
        renderChatList();
      }

      // Auto-connect to peer (skip if already connected)
      var existingConn = Orbit.P2P.getConnections().indexOf(peerId) >= 0;
      if (!existingConn) {
        var port = pPayload.tcpPort || 46000;
        Orbit.P2P.connect(data.host, port, peerId).then(function(result) {
          if (result.success) {
            console.log('[P2P] Connected to', peerName);
            var friend = MStore.friends.find(function(f) { return f.id === peerId; });
            if (friend) {
              friend.status = 'online';
              MStore.save();
              renderFriends();
            }
          }
        });
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
      hideMembers();
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
});
