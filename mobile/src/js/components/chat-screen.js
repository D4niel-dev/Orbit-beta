// mobile/src/js/components/chat-screen.js
// v0.2.8 — Chat Screen Renderer

var OrbitChat = {
  _currentChatId: null,
  _contextMenuInitialized: false,

  /** Open a chat and render everything */
  openChat: function(chatId) {
    if (!chatId) return;
    this._currentChatId = chatId;
    
    // Get chat info
    var chat = this._getChat(chatId);
    if (!chat) return;
    
    // Sync with app.js state
    window.activeChatId = chatId;
    window.editingMsg = null;
    window.replyingTo = null;
    // Hide reply bar when opening new chat
    if (window.cancelReplyEdit) window.cancelReplyEdit();
    
    // Update header
    this._renderHeader(chat);
    
    // Open panel
    OrbitNav.openChat();
    
    // Render messages
    this.renderMessages(chatId);
    
    // Reset unread
    if (MStore.unreadCounts) {
      MStore.unreadCounts[chatId] = 0;
    }
    
    // Scroll to bottom
    setTimeout(function() {
      var feed = document.getElementById('message-feed');
      if (feed) feed.scrollTop = feed.scrollHeight;
    }, 100);
  },

  /** Close current chat */
  closeChat: function() {
    this._currentChatId = null;
    window.activeChatId = null;
    OrbitNav.closeChat();
  },

  /** Get chat or group data */
  _getChat: function(chatId) {
    if (!chatId) return null;
    
    var peerId = null;
    var isGroup = false;
    
    if (chatId.indexOf('dm_') === 0) {
      peerId = chatId.substring(3);
    } else if (chatId.indexOf('group_') === 0) {
      isGroup = true;
      var groups = MStore.groups || [];
      for (var i = 0; i < groups.length; i++) {
        if (groups[i].id === chatId) return groups[i];
      }
      return null;
    } else {
      // Plain chat ID — could be a DM or echo
      peerId = chatId;
    }
    
    // Try to find existing chat by ID
    var chats = MStore.chats || [];
    var chat = null;
    for (var i = 0; i < chats.length; i++) {
      if (chats[i].id === chatId || chats[i].chatId === chatId) {
        chat = chats[i];
        break;
      }
    }
    
    // For DM chats, enrich with friend data
    if (peerId && !isGroup) {
      var friends = MStore.friends || [];
      for (var i = 0; i < friends.length; i++) {
        if (friends[i].id === peerId || friends[i].peerId === peerId) {
          var friend = friends[i];
          if (chat) {
            // Merge friend data with chat data (friend avatar/status takes priority)
            return {
              id: chat.id || friend.id,
              peerId: chat.peerId || friend.peerId || friend.id,
              name: chat.name || friend.name,
              avatar: chat.avatar || friend.avatar,
              status: chat.status || friend.status,
              lastSeen: chat.lastSeen || friend.lastSeen,
              lastMessage: chat.lastMessage || '',
              lastTime: chat.lastTime || 0,
              unread: chat.unread || 0,
              type: 'dm',
              messages: chat.messages || []
            };
          }
          // No existing chat — return friend data
          return friend;
        }
      }
    }
    
    // No friend found — return raw chat or generic placeholder
    if (chat) return chat;
    if (peerId) return { id: peerId, peerId: peerId, name: peerId, type: 'dm' };
    return null;
  },

  /** Render chat header */
  _renderHeader: function(chat) {
    var headerInfo = document.getElementById('chat-header-info');
    var avatarEl = document.getElementById('chat-header-avatar');
    if (!headerInfo) return;
    
    var displayName = chat.name || chat.peerId || 'Chat';
    
    // Match old app.js status text format
    var statusText = '';
    var statusDotColor = 'var(--text-muted)';
    var statusLabels = { online: 'Online', away: 'Away', busy: 'Busy', offline: 'Offline' };
    var statusColors = { online: 'var(--accent-success)', away: 'var(--accent-warning)', busy: 'var(--accent-danger)', offline: 'var(--text-muted)' };
    
    if (chat.id === 'echo') {
      // Echo bot: "Bot · Online" (no status dot, matching old app.js)
      statusText = 'Bot · Online';
    } else if (chat.status && statusLabels[chat.status]) {
      // Known status
      statusText = statusLabels[chat.status];
      statusDotColor = statusColors[chat.status] || 'var(--text-muted)';
    } else if (chat.lastSeen && chat.lastSeen > Date.now() - 45000) {
      // Recently online (within 45s)
      statusText = 'Online';
      statusDotColor = 'var(--accent-success)';
    } else if (chat.lastSeen) {
      // Last seen
      var d = new Date(chat.lastSeen);
      statusText = 'Last seen ' + d.toLocaleDateString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
      statusDotColor = 'var(--text-muted)';
    } else {
      statusText = 'Offline';
      statusDotColor = 'var(--text-muted)';
    }
    
    var statusDotHtml = '';
    if (chat.id !== 'echo') {
      statusDotHtml = '<span style="width:7px;height:7px;border-radius:50%;background:' + statusDotColor + ';display:inline-block;"></span> ';
    }
    
    headerInfo.innerHTML =
      '<div class="chat-header-name">' + OrbitChat._escapeAttr(displayName) + '</div>' +
      '<div class="chat-header-status">' +
        statusDotHtml + OrbitChat._escapeAttr(statusText) +
      '</div>';
    
    // Avatar
    if (avatarEl) {
      var initial = displayName.charAt(0).toUpperCase();
      if (chat.avatar) {
        avatarEl.innerHTML = '<img src="' + OrbitChat._escapeAttr(chat.avatar) + '" alt="">';
      } else {
        avatarEl.textContent = initial;
      }
      avatarEl.style.display = '';
    }
  },

  _escapeAttr: function(str) {
    return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  /** Render all messages for a chat with date separators */
  renderMessages: function(chatId) {
    var feed = document.getElementById('message-feed');
    if (!feed) return;
    
    var messages = MStore.messages && MStore.messages[chatId] || [];
    
    if (messages.length === 0) {
      feed.innerHTML = '<div class="empty-state" style="flex:1;display:flex;"><i data-lucide="message-circle"></i><div class="empty-state-text">No messages yet</div><div class="empty-state-sub">Say hello to start the conversation</div></div>';
      this._initContextMenu();
      return;
    }
    
    var html = '';
    var lastDateKey = '';
    
    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      var isMine = msg.from === 'me' || msg.from === MStore.user?.peerId;
      var isGrouped = (i > 0 && messages[i-1].from === msg.from && 
                       (msg.time - messages[i-1].time) < 120000); // 2 min threshold
      
      // Date separator
      var msgDate = msg.time ? new Date(msg.time) : null;
      var dateKey = msgDate ? (msgDate.getFullYear() + '-' + (msgDate.getMonth()+1) + '-' + msgDate.getDate()) : '';
      if (dateKey && dateKey !== lastDateKey) {
        html += OrbitChat._renderDateSeparator(msgDate);
        lastDateKey = dateKey;
      }
      
      html += this._renderSingleMessage(msg, isMine, isGrouped);
    }
    
    feed.innerHTML = html;
    
    // Re-init Lucide
    if (window.lucide) lucide.createIcons();
    
    // Init long-press context menu (safe to call multiple times)
    this._initContextMenu();
    
    // Scroll to bottom
    setTimeout(function() {
      feed.scrollTop = feed.scrollHeight;
    }, 50);
  },

  /** Render a date separator pill */
  _renderDateSeparator: function(date) {
    var label = OrbitChat._formatDateLabel(date);
    return '<div class="date-separator"><span>' + label + '</span></div>';
  },

  /** Format a date as "Today", "Yesterday", or "Mon, Feb 16" */
  _formatDateLabel: function(date) {
    if (!date) return '';
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    var msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (msgDate.getTime() === today.getTime()) return 'Today';
    if (msgDate.getTime() === yesterday.getTime()) return 'Yesterday';
    return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
  },

  /** Render a single message bubble */
  _renderSingleMessage: function(msg, isMine, isGrouped) {
    var text = msg.text || '';
    var time = msg.time ? new Date(msg.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
    var reactions = msg.reactions || [];
    var hasReactions = reactions.length > 0;
    
    var html = '<div class="message-row' + (isMine ? ' mine' : ' other') + (isGrouped ? ' grouped' : '') + '" data-msg-id="' + (msg.id || '') + '" data-msg-anim="slide">';
    
    // Reply reference
    if (msg.replyTo) {
      html += '  <div class="reply-ref">';
      html += '    <div class="reply-ref-bar"></div>';
      html += '    <div class="reply-ref-content">';
      html += '      <span class="reply-ref-name">' + OrbitChat._escape(msg.replyToName || 'Message') + '</span>';
      html += '      <span class="reply-ref-text">' + OrbitChat._escape(msg.replyToText || '') + '</span>';
      html += '    </div>';
      html += '  </div>';
    }
    
    html += '  <div class="message-bubble">';
    
    // Text content (sanitized)
    if (text) {
      html += '    <div class="msg-text">' + OrbitChat._sanitizeHtml(text) + '</div>';
    }
    
    // Reactions
    if (hasReactions) {
      html += '    <div class="reactions-row" data-msg-id="' + (msg.id || '') + '">';
      reactions.forEach(function(r) {
        html += '      <span class="reaction-pill' + (r.mine ? ' mine' : '') + '">' + r.emoji + ' <span class="reaction-pill-count">' + r.count + '</span></span>';
      });
      html += '    </div>';
    }
    
    // Time
    html += '    <div class="message-time">' + time + '</div>';
    html += '  </div>';
    html += '</div>';
    
    return html;
  },

  /** Sanitize HTML (allow only safe tags) */
  _sanitizeHtml: function(str) {
    if (!str) return '';
    // Basic sanitization: escape HTML but allow line breaks
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    var escaped = div.innerHTML;
    // Convert newlines to <br>
    escaped = escaped.replace(/\n/g, '<br>');
    return escaped;
  },

  /** Escape HTML for safe inline insertion */
  _escape: function(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  },

  /** Initialize long-press context menu (event delegation on #message-feed) */
  _initContextMenu: function() {
    if (this._contextMenuInitialized) return;
    this._contextMenuInitialized = true;
    
    var feed = document.getElementById('message-feed');
    if (!feed) return;
    
    var pressTimer = null;
    var startX = 0, startY = 0;
    
    feed.addEventListener('touchstart', function(e) {
      var row = e.target.closest('.message-row');
      if (!row) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      pressTimer = setTimeout(function() {
        pressTimer = null;
        var msgId = row.getAttribute('data-msg-id');
        if (msgId) {
          OrbitChat._showContextMenu(msgId);
          // Prevent text selection / default action
          try { e.preventDefault(); } catch(ex) {}
        }
      }, 400);
    }, {passive: true});
    
    feed.addEventListener('touchmove', function(e) {
      if (pressTimer) {
        var dx = Math.abs(e.touches[0].clientX - startX);
        var dy = Math.abs(e.touches[0].clientY - startY);
        if (dx > 10 || dy > 10) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      }
    }, {passive: true});
    
    feed.addEventListener('touchend', function() {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    });
    
    // Desktop fallback: right-click
    feed.addEventListener('contextmenu', function(e) {
      var row = e.target.closest('.message-row');
      if (!row) return;
      e.preventDefault();
      var msgId = row.getAttribute('data-msg-id');
      if (msgId) OrbitChat._showContextMenu(msgId);
    });
  },

  /** Show long-press context menu as a bottom sheet */
  _showContextMenu: function(msgId) {
    if (!msgId || !this._currentChatId) return;
    
    var messages = MStore.messages && MStore.messages[this._currentChatId] || [];
    var msg = null;
    for (var i = 0; i < messages.length; i++) {
      if (messages[i].id === msgId) { msg = messages[i]; break; }
    }
    if (!msg) return;
    
    var isMine = msg.from === 'me' || msg.from === MStore.user?.peerId;
    var msgText = msg.text || '';
    var truncatedText = msgText.length > 80 ? msgText.substring(0, 80) + '...' : msgText;
    
    var html = '';
    // Selected message preview
    if (truncatedText) {
      html += '<div class="context-msg-preview">';
      html += '  <div class="context-msg-text">' + OrbitChat._escape(truncatedText) + '</div>';
      html += '</div>';
    }
    
    // Quick reactions
    html += '<div class="context-reactions">';
    var emojis = ['😀', '❤️', '👍', '😂', '😮', '😢', '😡'];
    for (var e = 0; e < emojis.length; e++) {
      html += '<button class="context-reaction-btn" data-emoji="' + emojis[e] + '" data-msg-id="' + msgId + '">' + emojis[e] + '</button>';
    }
    html += '</div>';
    
    // Divider
    html += '<div class="context-divider"></div>';
    
    // Actions (label left, icon right — matching reference design)
    var actions = [
      { icon: 'copy', label: 'Copy', action: 'copy', danger: false },
      { icon: 'reply', label: 'Reply', action: 'reply', danger: false },
      { icon: 'forward', label: 'Forward', action: 'forward', danger: false }
    ];
    if (isMine) {
      actions.push({ icon: 'trash-2', label: 'Delete', action: 'delete', danger: true });
    }
    
    for (var a = 0; a < actions.length; a++) {
      var act = actions[a];
      html += '<button class="context-action-item' + (act.danger ? ' danger' : '') + '" data-action="' + act.action + '" data-msg-id="' + msgId + '">';
      html += '  <span>' + act.label + '</span>';
      html += '  <i data-lucide="' + act.icon + '"></i>';
      html += '</button>';
    }
    
    // Show in bottom sheet using custom content
    if (typeof OrbitSheet !== 'undefined') {
      OrbitSheet.showCustom(html);
      
      // Wire reaction clicks after DOM update
      setTimeout(function() {
        var sheet = document.getElementById('bottom-sheet-content');
        if (!sheet) return;
        
        // Reaction clicks
        var reactionBtns = sheet.querySelectorAll('.context-reaction-btn');
        for (var r = 0; r < reactionBtns.length; r++) {
          (function(btn) {
            btn.addEventListener('click', function() {
              var emoji = btn.getAttribute('data-emoji');
              var mId = btn.getAttribute('data-msg-id');
              OrbitSheet.hide();
              OrbitChat.addReaction(mId, emoji);
            });
          })(reactionBtns[r]);
        }
        
        // Action clicks
        var actionBtns = sheet.querySelectorAll('.context-action-item');
        for (var ac = 0; ac < actionBtns.length; ac++) {
          (function(btn) {
            btn.addEventListener('click', function() {
              var action = btn.getAttribute('data-action');
              var mId = btn.getAttribute('data-msg-id');
              OrbitSheet.hide();
              setTimeout(function() {
                OrbitChat._handleContextAction(action, mId);
              }, 200);
            });
          })(actionBtns[ac]);
        }
        
        // Re-init Lucide icons
        if (window.lucide) lucide.createIcons();
      }, 50);
    }
  },

  /** Handle context menu actions */
  _handleContextAction: function(action, msgId) {
    switch(action) {
      case 'copy':
        var messages = MStore.messages && MStore.messages[this._currentChatId] || [];
        for (var i = 0; i < messages.length; i++) {
          if (messages[i].id === msgId) {
            var text = messages[i].text || '';
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(text).catch(function() {});
            }
            if (window.OrbitToast) OrbitToast.show('Copied to clipboard');
            break;
          }
        }
        break;
      case 'reply':
        if (window.startReply) {
          window.startReply(msgId);
        }
        break;
      case 'forward':
        if (window.showForwardModal) {
          window.showForwardModal(msgId);
        }
        break;
      case 'delete':
        if (confirm('Delete this message?')) {
          if (window.MStore && this._currentChatId) {
            MStore.deleteMessage(this._currentChatId, msgId);
            this.renderMessages(this._currentChatId);
            if (window.renderChatList) window.renderChatList();
            MStore.saveToLocalStorage();
          }
        }
        break;
    }
  },

  /** Add a reaction to a message */
  addReaction: function(msgId, emoji) {
    if (!msgId || !this._currentChatId) return;
    var chatId = this._currentChatId;
    var messages = MStore.messages && MStore.messages[chatId] || [];
    
    for (var i = 0; i < messages.length; i++) {
      if (messages[i].id === msgId) {
        if (!messages[i].reactions) messages[i].reactions = [];
        
        // Toggle: if same emoji from user, remove it
        var existing = null;
        for (var j = 0; j < messages[i].reactions.length; j++) {
          if (messages[i].reactions[j].emoji === emoji && messages[i].reactions[j].mine) {
            existing = j;
            break;
          }
        }
        
        if (existing !== null) {
          messages[i].reactions[existing].count--;
          if (messages[i].reactions[existing].count <= 0) {
            messages[i].reactions.splice(existing, 1);
          } else {
            messages[i].reactions[existing].mine = false;
          }
        } else {
          // Find if anyone reacted with this emoji
          var found = false;
          for (var j = 0; j < messages[i].reactions.length; j++) {
            if (messages[i].reactions[j].emoji === emoji) {
              messages[i].reactions[j].count++;
              messages[i].reactions[j].mine = true;
              found = true;
              break;
            }
          }
          if (!found) {
            messages[i].reactions.push({ emoji: emoji, count: 1, mine: true });
          }
        }
        
        // Re-render
        this.renderMessages(this._currentChatId);
        
        // Save
        if (window.MStore) {
          MStore.saveToLocalStorage();
        }
        
        // Send reaction via network
        if (window.Orbit && Orbit.sendReaction) {
          Orbit.sendReaction(chatId, msgId, emoji);
        }
        break;
      }
    }
  }
};

// Expose for backward compatibility
window.openChat = function(chatId) { OrbitChat.openChat(chatId); };
window.closeChat = function() { OrbitChat.closeChat(); };
window.renderChatList = function(filter) { OrbitHome.renderChatList(filter); };
