// src/js/views/sidebar-left.js

window.SidebarLeft = {
  init() {
    this.container = document.getElementById('left-sidebar-container');
    this.container.style.cssText = 'display:flex; flex-direction:column; flex:1; align-items:center; overflow:hidden;';
    this.render();
    this.attachEvents();
    
    this.unsubscribe = window.store.subscribe((state) => {
      this.renderAvatar(state.currentUser);
    });
    this.renderAvatar(window.store.getState().currentUser);
  },

  renderAvatar(user) {
    const profileBtn = this.container.querySelector('#btn-profile');
    if (!profileBtn) return;
    const avatarImg = user && user.avatar ? '<img src="' + window.Sanitize.escapeHtml(user.avatar) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">' : '<i data-lucide="user"></i>';
    profileBtn.innerHTML = '<div class="avatar avatar-md" style="position:relative;width:40px;height:40px;">' + avatarImg + '<div class="status-indicator ' + (user ? user.status : 'online') + '"></div></div>';
    lucide.createIcons({ root: profileBtn });
  },

  render() {
    this.container.innerHTML = `
      <div class="sidebar-top">
        <!-- Logo -->
        <button class="icon-btn active" id="btn-nav-dms" title="Direct Messages">
          <i data-lucide="message-circle"></i>
        </button>
        <div class="sidebar-separator" style="width:24px;height:1px;background:var(--border-subtle);margin-top:8px;margin-bottom:8px;margin-left:auto;margin-right:12px;"></div>
        <button class="icon-btn" id="btn-nav-gallery" title="Gallery">
          <i data-lucide="images"></i>
        </button>
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

    document.getElementById('btn-nav-settings').addEventListener('click', () => {
      if(window.SettingsModal) window.SettingsModal.open();
    });

    document.getElementById('btn-profile').addEventListener('click', () => {
      if(window.ProfileCard) window.ProfileCard.toggle();
    });
  }
};
