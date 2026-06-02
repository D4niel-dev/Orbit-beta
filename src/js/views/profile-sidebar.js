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

    var avatarImg = user.avatar
      ? '<img src="' + window.Sanitize.escapeHtml(user.avatar) + '" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid var(--bg-surface);">'
      : '<div style="width:80px;height:80px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:32px;color:white;font-weight:600;">' + user.username.charAt(0).toUpperCase() + '</div>';

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
        '<div ' + bannerHtml + ' style="height:120px;position:relative;flex-shrink:0;">' +
          '<div style="position:absolute;bottom:-40px;left:50%;transform:translateX(-50%);">' +
            avatarImg +
          '</div>' +
        '</div>' +

        // Content area
        '<div style="flex:1;padding:48px 20px 20px;text-align:center;">' +
          // Avatar on top of name
          '<div style="margin-bottom:8px;">' +
            (user.avatar
              ? '<img src="' + window.Sanitize.escapeHtml(user.avatar) + '" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:3px solid var(--bg-surface);">'
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

          // User ID
          '<div style="margin-top:16px;text-align:left;">' +
            '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:4px;">User ID</div>' +
            '<div style="font-size:12px;color:var(--text-secondary);font-family:var(--font-mono);word-break:break-all;padding:8px;background:var(--bg-base);border-radius:4px;">' + window.Sanitize.escapeHtml(user.userId) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    if (window.lucide) window.lucide.createIcons({ root: this.contentArea });

    var closeBtn = this.contentArea.querySelector('#btn-close-profile-sidebar');
    if (closeBtn) {
      closeBtn.addEventListener('click', function(e) { e.stopPropagation(); self.close(); });
    }
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