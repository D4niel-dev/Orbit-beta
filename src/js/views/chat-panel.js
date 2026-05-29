// src/js/views/chat-panel.js

window.ChatPanel = {
  init() {
    this.container = document.getElementById('chat-container');
    this.stagedFiles = [];
    this.replyingTo = null; // { id, sender, text }
    this.editingMsg = null; // { id, chatId, text }
    
    // Delegated click handler — attached ONCE in init
    this.initDelegatedActions();
    
    // Subscribe to store
    this.unsubscribe = window.store.subscribe((state) => {
      this.renderChat(state);
    });

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
        window.store.notify();
        return;
      }
      if (e.target.closest('#btn-cancel-edit')) {
        self.editingMsg = null;
        var inp = document.getElementById('chat-input');
        if (inp) inp.value = '';
        window.store.notify();
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
                var friend = state.friends.find(function(f) { return f.userId === activeChatId; });
                if (friend) {
                  window.orbitAPI.networkSend(activeChatId, friend.ip, window.Protocol.Types.MESSAGE_DELETE, { msgId: msgId });
                }
              }
              window.store.deleteMessage(activeChatId, msgId);
            }
          });
        }
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
    if (!activeFriend) return;

    const messages = state.messages[state.activeChatId] || [];
    const myId = state.currentUser.userId;

    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';

    let messagesHtml = '';
    messages.forEach(msg => {
      const isMine = msg.sender === myId;
      const timeStr = window.Format.absoluteTime(msg.timestamp).split(' · ')[0];
      const sanitizedText = window.Sanitize.markdown(msg.text);
      const editedBadge = msg.edited ? '<span style="font-size:11px;color:rgba(255,255,255,0.5);margin-left:6px;">(edited)</span>' : '';
      const editedBadgeOther = msg.edited ? '<span style="font-size:11px;color:var(--text-muted);margin-left:6px;">(edited)</span>' : '';

      // Reply quote
      let replyHtml = '';
      if (msg.replyTo) {
        const origMsg = messages.find(m => m.id == msg.replyTo);
        if (origMsg) {
          const replyPreview = (origMsg.text || '').substring(0, 60) + (origMsg.text && origMsg.text.length > 60 ? '...' : '');
          const replyUser = origMsg.sender === myId ? 'You' : window.Sanitize.escapeHtml(activeFriend.username);
          replyHtml = '<div style="font-size:12px;padding:6px 10px;margin-bottom:6px;border-left:3px solid rgba(255,255,255,0.3);border-radius:4px;background:rgba(0,0,0,0.1);color:rgba(255,255,255,0.7);cursor:pointer;" onclick="document.querySelector(\'[data-msg-id=\\x27' + origMsg.id + '\\x27].message-row\')?.scrollIntoView({behavior:\\x27smooth\\x27,block:\\x27center\\x27})">' +
            '<span style="font-weight:600;">' + replyUser + '</span> ' + window.Sanitize.escapeHtml(replyPreview) +
          '</div>';
        }
      }

      let attachmentsHtml = '';
      if (msg.attachments && msg.attachments.length > 0) {
        let gridHtml = '';
        msg.attachments.forEach(att => {
          const safeAttId = window.Sanitize.escapeHtml(String(att.id || ''));
          const deleteBtn = '<button class="att-delete-btn" data-att-id="' + safeAttId + '" data-msg-id="' + msg.id + '" style="position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,0.6);border:none;color:white;cursor:pointer;display:none;align-items:center;justify-content:center;font-size:14px;line-height:1;z-index:2;" title="Delete">×</button>';
          if (att.type === 'image') {
            const safeUrl = window.Sanitize.escapeHtml(att.url);
            const safeName = window.Sanitize.escapeHtml(String(att.name || 'Image'));
            const safeSize = window.Sanitize.escapeHtml(String(att.size || 0));
            gridHtml += '<div style="position:relative;border-radius: 8px; overflow: hidden; height: 120px; border: 1px solid var(--border-subtle); cursor:pointer;" onmouseenter="var el=this.querySelector(\'.att-delete-btn\');if(el)el.style.display=\'flex\'" onmouseleave="var el=this.querySelector(\'.att-delete-btn\');if(el)el.style.display=\'none\'" onclick="if(window.ImageViewer) window.ImageViewer.openFromMessage(\'' + msg.id + '\', \'' + safeAttId + '\')">' + deleteBtn + '<img src="' + safeUrl + '" style="width: 100%; height: 100%; object-fit: cover;" onerror="if(window.handleMediaError) window.handleMediaError(this, \'' + safeUrl + '\')"></div>';
          } else {
            gridHtml += '<div style="position:relative;border-radius: 8px; height: 120px; border: 1px solid var(--border-subtle); display:flex; flex-direction:column; align-items:center; justify-content:center; background: rgba(0,0,0,0.1); padding: 8px; text-align:center;" onmouseenter="var el=this.querySelector(\'.att-delete-btn\');if(el)el.style.display=\'flex\'" onmouseleave="var el=this.querySelector(\'.att-delete-btn\');if(el)el.style.display=\'none\'">' +
              deleteBtn +
              '<i data-lucide="file" style="width:32px;height:32px;margin-bottom:8px;color:var(--text-muted);"></i>' +
              '<div style="font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">' + window.Sanitize.escapeHtml(String(att.name || 'File')) + '</div>' +
            '</div>';
          }
        });
        attachmentsHtml = '<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin-bottom: ' + (sanitizedText ? '8px' : '0') + '; width: 100%; min-width: 250px;">' + gridHtml + '</div>';
      }

      // Hover action bar
      const actionBtns =
        '<button class="msg-action-btn msg-reply-btn" data-msg-id="' + msg.id + '" title="Reply" style="background:none;border:none;cursor:pointer;padding:4px;color:var(--text-secondary);"><i data-lucide="reply" style="width:14px;height:14px;"></i></button>' +
        (isMine ? '<button class="msg-action-btn msg-edit-btn" data-msg-id="' + msg.id + '" title="Edit" style="background:none;border:none;cursor:pointer;padding:4px;color:var(--text-secondary);"><i data-lucide="pencil" style="width:14px;height:14px;"></i></button>' : '') +
        '<button class="msg-action-btn msg-delete-btn" data-msg-id="' + msg.id + '" data-is-mine="' + (isMine ? '1' : '0') + '" title="Delete" style="background:none;border:none;cursor:pointer;padding:4px;color:var(--accent-danger);"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>';

      const actionsBar = '<div class="msg-actions-bar" style="display:none;position:absolute;' + (isMine ? 'left:-8px;' : 'right:-8px;') + 'top:-16px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:8px;padding:2px 4px;box-shadow:var(--shadow-md);z-index:5;gap:2px;">' + actionBtns + '</div>';

      const bubblePadding = (sanitizedText || attachmentsHtml) ? 'padding: 10px 14px;' : 'padding: 0;';
      const bubbleBgMine = (sanitizedText || attachmentsHtml) ? 'background-color: var(--accent-primary); color: white; box-shadow: var(--shadow-sm);' : 'background: transparent;';
      const bubbleBgOther = (sanitizedText || attachmentsHtml) ? 'background-color: var(--bg-surface); box-shadow: var(--shadow-sm);' : 'background: transparent;';

      if (isMine) {
        const myAvatarImg = state.currentUser.avatar
          ? '<img src="' + window.Sanitize.escapeHtml(state.currentUser.avatar) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">'
          : '<i data-lucide="user" style="width:14px;"></i>';
        messagesHtml += '<div class="message-row" data-msg-id="' + msg.id + '" style="display:flex; margin-bottom: var(--spacing-md); flex-direction: row-reverse; align-items: flex-end;">' +
          '<div class="avatar avatar-sm" style="margin-left: var(--spacing-sm); margin-bottom: 4px; flex-shrink: 0;">' + myAvatarImg + '</div>' +
          '<div style="max-width: 65%; display:flex; flex-direction:column; align-items:flex-end;">' +
            '<div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px; margin-right: 4px;">' + timeStr + '</div>' +
            '<div class="message-bubble" data-msg-id="' + msg.id + '" style="position:relative;' + bubbleBgMine + ' ' + bubblePadding + ' border-radius: 16px 16px 0 16px; line-height: 1.4; font-size: 14px; cursor:context-menu; max-width: 100%;" onmouseenter="var el=this.querySelector(\'.msg-actions-bar\');if(el)el.style.display=\'flex\'" onmouseleave="var el=this.querySelector(\'.msg-actions-bar\');if(el)el.style.display=\'none\'">' +
              actionsBar + replyHtml + attachmentsHtml + sanitizedText + editedBadge +
            '</div>' +
          '</div>' +
        '</div>';
      } else {
        const username = window.Sanitize.escapeHtml(activeFriend.username);
        const avatarImg = activeFriend.avatar
          ? '<img src="' + window.Sanitize.escapeHtml(activeFriend.avatar) + '" style="width:100%;height:100%;border-radius:50%;">'
          : '<i data-lucide="user" style="width:14px;"></i>';
        messagesHtml += '<div class="message-row" data-msg-id="' + msg.id + '" style="display:flex; margin-bottom: var(--spacing-md);">' +
          '<div class="avatar avatar-sm" style="margin-right: var(--spacing-sm); margin-top: 4px; flex-shrink: 0;">' + avatarImg + '</div>' +
          '<div style="max-width: 65%;">' +
            '<div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px; margin-left: 4px;">' + username + ' • ' + timeStr + '</div>' +
            '<div class="message-bubble" data-msg-id="' + msg.id + '" style="position:relative;' + bubbleBgOther + ' ' + bubblePadding + ' border-radius: 0 16px 16px 16px; line-height: 1.4; font-size: 14px; cursor:context-menu; max-width: 100%;" onmouseenter="var el=this.querySelector(\'.msg-actions-bar\');if(el)el.style.display=\'flex\'" onmouseleave="var el=this.querySelector(\'.msg-actions-bar\');if(el)el.style.display=\'none\'">' +
              actionsBar + replyHtml + attachmentsHtml + sanitizedText + editedBadgeOther +
            '</div>' +
          '</div>' +
        '</div>';
      }
    });

    // Header avatar
    var headerAvatar = activeFriend.avatar
      ? '<img src="' + window.Sanitize.escapeHtml(activeFriend.avatar) + '" style="width:100%;height:100%;border-radius:50%;">'
      : '<i data-lucide="user"></i>';

    this.container.innerHTML =
      '<!-- Chat Header -->' +
      '<div class="chat-header" style="height: 64px; border-bottom: 1px solid var(--border-subtle); display:flex; align-items:center; padding: 0 var(--spacing-lg);">' +
        '<div class="avatar avatar-md chat-header-avatar" style="margin-right: var(--spacing-md); position:relative; cursor:pointer;">' +
          headerAvatar +
          '<div class="status-indicator ' + window.Sanitize.escapeHtml(activeFriend.status) + '"></div>' +
        '</div>' +
        '<div style="flex:1;">' +
          '<div style="font-weight: 600; font-family: var(--font-display); font-size: 16px;">' + window.Sanitize.escapeHtml(activeFriend.username) + '</div>' +
          '<div style="font-size: 12px; color: var(--accent-success); display:flex; align-items:center; gap:4px;">' +
            '<div style="width:6px;height:6px;background:var(--accent-success);border-radius:50%;"></div> ' + window.Sanitize.escapeHtml(activeFriend.status) +
          '</div>' +
        '</div>' +
        '<div style="display:flex; gap:16px; color: var(--text-secondary);">' +
          '<button id="btn-gallery" title="Image Gallery" style="background:transparent; border:none; cursor:pointer; color:inherit;"><i data-lucide="image"></i></button>' +
          '<button id="btn-chat-more" title="More" style="background:transparent; border:none; cursor:pointer; color:inherit;"><i data-lucide="more-vertical"></i></button>' +
        '</div>' +
      '</div>' +

      '<!-- Message Feed -->' +
      '<div class="message-feed" id="chat-message-feed" style="flex:1; overflow-y:auto; padding: var(--spacing-lg);">' +
        messagesHtml +
      '</div>';
      
    // Progress UI
    let progressHtml = '';
    if (state.transferProgress && Object.keys(state.transferProgress).length > 0) {
      progressHtml = '<div style="margin: 0 var(--spacing-lg) 16px var(--spacing-lg); display: flex; flex-direction: column; gap: 8px;">';
      Object.keys(state.transferProgress).forEach(fileId => {
        const prog = state.transferProgress[fileId];
        const pct = Math.max(0, Math.min(100, Math.floor((prog.received / prog.total) * 100)));
        const label = prog.isSending ? 'Sending File...' : 'Receiving File...';
        progressHtml += '<div style="background: var(--bg-surface); padding: 12px; border-radius: 8px; border: 1px solid var(--border-subtle); box-shadow: var(--shadow-sm); display:flex; flex-direction:column; gap:4px;">' +
           '<div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-secondary);"><span>' + label + '</span><span>' + pct + '%</span></div>' +
           '<div style="width:100%; height:6px; background:var(--bg-hover); border-radius:3px; overflow:hidden;">' +
             '<div style="height:100%; width:' + pct + '%; background:var(--accent-primary); transition:width 0.2s linear;"></div>' +
           '</div>' +
        '</div>';
      });
      progressHtml += '</div>';
    }

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

    this.container.innerHTML +=
      progressHtml +
      '<!-- Chat Input -->' +
      '<div class="chat-input-area" style="padding: var(--spacing-md) var(--spacing-lg) 48px var(--spacing-lg); display: flex; flex-direction: column;">' +
        '<div id="file-preview-area" style="display:none; gap: 8px; padding: 12px; margin-bottom: 8px; overflow-x: auto; white-space: nowrap; border-radius: 16px; background: var(--bg-hover); border: 1px solid var(--border-subtle);"></div>' +
        replyEditBar +
        '<div class="chat-input-wrapper">' +
          '<button id="btn-plus"><i data-lucide="plus-circle"></i></button>' +
          '<input type="text" id="chat-input" class="chat-input-field" placeholder="Message ' + window.Sanitize.escapeHtml(activeFriend.username) + '..."' + (this.editingMsg ? ' value="' + window.Sanitize.escapeHtml(this.editingMsg.text) + '"' : '') + '>' +
          '<button id="btn-emoji"><i data-lucide="smile"></i></button>' +
          '<button id="btn-send"><i data-lucide="send"></i></button>' +
          '<input type="file" id="file-input" style="display:none;" multiple>' +
        '</div>' +
      '</div>';

    lucide.createIcons({ root: this.container });
    
    // Auto scroll to bottom
    var feed = document.getElementById('chat-message-feed');
    if (feed) feed.scrollTop = feed.scrollHeight;

    // Attach local input events
    this.attachEvents();
  },

  attachEvents() {
    var self = this;
    var input = document.getElementById('chat-input');
    if (input) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          var text = input.value.trim();
          if (text !== '' || self.stagedFiles.length > 0) {
            self.sendMessage(text);
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
      btnSend.addEventListener('click', function() {
        var text = input.value.trim();
        if (text !== '' || self.stagedFiles.length > 0) {
          self.sendMessage(text);
          input.value = '';
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
          { label: 'Upload Images', action: 'upload-image', icon: 'image', onClick: function() { 
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
          const isImage = file.type.startsWith('image/');
          self.stagedFiles.push({
            file: file,
            path: file.path,
            name: file.name,
            size: file.size,
            type: isImage ? 'image' : 'file',
            url: isImage ? URL.createObjectURL(file) : null
          });
        }
        
        self.renderPreviewArea();
        fileInput.value = '';
      });
    }

    // Context Menu for messages
    var bubbles = this.container.querySelectorAll('.message-bubble');
    bubbles.forEach(function(bubble) {
      bubble.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        if (!window.ContextMenu) return;
        
        var msgId = bubble.getAttribute('data-msg-id');
        var state = window.store.getState();
        var msgs = state.messages[state.activeChatId] || [];
        var msg = msgs.find(function(m) { return m.id == msgId; });
        if (!msg) return;

        var isMine = msg.sender === state.currentUser.userId;
        var items = [
          { label: 'Reply', action: 'reply', icon: 'corner-up-left', onClick: function() { 
            var input = document.getElementById('chat-input');
            if (input) {
              var snippet = msg.text || 'Attachment';
              if (snippet.length > 25) snippet = snippet.substring(0, 25) + '...';
              input.value = '[Reply to: "' + snippet + '"] ' + input.value;
              input.focus();
            }
          } },
          { label: 'Copy Text', action: 'copy', icon: 'copy', onClick: function() { navigator.clipboard.writeText(msg.text); } },
        ];
        
        if (isMine) {
          items.push('separator');
          items.push({ label: 'Edit Message', action: 'edit', icon: 'edit-2', onClick: function() { console.log('Edit', msg.id); } });
          items.push({ label: 'Delete Message', action: 'delete', icon: 'trash-2', color: 'var(--accent-danger)', onClick: function() { 
            window.store.deleteMessage(state.activeChatId, msg.id);
          } });
        }
        
        window.ContextMenu.show(e.clientX, e.clientY, items);
      });
    });

    var headerAvatarBtn = this.container.querySelector('.chat-header-avatar');
    if (headerAvatarBtn) {
      headerAvatarBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var state = window.store.getState();
        var activeFriend = state.friends.find(function(f) { return f.userId === state.activeChatId; });
        if (activeFriend && window.ProfileCard) window.ProfileCard.open(activeFriend);
      });
    }

    var btnChatMore = document.getElementById('btn-chat-more');
    if (btnChatMore) {
      btnChatMore.addEventListener('click', function(e) {
        e.stopPropagation();
        if (!window.ContextMenu) return;
        var rect = btnChatMore.getBoundingClientRect();
        window.ContextMenu.show(rect.left - 150, rect.bottom + 8, [
          { label: 'Voice Call', action: 'voice-call', icon: 'phone', onClick: function() { console.log('Voice Call'); } },
          { label: 'Video Call', action: 'video-call', icon: 'video', onClick: function() { console.log('Video Call'); } },
          { label: 'Search', action: 'search', icon: 'search', onClick: function() { console.log('Search'); } }
        ]);
      });
    }

    var btnGallery = document.getElementById('btn-gallery');
    if (btnGallery && window.GallerySidebar) {
      btnGallery.addEventListener('click', function() {
        window.GallerySidebar.toggle();
      });
    }
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
      if (staged.type === 'image') {
        html += '<div style="position:relative; width: 64px; height: 64px; border-radius: 8px; overflow:hidden; flex-shrink:0; border: 1px solid var(--border-subtle);">' +
          '<img src="' + staged.url + '" style="width:100%; height:100%; object-fit:cover;">' +
          '<button data-index="' + index + '" class="btn-remove-file" style="position:absolute; top:2px; right:2px; background:rgba(0,0,0,0.6); color:white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; cursor:pointer;"><i data-lucide="x" style="width:12px;height:12px;"></i></button>' +
        '</div>';
      } else {
        html += '<div style="position:relative; width: 64px; height: 64px; border-radius: 8px; background:var(--bg-surface); display:flex; flex-direction:column; align-items:center; justify-content:center; flex-shrink:0; padding:4px; border: 1px solid var(--border-subtle);">' +
          '<i data-lucide="file" style="width:24px;height:24px;color:var(--text-muted); margin-bottom:4px;"></i>' +
          '<span style="font-size:9px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; text-align:center;">' + window.Sanitize.escapeHtml(staged.name) + '</span>' +
          '<button data-index="' + index + '" class="btn-remove-file" style="position:absolute; top:2px; right:2px; background:rgba(0,0,0,0.6); color:white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; cursor:pointer;"><i data-lucide="x" style="width:12px;height:12px;"></i></button>' +
        '</div>';
      }
    });
    
    area.innerHTML = html;
    lucide.createIcons({ root: area });
    
    var self = this;
    area.querySelectorAll('.btn-remove-file').forEach(btn => {
      btn.addEventListener('click', function(e) {
        const idx = parseInt(e.currentTarget.getAttribute('data-index'));
        const removed = self.stagedFiles.splice(idx, 1)[0];
        if (removed && removed.url) URL.revokeObjectURL(removed.url);
        self.renderPreviewArea();
      });
    });
  },

  sendMessage(text) {
    var state = window.store.getState();
    var activeChatId = state.activeChatId;
    if (!activeChatId) return;

    if (!text && this.stagedFiles.length === 0) return;

    const friend = state.friends.find(function(f) { return f.userId === activeChatId; });
    const toIp = friend ? friend.ip : null;
    const myId = state.currentUser.userId;

    // 1. Send files first (if any)
    if (this.stagedFiles.length > 0) {
      const attachments = this.stagedFiles.map(s => ({
        type: s.type,
        name: s.name,
        size: s.size,
        path: s.path,
        url: s.path ? 'orbit-file://' + encodeURIComponent(s.path) : s.url
      }));

      // Trigger actual network transfer
      if (window.orbitAPI && activeChatId !== 'local-echo') {
        this.stagedFiles.forEach(async (s) => {
          try {
             await window.orbitAPI.networkSendFile(activeChatId, toIp, s.path);
          } catch(err) {
             console.error("File send error:", err);
          }
        });
      }

      window.store.addMessage(activeChatId, {
        id: Date.now(),
        sender: myId,
        text: '',
        attachments: attachments,
        timestamp: new Date().toISOString()
      });
      
      this.stagedFiles = [];
      this.renderPreviewArea();
    }

    // 2. Send text message (if any)
    if (text) {
      if (this.editingMsg) {
        // Edit flow
        const msgId = this.editingMsg.id;
        if (window.orbitAPI && activeChatId !== 'local-echo') {
          window.orbitAPI.networkSend(activeChatId, toIp, window.Protocol.Types.MESSAGE_EDIT, { msgId, newText: text });
        }
        window.store.editMessage(activeChatId, msgId, text);
        this.editingMsg = null;
      } else {
        // Send new text
        const msgId = Date.now() + 2;
        var payload = { text: text, msgId: msgId };
        if (this.replyingTo) {
          payload.replyTo = this.replyingTo.id;
        }
        
        if (window.orbitAPI && activeChatId !== 'local-echo') {
          window.orbitAPI.networkSend(activeChatId, toIp, window.Protocol.Types.MESSAGE, payload);
        } else if (activeChatId === 'local-echo') {
          setTimeout(() => {
            window.store.addMessage('local-echo', {
              id: Date.now() + 1,
              sender: 'local-echo',
              text: 'Echo: ' + text,
              replyTo: payload.replyTo,
              timestamp: new Date().toISOString()
            });
          }, 500);
        }
        
        window.store.addMessage(activeChatId, {
          id: msgId,
          sender: myId,
          text: text,
          replyTo: payload.replyTo,
          timestamp: new Date().toISOString()
        });
        
        this.replyingTo = null;
      }
      
      // Clear UI state
      var input = document.getElementById('chat-input');
      if (input) input.value = '';
      window.store.notify();
    }
  }
};
