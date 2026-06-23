// src/js/views/sidebar-left.js

window.SidebarLeft = {
  init() {
    this.container = document.getElementById('left-sidebar-container');
    this.container.style.cssText = 'display:flex; flex-direction:column; flex:1; align-items:center; overflow:hidden;';
    this.render();
    this.attachEvents();
    
    this.unsubscribe = window.store.subscribe((state, changedState) => {
      if (!changedState || 'currentUser' in changedState) {
        this.renderAvatar(state.currentUser);
      }
    });
    this.renderAvatar(window.store.getState().currentUser);
  },

  renderAvatar(user) {
    if (!this.container) return;
    const profileBtn = this.container.querySelector('#btn-profile');
    if (!profileBtn) return;
    var frame = window.Frames.getFrameForUser(user ? user.userId : null);
    const avatarImg = user && user.avatar ? '<img src="' + window.Sanitize.escapeHtml(user.avatar) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">' : '<i data-lucide="user"></i>';
    var frameHtml = frame ? '<img src="icons/frames/pfp_frame_' + frame + '.png" style="position:absolute;top:-21%;left:-17%;width:133%;height:133%;pointer-events:none;object-fit:contain;" draggable="false" alt="">' : '';
    profileBtn.innerHTML = '<div class="avatar avatar-md" style="position:relative;width:40px;height:40px;">' + avatarImg + frameHtml + '<div class="status-indicator ' + (user ? user.status : 'online') + '"></div></div>';
    lucide.createIcons({ root: profileBtn });
  },

  render() {
    var s = (window.store.getState().settings || {}).sidebarButtons || {};
    var showActivity = s.activity !== false;
    var showGallery = s.gallery !== false;
    var showStorage = s.storage !== false;

    this.container.innerHTML = `
      <div class="sidebar-top">
        <!-- Logo -->
        <button class="icon-btn active" id="btn-nav-dms" title="Direct Messages">
          <i data-lucide="message-circle"></i>
        </button>
        <div class="sidebar-separator" style="width:24px;height:1px;background:var(--border-subtle);margin-top:8px;margin-bottom:8px;margin-left:auto;margin-right:12px;"></div>
        ${showActivity ? '<button class="icon-btn" id="btn-nav-activity" title="Activity Center"><i data-lucide="bell"></i></button>' : ''}
        ${showGallery ? '<button class="icon-btn" id="btn-nav-gallery" title="Gallery"><i data-lucide="archive"></i></button>' : ''}
        ${showStorage ? '<button class="icon-btn" id="btn-nav-storage" title="Storage"><i data-lucide="hard-drive"></i></button>' : ''}
      </div>
      
      <div class="sidebar-spacer" style="flex: 1;"></div>
      
      <div class="sidebar-bottom" style="padding-bottom:30px;">
        <button class="icon-btn" id="btn-nav-settings" title="Settings">
          <i data-lucide="settings"></i>
        </button>
        <button class="icon-btn" id="btn-profile" title="Profile">
          <div class="avatar avatar-md">
            <i data-lucide="user"></i>
          </div>
          <div class="status-indicator online"></div>
        </button>
      </div>
    `;
    // Re-initialize icons for newly added HTML
    lucide.createIcons({ root: this.container });
  },

  attachEvents() {
    // Nav buttons logic
    const btns = this.container.querySelectorAll('.icon-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (btn.id === 'btn-nav-activity') {
          if (window.ActivityCenter) window.ActivityCenter.show();
          return;
        }
        if (btn.id === 'btn-nav-storage') {
          if (window.SettingsModal) window.SettingsModal.open('data');
          return;
        }
        if(btn.id !== 'btn-profile' && btn.id !== 'btn-nav-settings') {
          btns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          
          if (btn.id === 'btn-nav-gallery') {
            window.store.setState({ activeTab: 'gallery' });
          } else {
            window.store.setState({ activeTab: 'dms' });
          }
        }
      });
    });

    var settingsBtn = document.getElementById('btn-nav-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        if(window.SettingsModal) window.SettingsModal.open();
      });
    }

    var profileBtn = document.getElementById('btn-profile');
    if (profileBtn) {
      profileBtn.addEventListener('click', () => {
        if(window.ProfileCard) window.ProfileCard.toggle();
      });
      profileBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if(window.AccountSwitcher) window.AccountSwitcher.toggle();
      });
    }
  }
};
