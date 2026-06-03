// src/js/views/settings-modal.js

window.SettingsModal = {
  isOpen: false,

  init() {
    this.container = document.createElement('div');
    this.container.id = 'settings-overlay';
    this.container.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;align-items:center;justify-content:center;';
    document.body.appendChild(this.container);
    this.render();
  },

  render() {
    this.container.innerHTML =
      '<div style="width:800px;height:600px;background:var(--bg-surface);border-radius:12px;display:flex;overflow:hidden;box-shadow:var(--shadow-xl);border:1px solid var(--border-subtle);">' +
        '<div style="width:240px;background:var(--bg-base);padding:24px;border-right:1px solid var(--border-subtle);display:flex;flex-direction:column;">' +
          '<h2 style="font-family:var(--font-display);font-size:20px;margin-bottom:24px;color:var(--text-primary);font-weight:bold;">Settings</h2>' +
          '<div style="display:flex;flex-direction:column;gap:8px;">' +
            '<button class="settings-tab active" data-tab="account" style="text-align:left;padding:10px 16px;border-radius:8px;background:var(--bg-hover);color:var(--text-primary);font-weight:500;border:none;cursor:pointer;">Account</button>' +
            '<button class="settings-tab" data-tab="appearance" style="text-align:left;padding:10px 16px;border-radius:8px;color:var(--text-secondary);background:transparent;border:none;cursor:pointer;">Appearance</button>' +
            '<button class="settings-tab" data-tab="network" style="text-align:left;padding:10px 16px;border-radius:8px;color:var(--text-secondary);background:transparent;border:none;cursor:pointer;">Network</button>' +
            '<button class="settings-tab" data-tab="notifications" style="text-align:left;padding:10px 16px;border-radius:8px;color:var(--text-secondary);background:transparent;border:none;cursor:pointer;">Notifications</button>' +
            '<button class="settings-tab" data-tab="data" style="text-align:left;padding:10px 16px;border-radius:8px;color:var(--text-secondary);background:transparent;border:none;cursor:pointer;">Data Manager</button>' +
            '<button class="settings-tab" data-tab="advanced" style="text-align:left;padding:10px 16px;border-radius:8px;color:var(--text-secondary);background:transparent;border:none;cursor:pointer;">Advanced</button>' +
            '<button class="settings-tab" data-tab="about" style="text-align:left;padding:10px 16px;border-radius:8px;color:var(--text-secondary);background:transparent;border:none;cursor:pointer;">About</button>' +
          '</div>' +
          '<div style="flex:1;"></div>' +
          '<button id="btn-close-settings" style="padding:10px;border:1px solid var(--border-subtle);border-radius:8px;color:var(--text-secondary);background:transparent;cursor:pointer;">Close</button>' +
        '</div>' +
        '<div id="settings-content" style="flex:1;padding:32px;overflow-y:auto;background:var(--bg-surface);"></div>' +
      '</div>';
    this.attachEvents();
  },

  attachEvents() {
    var self = this;
    var tabs = this.container.querySelectorAll('.settings-tab');
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function(e) {
        tabs.forEach(function(t) { t.classList.remove('active'); t.style.background='transparent'; t.style.color='var(--text-secondary)'; });
        e.currentTarget.classList.add('active');
        e.currentTarget.style.background='var(--bg-hover)';
        e.currentTarget.style.color='var(--text-primary)';
        self.renderTab(e.currentTarget.getAttribute('data-tab'));
      });
    });
    this.container.querySelector('#btn-close-settings').addEventListener('click', function() { self.close(); });
  },

  renderTab(tabName) {
    var content = this.container.querySelector('#settings-content');
    var state = window.store.getState();
    var user = state.currentUser;

    if (tabName === 'account') {
      var avatarPreview = user.avatar
        ? '<img src="' + window.Sanitize.escapeHtml(user.avatar) + '" id="preview-avatar-img" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:4px solid var(--bg-surface);">'
        : '<div id="preview-avatar-img" style="width:80px;height:80px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:32px;color:white;font-weight:600;border:4px solid var(--bg-surface);">' + (user.username ? user.username.charAt(0).toUpperCase() : '?') + '</div>';

      var bannerStyle = user.banner
        ? (user.banner.startsWith('#') || user.banner.startsWith('linear-gradient') || user.banner.startsWith('rgb')
          ? 'background:' + window.Sanitize.escapeHtml(user.banner)
          : 'background-image:url(' + window.Sanitize.escapeHtml(user.banner) + ');background-size:cover;background-position:center')
        : 'background:linear-gradient(135deg,var(--accent-primary),#6C5CE7)';

      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">My Account</h3>' +

        // Preview Card
        '<div style="margin-bottom:24px;border-radius:12px;overflow:hidden;border:1px solid var(--border-subtle);">' +
          '<div id="preview-banner" style="height:120px;' + bannerStyle + ';position:relative;">' +
            '<div style="position:absolute;bottom:-40px;left:24px;">' + avatarPreview + '</div>' +
          '</div>' +
          '<div style="padding:48px 24px 20px 24px;background:var(--bg-surface);">' +
            '<div style="font-size:18px;font-weight:700;color:var(--text-primary);" id="preview-username">' + window.Sanitize.escapeHtml(user.username) + '</div>' +
            '<div style="font-size:13px;color:var(--text-muted);font-family:var(--font-mono);" id="preview-usertag">#' + window.Sanitize.escapeHtml(user.usertag || '') + '</div>' +
          '</div>' +
        '</div>' +

        // Collapsible: Profile
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<span style="font-size:13px;font-weight:600;color:var(--text-primary);">Profile</span>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:block;">' +
            '<div style="margin-bottom:16px;"><label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">Username</label>' +
            '<div style="display:flex;gap:8px;"><input type="text" id="input-username" value="' + window.Sanitize.escapeHtml(user.username) + '" style="flex:1;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-surface);color:var(--text-primary);font-size:14px;outline:none;">' +
            '<div style="padding:10px 12px;border-radius:8px;background:var(--bg-surface);color:var(--text-muted);font-family:var(--font-mono);font-size:14px;border:1px solid var(--border-subtle);">#' + user.usertag + '</div></div></div>' +
            '<div><label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">Bio</label>' +
            '<textarea id="input-bio" rows="3" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:14px;outline:none;resize:none;">' + window.Sanitize.escapeHtml(user.bio || '') + '</textarea></div>' +
          '</div>' +
        '</div>' +

        // Collapsible: Avatar & Banner
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<span style="font-size:13px;font-weight:600;color:var(--text-primary);">Avatar & Banner</span>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:none;">' +
            '<div style="margin-bottom:16px;">' +
              '<label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">Avatar</label>' +
              '<div style="display:flex;gap:8px;align-items:center;">' +
                '<div style="flex:1;"><input type="text" id="input-avatar" placeholder="Avatar URL..." value="' + window.Sanitize.escapeHtml(user.avatar || '') + '" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:13px;outline:none;"></div>' +
                '<label style="padding:10px;background:var(--bg-hover);color:var(--text-primary);border-radius:8px;cursor:pointer;border:1px solid var(--border-subtle);flex-shrink:0;"><i data-lucide="upload" style="width:16px;"></i><input type="file" id="input-avatar-file" accept="image/*" style="display:none;"></label>' +
              '</div>' +
            '</div>' +
            '<div>' +
              '<label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">Banner</label>' +
              '<div style="display:flex;gap:8px;align-items:center;">' +
                '<div style="flex:1;"><input type="text" id="input-banner" placeholder="#Hex, gradient, or Image URL..." value="' + window.Sanitize.escapeHtml(user.banner || '') + '" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:13px;outline:none;"></div>' +
                '<label style="padding:10px;background:var(--bg-hover);color:var(--text-primary);border-radius:8px;cursor:pointer;border:1px solid var(--border-subtle);flex-shrink:0;"><i data-lucide="upload" style="width:16px;"></i><input type="file" id="input-banner-file" accept="image/*" style="display:none;"></label>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Collapsible: Account Info
        '<div class="settings-collapsible" style="margin-bottom:24px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<span style="font-size:13px;font-weight:600;color:var(--text-primary);">Account Info</span>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:none;">' +
            '<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">User ID</div>' +
            '<div style="font-size:13px;color:var(--text-secondary);font-family:var(--font-mono);word-break:break-all;padding:10px 12px;background:var(--bg-base);border-radius:8px;border:1px solid var(--border-subtle);">' + (user.userId || 'N/A') + '</div>' +
          '</div>' +
        '</div>' +

        // Save
        '<div style="display:flex;align-items:center;gap:12px;">' +
          '<button id="btn-save-account" style="padding:10px 24px;background:var(--accent-primary);color:white;border-radius:8px;border:none;font-weight:600;cursor:pointer;">Save Changes</button>' +
          '<span id="save-msg" style="font-size:14px;color:var(--accent-success);"></span>' +
        '</div>';

      lucide.createIcons({ root: content });

      // Live preview updates
      function updatePreview() {
        var name = content.querySelector('#input-username').value.trim();
        var avatar = content.querySelector('#input-avatar').value.trim();
        var banner = content.querySelector('#input-banner').value.trim();

        var nameEl = content.querySelector('#preview-username');
        if (nameEl) nameEl.textContent = name || 'User';

        var avatarContainer = content.querySelector('#preview-avatar-img');
        if (avatarContainer) {
          if (avatar) {
            avatarContainer.outerHTML = '<img src="' + window.Sanitize.escapeHtml(avatar) + '" id="preview-avatar-img" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:4px solid var(--bg-surface);">';
          } else {
            avatarContainer.outerHTML = '<div id="preview-avatar-img" style="width:80px;height:80px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:32px;color:white;font-weight:600;border:4px solid var(--bg-surface);">' + (name ? name.charAt(0).toUpperCase() : '?') + '</div>';
          }
        }

        var bannerEl = content.querySelector('#preview-banner');
        if (bannerEl) {
          if (banner) {
            if (banner.startsWith('#') || banner.startsWith('linear-gradient') || banner.startsWith('rgb')) {
              bannerEl.style.cssText = 'height:120px;position:relative;background:' + window.Sanitize.escapeHtml(banner) + ';';
            } else {
              bannerEl.style.cssText = 'height:120px;position:relative;background-image:url(' + window.Sanitize.escapeHtml(banner) + ');background-size:cover;background-position:center;';
            }
          } else {
            bannerEl.style.cssText = 'height:120px;position:relative;background:linear-gradient(135deg,var(--accent-primary),#6C5CE7);';
          }
        }
      }

      content.querySelector('#input-avatar-file').addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(evt) {
          content.querySelector('#input-avatar').value = evt.target.result;
          updatePreview();
        };
        reader.readAsDataURL(file);
      });
      content.querySelector('#input-banner-file').addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(evt) {
          content.querySelector('#input-banner').value = evt.target.result;
          updatePreview();
        };
        reader.readAsDataURL(file);
      });

      content.querySelector('#input-username').addEventListener('input', updatePreview);
      content.querySelector('#input-avatar').addEventListener('input', updatePreview);
      content.querySelector('#input-banner').addEventListener('input', updatePreview);

      content.querySelector('#btn-save-account').addEventListener('click', function() {
        try {
          window.Identity.update({
            username: content.querySelector('#input-username').value.trim(),
            bio: content.querySelector('#input-bio').value.trim(),
            avatar: content.querySelector('#input-avatar').value.trim() || null,
            banner: content.querySelector('#input-banner').value.trim() || null
          });
          content.querySelector('#save-msg').textContent = "Saved!";
          setTimeout(function() { 
            var msgEl = content.querySelector('#save-msg');
            if (msgEl) msgEl.textContent = ""; 
          }, 3000);
        } catch (e) {
          content.querySelector('#save-msg').style.color = "var(--accent-danger)";
          content.querySelector('#save-msg').textContent = e.message;
        }
      });
    } else if (tabName === 'appearance') {
      var s = state.settings;

      var themeRadios = [
        { value: 'dark', icon: 'moon', label: 'Dark' },
        { value: 'light', icon: 'sun', label: 'Light' },
        { value: 'system', icon: 'monitor', label: 'System' }
      ].map(function(t) {
        return '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 16px;flex:1;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);transition:border-color 0.15s;' + (s.theme === t.value ? 'border-color:var(--accent-primary);' : '') + '">' +
          '<input type="radio" name="theme" value="' + t.value + '" ' + (s.theme === t.value ? 'checked' : '') + ' style="accent-color:var(--accent-primary);">' +
          '<i data-lucide="' + t.icon + '" style="width:16px;height:16px;color:var(--text-muted);"></i>' +
          '<span style="font-size:13px;color:var(--text-primary);">' + t.label + '</span>' +
        '</label>';
      }).join('');

      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">Appearance</h3>' +

        // Section: Theme
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="palette" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Theme</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:block;">' +
            '<div style="display:flex;gap:8px;margin-bottom:12px;">' + themeRadios + '</div>' +
            '<label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;padding-top:8px;border-top:1px solid var(--border-subtle);">' +
              '<input id="set-24h" type="checkbox" '+(s.timeFormat24?'checked':'')+'>' +
              '<div><div>24-hour Time</div><div style="font-size:12px;color:var(--text-muted);font-weight:400;">Show timestamps in 24-hour format</div></div>' +
            '</label>' +
          '</div>' +
        '</div>' +

        // Section: Text & Layout
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="type" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Text & Layout</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:block;">' +
            '<div style="margin-bottom:16px;">' +
              '<label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">Font Size</label>' +
              '<select id="set-font" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;font-size:13px;">' +
                '<option '+(s.fontSize==='Small'?'selected':'')+'>Small</option><option '+(s.fontSize==='Medium'?'selected':'')+'>Medium</option><option '+(s.fontSize==='Large'?'selected':'')+'>Large</option>' +
              '</select>' +
            '</div>' +
            '<div style="margin-bottom:16px;">' +
              '<label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">Message Bubbles</label>' +
              '<select id="set-bubbles" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;font-size:13px;">' +
                '<option '+(s.messageBubbles==='Modern'?'selected':'')+'>Modern (Rounded)</option><option '+(s.messageBubbles==='Compact'?'selected':'')+'>Compact (Square)</option>' +
              '</select>' +
            '</div>' +
            '<div>' +
              '<label for="set-zoom" style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">App Zoom (<span id="zoom-val-label">'+s.appZoom+'</span>%)</label>' +
              '<input id="set-zoom" type="range" min="80" max="150" value="'+s.appZoom+'" style="width:100%;accent-color:var(--accent-primary);">' +
            '</div>' +
            '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-subtle);">' +
              '<label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:10px;">Sidebar Buttons</label>' +
              '<div style="display:flex;flex-direction:column;gap:8px;">' +
                '<label style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-primary);cursor:pointer;">' +
                  '<input type="checkbox" class="sidebar-btn-toggle" data-btn="activity" '+(s.sidebarButtons&&s.sidebarButtons.activity!==false?'checked':'')+'>' +
                  '<i data-lucide="bell" style="width:14px;height:14px;color:var(--text-muted);"></i>' +
                  '<span>Activity Center</span>' +
                '</label>' +
                '<label style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-primary);cursor:pointer;">' +
                  '<input type="checkbox" class="sidebar-btn-toggle" data-btn="gallery" '+(s.sidebarButtons&&s.sidebarButtons.gallery!==false?'checked':'')+'>' +
                  '<i data-lucide="archive" style="width:14px;height:14px;color:var(--text-muted);"></i>' +
                  '<span>Gallery</span>' +
                '</label>' +
                '<label style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-primary);cursor:pointer;">' +
                  '<input type="checkbox" class="sidebar-btn-toggle" data-btn="storage" '+(s.sidebarButtons&&s.sidebarButtons.storage!==false?'checked':'')+'>' +
                  '<i data-lucide="hard-drive" style="width:14px;height:14px;color:var(--text-muted);"></i>' +
                  '<span>Storage</span>' +
                '</label>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Section: Animation
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="sparkles" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Animation</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:none;">' +
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
              '<div style="display:flex;align-items:center;gap:12px;">' +
                '<label style="font-size:13px;color:var(--text-primary);min-width:90px;">Speed</label>' +
                '<select id="set-anim-speed" style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;font-size:13px;">' +
                  '<option value="slow"'+(s.animSpeed==='slow'?' selected':'')+'>Slow</option>' +
                  '<option value="normal"'+(s.animSpeed==='normal'?' selected':'')+'>Normal</option>' +
                  '<option value="fast"'+(s.animSpeed==='fast'?' selected':'')+'>Fast</option>' +
                '</select>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:12px;">' +
                '<label style="font-size:13px;color:var(--text-primary);min-width:90px;">Messages</label>' +
                '<select id="set-msg-anim" style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;font-size:13px;">' +
                  '<option value="slide"'+(s.messageAnim==='slide'?' selected':'')+'>Slide</option>' +
                  '<option value="fade"'+(s.messageAnim==='fade'?' selected':'')+'>Fade</option>' +
                  '<option value="instant"'+(s.messageAnim==='instant'?' selected':'')+'>Instant</option>' +
                '</select>' +
              '</div>' +
              '<div style="border-top:1px solid var(--border-subtle);padding-top:12px;">' +
                '<label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;">' +
                  '<input id="set-anim" type="checkbox" '+(s.animations===false?'':'checked')+'>' +
                  '<div><div>UI Animations</div><div style="font-size:12px;color:var(--text-muted);font-weight:400;">Enable animated transitions and effects</div></div>' +
                '</label>' +
              '</div>' +
              '<div>' +
                '<label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;">' +
                  '<input id="set-reduce-motion" type="checkbox" '+(s.reduceMotion?'checked':'')+'>' +
                  '<div><div>Reduce Motion</div><div style="font-size:12px;color:var(--text-muted);font-weight:400;">Disable pulse, bounce, and spin animations</div></div>' +
                '</label>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Section: Chat
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="message-square" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Chat</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:none;">' +
            '<div style="margin-bottom:16px;">' +
              '<label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">Background Pattern</label>' +
              '<select id="set-pattern" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;font-size:13px;">' +
                '<option '+(s.bgPattern==='None'?'selected':'')+'>None</option><option '+(s.bgPattern==='Dots'?'selected':'')+'>Dots</option><option '+(s.bgPattern==='Grid'?'selected':'')+'>Grid</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
        '</div>';

      if (window.lucide) window.lucide.createIcons({ root: content });

      var updateSettings = function(key, val) {
        var newSettings = { ...window.store.getState().settings };
        newSettings[key] = val;
        window.store.setState({ settings: newSettings });
        window.Storage.set('settings', newSettings);
      };

      content.querySelectorAll('input[name="theme"]').forEach(function(radio) {
        radio.addEventListener('change', function(e) {
          if (e.target.checked) {
            updateSettings('theme', e.target.value);
            content.querySelectorAll('input[name="theme"]').forEach(function(r) {
              r.parentElement.style.borderColor = 'var(--border-subtle)';
            });
            e.target.parentElement.style.borderColor = 'var(--accent-primary)';
          }
        });
      });
      content.querySelector('#set-font').addEventListener('change', function(e) { updateSettings('fontSize', e.target.value); });
      content.querySelector('#set-bubbles').addEventListener('change', function(e) { updateSettings('messageBubbles', e.target.value.split(' ')[0]); });
      content.querySelector('#set-zoom').addEventListener('input', function(e) {
        updateSettings('appZoom', parseInt(e.target.value));
        e.target.previousElementSibling.querySelector('#zoom-val-label').textContent = e.target.value;
      });
      content.querySelector('#set-anim-speed').addEventListener('change', function(e) { updateSettings('animSpeed', e.target.value); });
      content.querySelector('#set-anim').addEventListener('change', function(e) { updateSettings('animations', e.target.checked); });
      content.querySelector('#set-reduce-motion').addEventListener('change', function(e) { updateSettings('reduceMotion', e.target.checked); });
      content.querySelector('#set-msg-anim').addEventListener('change', function(e) { updateSettings('messageAnim', e.target.value); });
      content.querySelector('#set-24h').addEventListener('change', function(e) { updateSettings('timeFormat24', e.target.checked); });
      content.querySelector('#set-pattern').addEventListener('change', function(e) { updateSettings('bgPattern', e.target.value); });
      content.querySelectorAll('.sidebar-btn-toggle').forEach(function(cb) {
        cb.addEventListener('change', function(e) {
          var btns = Object.assign({}, window.store.getState().settings.sidebarButtons || {});
          btns[e.target.dataset.btn] = e.target.checked;
          updateSettings('sidebarButtons', btns);
          if (window.SidebarLeft) { window.SidebarLeft.render(); window.SidebarLeft.attachEvents(); window.SidebarLeft.renderAvatar(window.store.getState().currentUser); }
        });
      });
      
    } else if (tabName === 'network') {
      var n = state.networkSettings;
      var peerCount = state.friends ? state.friends.filter(function(f) { return f.status === 'online'; }).length : 0;
      var totalPeers = state.friends ? state.friends.length : 0;
      var groupCount = state.groups ? state.groups.length : 0;

      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">Network</h3>' +
        // Dashboard
        '<div style="margin-bottom:24px;">' +
          '<h4 style="font-size:14px;font-weight:600;color:var(--text-primary);margin:0 0 12px;">Dashboard</h4>' +
          '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">' +
            '<div style="padding:16px;background:var(--bg-base);border-radius:10px;text-align:center;border:1px solid var(--border-subtle);">' +
              '<div style="font-size:28px;font-weight:700;color:var(--accent-success);">' + peerCount + '</div>' +
              '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Online Peers</div>' +
            '</div>' +
            '<div style="padding:16px;background:var(--bg-base);border-radius:10px;text-align:center;border:1px solid var(--border-subtle);">' +
              '<div style="font-size:28px;font-weight:700;color:var(--accent-primary);">' + totalPeers + '</div>' +
              '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Total Friends</div>' +
            '</div>' +
            '<div style="padding:16px;background:var(--bg-base);border-radius:10px;text-align:center;border:1px solid var(--border-subtle);">' +
              '<div style="font-size:28px;font-weight:700;color:var(--accent-warning);">' + groupCount + '</div>' +
              '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Groups</div>' +
            '</div>' +
            '<div style="padding:16px;background:var(--bg-base);border-radius:10px;text-align:center;border:1px solid var(--border-subtle);">' +
              '<div style="font-size:28px;font-weight:700;color:var(--text-primary);' + (n.mode === 'LAN Auto-Discovery' ? '' : 'color:var(--accent-primary);') + '">' + (n.mode === 'LAN Auto-Discovery' ? 'LAN' : 'Custom') + '</div>' +
              '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Network Mode</div>' +
            '</div>' +
          '</div>' +
          // Peer list
          '<div style="margin-top:16px;padding:12px;background:var(--bg-base);border-radius:10px;border:1px solid var(--border-subtle);">' +
            '<div style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">Online Peers</div>' +
            (peerCount === 0
              ? '<div style="font-size:13px;color:var(--text-muted);">No peers online</div>'
              : '<div style="display:flex;flex-direction:column;gap:6px;">' + state.friends.filter(function(f) { return f.status === 'online'; }).map(function(f) {
                return '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;background:var(--bg-surface);">' +
                  '<span style="width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;"></span>' +
                  '<span style="font-size:13px;color:var(--text-primary);flex:1;">' + window.Sanitize.escapeHtml(f.username) + '</span>' +
                  '<span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);">' + (f.ip || '') + '</span>' +
                '</div>';
              }).join('') + '</div>'
            ) +
          '</div>' +
        '</div>' +
        // Settings
        '<h4 style="font-size:14px;font-weight:600;color:var(--text-primary);margin:0 0 12px;">Settings</h4>' +
        '<div style="display:flex;flex-direction:column;gap:24px;">' +
          '<div><label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">Network Mode</label>' +
          '<select id="net-mode" style="width:100%;padding:12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;">' +
            '<option '+(n.mode==='LAN Auto-Discovery'?'selected':'')+'>LAN Auto-Discovery</option><option '+(n.mode==='Custom IP'?'selected':'')+'>Custom IP</option>' +
          '</select></div>' +
          '<div><label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">UDP Discovery Port</label>' +
          '<input id="net-udp" type="number" value="'+n.udpPort+'" style="width:100%;padding:12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;"></div>' +
          '<div><label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">TCP Connection Port</label>' +
          '<input id="net-tcp" type="number" value="'+n.tcpPort+'" style="width:100%;padding:12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;"></div>' +
          '<div><label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">Max File Transfer Size (MB)</label>' +
          '<input id="net-size" type="number" value="'+n.maxFileSize+'" style="width:100%;padding:12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;"></div>' +
          '<div><label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;"><input id="net-rtc" type="checkbox" '+(n.webrtcFallback?'checked':'')+'> Enable WebRTC Fallback</label></div>' +
          '<div><label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">Connection Log Level</label>' +
          '<select id="net-log" style="width:100%;padding:12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;">' +
            '<option '+(n.logLevel==='None'?'selected':'')+'>None</option><option '+(n.logLevel==='Error'?'selected':'')+'>Error</option><option '+(n.logLevel==='Info'?'selected':'')+'>Info</option><option '+(n.logLevel==='Debug'?'selected':'')+'>Debug</option>' +
          '</select></div>' +
          '<button id="net-clear" style="padding:10px 24px;background:transparent;color:var(--accent-danger);border-radius:8px;border:1px solid var(--accent-danger);font-weight:600;cursor:pointer;width:fit-content;">Clear Network Cache</button>' +
        '</div>';

      var updateNetwork = function(key, val) {
        var newNet = { ...window.store.getState().networkSettings };
        newNet[key] = val;
        window.store.setState({ networkSettings: newNet });
        window.Storage.set('networkSettings', newNet);
      };

      content.querySelector('#net-mode').addEventListener('change', function(e) { updateNetwork('mode', e.target.value); });
      content.querySelector('#net-udp').addEventListener('change', function(e) { updateNetwork('udpPort', parseInt(e.target.value) || 45678); });
      content.querySelector('#net-tcp').addEventListener('change', function(e) { updateNetwork('tcpPort', parseInt(e.target.value) || 46000); });
      content.querySelector('#net-size').addEventListener('change', function(e) { updateNetwork('maxFileSize', parseInt(e.target.value) || 500); });
      content.querySelector('#net-rtc').addEventListener('change', function(e) { updateNetwork('webrtcFallback', e.target.checked); });
      content.querySelector('#net-log').addEventListener('change', function(e) { updateNetwork('logLevel', e.target.value); });
      content.querySelector('#net-clear').addEventListener('click', function(e) {
         e.target.textContent = 'Cleared!';
         setTimeout(function(){ e.target.textContent = 'Clear Network Cache'; }, 2000);
      });
    } else if (tabName === 'notifications') {
      var s = state.settings;
      var dndActive = s.notifyDnd;

      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">Notifications</h3>' +

        // DND status banner
        (dndActive
          ? '<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;margin-bottom:16px;">' +
              '<i data-lucide="moon" style="width:18px;height:18px;color:#ef4444;flex-shrink:0;"></i>' +
              '<span style="font-size:13px;color:#ef4444;font-weight:500;">Do Not Disturb is enabled — all notifications are muted.</span>' +
            '</div>'
          : ''
        ) +

        // Section: General
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="bell" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">General</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="display:block;">' +
            '<div style="padding:4px 16px 16px;">' +
              '<label style="display:flex;align-items:center;gap:12px;padding:12px 0;font-size:14px;color:var(--text-primary);cursor:pointer;border-bottom:1px solid var(--border-subtle);">' +
                '<input id="notify-preview" type="checkbox" '+(s.notifyPreview?'checked':'')+'>' +
                '<div><div>Message Previews</div><div style="font-size:12px;color:var(--text-muted);font-weight:400;">Show message content in notification toasts</div></div>' +
              '</label>' +
              '<label style="display:flex;align-items:center;gap:12px;padding:12px 0;font-size:14px;color:var(--text-primary);cursor:pointer;">' +
                '<input id="notify-dnd" type="checkbox" '+(s.notifyDnd?'checked':'')+'>' +
                '<div><div>Do Not Disturb</div><div style="font-size:12px;color:var(--text-muted);font-weight:400;">Mute all notification sounds and toasts</div></div>' +
              '</label>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Section: Group Notifications
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="users" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Groups</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="display:none;">' +
            '<div style="padding:4px 16px 16px;">' +
              '<label style="display:flex;align-items:center;gap:12px;padding:12px 0;font-size:14px;color:var(--text-primary);cursor:pointer;">' +
                '<input id="notify-mentions" type="checkbox" '+(s.notifyGroupMentions?'checked':'')+'>' +
                '<div><div>@Mentions Only</div><div style="font-size:12px;color:var(--text-muted);font-weight:400;">Only receive notifications when you\'re @mentioned in groups</div></div>' +
              '</label>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Section: Sound
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="volume-2" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Sound</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="display:none;">' +
            '<div style="padding:4px 16px 16px;">' +
              '<label style="display:flex;align-items:center;gap:12px;padding:12px 0;font-size:14px;color:var(--text-primary);cursor:pointer;">' +
                '<input id="notify-sound" type="checkbox" '+(s.notifySound?'checked':'')+'>' +
                '<div><div>Play Sound</div><div style="font-size:12px;color:var(--text-muted);font-weight:400;">Play a notification sound when new messages arrive</div></div>' +
                '<button id="btn-test-sound" style="margin-left:auto;padding:6px 12px;border-radius:6px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-secondary);cursor:pointer;font-size:11px;">Test</button>' +
              '</label>' +
            '</div>' +
          '</div>' +
        '</div>';

      if (window.lucide) window.lucide.createIcons({ root: content });

      var updateSettings = function(key, val) {
        var newSettings = { ...window.store.getState().settings };
        newSettings[key] = val;
        window.store.setState({ settings: newSettings });
        window.Storage.set('settings', newSettings);
      };

      function refreshDndBanner() {
        var isDnd = content.querySelector('#notify-dnd').checked;
        var existing = content.querySelector('.dnd-banner');
        if (isDnd && !existing) {
          var banner = document.createElement('div');
          banner.className = 'dnd-banner';
          banner.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;margin-bottom:16px;';
          banner.innerHTML = '<i data-lucide="moon" style="width:18px;height:18px;color:#ef4444;flex-shrink:0;"></i><span style="font-size:13px;color:#ef4444;font-weight:500;">Do Not Disturb is enabled — all notifications are muted.</span>';
          content.insertBefore(banner, content.querySelector('.settings-collapsible'));
          if (window.lucide) window.lucide.createIcons({ root: banner });
        } else if (!isDnd && existing) {
          existing.remove();
        }
      }

      content.querySelector('#notify-sound').addEventListener('change', function(e) { updateSettings('notifySound', e.target.checked); });
      content.querySelector('#btn-test-sound').addEventListener('click', function(e) { e.stopPropagation(); if (window.NotificationSound) window.NotificationSound.play(); });
      content.querySelector('#notify-preview').addEventListener('change', function(e) { updateSettings('notifyPreview', e.target.checked); });
      content.querySelector('#notify-mentions').addEventListener('change', function(e) { updateSettings('notifyGroupMentions', e.target.checked); });
      content.querySelector('#notify-dnd').addEventListener('change', function(e) { updateSettings('notifyDnd', e.target.checked); refreshDndBanner(); });
      
    } else if (tabName === 'advanced') {
      var s = state.settings || {};

      var toggleRow = function(id, label, desc, checked) {
        return '<label style="display:flex;align-items:center;gap:12px;padding:12px 0;font-size:14px;color:var(--text-primary);cursor:pointer;' +
          (desc ? '' : '') + '">' +
          '<input id="' + id + '" type="checkbox" ' + (checked ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:var(--accent-primary);cursor:pointer;">' +
          '<div><div>' + label + '</div>' +
          (desc ? '<div style="font-size:12px;color:var(--text-muted);font-weight:400;">' + desc + '</div>' : '') +
          '</div></label>';
      };

      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">Advanced</h3>' +

        // Warning banner
        '<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:10px;margin-bottom:16px;">' +
          '<i data-lucide="alert-triangle" style="width:18px;height:18px;color:#f59e0b;flex-shrink:0;"></i>' +
          '<span style="font-size:13px;color:#f59e0b;font-weight:500;">These settings are intended for debugging and development. Changing them may affect performance and stability.</span>' +
        '</div>' +

        // Section: Developer Tools
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="terminal" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Developer Tools</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="display:block;">' +
            '<div style="padding:4px 16px 16px;">' +
              toggleRow('adv-dev-mode', 'Developer Mode', 'Enable developer tools and instrumentation.', s.devMode) +
              '<div style="border-top:1px solid var(--border-subtle);"></div>' +
              toggleRow('adv-experimental', 'Experimental Features', 'Enable experimental features that may be unstable.', s.enableExperimental) +
            '</div>' +
          '</div>' +
        '</div>' +

        // Section: Debug & Diagnostics
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="search" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Debug & Diagnostics</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="display:none;">' +
            '<div style="padding:4px 16px 16px;">' +
              toggleRow('adv-debug-display', 'Debug Display', 'Show debug overlays on messages, search results, and UI components.', s.debugDisplay) +
              '<div style="border-top:1px solid var(--border-subtle);"></div>' +
              toggleRow('adv-show-msg-ids', 'Show Message IDs', 'Display internal message IDs below each message.', s.showMessageIds) +
              '<div style="border-top:1px solid var(--border-subtle);"></div>' +
              toggleRow('adv-log-packets', 'Log Network Packets', 'Log all incoming and outgoing network packets to the console.', s.logNetworkPackets) +
              '<div style="border-top:1px solid var(--border-subtle);"></div>' +
              toggleRow('adv-conn-stats', 'Show Connection Stats', 'Display live connection statistics overlay.', s.showConnectionStats) +
            '</div>' +
          '</div>' +
        '</div>';

      if (window.lucide) window.lucide.createIcons({ root: content });

      var updateSettings = function(key, val) {
        var newSettings = { ...window.store.getState().settings };
        newSettings[key] = val;
        window.store.setState({ settings: newSettings });
        window.Storage.set('settings', newSettings);
      };

      content.querySelector('#adv-dev-mode').addEventListener('change', function(e) {
        updateSettings('devMode', e.target.checked);
        if (window.orbitAPI && window.orbitAPI.toggleDevtools) {
          window.orbitAPI.toggleDevtools();
        }
      });
      content.querySelector('#adv-debug-display').addEventListener('change', function(e) { updateSettings('debugDisplay', e.target.checked); });
      content.querySelector('#adv-show-msg-ids').addEventListener('change', function(e) { updateSettings('showMessageIds', e.target.checked); });
      content.querySelector('#adv-log-packets').addEventListener('change', function(e) { updateSettings('logNetworkPackets', e.target.checked); });
      content.querySelector('#adv-conn-stats').addEventListener('change', function(e) { updateSettings('showConnectionStats', e.target.checked); });
      content.querySelector('#adv-experimental').addEventListener('change', function(e) {
        updateSettings('enableExperimental', e.target.checked);
        if (e.target.checked && window.Toast) {
          window.Toast.show('Experimental', 'Experimental features enabled. Some features may be unstable.');
        }
      });

    } else if (tabName === 'data') {
      var s = state.settings;
      var currentDelete = s.deleteAttachmentsAfter || 0;
      var presetOptions = [
        { label: 'Never', value: 0 },
        { label: '1 minute', value: 1 },
        { label: '5 minutes', value: 5 },
        { label: '10 minutes', value: 10 },
        { label: '25 minutes', value: 25 },
        { label: '60 minutes', value: 60 },
        { label: 'Custom', value: -1 }
      ];
      var isCustom = currentDelete > 0 && ![1,5,10,25,60].includes(currentDelete);
      var selectVal = isCustom ? -1 : currentDelete;
      var optionsHtml = '';
      presetOptions.forEach(function(opt) {
        optionsHtml += '<option value="' + opt.value + '"' + (selectVal === opt.value ? ' selected' : '') + '>' + opt.label + '</option>';
      });

      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">Data Manager</h3>' +
        '<div style="display:flex;flex-direction:column;gap:16px;">' +
          '<div style="padding:20px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border-subtle);">' +
            '<div style="display:flex;align-items:flex-start;gap:16px;">' +
              '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
              '<div style="flex:1;">' +
                '<div style="font-weight:600;color:var(--text-primary);font-size:15px;">Export Backup</div>' +
                '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;line-height:1.4;">Export all your messages, groups, friends, settings, and avatars into a single backup file (.orzip or .zip).</div>' +
                '<div style="display:flex;gap:10px;margin-top:14px;">' +
                  '<button id="btn-backup-orzip" class="btn btn-primary" style="padding:10px 20px;border-radius:10px;background:var(--accent-primary);color:white;border:none;cursor:pointer;font-weight:600;">Backup as .orzip</button>' +
                  '<button id="btn-backup-zip" class="btn btn-secondary" style="padding:10px 20px;border-radius:10px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);cursor:pointer;font-weight:500;">Backup as .zip</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="padding:20px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border-subtle);">' +
            '<div style="display:flex;align-items:flex-start;gap:16px;">' +
              '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9"/></svg>' +
              '<div style="flex:1;">' +
                '<div style="font-weight:600;color:var(--text-primary);font-size:15px;">Restore from Backup</div>' +
                '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;line-height:1.4;">Restore your data from a previously created backup file. This will replace all current data.</div>' +
                '<div style="margin-top:14px;">' +
                  '<button id="btn-restore" class="btn btn-danger" style="padding:10px 20px;border-radius:10px;background:var(--accent-danger);color:white;border:none;cursor:pointer;font-weight:600;">Restore Backup</button>' +
                  '<span id="restore-status" style="margin-left:12px;font-size:13px;color:var(--text-muted);display:none;"></span>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="padding:20px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border-subtle);">' +
            '<div style="display:flex;align-items:flex-start;gap:16px;">' +
              '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>' +
              '<div style="flex:1;">' +
                '<div style="font-weight:600;color:var(--text-primary);font-size:15px;">Database Health</div>' +
                '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;line-height:1.4;">Check your database integrity and verify all tables are healthy.</div>' +
                '<div style="margin-top:14px;">' +
                  '<button id="btn-db-health" style="padding:10px 20px;border-radius:10px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);cursor:pointer;font-weight:500;">Run Health Check</button>' +
                  '<span id="health-status" style="margin-left:12px;font-size:13px;color:var(--text-muted);display:none;"></span>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="padding:20px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border-subtle);">' +
            '<div style="display:flex;align-items:flex-start;gap:16px;">' +
              '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 6v6l4 2"/></svg>' +
              '<div style="flex:1;">' +
                '<div style="font-weight:600;color:var(--text-primary);font-size:15px;">Database Repair</div>' +
                '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;line-height:1.4;">Repair database integrity, rebuild indexes, and remove orphaned records.</div>' +
                '<div style="margin-top:14px;">' +
                  '<button id="btn-db-repair" style="padding:10px 20px;border-radius:10px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);cursor:pointer;font-weight:500;">Run Repair</button>' +
                  '<span id="repair-status" style="margin-left:12px;font-size:13px;color:var(--text-muted);display:none;"></span>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="padding:16px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border-subtle);">' +
            '<label style="display:flex;align-items:center;gap:12px;font-size:16px;color:var(--text-primary);cursor:pointer;font-weight:bold;">' +
              '<input id="set-privacy" type="checkbox" '+(s.privacyMode?'checked':'')+'> Enable Privacy Mode' +
            '</label>' +
            '<p style="margin-top:8px;font-size:13px;color:var(--text-secondary);">When enabled, attachments (images, files) are NOT saved to the database. They are only kept in a temporary folder and cleared when the app closes. Messages and profile data are still saved.</p>' +
          '</div>' +
          '<div style="padding:16px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border-subtle);">' +
            '<label style="display:flex;align-items:center;gap:12px;font-size:16px;color:var(--text-primary);cursor:pointer;font-weight:bold;">' +
              '<input id="set-e2ee" type="checkbox" '+(s.e2eeEnabled?'checked':'')+'> Enable End-to-End Encryption' +
            '</label>' +
            '<p style="margin-top:8px;font-size:13px;color:var(--text-secondary);">When enabled, message content is encrypted with AES-256-GCM before leaving your device. Only the intended recipient can decrypt it. Currently works for direct messages. <span style="color:var(--accent-warning);">Requires both you and the recipient to have E2EE enabled.</span></p>' +
          '</div>' +
          '<div style="padding:16px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border-subtle);">' +
            '<label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">Delete attachments after</label>' +
            '<select id="set-delete-after" style="width:100%;padding:12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;">' +
              optionsHtml +
            '</select>' +
            '<div id="custom-time-row" style="display:' + (isCustom ? 'flex' : 'none') + ';gap:8px;align-items:center;margin-top:12px;">' +
              '<input id="custom-time-value" type="number" min="1" max="1440" value="' + (isCustom ? currentDelete : 30) + '" style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;">' +
              '<select id="custom-time-unit" style="padding:10px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;">' +
                '<option value="1"' + (isCustom && currentDelete < 60 ? ' selected' : '') + '>Minutes</option>' +
                '<option value="60"' + (isCustom && currentDelete >= 60 ? ' selected' : '') + '>Hours</option>' +
              '</select>' +
              '<button id="btn-custom-done" style="padding:10px 20px;background:var(--accent-primary);color:white;border-radius:8px;border:none;font-weight:600;cursor:pointer;">Done</button>' +
            '</div>' +
            '<p style="margin-top:8px;font-size:12px;color:var(--text-muted);">Attachments older than this will be automatically removed from the database. Max: 24 hours (1440 minutes).</p>' +
          '</div>' +
          '<div>' +
            '<h4 style="font-size:14px;color:var(--text-primary);margin-bottom:8px;">Storage Management</h4>' +
            '<button id="btn-clear-attachments" style="padding:10px 24px;background:var(--accent-danger);color:white;border-radius:8px;border:none;font-weight:600;cursor:pointer;">Clear All Saved Attachments</button>' +
            '<span id="clear-msg" style="margin-left:16px;font-size:14px;color:var(--accent-success);"></span>' +
          '</div>' +
        '</div>';

      var updateSettings = function(key, val) {
        var newSettings = { ...window.store.getState().settings };
        newSettings[key] = val;
        window.store.setState({ settings: newSettings });
        window.Storage.set('settings', newSettings);
      };

      // Backup buttons
      var updateStatus = function(el, text, isError) {
        el.style.display = 'inline';
        el.textContent = text;
        el.style.color = isError ? 'var(--accent-danger)' : 'var(--accent-success)';
      };

      content.querySelector('#btn-backup-orzip').addEventListener('click', async function() {
        if (!window.orbitAPI || !window.orbitAPI.backupCreate) { window.Toast.show('Error', 'Backup not available'); return; }
        var result = await window.orbitAPI.backupCreate('orzip');
        if (result.canceled) return;
        if (result.error) { window.Toast.show('Backup Failed', result.error); return; }
        window.Toast.show('Backup Created', 'Saved (' + (result.size / 1024).toFixed(1) + ' KB)');
      });
      content.querySelector('#btn-backup-zip').addEventListener('click', async function() {
        if (!window.orbitAPI || !window.orbitAPI.backupCreate) { window.Toast.show('Error', 'Backup not available'); return; }
        var result = await window.orbitAPI.backupCreate('zip');
        if (result.canceled) return;
        if (result.error) { window.Toast.show('Backup Failed', result.error); return; }
        window.Toast.show('Backup Created', 'Saved (' + (result.size / 1024).toFixed(1) + ' KB)');
      });

      // Restore with confirmation
      content.querySelector('#btn-restore').addEventListener('click', function() {
        if (!window.orbitAPI || !window.orbitAPI.backupRestore) { window.Toast.show('Error', 'Restore not available'); return; }
        if (window.ConfirmModal) {
          window.ConfirmModal.show({
            title: 'Restore Backup',
            message: 'This will replace ALL current data (messages, groups, friends, settings) with data from the backup. This cannot be undone. Are you sure?',
            confirmText: 'Restore',
            danger: true,
            onConfirm: async function() {
              var statusEl = content.querySelector('#restore-status');
              updateStatus(statusEl, 'Restoring...', false);
              var result = await window.orbitAPI.backupRestore();
              if (result.canceled) { statusEl.style.display = 'none'; return; }
              if (result.ok) {
                updateStatus(statusEl, 'Restore complete! Reloading...', false);
                setTimeout(function() { window.location.reload(); }, 1500);
              } else {
                updateStatus(statusEl, result.error || 'Restore failed', true);
              }
            }
          });
        }
      });

      // Health check
      content.querySelector('#btn-db-health').addEventListener('click', function() {
        if (!window.orbitAPI || !window.orbitAPI.dbHealthCheck) { window.Toast.show('Error', 'Health check not available'); return; }
        var result = window.orbitAPI.dbHealthCheck();
        var statusEl = content.querySelector('#health-status');
        if (result.ok && result.errors.length === 0) {
          var warnings = result.warnings && result.warnings.length > 0 ? ' (' + result.warnings.length + ' warnings)' : '';
          updateStatus(statusEl, 'Database healthy' + warnings, false);
        } else {
          var errMsg = result.errors ? result.errors.join('; ') : 'Unknown issue';
          updateStatus(statusEl, errMsg, true);
        }
      });

      // Database repair
      content.querySelector('#btn-db-repair').addEventListener('click', function() {
        if (!window.orbitAPI || !window.orbitAPI.dbRepair) { window.Toast.show('Error', 'Repair not available'); return; }
        if (window.ConfirmModal) {
          window.ConfirmModal.show({
            title: 'Repair Database',
            message: 'This will rebuild indexes, remove orphaned data, and attempt to fix integrity issues. The app may become unresponsive briefly. Proceed?',
            confirmText: 'Repair',
            danger: true,
            onConfirm: function() {
              var statusEl = content.querySelector('#repair-status');
              updateStatus(statusEl, 'Repairing...', false);
              var result = window.orbitAPI.dbRepair();
              if (result.ok) {
                var msg = 'Repair complete';
                if (result.repaired && result.repaired.length > 0) {
                  msg = result.repaired.join('; ');
                }
                if (result.warnings && result.warnings.length > 0) {
                  msg += ' (warnings: ' + result.warnings.join('; ') + ')';
                }
                updateStatus(statusEl, msg, result.warnings && result.warnings.length > 0);
              } else {
                updateStatus(statusEl, result.warnings ? result.warnings.join('; ') : 'Repair failed', true);
              }
            }
          });
        }
      });

      // Privacy mode toggle
      content.querySelector('#set-privacy').addEventListener('change', function(e) {
        var isChecked = e.target.checked;
        if (isChecked) {
          e.target.checked = false;
          if (window.ConfirmModal) {
            window.ConfirmModal.show({
              title: 'Enable Privacy Mode',
              message: "WARNING! When you toggle this mode, you'll enter Privacy Mode, which will NOT save any sended Images, Files, Folders but, you keep your messages, profile data!",
              confirmText: 'Enable',
              danger: true,
              onConfirm: function() {
                e.target.checked = true;
                updateSettings('privacyMode', true);
              }
            });
          }
        } else {
          updateSettings('privacyMode', false);
        }
      });

      // E2EE toggle
      var e2eeToggle = content.querySelector('#set-e2ee');
      if (e2eeToggle) {
        e2eeToggle.addEventListener('change', function(e) {
          var isChecked = e.target.checked;
          if (isChecked) {
            if (window.ConfirmModal) {
              window.ConfirmModal.show({
                title: 'Enable E2EE',
                message: 'End-to-end encryption will encrypt message content before sending. Recipients also need E2EE enabled to decrypt. Only direct messages are encrypted. Group messages will still be sent in plaintext.',
                confirmText: 'Enable',
                danger: false,
                onConfirm: function() {
                  updateSettings('e2eeEnabled', true);
                  if (window.Toast) window.Toast.show('E2EE Enabled', 'Messages will now be encrypted end-to-end');
                }
              });
            } else {
              updateSettings('e2eeEnabled', true);
            }
          } else {
            updateSettings('e2eeEnabled', false);
            if (window.Toast) window.Toast.show('E2EE Disabled', 'Messages will be sent in plaintext');
          }
        });
      }

      // Delete attachments after
      content.querySelector('#set-delete-after').addEventListener('change', function(e) {
        var val = parseInt(e.target.value);
        if (val === -1) {
          content.querySelector('#custom-time-row').style.display = 'flex';
        } else {
          content.querySelector('#custom-time-row').style.display = 'none';
          updateSettings('deleteAttachmentsAfter', val);
        }
      });

      var btnCustomDone = content.querySelector('#btn-custom-done');
      if (btnCustomDone) {
        btnCustomDone.addEventListener('click', function() {
          var timeVal = parseInt(content.querySelector('#custom-time-value').value) || 30;
          var unitVal = parseInt(content.querySelector('#custom-time-unit').value) || 1;
          var totalMinutes = Math.min(1440, Math.max(1, timeVal * unitVal));
          content.querySelector('#custom-time-value').value = Math.floor(totalMinutes / unitVal);
          updateSettings('deleteAttachmentsAfter', totalMinutes);
          btnCustomDone.textContent = 'Saved!';
          setTimeout(function() { btnCustomDone.textContent = 'Done'; }, 1500);
        });
      }

      // Clear all attachments
      content.querySelector('#btn-clear-attachments').addEventListener('click', function() {
        if (window.ConfirmModal) {
          window.ConfirmModal.show({
            title: 'Clear Attachments',
            message: 'Are you sure you want to permanently delete all saved attachments from the database? This cannot be undone.',
            confirmText: 'Clear All',
            danger: true,
            onConfirm: function() {
              if (window.orbitAPI) {
                window.orbitAPI.dbClearAttachments();
                content.querySelector('#clear-msg').textContent = 'Attachments cleared!';
                setTimeout(function() {
                  var clearMsgEl = content.querySelector('#clear-msg');
                  if (clearMsgEl) clearMsgEl.textContent = '';
                }, 3000);
              }
            }
          });
        }
      });

    } else if (tabName === 'about') {
      var version = window.orbitAPI ? (window.orbitAPI.version || '0.0.3-beta') : '0.0.3-beta';
      var friendCount = state.friends ? state.friends.length : 0;
      var groupCount = state.groups ? state.groups.length : 0;
      var chatCount = Object.keys(state.messages || {}).length;

      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">About</h3>' +

        // Section: App Info
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
              '<img src="icons/app/orbit_256.png" style="width:32px;height:32px;border-radius:8px;">' +
              '<div><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Orbit Beta</span><span style="font-size:11px;color:var(--text-muted);margin-left:8px;font-family:var(--font-mono);">v' + version + '</span></div>' +
            '</div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:block;">' +
            '<p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin:0 0 16px;">A peer-to-peer messaging app for local networks. Connect, chat, and share files without the cloud.</p>' +
            '<div style="font-size:12px;color:var(--text-muted);font-style:italic;">Built with Electron, Node.js, and better-sqlite3</div>' +
            '<button id="settings-btn-changelog" style="margin-top:16px;display:flex;align-items:center;gap:8px;padding:10px 20px;border-radius:24px;background:var(--accent-primary);color:#fff;border:none;cursor:pointer;font-size:13px;font-weight:600;transition:opacity 0.15s;" onmouseenter="this.style.opacity=\'0.85\'" onmouseleave="this.style.opacity=\'1\'">' +
              '<i data-lucide="sparkles" style="width:16px;height:16px;"></i> What\'s New' +
            '</button>' +
          '</div>' +
        '</div>' +

        // Section: Stats
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="bar-chart-3" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Statistics</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:none;">' +
            '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">' +
              '<div style="text-align:center;padding:16px;background:var(--bg-base);border-radius:10px;border:1px solid var(--border-subtle);">' +
                '<div style="font-size:28px;font-weight:700;color:var(--accent-primary);">' + friendCount + '</div>' +
                '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Friends</div>' +
              '</div>' +
              '<div style="text-align:center;padding:16px;background:var(--bg-base);border-radius:10px;border:1px solid var(--border-subtle);">' +
                '<div style="font-size:28px;font-weight:700;color:var(--accent-primary);">' + groupCount + '</div>' +
                '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Groups</div>' +
              '</div>' +
              '<div style="text-align:center;padding:16px;background:var(--bg-base);border-radius:10px;border:1px solid var(--border-subtle);">' +
                '<div style="font-size:28px;font-weight:700;color:var(--accent-primary);">' + chatCount + '</div>' +
                '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Chats</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';

      if (window.lucide) window.lucide.createIcons({ root: content });

      var changelogBtn = content.querySelector('#settings-btn-changelog');
      if (changelogBtn) {
        changelogBtn.addEventListener('click', function() {
          if (window.Changelog) window.Changelog.show();
        });
      }

    } else {
      content.innerHTML = '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">' + tabName + '</h3><p style="color:var(--text-muted);">Coming soon...</p>';
    }
  },

  open(tab) {
    tab = tab || 'account';
    this.container.style.display = 'flex';
    this.isOpen = true;
    var tabEl = this.container.querySelector('.settings-tab[data-tab="' + tab + '"]');
    if (tabEl) tabEl.click();
  },

  close() {
    this.container.style.display = 'none';
    this.isOpen = false;
  }
};

document.addEventListener('DOMContentLoaded', function() {
  window.SettingsModal.init();
});
