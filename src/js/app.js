// src/js/app.js

window.handleMediaError = function(el, url) {
  const container = el.parentElement;
  container.innerHTML = '';

  const isBlob = url.startsWith('blob:');

  const wrapper = document.createElement('div');
  wrapper.style.cssText = "width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:rgba(255,0,0,0.05); padding:8px; text-align:center; box-sizing:border-box; gap:4px;";

  const icon = document.createElement('i');
  icon.setAttribute('data-lucide', 'image-off');
  icon.style.cssText = "width:24px;height:24px;color:var(--text-muted);";

  const text = document.createElement('div');
  text.style.cssText = "font-size:10px; color:var(--text-secondary);";
  text.innerText = isBlob ? "Image expired" : "Not found";

  wrapper.appendChild(icon);
  wrapper.appendChild(text);

  // Browse button — let user re-link the file from disk
  const browseBtn = document.createElement('button');
  browseBtn.style.cssText = "background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:4px; color:var(--text-primary); font-size:10px; padding:4px 8px; cursor:pointer; display:flex; align-items:center; gap:4px;";
  browseBtn.innerHTML = '<i data-lucide="folder-open" style="width:12px;height:12px;"></i> Browse';

  browseBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', function() {
      if (input.files && input.files[0]) {
        const file = input.files[0];
        const localUrl = URL.createObjectURL(file);
        container.innerHTML = '';
        const img = document.createElement('img');
        img.src = localUrl;
        img.style.cssText = "width:100%; height:100%; object-fit:cover;";
        container.appendChild(img);
      }
    });
    input.click();
  });

  wrapper.appendChild(browseBtn);

  // Retry button — only for non-blob URLs (orbit-file:// etc.)
  if (!isBlob) {
    const retryBtn = document.createElement('button');
    retryBtn.style.cssText = "background:transparent; border:1px solid var(--border-subtle); border-radius:4px; color:var(--text-muted); font-size:10px; padding:4px 8px; cursor:pointer; display:flex; align-items:center; gap:4px;";
    retryBtn.innerHTML = '<i data-lucide="refresh-cw" style="width:12px;height:12px;"></i> Retry';

    retryBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      container.innerHTML = '';
      const img = document.createElement('img');
      img.src = url;
      img.style.cssText = "width:100%; height:100%; object-fit:cover;";
      img.onerror = function() {
        // Show static final error — no more auto-retry to prevent loops
        container.innerHTML = '';
        const fail = document.createElement('div');
        fail.style.cssText = "width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:rgba(255,0,0,0.05); padding:8px; text-align:center; box-sizing:border-box; gap:4px;";
        fail.innerHTML = '<i data-lucide="x-circle" style="width:24px;height:24px;color:var(--text-muted);"></i><div style="font-size:10px;color:var(--text-secondary);">Still not found</div>';
        container.appendChild(fail);
        if (window.lucide) window.lucide.createIcons({ root: container });
      };
      container.appendChild(img);
    });

    wrapper.appendChild(retryBtn);
  }

  container.appendChild(wrapper);
  if (window.lucide) window.lucide.createIcons({ root: container });
};

// Notification sound via Web Audio API (no audio files needed)
window.NotificationSound = {
  _ctx: null,
  _getContext() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this._ctx;
  },
  play() {
    try {
      var ctx = this._getContext();
      var now = ctx.currentTime;

      // Short pleasant chime - two ascending tones
      var osc1 = ctx.createOscillator();
      var gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      var osc2 = ctx.createOscillator();
      var gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.1); // E5
      gain2.gain.setValueAtTime(0.3, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.3);
    } catch (e) {
      // Audio not available - silent fail
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  console.log('Orbit Shell Booting...');
  
  // Initialize Lucide icons
  lucide.createIcons();

  // Handle titlebar controls
  document.getElementById('btn-minimize').addEventListener('click', () => {
    window.orbitAPI?.send('window-controls', 'minimize');
  });
  document.getElementById('btn-maximize').addEventListener('click', () => {
    window.orbitAPI?.send('window-controls', 'maximize');
  });
  document.getElementById('btn-close').addEventListener('click', () => {
    window.orbitAPI?.send('window-controls', 'close');
  });

  // Detect system dark mode preference
  const darkModeMedia = window.matchMedia('(prefers-color-scheme: dark)');

  // Apply settings from store
  const applySettings = (settings) => {
    var theme = settings.theme || 'dark';
    if (theme === 'system') {
      theme = darkModeMedia.matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
    
    // Zoom
    document.body.style.zoom = (settings.appZoom || 100) + '%';
    
    // Animation Speed
    var speed = settings.animSpeed || 'normal';
    var durations = { slow: '0.35s', normal: '0.18s', fast: '0.1s' };
    var dur = durations[speed] || '0.18s';
    document.documentElement.style.setProperty('--transition-duration', dur);

    // Animations on/off
    if (settings.animations === false) {
      document.documentElement.style.setProperty('--transition', 'none');
    } else {
      document.documentElement.style.setProperty('--transition', 'all ' + dur + ' cubic-bezier(0.4, 0, 0.2, 1)');
    }
    
    // Reduce Motion
    document.documentElement.classList.toggle('reduce-motion', !!settings.reduceMotion);

    // Message Animation
    document.body.setAttribute('data-message-anim', settings.messageAnim || 'slide');

    // Pattern
    if (settings.bgPattern === 'Dots') {
      document.documentElement.style.setProperty('--chat-bg-image', 'radial-gradient(var(--border-subtle) 1px, transparent 1px)');
      document.documentElement.style.setProperty('--chat-bg-size', '20px 20px');
    } else if (settings.bgPattern === 'Grid') {
      document.documentElement.style.setProperty('--chat-bg-image', 'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)');
      document.documentElement.style.setProperty('--chat-bg-size', '20px 20px');
    } else {
      document.documentElement.style.setProperty('--chat-bg-image', 'none');
    }
    
    // Bubbles
    document.body.setAttribute('data-bubbles', settings.messageBubbles || 'Modern');
    
    // Font Size
    if (settings.fontSize === 'Small') document.body.style.fontSize = '14px';
    else if (settings.fontSize === 'Large') document.body.style.fontSize = '18px';
    else document.body.style.fontSize = '16px';
  };
  
  applySettings(window.store.getState().settings);

  window.store.subscribe((state) => {
    applySettings(state.settings);
  });

  // Listen for OS theme changes when in 'system' mode
  darkModeMedia.addEventListener('change', () => {
    var state = window.store.getState();
    if (state.settings.theme === 'system') {
      applySettings(state.settings);
    }
  });

  // Initialize Identity
  if (window.Identity) window.Identity.init();

  // Scalable Sidebar Logic
  const appLayout = document.getElementById('app-layout');
  const resizer = document.getElementById('sidebar-resizer');
  let isResizing = false;
  let currentSidebarWidth = window.Storage ? window.Storage.get('sidebarWidth', 260) : 260;

  const updateSidebarWidth = (width) => {
    if (width < 200) width = 200;
    if (width > 500) width = 500;
    currentSidebarWidth = width;
    appLayout.style.gridTemplateColumns = `64px ${width}px 1fr`;
  };

  // Set initial width
  updateSidebarWidth(currentSidebarWidth);

  if (resizer) {
    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      document.body.style.cursor = 'col-resize';
      // Prevent text selection while dragging
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      // Calculate new width: mouse X minus left panel width (64)
      const newWidth = e.clientX - 64;
      updateSidebarWidth(newWidth);
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        if (window.Storage) window.Storage.set('sidebarWidth', currentSidebarWidth);
      }
    });
  }

  // Handle activeTab + sidebar toggle changes
  window.store.subscribe((state) => {
    const panelMiddle = document.getElementById('panel-middle');
    if (state.activeTab === 'gallery') {
      if (panelMiddle) panelMiddle.style.display = 'none';
      appLayout.style.gridTemplateColumns = `64px 1fr`;
      if (window._sidebarToggleBtn) window._sidebarToggleBtn.style.display = 'none';
    } else if (!state.sidebarMiddleVisible) {
      if (panelMiddle) panelMiddle.style.display = 'flex';
      appLayout.style.gridTemplateColumns = `64px 0px 1fr`;
      // Show floating re-open button
      var btn = window._sidebarToggleBtn;
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'btn-reopen-sidebar';
        btn.title = 'Show Sidebar';
        btn.style.cssText = 'position:absolute;left:0;top:50%;transform:translateY(-50%);z-index:10;width:24px;height:48px;border:1px solid var(--border-subtle);border-left:none;background:var(--bg-surface);color:var(--text-secondary);cursor:pointer;border-radius:0 8px 8px 0;display:flex;align-items:center;justify-content:center;';
        btn.innerHTML = '<i data-lucide="chevrons-right" style="width:16px;height:16px;"></i>';
        btn.addEventListener('click', function() {
          window.store.setState({ sidebarMiddleVisible: true });
        });
        document.getElementById('panel-right').appendChild(btn);
        if (window.lucide) window.lucide.createIcons({ root: btn });
        window._sidebarToggleBtn = btn;
      }
      btn.style.display = 'flex';
    } else {
      if (panelMiddle) panelMiddle.style.display = 'flex';
      appLayout.style.gridTemplateColumns = `64px ${currentSidebarWidth}px 1fr`;
      if (window._sidebarToggleBtn) window._sidebarToggleBtn.style.display = 'none';
    }
  });

  // Start Networking
  if (window.orbitAPI) {
    window.orbitAPI.networkStart(window.store.getState().currentUser);
    
    // Listen for peer discovery
    window.orbitAPI.on('peer-found', (peer) => {
      console.log('Discovered peer:', peer.username);
      window.store.addOrUpdatePeer(peer);
    });

    // Listen for incoming messages
    window.orbitAPI.on('network-message', (packet) => {
      console.log('Received packet:', packet);
      window.store.handleIncomingPacket(packet);
    });

    // Listen for incoming files
    window.orbitAPI.on('file-received', (data) => {
      console.log('File received:', data);
      
      const isImage = data.name.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i) != null;
      const attId = data.fileId || (window.orbitAPI ? window.orbitAPI.getUuid() : Date.now().toString());
      const fileSize = data.size || 0;
      
      window.store.handleIncomingPacket({
        type: window.Protocol.Types.MESSAGE,
        from: data.sender,
        payload: { 
          text: '',
          attachments: [{
            id: attId,
            type: isImage ? 'image' : 'file',
            name: data.name,
            size: fileSize,
            path: data.path,
            url: `orbit-db://attachment/${attId}`
          }]
        }
      });
    });

    window.orbitAPI.on('transfer-progress', (data) => {
      window.store.handleTransferProgress(data);
    });
  }

  // Load views
  if (window.SidebarLeft) window.SidebarLeft.init();
  if (window.SidebarMiddle) window.SidebarMiddle.init();
  if (window.ChatPanel) window.ChatPanel.init();
  
  // Load components
  if (window.EmojiPicker) window.EmojiPicker.init();
  if (window.Toast) window.Toast.init();
  if (window.ContextMenu) window.ContextMenu.init();

  console.log('Orbit Shell Ready.');
});
