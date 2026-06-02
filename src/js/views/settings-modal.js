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
            '<button class="settings-tab" data-tab="privacy" style="text-align:left;padding:10px 16px;border-radius:8px;color:var(--text-secondary);background:transparent;border:none;cursor:pointer;">Privacy & Storage</button>' +
            '<button class="settings-tab" data-tab="notifications" style="text-align:left;padding:10px 16px;border-radius:8px;color:var(--text-secondary);background:transparent;border:none;cursor:pointer;">Notifications</button>' +
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
      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">Appearance</h3>' +
        '<div style="display:flex;flex-direction:column;gap:24px;">' +
          '<div><label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:12px;">Theme</label>' +
          '<div style="display:flex;gap:16px;flex-wrap:wrap;">' +
          '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);"><input type="radio" name="theme" value="dark" ' + (s.theme === 'dark' ? 'checked' : '') + '> <i data-lucide="moon" style="width:16px;height:16px;"></i> Dark</label>' +
          '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);"><input type="radio" name="theme" value="light" ' + (s.theme === 'light' ? 'checked' : '') + '> <i data-lucide="sun" style="width:16px;height:16px;"></i> Light</label>' +
          '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);"><input type="radio" name="theme" value="system" ' + (s.theme === 'system' ? 'checked' : '') + '> <i data-lucide="monitor" style="width:16px;height:16px;"></i> System</label>' +
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
          '<div><label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">Animation</label>' +
          '<div style="display:flex;flex-direction:column;gap:12px;padding:16px;background:var(--bg-hover);border-radius:8px;border:1px solid var(--border-subtle);">' +
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
            '<label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;">' +
              '<input id="set-anim" type="checkbox" '+(s.animations===false?'':'checked')+'> Enable UI Animations' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;">' +
              '<input id="set-reduce-motion" type="checkbox" '+(s.reduceMotion?'checked':'')+'> Reduce Motion (disable pulse, bounce, spin)' +
            '</label>' +
          '</div></div>' +
          '<div><label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;"><input id="set-24h" type="checkbox" '+(s.timeFormat24?'checked':'')+'> Use 24-hour time format</label></div>' +
          '<div><label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">Chat Background Pattern</label>' +
          '<select id="set-pattern" style="width:100%;padding:12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;">' +
            '<option '+(s.bgPattern==='None'?'selected':'')+'>None</option><option '+(s.bgPattern==='Dots'?'selected':'')+'>Dots</option><option '+(s.bgPattern==='Grid'?'selected':'')+'>Grid</option>' +
          '</select></div>' +
        '</div>';
        
      if (window.lucide) window.lucide.createIcons({ root: content });
        
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
      content.querySelector('#set-anim-speed').addEventListener('change', function(e) { updateSettings('animSpeed', e.target.value); });
      content.querySelector('#set-anim').addEventListener('change', function(e) { updateSettings('animations', e.target.checked); });
      content.querySelector('#set-reduce-motion').addEventListener('change', function(e) { updateSettings('reduceMotion', e.target.checked); });
      content.querySelector('#set-msg-anim').addEventListener('change', function(e) { updateSettings('messageAnim', e.target.value); });
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
    } else if (tabName === 'privacy') {
      var s = state.settings;
      var currentDelete = s.deleteAttachmentsAfter || 0; // 0 = never
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
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">Privacy & Storage</h3>' +
        '<div style="display:flex;flex-direction:column;gap:24px;">' +
          '<div style="padding:16px;background:var(--bg-hover);border-radius:8px;border:1px solid var(--border-subtle);">' +
            '<label style="display:flex;align-items:center;gap:12px;font-size:16px;color:var(--text-primary);cursor:pointer;font-weight:bold;">' +
              '<input id="set-privacy" type="checkbox" '+(s.privacyMode?'checked':'')+'> Enable Privacy Mode' +
            '</label>' +
            '<p style="margin-top:8px;font-size:13px;color:var(--text-secondary);">When enabled, attachments (images, files) are NOT saved to the database. They are only kept in a temporary folder and cleared when the app closes. Messages and profile data are still saved.</p>' +
          '</div>' +

          '<div style="padding:16px;background:var(--bg-hover);border-radius:8px;border:1px solid var(--border-subtle);">' +
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

      content.querySelector('#set-privacy').addEventListener('change', function(e) {
        var isChecked = e.target.checked;
        if (isChecked) {
          e.target.checked = false; // Revert visually until confirmed
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
      
      content.querySelector('#btn-clear-attachments').addEventListener('click', function(e) {
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
                setTimeout(function(){ 
                  var clearMsgEl = content.querySelector('#clear-msg');
                  if (clearMsgEl) clearMsgEl.textContent = ''; 
                }, 3000);
              }
            }
          });
        }
      });
    } else if (tabName === 'notifications') {
      var s = state.settings;
      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">Notifications</h3>' +
        '<div style="display:flex;flex-direction:column;gap:16px;">' +
          '<div style="padding:16px;background:var(--bg-hover);border-radius:8px;border:1px solid var(--border-subtle);">' +
            '<label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;font-weight:500;">' +
              '<input id="notify-sound" type="checkbox" '+(s.notifySound?'checked':'')+'> Play notification sound' +
              '<button id="btn-test-sound" title="Test Sound" style="margin-left:auto;padding:4px 10px;border-radius:6px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-secondary);cursor:pointer;font-size:11px;">Test</button>' +
            '</label>' +
          '</div>' +
          '<div style="padding:16px;background:var(--bg-hover);border-radius:8px;border:1px solid var(--border-subtle);">' +
            '<label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;font-weight:500;">' +
              '<input id="notify-preview" type="checkbox" '+(s.notifyPreview?'checked':'')+'> Show message preview in notifications' +
            '</label>' +
          '</div>' +
          '<div style="padding:16px;background:var(--bg-hover);border-radius:8px;border:1px solid var(--border-subtle);">' +
            '<label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;font-weight:500;">' +
              '<input id="notify-mentions" type="checkbox" '+(s.notifyGroupMentions?'checked':'')+'> Only notify on @mentions in groups' +
            '</label>' +
          '</div>' +
          '<div style="padding:16px;background:var(--bg-hover);border-radius:8px;border:1px solid var(--border-subtle);">' +
            '<label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;font-weight:500;">' +
              '<input id="notify-dnd" type="checkbox" '+(s.notifyDnd?'checked':'')+'> Do Not Disturb (mute all notifications)' +
            '</label>' +
          '</div>' +
        '</div>';

      var updateSettings = function(key, val) {
        var newSettings = { ...window.store.getState().settings };
        newSettings[key] = val;
        window.store.setState({ settings: newSettings });
        window.Storage.set('settings', newSettings);
      };

      content.querySelector('#notify-sound').addEventListener('change', function(e) { updateSettings('notifySound', e.target.checked); });
      content.querySelector('#btn-test-sound').addEventListener('click', function(e) { e.stopPropagation(); if (window.NotificationSound) window.NotificationSound.play(); });
      content.querySelector('#notify-preview').addEventListener('change', function(e) { updateSettings('notifyPreview', e.target.checked); });
      content.querySelector('#notify-mentions').addEventListener('change', function(e) { updateSettings('notifyGroupMentions', e.target.checked); });
      content.querySelector('#notify-dnd').addEventListener('change', function(e) { updateSettings('notifyDnd', e.target.checked); });
      
    } else if (tabName === 'advanced') {
      var s = state.settings || {};
      var toggleRow = function(id, label, desc, checked) {
        return '<div style="padding:16px;background:var(--bg-hover);border-radius:8px;border:1px solid var(--border-subtle);">' +
          '<label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;font-weight:500;">' +
            '<input id="' + id + '" type="checkbox" ' + (checked ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:var(--accent-primary);cursor:pointer;">' +
            '<div><div>' + label + '</div>' +
            (desc ? '<div style="font-size:12px;color:var(--text-muted);font-weight:400;margin-top:2px;">' + desc + '</div>' : '') +
          '</div></label>' +
        '</div>';
      };
      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">Advanced</h3>' +
        '<div style="display:flex;flex-direction:column;gap:12px;">' +
          toggleRow('adv-dev-mode', 'Developer Mode', 'Enable developer tools and instrumentation.', s.devMode) +
          toggleRow('adv-debug-display', 'Debug Display', 'Show debug overlays on messages, search results, reactions, replies, and all UI components.', s.debugDisplay) +
          toggleRow('adv-show-msg-ids', 'Show Message IDs', 'Display internal message IDs below each message.', s.showMessageIds) +
          toggleRow('adv-log-packets', 'Log Network Packets', 'Log all incoming and outgoing network packets to the console.', s.logNetworkPackets) +
          toggleRow('adv-conn-stats', 'Show Connection Stats', 'Display live connection statistics overlay.', s.showConnectionStats) +
          toggleRow('adv-experimental', 'Experimental Features', 'Enable experimental features that may be unstable.', s.enableExperimental) +
        '</div>';

      var updateSettings = function(key, val) {
        var newSettings = { ...window.store.getState().settings };
        newSettings[key] = val;
        window.store.setState({ settings: newSettings });
        window.Storage.set('settings', newSettings);
      };

      content.querySelector('#adv-dev-mode').addEventListener('change', function(e) { updateSettings('devMode', e.target.checked); });
      content.querySelector('#adv-debug-display').addEventListener('change', function(e) { updateSettings('debugDisplay', e.target.checked); });
      content.querySelector('#adv-show-msg-ids').addEventListener('change', function(e) { updateSettings('showMessageIds', e.target.checked); });
      content.querySelector('#adv-log-packets').addEventListener('change', function(e) { updateSettings('logNetworkPackets', e.target.checked); });
      content.querySelector('#adv-conn-stats').addEventListener('change', function(e) { updateSettings('showConnectionStats', e.target.checked); });
      content.querySelector('#adv-experimental').addEventListener('change', function(e) { updateSettings('enableExperimental', e.target.checked); });

    } else if (tabName === 'about') {
      var version = window.orbitAPI ? (window.orbitAPI.version || '0.0.3-beta') : '0.0.3-beta';
      content.innerHTML =
        '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;gap:16px;">' +
          '<img src="icons/app/orbit_256.png" style="width:96px;height:96px;border-radius:16px;">' +
          '<h2 style="font-family:var(--font-display);font-size:28px;font-weight:700;margin:0;color:var(--text-primary);">Orbit Beta</h2>' +
          '<div style="font-size:14px;color:var(--text-muted);font-family:var(--font-mono);">v' + version + '</div>' +
          '<p style="font-size:14px;color:var(--text-secondary);max-width:400px;line-height:1.6;">A peer-to-peer messaging app for local networks. Connect, chat, and share files without the cloud.</p>' +
          '<div style="display:flex;gap:24px;margin-top:16px;">' +
            '<div style="text-align:center;"><div style="font-size:24px;font-weight:700;color:var(--accent-primary);">' + (state.friends ? state.friends.length : 0) + '</div><div style="font-size:11px;color:var(--text-muted);">Friends</div></div>' +
            '<div style="text-align:center;"><div style="font-size:24px;font-weight:700;color:var(--accent-primary);">' + (state.groups ? state.groups.length : 0) + '</div><div style="font-size:11px;color:var(--text-muted);">Groups</div></div>' +
            '<div style="text-align:center;"><div style="font-size:24px;font-weight:700;color:var(--accent-primary);">' + (Object.keys(state.messages || {}).length) + '</div><div style="font-size:11px;color:var(--text-muted);">Chats</div></div>' +
          '</div>' +
          '<div style="margin-top:24px;font-size:12px;color:var(--text-muted);">Built with Electron, Node.js, and better-sqlite3</div>' +
        '</div>';
      
      if (window.lucide) window.lucide.createIcons({ root: content });
      
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
