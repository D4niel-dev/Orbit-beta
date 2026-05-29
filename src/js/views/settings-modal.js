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
      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">My Account</h3>' +
        '<div style="margin-bottom:24px;"><label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">Username</label>' +
        '<div style="display:flex;gap:12px;"><input type="text" id="input-username" value="' + window.Sanitize.escapeHtml(user.username) + '" style="flex:1;padding:12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-surface);color:var(--text-primary);font-size:16px;outline:none;">' +
        '<div style="padding:12px;border-radius:8px;background:var(--bg-surface);color:var(--text-muted);font-family:var(--font-mono);">#' + user.usertag + '</div></div></div>' +
        '<div style="margin-bottom:24px;"><label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">About Me</label>' +
        '<textarea id="input-bio" rows="4" style="width:100%;padding:12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:14px;outline:none;resize:none;">' + window.Sanitize.escapeHtml(user.bio || '') + '</textarea></div>' +
        '<div style="margin-bottom:32px;"><label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">Avatar & Banner</label>' +
        '<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">' +
          '<div style="flex:1;"><span style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:4px;">AVATAR URL</span><input type="text" id="input-avatar" placeholder="Avatar URL..." value="' + window.Sanitize.escapeHtml(user.avatar || '') + '" style="width:100%;padding:12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:14px;outline:none;"></div>' +
          '<label style="padding:12px;background:var(--bg-hover);color:var(--text-primary);border-radius:8px;cursor:pointer;border:1px solid var(--border-subtle);margin-top:16px;"><i data-lucide="upload" style="width:16px;"></i><input type="file" id="input-avatar-file" accept="image/*" style="display:none;"></label>' +
        '</div>' +
        '<div style="display:flex;gap:12px;align-items:center;">' +
          '<div style="flex:1;"><span style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:4px;">BANNER COLOR OR URL</span><input type="text" id="input-banner" placeholder="#Hex or Image URL..." value="' + window.Sanitize.escapeHtml(user.banner || '') + '" style="width:100%;padding:12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:14px;outline:none;"></div>' +
          '<label style="padding:12px;background:var(--bg-hover);color:var(--text-primary);border-radius:8px;cursor:pointer;border:1px solid var(--border-subtle);margin-top:16px;"><i data-lucide="upload" style="width:16px;"></i><input type="file" id="input-banner-file" accept="image/*" style="display:none;"></label>' +
        '</div></div>' +
        '<button id="btn-save-account" style="padding:10px 24px;background:var(--accent-primary);color:white;border-radius:8px;border:none;font-weight:600;cursor:pointer;">Save Changes</button>' +
        '<span id="save-msg" style="margin-left:16px;font-size:14px;color:var(--accent-success);"></span>';
      
      lucide.createIcons({ root: content });

      content.querySelector('#input-avatar-file').addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(evt) { content.querySelector('#input-avatar').value = evt.target.result; };
        reader.readAsDataURL(file);
      });
      content.querySelector('#input-banner-file').addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(evt) { content.querySelector('#input-banner').value = evt.target.result; };
        reader.readAsDataURL(file);
      });

      content.querySelector('#btn-save-account').addEventListener('click', function() {
        try {
          window.Identity.update({
            username: content.querySelector('#input-username').value.trim(),
            bio: content.querySelector('#input-bio').value.trim(),
            avatar: content.querySelector('#input-avatar').value.trim() || null,
            banner: content.querySelector('#input-banner').value.trim() || null
          });
          content.querySelector('#save-msg').textContent = "Saved!";
          setTimeout(function() { content.querySelector('#save-msg').textContent = ""; }, 3000);
        } catch (e) {
          content.querySelector('#save-msg').style.color = "var(--accent-danger)";
          content.querySelector('#save-msg').textContent = e.message;
        }
      });
    } else if (tabName === 'appearance') {
      var s = state.settings;
      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">Appearance</h3>' +
        '<div style="display:flex;flex-direction:column;gap:24px;">' +
          '<div><label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:12px;">Theme</label>' +
          '<div style="display:flex;gap:16px;">' +
          '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="theme" value="dark" ' + (s.theme === 'dark' ? 'checked' : '') + '> Dark Mode</label>' +
          '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="theme" value="light" ' + (s.theme === 'light' ? 'checked' : '') + '> Light Mode</label>' +
          '</div></div>' +
          '<div><label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">Font Size</label>' +
          '<select id="set-font" style="width:100%;padding:12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;">' +
            '<option '+(s.fontSize==='Small'?'selected':'')+'>Small</option><option '+(s.fontSize==='Medium'?'selected':'')+'>Medium</option><option '+(s.fontSize==='Large'?'selected':'')+'>Large</option>' +
          '</select></div>' +
          '<div><label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">Message Bubbles</label>' +
          '<select id="set-bubbles" style="width:100%;padding:12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;">' +
            '<option '+(s.messageBubbles==='Modern'?'selected':'')+'>Modern (Rounded)</option><option '+(s.messageBubbles==='Compact'?'selected':'')+'>Compact (Square)</option>' +
          '</select></div>' +
          '<div><label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">App Zoom ('+s.appZoom+'%)</label>' +
          '<input id="set-zoom" type="range" min="80" max="150" value="'+s.appZoom+'" style="width:100%;">' +
          '</div>' +
          '<div><label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;"><input id="set-anim" type="checkbox" '+(s.animations?'checked':'')+'> Enable UI Animations</label></div>' +
          '<div><label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;"><input id="set-24h" type="checkbox" '+(s.timeFormat24?'checked':'')+'> Use 24-hour time format</label></div>' +
          '<div><label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">Chat Background Pattern</label>' +
          '<select id="set-pattern" style="width:100%;padding:12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;">' +
            '<option '+(s.bgPattern==='None'?'selected':'')+'>None</option><option '+(s.bgPattern==='Dots'?'selected':'')+'>Dots</option><option '+(s.bgPattern==='Grid'?'selected':'')+'>Grid</option>' +
          '</select></div>' +
        '</div>';
        
      var updateSettings = function(key, val) {
        var newSettings = { ...window.store.getState().settings };
        newSettings[key] = val;
        window.store.setState({ settings: newSettings });
        window.Storage.set('settings', newSettings);
      };

      content.querySelectorAll('input[name="theme"]').forEach(function(radio) {
        radio.addEventListener('change', function(e) { updateSettings('theme', e.target.value); });
      });
      content.querySelector('#set-font').addEventListener('change', function(e) { updateSettings('fontSize', e.target.value); });
      content.querySelector('#set-bubbles').addEventListener('change', function(e) { updateSettings('messageBubbles', e.target.value.split(' ')[0]); });
      content.querySelector('#set-zoom').addEventListener('input', function(e) {
        updateSettings('appZoom', parseInt(e.target.value));
        e.target.previousElementSibling.textContent = 'App Zoom (' + e.target.value + '%)';
      });
      content.querySelector('#set-anim').addEventListener('change', function(e) { updateSettings('animations', e.target.checked); });
      content.querySelector('#set-24h').addEventListener('change', function(e) { updateSettings('timeFormat24', e.target.checked); });
      content.querySelector('#set-pattern').addEventListener('change', function(e) { updateSettings('bgPattern', e.target.value); });
      
    } else if (tabName === 'network') {
      var n = state.networkSettings;
      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">Network</h3>' +
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
