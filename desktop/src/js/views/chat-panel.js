// src/js/views/chat-panel.js

window.ChatPanel = {
  init() {
    this.container = document.getElementById('chat-container');
    this.stagedFiles = [];
    this.replyingTo = null; // { id, sender, text }
    this.editingMsg = null; // { id, chatId, text }
    
    // Delegated click handler — attached ONCE in init

    // Link preview click delegation
    document.addEventListener('click', function(e) {
      var lp = e.target.closest('.link-preview');
      if (lp) {
        var url = lp.getAttribute('data-url');
        if (url) window.open(url, '_blank');
      }
    });
    this.initDelegatedActions();
    
    // Subscribe to store
    this.unsubscribe = window.store.subscribe((state, changedState) => {
      var relevant = ['messages', 'activeChatId', 'activeTab', 'groups', 'currentUser', 'settings'];
      if (!changedState || relevant.some(function(k) { return k in changedState; })) {
        // Prevent interrupting audio/video playback during re-renders
        var savedAudio = null;
        var savedVideo = null;
        var isAudioPlaying = window.OrbitAudioPlayer && window.OrbitAudioPlayer.isAnyPlaying && window.OrbitAudioPlayer.isAnyPlaying();
        var isVideoPlaying = window.OrbitVideoPlayer && window.OrbitVideoPlayer.isAnyPlaying && window.OrbitVideoPlayer.isAnyPlaying();
        if (isAudioPlaying || isVideoPlaying) {
          if (!changedState || !('activeChatId' in changedState)) {
            if (isAudioPlaying && window.OrbitAudioPlayer.savePlaying) savedAudio = window.OrbitAudioPlayer.savePlaying();
            if (isVideoPlaying && window.OrbitVideoPlayer.savePlaying) savedVideo = window.OrbitVideoPlayer.savePlaying();
          }
        }
        if (changedState && 'activeChatId' in changedState && state.activeChatId) {
          window.store.loadFullChatMessages(state.activeChatId);
        }
        this.renderChat(state);
        if (savedAudio && window.OrbitAudioPlayer.restorePlaying) window.OrbitAudioPlayer.restorePlaying(savedAudio);
        if (savedVideo && window.OrbitVideoPlayer.restorePlaying) window.OrbitVideoPlayer.restorePlaying(savedVideo);
      }
    });

    // Load full messages for the initial active chat
    var initialId = window.store.getState().activeChatId;
    if (initialId) window.store.loadFullChatMessages(initialId);

    this.render();
    this.attachEvents();
    
    // Initial render
    this.renderChat(window.store.getState());
  },

  initDelegatedActions() {
    var self = this;
    this.container.addEventListener('click', function(e) {
      if (e.target.closest('#btn-cancel-reply')) {
        self.replyingTo = null;
        var bar = document.getElementById('reply-edit-bar');
        if (bar) bar.remove();
        return;
      }
      if (e.target.closest('#btn-cancel-edit')) {
        self.editingMsg = null;
        var inp = document.getElementById('chat-input');
        if (inp) inp.value = '';
        window.store.notify();
        return;
      }
      
      // React
      var reactBtn = e.target.closest('.msg-react-btn');
      if (reactBtn) {
        e.stopPropagation();
        var msgId = reactBtn.getAttribute('data-msg-id');
        var rect = reactBtn.getBoundingClientRect();
        self.showReactionPicker(rect.left, rect.bottom, msgId);
        return;
      }

      // Reply
      var replyBtn = e.target.closest('.msg-reply-btn');
      if (replyBtn) {
        var msgId = replyBtn.getAttribute('data-msg-id');
        var state = window.store.getState();
        var msgList = state.messages[state.activeChatId] || [];
        var msg = msgList.find(function(m) { return m.id == msgId; });
        if (msg) {
          var friendName = state.friends.find(function(f) { return f.userId === state.activeChatId; });
          self.replyingTo = { id: msg.id, text: msg.text, senderName: msg.sender === state.currentUser.userId ? 'You' : (friendName ? friendName.username : 'User') };
          self.editingMsg = null;
          var inp = document.getElementById('chat-input');
          if (inp) inp.focus();
          window.store.notify();
        }
        return;
      }
      
      // Edit
      var editBtn = e.target.closest('.msg-edit-btn');
      if (editBtn) {
        var msgId = editBtn.getAttribute('data-msg-id');
        var state = window.store.getState();
        var msgList = state.messages[state.activeChatId] || [];
        var msg = msgList.find(function(m) { return m.id == msgId; });
        if (msg) {
          self.editingMsg = { id: msg.id, chatId: state.activeChatId, text: msg.text };
          self.replyingTo = null;
          var inp = document.getElementById('chat-input');
          if (inp) {
            inp.value = msg.text;
            inp.focus();
          }
          window.store.notify();
        }
        return;
      }
      
      // Translate
      var translateBtn = e.target.closest('.msg-translate-btn');
      if (translateBtn) {
        var msgId = translateBtn.getAttribute('data-msg-id');
        var state = window.store.getState();
        var msgList = state.messages[state.activeChatId] || [];
        var msg = msgList.find(function(m) { return m.id == msgId; });
        if (msg && msg.text) {
          var bubble = document.querySelector('.message-bubble[data-msg-id="' + msgId + '"]');
          if (bubble) {
            var existing = bubble.querySelector('.translated-text');
            if (existing) {
              existing.remove();
              return;
            }
            var targetLang = state.settings.translateTargetLang || (navigator.language || 'en').split('-')[0] || 'en';
            var useAuto = state.settings.autoDetectSource;
            var div = document.createElement('div');
            div.className = 'translated-text';
            div.style.cssText = 'font-size:11px;color:var(--text-muted);border-top:1px solid var(--border-subtle);margin-top:6px;padding-top:6px;';
            div.textContent = 'Translating...';
            bubble.appendChild(div);

            // Check cache first
            if (!window._translationCache) window._translationCache = new Map();
            if (!window._pendingTranslations) window._pendingTranslations = new Map();
            if (!window._translationAbort) window._translationAbort = new Map();

            var cacheKey = msg.text + '|' + targetLang + '|' + (useAuto ? 'auto' : 'en');
            var cached = window._translationCache.get(cacheKey);
            if (cached) {
              div.textContent = '🌐 ' + cached;
              return;
            }

            // Check if a request for the same text+lang is already in flight
            var pending = window._pendingTranslations.get(cacheKey);
            if (pending) {
              pending.then(function(result) {
                if (div && div.parentNode) div.textContent = '🌐 ' + result;
              }).catch(function() {
                if (div && div.parentNode) div.textContent = 'Translation failed';
              });
              return;
            }

            var abortController = new AbortController();
            window._translationAbort.set(cacheKey, abortController);

            function showError(sourceUsed) {
              if (!div || !div.parentNode) return;
              div.innerHTML = '<span>Translation failed</span>' +
                ' <span class="translate-retry" data-cachekey="' + cacheKey.replace(/"/g, '&quot;') + '" data-source="' + sourceUsed + '" data-msgid="' + msgId + '" style="cursor:pointer;text-decoration:underline;color:var(--accent-primary);margin-left:4px;">Retry</span>';
              var retryEl = div.querySelector('.translate-retry');
              if (retryEl) {
                retryEl.addEventListener('click', function(ev) {
                  ev.stopPropagation();
                  var src = retryEl.getAttribute('data-source');
                  var ckey = retryEl.getAttribute('data-cachekey');
                  window._translationCache.delete(ckey);
                  window._pendingTranslations.delete(ckey);
                  if (div && div.parentNode) {
                    div.textContent = 'Translating...';
                    tryTranslate(src, true);
                  }
                });
              }
            }

            function tryTranslate(source, isRetry) {
              var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(msg.text) + '&langpair=' + source + '|' + targetLang;
              var signal = abortController.signal;
              var fetchPromise = fetch(url, { signal: signal }).then(function(r) { return r.json(); }).then(function(data) {
                if (data && data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
                  window._translationCache.set(cacheKey, data.responseData.translatedText);
                  if (div && div.parentNode) div.textContent = '🌐 ' + data.responseData.translatedText;
                } else if (source === 'auto' && !isRetry) {
                  return tryTranslate('en', false);
                } else {
                  showError(source);
                }
              }).catch(function(err) {
                if (err && err.name === 'AbortError') return;
                if (source === 'auto' && !isRetry) {
                  return tryTranslate('en', false);
                } else {
                  showError(source);
                }
              });
              window._pendingTranslations.set(cacheKey, fetchPromise);
              fetchPromise.finally(function() {
                window._pendingTranslations.delete(cacheKey);
                window._translationAbort.delete(cacheKey);
              });
              return fetchPromise;
            }

            tryTranslate(useAuto ? 'auto' : 'en', false);
          }
        }
        return;
      }
      
      // Forward
      var forwardBtn = e.target.closest('.msg-forward-btn');
      if (forwardBtn) {
        e.stopPropagation();
        self.showForwardModal(forwardBtn.getAttribute('data-msg-id'));
        return;
      }

      // Pinned messages bar
      var btnUnpinAll = e.target.closest('#btn-unpin-all');
      if (btnUnpinAll) {
        var chatId = window.store.getState().activeChatId;
        var pinnedMsgs = window.store.getPinnedMessages(chatId);
        pinnedMsgs.forEach(function(p) {
          window.store.sendUnpinMessage(chatId, p.msgId);
        });
        return;
      }
      // Click pinned message text to jump to it
      var pinnedText = e.target.closest('#pinned-messages-text');
      if (pinnedText) {
        var chatId = window.store.getState().activeChatId;
        var pinnedMsgs = window.store.getPinnedMessages(chatId);
        if (pinnedMsgs.length > 0) {
          var msgId = pinnedMsgs[0].msgId;
          setTimeout(function() {
            var el = document.querySelector('[data-msg-id="' + msgId + '"]');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
        }
        return;
      }

      function broadcastToChat(chatId, type, payload) {
        var s = window.store.getState();
        var g = s.groups.find(function(g) { return g.groupId === chatId; });
        if (g) {
          payload.chatId = chatId;
          (g.members || []).forEach(function(m) {
            if (m.userId !== s.currentUser.userId) {
              window.orbitAPI.networkSend(m.userId, m.ip || '', type, payload);
            }
          });
        } else {
          var friend = s.friends.find(function(f) { return f.userId === chatId; });
          if (friend) {
            window.orbitAPI.networkSend(chatId, friend.ip || '', type, payload);
          }
        }
      }
      
      // Delete
      var deleteBtn = e.target.closest('.msg-delete-btn');
      if (deleteBtn) {
        if (window.ConfirmModal) {
          window.ConfirmModal.show({
            title: 'Delete Message',
            message: 'Are you sure you want to delete this message? This action cannot be undone.',
            confirmText: 'Delete',
            danger: true,
            onConfirm: function() {
              var msgId = deleteBtn.getAttribute('data-msg-id');
              var isMine = deleteBtn.getAttribute('data-is-mine') === '1';
              var state = window.store.getState();
              var activeChatId = state.activeChatId;
              
              if (isMine && window.orbitAPI && activeChatId !== 'local-echo') {
                broadcastToChat(activeChatId, window.Protocol.Types.MESSAGE_DELETE, { msgId: msgId });
              }
              window.store.deleteMessage(activeChatId, msgId);
            }
          });
        }
        return;
      }
      
      // File remove in preview area
      var removeBtn = e.target.closest('.btn-remove-file');
      if (removeBtn) {
        const idx = parseInt(removeBtn.getAttribute('data-index'));
        const removed = self.stagedFiles.splice(idx, 1)[0];
        if (removed && removed.url) URL.revokeObjectURL(removed.url);
        self.renderPreviewArea();
        return;
      }

      // Attachment delete
      var attDeleteBtn = e.target.closest('.att-delete-btn');
      if (attDeleteBtn) {
        e.stopPropagation();
        if (window.ConfirmModal) {
          window.ConfirmModal.show({
            title: 'Delete Attachment',
            message: 'Are you sure you want to delete this attachment locally?',
            confirmText: 'Delete',
            danger: true,
            onConfirm: function() {
              var attId = attDeleteBtn.getAttribute('data-att-id');
              var msgId = attDeleteBtn.getAttribute('data-msg-id');
              if (window.orbitAPI) window.orbitAPI.dbDeleteAttachment(attId);
              
              var state = window.store.getState();
              var activeChatId = state.activeChatId;
              var msgList = state.messages[activeChatId] || [];
              var msg = msgList.find(function(m) { return m.id == msgId; });
              if (msg && msg.attachments) {
                msg.attachments = msg.attachments.filter(function(a) { return String(a.id) !== String(attId); });
                window.store.setState({ messages: state.messages });
              }
            }
          });
        }
        return;
      }
      
      // Invite code chip click
      var inviteChip = e.target.closest('[data-invite-code]');
      if (inviteChip) {
        e.stopPropagation();
        var code = inviteChip.getAttribute('data-invite-code');
        if (code && window.SidebarMiddle) window.SidebarMiddle.showCreateGroupModal(code);
        return;
      }
      
      // Reply preview click — scroll to original message
      var replyPreview = e.target.closest('[data-reply-msg-id]');
      if (replyPreview) {
        var targetId = replyPreview.getAttribute('data-reply-msg-id');
        if (targetId) {
          var el = document.querySelector('[data-msg-id="' + targetId.replace(/"/g, '') + '"].message-row');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
      
      // Image attachment click — open in viewer
      var imageDiv = e.target.closest('[data-open-image]');
      if (!imageDiv) {
        var imgs = document.querySelectorAll('[data-open-image]');
        for (var i = 0; i < imgs.length; i++) {
          var r = imgs[i].getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            imageDiv = imgs[i];
            break;
          }
        }
      }
      if (imageDiv) {
        e.stopPropagation();
        var attId = imageDiv.getAttribute('data-open-image');
        var msgId = imageDiv.getAttribute('data-msg-id');
        if (window.ImageViewer) window.ImageViewer.openFromMessage(msgId, attId);
        return;
      }

      // Reaction pill toggle
      var pill = e.target.closest('.reaction-pill');
      if (pill) {
        e.stopPropagation();
        var msgId = pill.getAttribute('data-msg-id');
        var emoji = pill.getAttribute('data-emoji');
        var state = window.store.getState();
        var chatId = state.activeChatId;
        var msg = (state.messages[chatId] || []).find(function(m) { return String(m.id) === msgId; });
        if (!msg) return;
        var hasReacted = msg.reactions && msg.reactions.some(function(r) { return r.emoji === emoji && r.userId === state.currentUser.userId; });
        window.store.sendReaction(chatId, msgId, emoji, hasReacted ? 'remove' : 'add');
        return;
      }

      // Header avatar click
      var headerAvatar = e.target.closest('.chat-header-avatar');
      if (headerAvatar) {
        e.stopPropagation();
        var state = window.store.getState();
        var activeFriend = state.friends.find(function(f) { return f.userId === state.activeChatId; });
        if (activeFriend && window.ProfileSidebar) window.ProfileSidebar.open(activeFriend);
        return;
      }

      // Cancel transfer
      var cancelBtn = e.target.closest('.btn-cancel-transfer');
      if (cancelBtn) {
        var fid = cancelBtn.getAttribute('data-file-id');
        if (window.orbitAPI && window.orbitAPI.cancelTransfer) {
          window.orbitAPI.cancelTransfer(fid);
        }
        var cp = { ...window.store.getState().transferProgress };
        delete cp[fid];
        window.store.setState({ transferProgress: cp });
        return;
      }

      // Dismiss error
      var dismissBtn = e.target.closest('.btn-dismiss-error');
      if (dismissBtn) {
        var fid = dismissBtn.getAttribute('data-file-id');
        var errs = { ...window.store.getState().transferErrors };
        delete errs[fid];
        window.store.setState({ transferErrors: errs });
        return;
      }

      // Per-message avatar click → open ProfileSidebar
      var avatarEl = e.target.closest('.msg-avatar');
      if (avatarEl) {
        var userId = avatarEl.getAttribute('data-user-id');
        if (!userId) return;
        var state = window.store.getState();
        var user = state.friends.find(function(f) { return f.userId === userId; });
        if (!user) {
          var group = state.groups.find(function(g) { return g.groupId === state.activeChatId; });
          if (group) {
            user = group.members.find(function(m) { return m.userId === userId; });
          }
        }
        if (userId === state.currentUser.userId) {
          user = state.currentUser;
        }
        if (user && window.ProfileSidebar) window.ProfileSidebar.open(user);
        return;
      }
    });
    // Context menu delegation for message bubbles
    this.container.addEventListener('contextmenu', function(e) {
      var bubble = e.target.closest('.message-bubble');
      if (!bubble || !window.ContextMenu) return;
      e.preventDefault();
      var msgId = bubble.getAttribute('data-msg-id');
      var state = window.store.getState();
      var msgs = state.messages[state.activeChatId] || [];
      var msg = msgs.find(function(m) { return m.id == msgId; });
      if (!msg) return;
      var isMine = msg.sender === state.currentUser.userId;
      var items = [
        { label: 'Reply', action: 'reply', icon: 'corner-up-left', onClick: function() {
          var friendName = state.friends.find(function(f) { return f.userId === state.activeChatId; });
          self.replyingTo = { id: msg.id, text: msg.text, senderName: msg.sender === state.currentUser.userId ? 'You' : (friendName ? friendName.username : 'User') };
          self.editingMsg = null;
          var input = document.getElementById('chat-input');
          if (input) input.focus();
          window.store.notify();
        } },
        { label: 'Copy Text', action: 'copy', icon: 'copy', onClick: function() {
          var text = msg.text || '';
          if (window.orbitAPI && window.orbitAPI.writeClipboard) {
            window.orbitAPI.writeClipboard(text);
          } else {
            navigator.clipboard.writeText(text).catch(function(e) { console.warn('Clipboard write failed', e); });
          }
        } },
        { label: 'Forward', action: 'forward', icon: 'send', onClick: function() {
          self.showForwardModal(msg.id);
        } },
      ];
      var pinnedMsgs = window.store.getPinnedMessages(state.activeChatId);
      var isPinned = pinnedMsgs.some(function(p) { return String(p.msgId) === String(msg.id); });
      if (isPinned) {
        items.push({ label: 'Unpin Message', action: 'unpin', icon: 'pin-off', onClick: function() {
          window.store.sendUnpinMessage(state.activeChatId, msg.id);
        } });
      } else {
        items.push({ label: 'Pin Message', action: 'pin', icon: 'pin', onClick: function() {
          window.store.sendPinMessage(state.activeChatId, msg.id);
        } });
      }
      if (!isMine) {
        var isBlocked = window.store.isUserBlocked(msg.sender);
        items.push('separator');
        items.push({ label: isBlocked ? 'Unblock User' : 'Block User', action: isBlocked ? 'unblock' : 'block', icon: isBlocked ? 'user-check' : 'ban', color: isBlocked ? 'var(--accent-success)' : 'var(--accent-danger)', onClick: function() {
          if (isBlocked) {
            window.store.unblockUser(msg.sender);
          } else {
            window.store.blockUser(msg.sender);
          }
        } });
      }
      if (isMine) {
        items.push('separator');
        items.push({ label: 'Edit Message', action: 'edit', icon: 'edit-2', onClick: function() {
          var state = window.store.getState();
          var msgs = state.messages[state.activeChatId] || [];
          var targetMsg = msgs.find(function(m) { return m.id == msg.id; });
          if (targetMsg) {
            self.editingMsg = { id: targetMsg.id, chatId: state.activeChatId, text: targetMsg.text };
            self.replyingTo = null;
            var inp = document.getElementById('chat-input');
            if (inp) { inp.value = targetMsg.text; inp.focus(); }
            window.store.notify();
          }
        } });
        items.push({ label: 'Delete Message', action: 'delete', icon: 'trash-2', color: 'var(--accent-danger)', onClick: function() { 
          window.store.deleteMessage(state.activeChatId, msg.id);
        } });
      }
      if (window.ContextMenu.show) window.ContextMenu.show(e.clientX, e.clientY, items);
    });
  },

  render() {
    // Don't show the empty state if we're not in DMs mode
    const state = window.store.getState();
    if (state.activeTab !== 'dms') {
      this.container.style.display = 'none';
      return;
    }

    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';

    this.container.innerHTML = `
      <!-- Initial Empty State -->
      <div style="flex:1; display:flex; align-items:center; justify-content:center; color: var(--text-muted); flex-direction:column; gap:16px;">
        <i data-lucide="message-circle" style="width:48px;height:48px;opacity:0.3;"></i>
        <span>Select a friend to start chatting</span>
      </div>
    `;
    lucide.createIcons({ root: this.container });
  },

  renderChat(state) {
    if (state.activeTab !== 'dms') {
      this.container.style.display = 'none';
      return;
    }

    if (!state.activeChatId) {
      this.render();
      return;
    }

    const activeFriend = state.friends.find(f => f.userId === state.activeChatId);
    const activeGroup = state.groups.find(g => g.groupId === state.activeChatId);
    const isGroup = !!activeGroup;
    const activeName = isGroup ? activeGroup.groupName : (activeFriend ? activeFriend.username : 'Chat');
    if (!activeFriend && !isGroup) return;

    const messages = state.messages[state.activeChatId] || [];
    const myId = state.currentUser.userId;

    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';

    let messagesHtml = '';

    // Find last read message index for unread divider
    const lastReadId = state.lastReadIds && state.lastReadIds[state.activeChatId];
    let lastReadIdx = -1;
    if (lastReadId) {
      lastReadIdx = messages.findIndex(function(m) { return String(m.id) === String(lastReadId); });
    }
    let hasUnreadInFeed = false;

    for (var mi = 0; mi < messages.length; mi++) {
      var msg = messages[mi];

      // Insert unread divider before the first unread message
      if (lastReadIdx >= 0 && mi === lastReadIdx + 1) {
        hasUnreadInFeed = true;
        messagesHtml += '<div class="unread-divider" style="display:flex;align-items:center;gap:12px;margin:16px 0;position:relative;">' +
          '<div style="flex:1;height:1px;background:var(--accent-primary);opacity:0.3;"></div>' +
          '<span style="font-size:11px;font-weight:700;color:var(--accent-primary);text-transform:uppercase;letter-spacing:0.5px;">Unread Messages</span>' +
          '<div style="flex:1;height:1px;background:var(--accent-primary);opacity:0.3;"></div>' +
        '</div>';
      }
      // If no lastReadId but there are messages with unread counts, show divider at start
      if (lastReadIdx < 0 && mi === 0 && state.unreadCounts[state.activeChatId] && messages.length > 0) {
        hasUnreadInFeed = true;
        messagesHtml += '<div class="unread-divider" style="display:flex;align-items:center;gap:12px;margin:16px 0;position:relative;">' +
          '<div style="flex:1;height:1px;background:var(--accent-primary);opacity:0.3;"></div>' +
          '<span style="font-size:11px;font-weight:700;color:var(--accent-primary);text-transform:uppercase;letter-spacing:0.5px;">Unread Messages</span>' +
          '<div style="flex:1;height:1px;background:var(--accent-primary);opacity:0.3;"></div>' +
        '</div>';
      }

      const isMine = msg.sender === myId;
      const timeStr = window.Format.absoluteTime(msg.timestamp).split(' · ')[0];
      var sanitizedText = window.Sanitize.markdown(msg.text);
      // Make known invite codes clickable
      if (sanitizedText && state.groups) {
        state.groups.forEach(function(g) {
          if (g.inviteCode && sanitizedText.indexOf(g.inviteCode) !== -1) {
            var groupName = window.Sanitize.escapeHtml(g.groupName || 'Group');
            sanitizedText = sanitizedText.split(g.inviteCode).join(
              '<span data-invite-code="' + window.Sanitize.escapeHtml(g.inviteCode) + '" style="display:inline-flex;align-items:center;gap:6px;background:var(--bg-hover);border-radius:6px;padding:2px 8px;font-family:var(--font-mono);font-size:12px;cursor:pointer;border:1px solid var(--border-subtle);color:var(--accent-primary);" title="Click to join ' + groupName + '">' + window.Sanitize.escapeHtml(g.inviteCode) + ' <span style="font-size:10px;background:var(--accent-primary);color:white;border-radius:4px;padding:1px 5px;font-family:var(--font-ui);">Join</span></span>'
            );
          }
        });
      }
      const editedBadge = msg.edited ? '<span style="font-size:11px;color:rgba(255,255,255,0.5);margin-left:6px;">(edited)</span>' : '';
      const editedBadgeOther = msg.edited ? '<span style="font-size:11px;color:var(--text-muted);margin-left:6px;">(edited)</span>' : '';

      // Reactions display
      let reactionsHtml = '';
      if (msg.reactions && msg.reactions.length > 0) {
        const grouped = {};
        msg.reactions.forEach(r => {
          if (!grouped[r.emoji]) grouped[r.emoji] = [];
          grouped[r.emoji].push(r.userId);
        });
        const entries = Object.entries(grouped);
        reactionsHtml = '<div class="reactions-row" style="display:flex;gap:4px;flex-wrap:wrap;">';
        entries.forEach(([emoji, users]) => {
          const userMention = users.length <= 2 ? users.map(u => u === myId ? 'You' : u.substring(0, 6)).join(', ') : users.length + ' people';
          const hasReacted = users.includes(myId);
          reactionsHtml += '<div class="reaction-pill" data-msg-id="' + msg.id + '" data-emoji="' + window.Sanitize.escapeHtml(emoji) + '" data-debug="Reaction: ' + window.Sanitize.escapeHtml(emoji) + ' (' + users.length + ')" style="display:flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;background:' + (hasReacted ? 'var(--accent-primary)' : 'var(--bg-hover)') + ';border:1px solid ' + (hasReacted ? 'var(--accent-primary)' : 'var(--border-subtle)') + ';font-size:12px;cursor:pointer;" title="' + window.Sanitize.escapeHtml(userMention) + '">' +
            '<span>' + emoji + '</span>' +
            '<span style="color:' + (hasReacted ? 'white' : 'var(--text-secondary)') + ';font-size:11px;">' + users.length + '</span>' +
          '</div>';
        });
        reactionsHtml += '</div>';
      }

      // Reply quote
      let replyHtml = '';
      if (msg.replyTo) {
        const origMsg = messages.find(m => m.id == msg.replyTo);
        if (origMsg) {
          const replyPreview = (origMsg.text || '').substring(0, 60) + (origMsg.text && origMsg.text.length > 60 ? '...' : '');
          const replyUser = origMsg.sender === myId ? 'You' : window.Sanitize.escapeHtml(activeFriend.username);
          replyHtml = '<div data-reply-msg-id="' + origMsg.id + '" style="font-size:12px;padding:6px 10px;margin-bottom:6px;border-left:3px solid rgba(255,255,255,0.3);border-radius:4px;background:rgba(0,0,0,0.1);color:rgba(255,255,255,0.7);cursor:pointer;">' +
            '<span style="font-weight:600;">' + replyUser + '</span> ' + window.Sanitize.escapeHtml(replyPreview) +
          '</div>';
        }
      }

      let attachmentsHtml = '';
      if (msg.attachments && msg.attachments.length > 0) {
        // Determine uniform aspect ratio for image attachments
        var imageAtts = msg.attachments.filter(function(a) { return a.type === 'image'; });
        var imageAspectRatio = null;
        if (imageAtts.length > 0) {
          var allHaveDim = imageAtts.every(function(a) { return a.width && a.height; });
          if (!allHaveDim) {
            imageAspectRatio = 1;
          } else if (imageAtts.length === 1) {
            var a = imageAtts[0];
            imageAspectRatio = a.width / a.height;
          } else {
            var ratios = imageAtts.map(function(a) { return a.width / a.height; });
            var first = ratios[0];
            var allSame = ratios.every(function(r) { return Math.abs(r - first) < 0.01; });
            imageAspectRatio = allSame ? first : 1;
          }
        }

        var arStyle = imageAspectRatio ? 'aspect-ratio:' + imageAspectRatio + ';' : 'height:120px;';

        let gridHtml = '';
        let largeHtml = '';
        msg.attachments.forEach(att => {
          const safeAttId = window.Sanitize.escapeHtml(String(att.id || ''));
          const deleteBtn = '<button class="att-delete-btn" data-att-id="' + safeAttId + '" data-msg-id="' + msg.id + '" style="position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,0.6);border:none;color:white;cursor:pointer;align-items:center;justify-content:center;font-size:14px;line-height:1;z-index:2;" title="Delete">×</button>';
          if (att.type === 'video' || (att.mimeType && att.mimeType.startsWith('video/'))) {
            const safeUrl = window.Sanitize.escapeHtml(att.url);
            largeHtml += '<div class="att-thumb ovp-placeholder" data-ovp-url="' + safeUrl + '" style="position:relative;border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-hover); overflow: hidden; max-width:720px;">' +
              deleteBtn +
            '</div>';
          } else if (att.type === 'audio' || (att.mimeType && att.mimeType.startsWith('audio/'))) {
            const safeUrl = window.Sanitize.escapeHtml(att.url);
            largeHtml += '<div class="att-thumb oap-placeholder" data-oap-url="' + safeUrl + '" style="position:relative;border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-hover); overflow: hidden; max-width:720px;">' +
              deleteBtn +
            '</div>';
          } else if (att.type === 'image') {
            if (state.settings.showImagePreviews !== false) {
              const safeUrl = window.Sanitize.escapeHtml(att.url);
              const safeName = window.Sanitize.escapeHtml(String(att.name || 'Image'));
              const safeSize = window.Sanitize.escapeHtml(String(att.size || 0));
              gridHtml += '<div class="att-thumb" style="position:relative;border-radius: 8px; overflow: hidden; ' + arStyle + ' border: 1px solid var(--border-subtle); cursor:pointer;" data-open-image="' + safeAttId + '" data-msg-id="' + msg.id + '">' + deleteBtn + '<img src="' + safeUrl + '" style="width: 100%; height: 100%; object-fit: cover;" onerror="if(window.handleMediaError) window.handleMediaError(this, \'' + safeUrl + '\')"></div>';
            } else {
              gridHtml += '<div class="att-thumb" style="position:relative;border-radius: 8px; height: 120px; border: 1px solid var(--border-subtle); display:flex; flex-direction:column; align-items:center; justify-content:center; background: rgba(0,0,0,0.1); padding: 8px; text-align:center;">' +
                deleteBtn +
                '<i data-lucide="image" style="width:32px;height:32px;margin-bottom:8px;color:var(--text-muted);"></i>' +
                '<div style="font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">' + window.Sanitize.escapeHtml(String(att.name || 'Image')) + '</div>' +
              '</div>';
            }
          } else {
            gridHtml += '<div class="att-thumb" style="position:relative;border-radius: 8px; height: 120px; border: 1px solid var(--border-subtle); display:flex; flex-direction:column; align-items:center; justify-content:center; background: rgba(0,0,0,0.1); padding: 8px; text-align:center;">' +
              deleteBtn +
              '<i data-lucide="file" style="width:32px;height:32px;margin-bottom:8px;color:var(--text-muted);"></i>' +
              '<div style="font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">' + window.Sanitize.escapeHtml(String(att.name || 'File')) + '</div>' +
            '</div>';
          }
        });
        var gridSection = gridHtml ? '<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; width: 100%; min-width: 250px; max-width: 280px;">' + gridHtml + '</div>' : '';
        attachmentsHtml = (gridSection ? gridSection + '<div style="height:8px;"></div>' : '') + largeHtml;
      }

      // Hover action bar
      const actionBtns =
        '<button class="msg-action-btn msg-reply-btn" data-msg-id="' + msg.id + '" title="Reply"><i data-lucide="reply" style="width:16px;height:16px;"></i></button>' +
        '<button class="msg-action-btn msg-react-btn" data-msg-id="' + msg.id + '" data-msg-text="' + window.Sanitize.escapeHtml(msg.text || '').replace(/"/g, '&quot;') + '" title="React"><i data-lucide="smile-plus" style="width:16px;height:16px;"></i></button>' +
        '<button class="msg-action-btn msg-forward-btn" data-msg-id="' + msg.id + '" title="Forward"><i data-lucide="send" style="width:16px;height:16px;"></i></button>' +
        (isMine ? '<button class="msg-action-btn msg-edit-btn" data-msg-id="' + msg.id + '" title="Edit"><i data-lucide="pencil" style="width:16px;height:16px;"></i></button>' : '') +
        (state.settings.messageTranslate ? '<button class="msg-action-btn msg-translate-btn" data-msg-id="' + msg.id + '" title="Translate"><i data-lucide="languages" style="width:16px;height:16px;"></i></button>' : '') +
        '<button class="msg-action-btn msg-delete-btn" data-msg-id="' + msg.id + '" data-is-mine="' + (isMine ? '1' : '0') + '" title="Delete"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>';

      const actionsBar = '<div class="msg-actions-bar' + (isMine ? ' msg-actions-left' : ' msg-actions-right') + '">' + actionBtns + '</div>';

      const bubblePadding = (sanitizedText || attachmentsHtml) ? 'padding: 10px 14px;' : 'padding: 0;';
      const bubbleBgMine = (sanitizedText || attachmentsHtml) ? 'background-color: var(--accent-primary); color: white; box-shadow: var(--shadow-sm);' : 'background: transparent;';
      const bubbleBgOther = (sanitizedText || attachmentsHtml) ? 'background-color: var(--bg-surface); box-shadow: var(--shadow-sm);' : 'background: transparent;';

      // Link Preview detection
      let linkPreviewHtml = '';
      if (msg.text && window.store.getState().settings.showLinkPreviews !== false) {
        var urlMatch = msg.text.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
          var url = urlMatch[1];
          var domain = '';
          try { domain = new URL(url).hostname; } catch(e) { domain = url; }
          var dataUrl = window.Sanitize.escapeHtml(url);
          linkPreviewHtml = '<div class="link-preview' + (isMine ? ' link-preview-mine' : '') + '" data-url="' + dataUrl + '" data-og-loaded="false">' +
            '<div class="link-preview-img"><i data-lucide="link-2" style="width:20px;height:20px;"></i></div>' +
            '<div class="link-preview-body">' +
              '<div class="link-preview-title">' + window.Sanitize.escapeHtml(domain) + '</div>' +
              '<div class="link-preview-url">' + dataUrl + '</div>' +
            '</div>' +
          '</div>';
        }
      }

      var showAvatars = state.settings.showChatAvatars !== false;
        if (isMine) {
        var myFrame = window.Frames.getFrameForUser(state.currentUser.userId);
        const myAvatarImg = state.currentUser.avatar
          ? '<img src="' + window.Sanitize.escapeHtml(state.currentUser.avatar) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">'
          : '<i data-lucide="user" style="width:14px;"></i>';
        var myAvatarContainer = '<div style="position:relative;display:inline-block;">' + myAvatarImg + (myFrame ? '<img src="icons/frames/pfp_frame_' + myFrame + '.png" style="position:absolute;top:-21%;left:-17%;width:133%;height:133%;pointer-events:none;object-fit:contain;" draggable="false" alt="">' : '') + '</div>';
        const senderName = '';
        // Check if message has been read
        var readReceipts = state.readReceipts || {};
        var chatReadReceipts = readReceipts[state.activeChatId] || {};
        var isRead = false;
        if (!isGroup) {
          isRead = Object.values(chatReadReceipts).some(function(lastId) { return String(msg.id) <= String(lastId); });
        }
        var readHtml = isRead ? '<span style="font-size:10px;color:var(--accent-primary);margin-left:4px;">✓✓</span>' : '';

        messagesHtml += '<div class="message-row message-own" data-msg-id="' + msg.id + '" data-debug="MsgID: ' + msg.id + ' Sender: ' + window.Sanitize.escapeHtml(msg.sender) + ' TS: ' + msg.timestamp + '" style="display:flex; margin-bottom: var(--spacing-md); flex-direction: row-reverse; align-items: flex-end;">' +
          '<div style="padding-bottom: 10px; display:' + (showAvatars ? 'flex' : 'none') + ';">' +
            '<div class="avatar avatar-sm msg-avatar" data-user-id="' + state.currentUser.userId + '" style="margin-left: var(--spacing-sm); flex-shrink: 0; cursor:pointer;">' + myAvatarContainer + '</div>' +
          '</div>' +
          '<div style="max-width: 65%; display:flex; flex-direction:column; align-items:flex-end;">' +
            senderName +
            '<div class="message-bubble" data-msg-id="' + msg.id + '" data-debug="Bubble: ' + msg.id + '" style="position:relative;' + bubbleBgMine + ' ' + bubblePadding + ' border-radius: 16px 16px 0 16px; line-height: 1.4; font-size: 14px; cursor:context-menu; max-width: 100%;">' +
              '<div class="message-id" style="display:none;font-size:9px;font-family:monospace;color:rgba(255,255,255,0.4);margin-bottom:2px;">#' + String(msg.id).substring(0, 8) + '</div>' +
            actionsBar + replyHtml + attachmentsHtml + '<div class="msg-text">' + sanitizedText + '</div>' + linkPreviewHtml + editedBadge +
            (reactionsHtml ? '<div style="border-top:1px solid rgba(255,255,255,0.15);margin-top:8px;padding-top:6px;">' + reactionsHtml + '</div>' : '') +
          '</div>' +
          '<div style="font-size: 12px; color: var(--text-muted); margin-top: 4px; align-self: flex-start; margin-left: 4px;">' + timeStr + readHtml + '</div>' +
          '</div>' +
        '</div>';
      } else {
        const sender = msg.sender === state.currentUser.userId ? state.currentUser : (isGroup ? null : activeFriend);
        let senderName = isGroup ? 'Unknown' : window.Sanitize.escapeHtml(activeFriend.username);
        let senderAvatar = isGroup ? null : (activeFriend.avatar || null);

        if (isGroup) {
          // Look up sender in group members
          const member = activeGroup.members.find(function(m) { return m.userId === msg.sender; });
          if (member) {
            senderName = window.Sanitize.escapeHtml(member.username);
            senderAvatar = member.avatar || null;
          } else {
            // Look up in friends list as fallback
            const friend = state.friends.find(function(f) { return f.userId === msg.sender; });
            if (friend) {
              senderName = window.Sanitize.escapeHtml(friend.username);
              senderAvatar = friend.avatar || null;
            }
          }
        }

        var senderFrame = window.Frames.getFrameForUser(msg.sender);
        var avatarImg = senderAvatar
          ? '<img src="' + window.Sanitize.escapeHtml(senderAvatar) + '" style="width:100%;height:100%;border-radius:50%;">'
          : '<i data-lucide="user" style="width:14px;"></i>';
        var otherAvatarContainer = '<div style="position:relative;display:inline-block;">' + avatarImg + (senderFrame ? '<img src="icons/frames/pfp_frame_' + senderFrame + '.png" style="position:absolute;top:-21%;left:-17%;width:133%;height:133%;pointer-events:none;object-fit:contain;" draggable="false" alt="">' : '') + '</div>';
        messagesHtml += '<div class="message-row" data-msg-id="' + msg.id + '" data-debug="MsgID: ' + msg.id + ' Sender: ' + window.Sanitize.escapeHtml(msg.sender) + ' TS: ' + msg.timestamp + '" style="display:flex; margin-bottom: var(--spacing-md);">' +
          '<div class="avatar avatar-sm msg-avatar" data-user-id="' + msg.sender + '" style="margin-right: var(--spacing-sm); margin-top: 4px; flex-shrink: 0; cursor:pointer;' + (showAvatars ? '' : 'display:none;') + '">' + otherAvatarContainer + '</div>' +
          '<div style="max-width: 65%; display:flex; flex-direction:column; align-items:flex-start;">' +
            '<div style="font-size: 11px; color: var(--text-secondary); font-weight: 500; margin-bottom: 2px; margin-left: 4px;">' + senderName + '</div>' +
            '<div class="message-bubble" data-msg-id="' + msg.id + '" data-debug="Bubble: ' + msg.id + '" style="position:relative;' + bubbleBgOther + ' ' + bubblePadding + ' border-radius: 0 16px 16px 16px; line-height: 1.4; font-size: 14px; cursor:context-menu; max-width: 100%;">' +
              '<div class="message-id" style="display:none;font-size:9px;font-family:monospace;color:var(--text-muted);margin-bottom:2px;">#' + String(msg.id).substring(0, 8) + '</div>' +
              actionsBar + replyHtml + attachmentsHtml + '<div class="msg-text">' + sanitizedText + '</div>' + linkPreviewHtml + editedBadgeOther +
              (reactionsHtml ? '<div style="border-top:1px solid var(--border-subtle);margin-top:8px;padding-top:6px;">' + reactionsHtml + '</div>' : '') +
            '</div>' +
            '<div style="font-size: 12px; color: var(--text-muted); margin-top: 4px; align-self: flex-end; margin-right: 4px;">' + timeStr + '</div>' +
          '</div>' +
        '</div>';
      }
    }

    // Show Jump to Unread button if there are unread messages
    if (hasUnreadInFeed || state.unreadCounts[state.activeChatId]) {
      hasUnreadInFeed = true;
    }

    // Empty state for chats with no messages
    if (!messagesHtml) {
      var isFirstMessageWithFriend = activeFriend && !isGroup && (!state.messages[state.activeChatId] || state.messages[state.activeChatId].length === 0);
      if (isFirstMessageWithFriend) {
        messagesHtml = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted);text-align:center;gap:8px;padding:40px;">' +
          '<i data-lucide="message-circle" style="width:40px;height:40px;opacity:0.3;"></i>' +
          '<div style="font-size:15px;font-weight:500;color:var(--text-secondary);">No messages yet</div>' +
          '<div style="font-size:13px;">Send a message to start the conversation</div>' +
        '</div>';
      } else if (isGroup) {
        messagesHtml = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted);text-align:center;gap:8px;padding:40px;">' +
          '<i data-lucide="users" style="width:40px;height:40px;opacity:0.3;"></i>' +
          '<div style="font-size:15px;font-weight:500;color:var(--text-secondary);">Welcome to ' + window.Sanitize.escapeHtml(activeGroup.groupName) + '</div>' +
          '<div style="font-size:13px;">Send the first message to the group</div>' +
        '</div>';
      }
    }

    // Header
    var headerHtml = '';
    if (isGroup) {
      var memberCount = (activeGroup.members || []).length;
      headerHtml =
        '<div class="avatar avatar-md" style="margin-right: var(--spacing-md); display:flex; align-items:center; justify-content:center;">' +
          (activeGroup.avatarPath
            ? '<img src="orbit-avatar://' + window.Sanitize.escapeHtml(activeGroup.groupId) + '?t=' + (activeGroup.avatarUpdatedAt || 0) + '" style="width:40px;height:40px;border-radius:12px;object-fit:cover;">'
            : '<div style="display:flex;align-items:center;justify-content:center;background:var(--accent-primary);border-radius:12px;width:40px;height:40px;font-weight:700;color:white;font-size:16px;">' + window.Sanitize.escapeHtml(activeGroup.groupName.charAt(0).toUpperCase()) + '</div>'
          ) +
        '</div>' +
        '<div style="flex:1;">' +
          '<div style="font-weight: 600; font-family: var(--font-display); font-size: 16px;">' + window.Sanitize.escapeHtml(activeGroup.groupName) + '</div>' +
          '<div id="group-member-count" style="font-size: 12px; color: var(--text-muted); cursor:pointer;">' + memberCount + ' member' + (memberCount !== 1 ? 's' : '') + '</div>' +
        '</div>';
    } else {
      var statusColors = { online: 'var(--accent-success)', away: 'var(--accent-warning)', busy: 'var(--accent-danger)', dnd: 'var(--accent-danger)', offline: 'var(--text-muted)', invisible: 'var(--text-muted)' };
      var statusLabels = { online: 'Online', away: 'Away', busy: 'Busy', dnd: 'Do Not Disturb', invisible: 'Invisible', offline: 'Offline' };
      var friendStatus = activeFriend.status || 'offline';
      var statusColor = statusColors[friendStatus] || 'var(--text-muted)';
      var statusLabel = statusLabels[friendStatus] || 'Offline';
      var lastSeenText = '';
      if (friendStatus === 'offline' && activeFriend.lastSeen) {
        var lastSeenStr = window.Format.relativeTime ? window.Format.relativeTime(new Date(activeFriend.lastSeen).toISOString()) : '';
        lastSeenText = lastSeenStr ? ' · Last seen ' + lastSeenStr : '';
      }
      var headerAvatar = activeFriend.avatar
        ? '<img src="' + window.Sanitize.escapeHtml(activeFriend.avatar) + '" style="width:100%;height:100%;border-radius:50%;">'
        : '<i data-lucide="user"></i>';
      headerHtml =
        '<div class="avatar avatar-md chat-header-avatar" style="margin-right: var(--spacing-md); position:relative; cursor:pointer;">' +
          headerAvatar +
          '<div class="status-indicator ' + window.Sanitize.escapeHtml(friendStatus) + '"></div>' +
        '</div>' +
        '<div style="flex:1;">' +
          '<div style="font-weight: 600; font-family: var(--font-display); font-size: 16px;">' + window.Sanitize.escapeHtml(activeFriend.username) + '</div>' +
          '<div style="font-size: 12px; color: ' + statusColor + '; display:flex; align-items:center; gap:4px;">' +
            '<div style="width:6px;height:6px;background:' + statusColor + ';border-radius:50%;"></div> ' + window.Sanitize.escapeHtml(statusLabel) + window.Sanitize.escapeHtml(lastSeenText) +
          '</div>' +
        '</div>';
    }

    // Inline progress — rendered inside the message feed
    var progressHtml = '';
    if (state.transferProgress && Object.keys(state.transferProgress).length > 0) {
      progressHtml = '<div class="transfer-progress-inline" style="display:flex;flex-direction:column;gap:8px;padding:4px 0;">';
      Object.keys(state.transferProgress).forEach(function(fileId) {
        const prog = state.transferProgress[fileId];
        const pct = Math.max(0, Math.min(100, Math.floor((prog.received / prog.total) * 100)));
        const fileName = prog.name || (prog.isSending ? 'Sending file...' : 'Receiving file...');
        const icon = prog.isSending ? 'upload-cloud' : 'download-cloud';
        progressHtml += '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--border-subtle);box-shadow:var(--shadow-sm);">' +
          '<i data-lucide="' + icon + '" style="width:20px;height:20px;color:var(--accent-primary);flex-shrink:0;"></i>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:4px;">' +
              '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window.Sanitize.escapeHtml(fileName) + '</span>' +
              '<span style="flex-shrink:0;margin-left:8px;">' + pct + '%</span>' +
            '</div>' +
            '<div style="width:100%;height:6px;background:var(--bg-hover);border-radius:3px;overflow:hidden;">' +
              '<div style="height:100%;width:' + pct + '%;background:var(--accent-primary);transition:width 0.2s linear;border-radius:3px;"></div>' +
            '</div>' +
          '</div>' +
          '<button class="btn-cancel-transfer" data-file-id="' + fileId + '" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px;border-radius:6px;flex-shrink:0;" title="Cancel transfer">' +
            '<i data-lucide="x" style="width:16px;height:16px;"></i>' +
          '</button>' +
        '</div>';
      });
      progressHtml += '</div>';
    }

    // Transfer errors
    var errorsHtml = '';
    if (state.transferErrors && Object.keys(state.transferErrors).length > 0) {
      errorsHtml = '<div class="transfer-errors" style="display:flex;flex-direction:column;gap:8px;padding:4px 0;">';
      Object.keys(state.transferErrors).forEach(function(fileId) {
        const err = state.transferErrors[fileId];
        errorsHtml += '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--accent-danger);box-shadow:var(--shadow-sm);">' +
          '<i data-lucide="alert-circle" style="width:20px;height:20px;color:var(--accent-danger);flex-shrink:0;"></i>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:12px;color:var(--accent-danger);font-weight:600;">Failed: ' + window.Sanitize.escapeHtml(err.name || 'file') + '</div>' +
            '<div style="font-size:11px;color:var(--text-muted);">' + window.Sanitize.escapeHtml(err.error) + '</div>' +
          '</div>' +
          '<button class="btn-dismiss-error" data-file-id="' + fileId + '" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px;border-radius:6px;flex-shrink:0;" title="Dismiss">' +
            '<i data-lucide="x" style="width:16px;height:16px;"></i>' +
          '</button>' +
        '</div>';
      });
      errorsHtml += '</div>';
    }

    this.container.innerHTML =
      '<!-- Chat Header -->' +
      '<div class="chat-header" style="height: 64px; border-bottom: 1px solid var(--border-subtle); display:flex; align-items:center; padding: 0 var(--spacing-lg);">' +
        headerHtml +
        '<div style="display:flex; gap:16px; align-items:center; color: var(--text-secondary);">' +
          (state.settings && state.settings.privacyMode ? '<span style="font-size:10px;font-weight:700;color:#fff;background:var(--accent-warning);border-radius:3px;padding:2px 6px;text-transform:uppercase;">Privacy</span>' : '') +
          '<button id="btn-gallery" title="Image Gallery" style="background:transparent; border:none; cursor:pointer; color:inherit;"><i data-lucide="image"></i></button>' +
          (isGroup ? '<button id="btn-group-info" title="Group Info" style="background:transparent; border:none; cursor:pointer; color:inherit;"><i data-lucide="info"></i></button>' : '') +
          '<button id="btn-chat-more" title="More" style="background:transparent; border:none; cursor:pointer; color:inherit;"><i data-lucide="more-vertical"></i></button>' +
        '</div>' +
      '</div>' +
      '<!-- Pinned Messages Bar -->' +
      '<div id="pinned-messages-bar" style="display:none;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid var(--border-subtle);background:var(--bg-hover);font-size:13px;color:var(--text-secondary);">' +
        '<i data-lucide="pin" style="width:14px;height:14px;flex-shrink:0;transform:rotate(45deg);"></i>' +
        '<span id="pinned-messages-text" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>' +
        '<button id="btn-unpin-all" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px;font-size:18px;line-height:1;" title="Unpin all">×</button>' +
      '</div>' +
      '<!-- Message Feed -->' +
      '<div class="message-feed" id="chat-message-feed" style="flex:1; overflow-y:auto; overflow-x:visible; padding: var(--spacing-lg);">' +
        messagesHtml + progressHtml + errorsHtml +
        '<div id="jump-to-unread" class="jump-to-unread" style="' + (hasUnreadInFeed ? '' : 'display:none;') + 'position:sticky;bottom:8px;left:50%;transform:translateX(-50%);z-index:10;" title="Jump to first unread">' +
          '<button style="background:var(--accent-primary);color:#fff;border:none;border-radius:20px;padding:6px 16px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(0,0,0,0.3);" onclick="window.ChatPanel.jumpToFirstUnread()">' +
            '<i data-lucide="arrow-down" style="width:14px;height:14px;"></i> Jump to first unread' +
          '</button>' +
        '</div>' +
      '</div>';
    // Reply/Edit preview bar
    let replyEditBar = '';
    if (this.replyingTo) {
      const rText = (this.replyingTo.text || '').substring(0, 80);
      replyEditBar = '<div id="reply-edit-bar" style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:4px;border-radius:12px;background:var(--bg-hover);border:1px solid var(--border-subtle);font-size:13px;color:var(--text-secondary);">' +
        '<i data-lucide="reply" style="width:14px;height:14px;flex-shrink:0;"></i>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Replying to <b>' + window.Sanitize.escapeHtml(this.replyingTo.senderName || 'message') + '</b>: ' + window.Sanitize.escapeHtml(rText) + '</span>' +
        '<button id="btn-cancel-reply" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px;">✕</button>' +
      '</div>';
    } else if (this.editingMsg) {
      replyEditBar = '<div id="reply-edit-bar" style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:4px;border-radius:12px;background:rgba(255,170,0,0.1);border:1px solid rgba(255,170,0,0.3);font-size:13px;color:var(--text-secondary);">' +
        '<i data-lucide="pencil" style="width:14px;height:14px;flex-shrink:0;color:#ffaa00;"></i>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Editing message</span>' +
        '<button id="btn-cancel-edit" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px;">✕</button>' +
      '</div>';
    }

    // Typing indicator placeholder (filled by listener)
    var typingHtml = '<div id="typing-indicator" style="display:none;align-items:center;gap:8px;padding:4px 12px;font-size:12px;color:var(--text-muted);">' +
        '<div class="typing-dots" style="display:flex;align-items:center;gap:2px;">' +
          '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>' +
        '</div>' +
        '<span id="typing-text"></span>' +
      '</div>';

    this.container.insertAdjacentHTML('beforeend',
      '<!-- Chat Input -->' +
      '<div class="chat-input-area" style="padding: var(--spacing-md) var(--spacing-lg) 48px var(--spacing-lg); display: flex; flex-direction: column;">' +
        '<div id="file-preview-area" style="display:none; gap: 8px; padding: 12px; margin-bottom: 8px; overflow-x: auto; white-space: nowrap; border-radius: 16px; background: var(--bg-hover); border: 1px solid var(--border-subtle);"></div>' +
        replyEditBar +
        typingHtml +
        '<div class="chat-input-wrapper">' +
          '<button id="btn-plus"><i data-lucide="plus-circle"></i></button>' +
          '<input type="text" id="chat-input" class="chat-input-field" placeholder="Message ' + window.Sanitize.escapeHtml(activeName) + '..."' + (this.editingMsg ? ' value="' + window.Sanitize.escapeHtml(this.editingMsg.text) + '"' : '') + '>' +
          '<button id="btn-mic" title="Voice Memo (Click to start/stop)"><i data-lucide="mic"></i></button>' +
          '<button id="btn-emoji"><i data-lucide="smile"></i></button>' +
          '<button id="btn-send"><i data-lucide="send"></i></button>' +
          '<input type="file" id="file-input" style="display:none;" multiple>' +
        '</div>' +
      '</div>');

    lucide.createIcons({ root: this.container });

    if (window.freezeGifImages) window.freezeGifImages(this.container);

    // Link Preview OG fetch
    if (!window._linkPreviewCache) window._linkPreviewCache = {};
    var previews = this.container.querySelectorAll('.link-preview[data-og-loaded="false"]');
    previews.forEach(function(el) {
      var url = el.getAttribute('data-url');
      if (!url) return;
      if (window._linkPreviewCache[url]) {
        applyOgData(el, window._linkPreviewCache[url]);
        return;
      }
      if (window.orbitAPI && window.orbitAPI.invoke) {
        window.orbitAPI.invoke('fetch-og', url).then(function(og) {
          if (og && og.url) {
            window._linkPreviewCache[og.url] = og;
            applyOgData(el, og);
          }
        }).catch(function() {});
      }
    });

    // Pinned messages bar
    var pinnedBar = document.getElementById('pinned-messages-bar');
    if (pinnedBar) {
      var pinnedMsgs = window.store.getPinnedMessages(state.activeChatId);
      if (pinnedMsgs.length > 0) {
        pinnedBar.style.display = 'flex';
        var textEl = document.getElementById('pinned-messages-text');
        if (textEl) {
          var labels = pinnedMsgs.map(function(p) {
            var preview = (p.text || '').substring(0, 50);
            return window.Sanitize.escapeHtml(preview);
          });
          if (labels.length === 1) {
            textEl.innerHTML = 'Pinned: "' + labels[0] + '"';
          } else if (labels.length === 2) {
            textEl.innerHTML = 'Pinned: "' + labels[0] + '" and "' + labels[1] + '"';
          } else {
            textEl.innerHTML = 'Pinned: "' + labels[0] + '", "' + labels[1] + '", and ' + (labels.length - 2) + ' more';
          }
        }
      } else {
        pinnedBar.style.display = 'none';
      }
    }

    // Inject message FX particles for own messages
    this._injectMessageParticles();

    // Auto scroll to bottom
    var feed = document.getElementById('chat-message-feed');
    if (feed) feed.scrollTop = feed.scrollHeight;

    // Jump-to-unread scroll listener
    if (feed) {
      var jumpBtn = document.getElementById('jump-to-unread');
      if (jumpBtn) {
        feed.removeEventListener('scroll', this._jumpScrollHandler);
        this._jumpScrollHandler = function() {
          var divider = feed.querySelector('.unread-divider');
          if (!divider) { jumpBtn.style.display = 'none'; return; }
          var feedRect = feed.getBoundingClientRect();
          var dividerRect = divider.getBoundingClientRect();
          // Hide button if divider is already visible or above the feed
          if (dividerRect.top < feedRect.bottom - 60) {
            jumpBtn.style.display = 'none';
          } else {
            jumpBtn.style.display = '';
          }
        };
        feed.addEventListener('scroll', this._jumpScrollHandler);
        // Initial check
        setTimeout(this._jumpScrollHandler, 100);
      }
    }

    // Set up ResizeObserver once to re-position on feed resize
    if (!this._messageActionsResizeObserver && typeof ResizeObserver !== 'undefined') {
      var self = this;
      this._messageActionsResizeObserver = new ResizeObserver(function() {
        if (window._performanceMode) return;
        var now = Date.now();
        if (self._lastMessageActionsRun && now - self._lastMessageActionsRun < 1000) return;
        if (self._messageActionsResizeTimer) clearTimeout(self._messageActionsResizeTimer);
        self._messageActionsResizeTimer = setTimeout(function() {
          self._positionMessageActions();
        }, 80);
      });
    }
    if (this._messageActionsResizeObserver) {
      var msgFeed = document.getElementById('chat-message-feed');
      if (msgFeed) this._messageActionsResizeObserver.observe(msgFeed);
    }

    if (!window._performanceMode) {
      requestAnimationFrame(function() {
        window.ChatPanel._positionMessageActions();
      });
    }

    // Attach local input events
    this.attachEvents();

    // Initialize audio player visualizers
    if (window.OrbitAudioPlayer) window.OrbitAudioPlayer.init(this.container);
    if (window.OrbitVideoPlayer) window.OrbitVideoPlayer.init(this.container);
  },

  _positionMessageActions() {
    if (window._performanceMode) return;
    var feed = document.getElementById('chat-message-feed');
    if (!feed) return;
    var bubbles = feed.querySelectorAll('.message-bubble');
    if (this._messageActionsResizeObserver) {
      try { this._messageActionsResizeObserver.disconnect(); } catch(e) {}
    }
    for (var i = 0; i < bubbles.length; i++) {
      var bubble = bubbles[i];
      var bar = bubble.querySelector('.msg-actions-bar');
      if (!bar) continue;
      var bubbleW = bubble.offsetWidth;
      var barW = bar.offsetWidth;
      var isCompact = barW > bubbleW - 4 || (bubbleW < 160 && !bubble.querySelector('.att-thumb'));
      bar.classList.remove('msg-actions-compact', 'msg-actions-wide');
      bar.classList.add(isCompact ? 'msg-actions-compact' : 'msg-actions-wide');
    }
    this._lastMessageActionsRun = Date.now();
    if (this._messageActionsResizeObserver && feed) {
      var f = feed;
      setTimeout(function() {
        try { window.ChatPanel._messageActionsResizeObserver.observe(f); } catch(e) {}
      }, 0);
    }
  },

  jumpToFirstUnread() {
    var feed = document.getElementById('chat-message-feed');
    if (!feed) return;
    var divider = feed.querySelector('.unread-divider');
    if (divider) {
      divider.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      // Fallback: scroll to bottom
      feed.scrollTop = feed.scrollHeight;
    }
  },

  attachEvents() {
    var self = this;
    var input = document.getElementById('chat-input');

    // Typing indicator listener (register once)
    if (!this._typingListenerRegistered) {
      this._typingListenerRegistered = true;
      if (window.TypingState) {
        window.TypingState.onChange(function() {
          var el = document.getElementById('typing-indicator');
          var textEl = document.getElementById('typing-text');
          if (!el || !textEl) return;
          var chatId = window.store.getState().activeChatId;
          if (!chatId) { el.style.display = 'none'; return; }
          var users = window.TypingState.getUsers(chatId);
          if (users.length === 0) {
            el.style.display = 'none';
          } else {
            var names = users.map(function(u) { return window.Sanitize.escapeHtml(u.username); });
            textEl.textContent = names.length === 1 ? names[0] + ' is typing...' : names.join(', ') + ' are typing...';
            el.style.display = 'flex';
          }
        });
      }
    }

    if (input) {
      // Typing indicator — send typing packets
      var typingTimeout = null;
      var lastTypingSent = 0;
      var sendTyping = function(isTyping) {
        var state = window.store.getState();
        var chatId = state.activeChatId;
        if (!chatId || chatId === 'local-echo') return;
        var members = state.groups.find(function(g) { return g.groupId === chatId; });
        var recipients = members ? members.members : [state.friends.find(function(f) { return f.userId === chatId; })].filter(Boolean);
        recipients.forEach(function(r) {
          if (r.userId !== state.currentUser.userId) {
            window.orbitAPI.networkSend(r.userId, r.ip || '', window.Protocol.Types.TYPING, { isTyping: isTyping, username: state.currentUser.username });
          }
        });
      };
      input.addEventListener('input', function() {
        var now = Date.now();
        if (now - lastTypingSent > 2000) {
          lastTypingSent = now;
          sendTyping(true);
        }
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(function() {
          sendTyping(false);
          typingTimeout = null;
        }, 3000);
      });
      input.addEventListener('blur', function() {
        if (typingTimeout) {
          clearTimeout(typingTimeout);
          typingTimeout = null;
        }
        sendTyping(false);
      });

      input.addEventListener('keydown', async function(e) {
        var enterSends = window.store.getState().settings.enterToSend !== false;
        if (e.key === 'Enter' && (enterSends ? !e.shiftKey : e.ctrlKey || e.metaKey)) {
          // Clear typing indicator when sending
          if (typingTimeout) {
            clearTimeout(typingTimeout);
            typingTimeout = null;
          }
          sendTyping(false);
          var text = input.value.trim();
          if (text !== '' || self.stagedFiles.length > 0) {
            await self.sendMessage(text);
            input.value = '';
          }
        }
      });
    }

    var btnEmoji = document.getElementById('btn-emoji');
    if (btnEmoji && window.EmojiPicker) {
      btnEmoji.addEventListener('click', function() {
        window.EmojiPicker.toggle(input);
      });
    }

    var btnSend = document.getElementById('btn-send');
    if (btnSend) {
      btnSend.addEventListener('click', async function() {
        var text = input.value.trim();
        if (text !== '' || self.stagedFiles.length > 0) {
          await self.sendMessage(text);
          input.value = '';
        }
      });
    }

    var btnMic = document.getElementById('btn-mic');
    if (btnMic) {
      btnMic.addEventListener('click', function() {
        if (self.mediaRecorder && self.mediaRecorder.state === 'recording') {
          self.mediaRecorder.stop();
          btnMic.style.color = '';
          btnMic.innerHTML = '<i data-lucide="mic"></i>';
          if (window.lucide) window.lucide.createIcons({ root: btnMic });
        } else {
          navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
            self.mediaRecorder = new MediaRecorder(stream);
            self.audioChunks = [];
            self.mediaRecorder.ondataavailable = function(e) {
              if (e.data.size > 0) self.audioChunks.push(e.data);
            };
            self.mediaRecorder.onstop = function() {
              stream.getTracks().forEach(track => track.stop());
              var blob = new Blob(self.audioChunks, { type: 'audio/webm' });
              if (blob.size > 0) {
                var file = new File([blob], 'VoiceMemo_' + Date.now() + '.webm', { type: 'audio/webm' });
                var entry = {
                  file: file,
                  path: file.name,
                  name: file.name,
                  size: file.size,
                  mimeType: file.type,
                  type: 'audio',
                  url: URL.createObjectURL(file),
                  width: 0,
                  height: 0
                };
                self.stagedFiles.push(entry);
                self.renderPreviewArea();
              }
            };
            self.mediaRecorder.start();
            btnMic.style.color = 'var(--accent-danger)';
            btnMic.innerHTML = '<i data-lucide="square" style="fill:var(--accent-danger);"></i>';
            if (window.lucide) window.lucide.createIcons({ root: btnMic });
          }).catch(function(err) {
            console.error('Microphone access denied or error:', err);
            if (window.Toast) window.Toast.show('Microphone Error', 'Could not access microphone: ' + err.message, 'error', 3000);
          });
        }
      });
    }

    var btnPlus = document.getElementById('btn-plus');
    var fileInput = document.getElementById('file-input');
    if (btnPlus && fileInput) {
      btnPlus.addEventListener('click', function(e) {
        e.stopPropagation();
        if (!window.ContextMenu) return;
        var rect = btnPlus.getBoundingClientRect();
        window.ContextMenu.show(rect.left, rect.top - 120, [
          { label: 'Upload Images', action: 'upload-image', icon: 'images', onClick: function() { 
            fileInput.accept = 'image/*'; 
            fileInput.removeAttribute('webkitdirectory'); 
            fileInput.click(); 
          } },
          { label: 'Upload Files', action: 'upload-file', icon: 'file', onClick: function() { 
            fileInput.removeAttribute('accept'); 
            fileInput.removeAttribute('webkitdirectory'); 
            fileInput.click(); 
          } },
          { label: 'Upload Folder', action: 'upload-folder', icon: 'folder', onClick: function() { 
            fileInput.removeAttribute('accept'); 
            fileInput.setAttribute('webkitdirectory', ''); 
            fileInput.click(); 
          } }
        ]);
      });
      
      fileInput.addEventListener('change', function(e) {
        if (!e.target.files || e.target.files.length === 0) return;
        
        for (let i = 0; i < e.target.files.length; i++) {
          const file = e.target.files[i];
          const ext = file.name.split('.').pop().toLowerCase();
          const vidExts = ['mp4','mov','avi','mkv','webm','3gp','m4v','wmv','flv'];
          const audExts = ['mp3','wav','ogg','flac','aac','m4a','wma','webm'];
          const isImage = file.type.startsWith('image/');
          const isVideo = file.type.startsWith('video/') || vidExts.indexOf(ext) !== -1;
          const isAudio = file.type.startsWith('audio/') || audExts.indexOf(ext) !== -1;
          var entry = {
            file: file,
            path: file.path || file.name,
            name: file.name,
            size: file.size,
            mimeType: file.type,
            type: isImage ? 'image' : (isVideo ? 'video' : (isAudio ? 'audio' : 'file')),
            url: isImage || isAudio || isVideo ? URL.createObjectURL(file) : null,
            width: 0,
            height: 0
          };
          self.stagedFiles.push(entry);

          if (isImage && entry.url) {
            (function(entry) {
              var img = new Image();
              img.onload = function() {
                entry.width = img.naturalWidth;
                entry.height = img.naturalHeight;
                URL.revokeObjectURL(img.src);
              };
              img.src = entry.url;
            })(entry);
          }
        }
        
        self.renderPreviewArea();
        fileInput.value = '';
      });
    }

    var btnChatMore = document.getElementById('btn-chat-more');
    if (btnChatMore) {
      btnChatMore.addEventListener('click', function(e) {
        e.stopPropagation();
        if (!window.ContextMenu) return;
        var rect = btnChatMore.getBoundingClientRect();
        window.ContextMenu.show(rect.left - 150, rect.bottom + 8, (function() {
          var s = window.store.getState();
          var isGroup = s.groups.some(function(g) { return g.groupId === s.activeChatId; });
          var items = [];
          if (isGroup) {
            items.push({ label: 'Voice Call', action: 'voice-call', icon: 'phone', onClick: function() { if (window.CallManager) window.CallManager.startGroupCall(false, window.store.getState().activeChatId); } });
            items.push({ label: 'Video Call', action: 'video-call', icon: 'video', onClick: function() { if (window.CallManager) window.CallManager.startGroupCall(true, window.store.getState().activeChatId); } });
          } else {
            items.push({ label: 'Voice Call', action: 'voice-call', icon: 'phone', onClick: function() { var s2 = window.store.getState(); var f = s2.friends.find(function(fr) { return fr.userId === s2.activeChatId; }); if (f && window.CallManager) window.CallManager.startCall(false, f.userId, f.ip); } });
            items.push({ label: 'Video Call', action: 'video-call', icon: 'video', onClick: function() { var s2 = window.store.getState(); var f = s2.friends.find(function(fr) { return fr.userId === s2.activeChatId; }); if (f && window.CallManager) window.CallManager.startCall(true, f.userId, f.ip); } });
          }
          items.push({ label: 'Search in Chat', action: 'search-chat', icon: 'message-square', onClick: function() { self.showSearchModal(null, window.store.getState().activeChatId); } });
          items.push({ label: 'Search', action: 'search', icon: 'search', onClick: function() { self.showSearchModal(); } });
          return items;
        })());
      });
    }

    var btnGallery = document.getElementById('btn-gallery');
    if (btnGallery && window.GallerySidebar) {
      btnGallery.addEventListener('click', function() {
        window.GallerySidebar.toggle();
      });
    }

    var btnGroupInfo = document.getElementById('btn-group-info');
    if (btnGroupInfo) {
      btnGroupInfo.addEventListener('click', function() {
        var s = window.store.getState();
        if (s.activeChatId && window.SidebarMiddle && window.SidebarMiddle.showGroupInfo) {
          window.SidebarMiddle.showGroupInfo(s.activeChatId);
        }
      });
    }

    var groupMemberCount = document.getElementById('group-member-count');
    if (groupMemberCount) {
      groupMemberCount.addEventListener('click', function() {
        var s = window.store.getState();
        if (s.activeChatId && window.SidebarMiddle && window.SidebarMiddle.showGroupInfo) {
          window.SidebarMiddle.showGroupInfo(s.activeChatId);
        }
      });
    }

    self.initSwipeToReply();

    // Cancel transfer buttons
    // Drag and drop file uploads
    this.container.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      self.container.classList.add('drag-active');
    });

    this.container.addEventListener('dragleave', function(e) {
      e.preventDefault();
      e.stopPropagation();
      self.container.classList.remove('drag-active');
    });

    this.container.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      self.container.classList.remove('drag-active');

      if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

      var state = window.store.getState();
      if (!state.activeChatId) {
        window.Toast.show('No Chat', 'Select a chat first');
        return;
      }

      for (var i = 0; i < e.dataTransfer.files.length; i++) {
        var file = e.dataTransfer.files[i];
        var ext = file.name.split('.').pop().toLowerCase();
        var vidExts = ['mp4','mov','avi','mkv','webm','3gp','m4v','wmv','flv'];
        var audExts = ['mp3','wav','ogg','flac','aac','m4a','wma','webm'];
        var isImage = file.type.startsWith('image/');
        var isVideo = file.type.startsWith('video/') || vidExts.indexOf(ext) !== -1;
        var isAudio = file.type.startsWith('audio/') || audExts.indexOf(ext) !== -1;
        self.stagedFiles.push({
          file: file,
          path: file.path || file.name,
          name: file.name,
          size: file.size,
          mimeType: file.type,
          type: isImage ? 'image' : (isVideo ? 'video' : (isAudio ? 'audio' : 'file')),
          url: isImage || isAudio || isVideo ? URL.createObjectURL(file) : null,
          width: 0,
          height: 0
        });
      }

      self.renderPreviewArea();
      window.Toast.show('Files Added', e.dataTransfer.files.length + ' file(s) staged for upload');
    });
  },

  getFileIcon(name, mimeType) {
    var ext = name.split('.').pop().toLowerCase();
    if (mimeType && mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (mimeType && (mimeType.includes('word') || mimeType.includes('document')) || ['doc','docx'].includes(ext)) return 'word';
    if (mimeType && (mimeType.includes('sheet') || mimeType.includes('excel')) || ['xls','xlsx','csv'].includes(ext)) return 'sheet';
    if (mimeType && (mimeType.includes('presentation') || mimeType.includes('powerpoint')) || ['ppt','pptx'].includes(ext)) return 'presentation';
    if (mimeType && (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || mimeType.includes('gzip') || mimeType.includes('7z')) || ['zip','rar','tar','gz','7z'].includes(ext)) return 'archive';
    if (['js','ts','py','java','cpp','c','h','cs','go','rs','rb','php','swift','kt','scala','html','css','json','xml','yaml','yml','toml','sh','bat','sql'].includes(ext)) return 'code';
    if (mimeType && mimeType.startsWith('audio/') || ['mp3','wav','ogg','flac','aac','wma','m4a'].includes(ext)) return 'audio';
    if (mimeType && mimeType.startsWith('video/') || ['mp4','avi','mkv','mov','wmv','webm','flv'].includes(ext)) return 'video';
    if (['txt','log','md'].includes(ext)) return 'text';
    return 'file';
  },

  getFileIconLucide(fileType) {
    var map = {
      image: 'file-image',
      pdf: 'file-text',
      word: 'file-text',
      sheet: 'file-spreadsheet',
      presentation: 'presentation',
      archive: 'file-archive',
      code: 'file-code',
      audio: 'music',
      video: 'video',
      text: 'file-text'
    };
    return map[fileType] || 'file';
  },

  renderPreviewArea() {
    const area = document.getElementById('file-preview-area');
    if (!area) return;
    
    if (this.stagedFiles.length === 0) {
      area.style.display = 'none';
      return;
    }
    
    area.style.display = 'flex';
    let html = '';
    this.stagedFiles.forEach((staged, index) => {
      var fileType = this.getFileIcon(staged.name, staged.mimeType || '');
      if (fileType === 'image') {
        html += '<div style="position:relative; width: 64px; height: 64px; border-radius: 8px; overflow:hidden; flex-shrink:0; border: 1px solid var(--border-subtle);">' +
          '<img src="' + staged.url + '" style="width:100%; height:100%; object-fit:cover;">' +
          '<button data-index="' + index + '" class="btn-remove-file" style="position:absolute; top:2px; right:2px; background:rgba(0,0,0,0.6); color:white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; cursor:pointer;"><i data-lucide="x" style="width:12px;height:12px;"></i></button>' +
        '</div>';
      } else {
        var icon = this.getFileIconLucide(fileType);
        var colorMap = { pdf: '#ef4444', word: '#3b82f6', sheet: '#22c55e', archive: '#f59e0b', code: '#8b5cf6', audio: '#ec4899', video: '#a855f7', text: '#6b7280' };
        var iconColor = colorMap[fileType] || 'var(--text-muted)';
        html += '<div style="position:relative; width: 64px; height: 64px; border-radius: 8px; background:var(--bg-surface); display:flex; flex-direction:column; align-items:center; justify-content:center; flex-shrink:0; padding:4px; border: 1px solid var(--border-subtle);">' +
          '<i data-lucide="' + icon + '" style="width:22px;height:22px;color:' + iconColor + '; margin-bottom:4px;"></i>' +
          '<span style="font-size:9px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; text-align:center;">' + window.Sanitize.escapeHtml(staged.name) + '</span>' +
          '<button data-index="' + index + '" class="btn-remove-file" style="position:absolute; top:2px; right:2px; background:rgba(0,0,0,0.6); color:white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; cursor:pointer;"><i data-lucide="x" style="width:12px;height:12px;"></i></button>' +
        '</div>';
      }
    });
    
    area.innerHTML = html;
    lucide.createIcons({ root: area });
  },

  showReactionPicker(x, y, msgId) {
    var existing = document.querySelector('.reaction-picker');
    if (existing) { document.body.removeChild(existing); return; }

    var emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉', '🥺', '👀', '💀', '✨', '⭐', '🤨', '😭', '😤', '😈', '💯', '👋', '🤝', '💪', '🫡', '👏', '🎊', '🚀'];
    var self = this;
    var picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.style.cssText = 'position:fixed;left:' + Math.min(x, window.innerWidth - 360) + 'px;top:' + (y + 8) + 'px;z-index:9999;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:24px;padding:8px 10px;box-shadow:var(--shadow-xl);display:flex;flex-wrap:wrap;gap:2px;max-width:360px;';

    emojis.forEach(function(emoji) {
      var btn = document.createElement('button');
      btn.textContent = emoji;
      btn.style.cssText = 'background:none;border:none;font-size:22px;cursor:pointer;padding:4px 6px;border-radius:50%;transition:background 0.15s,transform 0.1s;line-height:1;';
      btn.onmouseover = function() { this.style.background = 'var(--bg-hover)'; this.style.transform = 'scale(1.2)'; };
      btn.onmouseout = function() { this.style.background = 'transparent'; this.style.transform = 'scale(1)'; };
      btn.onclick = function() {
        var state = window.store.getState();
        var chatId = state.activeChatId;
        var msg = (state.messages[chatId] || []).find(function(m) { return String(m.id) === msgId; });
        var hasReacted = msg && msg.reactions && msg.reactions.some(function(r) { return r.emoji === emoji && r.userId === state.currentUser.userId; });
        if (chatId && window.store.sendReaction) {
          window.store.sendReaction(chatId, msgId, emoji, hasReacted ? 'remove' : 'add');
        }
        if (picker.parentNode) picker.parentNode.removeChild(picker);
      };
      picker.appendChild(btn);
    });

    document.body.appendChild(picker);

    // Close on click outside
    setTimeout(function() {
      document.addEventListener('click', function closePicker(e) {
        if (!picker.contains(e.target)) {
          if (picker.parentNode) picker.parentNode.removeChild(picker);
          document.removeEventListener('click', closePicker);
        }
      });
    }, 10);
  },

  showSearchModal(initialQuery, chatId) {
    var existing = document.querySelector('.search-modal-overlay');
    if (existing) { existing.remove(); }

    var self = this;
    var isChatSearch = !!chatId;
    var state = window.store.getState();
    var chatName = '';
    if (isChatSearch) {
      var friend = state.friends.find(function(f) { return f.userId === chatId; });
      var group = state.groups.find(function(g) { return g.groupId === chatId; });
      if (friend) chatName = friend.username;
      else if (group) chatName = group.groupName;
    }

    var overlay = document.createElement('div');
    overlay.className = 'search-modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding-top:80px;';

    var panel = document.createElement('div');
    panel.style.cssText = 'width:560px;max-height:75vh;background:var(--bg-surface);border-radius:16px;border:1px solid var(--border-subtle);box-shadow:var(--shadow-xl);display:flex;flex-direction:column;overflow:hidden;';

    var modalTitle = isChatSearch ? 'Search in Chat' : 'Search';
    var placeholder = isChatSearch ? 'Search this chat...' : 'Search messages, people, files...';

    panel.innerHTML =
      '<div class="search-modal-header" style="padding:16px 20px;border-bottom:1px solid var(--border-subtle);">' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
          '<i data-lucide="search" style="width:18px;height:18px;color:var(--text-muted);flex-shrink:0;"></i>' +
          '<div style="flex:1;display:flex;flex-direction:column;">' +
            '<span style="font-size:11px;font-weight:600;color:var(--text-muted);">' + modalTitle + '</span>' +
            '<input id="search-modal-input" class="search-modal-input" type="text" placeholder="' + placeholder + '" autofocus style="flex:1;border:none;background:transparent;color:var(--text-primary);font-size:15px;outline:none;">' +
          '</div>' +
          '<button id="search-modal-close" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);padding:4px;border-radius:6px;transition:background 0.15s;" onmouseover="this.style.background=\'var(--bg-hover)\'" onmouseout="this.style.background=\'transparent\'"><i data-lucide="x" style="width:18px;height:18px;"></i></button>' +
        '</div>' +
        '<div id="search-modal-filters" style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">' +
          '<input id="search-filter-from" type="text" placeholder="Filter by sender" style="flex:1;min-width:100px;padding:6px 10px;border-radius:6px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:12px;outline:none;">' +
          '<input id="search-filter-date-from" type="date" style="padding:5px 8px;border-radius:6px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:11px;outline:none;color-scheme:dark;">' +
          '<span style="font-size:11px;color:var(--text-muted);">to</span>' +
          '<input id="search-filter-date-to" type="date" style="padding:5px 8px;border-radius:6px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:11px;outline:none;color-scheme:dark;">' +
        '</div>' +
      '</div>' +
      '<div id="search-modal-results" style="flex:1;overflow-y:auto;padding:8px 0;"></div>';

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons({ root: overlay });

    var input = document.getElementById('search-modal-input');
    var results = document.getElementById('search-modal-results');

    // Pre-fill the chat filter if searching within a chat
    if (isChatSearch) {
      var filterFrom = document.getElementById('search-filter-from');
      if (filterFrom) filterFrom.placeholder = 'Filter by sender';
    }

    // Delegated click on search results
    results.addEventListener('click', function(e) {
      var row = e.target.closest('.search-result-row');
      if (!row) return;
      var chatId = row.getAttribute('data-chat-id');
      var msgId = row.getAttribute('data-msg-id');
      var state = window.store.getState();
      if (state.activeChatId !== chatId) {
        window.store.setState({ activeChatId: chatId });
      }
      overlay.remove();
      if (msgId) {
        setTimeout(function() {
          var el = document.querySelector('[data-msg-id="' + msgId + '"]');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    });

    if (input) {
      input.focus();
      if (initialQuery) {
        input.value = initialQuery;
      }
    }

    var performSearch = function() {
      try {
        var query = input ? input.value.trim().toLowerCase() : '';
        var filterFrom = document.getElementById('search-filter-from') ? document.getElementById('search-filter-from').value.trim().toLowerCase() : '';
        var dateFrom = document.getElementById('search-filter-date-from') ? document.getElementById('search-filter-date-from').value : '';
        var dateTo = document.getElementById('search-filter-date-to') ? document.getElementById('search-filter-date-to').value : '';

        if (!query) {
          results.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px;">' + (isChatSearch ? 'Type to search messages in this chat' : 'Type to search messages, people, and files') + '</div>';
          return;
        }

        var state = window.store.getState();
        var hits = [];
        var myId = state.currentUser.userId;

        var chatIds = isChatSearch ? [chatId] : Object.keys(state.messages);
        chatIds.forEach(function(cId) {
          var msgs = state.messages[cId] || [];
          var chatName = cId;
          var friend = state.friends.find(function(f) { return f.userId === cId; });
          var group = state.groups.find(function(g) { return g.groupId === cId; });
          if (friend) chatName = friend.username;
          else if (group) chatName = group.groupName;
          else if (cId === 'local-echo') chatName = 'Orbit Echo';

          msgs.forEach(function(msg) {
            var match = false;
            var matchType = 'text';
            var score = 0;

            // Sender filter
            if (filterFrom) {
              var senderMatch = false;
              if (friend && friend.username.toLowerCase().includes(filterFrom)) senderMatch = true;
              if (group) {
                var sender = group.members.find(function(m) { return m.userId === msg.sender; });
                if (sender && sender.username.toLowerCase().includes(filterFrom)) senderMatch = true;
              }
              if (msg.sender === myId && 'you'.includes(filterFrom)) senderMatch = true;
              if (!senderMatch) return;
            }

            // Date filter
            if (dateFrom && msg.timestamp && msg.timestamp < dateFrom) return;
            if (dateTo && msg.timestamp) {
              var endDate = new Date(dateTo);
              endDate.setDate(endDate.getDate() + 1);
              if (msg.timestamp >= endDate.toISOString().split('T')[0]) return;
            }

            if (msg.text) {
              var lower = msg.text.toLowerCase();
              var q = query;
              if (lower === q) { match = true; score = 100; }
              else if (lower.startsWith(q)) { match = true; score = 80; }
              else if (lower.includes(' ' + q) || lower.includes(q + ' ')) { match = true; score = 60; }
              else if (lower.includes(q)) { match = true; score = 40; }
            }
            if (msg.attachments) {
              msg.attachments.forEach(function(att) {
                if (att.name && att.name.toLowerCase().includes(query)) {
                  match = true;
                  matchType = 'file';
                  score = Math.max(score, 50);
                }
              });
            }
            if (match) {
              hits.push({ chatId: cId, chatName: chatName, msg: msg, matchType: matchType, score: score, timestamp: msg.timestamp || '' });
            }
          });
        });

        // Search friends/usernames (skip in chat-specific search)
        if (!isChatSearch) {
        state.friends.forEach(function(f) {
          if (f.username && f.username.toLowerCase().includes(query) && f.userId !== myId) {
            if (!hits.some(function(h) { return h.chatId === f.userId; })) {
              hits.push({ chatId: f.userId, chatName: f.username, msg: null, matchType: 'user', score: 30, timestamp: '' });
            }
          }
        });
        }

        // Sort: by score desc, then by timestamp desc
        hits.sort(function(a, b) {
          if (b.score !== a.score) return b.score - a.score;
          return (b.timestamp || '').localeCompare(a.timestamp || '');
        });

        if (hits.length === 0) {
          results.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px;line-height:1.6;">No results for <b style="color:var(--text-secondary);">' + window.Sanitize.escapeHtml(query) + '</b></div>';
          return;
        }

        function highlightText(text, q) {
          if (!q || !text) return window.Sanitize.escapeHtml(text || '');
          var escaped = window.Sanitize.escapeHtml(text);
          var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
          return escaped.replace(re, '<strong style="color:var(--accent-primary);font-weight:600;">$1</strong>');
        }

        var html = '<div style="font-size:11px;padding:6px 20px;color:var(--text-muted);">' + hits.length + ' result' + (hits.length !== 1 ? 's' : '') + '</div>';
        hits.slice(0, 50).forEach(function(hit) {
          var rawQuery = input ? input.value.trim() : '';
          var preview = '';
          var icon = 'message-circle';
          if (hit.matchType === 'file') {
            icon = 'file';
            var fileName = hit.msg.attachments[0] ? hit.msg.attachments[0].name : 'attachment';
            preview = 'File: ' + highlightText(fileName, rawQuery);
          } else if (hit.matchType === 'user') { icon = 'user'; preview = 'Click to open chat'; }
          else {
            var raw = hit.msg.text || '(attachment)';
            if (raw.length > 80) raw = raw.substring(0, 80) + '...';
            preview = highlightText(raw, rawQuery);
          }
          var time = hit.msg ? window.Format.relativeTime(hit.msg.timestamp) : '';

          var nameHtml = isChatSearch ? '' : '<span>' + window.Sanitize.escapeHtml(hit.chatName) + '</span>';
          html += '<div class="search-result-row" data-chat-id="' + window.Sanitize.escapeHtml(hit.chatId) + '" data-msg-id="' + (hit.msg ? hit.msg.id : '') + '" style="display:flex;align-items:center;gap:12px;padding:10px 20px;cursor:pointer;">' +
            '<i data-lucide="' + icon + '" style="width:18px;height:18px;color:var(--text-muted);flex-shrink:0;"></i>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-primary);font-weight:500;">' + nameHtml + '<span style="font-size:11px;color:var(--text-muted);font-weight:400;">' + time + '</span></div>' +
              '<div style="font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + preview + '</div>' +
            '</div>' +
          '</div>';
        });
        results.innerHTML = html;
        if (window.lucide) window.lucide.createIcons({ root: results });
      } catch(err) {
        console.error('[Search] performSearch error:', err);
        if (results) {
          results.innerHTML = '<div style="padding:24px;text-align:left;color:var(--accent-danger);font-size:12px;font-family:var(--font-mono);white-space:pre-wrap;word-break:break-word;">' +
            '<b>Search Error</b><br><br>' + window.Sanitize.escapeHtml(String(err && err.message ? err.message : err)) +
            (err && err.stack ? '<br><br><span style="color:var(--text-muted);font-size:11px;">' + window.Sanitize.escapeHtml(err.stack) + '</span>' : '') +
          '</div>';
        }
      }
    };

    // Filter inputs trigger search
    var filterInputs = ['search-modal-input', 'search-filter-from', 'search-filter-date-from', 'search-filter-date-to'];
    filterInputs.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', function() {
          if (self._searchTimeout) clearTimeout(self._searchTimeout);
          self._searchTimeout = setTimeout(performSearch, 200);
        });
        el.addEventListener('change', function() {
          if (self._searchTimeout) clearTimeout(self._searchTimeout);
          self._searchTimeout = setTimeout(performSearch, 100);
        });
      }
    });

    if (input) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') performSearch();
        if (e.key === 'Escape') overlay.remove();
      });
    }

    document.getElementById('search-modal-close').addEventListener('click', function() { overlay.remove(); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    if (input && initialQuery) {
      var ev = new Event('input', { bubbles: true });
      input.dispatchEvent(ev);
    }
  },

  showForwardModal(msgId) {
    var existing = document.querySelector('.forward-modal-overlay');
    if (existing) { existing.remove(); }

    var self = this;
    var state = window.store.getState();
    var msgList = state.messages[state.activeChatId] || [];
    var msg = msgList.find(function(m) { return m.id == msgId; });
    if (!msg) return;

    function getSenderName(originalMsg) {
      if (originalMsg.sender === state.currentUser.userId) return 'You';
      var friend = state.friends.find(function(f) { return f.userId === state.activeChatId; });
      var group = state.groups.find(function(g) { return g.groupId === state.activeChatId; });
      if (group) {
        var member = group.members.find(function(m) { return m.userId === originalMsg.sender; });
        if (member) return member.username;
        var fromFriend = state.friends.find(function(f) { return f.userId === originalMsg.sender; });
        if (fromFriend) return fromFriend.username;
      }
      if (friend) return friend.username;
      return 'Unknown';
    }

    var senderName = getSenderName(msg);
    var forwardedText = 'Forwarded from ' + senderName + ': ' + (msg.text || '');

    var overlay = document.createElement('div');
    overlay.className = 'forward-modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding-top:80px;';

    var panel = document.createElement('div');
    panel.style.cssText = 'width:460px;max-height:75vh;background:var(--bg-surface);border-radius:16px;border:1px solid var(--border-subtle);box-shadow:var(--shadow-xl);display:flex;flex-direction:column;overflow:hidden;';

    var allContacts = [];

    state.friends.forEach(function(f) {
      if (f.userId !== state.activeChatId && f.userId !== 'local-echo') {
        allContacts.push({ id: f.userId, name: f.username, avatar: f.avatar, type: 'friend' });
      }
    });

    state.groups.forEach(function(g) {
      if (g.groupId !== state.activeChatId) {
        allContacts.push({ id: g.groupId, name: g.groupName, avatar: g.avatarPath || '', type: 'group' });
      }
    });

    var contactListHtml = '';
    allContacts.forEach(function(c) {
      var initial = c.name.charAt(0).toUpperCase();
      var avatarHtml = c.avatar
        ? '<img src="' + window.Sanitize.escapeHtml(c.avatar) + '" style="width:36px;height:36px;border-radius:' + (c.type === 'group' ? '10px' : '50%') + ';object-fit:cover;">'
        : '<div style="width:36px;height:36px;border-radius:' + (c.type === 'group' ? '10px' : '50%') + ';background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-weight:700;color:white;font-size:14px;">' + initial + '</div>';
      var typeIcon = c.type === 'group' ? '<i data-lucide="users" style="width:12px;height:12px;"></i>' : '<i data-lucide="user" style="width:12px;height:12px;"></i>';
      contactListHtml += '<div class="forward-contact-row" data-contact-id="' + window.Sanitize.escapeHtml(c.id) + '" data-contact-type="' + c.type + '" style="display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;border-radius:8px;transition:background 0.15s;">' +
        avatarHtml +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:14px;font-weight:500;color:var(--text-primary);">' + window.Sanitize.escapeHtml(c.name) + '</div>' +
          '<div style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:4px;">' + typeIcon + ' ' + (c.type === 'group' ? 'Group' : 'Direct Message') + '</div>' +
        '</div>' +
      '</div>';
    });

    panel.innerHTML =
      '<div style="padding:16px 20px;border-bottom:1px solid var(--border-subtle);">' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
          '<span style="font-weight:600;font-size:16px;flex:1;">Forward Message</span>' +
          '<button id="forward-modal-close" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);padding:4px;"><i data-lucide="x" style="width:18px;height:18px;"></i></button>' +
        '</div>' +
        '<div style="margin-top:10px;">' +
          '<input id="forward-search-input" type="text" placeholder="Search chats..." autofocus style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:13px;outline:none;box-sizing:border-box;">' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">Forwarding: ' + window.Sanitize.escapeHtml(forwardedText.substring(0, 60)) + (forwardedText.length > 60 ? '...' : '') + '</div>' +
      '</div>' +
      '<div id="forward-contact-list" style="flex:1;overflow-y:auto;padding:8px;">' +
        contactListHtml +
      '</div>';

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons({ root: overlay });

    function doForward(targetId) {
      var targetContact = allContacts.find(function(c) { return c.id === targetId; });
      if (!targetContact) return;

      var myId = state.currentUser.userId;
      var newMsg = {
        id: Date.now() + Math.random().toString(36).slice(2, 8),
        sender: myId,
        text: forwardedText,
        timestamp: new Date().toISOString(),
        forwardedFrom: senderName
      };
      if (msg.attachments && msg.attachments.length > 0) {
        newMsg.attachments = msg.attachments.map(function(a) { return { ...a }; });
      }

      window.store.addMessage(targetId, newMsg);

      var payload = {
        text: forwardedText,
        msgId: newMsg.id,
        forwardedFrom: senderName
      };
      if (newMsg.attachments) payload.attachments = newMsg.attachments;

      var s = window.store.getState();
      var g = s.groups.find(function(g) { return g.groupId === targetId; });
      if (g) {
        payload.chatId = targetId;
        (g.members || []).forEach(function(m) {
          if (m.userId !== s.currentUser.userId) {
            window.orbitAPI.networkSend(m.userId, m.ip || '', window.Protocol.Types.MESSAGE, payload);
          }
        });
      } else {
        var friend = s.friends.find(function(f) { return f.userId === targetId; });
        if (friend) {
          window.orbitAPI.networkSend(targetId, friend.ip || '', window.Protocol.Types.MESSAGE, payload);
        }
      }

      if (window.Toast) window.Toast.show('Forwarded', 'Message sent to ' + targetContact.name);
      overlay.remove();
    }

    document.getElementById('forward-modal-close').addEventListener('click', function() { overlay.remove(); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    var searchInput = document.getElementById('forward-search-input');
    if (searchInput) {
      searchInput.focus();
      searchInput.addEventListener('input', function() {
        var q = this.value.trim().toLowerCase();
        var rows = panel.querySelectorAll('.forward-contact-row');
        rows.forEach(function(row) {
          var name = row.querySelector('div > div:first-child').textContent.toLowerCase();
          row.style.display = name.indexOf(q) !== -1 ? 'flex' : 'none';
        });
      });

      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') overlay.remove();
      });
    }

    panel.querySelectorAll('.forward-contact-row').forEach(function(row) {
      row.addEventListener('click', function() {
        doForward(this.getAttribute('data-contact-id'));
      });
    });
  },

  async sendMessage(text) {
    if (this._sending) return;
    this._sending = true;
    var state = window.store.getState();
    var activeChatId = state.activeChatId;
    if (!activeChatId) { this._sending = false; return; }

    if (!text && this.stagedFiles.length === 0) { this._sending = false; return; }

    const friend = state.friends.find(function(f) { return f.userId === activeChatId; });
    const activeGroup = state.groups.find(function(g) { return g.groupId === activeChatId; });
    const isGroup = !!activeGroup;
    const myId = state.currentUser.userId;

    // Get all recipients for this message
    var recipients = [];
    if (isGroup) {
      var members = activeGroup.members || [];
      members.forEach(function(m) {
        if (m.userId !== myId) {
          recipients.push({ userId: m.userId, ip: m.ip || '' });
        }
      });
    } else if (friend) {
      recipients.push({ userId: friend.userId, ip: friend.ip || '' });
    }

    // Helper: send to all recipients (with packet size logging)
    function sendToAll(type, payload) {
      if (window.orbitAPI && activeChatId !== 'local-echo') {
        var payloadStr = JSON.stringify(payload);
        if (payloadStr.length > 100 * 1024) {
          console.log('[SEND] type=' + type + ' size=' + (payloadStr.length / 1024).toFixed(1) + 'KB recipients=' + recipients.length);
        }
        recipients.forEach(function(r) {
          window.orbitAPI.networkSend(r.userId, r.ip, type, payload);
        });
      } else if (activeChatId === 'local-echo') {
        var echoPayload = payload.text ? { text: 'Echo: ' + payload.text, msgId: Date.now() + 1, replyTo: payload.replyTo } : null;
        if (echoPayload) {
          setTimeout(function() {
            window.store.addMessage('local-echo', {
              id: Date.now() + 1,
              sender: 'local-echo',
              text: echoPayload.text,
              replyTo: echoPayload.replyTo,
              timestamp: new Date().toISOString()
            });
          }, 500);
        }
      }
    }

    // Handle edit separately (text-only)
    if (this.editingMsg) {
      const editId = this.editingMsg.id;
      var editPayload = { msgId: editId, newText: text || '' };
      if (isGroup) editPayload.chatId = activeChatId;
      sendToAll(window.Protocol.Types.MESSAGE_EDIT, editPayload);
      window.store.editMessage(activeChatId, editId, text || '');
      this.editingMsg = null;
      var input = document.getElementById('chat-input');
      if (input) input.value = '';
      window.store.notify();
      this._sending = false;
      return;
    }

    // Limit: files over this size use chunked FILE_TRANSFER instead of inline base64
    var INLINE_LIMIT = 1.5 * 1024 * 1024; // 1.5 MB
    var CHUNK_SIZE = 64 * 1024; // 64 KB

    var localAttachments = [];
    var inlineAttachments = [];
    var largeFiles = []; // { staged, data, att }

    if (this.stagedFiles.length > 0) {
      const fileBuffers = await Promise.all(this.stagedFiles.map(async (s) => {
        if (s.file) {
          try {
            const ab = await s.file.arrayBuffer();
            if (ab && ab.byteLength > 0) return ab;
          } catch(e) { /* ignore */ }
        }
        return null;
      }));

      var attId = Date.now();
      for (var fi = 0; fi < this.stagedFiles.length; fi++) {
        var s = this.stagedFiles[fi];
        var fileData = fileBuffers[fi];
        var att = {
          id: String(attId + fi),
          type: s.type,
          name: s.name,
          size: s.size,
          path: s.path,
          data: fileData,
          url: 'orbit-db://attachment/' + String(attId + fi) + '?t=' + Date.now(),
          width: s.width || 0,
          height: s.height || 0
        };
        localAttachments.push(att);

        if (fileData && fileData.byteLength >= INLINE_LIMIT) {
          // Large file: send via chunked FILE_TRANSFER protocol (mobile-compatible)
          if (s.type === 'audio' || s.type === 'video') {
            var rawMime = s.file ? s.file.type : (s.type === 'audio' ? 'audio/mpeg' : 'video/mp4');
            att.url = URL.createObjectURL(new Blob([fileData], { type: rawMime }));
          }
          largeFiles.push({ staged: s, data: fileData, att: att });
        } else if (fileData) {
          // Small file: inline as base64 data URL in MESSAGE payload
          var bytes = new Uint8Array(fileData);
          var binary = '';
          for (var b = 0; b < bytes.byteLength; b++) {
            binary += String.fromCharCode(bytes[b]);
          }
          var mimeType = s.file ? s.file.type : (s.type === 'image' ? 'image/png' : (s.type === 'audio' ? 'audio/mpeg' : 'application/octet-stream'));
          var dataUrl = 'data:' + mimeType + ';base64,' + btoa(binary);
          // Use blob URL for local display (CSP allows blob: in media-src)
          if (s.type === 'audio' || s.type === 'video') {
            att.url = URL.createObjectURL(new Blob([fileData], { type: mimeType }));
          }
          inlineAttachments.push({
            id: att.id,
            name: s.name,
            type: s.type,
            size: s.size,
            url: dataUrl,
            width: s.width || 0,
            height: s.height || 0
          });
        } else if (s.url && typeof s.url === 'string' && s.url.indexOf('data:') === 0) {
          if (s.type === 'audio' || s.type === 'video') {
            att.url = s.url;
          }
          inlineAttachments.push({
            id: att.id,
            name: s.name,
            type: s.type,
            size: s.size,
            url: s.url,
            width: s.width || 0,
            height: s.height || 0
          });
        }
      }
    }

    // ---- Send MESSAGE with text + small file data URLs ----
    var msgId = Date.now() + 2;
    if (text || inlineAttachments.length > 0) {
      var payload = {
        text: text || '',
        msgId: msgId
      };
      var state = window.store.getState();
      if (isGroup) {
        payload.chatId = activeChatId;
      }
      if (state.currentUser) payload.fromName = state.currentUser.name;
      if (this.replyingTo) {
        payload.replyTo = this.replyingTo.id;
      }
      if (inlineAttachments.length > 0) {
        payload.attachments = inlineAttachments;
      }

      // E2EE: encrypt text for each recipient
      var settings = window.store.getState().settings;
      if (settings.e2eeEnabled && !isGroup && recipients.length === 1 && text) {
        var pubKey = window.store.getPeerPublicKey(recipients[0].userId);
        if (pubKey && window.orbitAPI && window.orbitAPI.e2eeEncrypt) {
          var encrypted = window.orbitAPI.e2eeEncrypt(text, pubKey);
          if (encrypted) {
            payload.text = encrypted;
            payload.e2ee = true;
          }
        }
      }

      sendToAll(window.Protocol.Types.MESSAGE, payload);
    }

    // ---- Send large files via chunked FILE_TRANSFER protocol ----
    var sentFileIds = [];
    for (var li = 0; li < largeFiles.length; li++) {
      var lf = largeFiles[li];
      var fileData = lf.data;
      var fileId = (window.orbitAPI && window.orbitAPI.getUuid) ? window.orbitAPI.getUuid() : (Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8));
      sentFileIds.push(fileId);
      var totalChunks = Math.ceil(fileData.byteLength / CHUNK_SIZE);

      // Compute SHA-256 hash
      var hash = '';
      try {
        if (window.crypto && window.crypto.subtle) {
          var hashBuffer = await window.crypto.subtle.digest('SHA-256', fileData);
          var hashView = new Uint8Array(hashBuffer);
          var hashParts = [];
          for (var hi = 0; hi < hashView.length; hi++) {
            var h = hashView[hi].toString(16);
            if (h.length < 2) h = '0' + h;
            hashParts.push(h);
          }
          hash = hashParts.join('');
        }
      } catch (e) {
        hash = '';
      }

      // Send FILE_TRANSFER_START
      sendToAll(window.Protocol.Types.FILE_TRANSFER_START, {
        fileId: fileId,
        fileName: lf.staged.name,
        fileSize: fileData.byteLength,
        totalChunks: totalChunks,
        hash: hash
      });

      for (var ci = 0; ci < totalChunks; ci++) {
        var start = ci * CHUNK_SIZE;
        var end = Math.min(start + CHUNK_SIZE, fileData.byteLength);
        var chunkBytes = new Uint8Array(fileData.slice(start, end));
        var chunkBinary = '';
        for (var cb = 0; cb < chunkBytes.byteLength; cb++) {
          chunkBinary += String.fromCharCode(chunkBytes[cb]);
        }
        var chunkBase64 = btoa(chunkBinary);

        sendToAll(window.Protocol.Types.FILE_CHUNK, {
          fileId: fileId,
          chunkIndex: ci,
          data: chunkBase64
        });

        // Report progress
        if (window.store) {
          var cp = window.store.getState().transferProgress || {};
          var updated = {};
          updated[fileId] = { received: ci + 1, total: totalChunks, name: lf.staged.name, isSending: true };
          window.store.setState({
            transferProgress: Object.assign({}, cp, updated)
          });
        }

        // Yield to event loop between chunks
        await new Promise(function(r) { setTimeout(r, 0); });
      }

      // Send FILE_TRANSFER_END
      sendToAll(window.Protocol.Types.FILE_TRANSFER_END, {
        fileId: fileId,
        hash: hash
      });
    }

    // Clean up transfer progress for sent files
    if (sentFileIds.length > 0 && window.store) {
      var cp = { ...window.store.getState().transferProgress };
      sentFileIds.forEach(function(fid) { delete cp[fid]; });
      window.store.setState({ transferProgress: cp });
    }

    // Store locally with orbit-db attachment URLs
    var localId = (text || inlineAttachments.length > 0) ? msgId : (Date.now() + 3);
    var localMsg = {
      id: localId,
      sender: myId,
      text: text || '',
      timestamp: new Date().toISOString()
    };
    if (localAttachments.length > 0) {
      localMsg.attachments = localAttachments;
    }
    if (this.replyingTo) {
      localMsg.replyTo = this.replyingTo.id;
    }
    window.store.addMessage(activeChatId, localMsg);

    this.stagedFiles = [];
    this.renderPreviewArea();
    this.replyingTo = null;

    // Clear UI state
    var input = document.getElementById('chat-input');
    if (input) input.value = '';
    window.store.notify();
    this._sending = false;
  },

  _injectMessageParticles() {
    if (!window.store) return;
    var s = window.store.getState();
    if (!s.settings.experimentalMessageFx) return;
    var feed = document.getElementById('chat-message-feed');
    if (!feed) return;
    var bubbles = feed.querySelectorAll('.message-own .message-bubble');
    if (!bubbles.length) return;
    var colors = ['#ffd700','#ff6b6b','#48dbfb','#ff9ff3','#feca57','#a29bfe','#fd79a8','#00cec9'];
    var count = 10 + Math.floor(Math.random() * 6);
    for (var bi = 0; bi < bubbles.length; bi++) {
      for (var i = 0; i < count; i++) {
        var p = document.createElement('div');
        p.className = 'fx-particle';
        var angle = Math.random() * 360;
        var dist = 25 + Math.random() * 55;
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
  },

  initSwipeToReply() {
    if (this._swipeInitialized) return;
    var self = this;
    var swipeState = null;
    var DRAG_MAX = 80;
    var TRIGGER_THRESHOLD = 55;

    function getRow(id) {
      return document.querySelector('.message-row[data-msg-id="' + id + '"]');
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
      ind.style.opacity = progress;
      ind.style.transform = 'translateY(-50%) scale(' + scale + ')';
      if (progress >= 1) {
        ind.style.color = 'var(--accent-primary)';
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

    function triggerReply(row) {
      var msgId = row.getAttribute('data-msg-id');
      if (!msgId) return;
      var state = window.store.getState();
      var msgList = state.messages[state.activeChatId] || [];
      var msg = msgList.find(function(m) { return String(m.id) === msgId; });
      if (msg) {
        var friendName = state.friends.find(function(f) { return f.userId === state.activeChatId; });
        self.replyingTo = {
          id: msg.id,
          text: msg.text,
          senderName: msg.sender === state.currentUser.userId ? 'You' : (friendName ? friendName.username : 'User')
        };
        self.editingMsg = null;
        var existing = document.getElementById('reply-edit-bar');
        if (existing) existing.remove();
        if (!self.replyingTo) return;
        var rText = (self.replyingTo.text || '').substring(0, 80);
        var barHtml = '<div id="reply-edit-bar" style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:4px;border-radius:12px;background:var(--bg-hover);border:1px solid var(--border-subtle);font-size:13px;color:var(--text-secondary);">' +
          '<i data-lucide="reply" style="width:14px;height:14px;flex-shrink:0;"></i>' +
          '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Replying to <b>' + window.Sanitize.escapeHtml(self.replyingTo.senderName || 'message') + '</b>: ' + window.Sanitize.escapeHtml(rText) + '</span>' +
          '<button id="btn-cancel-reply" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px;">✕</button>' +
        '</div>';
        var previewArea = document.getElementById('file-preview-area');
        if (previewArea) {
          previewArea.insertAdjacentHTML('beforebegin', barHtml);
        }
        if (window.lucide) lucide.createIcons();
        var inp = document.getElementById('chat-input');
        if (inp) inp.focus();
      }
    }

    // Use this.container for delegation — it persists across innerHTML replacement
    // getRow() still finds rows via global querySelector
    var el = this.container;

    el.addEventListener('touchstart', function(e) {
      if (!window.store.getState().settings.swipeToReply || e.touches.length !== 1) return;
      var row = e.target.closest('.message-row');
      if (!row || e.target.closest('button, input, textarea, select, a, label, .reaction-pill, .reply-quote, .msg-action-btn, .link-preview')) return;
      var t = e.touches[0];
      swipeState = { id: row.getAttribute('data-msg-id'), x: t.clientX, y: t.clientY, locked: false };
    }, { passive: true });

    el.addEventListener('touchmove', function(e) {
      if (!swipeState || e.touches.length !== 1) return;
      var t = e.touches[0];
      var dx = t.clientX - swipeState.x;
      var dy = t.clientY - swipeState.y;

      if (!swipeState.locked && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        swipeState.locked = true;
        swipeState.horizontal = Math.abs(dx) > Math.abs(dy);
      }
      if (!swipeState.locked || !swipeState.horizontal) return;

      if (dx >= 0) {
        var row = getRow(swipeState.id);
        if (row) applyDrag(row, 0);
        return;
      }

      e.preventDefault();
      var row = getRow(swipeState.id);
      if (row) applyDrag(row, dx);
    }, { passive: false });

    el.addEventListener('touchend', function(e) {
      if (!swipeState) return;
      var sid = swipeState.id;
      var row = getRow(sid);
      if (!row) { swipeState = null; return; }

      var triggered = false;
      if (e.changedTouches && e.changedTouches.length === 1) {
        var t = e.changedTouches[0];
        var dx = t.clientX - swipeState.x;
        var dy = t.clientY - swipeState.y;
        if (dx < -TRIGGER_THRESHOLD && Math.abs(dy) < 70) triggered = true;
      }
      resetRow(row, triggered);
      if (triggered) triggerReply(row);
      swipeState = null;
    }, { passive: true });

    el.addEventListener('touchcancel', function() {
      if (swipeState) {
        var row = getRow(swipeState.id);
        if (row) resetRow(row, false);
      }
      swipeState = null;
    }, { passive: true });

    // Desktop mouse drag (same logic, adapted)
    el.addEventListener('mousedown', function(e) {
      if (!window.store.getState().settings.swipeToReply) return;
      if (e.button !== 0) return;
      var row = e.target.closest('.message-row');
      if (!row || e.target.closest('button, input, textarea, select, a, label, .reaction-pill, .reply-quote, .msg-action-btn, .link-preview, .msg-avatar, .att-thumb')) return;
      swipeState = { id: row.getAttribute('data-msg-id'), x: e.clientX, y: e.clientY, locked: false };
    });

    el.addEventListener('mousemove', function(e) {
      if (!swipeState) return;
      var dx = e.clientX - swipeState.x;
      var dy = e.clientY - swipeState.y;

      if (!swipeState.locked && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        swipeState.locked = true;
        swipeState.horizontal = Math.abs(dx) > Math.abs(dy);
      }
      if (!swipeState.locked || !swipeState.horizontal) return;

      if (dx >= 0) {
        var row = getRow(swipeState.id);
        if (row) applyDrag(row, 0);
        return;
      }

      var row = getRow(swipeState.id);
      if (row) applyDrag(row, dx);
    });

    el.addEventListener('mouseup', function(e) {
      if (!swipeState) return;
      var sid = swipeState.id;
      var row = getRow(sid);
      if (!row) { swipeState = null; return; }

      var triggered = false;
      var dx = e.clientX - swipeState.x;
      var dy = e.clientY - swipeState.y;
      if (dx < -TRIGGER_THRESHOLD && Math.abs(dy) < 70) triggered = true;

      resetRow(row, triggered);
      if (triggered) triggerReply(row);
      swipeState = null;
    });

    el.addEventListener('mouseleave', function() {
      if (swipeState) {
        var row = getRow(swipeState.id);
        if (row) resetRow(row, false);
      }
      swipeState = null;
    });

    this._swipeInitialized = true;
  }
};

function applyOgData(el, og) {
  if (!el || !og) return;
  el.setAttribute('data-og-loaded', 'true');
  var titleEl = el.querySelector('.link-preview-title');
  var urlEl = el.querySelector('.link-preview-url');
  var imgEl = el.querySelector('.link-preview-img');
  if (og.title && titleEl) titleEl.textContent = og.title.substring(0, 120);
  if (og.description && urlEl) urlEl.textContent = og.description.substring(0, 200);
  if (og.image && imgEl) {
    imgEl.innerHTML = '<img src="' + window.Sanitize.escapeHtml(og.image) + '" alt="" loading="lazy" onerror="var p=this.parentNode;this.style.display=\'none\';p.innerHTML=\'<i data-lucide=\\\'link-2\\\' style=\\\'width:20px;height:20px;\\\'></i>\';if(window.lucide)lucide.createIcons({root:p});">';
    if (window.lucide) lucide.createIcons({ root: imgEl });
  }
  if (og.domain && !og.title && titleEl) titleEl.textContent = og.domain;
}
