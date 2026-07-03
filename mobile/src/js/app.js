// mobile/src/js/app.js
// Orbit Mobile — Main App Controller

console.log('[APP] app.js loaded at', new Date().toISOString());

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

  // Safe base64→ArrayBuffer decoder (atob() on Android WebView corrupts bytes >127)
  // Uses single-pass streaming decoder to avoid intermediate string allocations
  window.orbitBase64ToArrayBuffer = function orbitBase64ToArrayBuffer(b64) {
    var lookup = new Int8Array(256);
    for (var i = 0; i < 256; i++) lookup[i] = -1;
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (var i = 0; i < 64; i++) lookup[chars.charCodeAt(i)] = i;

    var validLen = 0;
    for (var i = 0; i < b64.length; i++) {
      if (lookup[b64.charCodeAt(i)] !== -1) validLen++;
    }

    var binLen = Math.floor(validLen * 3 / 4);
    if (binLen === 0) return new ArrayBuffer(0);

    var buf = new ArrayBuffer(binLen);
    var bytes = new Uint8Array(buf);

    var p = 0;
    var b = [0,0,0,0];
    var bi = 0;
    for (var i = 0; i < b64.length; i++) {
      var val = lookup[b64.charCodeAt(i)];
      if (val === -1 || val === void 0) continue;
      b[bi++] = val;
      if (bi === 4) {
        if (p < binLen) bytes[p++] = (b[0] << 2) | (b[1] >> 4);
        if (p < binLen) bytes[p++] = ((b[1] & 15) << 4) | (b[2] >> 2);
        if (p < binLen) bytes[p++] = ((b[2] & 3) << 6) | b[3];
        bi = 0;
      }
    }
    if (bi > 0) {
      while (bi < 4) b[bi++] = 0;
      if (p < binLen) bytes[p++] = (b[0] << 2) | (b[1] >> 4);
      if (p < binLen) bytes[p++] = ((b[1] & 15) << 4) | (b[2] >> 2);
      if (p < binLen) bytes[p++] = ((b[2] & 3) << 6) | b[3];
    }
    return buf;
  };
  window.orbitBase64ToBlob = function orbitBase64ToBlob(b64, mime) {
    var buf = window.orbitBase64ToArrayBuffer(b64);
    if (!buf || buf.byteLength === 0) return null;
    try { return URL.createObjectURL(new Blob([buf], { type: mime })); } catch(e) { return null; }
  };

  /* ---- IndexedDB Blob Store (for large files >10MB that don't fit in localStorage) ---- */
  window.BlobStoreDB = {
    _db: null,
    _ready: null,
    _open: function() {
      if (this._ready) return this._ready;
      var self = this;
      this._ready = new Promise(function(resolve, reject) {
        try {
          var req = indexedDB.open('OrbitBlobStore', 1);
          req.onupgradeneeded = function(e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains('blobs')) {
              db.createObjectStore('blobs');
            }
          };
          req.onsuccess = function(e) {
            self._db = e.target.result;
            self._db.onversionchange = function() { self._db.close(); };
            resolve();
          };
          req.onerror = function(e) {
            console.warn('[BlobStoreDB] open failed:', e.target.error);
            reject(e.target.error);
          };
        } catch(e) {
          console.warn('[BlobStoreDB] indexedDB unavailable:', e.message);
          reject(e);
        }
      });
      return this._ready;
    },
    put: function(key, arrayBuffer) {
      var self = this;
      return this._open().then(function() {
        return new Promise(function(resolve, reject) {
          try {
            var tx = self._db.transaction('blobs', 'readwrite');
            tx.objectStore('blobs').put(arrayBuffer, key);
            tx.oncomplete = function() { resolve(); };
            tx.onerror = function(e) { reject(e.target.error); };
          } catch(e) { reject(e); }
        });
      });
    },
    get: function(key) {
      var self = this;
      return this._open().then(function() {
        return new Promise(function(resolve, reject) {
          try {
            var tx = self._db.transaction('blobs', 'readonly');
            var req = tx.objectStore('blobs').get(key);
            req.onsuccess = function(e) { resolve(e.target.result); };
            req.onerror = function(e) { reject(e.target.error); };
          } catch(e) { reject(e); }
        });
      });
    },
    'delete': function(key) {
      var self = this;
      return this._open().then(function() {
        return new Promise(function(resolve, reject) {
          try {
            var tx = self._db.transaction('blobs', 'readwrite');
            tx.objectStore('blobs')['delete'](key);
            tx.oncomplete = function() { resolve(); };
            tx.onerror = function(e) { reject(e.target.error); };
          } catch(e) { reject(e); }
        });
      });
    }
  };

  // Restore large-file blob attachments from IndexedDB after loading from localStorage
  window._restoreAllBlobAttachments = function _restoreAllBlobAttachments() {
    var allMsgs = MStore.messages || {};
    var restorePromises = [];
    for (var cid in allMsgs) {
      var msgs = allMsgs[cid];
      if (!Array.isArray(msgs)) continue;
      for (var mi = 0; mi < msgs.length; mi++) {
        var atts = msgs[mi].attachments;
        if (!Array.isArray(atts)) continue;
        for (var ai = 0; ai < atts.length; ai++) {
          var a = atts[ai];
          if (a._blobKey && (!a.url || a.url.indexOf('blob:') === 0)) {
            // Dead blob URL — restore from IndexedDB
            (function(attachment, chatId) {
              restorePromises.push(
                window.BlobStoreDB.get(attachment._blobKey).then(function(ab) {
                  if (!ab) { console.warn('[BlobStore] no data for key', attachment._blobKey); return; }
                  var mime = attachment.mimeType || 'application/octet-stream';
                  try {
                    var newUrl = URL.createObjectURL(new Blob([ab], { type: mime }));
                    attachment.url = newUrl;
                    MStore._saveMsgs(chatId);
                  } catch(e) {
                    console.warn('[BlobStore] createObjectURL failed:', e.message);
                  }
                }).catch(function(err) {
                  console.warn('[BlobStore] restore failed for', attachment._blobKey, err);
                })
              );
            })(a, cid);
          }
        }
      }
    }
    return Promise.all(restorePromises);
  };

  migrateOldData(); // copy unprefixed keys before MStore reads orbit_* keys
  MStore.load();
  // Restore blob attachments asynchronously (non-blocking — will re-render when done)
  window._restoreAllBlobAttachments().then(function() {
    console.log('[BlobStore] All blob attachments restored');
    if (activeChatId) renderMessages(activeChatId);
  });

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
  /* ─── End-of-list cat footer ─── */
  function endOfListHTML() {
    return '<div class="end-of-list">' +
      '<pre class="end-of-list-cat" style="font-family: monospace; line-height: 1.2; letter-spacing: 0;">' +
        '   |\\      _,,,---,,_\n' +
        '   /,`.-\'`\'    -.  ;-;;,_\n' +
        '  |,4-  ) )-,_..;\\ (  `\'-\'\n' +
        ' \'---\'\'(_/--\'  `-\'\\_)' +
      '</pre>' +
      '<div class="end-of-list-text">Nothing else to see here...</div>' +
    '</div>';
  }

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
        '<div class="empty-state"><i data-lucide="message-circle"></i>' +
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
      var chatFrameHtml = '';
      if (MStore.settings.showChatAvatars !== false) {
        var initial = c.name ? c.name.charAt(0).toUpperCase() : '?';
        avatarHtml = c.avatar
          ? '<img src="' + escapeHtml(c.avatar) + '" alt="">'
          : initial;
        if (isGroup) {
          var group = groupIds[c.id];
          var memberCount = group && group.members ? group.members.length : 0;
          statusDot = '<span style="font-size:10px;color:var(--text-muted);background:var(--bg-hover);padding:1px 6px;border-radius:8px;margin-left:auto;">' + memberCount + '</span>';
        } else {
          var statusClass = c.status && c.status !== 'offline' ? c.status : '';
          statusDot = statusClass ? '<div class="chat-row-status-dot ' + statusClass + '"></div>' : '';
          if (statusClass) {
            avatarHtml = '<div class="avatar-glow-' + statusClass + '" style="border-radius:50%;width:100%;height:100%;overflow:hidden;display:flex;align-items:center;justify-content:center;">' + avatarHtml + '</div>';
          }
          // Profile frame for DM avatars
          if (MStore.settings.experimentalProfileFrames) {
            var cf = MStore.friends.find(function(f) { return f.id === c.id; });
            var cfNum = cf ? getProfileFrame(cf) : 0;
            if (cfNum > 0) {
              chatFrameHtml = '<img src="icons/frames/pfp_frame_' + cfNum + '.png" class="pfp-frame" style="position:absolute;top:-15%;left:-17%;pointer-events:none;" draggable="false" alt="">';
            }
          }
        }
      }
      // Check if last message has attachments
      var hasAtt = false;
      var chatMsgs = MStore.getMessages(c.id);
      if (chatMsgs.length > 0) {
        var last = chatMsgs[chatMsgs.length - 1];
        hasAtt = last && last.attachments && last.attachments.length > 0;
      }
      var previewHtml = '';
      if (hasAtt) {
        previewHtml += '<i data-lucide="paperclip" class="chat-row-attachment-icon"></i>';
      }
      previewHtml += escapeHtml(c.lastMessage || 'No messages yet');
      var rowClass = 'chat-row';
      if (c.unread > 0) rowClass += ' unread';
      return '<div class="' + rowClass + '" data-chat="' + c.id + '">' +
        (MStore.settings.showChatAvatars !== false
          ? '<div class="chat-row-avatar-wrapper">' +
            '<div class="chat-row-avatar"' + (isGroup ? ' style="border-radius:12px;"' : '') + '>' + avatarHtml + '</div>' +
            chatFrameHtml +
            statusDot +
          '</div>'
          : '') +
        '<div class="chat-row-info">' +
          '<div class="chat-row-name">' + escapeHtml(c.name) + '</div>' +
          '<div class="chat-row-preview">' + previewHtml + '</div>' +
        '</div>' +
        '<div class="chat-row-meta">' +
          '<div class="chat-row-time">' + timeStr + '</div>' +
          (c.unread > 0 ? '<div class="chat-row-badge premium-badge">' + (c.unread > 99 ? '99+' : c.unread) + '</div>' : '') +
        '</div>' +
      '</div>';
    }

    var html = '';

    // Direct Messages section
    if (dms.length > 0) {
      html += '<div class="chat-section-header"><i data-lucide="message-circle" style="width:14px;height:14px;"></i> Direct Messages</div>';
      html += '<div>';
      dms.forEach(function(c) { html += renderChatRow(c, false); });
      html += '</div>';
    }

    // Groups section
    if (grpChats.length > 0) {
      html += '<div class="chat-section-header"><i data-lucide="users" style="width:14px;height:14px;"></i> Groups</div>';
      html += '<div>';
      grpChats.forEach(function(c) { html += renderChatRow(c, true); });
      html += '</div>';
    }

    // Create Group button
    html += '<div class="create-group-btn" id="btn-create-group" style="border-top:none;margin-top:0;"><i data-lucide="plus-circle" style="width:16px;height:16px;"></i> Create Group</div>';

    html += endOfListHTML();

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
      if (myId) memberList.push({ userId: myId, role: 'owner', joinedAt: new Date().toISOString(), name: MStore.user ? (MStore.user.name || MStore.user.username || '') : '', avatar: MStore.user ? (MStore.user.avatar || null) : null });
      selectedMembers.forEach(function(id) {
        if (id !== myId) {
          var friendData = MStore.friends.find(function(f) { return f.id === id; });
          memberList.push({ userId: id, role: 'member', joinedAt: new Date().toISOString(), name: friendData ? friendData.name : '', avatar: friendData ? (friendData.avatar || null) : null });
        }
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
            var packet = Orbit.Protocol.createPacket(Orbit.Protocol.Types.GROUP_CREATE, myId, m.userId, {
              groupId: groupId,
              groupName: name,
              groupAvatar: groupAvatar,
              ownerId: myId,
              members: memberList,
              inviteCode: inviteCode,
              description: ''
            });
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
      var rFallback = '';
      if (!rText && replyingTo.attachments && replyingTo.attachments.length > 0) {
        rFallback = '(' + replyingTo.attachments[0].name + ')';
      } else if (!rText) {
        rFallback = '(Attachment)';
      }
      bar.innerHTML =
        '<i data-lucide="reply" style="width:14px;height:14px;flex-shrink:0;"></i>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Replying to <b>' + escapeHtml(replyingTo.senderName || 'message') + '</b>: ' + escapeHtml(rText || rFallback) + '</span>' +
        '<button id="btn-cancel-edit-reply" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px;font-size:16px;">&times;</button>';
      renderLucide({ root: bar });
    } else {
      bar.style.display = 'none';
    }
  }

  function startReply(msgId) {
    var msgs = MStore.getMessages(activeChatId);
    var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
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
    replyingTo = { id: msg.id, text: msg.text, senderName: senderName, attachments: msg.attachments || msg.fileAttachments || null };
    editingMsg = null;
    updateReplyEditBar();
    var inp = document.getElementById('chat-input');
    if (inp) inp.focus();
  }

  function startEdit(msgId) {
    var msgs = MStore.getMessages(activeChatId);
    var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
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

  function translateMessage(msgId) {
    var msgs = MStore.getMessages(activeChatId);
    var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
    if (!msg || !msg.text) return;
    var bubble = document.querySelector('.message-row[data-msg-id="' + msgId + '"] .message-bubble');
    if (!bubble) return;
    var existing = bubble.querySelector('.translated-text');
    if (existing) { existing.remove(); return; }
    var targetLang = MStore.settings.translateTargetLang || (navigator.language || 'en').split('-')[0] || 'en';
    var sourceLang = MStore.settings.autoDetectSource !== false ? 'auto' : 'en';
    var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(msg.text) + '&langpair=' + sourceLang + '|' + targetLang;
    var div = document.createElement('div');
    div.className = 'translated-text';
    div.textContent = 'Translating...';
    bubble.appendChild(div);
    fetch(url).then(function(r) { return r.json(); }).then(function(data) {
      if (data && data.responseData && data.responseData.translatedText) {
        div.textContent = '🌐 ' + data.responseData.translatedText;
      } else {
        div.textContent = 'Translation unavailable';
      }
    }).catch(function() {
      div.textContent = 'Translation failed';
    });
  }

  function sendReaction(chatId, msgId, emoji, action) {
    if (!window.Orbit || !Orbit.P2P || !Orbit.P2P.isAvailable()) return;
    var myId = MStore.user ? MStore.user.id : 'mobile';
    var isGroup = MStore.groups.some(function(g) { return g.id === chatId; });
    if (isGroup) {
      var grp = MStore.groups.find(function(g) { return g.id === chatId; });
      if (grp) {
        (grp.members || []).forEach(function(m) {
          var mid = typeof m === 'string' ? m : m.userId;
          if (mid !== myId) {
            var pkt = Orbit.Protocol.createPacket(
              Orbit.Protocol.Types.REACTION, myId, mid,
              { msgId: msgId, emoji: emoji, action: action, userId: myId, groupId: chatId }
            );
            Orbit.P2P.send(mid, pkt);
          }
        });
      }
    } else {
      // DM reaction: NO chatId in payload (would overwrite receiver's chat lookup)
      var pkt = Orbit.Protocol.createPacket(
        Orbit.Protocol.Types.REACTION, myId, chatId,
        { msgId: msgId, emoji: emoji, action: action, userId: myId }
      );
      Orbit.P2P.send(chatId, pkt);
    }
  }

  function applyReactionLocally(chatId, msgId, emoji, action) {
    var msgs = MStore.getMessages(chatId);
    if (!msgs.length) return;
    var myId = MStore.user ? MStore.user.id : '';
    for (var i = 0; i < msgs.length; i++) {
      if (String(msgs[i].id) === String(msgId)) {
        var reactions = msgs[i].reactions ? msgs[i].reactions.slice() : [];
        var existingIdx = reactions.findIndex(function(r) { return r.emoji === emoji && r.userId === myId; });
        if (action === 'add' && existingIdx < 0) {
          reactions.push({ emoji: emoji, userId: myId });
        } else if (action === 'remove' && existingIdx >= 0) {
          reactions.splice(existingIdx, 1);
        }
        msgs[i].reactions = reactions;
        break;
      }
    }
    MStore._saveMsgs(chatId);
    if (activeChatId === chatId) renderMessages(chatId);
  }

  function toggleReaction(msgId, pillEl) {
    if (!activeChatId) return;
    var msgs = MStore.getMessages(activeChatId);
    var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
    if (!msg) return;
    var emoji = pillEl.querySelector('span') ? pillEl.querySelector('span').textContent : '';
    if (!emoji) return;
    var myId = MStore.user ? MStore.user.id : '';
    var hasReacted = msg.reactions && msg.reactions.some(function(r) { return r.emoji === emoji && r.userId === myId; });
    var action = hasReacted ? 'remove' : 'add';
    applyReactionLocally(activeChatId, msgId, emoji, action);
    sendReaction(activeChatId, msgId, emoji, action);
  }

  var _reactionPickerEl = null;
  function showReactionPicker(btnEl, msgId) {
    if (_reactionPickerEl) { _reactionPickerEl.remove(); _reactionPickerEl = null; return; }
    var emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
    var myId = MStore.user ? MStore.user.id : '';
    var msgs = MStore.getMessages(activeChatId);
    var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
    var picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.style.cssText = 'position:fixed;z-index:9999;background:var(--surface-color);border:1px solid var(--border-color);border-radius:12px;padding:6px;display:flex;gap:4px;box-shadow:0 4px 16px rgba(0,0,0,0.3);';
    var rect = btnEl.getBoundingClientRect();
    picker.style.left = Math.max(8, rect.left + rect.width / 2 - 140) + 'px';
    picker.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    emojis.forEach(function(emoji) {
      var hasReacted = msg && msg.reactions && msg.reactions.some(function(r) { return r.emoji === emoji && r.userId === myId; });
      var el = document.createElement('span');
      el.textContent = emoji;
      el.style.cssText = 'font-size:24px;cursor:pointer;padding:4px 8px;border-radius:8px;transition:background 0.15s;' + (hasReacted ? 'background:var(--accent-primary-alpha);' : '');
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var action = hasReacted ? 'remove' : 'add';
        applyReactionLocally(activeChatId, msgId, emoji, action);
        sendReaction(activeChatId, msgId, emoji, action);
        if (_reactionPickerEl) { _reactionPickerEl.remove(); _reactionPickerEl = null; }
      });
      picker.appendChild(el);
    });
    document.body.appendChild(picker);
    _reactionPickerEl = picker;
    function closePicker(e) {
      if (!picker.contains(e.target) && e.target !== btnEl) {
        picker.remove();
        _reactionPickerEl = null;
        document.removeEventListener('click', closePicker);
      }
    }
    setTimeout(function() { document.addEventListener('click', closePicker); }, 0);
  }

  function confirmDeleteMessage(msgId) {
    if (!confirm('Delete this message? This cannot be undone.')) return;
    MStore.deleteMessage(activeChatId, msgId);
    renderMessages(activeChatId);
    renderChatList();
  }

  function showForwardModal(msgId) {
    var msgs = MStore.getMessages(activeChatId);
    var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
    if (!msg) return;

    var senderName = 'Unknown';
    if (msg.from === 'me') {
      senderName = MStore.user ? MStore.user.name : 'You';
    } else if (msg.from === 'echo') {
      senderName = 'Orbit Echo';
    } else {
      var friend = MStore.friends.find(function(f) { return f.id === msg.from; });
      if (friend) {
        senderName = friend.name;
      } else {
        var group = MStore.groups.find(function(g) { return g.id === activeChatId; });
        if (group) {
          var member = group.members.find(function(m) {
            var mid = typeof m === 'string' ? m : m.userId;
            return mid === msg.from;
          });
          senderName = member ? (typeof member === 'string' ? member : (member.username || member.name || member.userId)) : msg.from;
        }
      }
    }

    var forwardedText = 'Forwarded from ' + senderName + ': ' + (msg.text || '');

    var existing = document.querySelector('.forward-modal-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.className = 'forward-modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);z-index:9999;display:flex;flex-direction:column;';

    var allContacts = [];
    MStore.chats.forEach(function(c) {
      if (c.id !== activeChatId) {
        var isGroup = MStore.groups.some(function(g) { return g.id === c.id; });
        allContacts.push({ id: c.id, name: c.name, avatar: c.avatar, type: isGroup ? 'group' : 'friend' });
      }
    });

    var contactListHtml = '';
    allContacts.forEach(function(c) {
      var initial = c.name ? c.name.charAt(0).toUpperCase() : '?';
      var avatarHtml = c.avatar
        ? '<img src="' + escapeHtml(c.avatar) + '" style="width:44px;height:44px;border-radius:' + (c.type === 'group' ? '12px' : '50%') + ';object-fit:cover;">'
        : '<div style="width:44px;height:44px;border-radius:' + (c.type === 'group' ? '12px' : '50%') + ';background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-weight:700;color:white;font-size:18px;">' + initial + '</div>';
      var typeLabel = c.type === 'group' ? 'Group' : 'Direct Message';
      contactListHtml += '<div class="forward-contact-row" data-contact-id="' + escapeHtml(c.id) + '" style="display:flex;align-items:center;gap:14px;padding:12px 16px;cursor:pointer;border-bottom:1px solid var(--border-subtle);">' +
        avatarHtml +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:16px;font-weight:600;color:var(--text-primary);">' + escapeHtml(c.name) + '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);">' + typeLabel + '</div>' +
        '</div>' +
      '</div>';
    });

    var preview = forwardedText.substring(0, 50) + (forwardedText.length > 50 ? '...' : '');

    overlay.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border-subtle);background:var(--bg-surface);flex-shrink:0;">' +
        '<span style="font-size:17px;font-weight:700;color:var(--text-primary);">Forward Message</span>' +
        '<button id="forward-modal-close" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);padding:4px;"><i data-lucide="x" style="width:22px;height:22px;"></i></button>' +
      '</div>' +
      '<div style="padding:10px 16px;background:var(--bg-hover);border-bottom:1px solid var(--border-subtle);flex-shrink:0;">' +
        '<input id="forward-search-input" type="text" placeholder="Search chats..." autofocus style="width:100%;padding:10px 14px;border-radius:10px;border:1px solid var(--border-subtle);background:var(--bg-surface);color:var(--text-primary);font-size:15px;outline:none;box-sizing:border-box;">' +
        '<div style="font-size:12px;color:var(--text-muted);margin-top:6px;padding:0 2px;">Forwarding: ' + escapeHtml(preview) + '</div>' +
      '</div>' +
      '<div id="forward-contact-list" style="flex:1;overflow-y:auto;background:var(--bg-surface);">' +
        contactListHtml +
      '</div>';

    document.body.appendChild(overlay);
    renderLucide({ root: overlay });

    document.getElementById('forward-modal-close').addEventListener('click', function() { overlay.remove(); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    var searchInput = document.getElementById('forward-search-input');
    if (searchInput) {
      searchInput.focus();
      searchInput.addEventListener('input', function() {
        var q = this.value.trim().toLowerCase();
        var rows = overlay.querySelectorAll('.forward-contact-row');
        rows.forEach(function(row) {
          var nameEl = row.querySelector('div > div:first-child');
          if (nameEl) {
            var name = nameEl.textContent.toLowerCase();
            row.style.display = name.indexOf(q) !== -1 ? 'flex' : 'none';
          }
        });
      });
    }

    overlay.querySelectorAll('.forward-contact-row').forEach(function(row) {
      row.addEventListener('click', function() {
        var targetId = this.getAttribute('data-contact-id');
        if (!targetId) return;

        var newMsg = {
          id: 'm' + Date.now() + Math.random().toString(36).slice(2, 6),
          from: 'me',
          text: forwardedText,
          time: new Date().toISOString(),
          forwardedFrom: senderName
        };
        if (msg.attachments && msg.attachments.length > 0) {
          newMsg.attachments = msg.attachments.map(function(a) { return Object.assign({}, a); });
        }
        if (MStore.user) newMsg.fromName = MStore.user.name;

        MStore.addMessage(targetId, newMsg);

        // Send over P2P if available
        if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
          var isGroup = MStore.groups.some(function(g) { return g.id === targetId; });
          var myId = MStore.user ? MStore.user.id : 'mobile';
          var targetName = '';
          var contact = allContacts.find(function(c) { return c.id === targetId; });
          if (contact) targetName = contact.name;

          var payload = {
            text: forwardedText,
            msgId: newMsg.id,
            forwardedFrom: senderName
          };
          if (newMsg.attachments) payload.attachments = newMsg.attachments;

          if (isGroup) {
            var grp = MStore.groups.find(function(g) { return g.id === targetId; });
            if (grp) {
              (grp.members || []).forEach(function(m) {
                var mid = typeof m === 'string' ? m : m.userId;
                if (mid !== myId) {
                  var fwdPkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.MESSAGE, myId, mid, payload);
                  Orbit.P2P.send(mid, fwdPkt);
                }
              });
            }
          } else {
            var dmPkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.MESSAGE, myId, targetId, payload);
            Orbit.P2P.send(targetId, dmPkt);
          }
        }

        renderChatList();
        showToast('Forwarded to ' + targetName, 'info');
        overlay.remove();
      });
    });
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
    var msgs = MStore.getMessages(chatId);
    // Resolve attachment URLs without mutating store objects (avoids silent data loss)
    window._dataUrlCache = window._dataUrlCache || {};
    function _resUrl(a) {
      var u = a && a.url;
      if (!u) return '';
      // data: URL → blob: URL (performance, cached)
      if (u.indexOf('data:') === 0) {
        // Audio/video: pass raw data: URL to player — decoded lazily on first play
        if (a.type === 'audio' || a.type === 'video') return u;
        if (!window._dataUrlCache[u]) window._dataUrlCache[u] = _dataUrlToBlobUrl(u);
        return window._dataUrlCache[u];
      }
      // Dead blob: URL → reconstruct from persisted _dataUrl or _blobKey (IndexedDB)
      if (u.indexOf('blob:') === 0 && (a._dataUrl || a._blobKey)) {
        // Audio/video: let player handle lazily from raw _dataUrl
        if ((a.type === 'audio' || a.type === 'video') && a._dataUrl) return a._dataUrl;
        if (a._dataUrl) {
          if (!window._dataUrlCache[a._dataUrl]) window._dataUrlCache[a._dataUrl] = _dataUrlToBlobUrl(a._dataUrl);
          return window._dataUrlCache[a._dataUrl];
        }
        // _blobKey but no _dataUrl: schedule async restore (so it re-renders with live URL)
        // Return placeholder URL; the async restore will update a.url and re-render
        if (!window._restoreQueue) window._restoreQueue = {};
        if (!window._restoreQueue[a._blobKey]) {
          window._restoreQueue[a._blobKey] = true;
          window.BlobStoreDB.get(a._blobKey).then(function(ab) {
            if (!ab) return;
            window._restoreQueue[a._blobKey] = false;
            try {
              var mime = a.mimeType || 'application/octet-stream';
              var newUrl = URL.createObjectURL(new Blob([ab], { type: mime }));
              a.url = newUrl;
              if (activeChatId) renderMessages(activeChatId);
            } catch(e) { console.warn('[BlobStore] createObjectURL during restore:', e.message); }
          }).catch(function(err) {
            console.warn('[BlobStore] async restore failed:', a._blobKey, err);
            window._restoreQueue[a._blobKey] = false;
          });
        }
        // Return a placeholder indicator so the inline style below can show "Restoring..."
        return '';
      }
      return u;
    }
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
    var prevSender = null;
    var prevTime = null;
    var prevIsMine = null;
    msgs.forEach(function(m) {
      var isMine = m.from === 'me';
      var currentSender = isGroup && !isMine ? m.from : null;
      // Group consecutive messages from same sender within 5 min
      var isGrouped = false;
      if (prevSender === currentSender && prevIsMine === isMine) {
        var timeDiff = prevTime && m.time ? new Date(m.time) - new Date(prevTime) : Infinity;
        if (timeDiff < 300000) { // 5 minutes
          isGrouped = true;
        }
      }
      prevSender = currentSender;
      prevTime = m.time;
      prevIsMine = isMine;

      var senderLabel = '';
      if (isGroup && !isMine && !isGrouped) {
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
          if (!rpText && origMsg.attachments && origMsg.attachments.length > 0) {
            rpText = '(' + origMsg.attachments[0].name + ')';
          } else if (!rpText) {
            rpText = '(Attachment)';
          }
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
      var grpPinned = isGroup ? ((MStore.groups.find(function(g) { return g.id === chatId; }) || {}).pinnedMessages || []) : [];
      var msgPinned = grpPinned.some(function(p) { return String(p.msgId) === String(m.id); });
      var pinBtn = isGroup
        ? '<button class="msg-action-btn msg-pin-btn" data-msg-id="' + m.id + '" title="' + (msgPinned ? 'Unpin' : 'Pin') + '" style="color:' + (msgPinned ? 'var(--accent-primary)' : '') + ';">' +
          '<i data-lucide="pin" style="width:15px;height:15px;' + (msgPinned ? '' : 'transform:rotate(45deg);') + '"></i></button>'
        : '';
      var actionBtns = pinBtn +
        '<button class="msg-action-btn msg-reply-btn" data-msg-id="' + m.id + '" title="Reply">' +
          '<i data-lucide="reply" style="width:15px;height:15px;"></i></button>' +
        '<button class="msg-action-btn msg-forward-btn" data-msg-id="' + m.id + '" title="Forward">' +
          '<i data-lucide="send" style="width:15px;height:15px;"></i></button>' +
        '<button class="msg-action-btn msg-react-btn" data-msg-id="' + m.id + '" title="React"><i data-lucide="smile-plus" style="width:15px;height:15px;"></i></button>' +
        '<button class="msg-action-btn msg-translate-btn" data-msg-id="' + m.id + '" title="Translate"><i data-lucide="languages" style="width:15px;height:15px;"></i></button>' +
        (isMine
          ? '<button class="msg-action-btn msg-edit-btn" data-msg-id="' + m.id + '" title="Edit">' +
            '<i data-lucide="pencil" style="width:15px;height:15px;"></i></button>' +
            '<button class="msg-action-btn msg-delete-btn" data-msg-id="' + m.id + '" title="Delete" style="color:var(--accent-danger);">' +
            '<i data-lucide="trash-2" style="width:15px;height:15px;"></i></button>'
          : '<button class="msg-action-btn msg-delete-btn" data-msg-id="' + m.id + '" title="Delete" style="color:var(--accent-danger);">' +
            '<i data-lucide="trash-2" style="width:15px;height:15px;"></i></button>');
      var actionsHtml = '<div class="msg-actions-bar">' + actionBtns + '</div>';
      // Edited badge
      var editedBadge = m.edited ? '<span style="font-size:10px;color:var(--text-muted);margin-left:4px;">(edited)</span>' : '';
      // Attachments — separated: images/files in grid, video/audio standalone
      var attachmentsHtml = '';
      if (m.attachments && m.attachments.length > 0) {
        var gridHtml = '';
        var largeHtml = '';
        var hasText = m.text && m.text.trim();
        var showImages = MStore.settings.showImagePreviews !== false;
          m.attachments.forEach(function(a) {
            var safeAttId = escapeHtml(String(a.id || ''));
            var attUrl = _resUrl(a);
            if (a.type === 'video') {
              if (attUrl) {
                largeHtml += '<div class="att-large-cell att-video-cell ovp-placeholder" data-ovp-url="' + escapeHtml(attUrl) + '" data-open-video="' + safeAttId + '" data-msg-id="' + m.id + '"></div>';
              } else if (a._pending) {
                largeHtml += '<div class="att-large-cell att-video-cell" style="display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg-panel);color:var(--text-muted);border:1px solid var(--border-subtle);border-radius:8px;height:200px;">' +
                  '<i data-lucide="video" style="width:32px;height:32px;margin-bottom:8px;opacity:0.5;"></i><div style="font-size:13px;font-weight:500;">Receiving Video...</div></div>';
              } else if (a._blobKey) {
                largeHtml += '<div class="att-large-cell att-video-cell" style="display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg-panel);color:var(--text-muted);border:1px solid var(--border-subtle);border-radius:8px;height:200px;">' +
                  '<i data-lucide="hard-drive" style="width:28px;height:28px;margin-bottom:8px;opacity:0.5;"></i><div style="font-size:13px;font-weight:500;">Restoring...</div></div>';
              } else {
                gridHtml += '<div class="att-grid-cell att-file-cell"><i data-lucide="file" style="width:28px;height:28px;margin-bottom:6px;color:var(--text-muted);"></i><div class="att-file-name">' + escapeHtml(String(a.name || 'File')) + '</div></div>';
              }
            } else if (a.type === 'audio') {
              if (attUrl) {
                largeHtml += '<div class="att-large-cell att-audio-cell oap-placeholder" data-oap-url="' + escapeHtml(attUrl) + '"></div>';
              } else if (a._pending) {
                largeHtml += '<div class="att-large-cell att-audio-cell" style="display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg-panel);color:var(--text-muted);border:1px solid var(--border-subtle);border-radius:8px;height:120px;">' +
                  '<i data-lucide="music" style="width:28px;height:28px;margin-bottom:8px;opacity:0.5;"></i><div style="font-size:13px;font-weight:500;">Receiving Audio...</div></div>';
              } else if (a._blobKey) {
                largeHtml += '<div class="att-large-cell att-audio-cell" style="display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg-panel);color:var(--text-muted);border:1px solid var(--border-subtle);border-radius:8px;height:120px;">' +
                  '<i data-lucide="hard-drive" style="width:28px;height:28px;margin-bottom:8px;opacity:0.5;"></i><div style="font-size:13px;font-weight:500;">Restoring...</div></div>';
              } else {
                gridHtml += '<div class="att-grid-cell att-file-cell"><i data-lucide="file" style="width:28px;height:28px;margin-bottom:6px;color:var(--text-muted);"></i><div class="att-file-name">' + escapeHtml(String(a.name || 'File')) + '</div></div>';
              }
            } else if (a.type === 'image') {
              if (attUrl) {
                if (showImages) {
                  gridHtml += '<div class="att-grid-cell" data-open-image="' + safeAttId + '" data-msg-id="' + m.id + '">' +
                    '<img src="' + escapeHtml(attUrl) + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy">' +
                  '</div>';
                }
              } else if (a._pending) {
                gridHtml += '<div class="att-grid-cell" style="display:flex;align-items:center;justify-content:center;background:var(--bg-panel);color:var(--text-muted);"><i data-lucide="image" style="width:24px;height:24px;opacity:0.5;"></i></div>';
              } else if (a._blobKey) {
                gridHtml += '<div class="att-grid-cell" style="display:flex;align-items:center;justify-content:center;background:var(--bg-panel);color:var(--text-muted);"><i data-lucide="hard-drive" style="width:24px;height:24px;opacity:0.5;"></i></div>';
              } else {
              gridHtml += '<div class="att-grid-cell att-file-cell"><i data-lucide="file" style="width:28px;height:28px;margin-bottom:6px;color:var(--text-muted);"></i><div class="att-file-name">' + escapeHtml(String(a.name || 'File')) + '</div></div>';
            }
          } else {
            gridHtml += '<div class="att-grid-cell att-file-cell">' +
              '<i data-lucide="file" style="width:28px;height:28px;margin-bottom:6px;color:var(--text-muted);"></i>' +
              '<div class="att-file-name">' + escapeHtml(String(a.name || 'File')) + '</div>' +
            '</div>';
          }
        });
        var gridSection = gridHtml ? '<div class="att-grid" data-count="' + (m.attachments.filter(function(x){return x.type!=='video'&&x.type!=='audio';}).length) + '">' + gridHtml + '</div>' : '';
        attachmentsHtml = (gridSection ? gridSection + '<div style="height:6px;"></div>' : '') + largeHtml;
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
      var reactionsHtml = '';
      if (m.reactions && m.reactions.length > 0) {
        var rxGroups = {};
        m.reactions.forEach(function(r) {
          if (!rxGroups[r.emoji]) rxGroups[r.emoji] = [];
          rxGroups[r.emoji].push(r.userId);
        });
        var rxHtml = '';
        for (var emoji in rxGroups) {
          var count = rxGroups[emoji].length;
          var hasMe = rxGroups[emoji].indexOf(MStore.user ? MStore.user.id : '') !== -1;
          rxHtml += '<div class="reaction-pill' + (hasMe ? ' mine' : '') + '">' +
            '<span>' + escapeHtml(emoji) + '</span>' +
            (count > 1 ? '<span class="reaction-pill-count">' + count + '</span>' : '') +
            '</div>';
        }
        reactionsHtml = '<div class="reactions-row">' + rxHtml + '</div>';
      }

      html += '<div class="message-row ' + (isMine ? 'mine' : 'other') + (isGrouped ? ' grouped' : '') + '" data-msg-id="' + m.id + '" data-msg-anim="' + (MStore.settings.messageAnim || 'slide') + '">' +
        '<div class="message-bubble">' +
          actionsHtml +
          senderLabel +
          replyHtml +
          '<div class="msg-text-mob">' + (window.Sanitize ? window.Sanitize.markdown(m.text) : escapeHtml(m.text)) + editedBadge + '</div>' +
          attachmentsHtml +
          linkPreviewHtml +
          reactionsHtml +
          '<div class="message-time">' + formatTime(m.time) + '</div>' +
          (MStore.settings.showMessageIds ? '<div style="font-size:9px;color:var(--text-muted);opacity:0.5;margin-top:2px;">' + m.id + '</div>' : '') +
        '</div>' +
      '</div>';
    });
    var _savedAudio = null;
    var _savedVideo = null;
    if (window.OrbitAudioPlayer && typeof OrbitAudioPlayer.isAnyPlaying === 'function' && OrbitAudioPlayer.isAnyPlaying() && typeof OrbitAudioPlayer.savePlaying === 'function') _savedAudio = OrbitAudioPlayer.savePlaying();
    if (window.OrbitVideoPlayer && typeof OrbitVideoPlayer.isAnyPlaying === 'function' && OrbitVideoPlayer.isAnyPlaying() && typeof OrbitVideoPlayer.savePlaying === 'function') _savedVideo = OrbitVideoPlayer.savePlaying();
    feed.setAttribute('data-refreshing', 'true');
    feed.innerHTML = html;
    if (window.Prism) setTimeout(function() { Prism.highlightAll(); }, 0);
    freezeGifImages(feed);
    if (window.OrbitAudioPlayer) OrbitAudioPlayer.init(feed);
    if (window.OrbitVideoPlayer) OrbitVideoPlayer.init(feed);
    if (_savedAudio && typeof OrbitAudioPlayer.restorePlaying === 'function') OrbitAudioPlayer.restorePlaying(_savedAudio);
    if (_savedVideo && typeof OrbitVideoPlayer.restorePlaying === 'function') OrbitVideoPlayer.restorePlaying(_savedVideo);
    // Fallback: convert raw video/audio data URLs in case any elements bypass the player
    feed.querySelectorAll('video[src^="data:"], audio[src^="data:"]').forEach(function(el) {
      try {
        var newUrl = _dataUrlToBlobUrl(el.getAttribute('src'));
        if (newUrl && newUrl.indexOf('blob:') === 0) el.src = newUrl;
      } catch(e) { console.warn('[Messages] data URL fallback failed', e); }
    });
    requestAnimationFrame(function() { feed.removeAttribute('data-refreshing'); });
    // Bind action buttons
    feed.querySelectorAll('.msg-reply-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); startReply(this.getAttribute('data-msg-id')); });
    });
    feed.querySelectorAll('.msg-forward-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); showForwardModal(this.getAttribute('data-msg-id')); });
    });
    feed.querySelectorAll('.msg-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); startEdit(this.getAttribute('data-msg-id')); });
    });
    feed.querySelectorAll('.msg-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); confirmDeleteMessage(this.getAttribute('data-msg-id')); });
    });
    feed.querySelectorAll('.msg-translate-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); var msgId = this.getAttribute('data-msg-id'); if (MStore.settings.messageTranslate) translateMessage(msgId); });
    });
    feed.querySelectorAll('.msg-react-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); showReactionPicker(this, this.getAttribute('data-msg-id')); });
    });
    feed.querySelectorAll('.reaction-pill').forEach(function(pill) {
      pill.addEventListener('click', function(e) { e.stopPropagation(); var rm = this.parentElement.getAttribute('data-msg-id') || (this.closest('[data-msg-id]') || {}).getAttribute('data-msg-id'); if (rm) toggleReaction(rm, this); });
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
          var msgs = MStore.getMessages(activeChatId);
          var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
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
              var pkt = Orbit.Protocol.createPacket(pktType, MStore.user ? MStore.user.id : '', mid, pktPayload);
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
        var msgs = MStore.getMessages(activeChatId);
        var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
        if (msg && msg.attachments) {
          var att = msg.attachments.find(function(a) { return String(a.id) === attId; });
          if (att && att.url) {
            document.getElementById('image-preview-img').src = att.url;
            document.getElementById('image-preview-overlay').classList.add('open');
          }
        }
      });
    });
    // Click video to open full-size player
    feed.querySelectorAll('[data-open-video]').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var msgId = this.getAttribute('data-msg-id');
        var attId = this.getAttribute('data-open-video');
        var msgs = MStore.getMessages(activeChatId);
        var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
        if (msg && msg.attachments) {
          var att = msg.attachments.find(function(a) { return String(a.id) === attId; });
          if (att && att.url) {
            var player = document.getElementById('video-preview-player');
            var vidUrl = att.url;
            if (vidUrl.indexOf('data:') === 0) {
    try {
      var vm = vidUrl.match(/^data:(video\/[^;]+|application\/octet-stream);base64,(.+)$/);
      if (vm) {
        var blobUrl = window.orbitBase64ToBlob(vm[2], vm[1]);
        if (blobUrl) vidUrl = blobUrl;
      }
    } catch(e) { console.warn('[Video] preview data URL failed', e); }
            }
            player.src = vidUrl;
            player.load();
            document.getElementById('video-preview-overlay').classList.add('open');
          }
        }
      });
    });
    feed.scrollTop = feed.scrollHeight;
    renderLucide({ root: feed });
    injectMessageParticles(feed);
  }

  function setupMessageSwipe() {
    var feed = document.getElementById('message-feed');
    if (!feed || feed.dataset.swipeReplyBound) return;
    feed.dataset.swipeReplyBound = 'true';
    var swipe = null;
    var DRAG_MAX = 80;
    var TRIGGER_THRESHOLD = 55;
    var _hapticFired = false;

    function getRow(id) {
      return feed.querySelector('.message-row[data-msg-id="' + id + '"]');
    }

    function ensureIndicator(row) {
      var ind = row.querySelector('.swipe-reply-indicator');
      if (!ind) {
        ind = document.createElement('div');
        ind.className = 'swipe-reply-indicator';
        ind.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>';
        row.style.position = 'relative';
        row.appendChild(ind);
      }
      return ind;
    }

    function getSwipeTargets(row) {
      var targets = [];
      Array.prototype.forEach.call(row.children, function(child) {
        if (!child.classList || !child.classList.contains('swipe-reply-indicator')) {
          targets.push(child);
        }
      });
      var bubble = row.querySelector('.message-bubble');
      return targets.length ? targets : (bubble ? [bubble] : []);
    }

    function applyDrag(row, dx) {
      var clampedDx = Math.max(-DRAG_MAX, Math.min(0, dx));
      getSwipeTargets(row).forEach(function(target) {
        target.style.transition = 'none';
        target.style.transform = 'translateX(' + clampedDx + 'px)';
      });
      var ind = ensureIndicator(row);
      var progress = Math.min(1, Math.abs(clampedDx) / TRIGGER_THRESHOLD);
      var scale = 0.4 + progress * 0.6;
      var opacity = progress;
      ind.style.opacity = opacity;
      ind.style.transform = 'translateY(-50%) scale(' + scale + ')';
      if (progress >= 1) {
        ind.style.color = 'var(--accent-primary, #3b82f6)';
      } else {
        ind.style.color = 'var(--text-muted)';
      }
    }

    function resetRow(row, triggered) {
      getSwipeTargets(row).forEach(function(target) {
        target.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        target.style.transform = 'translateX(0)';
        target.addEventListener('transitionend', function handler() {
          target.style.transition = '';
          target.style.transform = '';
          target.removeEventListener('transitionend', handler);
        });
        setTimeout(function() {
          target.style.transition = '';
          target.style.transform = '';
        }, 350);
      });
      var ind = row.querySelector('.swipe-reply-indicator');
      if (ind) {
        ind.style.transition = 'opacity 0.2s ease';
        ind.style.opacity = '0';
        setTimeout(function() { if (ind.parentNode) ind.remove(); }, 250);
      }
    }

    feed.addEventListener('touchstart', function(e) {
      if (MStore.settings.swipeToReply === false || e.touches.length !== 1) return;
      var row = e.target.closest('.message-row');
      if (!row || e.target.closest('button, input, textarea, select, a, label, .reaction-pill, .reply-quote, .msg-action-btn')) return;
      var t = e.touches[0];
      swipe = { id: row.getAttribute('data-msg-id'), x: t.clientX, y: t.clientY, locked: false };
      _hapticFired = false;
    }, { passive: true });

    feed.addEventListener('touchmove', function(e) {
      if (!swipe || e.touches.length !== 1) return;
      var t = e.touches[0];
      var dx = t.clientX - swipe.x;
      var dy = t.clientY - swipe.y;

      // Determine drag direction lock
      if (!swipe.locked && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        swipe.locked = true;
        swipe.horizontal = Math.abs(dx) > Math.abs(dy);
      }
      if (!swipe.locked || !swipe.horizontal) return;

      // Only allow dragging LEFT
      if (dx >= 0) {
        var row = getRow(swipe.id);
        if (row) applyDrag(row, 0);
        return;
      }

      e.preventDefault();
      var row = getRow(swipe.id);
      if (row) {
        applyDrag(row, dx);
        // Haptic feedback when crossing threshold
        if (!_hapticFired && Math.abs(dx) >= TRIGGER_THRESHOLD) {
          _hapticFired = true;
          if (navigator.vibrate) navigator.vibrate(15);
        }
      }
    }, { passive: false });

    feed.addEventListener('touchend', function(e) {
      if (!swipe) return;
      var sid = swipe.id;
      var row = getRow(sid);
      if (!row) { swipe = null; return; }

      var triggered = false;
      if (e.changedTouches.length === 1) {
        var t = e.changedTouches[0];
        var dx = t.clientX - swipe.x;
        var dy = t.clientY - swipe.y;
        if (dx < -TRIGGER_THRESHOLD && Math.abs(dy) < 70) triggered = true;
      }

      resetRow(row, triggered);
      if (triggered) startReply(sid);
      swipe = null;
    }, { passive: true });

    feed.addEventListener('touchcancel', function() {
      if (swipe) {
        var row = getRow(swipe.id);
        if (row) resetRow(row, false);
      }
      swipe = null;
    }, { passive: true });
  }

  /* -- Send Message -- */
  var _frozenCache = new Map();
  function freezeGifImages(root, force) {
    if (!root || !root.querySelectorAll) return;
    if (!force && (!MStore.settings || (!MStore.settings.reduceMotion && !MStore.settings.experimentalPerformanceMode))) return;
    function freezeOne(img) {
      img.setAttribute('data-frozen', 'true');
      var src = img.currentSrc || img.src;
      if (_frozenCache.has(src)) {
        if (img.src !== _frozenCache.get(src)) img.src = _frozenCache.get(src);
        return;
      }
      if (img.complete && img.naturalWidth > 0) {
        var canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        var frozen = canvas.toDataURL('image/png');
        _frozenCache.set(src, frozen);
        img.src = frozen;
      } else {
        img.addEventListener('load', function() {
          var c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          var frozen = c.toDataURL('image/png');
          _frozenCache.set(img.currentSrc || img.src, frozen);
          img.src = frozen;
        });
      }
    }
    root.querySelectorAll('img[src*=".gif"]:not([data-frozen]), img[src*="data:image/gif"]:not([data-frozen]), .avatar img:not([data-frozen])').forEach(freezeOne);
  }

  function _showAvWarningModal() {
    return new Promise(function(resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.style.zIndex = '9999';

      var content = document.createElement('div');
      content.className = 'modal-content';
      content.style.padding = '24px';
      content.style.textAlign = 'center';

      content.innerHTML =
        '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#f59e0b" stroke-width="2" style="display:block;margin:0 auto 12px auto;">' +
          '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
          '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' +
        '</svg>' +
        '<h3 style="margin:0 0 8px 0;font-size:16px;font-weight:600;">Unstable Transfer Warning</h3>' +
        '<p style="margin:0;font-size:13px;line-height:1.5;color:var(--text-muted);">' +
          'Audio and video file transfers are still unstable. The file may not play correctly or the transfer may fail.' +
        '</p>' +
        '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 0;user-select:none;text-align:left;">' +
          '<input type="checkbox" id="chk-av-warn-dismiss" style="width:16px;height:16px;accent-color:#f59e0b;cursor:pointer;flex-shrink:0;">' +
          '<span style="font-size:12px;color:var(--text-muted);">Don\'t show this warning again</span>' +
        '</label>' +
        '<div style="display:flex;gap:8px;margin-top:4px;">' +
          '<button id="btn-av-warn-cancel" style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-surface);color:var(--text-normal);font-size:14px;">Cancel</button>' +
          '<button id="btn-av-warn-proceed" style="flex:1;padding:10px;border-radius:8px;border:none;background:#f59e0b;color:#fff;font-size:14px;font-weight:500;">Send Anyway</button>' +
        '</div>';

      overlay.appendChild(content);
      document.body.appendChild(overlay);

      function cleanup() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) { cleanup(); resolve(false); }
      });

      document.getElementById('btn-av-warn-cancel').addEventListener('click', function() {
        cleanup();
        resolve(false);
      });
      document.getElementById('btn-av-warn-proceed').addEventListener('click', function() {
        var dontShow = document.getElementById('chk-av-warn-dismiss').checked;
        if (dontShow) {
          try { localStorage.setItem('orbit_av_warn_hidden', '1'); } catch(e) {}
        }
        cleanup();
        resolve(true);
      });
    });
  }

  async function sendMessage() {
    var input = document.getElementById('chat-input');
    var text = input.value.trim();
    if ((!text && stagedFiles.length === 0) || !activeChatId) return;

    // Warn about unstable audio/video transfers before proceeding
    var hasAvFile = stagedFiles.some(function(s) { return s.type === 'audio' || s.type === 'video'; });
    if (hasAvFile) {
      try {
        if (localStorage.getItem('orbit_av_warn_hidden') === '1') { /* skip */ }
        else {
          var proceed = await _showAvWarningModal();
          if (!proceed) return;
        }
      } catch(e) { /* localStorage unavailable */ }
    }

    if (editingMsg) {
      MStore.editMessage(editingMsg.chatId, editingMsg.id, text);
      if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
        var isGroup = MStore.groups.some(function(g) { return g.id === editingMsg.chatId; });
        var myId = MStore.user ? MStore.user.id : 'mobile';
        if (isGroup) {
          var grp = MStore.groups.find(function(g) { return g.id === editingMsg.chatId; });
          if (grp) {
            (grp.members || []).forEach(function(m) {
              var mid = typeof m === 'string' ? m : m.userId;
              if (mid !== myId) {
                var pkt = Orbit.Protocol.createPacket(
                  Orbit.Protocol.Types.MESSAGE_EDIT, myId, mid,
                  { msgId: editingMsg.id, newText: text, chatId: editingMsg.chatId }
                );
                Orbit.P2P.send(mid, pkt);
              }
            });
          }
        } else {
          var pkt = Orbit.Protocol.createPacket(
            Orbit.Protocol.Types.MESSAGE_EDIT, myId, editingMsg.chatId,
            { msgId: editingMsg.id, newText: text }
          );
          Orbit.P2P.send(editingMsg.chatId, pkt);
        }
      }
      editingMsg = null;
      replyingTo = null;
      updateReplyEditBar();
      renderMessages(activeChatId);
      renderChatList();
      input.value = '';
      input.style.height = 'auto';
      return;
    }

    var INLINE_LIMIT = 1.5 * 1024 * 1024;
    var CHUNK_SIZE = 64 * 1024;

    var inlineAttachments = [];
    var largeFiles = [];
    stagedFiles.forEach(function(s) {
      var size = 0;
      if (s.url && s.url.indexOf('data:') === 0) {
        var b64 = s.url.substring(s.url.indexOf(',') + 1);
        size = Math.round(b64.length * 3 / 4);
      }
      var att = {
        id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        type: s.type,
        name: s.name,
        size: s.size,
        url: s.url
      };
      if (size >= INLINE_LIMIT && (s.type === 'video' || s.type === 'audio' || s.type === 'file')) {
        largeFiles.push(att);
      } else {
        inlineAttachments.push(att);
      }
    });

    var allAttachments = inlineAttachments.concat(largeFiles);
    var msgId = 'm' + Date.now() + Math.random().toString(36).slice(2, 6);
    var newMsg = {
      id: msgId,
      from: 'me',
      text: text,
      time: new Date().toISOString(),
      attachments: allAttachments.length > 0 ? allAttachments : undefined
    };
    if (MStore.user) newMsg.fromName = MStore.user.name;
    if (replyingTo) newMsg.replyTo = replyingTo.id;
    MStore.addMessage(activeChatId, newMsg);
    stagedFiles = [];
    renderFilePreview();

    renderMessages(activeChatId);
    renderChatList();
    input.value = '';
    input.style.height = 'auto';
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

    function _broadcastToGroupMembers(groupId, textToSend, isE2EE) {
      var grp = MStore.groups.find(function(g) { return g.id === groupId; });
      if (!grp) return;
      (grp.members || []).forEach(function(m) {
        var memberId = typeof m === 'string' ? m : m.userId;
        if (memberId === (MStore.user ? MStore.user.id : '')) return;
        var memberFriend = MStore.friends.find(function(f) { return f.id === memberId; });
        var memberKey = memberFriend ? memberFriend.publicKey : (typeof m !== 'string' ? m.publicKey : null);
        var grpAttachments = inlineAttachments.length > 0 ? inlineAttachments.slice() : [];
        largeFiles.forEach(function(lf) { grpAttachments.push({ id: lf.id, _fileId: lf.id, name: lf.name, type: lf.type, _pending: true }); });
        var payload = {
          text: textToSend, groupId: groupId, msgId: newMsg.id, replyTo: newMsg.replyTo,
          attachments: grpAttachments.length > 0 ? grpAttachments : undefined,
          fromName: newMsg.fromName
        };
        if (isE2EE && memberKey) {
          Orbit.E2EE.encrypt(textToSend, memberKey).then(function(encrypted) {
            if (encrypted) {
              payload.e2ee = true;
              payload.ciphertext = encrypted.ciphertext;
              payload.nonce = encrypted.nonce;
              Orbit.P2P.send(memberId, Orbit.Protocol.createPacket(Orbit.Protocol.Types.MESSAGE, MStore.user.id, memberId, payload));
            }
          });
        } else {
          Orbit.P2P.send(memberId, Orbit.Protocol.createPacket(Orbit.Protocol.Types.MESSAGE, MStore.user ? MStore.user.id : 'mobile', memberId, payload));
        }
      });
    }

    function _sendLargeFileToPeer(att, peerId) {
      if (!att.url || att.url.indexOf('data:') !== 0) return;
      var b64 = att.url.substring(att.url.indexOf(',') + 1);
      var totalChunks = Math.ceil(b64.length / CHUNK_SIZE);
      // Use att.id as fileId so MESSAGE _fileId markers match (CRIT-4)
      var fileId = att.id;
      var myId = MStore.user ? MStore.user.id : 'mobile';

      // Compute SHA-256 hash for integrity verification (CRIT-1)
      // NOTE: Uses manual base64 decoder — atob() on Android WebView corrupts bytes >127 (binary files)
      // Uses single-pass streaming decoder (no intermediate string allocations)
      var _b64Lookup = null;
      function _base64ToBytes(b64str) {
        if (!_b64Lookup) {
          _b64Lookup = new Int8Array(256);
          for (var i = 0; i < 256; i++) _b64Lookup[i] = -1;
          var b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
          for (var li = 0; li < 64; li++) _b64Lookup[b64chars.charCodeAt(li)] = li;
        }
        // Count valid base64 chars without allocating a string
        var validLen = 0;
        for (var i = 0; i < b64str.length; i++) {
          if (_b64Lookup[b64str.charCodeAt(i)] !== -1) validLen++;
        }
        var binLen = Math.floor(validLen * 3 / 4);
        if (binLen === 0) return new ArrayBuffer(0);
        var buf = new ArrayBuffer(binLen);
        var bytes = new Uint8Array(buf);
        var p = 0;
        var b = [0,0,0,0];
        var bi = 0;
        for (var i = 0; i < b64str.length; i++) {
          var val = _b64Lookup[b64str.charCodeAt(i)];
          if (val === -1 || val === void 0) continue;
          b[bi++] = val;
          if (bi === 4) {
            if (p < binLen) bytes[p++] = (b[0] << 2) | (b[1] >> 4);
            if (p < binLen) bytes[p++] = ((b[1] & 15) << 4) | (b[2] >> 2);
            if (p < binLen) bytes[p++] = ((b[2] & 3) << 6) | b[3];
            bi = 0;
          }
        }
        if (bi > 0) {
          while (bi < 4) b[bi++] = 0;
          if (p < binLen) bytes[p++] = (b[0] << 2) | (b[1] >> 4);
          if (p < binLen) bytes[p++] = ((b[1] & 15) << 4) | (b[2] >> 2);
          if (p < binLen) bytes[p++] = ((b[2] & 3) << 6) | b[3];
        }
        return buf;
      }

      function _computeFileHash(b64str, callback) {
        try {
          var buf = _base64ToBytes(b64str);
          crypto.subtle.digest('SHA-256', buf).then(function(hashBuf) {
            var hashArr = Array.from(new Uint8Array(hashBuf));
            var hex = hashArr.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
            callback(hex);
          }).catch(function() { callback(''); });
        } catch(e) { callback(''); }
      }

      _computeFileHash(b64, function(fileHash) {
        if (fileHash) {
          debugLog('P2P', 'Computed file hash for ' + att.name, { fileId: fileId, hash: fileHash, b64len: b64.length });
        } else {
          debugLog('P2P', 'crypto.subtle unavailable — sending without hash for ' + att.name, { fileId: fileId, b64len: b64.length });
        }
        Orbit.P2P.send(peerId, Orbit.Protocol.createPacket(
          Orbit.Protocol.Types.FILE_TRANSFER_START, myId, peerId,
          { fileId: fileId, fileName: att.name, fileSize: Math.round(b64.length * 3 / 4), totalChunks: totalChunks, hash: fileHash, chatId: activeChatId }
        ));

        var ci = 0;
        function sendNextChunk() {
          if (ci >= totalChunks) {
            Orbit.P2P.send(peerId, Orbit.Protocol.createPacket(
              Orbit.Protocol.Types.FILE_TRANSFER_END, myId, peerId,
              { fileId: fileId, hash: fileHash, chatId: activeChatId }
            ));
            return;
          }
          var chunk = b64.substring(ci * CHUNK_SIZE, (ci + 1) * CHUNK_SIZE);
          Orbit.P2P.send(peerId, Orbit.Protocol.createPacket(
            Orbit.Protocol.Types.FILE_CHUNK, myId, peerId,
            { fileId: fileId, chunkIndex: ci, data: chunk }
          ));
          ci++;
          setTimeout(sendNextChunk, 0);
        }
        sendNextChunk();
      });
    }

    if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
      var isGroup = MStore.groups.some(function(g) { return g.id === activeChatId; });
      var myId = MStore.user ? MStore.user.id : 'mobile';

      if (isGroup) {
        var useE2EE = MStore.settings.e2eeEnabled && window.Orbit.E2EE;
        _broadcastToGroupMembers(activeChatId, text, useE2EE);
        if (largeFiles.length > 0) {
          var grp = MStore.groups.find(function(g) { return g.id === activeChatId; });
          if (grp) {
            (grp.members || []).forEach(function(m) {
              var memberId = typeof m === 'string' ? m : m.userId;
              if (memberId === myId) return;
              largeFiles.forEach(function(att) { _sendLargeFileToPeer(att, memberId); });
            });
          }
        }
        return;
      }

      if (MStore.settings.e2eeEnabled && window.Orbit.E2EE) {
        var friend = MStore.friends.find(function(f) { return f.id === activeChatId; });
        if (friend && friend.publicKey) {
          Orbit.E2EE.encrypt(text, friend.publicKey).then(function(encrypted) {
            if (encrypted) {
              // Include large file metadata so receiver can merge text+file into one message (CRIT-4)
              var e2eeAttachments = inlineAttachments.length > 0 ? inlineAttachments.slice() : [];
              largeFiles.forEach(function(lf) { e2eeAttachments.push({ id: lf.id, _fileId: lf.id, name: lf.name, type: lf.type, _pending: true }); });
              Orbit.P2P.send(activeChatId, Orbit.Protocol.createPacket(
                Orbit.Protocol.Types.MESSAGE, myId, activeChatId,
                { e2ee: true, ciphertext: encrypted.ciphertext, nonce: encrypted.nonce, msgId: newMsg.id, replyTo: newMsg.replyTo, attachments: e2eeAttachments.length > 0 ? e2eeAttachments : undefined, fromName: newMsg.fromName }
              ));
            }
          });
          if (largeFiles.length > 0) {
            largeFiles.forEach(function(att) { _sendLargeFileToPeer(att, activeChatId); });
          }
          return;
        }
      }

      // Include large file metadata so receiver can merge text+file into one message (CRIT-4)
      var msgAttachments = inlineAttachments.length > 0 ? inlineAttachments.slice() : [];
      largeFiles.forEach(function(lf) { msgAttachments.push({ id: lf.id, _fileId: lf.id, name: lf.name, type: lf.type, _pending: true }); });
      Orbit.P2P.send(activeChatId, Orbit.Protocol.createPacket(
        Orbit.Protocol.Types.MESSAGE, myId, activeChatId,
        { text: text, msgId: newMsg.id, replyTo: newMsg.replyTo, attachments: msgAttachments.length > 0 ? msgAttachments : undefined, fromName: newMsg.fromName }
      ));
      if (largeFiles.length > 0) {
        largeFiles.forEach(function(att) { _sendLargeFileToPeer(att, activeChatId); });
      }
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
    var ext = file.name.split('.').pop().toLowerCase();
    var imgExts = ['jpg','jpeg','png','gif','webp','bmp','svg'];
    var vidExts = ['mp4','mov','avi','mkv','webm','3gp','m4v','wmv','flv'];
    var audExts = ['mp3','wav','ogg','flac','aac','m4a','wma','webm'];
    var isImage = file.type.startsWith('image/') || imgExts.indexOf(ext) !== -1;
    var isVideo = file.type.startsWith('video/') || vidExts.indexOf(ext) !== -1;
    var isAudio = file.type.startsWith('audio/') || audExts.indexOf(ext) !== -1;
        if (isImage) {
          var reader = new FileReader();
          reader.onload = function(ev) {
            MStore.compressImage(ev.target.result, 800, 800, 0.5, function(compressedUrl) {
              stagedFiles.push({
                name: file.name,
                size: file.size,
                type: 'image',
                url: compressedUrl
              });
              done++;
              if (done === total) renderFilePreview();
            });
          };
          reader.readAsDataURL(file);
        } else if (isVideo) {
          var reader = new FileReader();
          reader.onload = function(ev) {
            var videoUrl = ev.target.result;
            if (false) {
              compressVideoMobile(videoUrl, 1280, function(compressedUrl) {
                stagedFiles.push({
                  name: file.name,
                  size: compressedUrl.length,
                  type: 'video',
                  url: compressedUrl
                });
                done++;
                if (done === total) renderFilePreview();
              });
            } else {
              stagedFiles.push({
                name: file.name,
                size: file.size,
                type: 'video',
                url: videoUrl
              });
              done++;
              if (done === total) renderFilePreview();
            }
          };
          reader.readAsDataURL(file);
        } else if (isAudio) {
          var audioReader = new FileReader();
          audioReader.onload = function(ev) {
            stagedFiles.push({
              name: file.name,
              size: file.size,
              type: 'audio',
              url: ev.target.result
            });
            done++;
            if (done === total) renderFilePreview();
          };
          audioReader.readAsDataURL(file);
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
      } else if (s.type === 'video') {
        html += '<div class="file-preview-item">' +
          '<div class="file-icon" style="color:#a855f7;"><i data-lucide="video"></i></div>' +
          '<button class="file-preview-remove" data-index="' + i + '">&times;</button></div>';
      } else if (s.type === 'audio') {
        html += '<div class="file-preview-item">' +
          '<div class="file-icon" style="color:#ec4899;"><i data-lucide="music"></i></div>' +
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
    if (localStorage.getItem('orbit_migrated_v2')) { console.log('[Orbit] Data migration already completed — skipping'); return; }

    console.log('[Orbit] Running old data migration...');
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
      var fPfNum = getProfileFrame(f);
      var fPfHtml = fPfNum > 0 ? '<img src="icons/frames/pfp_frame_' + fPfNum + '.png" class="pfp-frame" style="position:absolute;top:-15%;left:-17%;pointer-events:none;" draggable="false" alt="">' : '';
      html += '<div class="list-row friend-row" data-friend="' + f.id + '">' +
        '<div class="chat-row-avatar-wrapper" style="width:44px;height:44px;">' +
          '<div class="chat-row-avatar" style="width:44px;height:44px;font-size:16px;">' + (f.avatar ? '<img src="' + escapeHtml(f.avatar) + '">' : initial) + '</div>' +
          fPfHtml +
          '<div class="friend-status-dot" style="background:' + color + ';position:absolute;bottom:0;right:0;width:12px;height:12px;border-radius:50%;border:2px solid var(--bg-surface);"></div>' +
        '</div>' +
        '<div style="flex:1;min-width:0;margin-left:14px;">' +
          '<div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:2px;">' + escapeHtml(f.name) + '</div>' +
          '<div style="font-size:13px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">' +
            '<span style="width:8px;height:8px;border-radius:50%;background:' + color + ';display:inline-block;box-shadow:0 0 4px ' + color + ';"></span>' +
            (f.status || 'offline') +
          '</div>' +
        '</div>' +
        '<div style="color:var(--text-muted);opacity:0.5;"><i data-lucide="chevron-right" style="width:16px;height:16px;"></i></div>' +
      '</div>';
    });
    html += endOfListHTML();

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
      var navPf = getProfileFrame(MStore.settings);
      var navFrame = navEl.parentNode.querySelector('.pfp-frame');
      if (navPf > 0) {
        if (!navFrame) {
          navFrame = document.createElement('img');
          navFrame.className = 'pfp-frame';
          navFrame.draggable = false;
          navFrame.alt = '';
          navFrame.style.cssText = 'position:absolute;top:-1px;left:-1px;pointer-events:none;';
          navEl.parentNode.appendChild(navFrame);
        }
        navFrame.src = 'icons/frames/pfp_frame_' + navPf + '.png';
      } else if (navFrame) {
        navFrame.remove();
      }
    }

    var headerEl = document.getElementById('panel-header-avatar');
    if (headerEl) {
      headerEl.innerHTML = u && u.avatar ? '<img src="' + escapeHtml(u.avatar) + '">' : initial;
    }
  }

  /* ─── Settings Panel (simplified main view) ─── */
  function renderSettings() {
    try { updateNavAvatar(); } catch(e) { console.error('[Orbit] updateNavAvatar error:', e); }
    
    var container = document.getElementById('settings-content');
    if (!container) {
      console.error('[Orbit] settings-content not found');
      return;
    }
    
    var u = MStore.user;
    var initial = u && u.name ? u.name.charAt(0).toUpperCase() : '?';

    var sPfNum = 0;
    try { sPfNum = getProfileFrame(MStore.settings); } catch(e) {}
    
    var sPfHtml = sPfNum > 0 ? '<img src="icons/frames/pfp_frame_' + sPfNum + '.png" class="pfp-frame" style="position:absolute;top:-15%;left:-17%;pointer-events:none;" draggable="false" alt="">' : '';
    
    container.innerHTML =
      '<div class="settings-profile-card" id="settings-profile-card">' +
        '<div style="position:relative;display:inline-flex;">' +
          '<div class="settings-profile-avatar">' + (u && u.avatar ? '<img src="' + escapeHtml(u.avatar) + '">' : initial) + '</div>' +
          sPfHtml +
        '</div>' +
        '<div class="settings-profile-info">' +
          '<div class="settings-profile-name">' + escapeHtml(u && u.name ? u.name : 'User') + '</div>' +
          '<div class="settings-profile-tag">#' + escapeHtml(u && u.tag ? u.tag : '0000') + '</div>' +
        '</div>' +
        '<i data-lucide="chevron-right" class="settings-profile-arrow"></i>' +
      '</div>' +
      '<div class="settings-link-card" id="open-settings-overlay">' +
        '<i data-lucide="settings" class="settings-link-icon"></i>' +
        '<span class="settings-link-text">All Settings</span>' +
        '<i data-lucide="chevron-right" class="settings-link-arrow"></i>' +
      '</div>';

    try {
      document.getElementById('settings-profile-card').addEventListener('click', showProfile);
      document.getElementById('open-settings-overlay').addEventListener('click', showSettingsOverlay);
      renderLucide({ root: container });
    } catch(e) {
      console.error('[Orbit] settings listeners error:', e);
    }
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
    var html = '<div class="settings-list" style="margin-top: 8px;">';
    SETTINGS_SECTIONS.forEach(function(sec, i) {
      html +=
        '<div class="list-row" data-section="' + sec.key + '" style="gap: 16px;">' +
          '<i data-lucide="' + sec.icon + '" class="settings-section-icon"></i>' +
          '<div class="settings-section-info">' +
            '<div class="settings-section-title" style="margin-bottom: 2px;">' + sec.title + '</div>' +
            '<div class="settings-section-desc">' + sec.desc + '</div>' +
          '</div>' +
          '<i data-lucide="chevron-right" class="settings-section-arrow"></i>' +
        '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
    if (animate) {
      container.classList.remove('settings-slide-right');
      container.classList.add('settings-slide-left');
    }

    container.querySelectorAll('.list-row').forEach(function(el) {
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
          '<div class="settings-row-content"><span class="settings-row-title">Theme</span><div class="settings-row-desc">Dark, light, or colorful presets</div></div>' +
          sel(themeOptions, 'set-theme', s.theme || 'dark') +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Message Bubbles</span><div class="settings-row-desc">Modern rounded or compact bubbles</div></div>' +
          sel([{v:'Modern',l:'Modern'},{v:'Compact',l:'Compact'}], 'set-bubbles', s.messageBubbles || 'Modern') +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">24-Hour Time</span><div class="settings-row-desc">Show times in 24-hour format</div></div>' +
          '<button class="settings-toggle ' + (s.timeFormat24 ? 'on' : '') + '" id="set-24h"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Animations</span><div class="settings-row-desc">Enable UI animations and transitions</div></div>' +
          '<button class="settings-toggle ' + (s.animations !== false ? 'on' : '') + '" id="set-animations"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Animation Speed</span><div class="settings-row-desc">How fast animations play</div></div>' +
          sel([{v:'normal',l:'Normal'},{v:'fast',l:'Fast'},{v:'instant',l:'Instant'}], 'set-anim-speed', s.animSpeed || 'normal') +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Font Size</span><div class="settings-row-desc">Adjust chat text size</div></div>' +
          sel([{v:'Small',l:'Small'},{v:'Medium',l:'Medium'},{v:'Large',l:'Large'}], 'set-font-size', s.fontSize || 'Medium') +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Reduce Motion</span><div class="settings-row-desc">Disable animations, freeze GIF previews, and stop avatar effects</div></div>' +
          '<button class="settings-toggle ' + (s.reduceMotion ? 'on' : '') + '" id="set-reduce-motion"></button>' +
        '</div>';
      case 'chat':
        return '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Enter to Send</span><div class="settings-row-desc">Press Enter to send messages</div></div>' +
          '<button class="settings-toggle ' + (s.enterToSend ? 'on' : '') + '" id="set-enter-send"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Swipe to Reply</span><div class="settings-row-desc">Swipe left on a message to reply</div></div>' +
          '<button class="settings-toggle ' + (s.swipeToReply !== false ? 'on' : '') + '" id="set-swipe-reply"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Show Avatars</span><div class="settings-row-desc">Show profile pictures in chats</div></div>' +
          '<button class="settings-toggle ' + (s.showChatAvatars !== false ? 'on' : '') + '" id="set-chat-avatars"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Message Animation</span><div class="settings-row-desc">How new messages appear</div></div>' +
          sel([{v:'slide',l:'Slide'},{v:'fade',l:'Fade'}], 'set-msg-anim', s.messageAnim || 'slide') +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Compact Spacing</span><div class="settings-row-desc">Tighter message layout</div></div>' +
          '<button class="settings-toggle ' + (s.experimentalCompactSpacing ? 'on' : '') + '" id="set-compact-spacing"></button>' +
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
        '</div>' +
        '<div class="settings-section-divider"></div>' +
        '<div class="settings-row settings-section-header"><span>Translation</span></div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Message Translation</span><div class="settings-row-desc">Show translate button on messages</div></div>' +
          '<button class="settings-toggle ' + (s.messageTranslate ? 'on' : '') + '" id="set-message-translate"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Target Language</span><div class="settings-row-desc">Language to translate messages into</div></div>' +
          sel([{v:'',l:'Auto'},{v:'en',l:'English'},{v:'vi',l:'Vietnamese'},{v:'es',l:'Spanish'},{v:'fr',l:'French'},{v:'de',l:'German'},{v:'it',l:'Italian'},{v:'pt',l:'Portuguese'},{v:'ru',l:'Russian'},{v:'zh-CN',l:'Chinese (Simplified)'},{v:'zh-TW',l:'Chinese (Traditional)'},{v:'ja',l:'Japanese'},{v:'ko',l:'Korean'},{v:'ar',l:'Arabic'},{v:'hi',l:'Hindi'},{v:'tr',l:'Turkish'},{v:'nl',l:'Dutch'},{v:'pl',l:'Polish'},{v:'sv',l:'Swedish'},{v:'th',l:'Thai'},{v:'id',l:'Indonesian'},{v:'el',l:'Greek'},{v:'cs',l:'Czech'},{v:'ro',l:'Romanian'},{v:'uk',l:'Ukrainian'},{v:'hu',l:'Hungarian'},{v:'he',l:'Hebrew'},{v:'da',l:'Danish'},{v:'fi',l:'Finnish'},{v:'no',l:'Norwegian'},{v:'ms',l:'Malay'}], 'set-translate-target', s.translateTargetLang || '') +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Auto-Detect Source</span><div class="settings-row-desc">Auto-detect message language instead of assuming English</div></div>' +
          '<button class="settings-toggle ' + (s.autoDetectSource !== false ? 'on' : '') + '" id="set-auto-detect"></button>' +
        '</div>';
      case 'notifications':
        return         '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Message Previews</span><div class="settings-row-desc">Show message content in notifications</div></div>' +
          '<button class="settings-toggle ' + (s.notifyPreview !== false ? 'on' : '') + '" id="notify-preview"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Notification Sound</span><div class="settings-row-desc">Play sound on new messages</div></div>' +
          '<button class="settings-toggle ' + (s.notifySound ? 'on' : '') + '" id="notify-sound"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Notification Volume</span><div class="settings-row-desc">Volume level for notification sounds</div></div>' +
          '<div style="display:flex;align-items:center;gap:8px;"><input type="range" min="0" max="100" value="' + (s.notifyVolume || 80) + '" class="settings-slider" id="notify-volume" style="width:100px;"><span id="notify-volume-label" style="font-size:12px;min-width:32px;text-align:right;">' + (s.notifyVolume || 80) + '</span></div>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Sound Type</span><div class="settings-row-desc">Notification sound style</div></div>' +
          sel([{v:'chime',l:'Chime'},{v:'pop',l:'Pop'},{v:'gentle',l:'Gentle'},{v:'classic',l:'Classic'}], 'notify-sound-type', s.notifySoundType || 'chime') +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Do Not Disturb</span><div class="settings-row-desc">Mute all notifications</div></div>' +
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
          '<div class="settings-row-content"><span class="settings-row-title">Auto-Delete Attachments</span><div class="settings-row-desc">Auto-remove sent attachments after time</div></div>' +
          sel([
            {v:'0',l:'Never'},{v:'1',l:'1 min'},{v:'5',l:'5 min'},
            {v:'10',l:'10 min'},{v:'25',l:'25 min'},{v:'60',l:'60 min'}
          ], 'set-delete-after', String(s.deleteAttachmentsAfter || 0)) +
        '</div>';
      case 'network':
        return '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Network Mode</span><div class="settings-row-desc">Connection discovery method</div></div>' +
          sel([{v:'LAN Auto-Discovery',l:'LAN Auto-Discovery'},{v:'Custom IP',l:'Custom IP'}], 'net-mode', s.networkMode || 'LAN Auto-Discovery') +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">UDP Discovery Port</span><div class="settings-row-desc">Port for peer discovery</div></div>' +
          '<input type="number" class="settings-input" id="net-udp" value="' + (s.udpPort || 45678) + '">' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">TCP Connection Port</span><div class="settings-row-desc">Port for direct connections</div></div>' +
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
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Reconnect Interval</span><div class="settings-row-desc">Seconds between reconnect attempts</div></div>' +
          '<input type="number" class="settings-input" id="net-reconnect-interval" value="' + (s.netReconnectInterval || 10) + '" min="1">' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Keep-Alive Interval</span><div class="settings-row-desc">Ping interval for active connections</div></div>' +
          sel([{v:'10',l:'10s'},{v:'30',l:'30s'},{v:'60',l:'60s'},{v:'120',l:'120s'}], 'net-keepalive', String(s.netKeepAlive || 30)) +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">WebRTC Fallback</span><div class="settings-row-desc">Use WebRTC when direct TCP fails</div></div>' +
          '<button class="settings-toggle ' + (s.webrtcFallback !== false ? 'on' : '') + '" id="net-webrtc"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Log Level</span><div class="settings-row-desc">Verbosity of connection logs</div></div>' +
          sel([{v:'None',l:'None'},{v:'Error',l:'Error'},{v:'Info',l:'Info'},{v:'Debug',l:'Debug'}], 'net-loglevel', s.logLevel || 'None') +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Bandwidth Limit</span><div class="settings-row-desc">KB/s (0 = unlimited)</div></div>' +
          '<input type="number" class="settings-input" id="net-bandwidth" value="' + (s.netBandwidthLimit || 0) + '" min="0">' +
        '</div>' +
        '<div class="settings-row" id="row-add-friend" style="cursor:pointer;">' +
          '<span class="settings-row-title" style="color:var(--accent-primary);">Add Friend</span>' +
          '<i data-lucide="user-plus" style="width:18px;height:18px;color:var(--accent-primary);flex-shrink:0;"></i>' +
        '</div>';
      case 'about':
        var friendsCount = MStore ? MStore.friends.length : 0;
        var chatsCount = MStore ? MStore.chats.length : 0;
        return '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Orbit Mobile</span><div class="settings-row-desc">v0.2.0-beta · Capacitor Android</div></div>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Statistics</span><div class="settings-row-desc">' + friendsCount + ' friends · ' + chatsCount + ' chats</div></div>' +
        '</div>' +
        '<div class="settings-section-divider"></div>' +
        '<div class="settings-row" id="row-show-changelog" style="cursor:pointer;">' +
          '<span class="settings-row-title" style="color:var(--accent-primary);">What\'s New</span>' +
          '<i data-lucide="external-link" style="width:18px;height:18px;color:var(--accent-primary);flex-shrink:0;"></i>' +
        '</div>';
      case 'advanced':
        return '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Developer Mode</span><div class="settings-row-desc">Enable developer tools</div></div>' +
          '<button class="settings-toggle ' + (s.devMode ? 'on' : '') + '" id="set-dev-mode"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Debug Display</span><div class="settings-row-desc">Show debug overlay info</div></div>' +
          '<button class="settings-toggle ' + (s.debugDisplay ? 'on' : '') + '" id="set-debug-display"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Show Message IDs</span><div class="settings-row-desc">Display message IDs in chat</div></div>' +
          '<button class="settings-toggle ' + (s.showMessageIds ? 'on' : '') + '" id="set-msg-ids"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Log Network Packets</span><div class="settings-row-desc">Log P2P network traffic</div></div>' +
          '<button class="settings-toggle ' + (s.logNetworkPackets ? 'on' : '') + '" id="set-log-packets"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Show Connection Stats</span><div class="settings-row-desc">Show connection info overlay</div></div>' +
          '<button class="settings-toggle ' + (s.showConnectionStats ? 'on' : '') + '" id="set-conn-stats"></button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-content"><span class="settings-row-title">Enable Experimental</span><div class="settings-row-desc">Unstable features</div></div>' +
          '<button class="settings-toggle ' + (s.enableExperimental ? 'on' : '') + '" id="set-experimental"></button>' +
        '</div>' +
        (s.enableExperimental ? (
          '<div class="settings-row">' +
            '<div class="settings-row-content"><span class="settings-row-title">Animated Avatars</span><div class="settings-row-desc">Animate avatar borders with pulse effect</div></div>' +
            '<button class="settings-toggle ' + (s.experimentalAnimatedAvatars ? 'on' : '') + '" id="set-exp-avatars"></button>' +
          '</div>' +
          '<div class="settings-row">' +
            '<div class="settings-row-content"><span class="settings-row-title">Message Effects</span><div class="settings-row-desc">Show sparkle animations on new messages</div></div>' +
            '<button class="settings-toggle ' + (s.experimentalMessageFx ? 'on' : '') + '" id="set-exp-fx"></button>' +
          '</div>' +
          '<div class="settings-row">' +
            '<div class="settings-row-content"><span class="settings-row-title">Custom Colors</span><div class="settings-row-desc">Pick custom accent color</div></div>' +
            '<button class="settings-toggle ' + (s.enableCustomColors ? 'on' : '') + '" id="set-exp-colors"></button>' +
          '</div>' +
          '<div class="settings-row">' +
            '<div class="settings-row-content"><span class="settings-row-title">Profile Frames</span><div class="settings-row-desc">Overlay decorative frames on avatars</div></div>' +
            '<button class="settings-toggle ' + (s.experimentalProfileFrames ? 'on' : '') + '" id="set-exp-frames"></button>' +
          '</div>' +

          '<div class="settings-row">' +
            '<div class="settings-row-content"><span class="settings-row-title">FPS Monitor</span><div class="settings-row-desc">Display real-time frame rate</div></div>' +
            '<button class="settings-toggle ' + (s.experimentalFpsMonitor ? 'on' : '') + '" id="set-exp-fps"></button>' +
          '</div>' +
          '<div class="settings-row">' +
            '<div class="settings-row-content"><span class="settings-row-title">Developer Overlay</span><div class="settings-row-desc">Connection stats and debug info</div></div>' +
            '<button class="settings-toggle ' + (s.experimentalDevOverlay ? 'on' : '') + '" id="set-exp-dev-overlay"></button>' +
          '</div>' +
          '<div class="settings-row">' +
            '<div class="settings-row-content"><span class="settings-row-title">Performance Mode</span><div class="settings-row-desc">Kill animations, reduce CPU usage</div></div>' +
            '<button class="settings-toggle ' + (s.experimentalPerformanceMode ? 'on' : '') + '" id="set-exp-perf"></button>' +
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
        bindToggle('set-reduce-motion', function(on) { s.reduceMotion = on; MStore.save(); applyAnimationSettings(); if (activeChatId) renderMessages(activeChatId); }, s.reduceMotion);
        bindSelect('set-font-size', function(v) { s.fontSize = v; MStore.save(); applyFontSize(); });
        break;
      case 'chat':
        bindToggle('set-enter-send', function(on) { s.enterToSend = on; MStore.save(); }, s.enterToSend);
        bindToggle('set-swipe-reply', function(on) { s.swipeToReply = on; MStore.save(); }, s.swipeToReply !== false);
        bindToggle('set-chat-avatars', function(on) { s.showChatAvatars = on; MStore.save(); renderChatList(); }, s.showChatAvatars !== false);
        bindSelect('set-msg-anim', function(v) { s.messageAnim = v; MStore.save(); if (activeChatId) renderMessages(activeChatId); });
        bindToggle('set-compact-spacing', function(on) { s.experimentalCompactSpacing = on; MStore.save(); document.documentElement.setAttribute('data-compact-spacing', on ? 'true' : ''); if (activeChatId) renderMessages(activeChatId); }, s.experimentalCompactSpacing);
        bindSelect('set-pattern', function(v) { s.bgPattern = v; MStore.save(); applyBgPattern(); });
        bindToggle('set-image-previews', function(on) { s.showImagePreviews = on; MStore.save(); if (activeChatId) renderMessages(activeChatId); }, s.showImagePreviews !== false);
        bindToggle('set-link-previews', function(on) { s.showLinkPreviews = on; MStore.save(); if (activeChatId) renderMessages(activeChatId); }, s.showLinkPreviews !== false);
        bindToggle('set-message-translate', function(on) { s.messageTranslate = on; MStore.save(); if (activeChatId) renderMessages(activeChatId); }, s.messageTranslate);
        bindSelect('set-translate-target', function(v) { s.translateTargetLang = v; MStore.save(); });
        bindToggle('set-auto-detect', function(on) { s.autoDetectSource = on; MStore.save(); }, s.autoDetectSource !== false);
        break;
      case 'notifications':
        bindToggle('notify-preview', function(on) { s.notifyPreview = on; MStore.save(); }, s.notifyPreview !== false);
        bindToggle('notify-sound', function(on) { s.notifySound = on; MStore.save(); }, s.notifySound);
        (function() {
          var volEl = document.getElementById('notify-volume');
          var volLabel = document.getElementById('notify-volume-label');
          if (volEl) {
            volEl.addEventListener('input', function() {
              s.notifyVolume = parseInt(this.value, 10);
              if (volLabel) volLabel.textContent = s.notifyVolume;
              MStore.save();
            });
          }
        })();
        bindSelect('notify-sound-type', function(v) { s.notifySoundType = v; MStore.save(); });
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
        bindSelect('net-keepalive', function(v) { s.netKeepAlive = parseInt(v, 10); MStore.save(); });
        bindToggle('net-webrtc', function(on) { s.webrtcFallback = on; MStore.save(); }, s.webrtcFallback !== false);
        bindSelect('net-loglevel', function(v) { s.logLevel = v; MStore.save(); });
        ['net-reconnect-interval', 'net-bandwidth'].forEach(function(id) {
          var el = document.getElementById(id);
          if (el) {
            el.addEventListener('change', function() {
              var key = id === 'net-reconnect-interval' ? 'netReconnectInterval' : 'netBandwidthLimit';
              s[key] = parseInt(this.value, 10) || 0;
              MStore.save();
            });
          }
        });
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
              btn.style.cssText = 'position:fixed;bottom:100px;right:16px;z-index:99998;background:#0a0;color:#fff;border:none;border-radius:8px;padding:10px 16px;font-size:13px;font-family:monospace;cursor:pointer;opacity:0.85;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
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
        bindToggle('set-exp-colors', function(on) { s.enableCustomColors = on; MStore.save(); document.documentElement.setAttribute('data-exp-colors', on ? 'true' : ''); }, s.enableCustomColors);
        bindToggle('set-exp-frames', function(on) { s.experimentalProfileFrames = on; MStore.save(); document.documentElement.setAttribute('data-exp-frames', on ? 'true' : ''); renderSettings(); }, s.experimentalProfileFrames);
        bindToggle('set-exp-fps', function(on) { s.experimentalFpsMonitor = on; MStore.save(); toggleFpsMonitor(on); }, s.experimentalFpsMonitor);
        bindToggle('set-exp-dev-overlay', function(on) { s.experimentalDevOverlay = on; MStore.save(); toggleDevOverlay(on); }, s.experimentalDevOverlay);
        bindToggle('set-exp-perf', function(on) {
          s.experimentalPerformanceMode = on; MStore.save();
          document.documentElement.setAttribute('data-perf-mode', on ? 'true' : '');
          if (on) {
            freezeGifImages(document, true);
            // Slow offline check to 60s
            if (window._offlineCheckInterval) { clearInterval(window._offlineCheckInterval); }
            window._offlineCheckInterval = setInterval(function() {
              var now = Date.now();
              MStore.friends.forEach(function(f) {
                if (f.status === 'online' && f.lastSeen && now - f.lastSeen > 45000) { f.status = 'offline'; }
              });
              MStore.save();
              renderFriends();
              renderChatList();
            }, 15000);
            // Stop dev overlay polling
            if (window._stopDevOverlay) window._stopDevOverlay = true;
          } else {
            // Restore offline check to 30s
            if (window._offlineCheckInterval) { clearInterval(window._offlineCheckInterval); }
            window._offlineCheckInterval = setInterval(function() {
              var now = Date.now();
              MStore.friends.forEach(function(f) {
                if (f.status === 'online' && f.lastSeen && now - f.lastSeen > 45000) { f.status = 'offline'; }
              });
              MStore.save();
              renderFriends();
              renderChatList();
            }, 15000);
            // Restore dev overlay polling
            if (window._stopDevOverlay) window._stopDevOverlay = false;
          }
        }, s.experimentalPerformanceMode);
        break;
      case 'about':
        var changelogBtn = document.getElementById('row-show-changelog');
        if (changelogBtn) changelogBtn.addEventListener('click', showChangelog);
        break;
    }
  }

  function showChangelog() {
    if (document.getElementById('changelog-overlay')) return;
    var overlay = document.createElement('div');
    overlay.id = 'changelog-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    var modal = document.createElement('div');
    modal.style.cssText = 'background:var(--bg-surface);border-radius:16px;padding:20px;max-width:520px;width:92%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.4);border:1px solid var(--border-subtle);';

    function vBlock(version, tag, sections) {
      var tagH = tag ? '<span style="font-size:10px;font-weight:700;color:#fff;background:var(--accent-primary);border-radius:4px;padding:2px 6px;margin-left:8px;text-transform:uppercase;">' + tag + '</span>' : '';
      var body = sections.map(function(s) {
        var items = s[1].map(function(i) { return '<li style="font-size:13px;color:var(--text-secondary);line-height:1.6;">' + i + '</li>'; }).join('');
        return '<div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin:12px 0 4px 0;">' + s[0] + '</div><ul style="margin:0;padding-left:20px;">' + items + '</ul>';
      }).join('');
      return '<div style="border-bottom:1px solid var(--border-subtle);padding-bottom:16px;"><div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">v' + version + tagH + '</div>' + body + '</div>';
    }

    modal.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">' +
        '<h2 style="margin:0;font-size:18px;font-weight:700;color:var(--text-primary);">What\'s New</h2>' +
        '<button id="changelog-close-mobile" style="background:transparent;border:none;cursor:pointer;color:var(--text-secondary);padding:4px;font-size:20px;">✕</button>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:16px;">' +
        vBlock('0.2.0-beta', 'Latest', [
          ['CRITICAL: Mobile Background Notifications & Large File Persistence', [
            'CRITICAL: Mobile Background Notifications Fixed — document.hidden is unreliable in Capacitor WebView; notifications never appeared outside the app. Two-layer fix: JS tracks background via Capacitor appStateChange, and Java OrbitP2PPlugin creates notifications directly via NotificationManager.',
            'CRITICAL: Large File Persistence on Mobile — Files >10MB in IndexedDB had blob: URLs die on restart. Added BlobStoreDB + _restoreAllBlobAttachments() on startup. "Restoring..." placeholders during recovery.'
          ]],
          ['Mobile base64 Streaming Optimizations', [
            'All 7 binary base64 decode sites rewritten as single-pass streaming decoders — no intermediate string allocations. Includes orbitBase64ToArrayBuffer, _base64ToBytes, _safeB64ToArrayBuffer (shared audio/video players).'
          ]],
          ['Notification & Lifecycle Fixes', [
            'Reliable App Background Detection: window._appIsBackgrounded from Capacitor appStateChange listener instead of unreliable document.hidden.',
            'Native Android Notifications from Plugin: OrbitP2PPlugin creates notifications directly via NotificationManager. Works regardless of WebView JS state.',
            'JS→Plugin Foreground Bridge: setForeground() prevents duplicate notifications.'
          ]],
          ['Desktop File Transfer Fixes', [
            'Desktop AV Type Honor Fix: Desktop file-received now honors sender\'s type classification (e.g., .webm audio) instead of blind extension re-classification.'
          ]],
          ['Media Player Improvements', [
            'muted=true Gated to Mobile Only: Desktop players no longer start muted.',
            'Blob MP4 Duration Parsing: fetch(blob:) + Uint8Array byte access for large blob URLs.',
            'Video Player Blob Duration Fallback: Fetches blob and parses MP4 header directly.'
          ]],
          ['Technical', [
            'Version bumped to v0.2.0-beta.',
            'Two-layer notification: JS handles foreground; Java handles background.',
            'All 7 binary decode sites unified to streaming single-pass algorithm.',
            'File persistence: ≤10MB localStorage, >10MB IndexedDB BlobStoreDB.'
          ]]
        ]) +
        vBlock('0.1.9-beta', '', [
          ['CRITICAL: P2P Transfer & Service Lifecycle Fixes', [
            'CRITICAL: Mobile base64 Decode Corruption — atob() corrupts bytes >127. All 7 binary decode sites replaced with safe manual decoder.',
            'CRITICAL: Desktop→Mobile Chunk Joining — desktop btoa()\'s each chunk independently; mobile did chunks.join(\'\') → corrupt at padding boundaries. Fixed: per-chunk independent decode + ArrayBuffer concat.',
            'CRITICAL: WriteStream Race (Mobile→Desktop) — stream.end() async; onComplete fired before flush → truncated files, lost audio/duration. Fixed: stream.on(\'finish\') wraps completion.',
            'CRITICAL: P2P cleanup() Race in Android Plugin — cleanup() called stopService() then initP2P found boundService still non-null, skipped restart. Fixed: Java cleanup() is a no-op (JS already clears listeners).'
          ]],
          ['File Transfer Fixes', [
            'Mobile Type Override Fixed (HIGH): FILE_TRANSFER_END no longer overwrites correct video/audio type — only overwrites if null/undefined/file.',
            'Mobile Video Compression Dropped Audio (HIGH): canvas.captureStream(15) captures only pixels. Disabled compressVideoMobile — raw video with audio sent.',
            'Group Chat File Routing Fixed: FILE_TRANSFER_START/END lacked chatId. Added to desktop + mobile packets.',
            'Hash Mismatch Silenced: Platform hash diff is harmless — console.warn only, file always saved.'
          ]],
          ['Media & UI Fixes', [
            'Mobile Metadata Preload: muted=true + preload=metadata forces mobile browsers to load duration immediately. Audio restored on play.',
            'Video Player preload Changed to metadata — saves bandwidth.',
            'Transfer Error X Button Fixed: preventDefault + stopPropagation on dismiss.',
            'Peer Status Dot After Auto-Connect: Immediate online status update.'
          ]],
          ['Quality of Life', [
            'Unstable AV Transfer Warning Modal: Shown on audio/video send. "Don\'t show again" checkbox, nicer alert-triangle icon.',
            'Auto-Discovery Diagnostic Logging: [AutoConnect] logs in DevTools.'
          ]],
          ['Technical', [
            'Version bumped to v0.1.9-beta.'
          ]]
        ]) +
        vBlock('0.1.8.1-beta', '', [
          ['CRITICAL: P2P Cross-Platform Fixes', [
            'Mobile→Desktop File Transfers Silently Deleted (CRITICAL): hash was empty — desktop always deleted file. Fixed: real SHA-256 computed via crypto.subtle; desktop skips hash check when omitted.',
            'FILE_TRANSFER Packets Had Empty Sender (CRITICAL): from/senderId was \'\'. Fixed: passes userId + peerId to createPacket.',
            'createPacket Signature Aligned to Desktop (CRITICAL): changed from (type,payload,senderId) to (type,fromId,toId,payload). Added packetId and to fields. Updated all 28 call sites.',
            'Duplicate Messages for Large Files Fixed (CRITICAL): _fileId markers in MESSAGE attachment — receiver merges into existing message instead of creating second entry.'
          ]],
          ['High-Impact Fixes', [
            'Missing File Extensions Added (HIGH): video (m4v,wmv,flv,f4v,ts,mts,m2ts), image (svg,tiff,bmp,heic,heif,avif), audio (opus,mka) — correct MIME mappings.',
            'Media Persistence Fixed: Received files survive restart — _dataUrl stored alongside blob URL for recovery.',
            'renderMessages No Longer Mutates Store: data:→blob conversion no longer corrupts MStore.messages.',
            '.webm Misclassification Fixed: .webm removed from audioMatch — video checked first.',
            'Desktop isVideo Added: file-received handler now classifies videos with proper MIME.'
          ]],
          ['Video Player', [
            'Mobile Video Aspect Ratio Fixed: object-fit: contain, max-height 50vh (was 300px), #000 letterbox background.'
          ]],
          ['Technical', [
            'Version bumped to v0.1.8.1-beta.'
          ]]
        ]) +
        vBlock('0.1.8-beta', '', [
          ['Store Class Ported to Mobile', [
            'Dedicated Store class created: Inline MStore (~350 lines) extracted into store.js (760 lines) — full class with property-based access (MStore.friends, MStore.settings.*) for backward compatibility plus getState()/setState()/subscribe() for convergence.',
            'Desktop parity features added: subscribe/notify, blockUser/unblockUser, pinMessage/unpinMessage, markAsRead, toggleMute, group management (addGroup/removeGroup/addMemberToGroup), DM management (closeDM/togglePinDM/reopenDM), E2EE key storage, transfer tracking, addOrUpdatePeer.'
          ]],
          ['Bug Fixes', [
            'addMessage() unread tracking fixed (HIGH): Removed — mobile manages unreads via chat.unread. Every message was previously counted as unread.',
            'mutedChats misalignment fixed (HIGH): Now aliases settings.mutedChats — all mute/unmute ops update same object mobile reads via MStore.settings.mutedChats.',
            'setState() currentUser fixed (MEDIUM): now maps to this.user — previously silently dropped.'
          ]],
          ['Technical', [
            'MStore API fully backward-compatible — 532+ references preserved.',
            'Desktop CSP updated for Prism.js (cdnjs.cloudflare.com).',
            'Prism.js loading fixed: loads before app.js on both platforms.',
            'Version bumped to v0.1.8-beta.'
          ]]
        ]) +
        vBlock('0.1.7-beta', '', [
          ['Video Playback Fixes', [
            'PIPELINE_ERROR_DECODE Root Cause Fixed: Audio packet decode errors in fMP4 files resolved via Content-Type fix in main.js. Videos play continuously.',
            'Re-render Guard: Store subscription blocks re-renders while video plays (except chat switches). Handles notify() without changedState.',
            'Decode Error Retry: On PIPELINE_ERROR_DECODE, source reloads and skips forward +2s (up to 3 attempts).',
            'Removed Forced Seeking: Eliminated currentTime = 1e10 hack for orbit-db:// / orbit-file:// URLs.'
          ]],
          ['Media Player UX Improvements', [
            'Larger Video Player: Display increased to 720x600 in messages. Fullscreen has shadow + theme-matched letterbox.',
            'Larger Audio Player: Waveform canvas height increased to 200px, full-width container (720px).',
            'Separated Media Layout: Video and audio removed from image grid — standalone blocks at full width.',
            'Fullscreen uses var(--bg-surface) — blends with active UI theme.'
          ]]
        ]) +
        vBlock('0.1.6-beta', '', [
          ['P2P Connectivity & Bug Fixes', [
            'Desktop Auto-Connect Port: Uses peer.tcpPort instead of hardcoded 46000. Per-peer ports stored in SocketManager._peerPorts.',
            'Desktop P2P Edit Loop Fixed: store.editMessage no longer re-broadcasts (caused echo). Single broadcast from chat-panel.js.',
            'Desktop Context Menu Edit: No-op log replaced with proper editingMsg flow.',
            'Mobile Disconnect Handler Fixed (Critical): Friend lookup by connectionId works — connectionId stored on connect + beacon. Falls back to IP split.',
            'Mobile TCP/UDP Beacon Handlers: Store tcpPort, connectionId, ip on friends. Auto-reconnect uses peer port.',
            'Mobile Orbit Echo: Status correctly reset to online on friend load.'
          ]],
          ['Message Editing & Reactions', [
            'Mobile Edit P2P Broadcast: Edits broadcast to DMs and group members with chatId for group routing.',
            'Mobile edited Flag: Incoming MESSAGE_EDIT sets msg.edited = true.',
            'Mobile Reaction UI: Reaction button, floating picker (6 emojis), toggle on pills, P2P broadcast via REACTION protocol.'
          ]],
          ['Android Foreground Service', [
            'OrbitForegroundService: Full P2P engine as persistent Android Service — TCP server, UDP multicast, WakeLock, START_STICKY.',
            'OrbitP2PPlugin: Thin proxy forwarding calls via Binder. Events drained every 100ms to JS listeners.',
            'BootReceiver: Restarts foreground service on BOOT_COMPLETED.',
            'JS Lifecycle: visibilitychange, appStateChange, pageshow re-render UI and restart discovery on foreground.',
            'sendFailed/connectFailed events now delivered to JS (were silently dropped).',
            'Battery Optimization exemption permission + JS bridge method.'
          ]],
          ['Silent Bug Fixes', [
            'serverSocket volatile — prevents stale null on stopServer',
            'PeerConnection stale map entry eliminated — both original + updated peerId keys cleaned',
            'Executor shutdownNow on destroy — prevents thread leaks on START_STICKY recreation',
            'Static eventQueue cleared on destroy — prevents stale events from old instance',
            'SO_REUSEADDR on MulticastSocket — prevents bind failure on discovery restart',
            'joinGroup with explicit NetworkInterface — Android 10+ compatibility'
          ]]
        ]) +
        vBlock('0.1.5-beta', '', [
          ['New Features', [
            'Account Switcher (Experimental): Right-click avatar on desktop to add/switch/logout accounts. Last active user auto-loaded.',
            'PIN Lock Screen (2FA Experimental): 4-8 digit PIN, SHA-256 hashed, numpad UI, 5-attempt cooldown, Forgot PIN reset.',
            'Per-Account Message Isolation: Messages stored per-user via userChatIds. accountOwnerId columns for DB isolation.',
            'Per-Account Avatar Frames: Frame loaded from user record, not shared settings.',
            'Orbit Echo Welcome Sequence: 4 welcome messages with typing indicator delays.',
            'Beacon Payload Enriched: Avatar, banner, bio, profileFrame, publicKey in both UDP and TCP beacons.',
            'Friend Status Starts Offline: Friends load offline (except Echo). Faster offline detection (45s threshold, 15s interval).',
            'Group Avatar Backfill: Async fetch for groups with avatarPath but no avatarDataUrl.'
          ]],
          ['Bug Fixes', [
            'Messages from other accounts no longer leak — per-account auto-track and render filtering',
            'Closing DMs no longer affects other accounts — per-account closedDMs/pinnedDMs in settings',
            'Leaving groups correctly hides the group — renderGroups checks membership, removeGroupMember untracks chat',
            '"User"#0000 placeholder fixed, store syntax error fixed, various cross-account isolation fixes'
          ]]
        ]) +
        vBlock('0.1.4-beta', '', [
          ['New Features', [
            'Native Android System Notifications: Messages now show as real system notifications when app is backgrounded (requires POST_NOTIFICATIONS permission)',
            'Desktop Notification Avatars: Sender/group avatar now shown as notification icon',
            'Connection Stats Panel: Live P2P status — online peers, uptime, sent/received message counters',
            'Video File Support: Upload, render, and view video files in chat with play overlay',
            'Video Preview Modal: Full-screen video player on desktop and mobile',
            'Video Compression: Large videos (>5MB) auto-compressed to 720p/500kbps before sending',
            'P2P Discovery Optimized: Beacon interval reduced, stale threshold increased, exponential backoff',
            'Group Info UI: Theme CSS variables for consistent dark/light mode appearance',
            'Performance Mode: New toggle in Experimental settings with two-step confirmation',
            'Compact Spacing & Swipe-to-Reply moved from Experimental to chat settings'
          ]],
          ['Bug Fixes & Optimizations', [
            'Image Viewer reliability fixes, JS-level CPU optimization for GIFs and link previews',
            'Forced reflow cascade eliminated, data-refreshing animation guard added',
            'Leaked offline check interval fixed, mobile HTML nesting fixed',
            'E2EE cross-platform key derivation — per-platform group encryption as first step',
            'P2P Auto-Connection Stabilization: PING/PONG keep-alive, socket timeout, reconnect logic, stale peer pruning',
            'Translation Improvements: cache, dedup, abort controller, retry on failure',
            'Voice Messages: Content-Type fix, onerror handler, chunked transfer audio detection',
            'Image Viewer: quick-save button, keyboard navigation, swipe, download fix, loading placeholder',
            'Group sync fixes: owner transfer roles, self-leave cleanup, invite adds group, GROUP_CREATE init messages'
          ]]
        ]) +
        vBlock('0.1.3-beta', '', [
          ['Bug Fixes', [
            'Manual Connect Bug Fixed: "Add a Friend" IP connect no longer creates duplicate TCP connections',
            'Hardcoded type strings eliminated — all use Protocol.Types constants'
          ]],
          ['Technical', [
            'Protocol Type Unification: All 47 types unified across shared and desktop protocol.js',
            'Build Pipeline Overhaul: Android assembleRelease, SHA256 checksums, artifact verification'
          ]]
        ]) +
        vBlock('0.1.2-beta', '', [
          ['Bug Fixes', [
            'Desktop Bug Fixes — require(crypto) → window.crypto in sidebar-middle; PIN_MESSAGE groupId in payload'
          ]]
        ]) +
        vBlock('0.1.1-beta', '', [
          ['New Features', [
            'Voice & Video Calls (P2P): Full WebRTC call system with incoming notification, mute/speaker controls',
            'Group Calls (Mesh): Each participant gets their own RTCPeerConnection',
            'Camera Toggle: On/off during calls with HSL avatar placeholder',
            'Message Forwarding: Forward messages with attachments to any chat',
            'Block User: Block/unblock from context menu; P2P filter drops blocked packets',
            'Search Within a Chat: Scoped search with chatId filter, sender filter, date inputs',
            'Export Chat History: JSON or TXT export with timestamped downloads',
            'Save/Load Themes: Export current theme as JSON; import via file picker',
            'Message Translate Unlocked: Always-on translate button, default enabled'
          ]],
          ['Bug Fixes', [
            'Mobile Reply fromName fix, Lucide Icon null fix, Call Modal UI centering'
          ]]
        ]) +
        vBlock('0.1.0-beta', '', [
          ['Performance', [
            'Up to 5× faster startup and rendering — selective store subscriptions, setStateBatch microtask coalescing',
            'Startup: ~40% faster — deferred init phases, batched store IPC, lazy message loading',
            'freezeGifImages: Canvas cache, expanded selectors, global call on Reduce Motion toggle'
          ]],
          ['Bug Fixes', [
            'orbit-db://attachment/ 404 fix, selective subscriber undefined changedState fix',
            'Message avatar click moved from re-attached events to delegated actions',
            'loadFullChatMessages was dropping existing messages'
          ]]
        ]) +
        vBlock('0.0.9.3-beta', '', [
          ['New Features', [
            'Group Info Panel overhaul — Add Member, Leave Group, Transfer Ownership, member search',
            'DM context menus — Pin/Unpin, Mute, View Profile, Copy ID, Close DM',
            'Pinned DMs — pinned state sorted first with pin icon',
            'Close DM removes friend from DB with full cleanup',
            'P2P Diagnostics panel — logs, errors, peer info, connection stats',
            'Debug log buffer — captures last 500 console entries',
            'Global Gallery type filters — All/Images/Files, view mode persisted'
          ]],
          ['Bug Fixes', [
            'Gallery sidebar Files tab fix, Context menu data-action fix',
            'P2P protocol audit — isPeerConnected key mismatch, type string fixes'
          ]]
        ]) +
        vBlock('0.0.9.2-beta', '', [
          ['New Features', [
            'Mobile initP2P Logging — detailed debug logs throughout P2P initialization',
            'Dev Mode DevTools — toggling loads eruda on-device inspector panel',
            'Debug Log Buffer — scrollable log overlay when dev mode is active'
          ]],
          ['Bug Fixes', [
            'Desktop sends messages to mobile (BEACON IP fallback)',
            'Mobile peer merging (host:port→UUID dedup)'
          ]]
        ]) +
        vBlock('0.0.9-beta', '', [
          ['Bug Fixes', [
            'Android P2P Stability: 8 Java plugin fixes + 4 JS bridge fixes',
            'Desktop P2P Stability: 9 fixes (write queue, oversized frames, socket errors, self-beacon filter)',
            'Desktop Socket Write Queue: per-connection queue prevents TCP byte interleaving',
            'Mobile DB Fix: migration runs after user load to prevent identity corruption'
          ]],
          ['New Features', [
            'Mobile Group Info Panel: edit name/description, avatar, invite code, pin/mute, member roles',
            'Pinned Messages: pin/unpin in action bar; pinned section in group info; cross-platform sync',
            'Message Search: search bar filters messages in real-time on mobile',
            'Enhanced Message FX: particle confetti system on both platforms',
            'Mobile Settings: Font Size, Message Animation, Auto-Reconnect, Connection Timeout',
            'Avatar in P2P Beacons: cross-platform avatar sharing in discovery packets'
          ]]
        ]) +
        vBlock('0.0.8-beta', '', [
          ['New Features', [
            'Rich Link Previews v2 — Open Graph metadata fetched via Electron IPC',
            'Cross-Platform P2P: Desktop ↔ Android LAN discovery and messaging via TCP/UDP',
            'Mobile Settings Wired: All toggles now have real behavior',
            'Mobile Toast Overhaul: Type-based accent bar, icons, slide-in animation',
            'Mobile Notification Sound: Web Audio beep on incoming P2P messages',
            'Chat Background Patterns: Diagonal Stripes, Crosshatch, Circles'
          ]],
          ['Bug Fixes', [
            'QR Code Fixes, MIME mapping, cache headers, media retry, attachment URL stability'
          ]]
        ]) +
        vBlock('0.0.7-beta', '', [
          ['New Features', [
            'First-Time User Tutorial (Welcome Tour) — skippable and replayable via Settings',
            'Link Previews — Rich URL cards rendered directly in chat messages',
            'Activity Center Overhaul — Modern notification timeline with tabs',
            'Shared Media Gallery — Revamped panel with Images, Files, and Links',
            'Privacy Mode Overhaul — Attachments and thumbnails properly handled'
          ]]
        ]) +
        vBlock('0.0.6-beta', '', [
          ['Bug Fixes', [
            'XSS fixes, CSS injection fix, network packet null-safety',
            'Store immutability, fixed duplicate addMemberToGroup, data cleanup on removeGroup',
            'Fixed require(crypto) in renderer, unguarded networkSend calls fixed',
            'Consistent clipboard with fallback'
          ]],
          ['New Features', [
            'Dev Mode master gate, True Dark theme, Custom theme dropdown, Seasonal theme',
            'Custom Colors modal, Profile Frames, Animated Avatars, Message FX',
            'Message Translate, Compact Spacing, App Zoom slider',
            '42 decorative profile frame overlays, experimental feature badges'
          ]]
        ]) +
        vBlock('0.0.5-beta', '', [
          ['New Features', [
            'Backup & Restore, Database Health Check, Database Repair',
            'Unread badges, @mention highlighting, mention badges, jump to first unread',
            'Read receipts, Edit message sync, Per-chat mute, Keyboard shortcuts',
            'Transfer cancellation, Disk space check, File size enforcement',
            'Group roles (Owner/Admin/Member), Group Info Panel, Join request system',
            'E2EE encryption (ECDH + AES-256-GCM) for DMs, Privacy Mode',
            'Network Dashboard, Do Not Disturb mode, Settings tabs redesign'
          ]]
        ]) +
        vBlock('0.0.4-beta', '', [
          ['New Features', [
            'Group chat creation and joining, Invite code system',
            'Pinned messages, Message reactions, Image gallery sidebar',
            'File transfer system with TCP, Transfer progress UI'
          ]]
        ]) +
        vBlock('0.0.3-beta', '', [
          ['New Features', [
            'LAN peer discovery via UDP broadcasting',
            'Local echo channel for testing, Friend list with online status'
          ]]
        ]) +
        vBlock('0.0.2-beta', '', [
          ['New Features', [
            'Early development release with core messaging infrastructure',
            'User identity and profile system, Settings and preferences framework'
          ]]
        ]) +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    var closeBtn = document.getElementById('changelog-close-mobile');
    if (closeBtn) closeBtn.addEventListener('click', function() { overlay.remove(); });
  }

  var _fpsMonitorInterval = null;
  var _devOverlayEl = null;

  function toggleFpsMonitor(on) {
    if (on) {
      if (!document.getElementById('fps-monitor')) {
        var el = document.createElement('div');
        el.id = 'fps-monitor';
        el.style.cssText = 'position:fixed;top:4px;right:4px;z-index:99997;background:rgba(0,0,0,0.7);color:#0f0;font-family:monospace;font-size:11px;padding:4px 8px;border-radius:4px;pointer-events:none;';
        document.body.appendChild(el);
      }
      var frames = 0;
      var lastTime = performance.now();
      if (_fpsMonitorInterval) clearInterval(_fpsMonitorInterval);
      _fpsMonitorInterval = setInterval(function() {
        var now = performance.now();
        var fps = Math.round(frames * 1000 / (now - lastTime));
        var el = document.getElementById('fps-monitor');
        if (el) el.textContent = fps + ' FPS';
        frames = 0;
        lastTime = now;
      }, 1000);
      var rafLoop = function() { frames++; requestAnimationFrame(rafLoop); };
      requestAnimationFrame(rafLoop);
    } else {
      if (_fpsMonitorInterval) { clearInterval(_fpsMonitorInterval); _fpsMonitorInterval = null; }
      var el = document.getElementById('fps-monitor');
      if (el) el.remove();
    }
  }

  function toggleDevOverlay(on) {
    if (on) {
      if (_devOverlayEl) { _devOverlayEl.style.display = 'block'; return; }
      _devOverlayEl = document.createElement('div');
      _devOverlayEl.id = 'dev-overlay';
      _devOverlayEl.style.cssText = 'position:fixed;top:4px;left:4px;z-index:99997;background:rgba(0,0,0,0.7);color:#0af;font-family:monospace;font-size:10px;padding:6px 10px;border-radius:4px;pointer-events:none;line-height:1.6;max-width:200px;';
      document.body.appendChild(_devOverlayEl);
      var update = function() {
        if (!_devOverlayEl) return;
        var conns = (window.Orbit && Orbit.P2P ? Orbit.P2P.getConnections().length : 0);
        var friends = MStore.friends.length;
        var chats = MStore.chats.length;
        var msgs = 0;
        var allKeys = [];
        for (var _i = 0; _i < localStorage.length; _i++) { var _k = localStorage.key(_i); if (_k.indexOf('orbit_msg_') === 0) { allKeys.push(_k.substring(9)); } }
        allKeys.forEach(function(k) { msgs += (MStore.messages[k] || MStore.getMessages(k)).length; });
        _devOverlayEl.innerHTML = 'Friends: ' + friends + '<br>Chats: ' + chats + '<br>Messages: ' + msgs + '<br>P2P Conns: ' + conns;
        if (MStore.settings.experimentalDevOverlay && !window._stopDevOverlay) requestAnimationFrame(update);
      };
      update();
    } else {
      if (_devOverlayEl) { _devOverlayEl.remove(); _devOverlayEl = null; }
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
      freezeGifImages(document);
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
      var allKeys = [];
      for (var _i = 0; _i < localStorage.length; _i++) { var _k = localStorage.key(_i); if (_k.indexOf('orbit_msg_') === 0) { allKeys.push(_k.substring(9)); } }
      allKeys.forEach(function(k) { msgCount += (MStore.messages[k] || MStore.getMessages(k)).length; });
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
      : '';

    var pfNum = getProfileFrame(MStore.settings);
    var selfFrameHtml = pfNum > 0 ? '<img src="icons/frames/pfp_frame_' + pfNum + '.png" class="pfp-frame" style="position:absolute;top:-15%;left:-17%;pointer-events:none;" draggable="false" alt="">' : '';

    container.innerHTML =
      '<div class="profile-hero" style="' + bannerStyle + '">' +
        '<div class="profile-hero-bg"></div>' +
        '<div class="profile-hero-content">' +
          '<div class="profile-avatar-wrapper" style="position:relative;">' + (u.avatar ? '<img src="' + escapeHtml(u.avatar) + '">' : '<div class="avatar-placeholder">' + initial + '</div>') + selfFrameHtml + '</div>' +
          '<div class="profile-name">' + escapeHtml(u ? u.name : 'User') + '</div>' +
          '<div class="profile-id">#' + escapeHtml(u ? u.tag : '0000') + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="padding: 16px;">' +
      '<div class="settings-section">' +
        '<div class="settings-section-title">Edit Profile</div>' +
        '<div class="settings-item">' +
          '<div style="color:var(--text-secondary);font-size:14px;width:70px;font-weight:600;">Name</div>' +
          '<input class="profile-input" id="edit-username" value="' + escapeHtml(u ? u.name : '') + '" maxlength="32" placeholder="Your name" style="flex:1;background:transparent;border:none;color:var(--text-primary);text-align:right;font-size:15px;outline:none;min-width:0;">' +
        '</div>' +
        '<div class="settings-item" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
          '<div style="color:var(--text-secondary);font-size:14px;font-weight:600;">Bio</div>' +
          '<textarea class="profile-textarea" id="edit-bio" placeholder="Tell us about yourself..." maxlength="160" style="width:100%;box-sizing:border-box;background:var(--bg-hover);border-radius:12px;border:none;padding:12px;color:var(--text-primary);resize:none;outline:none;font-size:14px;min-height:80px;">' + escapeHtml(u && u.bio ? u.bio : '') + '</textarea>' +
        '</div>' +
        '<div class="settings-item">' +
          '<div style="color:var(--text-secondary);font-size:14px;width:70px;font-weight:600;">Avatar</div>' +
          '<div style="display:flex;gap:8px;flex:1;min-width:0;">' +
            '<input class="profile-input" id="edit-avatar" value="' + escapeHtml(u && u.avatar ? u.avatar : '') + '" placeholder="URL" style="flex:1;min-width:0;background:transparent;border:none;color:var(--text-primary);font-size:14px;outline:none;text-align:right;">' +
            '<button class="profile-upload-btn" id="btn-upload-avatar" data-target="avatar" style="background:var(--bg-hover);border:none;color:var(--accent-primary);font-weight:700;padding:6px 12px;border-radius:10px;cursor:pointer;font-size:12px;text-transform:uppercase;flex-shrink:0;">Edit</button>' +
          '</div>' +
        '</div>' +
        '<div class="settings-item" style="border:none;">' +
          '<div style="color:var(--text-secondary);font-size:14px;width:70px;font-weight:600;">Banner</div>' +
          '<div style="display:flex;gap:8px;flex:1;min-width:0;">' +
            '<input class="profile-input" id="edit-banner" value="' + escapeHtml(u && u.banner ? u.banner : '') + '" placeholder="URL" style="flex:1;min-width:0;background:transparent;border:none;color:var(--text-primary);font-size:14px;outline:none;text-align:right;">' +
            '<button class="profile-upload-btn" id="btn-upload-banner" data-target="banner" style="background:var(--bg-hover);border:none;color:var(--accent-primary);font-weight:700;padding:6px 12px;border-radius:10px;cursor:pointer;font-size:12px;text-transform:uppercase;flex-shrink:0;">Edit</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      (MStore.settings.experimentalProfileFrames ? (
      '<div class="settings-section">' +
        '<div class="settings-item" style="border:none;">' +
          '<div style="color:var(--text-secondary);font-size:14px;flex-shrink:0;">Frame</div>' +
          '<select id="profile-frame-select" style="background:var(--bg-hover);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:8px;padding:6px 10px;font-size:13px;outline:none;margin-left:auto;">' +
            (function() {
              var opts = '';
              for (var fi = 0; fi <= 42; fi++) {
                opts += '<option value="' + fi + '"' + (MStore.settings.profileFrame == fi ? ' selected' : '') + '>' + (fi === 0 ? 'None' : '#' + fi) + '</option>';
              }
              return opts;
            })() +
          '</select>' +
        '</div>' +
      '</div>'
      ) : '') +
      '<div class="settings-section">' +
        '<div class="settings-item" style="border:none;">' +
          '<div style="color:var(--text-secondary);font-size:14px;flex-shrink:0;">User ID</div>' +
          '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);word-break:break-all;text-align:right;margin-left:10px;">' + escapeHtml(u ? u.id : '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="height:64px;"></div>' +
      '</div>';
    renderLucide({ root: container });

    function checkChanges() {
      var username = document.getElementById('edit-username').value.trim();
      var bio = document.getElementById('edit-bio').value.trim();
      var avatar = document.getElementById('edit-avatar').value.trim();
      var banner = document.getElementById('edit-banner').value.trim();
      
      var changed = (username !== (u && u.name ? u.name : '')) ||
                    (bio !== (u && u.bio ? u.bio : '')) ||
                    (avatar !== (u && u.avatar ? u.avatar : '')) ||
                    (banner !== (u && u.banner ? u.banner : ''));
      
      document.getElementById('btn-save-profile-header').style.display = changed ? 'block' : 'none';
    }

    document.getElementById('edit-username').addEventListener('input', checkChanges);
    document.getElementById('edit-bio').addEventListener('input', checkChanges);
    document.getElementById('edit-avatar').addEventListener('input', checkChanges);
    document.getElementById('edit-banner').addEventListener('input', checkChanges);

    // Profile frame selector
    var frameSelect = document.getElementById('profile-frame-select');
    if (frameSelect) {
      frameSelect.addEventListener('change', function() {
        MStore.settings.profileFrame = parseInt(this.value, 10) || 0;
        MStore.save();
        renderProfile();
        updateNavAvatar();
        renderChatList();
        renderFriends();
        renderSettings();
      });
    }

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
              MStore.compressImage(e.target.result, 800, 800, 0.8, function(compressedUrl) {
                document.getElementById(inputId).value = compressedUrl;
                checkChanges();
              });
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

    // Remove any previous event listeners on the header save button
    var oldBtn = document.getElementById('btn-save-profile-header');
    var newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    newBtn.style.display = 'none'; // reset state

    // Bind save button
    newBtn.addEventListener('click', function() {
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
      
      newBtn.style.display = 'none';
    });
  }

  function showProfileOverlay(chatId) {
    var friend = MStore.friends.find(function(f) { return f.id === chatId; });
    if (!friend) { showToast('Friend not found', 'info'); return; }

    var initial = friend.name ? friend.name.charAt(0).toUpperCase() : '?';
    var statusLabels = { online: 'Online', away: 'Away', busy: 'Busy', offline: 'Offline' };
    var statusColor = getStatusColor(friend.status);
    var frameNum = getProfileFrame(friend);

    var backdrop = document.createElement('div');
    backdrop.id = 'profile-view-overlay';
    var safeBottom = 'var(--safe-area-bottom, 0px)';
    backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100dvh;z-index:99999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.15s;';
    backdrop.addEventListener('click', function(e) { if (e.target === backdrop) backdrop.remove(); });

    var card = document.createElement('div');
    card.style.cssText = 'background:var(--bg-surface);border-radius:16px;width:88%;max-width:340px;overflow:hidden;animation:scaleIn 0.2s cubic-bezier(0.16,1,0.3,1);box-shadow:0 8px 40px rgba(0,0,0,0.3);';
    card.addEventListener('click', function(e) { e.stopPropagation(); });

    var bannerUrl = friend.banner;
    var bannerStyle = bannerUrl
      ? 'background-image:url(' + escapeHtml(bannerUrl) + ');background-size:cover;background-position:center;'
      : 'background:linear-gradient(135deg,var(--accent-primary),#EC4899);';

    var avatarSize = 80;
    var avatarOverlap = 40;
    var avatarHtml = friend.avatar
      ? '<img src="' + escapeHtml(friend.avatar) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
      : '<div style="width:100%;height:100%;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:#fff;">' + initial + '</div>';

    var frameHtml = '';
    if (frameNum > 0) {
      var frameSrc = 'icons/frames/pfp_frame_' + frameNum + '.png';
      frameHtml = '<img src="' + frameSrc + '" class="pfp-frame" style="position:absolute;top:-15%;left:-17%;pointer-events:none;" draggable="false" alt="">';
    }

    card.innerHTML =
      '<div style="height:100px;' + bannerStyle + 'position:relative;"></div>' +
      '<div style="padding:0 16px 16px;margin-top:-' + (avatarOverlap + 4) + 'px;">' +
        '<div style="position:relative;width:' + avatarSize + 'px;height:' + avatarSize + 'px;margin-bottom:8px;">' +
          '<div style="width:' + avatarSize + 'px;height:' + avatarSize + 'px;border-radius:50%;border:4px solid var(--bg-surface);overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.15);background:var(--bg-hover);">' +
            avatarHtml +
          '</div>' +
          frameHtml +
          '<div style="position:absolute;bottom:2px;right:2px;width:18px;height:18px;border-radius:50%;background:' + statusColor + ';border:3px solid var(--bg-surface);box-sizing:content-box;"></div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<span style="font-size:20px;font-weight:700;color:var(--text-primary);">' + escapeHtml(friend.name) + '</span>' +
          (friend.tag ? '<span style="font-size:14px;color:var(--text-muted);font-weight:500;">#' + escapeHtml(friend.tag) + '</span>' : '') +
        '</div>' +
        (friend.status ? '<div style="font-size:13px;color:var(--text-muted);margin-top:4px;">' + (statusLabels[friend.status] || friend.status) + '</div>' : '') +
      '</div>' +
      (friend.bio ? '<div style="padding:0 16px 12px;">' +
        '<div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">About Me</div>' +
        '<div style="font-size:14px;color:var(--text-secondary);line-height:1.4;">' + (window.Sanitize ? window.Sanitize.markdown(friend.bio) : escapeHtml(friend.bio)) + '</div>' +
      '</div>' : '') +
      '<div style="padding:0 16px 12px;">' +
        '<div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Mutual</div>' +
        '<div style="font-size:13px;color:var(--text-muted);">' + MStore.groups.filter(function(g) { return g.members && g.members.find(function(m) { return m.userId === friend.id; }); }).length + ' groups in common</div>' +
      '</div>' +
      (MStore.settings.devMode && friend.id ? '<div style="padding:0 16px 4px;"><div style="font-size:10px;color:var(--text-muted);word-break:break-all;font-family:monospace;">ID: ' + escapeHtml(friend.id) + '</div></div>' : '') +
      '<div style="padding:12px 16px 16px;">' +
        '<button id="btn-profile-close-view" style="width:100%;padding:11px;background:var(--bg-hover);border:none;border-radius:10px;color:var(--text-primary);font-size:15px;font-weight:600;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background=\'var(--bg-surface-hover)\'" onmouseout="this.style.background=\'var(--bg-hover)\'">Close</button>' +
      '</div>';

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    document.getElementById('btn-profile-close-view').addEventListener('click', function() { backdrop.remove(); });
    renderLucide({ root: card });
  }

  function showProfile() {
    renderProfile();
    var panel = document.getElementById('panel-profile-overlay');
    var backdrop = document.getElementById('profile-overlay-backdrop');
    panel.classList.add('open');
    backdrop.style.display = 'block';
    document.getElementById('mobile-nav').classList.add('nav-hidden');
  }

  function hideProfile() {
    document.getElementById('panel-profile-overlay').classList.remove('open');
    document.getElementById('profile-overlay-backdrop').style.display = 'none';
    document.getElementById('mobile-nav').classList.remove('nav-hidden');
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
    var msgs = MStore.getMessages(activeChatId);
    var images = msgs.filter(function(m) {
      return m.attachments && m.attachments.some(function(a) { return a.type === 'image'; });
    });

    if (images.length === 0) {
      container.innerHTML =
        '<div class="gallery-empty"><i data-lucide="image"></i><div>No images shared yet</div></div>';
      renderLucide({ root: container });
      return;
    }

    var html = '<style>' +
      '.gallery-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(110px, 1fr));gap:2px;padding:2px;}' +
      '.gallery-item{aspect-ratio:1;position:relative;cursor:pointer;background:var(--bg-hover);}' +
      '.gallery-item::after{content:"";position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.1);opacity:0;transition:opacity 0.2s;}' +
      '.gallery-item:active::after{opacity:1;}' +
      '.gallery-item img{width:100%;height:100%;object-fit:cover;}' +
      '</style>';
    
    html += '<div class="gallery-grid">';
    images.forEach(function(m) {
      if (m.attachments) {
        m.attachments.forEach(function(a) {
          if (a.type === 'image' && a.url) {
            html += '<div class="gallery-item" onclick="openLightbox(\'' + escapeHtml(a.url).replace(/'/g, "\\'") + '\')"><img src="' + escapeHtml(a.url) + '" loading="lazy"></div>';
          }
        });
      }
    });
    html += '</div>';
    container.innerHTML = html;
    renderLucide({ root: container });
  }

  window.openLightbox = function(url) {
    var existing = document.getElementById('image-lightbox');
    if (existing) existing.remove();

    var html = '<div id="image-lightbox" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s;">' +
      '<button onclick="this.parentNode.remove()" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.1);border:none;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);"><i data-lucide="x"></i></button>' +
      '<img src="' + escapeHtml(url) + '" style="max-width:100%;max-height:100%;object-fit:contain;animation:scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);">' +
    '</div>';
    
    var div = document.createElement('div');
    div.innerHTML = html;
    var lightbox = div.firstChild;
    document.body.appendChild(lightbox);
    
    // allow clicking background to close
    lightbox.addEventListener('click', function(e) {
      if (e.target === lightbox) lightbox.remove();
    });
    
    renderLucide({ root: lightbox });
  };

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
      var memberName = m.name || m.username || '';
      var uName = mid === myId && MStore.user ? (MStore.user.name || MStore.user.username) : '';
      var name = friend ? friend.name : (memberName || uName || mid);
      var tag = friend ? (friend.tag || '') : '';
      var initial = name.charAt(0).toUpperCase();
      var memberAvatar = m.avatar || '';
      var selfAvatar = mid === myId && MStore.user ? (MStore.user.avatar || null) : null;
      var mAvatar = friend && friend.avatar
        ? '<img src="' + escapeHtml(friend.avatar) + '" alt="">'
        : (memberAvatar ? '<img src="' + escapeHtml(memberAvatar) + '" alt="">'
        : (selfAvatar ? '<img src="' + escapeHtml(selfAvatar) + '" alt="">'
        : initial));
      var statusColor = friend
        ? ({ online: 'var(--accent-success)', away: 'var(--accent-warning)', busy: 'var(--accent-danger)', offline: 'var(--text-muted)' }[friend.status] || 'var(--text-muted)')
        : 'var(--text-muted)';
      var mPfNum = mid === myId ? getProfileFrame(MStore.settings) : (friend ? getProfileFrame(friend) : 0);
      var mPfHtml = mPfNum > 0 ? '<img src="icons/frames/pfp_frame_' + mPfNum + '.png" class="pfp-frame" style="position:absolute;top:-15%;left:-17%;pointer-events:none;" draggable="false" alt="">' : '';

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
          mPfHtml +
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
      var msgs = MStore.getMessages(c.id);
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
        var icon = isMine ? 'arrow-up-right' : 'message-square';
        html += '<div class="activity-item" data-chat="' + c.id + '">' +
          '<div class="activity-icon-container"><i data-lucide="' + icon + '" style="width:20px;height:20px;"></i></div>' +
          '<div class="activity-details" style="flex:1;min-width:0;">' +
            '<div class="activity-user" style="font-weight:700;color:var(--text-primary);margin-bottom:2px;">' + escapeHtml(senderName) + ' <span class="activity-time" style="font-weight:normal;color:var(--text-muted);font-size:12px;float:right;">' + formatTime(m.time) + '</span></div>' +
            '<div class="activity-text" style="color:var(--text-secondary);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(text) + '</div>' +
          '</div>' +
        '</div>';
      });

      html += '</div>';
    });

    if (!hasActivity) {
      html = '<div class="empty-state"><i data-lucide="bell"></i>' +
        '<div class="empty-state-text">No activity yet</div>' +
        '<div class="empty-state-sub">Messages from your chats will appear here</div></div>';
    } else {
      html += endOfListHTML();
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

    // Prevent connecting to self
    if (host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0' || host === '::1') {
      showToast('Cannot connect to yourself', 'error');
      return;
    }

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
  function showNativeNotification(title, body, data) {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
        window.Capacitor.Plugins.LocalNotifications.schedule({
          notifications: [{
            id: Date.now(),
            title: title,
            body: body,
            channelId: 'orbit_messages',
            smallIcon: 'ic_stat_icon',
            data: data || {}
          }]
        });
      }
    } catch(e) {
      console.log('[Notifications] Native notification error:', e);
    }
  }

  function requestNotificationPermission() {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
        window.Capacitor.Plugins.LocalNotifications.requestPermissions();
      }
    } catch(e) {
      console.log('[Notifications] Permission request error:', e);
    }
  }

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
    // Show native system notification when app is in background.
    // Use _appIsBackgrounded (set by Capacitor appStateChange listener) instead of
    // document.hidden, which is unreliable in Capacitor WebView on Android.
    var isBackground = (typeof window._appIsBackgrounded === 'boolean') ? window._appIsBackgrounded : document.hidden;
    if (isBackground) {
      // When Capacitor appState is available, the native OrbitP2P plugin creates the
      // notification directly (bypassing JS WebView which may be paused). Use
      // LocalNotifications.schedule() only as a non-Capacitor fallback.
      if (typeof window._appIsBackgrounded !== 'boolean') {
        showNativeNotification(name, preview, { chatId: chatId, fromId: fromId });
      }
    }
  }

  function playNotificationSound() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var vol = (MStore.settings.notifyVolume != null ? MStore.settings.notifyVolume : 80) / 100;
      var soundType = MStore.settings.notifySoundType || 'chime';
      var gain = ctx.createGain();
      gain.connect(ctx.destination);
      var now = ctx.currentTime;
      if (soundType === 'pop') {
        var pop = ctx.createOscillator();
        pop.connect(gain);
        pop.frequency.value = 880;
        pop.type = 'sine';
        gain.gain.setValueAtTime(vol * 0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        pop.start(now);
        pop.stop(now + 0.1);
      } else if (soundType === 'gentle') {
        var gen = ctx.createOscillator();
        gen.connect(gain);
        gen.frequency.value = 440;
        gen.type = 'sine';
        gain.gain.setValueAtTime(vol * 0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        gen.start(now);
        gen.stop(now + 0.4);
      } else if (soundType === 'classic') {
        var c1 = ctx.createOscillator();
        var g1 = ctx.createGain();
        c1.connect(g1);
        g1.connect(ctx.destination);
        c1.frequency.value = 523;
        c1.type = 'sine';
        g1.gain.setValueAtTime(vol * 0.12, now);
        g1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        c1.start(now);
        c1.stop(now + 0.15);
        var c2 = ctx.createOscillator();
        var g2 = ctx.createGain();
        c2.connect(g2);
        g2.connect(ctx.destination);
        c2.frequency.value = 659;
        c2.type = 'sine';
        g2.gain.setValueAtTime(vol * 0.12, now + 0.15);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        c2.start(now + 0.15);
        c2.stop(now + 0.35);
      } else {
        var osc = ctx.createOscillator();
        osc.connect(gain);
        osc.frequency.value = 660;
        osc.type = 'sine';
        gain.gain.setValueAtTime(vol * 0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch(e) {}
  }

  function showToast(msg, type) {
    var container = document.getElementById('toast-container');
    if (!container) { console.warn('[Orbit] toast-container missing'); return; }
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

  function compressVideoMobile(dataUrl, maxW, callback) {
    try {
      var video = document.createElement('video');
      video.muted = true;
      video.playsinline = true;
      video.preload = 'metadata';
      video.src = dataUrl;
      video.onloadedmetadata = function() {
        var scale = Math.min(1, maxW / video.videoWidth);
        var w = Math.round(video.videoWidth * scale);
        var h = Math.round(video.videoHeight * scale);
        if (w % 2 !== 0) w++;
        if (h % 2 !== 0) h++;
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        var stream = canvas.captureStream(15);
        var chunks = [];
        var recorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 500000
        });
        recorder.ondataavailable = function(e) {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = function() {
          var reader = new FileReader();
          reader.onload = function() { callback(reader.result || dataUrl); };
          reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }));
        };
        recorder.start(1000);
        var drawTimer = setInterval(function() {
          if (video.paused || video.ended) {
            clearInterval(drawTimer);
            if (recorder.state !== 'inactive') recorder.stop();
            return;
          }
          ctx.drawImage(video, 0, 0, w, h);
        }, 66);
        video.play().catch(function() {
          clearInterval(drawTimer);
          if (recorder.state !== 'inactive') recorder.stop();
          callback(dataUrl);
        });
      };
      video.onerror = function() { callback(dataUrl); };
    } catch(e) {
      console.error('[Compress] Error:', e);
      callback(dataUrl);
    }
  }

  /* -- Helpers -- */
  function renderLucide(container) {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      try {
        if (container && container.nodeType) {
          lucide.createIcons({ root: container });
        } else if (typeof container === 'object') {
          lucide.createIcons(container);
        } else {
          lucide.createIcons();
        }
      } catch(e) {}
    }
  }

  function _dataUrlToBlobUrl(dataUrl) {
    try {
      var m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (m) {
        var blobUrl = window.orbitBase64ToBlob(m[2], m[1]);
        if (blobUrl) return blobUrl;
      }
    } catch(e) { console.warn('[Orbit] data:→blob failed', e.message); }
    return dataUrl;
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

  // Enter to send, Shift+Enter to insert newline
  document.getElementById('chat-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Insert newline at cursor — some Android keyboards don't default to this in textareas
        e.preventDefault();
        var start = this.selectionStart;
        var end = this.selectionEnd;
        this.value = this.value.substring(0, start) + '\n' + this.value.substring(end);
        this.selectionStart = this.selectionEnd = start + 1;
        var evt = new Event('input', { bubbles: true });
        this.dispatchEvent(evt);
        return;
      }
      if (MStore.settings.enterToSend) {
        e.preventDefault();
        sendMessage();
      }
    }
  });

  // Auto-resize textarea as content grows
  document.getElementById('chat-input').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 150) + 'px';
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

  // --- Add Three Dots Menu ---
  var moreBtn = document.getElementById('btn-chat-more');
  if (moreBtn) {
    moreBtn.addEventListener('click', function() {
      if (!activeChatId) return;
      var isGroup = !!MStore.groups.find(function(g) { return g.id === activeChatId; });
      var safeBottom = 'var(--safe-area-bottom, 0px)';
      var html = '<div class="action-sheet-overlay" id="chat-more-action-sheet" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:' + safeBottom + ';">' +
        '<div class="action-sheet-content" style="background:var(--bg-surface);border-radius:24px 24px 0 0;padding:24px 16px;padding-bottom:calc(24px + ' + safeBottom + ');animation:slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);">' +
          '<div style="width:40px;height:5px;background:var(--border-subtle);border-radius:4px;margin:0 auto 24px;"></div>' +
          '<div class="action-btn" id="action-view-info" style="padding:16px;display:flex;align-items:center;gap:14px;font-size:16px;font-weight:600;color:var(--text-primary);cursor:pointer;border-radius:12px;transition:background 0.2s;">' +
            '<i data-lucide="' + (isGroup ? 'users' : 'user') + '"></i> ' + (isGroup ? 'Group Info' : 'View Profile') +
          '</div>' +
          '<div class="action-btn" id="action-mute" style="padding:16px;display:flex;align-items:center;gap:14px;font-size:16px;font-weight:600;color:var(--text-primary);cursor:pointer;border-radius:12px;transition:background 0.2s;">' +
            '<i data-lucide="bell-off"></i> Mute Notifications' +
          '</div>' +
          '<div class="action-btn" id="action-clear-chat" style="padding:16px;display:flex;align-items:center;gap:14px;font-size:16px;font-weight:600;color:var(--accent-danger);cursor:pointer;border-radius:12px;transition:background 0.2s;">' +
            '<i data-lucide="trash-2"></i> Clear Chat' +
          '</div>' +
        '</div>' +
      '</div>';
      
      var div = document.createElement('div');
      div.innerHTML = html;
      var sheet = div.firstChild;
      document.body.appendChild(sheet);
      renderLucide({ root: sheet });

      sheet.addEventListener('click', function(e) {
        if (e.target === sheet) sheet.remove();
      });
      
      document.getElementById('action-view-info').addEventListener('click', function() {
        sheet.remove();
        if (isGroup) showGroupInfo();
        else showProfileOverlay(activeChatId);
      });
      
      document.getElementById('action-mute').addEventListener('click', function() {
        sheet.remove();
        showToast('Notifications muted', 'success');
      });
      
      document.getElementById('action-clear-chat').addEventListener('click', function() {
        sheet.remove();
        // Custom simple modal or confirm
        if (confirm('Are you sure you want to clear this chat?')) {
          MStore.messages[activeChatId] = [];
          MStore._saveMsgs(activeChatId);
          MStore.save();
          renderMessages(activeChatId);
          renderChatList();
          showToast('Chat cleared', 'info');
        }
      });
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
  document.getElementById('btn-close-video-preview').addEventListener('click', function() {
    var player = document.getElementById('video-preview-player');
    player.pause();
    player.removeAttribute('src');
    document.getElementById('video-preview-overlay').classList.remove('open');
  });
  document.getElementById('video-preview-overlay').addEventListener('click', function(e) {
    if (e.target === this) {
      var player = document.getElementById('video-preview-player');
      player.pause();
      player.removeAttribute('src');
      this.classList.remove('open');
    }
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
          MStore.compressImage(ev2.target.result, 400, 400, 0.8, function(compressedUrl) {
            var dataUrl = compressedUrl;
            group.avatar = dataUrl;
            MStore.save();
            var chat = MStore.chats.find(function(c) { return c.id === activeChatId; });
            if (chat) chat.avatar = dataUrl;
            renderGroupInfo();
            renderChatList();
            showToast('Group avatar updated', 'info');
          });
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
                    var pkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.MESSAGE, MStore.user ? MStore.user.id : '', mid, { text: shareText, msgId: shareMsgId, chatId: activeChatId });
                    Orbit.P2P.send(mid, pkt);
                  }
                });
              } else {
                var pkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.MESSAGE, MStore.user ? MStore.user.id : '', activeChatId, { text: shareText, msgId: shareMsgId, chatId: activeChatId });
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
          grp.members.push({ userId: friend.id, role: 'member', joinedAt: new Date().toISOString(), name: friend.name, avatar: friend.avatar || null });
          MStore.save();
          // Send group data to the new member
          if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
            var enrichedMembers = (grp.members || []).map(function(m) {
              var origin = typeof m === 'string' ? { userId: m } : m;
              var uid = origin.userId;
              var mf = MStore.friends.find(function(f) { return f.id === uid; });
              if (mf) {
                return { ...origin, name: origin.name || mf.name, username: origin.username || origin.name || mf.name, avatar: origin.avatar || mf.avatar || null };
              }
              return { ...origin };
            });
            var invitePkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.GROUP_CREATE, MStore.user ? MStore.user.id : '', friend.id, {
              groupId: activeChatId,
              groupName: grp.name,
              groupAvatar: grp.avatar || null,
              ownerId: grp.ownerId,
              members: enrichedMembers,
              inviteCode: grp.inviteCode,
              description: grp.description || '',
              publicKey: MStore.user ? MStore.user.publicKey || null : null
            });
            Orbit.P2P.send(friend.id, invitePkt);
          }
          // Notify existing members about the new member
          if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
            (grp.members || []).forEach(function(m) {
              var mid = typeof m === 'string' ? m : m.userId;
              if (mid !== friend.id && mid !== (MStore.user ? MStore.user.id : '')) {
                var memberAddPkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.GROUP_MEMBER_ADDED, MStore.user ? MStore.user.id : '', mid, {
                  groupId: activeChatId,
                  user: { userId: friend.id, name: friend.name, username: friend.name, usertag: friend.tag || '', avatar: friend.avatar || null, status: 'online', role: 'member', joinedAt: new Date().toISOString(), publicKey: friend.publicKey || null }
                });
                Orbit.P2P.send(mid, memberAddPkt);
              }
            });
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
              var leavePkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.GROUP_LEAVE, MStore.user ? MStore.user.id : '', mid, {
                groupId: activeChatId, userId: removeUserId
              });
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
                var leavePkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.GROUP_LEAVE, MStore.user ? MStore.user.id : '', mid, {
                  groupId: activeChatId, userId: MStore.user ? MStore.user.id : ''
                });
                Orbit.P2P.send(mid, leavePkt);
              }
            });
          }
          MStore.groups = MStore.groups.filter(function(g) { return g.id !== activeChatId; });
          MStore.chats = MStore.chats.filter(function(c) { return c.id !== activeChatId; });
          delete MStore.messages[activeChatId];
          localStorage.removeItem('orbit_msg_' + activeChatId);
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
                var removePkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.GROUP_LEAVE, MStore.user ? MStore.user.id : '', mid, {
                  groupId: activeChatId, userId: mid
                });
                Orbit.P2P.send(mid, removePkt);
              }
            });
          }
          MStore.groups = MStore.groups.filter(function(g) { return g.id !== activeChatId; });
          MStore.chats = MStore.chats.filter(function(c) { return c.id !== activeChatId; });
          delete MStore.messages[activeChatId];
          localStorage.removeItem('orbit_msg_' + activeChatId);
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
              var pkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.UNPIN_MESSAGE, _myId, mid, { msgId: pinMsgId, groupId: activeChatId });
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
        } else if (type === 'videos') {
          fileInput.accept = 'video/*';
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
    // Don't open chat if context menu is showing
    if (document.getElementById('friend-context-overlay')) return;
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

  /* -- Long-press context menu for friend rows -- */
  var _lpTimer = null;
  var _lpTarget = null;

  function showFriendContextMenu(friend, touchX, touchY) {
    hideFriendContextMenu();
    var backdrop = document.createElement('div');
    backdrop.id = 'friend-context-overlay';
    backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;background:rgba(0,0,0,0.3);';
    backdrop.addEventListener('click', hideFriendContextMenu);
    backdrop.addEventListener('touchmove', function(e) { e.preventDefault(); }, { passive: false });

    var menu = document.createElement('div');
    menu.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:100000;background:var(--bg-surface);border-radius:16px 16px 0 0;padding:16px 0;box-shadow:0 -4px 20px rgba(0,0,0,0.3);';
    menu.addEventListener('click', function(e) { e.stopPropagation(); });

    var header = document.createElement('div');
    header.style.cssText = 'padding:0 16px 12px;border-bottom:1px solid var(--border-subtle);margin-bottom:4px;';
    header.innerHTML = '<div style="font-size:15px;font-weight:600;color:var(--text-primary);">' + escapeHtml(friend.name) + '</div><div style="font-size:12px;color:var(--text-muted);">' + (friend.status || 'offline') + '</div>';
    menu.appendChild(header);

    function addMenuItem(label, icon, onClick) {
      var item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 16px;color:var(--text-primary);font-size:15px;cursor:pointer;';
      item.addEventListener('click', function(e) { e.stopPropagation(); onClick(); hideFriendContextMenu(); });
      item.innerHTML = '<i data-lucide="' + icon + '" style="width:20px;height:20px;color:var(--text-muted);flex-shrink:0;"></i><span>' + label + '</span>';
      menu.appendChild(item);
    }

    var isMuted = MStore.settings.mutedChats && MStore.settings.mutedChats[friend.id];
    addMenuItem(isMuted ? 'Unmute Notifications' : 'Mute Notifications', isMuted ? 'bell' : 'bell-off', function() {
      if (!MStore.settings.mutedChats) MStore.settings.mutedChats = {};
      if (MStore.settings.mutedChats[friend.id]) {
        delete MStore.settings.mutedChats[friend.id];
      } else {
        MStore.settings.mutedChats[friend.id] = true;
      }
      MStore.save();
      showToast(isMuted ? 'Unmuted' : 'Muted', 'info');
    });

    addMenuItem('View Profile', 'user', function() {
      showToast(friend.name + ' — ' + (friend.status || 'offline'), 'info');
    });

    addMenuItem('Close DM', 'x', function() {
      MStore.chats = MStore.chats.filter(function(c) { return c.id !== friend.id; });
      delete MStore.messages[friend.id];
      localStorage.removeItem('orbit_msg_' + friend.id);
      MStore.friends = MStore.friends.filter(function(f) { return f.id !== friend.id; });
      MStore.save();
      if (activeChatId === friend.id) closeChat();
      renderChatList();
      renderFriends();
      showToast(friend.name + ' — DM closed', 'info');
    });

    var isBlocked = MStore.blockedUsers && MStore.blockedUsers.indexOf(friend.id) !== -1;
    addMenuItem(isBlocked ? 'Unblock User' : 'Block User', isBlocked ? 'user-check' : 'ban', function() {
      if (isBlocked) {
        MStore.blockedUsers = MStore.blockedUsers.filter(function(id) { return id !== friend.id; });
        showToast(friend.name + ' unblocked', 'info');
      } else {
        MStore.blockedUsers = MStore.blockedUsers.concat([friend.id]);
        showToast(friend.name + ' blocked', 'info');
      }
      MStore.save();
    });

    var cancel = document.createElement('div');
    cancel.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:14px 16px;margin-top:4px;border-top:1px solid var(--border-subtle);color:var(--text-muted);font-size:15px;cursor:pointer;';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', function(e) { e.stopPropagation(); hideFriendContextMenu(); });
    menu.appendChild(cancel);

    backdrop.appendChild(menu);
    document.body.appendChild(backdrop);
    renderLucide({ root: menu });
  }

  function hideFriendContextMenu() {
    var el = document.getElementById('friend-context-overlay');
    if (el) el.remove();
  }

  function hideOverlay(id) {
    var el = document.getElementById(id);
    if (el) { el.remove(); return true; }
    return false;
  }

  function showMessageContextMenu(msg, chatId, x, y) {
    var backdrop = document.createElement('div');
    backdrop.id = 'msg-context-overlay';
    backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;background:rgba(0,0,0,0.3);';
    backdrop.addEventListener('click', function() { hideOverlay('msg-context-overlay'); });
    backdrop.addEventListener('touchmove', function(e) { e.preventDefault(); }, { passive: false });

    var menu = document.createElement('div');
    menu.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:100000;background:var(--bg-surface);border-radius:16px 16px 0 0;padding:16px 0;box-shadow:0 -4px 20px rgba(0,0,0,0.3);';
    menu.addEventListener('click', function(e) { e.stopPropagation(); });

    var previewText = msg.text ? msg.text.substring(0, 50) + (msg.text.length > 50 ? '...' : '') : 'Message';
    var header = document.createElement('div');
    header.style.cssText = 'padding:0 16px 12px;border-bottom:1px solid var(--border-subtle);margin-bottom:4px;';
    header.innerHTML = '<div style="font-size:15px;font-weight:600;color:var(--text-primary);">Message</div><div style="font-size:12px;color:var(--text-muted);">' + escapeHtml(previewText) + '</div>';
    menu.appendChild(header);

    function addItem(label, icon, onClick) {
      var item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 16px;color:var(--text-primary);font-size:15px;cursor:pointer;';
      item.addEventListener('click', function(e) { e.stopPropagation(); onClick(); hideOverlay('msg-context-overlay'); });
      item.innerHTML = '<i data-lucide="' + icon + '" style="width:20px;height:20px;color:var(--text-muted);flex-shrink:0;"></i><span>' + label + '</span>';
      menu.appendChild(item);
    }

    addItem('Reply', 'reply', function() { startReply(msg.id); });

    if (msg.text) {
      addItem('Copy Text', 'copy', function() {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(msg.text).then(function() {
            showToast('Text copied', 'info');
          }).catch(function() {
            showToast('Failed to copy', 'error');
          });
        } else {
          var ta = document.createElement('textarea');
          ta.value = msg.text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          showToast('Text copied', 'info');
        }
      });
    }

    if (msg.from === 'me') {
      addItem('Edit', 'pencil', function() { startEdit(msg.id); });
    }
    addItem('Delete', 'trash-2', function() { confirmDeleteMessage(msg.id); });

    var chatGroup = MStore.groups.find(function(g) { return g.id === chatId; });
    if (chatGroup) {
      var isPinned = chatGroup.pinnedMessages && chatGroup.pinnedMessages.some(function(p) { return String(p.msgId) === String(msg.id); });
      addItem(isPinned ? 'Unpin' : 'Pin', isPinned ? 'pin-off' : 'pin', function() {
        if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
          if (isPinned) {
            var upkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.UNPIN_MESSAGE, MStore.user ? MStore.user.id : 'mobile', chatId, { groupId: chatId, msgId: msg.id });
            Orbit.P2P.send(chatId, upkt);
          } else {
            var ppkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.PIN_MESSAGE, MStore.user ? MStore.user.id : 'mobile', chatId, { groupId: chatId, msgId: msg.id, text: msg.text || '', pinnedAt: new Date().toISOString() });
            Orbit.P2P.send(chatId, ppkt);
          }
        }
        if (chatGroup) {
          if (isPinned) {
            chatGroup.pinnedMessages = (chatGroup.pinnedMessages || []).filter(function(p) { return String(p.msgId) !== String(msg.id); });
          } else {
            if (!chatGroup.pinnedMessages) chatGroup.pinnedMessages = [];
            chatGroup.pinnedMessages.push({ msgId: msg.id, text: msg.text || '', pinnedBy: MStore.user ? MStore.user.id : 'mobile', pinnedAt: new Date().toISOString() });
          }
          MStore.save();
          if (activeChatId === chatId) renderMessages(chatId);
        }
      });
    }

    var cancel = document.createElement('div');
    cancel.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:14px 16px;margin-top:4px;border-top:1px solid var(--border-subtle);color:var(--text-muted);font-size:15px;cursor:pointer;';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', function(e) { e.stopPropagation(); hideOverlay('msg-context-overlay'); });
    menu.appendChild(cancel);

    backdrop.appendChild(menu);
    document.body.appendChild(backdrop);
    renderLucide({ root: menu });
  }

  function showChatContextMenu(chat, x, y) {
    var backdrop = document.createElement('div');
    backdrop.id = 'chat-context-overlay';
    backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;background:rgba(0,0,0,0.3);';
    backdrop.addEventListener('click', function() { hideOverlay('chat-context-overlay'); });
    backdrop.addEventListener('touchmove', function(e) { e.preventDefault(); }, { passive: false });

    var menu = document.createElement('div');
    menu.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:100000;background:var(--bg-surface);border-radius:16px 16px 0 0;padding:16px 0;box-shadow:0 -4px 20px rgba(0,0,0,0.3);';
    menu.addEventListener('click', function(e) { e.stopPropagation(); });

    var header = document.createElement('div');
    header.style.cssText = 'padding:0 16px 12px;border-bottom:1px solid var(--border-subtle);margin-bottom:4px;';
    header.innerHTML = '<div style="font-size:15px;font-weight:600;color:var(--text-primary);">' + escapeHtml(chat.name) + '</div><div style="font-size:12px;color:var(--text-muted);">Chat</div>';
    menu.appendChild(header);

    function addItem(label, icon, onClick) {
      var item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 16px;color:var(--text-primary);font-size:15px;cursor:pointer;';
      item.addEventListener('click', function(e) { e.stopPropagation(); onClick(); hideOverlay('chat-context-overlay'); });
      item.innerHTML = '<i data-lucide="' + icon + '" style="width:20px;height:20px;color:var(--text-muted);flex-shrink:0;"></i><span>' + label + '</span>';
      menu.appendChild(item);
    }

    if (chat.unread > 0) {
      addItem('Mark Read', 'eye', function() {
        chat.unread = 0;
        MStore.save();
        renderChatList();
      });
    }

    var isMuted = MStore.settings.mutedChats && MStore.settings.mutedChats[chat.id];
    addItem(isMuted ? 'Unmute' : 'Mute', isMuted ? 'bell' : 'bell-off', function() {
      if (!MStore.settings.mutedChats) MStore.settings.mutedChats = {};
      if (isMuted) {
        delete MStore.settings.mutedChats[chat.id];
      } else {
        MStore.settings.mutedChats[chat.id] = true;
      }
      MStore.save();
      showToast(isMuted ? 'Unmuted' : 'Muted', 'info');
    });

    addItem('Delete Chat', 'trash-2', function() {
      if (activeChatId === chat.id) closeChat();
      MStore.chats = MStore.chats.filter(function(c) { return c.id !== chat.id; });
      delete MStore.messages[chat.id];
      localStorage.removeItem('orbit_msg_' + chat.id);
      MStore.save();
      renderChatList();
      showToast('Chat deleted', 'info');
    });

    var isGroup = MStore.groups.some(function(g) { return g.id === chat.id; });
    if (!isGroup) {
      addItem('View Profile', 'user', function() {
        var friend = MStore.friends.find(function(f) { return f.id === chat.id; });
        if (friend) {
          showToast(friend.name + ' — ' + (friend.status || 'offline'), 'info');
        } else {
          showToast('Friend info not available', 'info');
        }
      });
    }

    var cancel = document.createElement('div');
    cancel.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:14px 16px;margin-top:4px;border-top:1px solid var(--border-subtle);color:var(--text-muted);font-size:15px;cursor:pointer;';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', function(e) { e.stopPropagation(); hideOverlay('chat-context-overlay'); });
    menu.appendChild(cancel);

    backdrop.appendChild(menu);
    document.body.appendChild(backdrop);
    renderLucide({ root: menu });
  }

  document.addEventListener('touchstart', function(e) {
    var row = e.target.closest('.friend-row, .message-row, .chat-row');
    if (!row) return;
    var type, id;
    if (row.classList.contains('friend-row')) { type = 'friend'; id = row.getAttribute('data-friend'); }
    else if (row.classList.contains('message-row')) { type = 'message'; id = row.getAttribute('data-msg-id'); }
    else if (row.classList.contains('chat-row')) { type = 'chat'; id = row.getAttribute('data-chat'); }
    if (!id) return;
    _lpTarget = id;
    _lpTimer = setTimeout(function() {
      _lpTimer = null;
      if (type === 'friend') {
        var friend = MStore.friends.find(function(f) { return f.id === id; });
        if (friend) showFriendContextMenu(friend, e.touches ? e.touches[0].clientX : 0, e.touches ? e.touches[0].clientY : 0);
      } else if (type === 'message') {
        if (!activeChatId) return;
        var msgs = MStore.getMessages(activeChatId);
        var msg = msgs.find(function(m) { return String(m.id) === String(id); });
        if (msg) showMessageContextMenu(msg, activeChatId, e.touches ? e.touches[0].clientX : 0, e.touches ? e.touches[0].clientY : 0);
      } else if (type === 'chat') {
        var chat = MStore.chats.find(function(c) { return c.id === id; });
        if (chat) showChatContextMenu(chat, e.touches ? e.touches[0].clientX : 0, e.touches ? e.touches[0].clientY : 0);
      }
    }, 500);
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; _lpTarget = null; }
  }, { passive: true });

  document.addEventListener('touchend', function(e) {
    if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; _lpTarget = null; }
  }, { passive: true });

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
        profileFrame: MStore.settings.profileFrame || null,
        banner: u.banner || null,
        tcpPort: MStore.settings.tcpPort || 46000,
        device: 'android'
      }
    };
  }

  function getProfileFrame(source) {
    if (MStore.settings.experimentalProfileFrames !== true) return 0;
    var val = (source && source.profileFrame != null) ? source.profileFrame : 0;
    return Math.max(0, parseInt(val, 10) || 0);
  }

  /* -- Debug log buffer (visible when devMode is on) -- */
  var _logBuffer = [];
  var _logOverlay = null;
  function escHtml(s) {
    if (typeof s !== 'string') return String(s || '');
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  var _logLevels = { 'None': 0, 'Error': 1, 'Info': 2, 'Debug': 3 };
  function debugLog(category, msg, data) {
    var currentLevel = _logLevels[MStore.settings.logLevel] || 3;
    if (currentLevel < 2) return;
    if (currentLevel < 3 && data && typeof data === 'object' && Object.keys(data).length > 2) { data = null; }
    var entry = { t: new Date().toISOString().slice(11,23), cat: category, msg: msg, data: data || null };
    _logBuffer.push(entry);
    if (_logBuffer.length > 500) _logBuffer.shift();
    if (currentLevel >= 3) console.log('[' + category + ']', msg, data || '');
    else if (currentLevel >= 2) console.log('[' + category + ']', msg);
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

  /* ─── Connection Status ─── */
  var _connectedShown = false;
  function showConnectionStatus(state, text) {
    var el = document.getElementById('connection-status');
    if (!el) return;
    var textEl = document.getElementById('conn-status-text');
    if (state === 'connected') {
      if (_connectedShown) return;
      _connectedShown = true;
    }
    if (state === 'disconnected') {
      _connectedShown = false;
    }
    el.className = 'conn-status visible ' + (state || '');
    if (textEl) textEl.textContent = text || '';
    if (state === 'connected' || state === 'disconnected') {
      setTimeout(function() { el.classList.remove('visible'); }, 3000);
    }
  }

  function initP2P() {
    if (!window.Orbit || !window.Orbit.P2P) {
      debugLog('P2P', 'initP2P aborted — Orbit.P2P not available');
      return;
    }
    showConnectionStatus('connecting', 'Connecting...');
    debugLog('P2P', 'initP2P called');
    var u = MStore.user;

    // Remove stale listeners before re-initializing (BUG-JS-4)
    debugLog('P2P', 'Cleaning up stale listeners');
    Orbit.P2P.cleanup();

    debugLog('P2P', 'P2P plugin available: ' + Orbit.P2P.isAvailable());

    // Start TCP server
    var tcpPort = MStore.settings.tcpPort || 46000;
    debugLog('P2P', 'Starting TCP server on port ' + tcpPort);
    Orbit.P2P.startServer(tcpPort).then(function(result) {
      if (result.success) {
        debugLog('P2P', 'Server started on port ' + result.port);
      } else {
        debugLog('P2P', 'Server start failed: ' + (result.error || 'unknown'));
      }
    });

    // Build beacon
    var beacon = buildBeacon();
    debugLog('P2P', 'Beacon built', { userId: u ? u.id : 'none', username: u ? u.name : 'none' });

    // Start LAN discovery (only in auto-discovery mode)
    if (MStore.settings.networkMode !== 'Custom IP') {
      var udpPort = MStore.settings.udpPort || 45678;
      debugLog('P2P', 'Starting LAN discovery on UDP port ' + udpPort);
      Orbit.P2P.startDiscovery(beacon, udpPort).then(function(r) {
        if (r && !r.success) debugLog('P2P', 'Discovery start failed: ' + (r.error || 'unknown'));
        else debugLog('P2P', 'Discovery started');
      });
    } else {
      debugLog('P2P', 'Custom IP mode — UDP discovery skipped');
    }

    // Start P2P heartbeat (sends PING at netKeepAlive interval)
    if (window._heartbeatInterval) clearInterval(window._heartbeatInterval);
    window._heartbeatPingCount = {};
    var keepAliveSec = Math.max(10, (MStore.settings.netKeepAlive || 30));
    window._heartbeatInterval = setInterval(function() {
      if (!window.Orbit || !Orbit.P2P) return;
      var conns = Orbit.P2P.getConnections();
      conns.forEach(function(connId) {
        var pingPkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.PING, MStore.user ? MStore.user.id : '', connId, { ts: Date.now() });
        Orbit.P2P.send(connId, pingPkt).then(function(r) {
          if (!r.success) {
            window._heartbeatPingCount[connId] = (window._heartbeatPingCount[connId] || 0) + 1;
            if (window._heartbeatPingCount[connId] >= 3) {
              debugLog('P2P', 'Heartbeat: no response from ' + connId + ' after 3 pings');
            }
          }
        });
      });
    }, keepAliveSec * 1000);

    // Reap stale activeTransfers every 30s (CROSS-4)
    if (window._transferReapInterval) clearInterval(window._transferReapInterval);
    window._transferReapInterval = setInterval(function() {
      if (!window.activeTransfers) return;
      var now = Date.now();
      Object.keys(window.activeTransfers).forEach(function(fileId) {
        var tx = window.activeTransfers[fileId];
        if (tx._startTime && now - tx._startTime > 120000) {
          console.warn('[P2P] Reaping stalled transfer:', fileId, tx.fileName);
          delete window.activeTransfers[fileId];
        }
      });
    }, 30000);

    // Listen for incoming connections — send identity beacon over TCP
    Orbit.P2P.onConnection(function(data) {
      if (!data || !data.connectionId) { debugLog('P2P', 'onConnection: invalid data'); return; }
      debugLog('P2P', 'Incoming connection', { connectionId: data.connectionId, host: data.host });
      var cur = MStore.user;
      if (cur && data.connectionId) {
        var beaconPacket = Orbit.Protocol.createPacket(Orbit.Protocol.Types.BEACON, cur.id, data.connectionId, {
          userId: cur.id,
          username: cur.name,
          usertag: cur.tag,
          avatarHash: cur.avatar ? 'has_avatar' : null,
          avatar: cur.avatar || null,
          status: cur.status || 'online',
          bio: cur.bio || '',
          publicKey: cur.publicKey || null,
          profileFrame: MStore.settings.profileFrame || null,
          banner: cur.banner || null,
          tcpPort: MStore.settings.tcpPort || 46000,
          device: 'android'
        });
        debugLog('P2P', 'Sending TCP beacon to', { connectionId: data.connectionId, target: cur.name });
        Orbit.P2P.send(data.connectionId, beaconPacket);
      }
    });

    // Listen for messages
    Orbit.P2P.onMessage(function(data) { try {
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

      // Handle PING — respond with PONG
      if (packet.type === Orbit.Protocol.Types.PING) {
        var pongPkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.PONG, MStore.user ? MStore.user.id : '', data.connectionId, { ts: Date.now() });
        Orbit.P2P.send(data.connectionId, pongPkt).catch(function() {});
        return;
      }

      // Handle PONG — reset heartbeat ping count
      if (packet.type === Orbit.Protocol.Types.PONG) {
        if (window._heartbeatPingCount && data.connectionId) {
          window._heartbeatPingCount[data.connectionId] = 0;
        }
        return;
      }

      // Handle BEACON packets received over TCP (handshake)
      if (packet.type === Orbit.Protocol.Types.BEACON) {
        var bp = packet.payload || {};
        var peerId = bp.userId || packet.from || packet.senderId;
        if (!peerId || (MStore.user && peerId === MStore.user.id)) return;
        var peerName = bp.username || bp.name || data.connectionId;
        var peerTag = bp.usertag || bp.tag || '';
        // Add or update friend — with peer merging (Bug #2)
        var existing = MStore.friends.find(function(f) { return f.id === peerId; });
        // Also search by connectionId to catch host:port-based peers
        if (!existing && data.connectionId && data.connectionId !== peerId) {
          var connIp = data.connectionId.split(':')[0];
          var connFriend = MStore.friends.find(function(f) { return f.id === data.connectionId || (connIp && f.ip === connIp); });
          if (connFriend) {
            debugLog('P2P', 'Merging TCP peer: ' + connFriend.id + ' → ' + peerId, { name: peerName });
            var oldChatId = connFriend.id;
            if (oldChatId !== peerId) {
              if (MStore.messages[oldChatId] && MStore.messages[oldChatId].length) {
                var existingMsgs = MStore.getMessages(peerId);
                var mergedMsgs = (MStore.messages[oldChatId] || []).map(function(m) {
                  var clone = JSON.parse(JSON.stringify(m));
                  if (clone.from === oldChatId) clone.from = peerId;
                  return clone;
                });
                MStore.messages[peerId] = existingMsgs.concat(mergedMsgs);
                MStore._saveMsgs(peerId);
                delete MStore.messages[oldChatId];
                localStorage.removeItem('orbit_msg_' + oldChatId);
              }
              MStore.chats = MStore.chats.filter(function(c) { return c.id !== oldChatId; });
            }
            connFriend.id = peerId;
            connFriend.name = peerName;
            connFriend.tag = peerTag;
            connFriend.status = bp.status || 'online';
            if (bp.avatar) connFriend.avatar = bp.avatar;
            if (bp.publicKey) connFriend.publicKey = bp.publicKey;
            if (bp.tcpPort) connFriend.tcpPort = bp.tcpPort;
            if (data.connectionId) connFriend.connectionId = data.connectionId;
            existing = connFriend;
          }
        }
        if (!existing) {
          MStore.friends.push({
            id: peerId,
            name: peerName,
            tag: peerTag,
            status: bp.status || 'online',
            avatar: bp.avatar || null,
            bio: bp.bio || '',
            ip: data.connectionId ? data.connectionId.split(':')[0] : null,
            tcpPort: bp.tcpPort || null,
            connectionId: data.connectionId || null,
            publicKey: bp.publicKey || null,
            profileFrame: bp.profileFrame !== undefined ? bp.profileFrame : null,
            banner: bp.banner || null,
            lastSeen: Date.now()
          });
        } else {
          existing.status = bp.status || 'online';
          existing.lastSeen = Date.now();
          existing.name = peerName;
          if (bp.avatar) existing.avatar = bp.avatar;
          if (bp.profileFrame !== undefined) existing.profileFrame = bp.profileFrame;
          if (bp.banner) existing.banner = bp.banner;
          if (bp.tcpPort) existing.tcpPort = bp.tcpPort;
          if (data.connectionId) existing.ip = data.connectionId.split(':')[0];
          if (data.connectionId) existing.connectionId = data.connectionId;
        }
        // Ensure chat exists (avoid duplicates from host:port→UUID merge)
        var chatExists = MStore.chats.find(function(c) { return c.id === peerId; });
        if (!chatExists) {
          MStore.chats.push({ id: peerId, name: peerName, lastMessage: '', lastTime: '', unread: 0 });
        } else {
          // Clean up any orphan chats
          var ipChat = MStore.chats.find(function(c) { return c.id !== peerId && c.name === peerName; });
          if (ipChat) {
            MStore.chats = MStore.chats.filter(function(c) { return c.id !== ipChat.id; });
            delete MStore.messages[ipChat.id];
            localStorage.removeItem('orbit_msg_' + ipChat.id);
          }
        }
        MStore.save();
        renderFriends();
        renderChatList();
        showConnectionStatus('connected', 'Connected');
        console.log('[P2P] Beacon handshake from:', peerName);
        return;
      }

      var msgFrom = packet.from || packet.senderId || data.connectionId;
      if (!msgFrom) { debugLog('P2P', 'Cannot determine sender — dropping'); return; }

      // Blocked user check
      if (MStore.blockedUsers && MStore.blockedUsers.indexOf(msgFrom) !== -1) {
        debugLog('P2P', 'Ignored message from blocked user ' + msgFrom);
        return;
      }

      var chatId = msgFrom;
      // Group messages carry the group ID in payload
      if (packet.payload && packet.payload.groupId) {
        chatId = packet.payload.groupId;
      } else if (packet.payload && packet.payload.chatId && packet.type !== Orbit.Protocol.Types.REACTION) {
        // REACTION packets must NOT use payload.chatId — it's the sender's activeChatId,
        // which would be the receiver's own userId for DM, causing chat lookup to fail
        chatId = packet.payload.chatId;
      }

      var chat = MStore.chats.find(function(c) { return c.id === chatId; });
      if (!chat) {
        var exemptGroupTypes = [Orbit.Protocol.Types.GROUP_CREATE, Orbit.Protocol.Types.GROUP_JOIN_RESPONSE];
        if (exemptGroupTypes.indexOf(packet.type) === -1) {
          debugLog('P2P', 'Chat not found for message from ' + msgFrom + ' chatId=' + chatId + ' type=' + packet.type, { availableChats: MStore.chats.map(function(c){return c.id;}).join(',') });
          return;
        }
      }

      // Global payload null guard (MSG-1)
      if (!packet.payload) {
        debugLog('P2P', 'Packet missing payload — dropping');
        return;
      }

      if (packet.type === Orbit.Protocol.Types.MESSAGE) {
        var msgText = packet.payload.text || '';
        var msgAttachmentsRaw = packet.payload.attachments || undefined;
        // Convert inline data: URLs to blob: URLs before storing (preserve original in _dataUrl for persistence)
        if (msgAttachmentsRaw) {
          for (var ai = 0; ai < msgAttachmentsRaw.length; ai++) {
            var aa = msgAttachmentsRaw[ai];
            if (aa.url && aa.url.indexOf('data:') === 0) {
              var blobUrl = _dataUrlToBlobUrl(aa.url);
              if (blobUrl !== aa.url) {
                aa._dataUrl = aa.url;   // preserve for restart recovery
                aa.url = blobUrl;
              }
            }
          }
        }
        var msgAttachments = msgAttachmentsRaw;
        var msgReplyTo = packet.payload.replyTo || undefined;

        var senderName = packet.payload.fromName || (function() { var sf = MStore.friends.find(function(f) { return f.id === msgFrom; }); return sf ? sf.name : null; })();
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
                id: packet.payload.msgId || ('p2p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
                from: msgFrom,
                fromName: senderName,
                text: msgText,
                time: new Date().toISOString(),
                replyTo: msgReplyTo,
                attachments: msgAttachments
              });
              if (activeChatId === chatId) renderMessages(activeChatId);
              renderChatList();
              showIncomingNotification(chatId, msgFrom, msgText);
            });
            return;
          }
        }

        debugLog('P2P', 'Incoming MESSAGE from ' + msgFrom + ' chatId=' + chatId, { text: msgText.substring(0, 100) });
        MStore.addMessage(chatId, {
          id: packet.payload.msgId || ('p2p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
          from: msgFrom,
          fromName: senderName,
          text: msgText,
          time: new Date().toISOString(),
          replyTo: msgReplyTo,
          attachments: msgAttachments
        });
        if (activeChatId === chatId) renderMessages(activeChatId);
        renderChatList();
        showIncomingNotification(chatId, msgFrom, msgText);
        return;
      }

      // Handle typing indicators
      if (packet.type === Orbit.Protocol.Types.TYPING) {
        console.log('[P2P] Typing:', msgFrom, packet.payload && packet.payload.isTyping ? 'started' : 'stopped');
        return;
      }

      // Handle reactions
      if (packet.type === Orbit.Protocol.Types.REACTION) {
        var rPayload = packet.payload;
        if (rPayload && rPayload.msgId && rPayload.emoji && rPayload.userId) {
          if (rPayload.action !== 'add' && rPayload.action !== 'remove') return;
          // Defensive: recompute chatId — never trust payload.chatId for REACTION
          // (legacy clients may include it, overwriting the correct msgFrom-based chatId)
          var reactChatId = rPayload.groupId || msgFrom;
          var reactMsgs = MStore.getMessages(reactChatId);
          var reactMsgIdx = reactMsgs.findIndex(function(m) { return String(m.id) === String(rPayload.msgId); });
          if (reactMsgIdx >= 0) {
            var reactMsg = reactMsgs[reactMsgIdx];
            var reactReactions = reactMsg.reactions ? reactMsg.reactions.slice() : [];
            var reactExistingIdx = reactReactions.findIndex(function(r) { return r.emoji === rPayload.emoji && r.userId === rPayload.userId; });
            if (rPayload.action === 'add' && reactExistingIdx < 0) {
              reactReactions.push({ emoji: rPayload.emoji, userId: rPayload.userId });
            } else if (rPayload.action === 'remove' && reactExistingIdx >= 0) {
              reactReactions.splice(reactExistingIdx, 1);
            }
            reactMsgs[reactMsgIdx].reactions = reactReactions;
            MStore.messages[reactChatId] = reactMsgs;
            MStore._saveMsgs(reactChatId);
            if (activeChatId === reactChatId) renderMessages(activeChatId);
          }
        }
      }

      // File transfers (Receive from Desktop)
      if (packet.type === Orbit.Protocol.Types.FILE_TRANSFER_START) {
        if (!packet.payload || !packet.payload.fileId) return;
        var totalChunks = Math.min(packet.payload.totalChunks || 0, 5000);
        if (totalChunks <= 0) return;
        window.activeTransfers = window.activeTransfers || {};
        window.activeTransfers[packet.payload.fileId] = {
          chunks: new Array(totalChunks),
          fileName: packet.payload.fileName || 'unknown',
          total: totalChunks,
          received: 0,
          senderId: msgFrom,
          _startTime: Date.now()
        };
        debugLog('P2P', 'Started receiving file ' + (packet.payload.fileName || '?'));
        return;
      }
      
      if (packet.type === Orbit.Protocol.Types.FILE_CHUNK) {
        if (!packet.payload || !packet.payload.fileId) return;
        window.activeTransfers = window.activeTransfers || {};
        var tx = window.activeTransfers[packet.payload.fileId];
        if (tx) {
          var chunkIdx = parseInt(packet.payload.chunkIndex, 10);
          if (!isNaN(chunkIdx) && chunkIdx >= 0 && chunkIdx < tx.chunks.length) {
            tx.chunks[chunkIdx] = packet.payload.data;
            tx.received++;
          }
          var bwLimit = MStore.settings.netBandwidthLimit || 0;
          if (bwLimit > 0 && tx.received < tx.total) {
            tx._lastChunkTime = tx._lastChunkTime || 0;
            var elapsed = Date.now() - tx._lastChunkTime;
            var chunkSize = (packet.payload.data || '').length;
            var minInterval = Math.max(50, (chunkSize / (bwLimit * 1024)) * 1000);
            if (elapsed < minInterval && !tx._throttleScheduled) {
              tx._throttleScheduled = true;
              setTimeout(function() { if (tx) tx._throttleScheduled = false; }, Math.min(minInterval - elapsed, 1000));
            }
          }
          tx._lastChunkTime = Date.now();
        }
        return;
      }
      
      if (packet.type === Orbit.Protocol.Types.FILE_TRANSFER_END) {
        if (!packet.payload || !packet.payload.fileId) return;
        window.activeTransfers = window.activeTransfers || {};
        var txEnd = window.activeTransfers[packet.payload.fileId];
        if (txEnd) {
          // Validate all chunks received before assembly (MSG-8)
          var allReceived = true;
          for (var ci = 0; ci < txEnd.chunks.length; ci++) {
            if (txEnd.chunks[ci] === undefined) { allReceived = false; break; }
          }
          if (!allReceived) {
            console.warn('[P2P] File transfer incomplete — missing chunks for', txEnd.fileName);
            delete window.activeTransfers[packet.payload.fileId];
            return;
          }
          // CRIT-1: Decode each chunk independently and concatenate ArrayBuffers
          // Desktop independently btoa()'s each 64KB binary chunk — joining as strings
          // produces corrupted base64 at every padding boundary
          var _totalByteLen = 0;
          var _chunkBufs = [];
          for (var _c = 0; _c < txEnd.chunks.length; _c++) {
            var _cb = window.orbitBase64ToArrayBuffer(txEnd.chunks[_c]);
            _chunkBufs.push(_cb);
            _totalByteLen += _cb.byteLength;
          }
          var _mergedBuf = new Uint8Array(_totalByteLen);
          var _off = 0;
          for (var _c = 0; _c < _chunkBufs.length; _c++) {
            _mergedBuf.set(new Uint8Array(_chunkBufs[_c]), _off);
            _off += _chunkBufs[_c].byteLength;
          }
          var extMatch = txEnd.fileName.match(/\.(png|jpe?g|gif|webp|svg|tiff?|bmp|heic|heif|avif)$/i);
          // NOTE: .webm intentionally only in videoMatch — do NOT add to audioMatch
          var audioMatch = txEnd.fileName.match(/\.(mp3|wav|ogg|flac|aac|m4a|wma|opus|mka)$/i);
          var videoMatch = txEnd.fileName.match(/\.(mp4|mov|avi|mkv|webm|3gp|m4v|wmv|flv|f4v|ts|mts|m2ts)$/i);
          var mimeType = 'application/octet-stream';
          var isImage = false;
          var isAudio = false;
          var isVideo = false;
          if (extMatch) {
            var extLower = extMatch[1].toLowerCase();
            if (extLower === 'svg') mimeType = 'image/svg+xml';
            else if (extLower === 'tif' || extLower === 'tiff') mimeType = 'image/tiff';
            else mimeType = 'image/' + extLower.replace('jpg','jpeg');
            isImage = true;
          } else if (videoMatch) {
            // Check video BEFORE audio — .webm is always video
            var videoExtMap = { mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska', webm: 'video/webm', '3gp': 'video/3gpp', m4v: 'video/x-m4v', wmv: 'video/x-ms-wmv', flv: 'video/x-flv', f4v: 'video/x-f4v', ts: 'video/mp2t', mts: 'video/mp2t', m2ts: 'video/mp2t' };
            mimeType = videoExtMap[videoMatch[1].toLowerCase()] || 'video/mp4';
            isVideo = true;
          } else if (audioMatch) {
            var audioExtMap = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4', wma: 'audio/x-ms-wma', opus: 'audio/opus', mka: 'audio/x-matroska' };
            mimeType = audioExtMap[audioMatch[1].toLowerCase()] || 'audio/mpeg';
            isAudio = true;
          }
          
          // Build blob URL from independently-decoded chunks
          var attUrl = '';
          try { attUrl = URL.createObjectURL(new Blob([_mergedBuf.buffer], { type: mimeType })); } catch(e) { attUrl = ''; }
          // Persist file data for cross-restart survival:
          //   - Files <= 10MB: store as data: URL in localStorage (part of attachment JSON)
          //   - Files > 10MB:  store raw ArrayBuffer in IndexedDB (set _blobKey reference)
          //   + Stores ORIGINAL chunk base64 strings in IndexedDB as fallback for the fallback
          var dataUrl = '';
          var blobKey = null;
          var persisted = false;
          if (_totalByteLen > 0 && _totalByteLen <= 10 * 1024 * 1024) {
            try {
              var _dataUrlBytes = new Uint8Array(_mergedBuf.buffer);
              var _dataUrlBinary = '';
              for (var _du = 0; _du < _dataUrlBytes.length; _du++) {
                _dataUrlBinary += String.fromCharCode(_dataUrlBytes[_du]);
              }
              dataUrl = 'data:' + mimeType + ';base64,' + btoa(_dataUrlBinary);
              persisted = true;
            } catch(e) {
              dataUrl = '';
            }
          }
          if (!persisted && _totalByteLen > 64 * 1024) {
            // Large file: store in IndexedDB instead
            blobKey = packet.payload.fileId;
            (function(key, buf, mime) {
              window.BlobStoreDB.put(key, buf).then(function() {
                console.log('[P2P] Stored large file in IndexedDB:', key, buf.byteLength + ' bytes');
              }).catch(function(err) {
                console.warn('[P2P] IndexedDB store failed for', key, err);
              });
            })(blobKey, _mergedBuf.buffer, mimeType);
          }

          // CRIT-4: Try to find existing message with matching _fileId attachment, update it instead of creating duplicate
          var existingMsgs = MStore.getMessages(chatId);
          var found = false;
          for (var mi = 0; mi < existingMsgs.length; mi++) {
            var atts = existingMsgs[mi].attachments;
            if (atts && Array.isArray(atts)) {
              for (var ai = 0; ai < atts.length; ai++) {
                 if (atts[ai]._fileId === packet.payload.fileId) {
                   atts[ai].url = attUrl;
                   atts[ai]._dataUrl = dataUrl;
                   atts[ai]._blobKey = blobKey;
                   if (!atts[ai].type || atts[ai].type === 'file') {
                     atts[ai].type = isImage ? 'image' : (isVideo ? 'video' : (isAudio ? 'audio' : 'file'));
                   }
                   atts[ai]._pending = false;
                   atts[ai].name = txEnd.fileName || atts[ai].name;
                   MStore._saveMsgs(chatId);
                   found = true;
                   break;
                }
              }
            }
            if (found) break;
          }

          if (!found) {
            // Fallback: create a new message entry if no matching _fileId found
            MStore.addMessage(chatId, {
              id: 'p2p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
              from: msgFrom,
              text: '',
              time: new Date().toISOString(),
              attachments: [{
                id: packet.payload.fileId,
                name: txEnd.fileName,
                type: isImage ? 'image' : (isVideo ? 'video' : (isAudio ? 'audio' : 'file')),
                url: attUrl,
                _dataUrl: dataUrl,
                _blobKey: blobKey,
                _fileId: packet.payload.fileId
              }]
            });
          }
          
          delete window.activeTransfers[packet.payload.fileId];
          if (activeChatId === chatId) renderMessages(activeChatId);
          renderChatList();
          debugLog('P2P', 'Completed receiving file ' + txEnd.fileName);
        }
        return;
      }

      if (packet.type === Orbit.Protocol.Types.FILE_TRANSFER_CANCEL || packet.type === Orbit.Protocol.Types.FILE_TRANSFER_REJECT) {
        if (packet.payload && packet.payload.fileId && window.activeTransfers) {
          delete window.activeTransfers[packet.payload.fileId];
        }
        return;
      }

      // Handle MESSAGE_EDIT — desktop sends edited messages
      if (packet.type === Orbit.Protocol.Types.MESSAGE_EDIT) {
        var me = packet.payload || {};
        if (me.msgId && MStore.getMessages(chatId).length) {
          var msgIdx = MStore.getMessages(chatId).findIndex(function(m) { return String(m.id) === String(me.msgId); });
          if (msgIdx !== -1) {
            MStore.messages[chatId][msgIdx].text = me.newText || me.text;
            MStore.messages[chatId][msgIdx].edited = true;
            MStore._saveMsgs(chatId);
            if (activeChatId === chatId) renderMessages(chatId);
          }
        }
        return;
      }

      // Handle READ — desktop sends read receipts
      if (packet.type === Orbit.Protocol.Types.READ) {
        var rr = packet.payload || {};
        if (rr.chatId && MStore.getMessages(rr.chatId).length) {
          var readMsgs = MStore.getMessages(rr.chatId);
          var foundIdx = -1;
          for (var ri = 0; ri < readMsgs.length; ri++) {
            if (String(readMsgs[ri].id) === String(rr.lastReadMsgId)) { foundIdx = ri; break; }
          }
          if (foundIdx >= 0) {
            for (var rj = 0; rj <= foundIdx; rj++) { if (!readMsgs[rj].read) readMsgs[rj].read = true; }
          }
          MStore._saveMsgs(rr.chatId);
        }
        return;
      }

      // Handle MESSAGE_DELETE — desktop deletes messages
      if (packet.type === Orbit.Protocol.Types.MESSAGE_DELETE) {
        var md = packet.payload || {};
        if (md.msgId && MStore.getMessages(chatId).length) {
          MStore.messages[chatId] = MStore.getMessages(chatId).filter(function(m) { return String(m.id) !== String(md.msgId); });
          MStore._saveMsgs(chatId);
          if (activeChatId === chatId) renderMessages(chatId);
        }
        return;
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
          members: (gc.members || [{ userId: msgFrom, role: 'owner', joinedAt: new Date().toISOString() }]).map(function(m) {
            var origin = typeof m === 'string' ? { userId: m } : m;
            var muid = origin.userId;
            var mf = MStore.friends.find(function(f) { return f.id === muid; });
            if (mf) {
              return { ...origin, name: origin.name || mf.name, username: origin.username || origin.name || mf.name, avatar: origin.avatar || mf.avatar || null };
            }
            return { ...origin };
          }),
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

      // Handle GROUP_JOIN_RESPONSE — received when added to a group by desktop peer
      if (packet.type === Orbit.Protocol.Types.GROUP_JOIN_RESPONSE) {
        var gjr = packet.payload || {};
        if (gjr.accepted && gjr.groupId) {
          var gjrExists = MStore.groups.find(function(g) { return g.id === gjr.groupId; });
          if (!gjrExists) {
            var gjrMembers = (gjr.members || []).map(function(m) {
              var origin = typeof m === 'string' ? { userId: m } : m;
              var muid = origin.userId;
              var mf = MStore.friends.find(function(f) { return f.id === muid; });
              if (mf) {
                return { ...origin, name: origin.name || mf.name, username: origin.username || origin.name || mf.name, avatar: origin.avatar || mf.avatar || null };
              }
              return { ...origin };
            });
            MStore.groups.push({
              id: gjr.groupId,
              name: gjr.groupName || 'Group',
              avatar: gjr.groupAvatar || null,
              ownerId: msgFrom,
              members: gjrMembers,
              createdAt: new Date().toISOString(),
              pinnedMessages: [],
              notificationMuted: false,
              inviteCode: null
            });
            var gjrChatExists = MStore.chats.find(function(c) { return c.id === gjr.groupId; });
            if (!gjrChatExists) {
              MStore.chats.push({ id: gjr.groupId, name: gjr.groupName || 'Group', avatar: gjr.groupAvatar || null, lastMessage: '', lastTime: '', unread: 0 });
            }
            MStore.save();
            renderChatList();
            showToast('Joined group "' + (gjr.groupName || 'Group') + '"', 'info');
          }
        } else {
          showToast('Join request denied', 'info');
        }
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

      // Handle GROUP_MEMBER_ADDED — new member added by admin/owner
      if (packet.type === Orbit.Protocol.Types.GROUP_MEMBER_ADDED) {
        var gm = packet.payload || {};
        var gmGroupId = gm.groupId;
        var newMember = gm.user;
        if (!gmGroupId || !newMember) return;
        var gmGrp = MStore.groups.find(function(g) { return g.id === gmGroupId; });
        if (gmGrp) {
          var alreadyMember = (gmGrp.members || []).find(function(m) { return (typeof m === 'string' ? m : m.userId) === newMember.userId; });
          if (!alreadyMember) {
            gmGrp.members = gmGrp.members || [];
            var enrichedNewMember = JSON.parse(JSON.stringify(newMember));
            var nmf = MStore.friends.find(function(f) { return f.id === (newMember.userId || newMember.id); });
            if (nmf) { enrichedNewMember.name = enrichedNewMember.name || nmf.name; enrichedNewMember.username = enrichedNewMember.username || enrichedNewMember.name; enrichedNewMember.avatar = enrichedNewMember.avatar || nmf.avatar || null; }
            gmGrp.members.push(enrichedNewMember);
            MStore.save();
            showToast((enrichedNewMember.name || enrichedNewMember.username || 'Someone') + ' was added to ' + (gmGrp.name || 'group'), 'info');
            if (activeChatId === gmGroupId) {
              var hi = document.getElementById('chat-header-info');
              if (hi) {
                var sd2 = hi.querySelector('div:last-child');
                if (sd2) sd2.textContent = gmGrp.members.length + ' members';
              }
            }
          }
        }
        return;
      }

      // Handle GROUP_OWNER_TRANSFER — ownership transferred
      if (packet.type === Orbit.Protocol.Types.GROUP_OWNER_TRANSFER) {
        var gt = packet.payload || {};
        var gtGroupId = gt.groupId;
        var newOwnerId = gt.newOwnerId;
        if (!gtGroupId || !newOwnerId) return;
        var gtGrp = MStore.groups.find(function(g) { return g.id === gtGroupId; });
        if (gtGrp) {
          gtGrp.ownerId = newOwnerId;
          MStore.save();
          var newOwnerFriend = MStore.friends.find(function(f) { return f.id === newOwnerId; });
          showToast('Ownership transferred to ' + (newOwnerFriend ? newOwnerFriend.name : 'someone'), 'info');
        }
        return;
      }
    } catch(e) { console.error('[P2P] onMessage crash:', e); if (typeof showToast === 'function') showToast('P2P crash:'+_errLoc(e)+' '+e.message,'error'); }
    });

    // Listen for connection failures (clean up phantom connections)
    Orbit.P2P.onConnectFailed(function(data) {
      if (!data) return;
      debugLog('P2P', 'Connection failed', { connectionId: data.connectionId, host: data.host, error: data.error });
    });
    Orbit.P2P.onSendFailed(function(data) {
      if (!data) return;
      debugLog('P2P', 'Send failed', { connectionId: data.connectionId, error: data.error });
    });

    // Listen for disconnections
    Orbit.P2P.onDisconnect(function(data) {
      if (!data) return;
      debugLog('P2P', 'Disconnected', { connectionId: data.connectionId });
      // Only show disconnected if no other connections remain (DISC-3)
      var remainingConns = Orbit.P2P.getConnections ? Orbit.P2P.getConnections() : [];
      if (remainingConns.length === 0) showConnectionStatus('disconnected', 'Disconnected');
      var friend = MStore.friends.find(function(f) { return f.connectionId === data.connectionId; });
      if (!friend && data.connectionId) {
        var discIp = data.connectionId.split(':')[0];
        friend = MStore.friends.find(function(f) { return f.ip === discIp; });
      }
      if (friend) {
        debugLog('P2P', 'Marking friend offline', { name: friend.name, id: friend.id });
        friend.status = 'offline';
        MStore.save();
        renderFriends();
        renderChatList();
        // Auto-reconnect if enabled
        if (MStore.settings.netAutoReconnect !== false && friend.ip) {
          debugLog('P2P', 'Auto-reconnect scheduled in 5s for ' + friend.name);
          var reconnectDelay = (MStore.settings.netReconnectInterval || 10) * 1000;
          var _savedId = friend.id, _savedIp = friend.ip, _savedTcpPort = friend.tcpPort || MStore.settings.tcpPort || 46000, _savedName = friend.name;
          setTimeout(function() {
            var curFriend = MStore.friends.find(function(f) { return f.id === _savedId; });
            if (curFriend && curFriend.status === 'offline') {
              var tcpPort2 = _savedTcpPort;
              debugLog('P2P', 'Auto-reconnecting to ' + _savedName + ' at ' + _savedIp + ':' + tcpPort2 + ' (delay=' + (reconnectDelay / 1000) + 's)');
              var timeoutMs = (MStore.settings.netTimeout || 30) * 1000;
              Orbit.P2P.connect(_savedIp, tcpPort2, _savedId, timeoutMs).then(function(r) {
                if (r.success) debugLog('P2P', 'Auto-reconnect OK', { name: _savedName, connectionId: r.connectionId });
                else debugLog('P2P', 'Auto-reconnect failed for ' + _savedName, { error: r.error });
              });
            }
          }, reconnectDelay);
        }
      } else {
        debugLog('P2P', 'No friend found for disconnected ID', { id: data.connectionId });
      }
    });

    // Listen for peers found via discovery
    // Periodic offline status check
    window._offlineCheckInterval = setInterval(function() {
      var now = Date.now();
      MStore.friends.forEach(function(f) {
        if (f.status === 'online' && f.lastSeen && now - f.lastSeen > 45000) { f.status = 'offline'; }
      });
      MStore.save();
      renderFriends();
      renderChatList();
    }, 15000);

    Orbit.P2P.onPeerFound(function(data) {
      if (!data || !data.host) {
        debugLog('P2P', 'onPeerFound called with invalid data', data);
        return;
      }
      debugLog('P2P', 'Peer found via discovery', { host: data.host, beaconType: typeof data.beacon });
      debugLog('P2P', 'Raw beacon string', typeof data.beacon === 'string' ? data.beacon : JSON.stringify(data.beacon));

      // Parse beacon — Java plugin sends it as a JSON string
      var beacon;
      try {
        beacon = typeof data.beacon === 'string' ? JSON.parse(data.beacon) : data.beacon;
      } catch(e) {
        debugLog('P2P', 'Failed to parse beacon JSON from ' + data.host, { raw: typeof data.beacon === 'string' ? data.beacon.substring(0, 300) : String(data.beacon).substring(0, 300), error: e.message });
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

      // Add or update friend — with peer merging (Bug #2)
      var existing = MStore.friends.find(function(f) { return f.id === peerId; });
      // Also search by IP to catch host:port-based peers
      if (!existing && data.host) {
        var ipFriend = MStore.friends.find(function(f) { return f.ip === data.host; });
        if (ipFriend) {
          debugLog('P2P', 'Merging friend by IP: ' + ipFriend.id + ' → ' + peerId, { name: peerName });
          // Move messages from old chat to new chat
          var oldChatId = ipFriend.id;
          if (oldChatId !== peerId) {
            if (MStore.messages[oldChatId] && MStore.messages[oldChatId].length) {
              MStore.messages[peerId] = MStore.getMessages(peerId).concat(MStore.messages[oldChatId]);
              MStore._saveMsgs(peerId);
              delete MStore.messages[oldChatId];
              localStorage.removeItem('orbit_msg_' + oldChatId);
            }
            // Remove old chat
            MStore.chats = MStore.chats.filter(function(c) { return c.id !== oldChatId; });
          }
          // Upgrade friend ID
          ipFriend.id = peerId;
          ipFriend.name = peerName;
          ipFriend.tag = peerTag;
          ipFriend.status = 'online';
          ipFriend.ip = data.host;
          if (pPayload.avatar) ipFriend.avatar = pPayload.avatar;
          if (pPayload.publicKey) ipFriend.publicKey = pPayload.publicKey;
          if (pPayload.tcpPort) ipFriend.tcpPort = pPayload.tcpPort;
          existing = ipFriend;
        }
      }
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
          tcpPort: pPayload.tcpPort || null,
          publicKey: pPayload.publicKey || null,
          profileFrame: pPayload.profileFrame !== undefined ? pPayload.profileFrame : null,
          banner: pPayload.banner || null
        });
        MStore.save();
        renderFriends();
      } else {
        debugLog('P2P', 'Updating existing friend status', { name: existing.name, id: peerId });
        existing.status = 'online';
        existing.ip = data.host;
        if (pPayload.avatar) existing.avatar = pPayload.avatar;
        if (pPayload.publicKey) existing.publicKey = pPayload.publicKey;
        if (pPayload.profileFrame !== undefined) existing.profileFrame = pPayload.profileFrame;
        if (pPayload.banner) existing.banner = pPayload.banner;
        if (pPayload.tcpPort) existing.tcpPort = pPayload.tcpPort;
        MStore.save();
        renderFriends();
      }

      // Ensure chat exists (avoid duplicates from host:port→UUID merge)
      var chatExists = MStore.chats.find(function(c) { return c.id === peerId; });
      if (!chatExists) {
        debugLog('P2P', 'Creating chat for new peer', { name: peerName, id: peerId });
        MStore.chats.push({ id: peerId, name: peerName, lastMessage: '', lastTime: '', unread: 0 });
        MStore.save();
        renderChatList();
      } else {
        // Clean up any orphan chats from host:port ID (Bug #2)
        var ipChat = MStore.chats.find(function(c) { return c.id !== peerId && c.name === peerName; });
        if (ipChat) {
          debugLog('P2P', 'Removing orphan chat: ' + ipChat.id);
          MStore.chats = MStore.chats.filter(function(c) { return c.id !== ipChat.id; });
          delete MStore.messages[ipChat.id];
          localStorage.removeItem('orbit_msg_' + ipChat.id);
          MStore.save();
          renderChatList();
        }
      }

      // Auto-connect to peer (skip if already connected) (Bug #2)
      window._p2pConnecting = window._p2pConnecting || {};
      if (window._p2pConnecting[peerId]) { debugLog('P2P', 'Already connecting to ' + peerName + ', skipping'); return; }
      var existingConn = Orbit.P2P.isPeerConnected(peerId) || Orbit.P2P.isPeerConnected(data.host);
      debugLog('P2P', 'Checking connection status for ' + peerName, { connected: !!existingConn });
      if (!existingConn) {
        var port = pPayload.tcpPort || 46000;
        debugLog('P2P', 'Auto-connecting to ' + peerName + ' at ' + data.host + ':' + port);
        window._p2pConnecting[peerId] = true;
        Orbit.P2P.connect(data.host, port, peerId).then(function(result) {
          delete window._p2pConnecting[peerId];
          if (result.success) {
            debugLog('P2P', 'Connected to', { name: peerName, id: peerId, connectionId: result.connectionId });
            var friend = MStore.friends.find(function(f) { return f.id === peerId; });
            if (friend) {
              friend.status = 'online';
              if (result.connectionId && result.connectionId !== friend.connectionId) friend.connectionId = result.connectionId;
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

  /* -- App lifecycle handlers for background execution -- */
  (function() {
    // Reliable app background state — used by showIncomingNotification
    // instead of document.hidden which is unreliable in Capacitor WebView
    window._appIsBackgrounded = false;

    // Request battery optimization exemption (user prompt)
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.OrbitP2P) {
        var p = window.Capacitor.Plugins.OrbitP2P;
        if (p.requestIgnoreBatteryOptimizations) p.requestIgnoreBatteryOptimizations();
      }
    } catch(e) { console.log('[Lifecycle] Battery opt request skipped', e.message); }

    async function _foregroundRecovery() {
      renderFriends();
      renderChatList();
      if (activeChatId) renderMessages(activeChatId);
      if (!window.Orbit || !window.Orbit.P2P) return;
      // Re-hydrate JS connection state from native service
      try { if (Orbit.P2P.refreshConnections) await Orbit.P2P.refreshConnections(); } catch(e) { console.warn('[Lifecycle] refreshConnections failed', e); }
      // Restart TCP server if it was killed (native is idempotent)
      var tcpPort = MStore.settings.tcpPort || 46000;
      Orbit.P2P.startServer(tcpPort);
      // Restart discovery if inactive
      if (!Orbit.P2P.isDiscoveryActive()) {
        var beacon = buildBeacon();
        var udpPort = MStore.settings.udpPort || 45678;
        Orbit.P2P.startDiscovery(beacon, udpPort);
      }
    }

    // Handle visibility changes
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        console.log('[Lifecycle] App foregrounded (visibility)');
        _foregroundRecovery();
      }
    });

    // Handle Capacitor appStateChange — this is the RELIABLE way to detect
    // foreground/background on Android (unlike document.hidden)
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      try {
        window.Capacitor.Plugins.App.addListener('appStateChange', function(state) {
          window._appIsBackgrounded = !state.isActive;
          // Inform native plugin so it can post notifications directly
          // (JS WebView may be paused in background, making LocalNotifications.schedule() unreliable)
          try {
            if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.OrbitP2P) {
              window.Capacitor.Plugins.OrbitP2P.setForeground({ isForeground: state.isActive });
            }
          } catch(e2) { console.log('[Lifecycle] setForeground error', e2.message); }
          if (state.isActive) {
            console.log('[Lifecycle] App foregrounded (capacitor)');
            _foregroundRecovery();
          } else {
            console.log('[Lifecycle] App backgrounded — service keeps running');
            MStore.save();
          }
        });
      } catch(e) { console.log('[Lifecycle] App plugin listener error', e.message); }
    }

    // On page show
    window.addEventListener('pageshow', function() {
      console.log('[Lifecycle] Page shown');
      renderFriends();
      renderChatList();
      if (activeChatId) renderMessages(activeChatId);
    });
  })();

  function _errLoc(e) {
    if (e && e.stack) {
      var m = e.stack.match(/(?:\s+at\s+(?:\S+\s+)?\(?)([^:]+):(\d+):(\d+)\)?/);
      if (m) return (m[1].split('\\').pop().split('/').pop()) + ':' + m[2] + ':' + m[3];
    }
    return '';
  }

  /* -- Init -- */
  debugLog('P2P', 'App initialization starting');
  try { initEmojiPicker(); } catch(e) { console.error('[Orbit] initEmojiPicker error:', e); showToast('emoji:'+_errLoc(e)+' '+(e.message||e),'error'); }

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

  var initSteps = [
    { name: 'P2P', fn: initP2P },
    { name: 'ChatList', fn: renderChatList },
    { name: 'Friends', fn: renderFriends },
    { name: 'Settings', fn: renderSettings },
    { name: 'Activity', fn: renderActivity },
    { name: 'MessageSwipe', fn: setupMessageSwipe }
  ];

  initSteps.forEach(function(step) {
    try {
      step.fn();
    } catch(e) {
      var msg = e && e.message ? e.message : String(e);
      console.error('[Orbit] Init error in ' + step.name + ':', e);
      showToast(step.name+':'+_errLoc(e)+' '+msg, 'error');
    }
  });

  // Init debug overlay
  updateDebugOverlay();

  // Restore dev mode on restart: if user had devMode enabled before restart,
  // re-init eruda, data attribute, P2P log button, and log buffer
  if (MStore.settings.devMode) {
    document.documentElement.setAttribute('data-dev-mode', 'true');
    if (!window.eruda) {
      var sc = document.createElement('script');
      sc.src = 'https://cdn.jsdelivr.net/npm/eruda';
      sc.onload = function() { eruda.init(); };
      sc.onerror = function() { /* chrome://inspect fallback */ };
      document.body.appendChild(sc);
    } else {
      eruda.init();
    }
    if (!document.getElementById('p2p-log-btn')) {
      var btn = document.createElement('button');
      btn.id = 'p2p-log-btn';
      btn.textContent = 'P2P Log';
      btn.style.cssText = 'position:fixed;bottom:100px;right:16px;z-index:99998;background:#0a0;color:#fff;border:none;border-radius:8px;padding:10px 16px;font-size:13px;font-family:monospace;cursor:pointer;opacity:0.85;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
      btn.addEventListener('click', showLogOverlay);
      document.body.appendChild(btn);
    }
    renderLogBuffer();
  }

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
    'enableCustomColors': 'data-exp-colors',
    'experimentalProfileFrames': 'data-exp-frames',
    'experimentalFpsMonitor': 'data-exp-fps',
    'experimentalDevOverlay': 'data-exp-dev-overlay',
    'experimentalPerformanceMode': 'data-perf-mode'
  };
  Object.keys(expAttrs).forEach(function(key) {
    if (MStore.settings[key]) document.documentElement.setAttribute(expAttrs[key], 'true');
  });

  // Auto-delete attachments timer
  function runAutoDelete() {
    var interval = parseInt(MStore.settings.deleteAttachmentsAfter, 10);
    if (interval > 0) {
      var cutoff = Date.now() - interval * 60 * 1000;
      var chatIds = [];
      for (var _i2 = 0; _i2 < localStorage.length; _i2++) { var _k2 = localStorage.key(_i2); if (_k2.indexOf('orbit_msg_') === 0) { chatIds.push(_k2.substring(9)); } }
      chatIds.forEach(function(chatId) {
        var msgs = MStore.getMessages(chatId);
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
        if (changed) MStore._saveMsgs(chatId);
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

  // Request notification permissions
  try { requestNotificationPermission(); } catch(e) { console.warn('[Startup] requestNotificationPermission failed', e); }

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
