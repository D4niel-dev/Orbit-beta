// src/js/components/profile-card.js

window.ProfileCard = {
  isOpen: false,

  init() {
    this.container = document.createElement('div');
    this.container.id = 'profile-card-container';
    this.container.style.cssText = 'display:none;position:absolute;bottom:80px;left:20px;width:300px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow-lg);z-index:1000;overflow:hidden;flex-direction:column;';
    document.body.appendChild(this.container);
    this.attachEvents();
    var self = this;
    this.currentUserBeingViewed = null;
    window.store.subscribe(function(state) {
      if (self.isOpen && self.currentUserBeingViewed === state.currentUser.userId) self.render(state.currentUser);
    });
  },

  render(user) {
    if (!user) return;
    
    var avatarHtml = user.avatar
      ? '<img src="' + window.Sanitize.escapeHtml(user.avatar) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
      : '<i data-lucide="user" style="width:40px;height:40px;"></i>';

    var bioHtml = user.bio
      ? window.Sanitize.markdown(user.bio)
      : '<span style="color:var(--text-muted);font-style:italic;">No bio yet...</span>';

    var onlineBg = user.status === 'online' ? 'var(--bg-hover)' : 'transparent';
    var dndBg = user.status === 'dnd' ? 'var(--bg-hover)' : 'transparent';
    
    var bannerStyle = user.banner 
      ? (user.banner.startsWith('#') || user.banner.startsWith('rgb') ? 'background: ' + user.banner + ';' : 'background: url(' + user.banner + ') center/cover no-repeat;')
      : 'background: var(--accent-primary);';

    var isMe = user.userId === window.store.getState().currentUser.userId;

    var editBtnHtml = isMe ? '<button id="btn-edit-profile" style="position:absolute;top:12px;right:12px;background:rgba(0,0,0,0.5);border:none;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:white;cursor:pointer;">' +
          '<i data-lucide="edit-2" style="width:16px;"></i>' +
        '</button>' : '';

    var statusBtnsHtml = isMe ? '<div style="margin-top:16px;display:flex;gap:8px;">' +
            '<button id="btn-status-online" style="flex:1;padding:6px;border-radius:4px;background:' + onlineBg + ';border:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:center;gap:8px;">' +
              '<div style="width:8px;height:8px;border-radius:50%;background:var(--accent-success);"></div> Online' +
            '</button>' +
            '<button id="btn-status-dnd" style="flex:1;padding:6px;border-radius:4px;background:' + dndBg + ';border:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:center;gap:8px;">' +
              '<div style="width:8px;height:8px;border-radius:50%;background:var(--accent-danger);"></div> DND' +
            '</button>' +
          '</div>' : '';

    this.container.innerHTML =
      '<div style="height:100px;position:relative;' + bannerStyle + '">' +
        editBtnHtml +
      '</div>' +
      '<div style="padding:0 20px 20px 20px;position:relative;">' +
        '<div style="width:80px;height:80px;border-radius:50%;background:var(--bg-surface);border:4px solid var(--bg-surface);position:absolute;top:-40px;display:flex;align-items:center;justify-content:center;overflow:hidden;">' +
          avatarHtml +
        '</div>' +
        '<div style="margin-top:48px;">' +
          '<div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--text-primary);">' + window.Sanitize.escapeHtml(user.username) + '</div>' +
          '<div style="font-size:14px;color:var(--text-secondary);margin-bottom:12px;">#' + window.Sanitize.escapeHtml(user.usertag) + '</div>' +
          '<div style="font-size:14px;color:var(--text-primary);line-height:1.5;padding:12px;background:var(--bg-base);border-radius:8px;">' + bioHtml + '</div>' +
          statusBtnsHtml +
        '</div>' +
      '</div>';

    lucide.createIcons({ root: this.container });
    
    if (isMe) {
      this.container.querySelector('#btn-status-online').addEventListener('click', function() {
        window.Identity.update({ status: 'online' });
      });
      this.container.querySelector('#btn-status-dnd').addEventListener('click', function() {
        window.Identity.update({ status: 'dnd' });
      });
      var self = this;
      this.container.querySelector('#btn-edit-profile').addEventListener('click', function() {
        self.close();
        if (window.SettingsModal) window.SettingsModal.open('account');
      });
    }
  },

  attachEvents() {
    var self = this;
    document.addEventListener('click', function(e) {
      if (self.isOpen && !self.container.contains(e.target) && !e.target.closest('#btn-profile') && !e.target.closest('.chat-header-avatar') && !e.target.closest('.list-row-avatar')) {
        self.close();
      }
    });
  },

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  },

  open(user) {
    user = user || window.store.getState().currentUser;
    this.currentUserBeingViewed = user.userId;
    this.render(user);
    this.container.style.display = 'flex';
    this.isOpen = true;
  },

  close() {
    this.container.style.display = 'none';
    this.isOpen = false;
  }
};

document.addEventListener('DOMContentLoaded', function() {
  window.ProfileCard.init();
});
