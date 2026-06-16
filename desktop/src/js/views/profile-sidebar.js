// src/js/views/profile-sidebar.js

window.ProfileSidebar = {
  isOpen: false,
  currentUserId: null,

  init() {
    this.container = document.getElementById('panel-profile');
    this.contentArea = document.getElementById('profile-sidebar-content');

    if (!this.container) return;

    this.attachEvents();
  },

  attachEvents() {
    var self = this;

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && self.isOpen) {
        self.close();
      }
    });
  },

  render(user) {
    var self = this;
    if (!user) {
      this.contentArea.innerHTML = '';
      return;
    }

    var bannerHtml = user.banner
      ? (user.banner.startsWith('#') || user.banner.startsWith('linear-gradient')
        ? 'style="background:' + window.Sanitize.escapeHtml(user.banner) + ';"'
        : 'style="background-image:url(' + window.Sanitize.escapeHtml(user.banner) + ');background-size:cover;background-position:center;"')
      : 'style="background:linear-gradient(135deg,var(--accent-primary),#6C5CE7);"';

    var bioHtml = user.bio
      ? window.Sanitize.markdown(user.bio)
      : '<span style="color:var(--text-muted);font-style:italic;">No bio yet...</span>';

    var isOnline = user.status === 'online';
    var statusColors = { online: '#22c55e', away: '#eab308', busy: '#ef4444', dnd: '#ef4444', offline: '#6b7280', invisible: '#6b7280' };
    var statusLabels = { online: 'Online', away: 'Away', busy: 'Busy', dnd: 'Do Not Disturb', invisible: 'Invisible', offline: 'Offline' };
    var statusColor = statusColors[user.status] || '#6b7280';
    var statusLabel = statusLabels[user.status] || 'Offline';

    var lastSeenHtml = '';
    if (!isOnline && user.status !== 'invisible' && user.lastSeen) {
      var lastSeenStr = window.Format.relativeTime ? window.Format.relativeTime(new Date(user.lastSeen).toISOString()) : window.Format.absoluteTime(new Date(user.lastSeen).toISOString());
      lastSeenHtml = '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Last seen ' + lastSeenStr + '</div>';
    }

    this.contentArea.innerHTML =
      '<div style="display:flex;flex-direction:column;height:100%;">' +
        // Close button
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border-subtle);">' +
          '<span style="font-weight:600;font-size:14px;color:var(--text-primary);">Profile</span>' +
          '<button id="btn-close-profile-sidebar" style="background:transparent;border:none;cursor:pointer;color:var(--text-secondary);padding:4px;border-radius:4px;"><i data-lucide="x" style="width:18px;height:18px;"></i></button>' +
        '</div>' +

        // Banner area
        '<div ' + bannerHtml + ' style="height:80px;flex-shrink:0;"></div>' +

        // Content area
        '<div style="flex:1;padding:20px;text-align:center;">' +
          // Avatar
        '<div style="margin-bottom:8px;">' +
          (user.avatar
            ? (function() {
              var frame = window.Frames.getFrameForUser(user.userId);
              var img = '<img src="' + window.Sanitize.escapeHtml(user.avatar) + '" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:3px solid var(--bg-surface);">';
              return frame ? '<div style="position:relative;display:inline-block;">' + img + '<img src="icons/frames/pfp_frame_' + frame + '.png" style="position:absolute;top:-21%;left:-17%;width:133%;height:133%;pointer-events:none;object-fit:contain;" draggable="false" alt=""></div>' : img;
            })()
            : '<div style="width:64px;height:64px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:24px;color:white;font-weight:600;margin:0 auto;">' + user.username.charAt(0).toUpperCase() + '</div>'
          ) +
        '</div>' +
          '<h2 style="font-size:20px;font-weight:700;color:var(--text-primary);margin:0 0 4px;">' + window.Sanitize.escapeHtml(user.username) + '</h2>' +
          '<div style="font-size:13px;color:var(--text-muted);font-family:var(--font-mono);margin-bottom:12px;">#' + window.Sanitize.escapeHtml(user.usertag || '') + '</div>' +
          '<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:16px;">' +
            '<span style="width:8px;height:8px;border-radius:50%;background:' + statusColor + ';display:inline-block;"></span>' +
            '<span style="font-size:12px;color:var(--text-muted);">' + window.Sanitize.escapeHtml(statusLabel) + '</span>' +
            lastSeenHtml +
          '</div>' +

          // Bio
          '<div style="text-align:left;background:var(--bg-base);border-radius:8px;padding:12px;font-size:13px;color:var(--text-primary);line-height:1.6;border:1px solid var(--border-subtle);">' +
            bioHtml +
          '</div>' +

          // Mute toggle
          '<div id="profile-mute-row" style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--bg-base);border-radius:8px;border:1px solid var(--border-subtle);cursor:pointer;">' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
              '<i data-lucide="bell" id="profile-mute-icon" style="width:18px;height:18px;color:var(--text-secondary);"></i>' +
              '<span id="profile-mute-label" style="font-size:13px;font-weight:500;color:var(--text-primary);">Mute Notifications</span>' +
            '</div>' +
            '<div id="profile-mute-toggle" style="width:36px;height:20px;border-radius:10px;background:var(--border-subtle);position:relative;transition:background 0.2s;flex-shrink:0;">' +
              '<div style="width:16px;height:16px;border-radius:50%;background:#fff;position:absolute;top:2px;left:2px;transition:transform 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></div>' +
            '</div>' +
          '</div>' +

          // User ID
          '<div style="margin-top:16px;text-align:left;">' +
            '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:4px;">User ID</div>' +
            '<div style="font-size:12px;color:var(--text-secondary);font-family:var(--font-mono);word-break:break-all;padding:8px;background:var(--bg-base);border-radius:4px;">' + window.Sanitize.escapeHtml(user.userId) + '</div>' +
          '</div>' +

          // Block/Unblock button
          '<div id="profile-block-row" style="margin-top:16px;display:flex;align-items:center;justify-content:center;padding:12px;background:var(--bg-base);border-radius:8px;border:1px solid var(--border-subtle);cursor:pointer;">' +
            '<i data-lucide="ban" id="profile-block-icon" style="width:18px;height:18px;color:var(--accent-danger);flex-shrink:0;"></i>' +
            '<span id="profile-block-label" style="font-size:13px;font-weight:500;color:var(--accent-danger);margin-left:8px;">Block User</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    if (window.lucide) window.lucide.createIcons({ root: this.contentArea });

    var closeBtn = this.contentArea.querySelector('#btn-close-profile-sidebar');
    if (closeBtn) {
      closeBtn.addEventListener('click', function(e) { e.stopPropagation(); self.close(); });
    }

    // Mute toggle
    var muteRow = this.contentArea.querySelector('#profile-mute-row');
    if (muteRow) {
      var state = window.store.getState();
      var isMuted = state.mutedChats && state.mutedChats[user.userId];
      self._updateMuteUI(isMuted);

      muteRow.addEventListener('click', function(e) {
        e.stopPropagation();
        window.store.toggleMute(user.userId);
        var newState = window.store.getState();
        var nowMuted = newState.mutedChats && newState.mutedChats[user.userId];
        self._updateMuteUI(nowMuted);
      });
    }

    // Block/Unblock button
    var blockRow = this.contentArea.querySelector('#profile-block-row');
    if (blockRow) {
      var isBlocked = window.store.isUserBlocked(user.userId);
      self._updateBlockUI(isBlocked);

      blockRow.addEventListener('click', function(e) {
        e.stopPropagation();
        var nowBlocked = window.store.isUserBlocked(user.userId);
        if (nowBlocked) {
          window.store.unblockUser(user.userId);
        } else {
          window.store.blockUser(user.userId);
        }
        self._updateBlockUI(window.store.isUserBlocked(user.userId));
      });
    }
  },

  _updateBlockUI(isBlocked) {
    var icon = this.contentArea.querySelector('#profile-block-icon');
    var label = this.contentArea.querySelector('#profile-block-label');
    if (!icon || !label) return;
    if (isBlocked) {
      icon.setAttribute('data-lucide', 'user-check');
      icon.style.color = 'var(--accent-success)';
      label.textContent = 'Unblock User';
      label.style.color = 'var(--accent-success)';
    } else {
      icon.setAttribute('data-lucide', 'ban');
      icon.style.color = 'var(--accent-danger)';
      label.textContent = 'Block User';
      label.style.color = 'var(--accent-danger)';
    }
    if (window.lucide) window.lucide.createIcons({ root: this.contentArea });
  },

  _updateMuteUI(isMuted) {
    var icon = this.contentArea.querySelector('#profile-mute-icon');
    var label = this.contentArea.querySelector('#profile-mute-label');
    var toggle = this.contentArea.querySelector('#profile-mute-toggle');
    if (!icon || !label || !toggle) return;
    if (isMuted) {
      icon.setAttribute('data-lucide', 'bell-off');
      icon.style.color = 'var(--accent-danger)';
      label.textContent = 'Unmute Notifications';
      toggle.style.background = 'var(--accent-danger)';
      toggle.querySelector('div').style.transform = 'translateX(16px)';
    } else {
      icon.setAttribute('data-lucide', 'bell');
      icon.style.color = 'var(--text-secondary)';
      label.textContent = 'Mute Notifications';
      toggle.style.background = 'var(--border-subtle)';
      toggle.querySelector('div').style.transform = 'translateX(0)';
    }
    if (window.lucide) window.lucide.createIcons({ root: this.contentArea });
  },

  open(user) {
    if (!this.container || !user) return;
    this.currentUserId = user.userId;
    this.render(user);
    this.container.style.display = 'flex';
    this.isOpen = true;
  },

  close() {
    if (!this.container) return;
    this.container.style.display = 'none';
    this.isOpen = false;
    this.currentUserId = null;
  }
};

document.addEventListener('DOMContentLoaded', function() {
  window.ProfileSidebar.init();
});