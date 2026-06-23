window.AccountSwitcher = {
  container: null,
  isOpen: false,

  init() {
    this.container = document.createElement('div');
    this.container.id = 'account-switcher-panel';
    this.container.style.cssText = 'display:none;position:fixed;bottom:12px;left:72px;width:280px;max-height:360px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow-xl);z-index:10000;flex-direction:column;overflow:hidden;';
    document.body.appendChild(this.container);

    document.addEventListener('click', function(e) {
      if (self.isOpen && !self.container.contains(e.target) && !e.target.closest('#btn-profile')) {
        self.close();
      }
    });
    var self = this;
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && self.isOpen) self.close();
    });
  },

  open() {
    if (this.isOpen) { this.close(); return; }
    this.render();
    this.container.style.display = 'flex';
    this.isOpen = true;
  },

  close() {
    this.container.style.display = 'none';
    this.isOpen = false;
  },

  toggle() {
    this.isOpen ? this.close() : this.open();
  },

  render() {
    var state = window.store.getState();
    var currentUser = state.currentUser;
    var allUsers = window.Identity.getAll();
    var others = allUsers.filter(function(u) { return u.userId !== currentUser.userId; });
    var self = this;

    var html = '';

    // Helper for frame overlay HTML
    function frameHtml(frameNum) {
      if (!frameNum || frameNum === 0) return '';
      var src = 'icons/frames/pfp_frame_' + frameNum + '.png';
      return '<img src="' + src + '" style="position:absolute;top:-16%;left:-17%;width:133%;height:133%;pointer-events:none;object-fit:contain;" draggable="false">';
    }

    // Current account
    var curFrame = currentUser && currentUser.profileFrame || 0;
    var curAvatar = currentUser && currentUser.avatar
      ? '<img src="' + window.Sanitize.escapeHtml(currentUser.avatar) + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">'
      : '<i data-lucide="user" style="width:18px;height:18px;"></i>';
    html += '<div style="padding:16px 16px 12px;border-bottom:1px solid var(--border-subtle);">' +
      '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Current Account</div>' +
      '<div style="display:flex;align-items:center;gap:12px;">' +
        '<div style="position:relative;width:36px;height:36px;flex-shrink:0;">' + curAvatar + frameHtml(curFrame) +
          '<div class="status-indicator online" style="position:absolute;bottom:0;right:0;width:10px;height:10px;border:2px solid var(--bg-surface);border-radius:50%;background:var(--accent-success);"></div>' +
        '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:14px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window.Sanitize.escapeHtml(currentUser.username) + '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);">#' + window.Sanitize.escapeHtml(currentUser.usertag) + '</div>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--accent-success);font-weight:500;">Active</div>' +
      '</div>' +
    '</div>';

    // Other accounts
    if (others.length > 0) {
      html += '<div style="flex:1;overflow-y:auto;padding:8px 0;">' +
        '<div style="padding:4px 16px 8px;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Other Accounts</div>';
      others.forEach(function(acc) {
        var accFrame = acc.profileFrame || 0;
        var accAvatar = acc.avatar
          ? '<img src="' + window.Sanitize.escapeHtml(acc.avatar) + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">'
          : '<i data-lucide="user" style="width:16px;height:16px;"></i>';
        var userId = acc.userId;
        html += '<div class="as-account-row" data-user-id="' + window.Sanitize.escapeHtml(userId) + '" style="display:flex;align-items:center;gap:10px;padding:8px 16px;cursor:pointer;transition:background 0.15s;border-radius:0;">' +
          '<div style="position:relative;width:32px;height:32px;flex-shrink:0;">' + accAvatar + frameHtml(accFrame) + '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:13px;font-weight:500;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window.Sanitize.escapeHtml(acc.username) + '</div>' +
            '<div style="font-size:11px;color:var(--text-muted);">#' + window.Sanitize.escapeHtml(acc.usertag) + '</div>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    }

    // Add Another Account (only if 0 other accounts exist)
    if (others.length === 0) {
      html += '<div id="as-add-account" style="padding:8px 16px 12px;border-top:1px solid var(--border-subtle);">' +
        '<button style="width:100%;padding:10px;border-radius:10px;border:1px dashed var(--border-subtle);background:transparent;color:var(--accent-primary);font-size:13px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:background 0.15s;">' +
          '<i data-lucide="plus" style="width:16px;height:16px;"></i> Add Another Account' +
        '</button>' +
      '</div>';
    }

    // Logout
    html += '<div style="border-top:1px solid var(--border-subtle);padding:8px 16px;">' +
      '<button id="as-logout" style="width:100%;padding:10px;border-radius:10px;border:none;background:transparent;color:var(--accent-danger);font-size:13px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:background 0.15s;">' +
        '<i data-lucide="log-out" style="width:16px;height:16px;"></i> Logout' +
      '</button>' +
    '</div>';

    this.container.innerHTML = html;

    // Hover effects for account rows
    this.container.querySelectorAll('.as-account-row').forEach(function(row) {
      row.addEventListener('mouseenter', function() { this.style.background = 'var(--bg-hover)'; });
      row.addEventListener('mouseleave', function() { this.style.background = 'transparent'; });
    });

    // Add account button
    var addBtn = this.container.querySelector('#as-add-account');
    if (addBtn) {
      addBtn.querySelector('button').addEventListener('click', function() {
        self.close();
        self._addAccount();
      });
    }

    // Logout button
    this.container.querySelector('#as-logout').addEventListener('click', function() {
      self.close();
      self._logout();
    });

    // Switch account on row click
    this.container.querySelectorAll('.as-account-row').forEach(function(row) {
      row.addEventListener('click', function() {
        var targetId = this.getAttribute('data-user-id');
        self.close();
        self._switchTo(targetId);
      });
    });

    if (window.lucide) window.lucide.createIcons({ root: this.container });
  },

  _addAccount() {
    var newIdentity = window.Identity.generateNew();
    window.Identity.save(newIdentity);
    var self = this;
    this._doSwitch(newIdentity, function() {
      console.log('[AccountSwitcher] Added and switched to new account:', newIdentity.username + '#' + newIdentity.usertag);
    });
  },

  _switchTo(userId) {
    var target = null;
    var allUsers = window.Identity.getAll();
    allUsers.forEach(function(u) { if (u.userId === userId) target = u; });
    if (!target) return;
    this._doSwitch(target, function() {
      console.log('[AccountSwitcher] Switched to:', target.username + '#' + target.usertag);
    });
  },

  _doSwitch(targetIdentity, callback) {
    if (window.orbitAPI) {
      window.orbitAPI.networkStop();
    }
    window.Identity.switchTo(targetIdentity.userId);
    // Reload data from DB filtered for the new user
    if (window.store) window.store.reloadDataForCurrentUser();
    var state = window.store.getState();
    var reconnectEnabled = state.settings ? state.settings.netReconnectEnabled !== false : true;
    var reconnectInterval = state.settings ? (state.settings.netReconnectInterval || 10000) : 10000;
    if (window.orbitAPI) {
      window.orbitAPI.networkStart(targetIdentity, reconnectEnabled, reconnectInterval);
    }
    if (window.SidebarLeft) window.SidebarLeft.renderAvatar(targetIdentity);
    if (window.SidebarMiddle) {
      var s = window.store.getState();
      window.SidebarMiddle.renderList(s);
      window.SidebarMiddle.renderGroups();
    }
    if (callback) callback();
  },

  _logout() {
    if (window.orbitAPI) {
      window.orbitAPI.relaunchApp();
    }
  }
};
