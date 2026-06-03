window.ActivityCenter = {
  show() {
    if (this._overlay) return;
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) window.ActivityCenter.close(); });

    var modal = document.createElement('div');
    modal.style.cssText = 'background:var(--bg-surface);border-radius:16px;padding:24px;max-width:520px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.4);border:1px solid var(--border-subtle);';

    var state = window.store.getState();
    var messages = state.messages || {};
    var friends = state.friends || [];
    var groups = state.groups || [];
    var myId = state.currentUser && state.currentUser.userId;

    var getAvatarHtml = function(userId, name) {
      var found;
      if (userId === myId) {
        found = state.currentUser;
      } else {
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
        return '<img src="' + window.Sanitize.escapeHtml(found.avatar) + '" style="width:20px;height:20px;border-radius:50%;object-fit:cover;flex-shrink:0;">';
      }
      return '<div style="width:20px;height:20px;border-radius:50%;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;color:var(--text-muted);font-weight:600;">' + (name ? name.charAt(0).toUpperCase() : '?') + '</div>';
    };

    var activityHtml = '';
    var chatIds = Object.keys(messages).sort(function(a, b) {
      var aMsgs = messages[a];
      var bMsgs = messages[b];
      var aLast = aMsgs && aMsgs.length > 0 ? new Date(aMsgs[aMsgs.length - 1].timestamp).getTime() : 0;
      var bLast = bMsgs && bMsgs.length > 0 ? new Date(bMsgs[bMsgs.length - 1].timestamp).getTime() : 0;
      return bLast - aLast;
    });

    chatIds.forEach(function(chatId) {
      if (chatId === 'local-echo') return;
      var msgs = messages[chatId] || [];
      if (msgs.length === 0) return;

      var friend = friends.find(function(f) { return f.userId === chatId; });
      var group = groups.find(function(g) { return g.groupId === chatId; });
      var chatName = friend ? friend.username : (group ? group.groupName : chatId.substring(0, 8));
      var hasAvatar = (friend && friend.avatar) || (group && group.avatarPath);
      var chatAvatar = friend && friend.avatar ? '<img src="' + window.Sanitize.escapeHtml(friend.avatar) + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover;">' : (group && group.avatarPath ? '<img src="orbit-avatar://' + window.Sanitize.escapeHtml(group.groupId) + '?t=' + (group.avatarUpdatedAt || 0) + '" style="width:28px;height:28px;border-radius:12px;object-fit:cover;">' : '<div style="width:28px;height:28px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:11px;color:white;font-weight:600;">' + chatName.charAt(0).toUpperCase() + '</div>');

      var recent = msgs.slice(-5).reverse();
      var msgItems = recent.map(function(m) {
        var isMe = m.sender === myId;
        var senderName = isMe ? 'You' : chatName;
        var senderAvatar = getAvatarHtml(m.sender, senderName);

        var text;
        if (m.text) {
          text = window.Sanitize.escapeHtml(m.text);
          if (text.length > 40) text = text.substring(0, 40) + '...';
        } else if (m.attachments && m.attachments.length > 0) {
          text = '<i data-lucide="paperclip" style="width:12px;height:12px;display:inline-block;vertical-align:middle;"></i> ' + window.Sanitize.escapeHtml(String(m.attachments.length) + ' attachment' + (m.attachments.length > 1 ? 's' : ''));
        } else {
          text = '';
        }
        var time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        return '<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--border-subtle);">' +
          '<span style="font-size:11px;color:var(--text-muted);flex-shrink:0;width:36px;text-align:right;">' + time + '</span>' +
          senderAvatar +
          '<span style="font-size:12px;color:var(--text-secondary);font-weight:500;flex-shrink:0;">' + window.Sanitize.escapeHtml(senderName) + ':</span>' +
          '<span style="font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + text + '</span>' +
        '</div>';
      }).join('');

      activityHtml += '<div style="margin-bottom:12px;cursor:pointer;" onclick="window.ActivityCenter.close();window.store.setState({activeChatId:\'' + chatId + '\',activeTab:\'dms\'})">' +
        '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;background:var(--bg-base);border:1px solid var(--border-subtle);">' +
          chatAvatar +
          '<div style="flex:1;font-size:13px;font-weight:600;color:var(--text-primary);">' + window.Sanitize.escapeHtml(chatName) + '</div>' +
          '<span style="font-size:11px;color:var(--text-muted);">' + msgs.length + ' messages</span>' +
        '</div>' +
        '<div style="padding:4px 12px 0 48px;">' + msgItems + '</div>' +
      '</div>';
    });

    if (!activityHtml) {
      activityHtml = '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:14px;">No activity yet.<br>Start chatting to see your recent messages here.</div>';
    }

    modal.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">' +
        '<h2 style="margin:0;font-size:18px;font-weight:700;color:var(--text-primary);">Activity Center</h2>' +
        '<button id="activity-close" style="background:transparent;border:none;cursor:pointer;color:var(--text-secondary);padding:4px;"><i data-lucide="x" style="width:20px;height:20px;"></i></button>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px;">Recent messages across all chats</div>' +
      '<div>' + activityHtml + '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this._overlay = overlay;

    if (window.lucide) window.lucide.createIcons({ root: modal });

    modal.querySelector('#activity-close').addEventListener('click', function() { window.ActivityCenter.close(); });
    document.addEventListener('keydown', this._escHandler = function(e) {
      if (e.key === 'Escape') window.ActivityCenter.close();
    });
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
