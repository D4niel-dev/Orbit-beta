// mobile/src/js/components/home-screen.js
// v0.2.8 � Home Screen Renderer

var OrbitHome = {
  /** Render the online friends horizontal scroll row */
  renderOnlineFriends: function() {
    var container = document.getElementById('online-friends-row');
    if (!container) return;
    
    var friends = MStore.friends || [];
    var filter = window._onlineFriendFilter || 'all';
    
    // Apply filter
    var filteredFriends = friends.filter(function(f) {
      var isOnline = f.status === 'online' || f.lastSeen > Date.now() - 45000;
      if (filter === 'online') return isOnline;
      if (filter === 'offline') return !isOnline;
      return true;
    });
    
    // Update filter count
    var countEl = document.getElementById('online-filter-count');
    if (countEl) {
      var onlineCount = friends.filter(function(f) {
        return f.status === 'online' || f.lastSeen > Date.now() - 45000;
      }).length;
      countEl.textContent = onlineCount + ' online';
    }
    
    if (filteredFriends.length === 0) {
      var emptyMsg = filter === 'all' ? 'No friends yet' :
                     filter === 'online' ? 'No friends online' :
                     'No offline friends';
      container.innerHTML = '<div class="online-empty-state"><i data-lucide="' + 
        (filter === 'online' ? 'wifi-off' : filter === 'offline' ? 'clock' : 'users') + 
        '"></i><span>' + emptyMsg + '</span></div>';
      container.dataset.centered = 'true';
      return;
    }
    
    var MAX_VISIBLE = 6;
    var showAll = container.dataset.showAll === 'true';
    var displayFriends = showAll ? filteredFriends : filteredFriends.slice(0, MAX_VISIBLE);
    var remaining = filteredFriends.length - MAX_VISIBLE;
    
    var html = '';
    
    // + button FIRST (always on the left)
    html += '<div class="online-friend-item online-friend-add-item" id="btn-add-quick-online">' +
      '<div class="online-friend-avatar" style="background:transparent;border:2px dashed var(--border-subtle);color:var(--text-muted);font-size:20px;">' +
        '<i data-lucide="plus" style="width:22px;height:22px;"></i>' +
      '</div>' +
      '<span class="online-friend-name">Add</span>' +
    '</div>';
    
    displayFriends.forEach(function(friend) {
      var displayName = friend.name || friend.peerId || '?';
      var initial = displayName.charAt(0).toUpperCase();
      var avatarHtml = friend.avatar 
        ? '<img src="' + friend.avatar + '" alt="' + displayName + '" loading="lazy">'
        : initial;
      
      html += '<div class="online-friend-item" data-peerid="' + (friend.peerId || friend.id || '') + '">';
      var isDefOnline = friend.status === 'online' || (friend.lastSeen || 0) > Date.now() - 30000;
      html += '  <div class="online-friend-avatar">' + avatarHtml + '<span class="online-indicator' + (isDefOnline ? '' : ' idle') + '"></span></div>';
      html += '  <span class="online-friend-name">' + OrbitHome._escape(displayName) + '</span>';
      html += '</div>';
    });
    
    if (!showAll && remaining > 0) {
      html += '<div class="online-friend-item online-friend-more" id="online-friends-more-btn">' +
        '<div class="online-friend-avatar" style="background:var(--bg-hover);border:2px dashed var(--border-subtle);font-size:13px;font-weight:600;color:var(--text-muted);">+' + remaining + '</div>' +
        '<span class="online-friend-name">More</span>' +
      '</div>';
    }
    
    container.innerHTML = html;
    this._addAvatarFrames();
    
    container.dataset.centered = (filteredFriends.length <= 1) ? 'true' : 'false';
    
    if (window.lucide) {
      lucide.createIcons();
    }
  },

  /** Expand online friends to show all */
  _showMoreOnline: function() {
    var container = document.getElementById('online-friends-row');
    if (container) {
      container.dataset.showAll = 'true';
      this.renderOnlineFriends();
    }
  },


  /** Click an online friend to open chat */
  _onFriendClick: function(peerId) {
    if (!peerId) return;
    var chat = null;
    var chats = MStore.chats || [];
    for (var i = 0; i < chats.length; i++) {
      if (chats[i].peerId === peerId || chats[i].id === peerId) {
        chat = chats[i];
        break;
      }
    }
    if (!chat) {
      var friends = MStore.friends || [];
      var friend = null;
      for (var i = 0; i < friends.length; i++) {
        if (friends[i].peerId === peerId || friends[i].id === peerId) {
          friend = friends[i];
          break;
        }
      }
      if (friend) {
        chat = {
          id: 'dm_' + peerId,
          peerId: friend.peerId || peerId,
          name: friend.name || peerId,
          type: 'dm',
          messages: []
        };
        MStore.chats.push(chat);
        MStore.save();
      }
    }
    if (chat) {
      if (typeof window.openChat === 'function') {
        window.openChat(chat.id);
      } else if (typeof openChat === 'function') {
        openChat(chat.id);
      }
    }
  },
  _escape: function(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  },

  /** Highlight matching text in search results */
  _highlightText: function(text, query) {
    if (!query || !text) return this._escape(text || '');
    var escaped = this._escape(text);
    var lower = escaped.toLowerCase();
    var q = query.toLowerCase();
    if (lower.indexOf(q) === -1) return escaped;
    var result = '';
    var lastIdx = 0;
    var idx = lower.indexOf(q, lastIdx);
    while (idx !== -1) {
      result += escaped.substring(lastIdx, idx);
      result += '<strong style="color:var(--accent-primary);font-weight:600;">' + escaped.substring(idx, idx + q.length) + '</strong>';
      lastIdx = idx + q.length;
      idx = lower.indexOf(q, lastIdx);
    }
    result += escaped.substring(lastIdx);
    return result;
  },

  /** Save a recent search term (max 5) */
  _saveRecentSearch: function(q) {
    if (!q || !q.trim()) return;
    var recent = (MStore.settings && MStore.settings.recentSearches) || [];
    recent = recent.filter(function(s) { return s !== q; });
    recent.unshift(q);
    if (recent.length > 5) recent.length = 5;
    if (!MStore.settings) MStore.settings = {};
    MStore.settings.recentSearches = recent;
    MStore.save();
  },

  /** Render the profile pill with user info */
  renderProfilePill: function() {
    var avatarEl = document.getElementById('profile-pill-avatar');
    var nameEl = document.getElementById('profile-pill-name');
    var statusEl = document.getElementById('profile-pill-status');
    if (!avatarEl || !nameEl || !statusEl) return;
    
    var user = MStore.user || null;
    if (user) {
      var displayName = user.name || user.peerId || 'User';
      var initial = displayName.charAt(0).toUpperCase();
      avatarEl.style.position = 'relative';
      if (user.avatar) {
        avatarEl.innerHTML = '<img src="' + user.avatar + '" alt="">';
      } else {
        avatarEl.textContent = initial;
      }
      // Add profile frame if a frame is selected
      var pfNum = parseInt(MStore.settings && MStore.settings.profileFrame, 10) || 0;
      var oldFrame = avatarEl.querySelector('.pfp-frame');
      if (pfNum > 0) {
        if (!oldFrame) {
          var frameEl = document.createElement('img');
          frameEl.className = 'pfp-frame';
          frameEl.draggable = false;
          frameEl.alt = '';
          frameEl.style.cssText = 'position:absolute;top:-16%;left:-16%;pointer-events:none;';
          avatarEl.appendChild(frameEl);
        } else {
          var frameEl = oldFrame;
        }
        frameEl.src = 'icons/frames/pfp_frame_' + pfNum + '.png';
      } else if (oldFrame) {
        oldFrame.remove();
      }
      nameEl.textContent = displayName;
      var _s = (user.status || 'offline');
      var statusLabels = { online: 'Online', away: 'Away', dnd: 'Do Not Disturb', invisible: 'Invisible', offline: 'Offline' };
      var statusColors = { online: 'var(--accent-success)', away: 'var(--accent-warning)', dnd: 'var(--accent-danger)', invisible: 'var(--text-muted)', offline: 'var(--text-muted)' };
      statusEl.textContent = statusLabels[_s] || 'Offline';
      statusEl.style.color = statusColors[_s] || '';
    } else {
      avatarEl.textContent = '?';
      nameEl.textContent = 'User';
      statusEl.textContent = 'Offline';
    }
    
    var pill = document.getElementById('profile-pill');
    if (pill && window.showProfileSheet) {
      pill.onclick = function() { window.showProfileSheet(); };
    }
  },

  _onFriendClick: function(peerId) {
    if (!peerId) return;
    // Open direct chat with this friend
    var chatId = 'dm_' + peerId;
    if (window.openChat) {
      window.openChat(chatId);
    }
  },

  /** Render the chat list with card-style items */
  renderChatList: function(filter) {
    var container = document.getElementById('chat-list');
    // Update profile pill
    this.renderProfilePill();
    // Update online friends section
    this.renderOnlineFriends();
    if (!container) return;
    
    var chats = MStore.chats || [];
    var groups = MStore.groups || [];
    
    // Filter by tab: Friends = DMs only, Groups = groups only
    var groupIds = {};
    (MStore.groups || []).forEach(function(g) { groupIds[g.id || g.groupId] = true; });
    if (filter === 'groups') {
      chats = chats.filter(function(c) { return groupIds[c.id]; });
    } else {
      chats = chats.filter(function(c) { return !groupIds[c.id]; });
    }
    
    var searchQ = window._chatSearchQuery || '';
    
    // ---- SEARCH MODE: show categorized results ----
    if (searchQ) {
      this._saveRecentSearch(searchQ);
      container.innerHTML = this._buildSearchResults(searchQ, chats, filter);
      this._addAvatarFrames();
      if (window.lucide) lucide.createIcons();
      return;
    }
    
    if (chats.length === 0) {
      container.innerHTML = '<div class="empty-state enhanced"><i data-lucide="message-circle"></i><div class="empty-state-text">No conversations yet</div><div class="empty-state-sub">Your chats will appear here once you start a conversation</div></div>';
      return;
    }
    
    // Sort: pinned first, then by last message time
    var pinned = MStore.pinnedDMs || {};
    chats.sort(function(a, b) {
      var aPinned = pinned[a.id || a.chatId] ? 1 : 0;
      var bPinned = pinned[b.id || b.chatId] ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      var aTime = a.lastTime || 0;
      var bTime = b.lastTime || 0;
      return bTime - aTime;
    });
    
    var html = '';
    chats.forEach(function(chat) {
      var chatId = chat.id || chat.chatId;
      var isPinned = pinned[chatId];
      var unread = MStore.unreadCounts && MStore.unreadCounts[chatId] || 0;
      var isGroup = chat.type === 'group';
      var displayName = chat.name || chat.peerId || 'Unknown';
      var initial = displayName.charAt(0).toUpperCase();
      var avatarUrl = chat.avatar;
      
      var avatarHtml = avatarUrl 
        ? '<img src="' + avatarUrl + '" alt="' + initial + '" loading="lazy" onerror="var f=this;f.onerror=null;var i=f.getAttribute(\'data-init\')||\'' + initial + '\';f.style.display=\'none\';var d=document.createElement(\'div\');d.textContent=i;d.style.cssText=\'width:40px;height:40px;border-radius:50%;background:var(--accent-soft);color:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;\';f.parentNode.insertBefore(d,f);" data-init="' + initial + '">'
        : initial;
      
      var preview = chat.lastMessage || '';
      // Strip markdown for preview
      preview = preview.replace(/```[\s\S]*?```/g, '[code]');
      preview = preview.replace(/`([^`]+)`/g, '$1');
      preview = preview.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
      preview = preview.replace(/[*#_~>]/g, '');
      preview = preview.length > 80 ? preview.substring(0, 80) + '\u2026' : preview;
      
      var timeStr = '';
      if (chat.lastTime) {
        var d = new Date(chat.lastTime);
        var now = new Date();
        if (d.toDateString() === now.toDateString()) {
          timeStr = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        } else {
          timeStr = d.toLocaleDateString([], {month:'short', day:'numeric'});
        }
      }
      
      var isOnline = chat.status === 'online';
      var typing = chat.isTyping;
      
      html += '<div class="chat-row' + (unread > 0 ? ' unread' : '') + '" data-chatid="' + chatId + '" onclick="OrbitHome._onChatClick(\'' + chatId + '\')">';
      html += '  <div class="chat-row-avatar">' + avatarHtml;
      if (isOnline) {
        html += '    <span class="chat-row-status-dot online"></span>';
      } else {
        html += '    <span class="chat-row-status-dot offline"></span>';
      }
      html += '  </div>';
      html += '  <div class="chat-row-info">';
      html += '    <div class="chat-row-name">' + OrbitHome._escape(displayName) + '</div>';
      if (typing) {
        html += '    <div class="chat-row-typing">Typing\u2026</div>';
      } else {
        html += '    <div class="chat-row-preview">' + (preview || 'No messages yet') + '</div>';
      }
      html += '  </div>';
      html += '  <div class="chat-row-meta">';
      html += '    <span class="chat-row-time">' + timeStr + '</span>';
      if (unread > 0) {
        html += '    <span class="chat-row-badge">' + (unread > 99 ? '99+' : unread) + '</span>';
      }
      if (isPinned) {
        html += '    <i data-lucide="pin" class="chat-row-pin-icon"></i>';
      }
      html += '  </div>';
      html += '</div>';
    });
    
    container.innerHTML = html;
    this._addAvatarFrames();

    // Re-init Lucide icons
    if (window.lucide) {
      lucide.createIcons();
    }
  },

  /** Build categorized search results HTML */
  _buildSearchResults: function(query, chats, filter) {
    var q = query.toLowerCase();
    var results = [];
    
    // --- Chat results ---
    var matchedChats = [];
    chats.forEach(function(c) {
      var name = (c.name || '').toLowerCase();
      var preview = (c.lastMessage || '').toLowerCase();
      if (name.indexOf(q) !== -1 || preview.indexOf(q) !== -1) {
        matchedChats.push(c);
      }
    });
    if (matchedChats.length) {
      results.push({ type: 'chats', label: 'Chats', items: matchedChats });
    }
    
    // --- Friend results ---
    var friends = MStore.friends || [];
    var matchedFriends = [];
    friends.forEach(function(f) {
      var fName = (f.name || '').toLowerCase();
      if (fName.indexOf(q) !== -1) {
        matchedFriends.push(f);
      }
    });
    if (matchedFriends.length) {
      results.push({ type: 'friends', label: 'Friends', items: matchedFriends });
    }
    
    // --- Message results (scan recent chats' last 50 messages) ---
    var matchedMessages = [];
    var sortedChats = (MStore.chats || []).slice().sort(function(a, b) {
      return (b.lastTime || 0) - (a.lastTime || 0);
    });
    var scannedCount = 0;
    for (var ci = 0; ci < sortedChats.length && scannedCount < 10; ci++) {
      var chat = sortedChats[ci];
      var chatId = chat.id || chat.chatId;
      var msgs = (MStore.messages && MStore.messages[chatId]) || [];
      var startIdx = Math.max(0, msgs.length - 50);
      for (var mi = startIdx; mi < msgs.length; mi++) {
        var msg = msgs[mi];
        if (msg && msg.text && msg.text.toLowerCase().indexOf(q) !== -1) {
          matchedMessages.push({ chat: chat, message: msg });
          if (matchedMessages.length >= 8) break;
        }
      }
      scannedCount++;
      if (matchedMessages.length >= 8) break;
    }
    if (matchedMessages.length) {
      results.push({ type: 'messages', label: 'Messages', items: matchedMessages });
    }
    
    // --- Build HTML ---
    var totalCount = 0;
    results.forEach(function(r) { totalCount += r.items.length; });
    
    var html = '<div class="search-results-info">' + this._highlightText('Search results for "' + query + '"', query) + ' \u2014 ' + totalCount + ' result' + (totalCount !== 1 ? 's' : '') + '</div>';
    
    results.forEach(function(section) {
      html += '<div class="search-results-section">';
      html += '<div class="search-results-section-header">' + section.label + ' (' + section.items.length + ')</div>';
      
      if (section.type === 'chats') {
        section.items.forEach(function(chat) {
          var chatId = chat.id || chat.chatId;
          var displayName = chat.name || chat.peerId || 'Unknown';
          var initial = displayName.charAt(0).toUpperCase();
          var preview = (chat.lastMessage || '');
          preview = preview.replace(/```[\s\S]*?```/g, '[code]').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*#_~>]/g, '');
          preview = preview.length > 60 ? preview.substring(0, 60) + '\u2026' : preview;
          
          var timeStr = '';
          if (chat.lastTime) {
            var d = new Date(chat.lastTime);
            var now = new Date();
            timeStr = d.toDateString() === now.toDateString()
              ? d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
              : d.toLocaleDateString([], {month:'short', day:'numeric'});
          }
          
          html += '<div class="search-result-item" onclick="OrbitHome._onChatClick(\'' + chatId + '\')">';
          html += '  <div class="search-result-avatar">' + (chat.avatar ? '<img src="' + chat.avatar + '">' : OrbitHome._escape(initial)) + '</div>';
          html += '  <div class="search-result-body">';
          html += '    <div class="search-result-name">' + OrbitHome._highlightText(displayName, query) + '</div>';
          html += '    <div class="search-result-preview">' + OrbitHome._highlightText(preview, query) + '</div>';
          html += '  </div>';
          html += '  <div class="search-result-suffix">' + timeStr + '</div>';
          html += '</div>';
        });
      }
      
      if (section.type === 'friends') {
        section.items.forEach(function(f) {
          var fName = f.name || f.peerId || 'Unknown';
          var fInitial = fName.charAt(0).toUpperCase();
          var fStatus = f.status || 'offline';
          var statusColors = { online: 'var(--accent-success)', away: 'var(--accent-warning)', dnd: 'var(--accent-danger)', invisible: 'var(--text-muted)' };
          var statusDot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + (statusColors[fStatus] || 'var(--text-muted)') + ';margin-right:4px;vertical-align:middle;"></span>';
          
          html += '<div class="search-result-item" onclick="OrbitHome._onStartDM(\'' + (f.id || '') + '\')">';
          html += '  <div class="search-result-avatar">' + (f.avatar ? '<img src="' + f.avatar + '">' : OrbitHome._escape(fInitial)) + '</div>';
          html += '  <div class="search-result-body">';
          html += '    <div class="search-result-name">' + OrbitHome._highlightText(fName, query) + '</div>';
          html += '    <div class="search-result-preview">' + statusDot + fStatus.charAt(0).toUpperCase() + fStatus.slice(1) + '</div>';
          html += '  </div>';
          html += '  <span class="search-result-tag">Friend</span>';
          html += '</div>';
        });
      }
      
      if (section.type === 'messages') {
        section.items.forEach(function(m) {
          var chatName = m.chat.name || m.chat.peerId || 'Chat';
          var msgText = m.message.text || '';
          msgText = msgText.length > 80 ? msgText.substring(0, 80) + '\u2026' : msgText;
          
          html += '<div class="search-result-item" onclick="OrbitHome._onChatClick(\'' + (m.chat.id || m.chat.chatId) + '\')">';
          html += '  <div class="search-result-body">';
          html += '    <div class="search-result-name">' + OrbitHome._highlightText(chatName, query) + '</div>';
          html += '    <div class="search-result-preview">\u201c' + OrbitHome._highlightText(msgText, query) + '\u201d</div>';
          html += '  </div>';
          html += '  <span class="search-result-tag">Message</span>';
          html += '</div>';
        });
      }
      
      html += '</div>';
    });
    
    if (totalCount === 0) {
      html += '<div class="empty-state enhanced" style="padding-top:40px;"><i data-lucide="search-x"></i><div class="empty-state-text">No results</div><div class="empty-state-sub">Try a different search term</div></div>';
    }
    
    return html;
  },

  _onChatClick: function(chatId) {
    if (window.openChat) {
      window.openChat(chatId);
    }
  },

  /** Render the friends list */
  renderFriendsList: function() {
    var container = document.getElementById('friends-list');
    if (!container) return;
    
    var friends = MStore.friends || [];
    if (friends.length === 0) {
      container.innerHTML = '<div class="empty-state"><i data-lucide="users"></i><div class="empty-state-text">No friends yet</div><div class="empty-state-sub">Add friends by scanning QR or entering their IP</div></div>';
      return;
    }
    
    // Sort online first
    friends.sort(function(a, b) {
      var aOnline = (a.status === 'online' || a.lastSeen > Date.now() - 45000) ? 1 : 0;
      var bOnline = (b.status === 'online' || b.lastSeen > Date.now() - 45000) ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;
      return (a.name || '').localeCompare(b.name || '');
    });
    
    var html = '';
    friends.forEach(function(friend) {
      var displayName = friend.name || friend.peerId || 'Unknown';
      var initial = displayName.charAt(0).toUpperCase();
      var avatarHtml = friend.avatar 
        ? '<img src="' + friend.avatar + '" alt="' + initial + '" loading="lazy" onerror="var f=this;f.onerror=null;var i=f.getAttribute(\'data-init\')||\'' + initial + '\';f.style.display=\'none\';var d=document.createElement(\'div\');d.textContent=i;d.style.cssText=\'width:40px;height:40px;border-radius:50%;background:var(--accent-soft);color:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;\';f.parentNode.insertBefore(d,f);" data-init="' + initial + '">'
        : initial;
      var isOnline = friend.status === 'online' || friend.lastSeen > Date.now() - 45000;
      var statusColor = isOnline ? 'var(--accent-success)' : 'var(--text-muted)';
      
      html += '<div class="friend-row" data-peerid="' + (friend.peerId || '') + '" onclick="OrbitHome._onFriendClick(\'' + (friend.peerId || '') + '\')">';
      html += '  <div class="chat-row-avatar">' + avatarHtml + '</div>';
      html += '  <div class="chat-row-info">';
      html += '    <div class="chat-row-name">' + OrbitHome._escape(displayName) + '</div>';
      html += '    <span class="friend-status-dot" style="background:' + statusColor + ';display:inline-block;width:8px;height:8px;border-radius:50%;margin-top:4px;"></span>';
      html += '  </div>';
      html += '</div>';
    });
    
    container.innerHTML = html;
    this._addAvatarFrames();
  },

  /** Add profile frame overlays to friend avatars that have one selected */
  _addAvatarFrames: function() {
    var avatarEls = document.querySelectorAll('.chat-row-avatar, .online-friend-avatar');
    var groupIds = {};
    (MStore.groups || []).forEach(function(g) { groupIds[g.id || g.groupId] = true; });
    var friends = MStore.friends || [];
    
    avatarEls.forEach(function(el) {
      // Skip if frame already exists
      if (el.querySelector('.pfp-frame')) return;
      
      // Find the peer ID from the parent row
      var row = el.closest('[data-peerid], [data-chatid]');
      if (!row) return;
      var id = row.getAttribute('data-peerid') || row.getAttribute('data-chatid');
      if (!id) return;
      
      // Skip groups
      if (groupIds[id]) return;
      
      // Find friend by matching id, peerId, or chat id
      var pfNum = 0;
      var rawPeerId = id.replace('dm_', '');
      for (var fi = 0; fi < friends.length; fi++) {
        var f = friends[fi];
        if (f.id === rawPeerId || f.peerId === rawPeerId || f.peerId === id) {
          pfNum = parseInt(f.profileFrame, 10) || 0;
          break;
        }
      }
      
      if (pfNum > 0) {
        var frameEl = document.createElement('img');
        frameEl.className = 'pfp-frame';
        frameEl.draggable = false;
        frameEl.alt = '';
        frameEl.style.cssText = 'position:absolute;top:-16%;left:-16%;pointer-events:none;z-index:5;width:125%;height:125%;';
        frameEl.src = 'icons/frames/pfp_frame_' + pfNum + '.png';
        el.appendChild(frameEl);
      }
    });
  },

  /** Show 3-item quick action menu (New Group / Add Contact / Scan QR) */
  showQuickSheet: function() {
    if (typeof OrbitSheet === 'undefined') return;
    OrbitSheet.show([
      { icon: 'users', label: 'New Group', subtext: 'Create or join a group', action: 'new-group' },
      { icon: 'user-plus', label: 'Add Contact', subtext: 'Connect with a friend', action: 'add-contact' },
      { icon: 'scan-qr-code', label: 'Scan QR', subtext: 'Scan a QR code to connect', action: 'scan-qr' }
    ]);
    OrbitSheet._callbacks = {
      'new-group': function() {
        if (window.showCreateGroup) window.showCreateGroup();
      },
      'add-contact': function() {
        if (window.showAddFriendModal) window.showAddFriendModal();
      },
      'scan-qr': function() {
        OrbitSheet.hide();
        setTimeout(function() {
          var scanner = document.getElementById('qr-scanner-overlay');
          if (scanner) scanner.style.display = 'flex';
          if (window.startQRScanner) window.startQRScanner();
        }, 200);
      }
    };
  },

  /** Start a DM from search results */
  _onStartDM: function(peerId) {
    if (!peerId) return;
    var chatId = 'dm_' + peerId;
    if (typeof window.openChat === 'function') {
      window.openChat(chatId);
    } else if (typeof openChat === 'function') {
      openChat(chatId);
    }
  },

  /** Render recent searches in the chat list area */
  renderRecentSearches: function() {
    var container = document.getElementById("chat-list");
    if (!container) return;
    var recent = (MStore.settings && MStore.settings.recentSearches) || [];
    if (!recent.length) {
      container.innerHTML = "<div class=\"empty-state enhanced\" style=\"padding-top:30px;\"><i data-lucide=\"search\"></i><div class=\"empty-state-text\">Search chats, friends & messages</div><div class=\"empty-state-sub\">Type to find conversations, people, or past messages</div></div>";
      return;
    }
    var html = "<div class=\"recent-searches-header\"><span>Recent Searches</span><button id=\"btn-clear-recent-searches\">Clear</button></div>";
    recent.forEach(function(s) {
      var escaped = (function(str) {
        var d = document.createElement("div");
        d.appendChild(document.createTextNode(str));
        return d.innerHTML;
      })(s);
      html += "<div class=\"recent-search-item\" data-query=\"" + escaped + "\"><i data-lucide=\"clock\"></i><span>" + escaped + "</span></div>";
    });
    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
    
    // Wire click on recent search items
    container.querySelectorAll(".recent-search-item").forEach(function(el) {
      el.addEventListener("click", function() {
        var q = this.getAttribute("data-query");
        var input = document.getElementById("home-search-input");
        if (input) {
          input.value = q;
          window._chatSearchQuery = q.toLowerCase();
          if (window.renderChatList) window.renderChatList();
        }
      });
    });
    
    // Wire clear button
    var clearBtn = document.getElementById("btn-clear-recent-searches");
    if (clearBtn) {
      clearBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        if (MStore.settings) MStore.settings.recentSearches = [];
        MStore.save();
        OrbitHome.renderRecentSearches();
      });
    }
  },

  /** Clear all recent searches */
  clearRecentSearches: function() {
    if (MStore.settings) MStore.settings.recentSearches = [];
    MStore.save();
    this.renderRecentSearches();
  },
};


// --- Event Wiring (runs on DOM ready) ---
document.addEventListener('DOMContentLoaded', function() {
  // Override window.renderChatList with v0.2.8 version (app.js exports a different one)
  window.renderChatList = function(filter) { OrbitHome.renderChatList(filter); };

  // Online friends click delegation
  document.getElementById('online-friends-row').addEventListener('click', function(e) {
    var item = e.target.closest('.online-friend-item');
    if (!item) return;
    
    // + button (Quick Add) — open tabbed sheet
    if (item.id === 'btn-add-quick-online') {
      OrbitHome.showQuickSheet();
      return;
    }
    
    // "More" button
    if (item.id === 'online-friends-more-btn') {
      var container = document.getElementById('online-friends-row');
      if (container) {
        container.dataset.showAll = 'true';
        OrbitHome.renderOnlineFriends();
      }
      return;
    }
    
    // Friend click - open DM
    var peerId = item.getAttribute('data-peerid');
    if (!peerId) return;
    var chats = MStore.chats || [];
    var chat = null;
    for (var i = 0; i < chats.length; i++) {
      if (chats[i].peerId === peerId || chats[i].id === peerId) {
        chat = chats[i];
        break;
      }
    }
    if (!chat) {
      var friends = MStore.friends || [];
      var friend = null;
      for (var i = 0; i < friends.length; i++) {
        if (friends[i].peerId === peerId || friends[i].id === peerId) {
          friend = friends[i];
          break;
        }
      }
      if (friend) {
        chat = {
          id: peerId,
          peerId: friend.peerId || peerId,
          name: friend.name || peerId,
          type: 'dm',
          messages: []
        };
        MStore.chats.push(chat);
        MStore.save();
      }
    }
    if (chat) {
      if (typeof window.openChat === 'function') {
        window.openChat(chat.id);
      }
    }
  });
  
  // Wire home tabs (Friends | Groups)
  document.querySelectorAll('.home-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      var tabName = this.dataset.tab;
      
      // Update active state
      document.querySelectorAll('.home-tab').forEach(function(t) {
        t.classList.toggle('active', t.dataset.tab === tabName);
      });
      
      // Re-render chat list with filter
      if (window.renderChatList) {
        window.renderChatList(tabName);
      }
    });
  });
  
  // Wire quick-add button — open tabbed sheet
  var addQuick = document.getElementById('btn-add-quick');
  if (addQuick) {
    addQuick.addEventListener('click', function() {
      OrbitHome.showQuickSheet();
    });
  }

  // Wire search button toggle
  var searchBtn = document.getElementById('btn-search-home');
  if (searchBtn) {
    searchBtn.addEventListener('click', function() {
      var searchInline = document.getElementById('home-search-inline');
      var searchInput = document.getElementById('home-search-input');
      if (searchInline && searchInput) {
        var isOpen = searchInline.classList.contains('open');
        if (isOpen) {
          searchInline.classList.remove('open');
          searchInput.blur();
        } else {
          searchInline.classList.add('open');
          setTimeout(function() { searchInput.focus(); }, 100);
        }
      }
    });
  }
  
  // Wire home search input — shows recent searches on focus, results on type
  var homeSearchInput = document.getElementById('home-search-input');
  if (homeSearchInput) {
    homeSearchInput.addEventListener('focus', function() {
      if (!this.value.trim()) {
        OrbitHome.renderRecentSearches();
      }
    });
    homeSearchInput.addEventListener('input', function() {
      var val = this.value.trim().toLowerCase();
      window._chatSearchQuery = val;
      if (window.renderChatList) window.renderChatList();
    });
  }
  
  // Wire search close button
  var searchClose = document.getElementById('btn-home-search-close');
  if (searchClose) {
    searchClose.addEventListener('click', function() {
      var searchInline = document.getElementById('home-search-inline');
      var searchInput = document.getElementById('home-search-input');
      if (searchInline) searchInline.classList.remove('open');
      if (searchInput) {
        searchInput.value = '';
        searchInput.blur();
      }
      window._chatSearchQuery = '';
      if (window.renderChatList) window.renderChatList();
    });
  }

  // Initial render with v0.2.8 components
  OrbitHome.renderChatList('friends');
});

// Online friends filter tag clicks
document.addEventListener('click', function(e) {
  var tag = e.target.closest('.online-filter-tag');
  if (!tag) return;
  var filter = tag.dataset.filter;
  document.querySelectorAll('.online-filter-tag').forEach(function(t) {
    t.classList.toggle('active', t.dataset.filter === filter);
  });
  window._onlineFriendFilter = filter;
  var container = document.getElementById('online-friends-row');
  if (container) container.dataset.filter = filter;
  var onlineFriendsSection = document.getElementById('online-friends-section');
  if (onlineFriendsSection) {
    OrbitHome.renderOnlineFriends();
  }
});
