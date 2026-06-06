window.ActivityCenter = {
  activeTab: 'all',

  show() {
    if (this._overlay) return;
    this.activeTab = 'all';
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) window.ActivityCenter.close(); });

    var modal = document.createElement('div');
    modal.style.cssText = 'background:var(--bg-surface);border-radius:16px;padding:24px;max-width:520px;width:90%;height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.4);border:1px solid var(--border-subtle);';

    modal.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-shrink:0;">' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
          '<h2 style="margin:0;font-size:18px;font-weight:700;color:var(--text-primary);">Activity Center</h2>' +
          '<button id="btn-clear-activity" style="background:var(--bg-hover);border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:600;color:var(--text-secondary);cursor:pointer;transition:var(--transition);">Clear All</button>' +
        '</div>' +
        '<button id="activity-close" style="background:transparent;border:none;cursor:pointer;color:var(--text-secondary);padding:4px;"><i data-lucide="x" style="width:20px;height:20px;"></i></button>' +
      '</div>' +
      '<div style="display:flex;gap:16px;border-bottom:1px solid var(--border-subtle);margin-bottom:16px;flex-shrink:0;" id="activity-tabs">' +
        '<div class="activity-tab active" data-tab="all" style="padding:8px 0;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);border-bottom:2px solid var(--accent-primary);">All</div>' +
        '<div class="activity-tab" data-tab="mentions" style="padding:8px 0;cursor:pointer;font-size:13px;font-weight:500;color:var(--text-secondary);border-bottom:2px solid transparent;">Mentions</div>' +
        '<div class="activity-tab" data-tab="files" style="padding:8px 0;cursor:pointer;font-size:13px;font-weight:500;color:var(--text-secondary);border-bottom:2px solid transparent;">Files</div>' +
        '<div class="activity-tab" data-tab="system" style="padding:8px 0;cursor:pointer;font-size:13px;font-weight:500;color:var(--text-secondary);border-bottom:2px solid transparent;">System</div>' +
      '</div>' +
      '<div id="activity-content" style="flex:1;overflow-y:auto;padding-right:4px;"></div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this._overlay = overlay;
    this._content = modal.querySelector('#activity-content');

    if (window.lucide) window.lucide.createIcons({ root: modal });

    var self = this;
    modal.querySelector('#activity-close').addEventListener('click', function() { self.close(); });
    
    // Tab switching
    modal.querySelectorAll('.activity-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        modal.querySelectorAll('.activity-tab').forEach(function(t) {
          t.classList.remove('active');
          t.style.fontWeight = '500';
          t.style.color = 'var(--text-secondary)';
          t.style.borderBottomColor = 'transparent';
        });
        tab.classList.add('active');
        tab.style.fontWeight = '600';
        tab.style.color = 'var(--text-primary)';
        tab.style.borderBottomColor = 'var(--accent-primary)';
        self.activeTab = tab.getAttribute('data-tab');
        self.renderContent();
      });
    });

    modal.querySelector('#btn-clear-activity').addEventListener('click', function() {
      // Clear functionality dismisses older events
      var now = new Date().toISOString();
      if (self.activeTab === 'system') {
        window.store.setState({ systemLogClearedAt: now });
      } else {
        window.store.setState({ activityClearedAt: now });
      }
      self.renderContent();
    });

    modal.addEventListener('click', function(e) {
      var row = e.target.closest('[data-activity-chat]');
      if (row) {
        var chatId = row.getAttribute('data-activity-chat');
        var msgId = row.getAttribute('data-msg-id');
        self.close();
        window.store.setState({ activeChatId: chatId, activeTab: 'dms' });
        if (msgId) {
          setTimeout(function() {
            var el = document.querySelector('[data-msg-id="' + msgId + '"].message-row');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 200);
        }
      }
    });

    document.addEventListener('keydown', this._escHandler = function(e) {
      if (e.key === 'Escape') self.close();
    });

    this.renderContent();
  },

  renderContent() {
    if (!this._content) return;
    var state = window.store.getState();
    var messages = state.messages || {};
    var friends = state.friends || [];
    var groups = state.groups || [];
    var myId = state.currentUser && state.currentUser.userId;
    var clearedAt = state.activityClearedAt ? new Date(state.activityClearedAt).getTime() : 0;
    var sysClearedAt = state.systemLogClearedAt ? new Date(state.systemLogClearedAt).getTime() : 0;

    var getAvatarHtml = function(userId, name) {
      var found;
      if (userId === myId) found = state.currentUser;
      else {
        found = friends.find(function(f) { return f.userId === userId; });
        if (!found) {
          groups.forEach(function(g) {
            if (g.members) {
              var m = g.members.find(function(mm) { return mm.userId === userId; });
              if (m) found = m;
            }
          });
        }
      }
      if (found && found.avatar) {
        return '<img src="' + window.Sanitize.escapeHtml(found.avatar) + '" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;">';
      }
      return '<div style="width:24px;height:24px;border-radius:50%;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;color:var(--text-muted);font-weight:600;">' + (name ? name.charAt(0).toUpperCase() : '?') + '</div>';
    };

    var activityHtml = '';

    if (this.activeTab === 'system') {
      var logs = state.activityLog || [];
      logs = logs.filter(function(l) { return new Date(l.timestamp).getTime() > sysClearedAt; });
      if (logs.length === 0) {
        activityHtml = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted);text-align:center;gap:8px;"><i data-lucide="activity" style="width:40px;height:40px;opacity:0.3;"></i><div style="font-size:14px;">No system activity recently.</div></div>';
      } else {
        activityHtml = logs.slice().reverse().map(function(l) {
          var time = new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          var icon = l.type === 'peer_connect' ? 'link' : (l.type === 'peer_disconnect' ? 'link-2-off' : 'info');
          var color = l.type === 'peer_connect' ? 'var(--accent-success)' : (l.type === 'peer_disconnect' ? 'var(--accent-danger)' : 'var(--accent-primary)');
          return '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;margin-bottom:8px;border-radius:12px;background:var(--bg-base);border:1px solid var(--border-subtle);">' +
            '<span style="font-size:11px;color:var(--text-muted);flex-shrink:0;width:40px;text-align:right;">' + time + '</span>' +
            '<div style="width:32px;height:32px;border-radius:50%;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;color:' + color + ';"><i data-lucide="' + icon + '" style="width:16px;height:16px;"></i></div>' +
            '<span style="font-size:13px;color:var(--text-primary);flex:1;">' + window.Sanitize.escapeHtml(l.message) + '</span>' +
          '</div>';
        }).join('');
      }
    } else {
      // Unified timeline for All, Mentions, Files
      var allEvents = [];
      Object.keys(messages).forEach(function(chatId) {
        if (chatId === 'local-echo') return;
        var msgs = messages[chatId] || [];
        
        var friend = friends.find(function(f) { return f.userId === chatId; });
        var group = groups.find(function(g) { return g.groupId === chatId; });
        var chatName = friend ? friend.username : (group ? group.groupName : chatId.substring(0, 8));
        var chatAvatar = friend && friend.avatar ? '<img src="' + window.Sanitize.escapeHtml(friend.avatar) + '" style="width:16px;height:16px;border-radius:50%;object-fit:cover;">' : (group && group.avatarPath ? '<img src="orbit-avatar://' + window.Sanitize.escapeHtml(group.groupId) + '?t=' + (group.avatarUpdatedAt || 0) + '" style="width:16px;height:16px;border-radius:4px;object-fit:cover;">' : '<div style="width:16px;height:16px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:9px;color:white;font-weight:600;">' + chatName.charAt(0).toUpperCase() + '</div>');

        msgs.forEach(function(m) {
          if (new Date(m.timestamp).getTime() <= clearedAt) return;
          var isMe = m.sender === myId;
          
          if (this.activeTab === 'mentions') {
            var isMention = m.text && state.currentUser && state.currentUser.username && (m.text.includes('@' + state.currentUser.username) || m.text.includes('@everyone'));
            if (!isMention) return;
          }
          if (this.activeTab === 'files') {
            if (!m.attachments || m.attachments.length === 0) return;
          }
          
          allEvents.push({
            chatId: chatId,
            chatName: chatName,
            chatAvatar: chatAvatar,
            msg: m,
            isMe: isMe,
            ts: new Date(m.timestamp).getTime()
          });
        }.bind(this));
      }.bind(this));

      allEvents.sort(function(a, b) { return b.ts - a.ts; });
      allEvents = allEvents.slice(0, 100);

      if (allEvents.length === 0) {
        var emptyText = this.activeTab === 'mentions' ? 'No recent mentions.' : (this.activeTab === 'files' ? 'No recent files.' : 'No chat activity recently.');
        var emptyIcon = this.activeTab === 'mentions' ? 'at-sign' : (this.activeTab === 'files' ? 'file' : 'message-square');
        activityHtml = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted);text-align:center;gap:8px;"><i data-lucide="' + emptyIcon + '" style="width:40px;height:40px;opacity:0.3;"></i><div style="font-size:14px;">' + emptyText + '</div></div>';
      } else {
        activityHtml = allEvents.map(function(ev) {
          var senderName = ev.isMe ? 'You' : ev.chatName;
          if (ev.msg.sender !== myId) {
            var foundF = friends.find(function(f){return f.userId === ev.msg.sender});
            if (foundF) senderName = foundF.username;
            else {
               var g = groups.find(function(g) { return g.groupId === ev.chatId; });
               if (g && g.members) {
                 var foundM = g.members.find(function(m) { return m.userId === ev.msg.sender; });
                 if (foundM) senderName = foundM.username;
               }
            }
          }
          
          var senderAvatar = getAvatarHtml(ev.msg.sender, senderName);
          var text;
          if (ev.msg.text) {
            text = window.Sanitize.escapeHtml(ev.msg.text);
            if (text.length > 100) text = text.substring(0, 100) + '...';
          } else if (ev.msg.attachments && ev.msg.attachments.length > 0) {
            var fileNames = ev.msg.attachments.map(function(a) { return a.name; }).join(', ');
            text = '<i data-lucide="paperclip" style="width:12px;height:12px;display:inline-block;vertical-align:middle;color:var(--accent-primary);"></i> <span style="color:var(--accent-primary);font-style:italic;">File: ' + window.Sanitize.escapeHtml(fileNames) + '</span>';
          } else {
            text = '';
          }
          var time = ev.msg.timestamp ? new Date(ev.msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          
          return '<div data-activity-chat="' + ev.chatId + '" data-msg-id="' + ev.msg.id + '" style="margin-bottom:12px;cursor:pointer;padding:16px;border-radius:12px;background:var(--bg-base);border:1px solid var(--border-subtle);transition:var(--transition);display:flex;flex-direction:column;gap:12px;" onmouseenter="this.style.borderColor=\'var(--accent-primary)\';" onmouseleave="this.style.borderColor=\'var(--border-subtle)\';">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;">' +
              '<div style="display:flex;align-items:center;gap:6px;background:var(--bg-hover);padding:2px 8px 2px 2px;border-radius:12px;">' + ev.chatAvatar + '<span style="font-size:11px;font-weight:600;color:var(--text-secondary);">' + window.Sanitize.escapeHtml(ev.chatName) + '</span></div>' +
              '<span style="font-size:11px;color:var(--text-muted);">' + time + '</span>' +
            '</div>' +
            '<div style="display:flex;align-items:flex-start;gap:12px;padding-left:4px;">' +
              senderAvatar +
              '<div style="flex:1;min-width:0;">' +
                '<div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">' + window.Sanitize.escapeHtml(senderName) + '</div>' +
                '<div style="font-size:13px;color:var(--text-secondary);line-height:1.5;word-wrap:break-word;">' + text + '</div>' +
              '</div>' +
            '</div>' +
          '</div>';
        });
        activityHtml = activityHtml.join('');
      }
    }

    this._content.innerHTML = activityHtml;
    if (window.lucide) window.lucide.createIcons({ root: this._content });
  },

  close() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
  }
};
