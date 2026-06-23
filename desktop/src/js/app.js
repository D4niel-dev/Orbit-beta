// src/js/app.js

window.handleMediaError = function(el, url) {
  console.warn('[MediaError] Failed to load:', url);
  // Auto-retry once on first failure — protocol may need a moment
  if (!url.startsWith('blob:') && !el.hasAttribute('data-retried')) {
    el.setAttribute('data-retried', '1');
    var busted = url + (url.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now();
    el.src = busted;
    return;
  }
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

// Two-stage img fallback: thumbnail -> full attachment URL -> handleMediaError
window.mediaImgOnError = function(el) {
  var fallback = el.getAttribute('data-fallback-src');
  if (fallback && el.getAttribute('data-using-fallback') !== '1') {
    el.setAttribute('data-using-fallback', '1');
    el.removeAttribute('data-retried');
    el.src = fallback + (fallback.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now();
    return;
  }
  var url = fallback || el.currentSrc || el.src || '';
  if (window.handleMediaError) window.handleMediaError(el, url);
};

// Video/audio: retry full URL before giving up
window.mediaSrcOnError = function(el) {
  var fallback = el.getAttribute('data-fallback-src');
  if (fallback && el.getAttribute('data-using-fallback') !== '1') {
    el.setAttribute('data-using-fallback', '1');
    el.src = fallback + (fallback.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now();
    if (el.load) el.load();
  }
};

// Lightweight typing indicator state (not in store to avoid full re-renders)
window.TypingState = {
  _data: {}, // { chatId: [{ userId, username, timeout }] }
  _listeners: [],
  onChange(fn) { this._listeners.push(fn); },
  _notify() { this._listeners.forEach(function(fn) { fn(); }); },
  getUsers(chatId) { return this._data[chatId] || []; },
  addUser(chatId, userId, username) {
    if (!this._data[chatId]) this._data[chatId] = [];
    var existing = this._data[chatId].find(function(u) { return u.userId === userId; });
    if (existing) {
      clearTimeout(existing.timeout);
      existing.timeout = setTimeout(function() { window.TypingState.removeUser(chatId, userId); }, 4000);
    } else {
      var entry = { userId: userId, username: username };
      entry.timeout = setTimeout(function() { window.TypingState.removeUser(chatId, userId); }, 4000);
      this._data[chatId].push(entry);
    }
    this._notify();
  },
  removeUser(chatId, userId) {
    if (!this._data[chatId]) return;
    var idx = this._data[chatId].findIndex(function(u) { return u.userId === userId; });
    if (idx >= 0) {
      clearTimeout(this._data[chatId][idx].timeout);
      this._data[chatId].splice(idx, 1);
      if (this._data[chatId].length === 0) delete this._data[chatId];
      this._notify();
    }
  }
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
  play(opts) {
    try {
      var ctx = this._getContext();
      var now = ctx.currentTime;
      opts = opts || {};
      var vol = (opts.volume != null ? opts.volume : 80) / 100;
      if (vol < 0.01) return;
      var type = opts.type || 'chime';

      var playTone = function(freq, start, dur, gainVal) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(gainVal * vol, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + dur);
      };

      if (type === 'chime') {
        // Two ascending tones (original)
        playTone(523.25, now, 0.15, 0.3);
        playTone(659.25, now + 0.1, 0.3, 0.3);
      } else if (type === 'pop') {
        // Short single pop
        playTone(880, now, 0.08, 0.25);
      } else if (type === 'gentle') {
        // Soft two-tone with lower volume
        playTone(392, now, 0.2, 0.2);
        playTone(523.25, now + 0.15, 0.35, 0.15);
      } else if (type === 'classic') {
        // Three-note classic ring
        playTone(440, now, 0.1, 0.2);
        playTone(554.37, now + 0.12, 0.1, 0.2);
        playTone(659.25, now + 0.24, 0.3, 0.2);
      }
    } catch (e) {
      // Audio not available - silent fail
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  console.log('Orbit Shell Booting...');

  // Debug log buffer for P2P Diagnostics
  window._debugLogBuffer = [];
  var _origConsole = { log: console.log, warn: console.warn, error: console.error, debug: console.debug };
  ['log','warn','error','debug'].forEach(function(level) {
    console[level] = function() {
      _origConsole[level].apply(console, arguments);
      try {
        var msgs = Array.prototype.slice.call(arguments).map(function(a) { return typeof a === 'string' ? a : JSON.stringify(a); });
        window._debugLogBuffer.push('[' + level.toUpperCase() + '] ' + msgs.join(' '));
        if (window._debugLogBuffer.length > 500) window._debugLogBuffer.shift();
      } catch(e) {}
    };
  });

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

  // ---- Apply settings from store ----
  const applySettings = (settings) => {
    var theme = settings.theme || 'dark';
    if (theme === 'system') {
      theme = darkModeMedia.matches ? 'dark' : 'light';
    } else if (theme === 'seasonal') {
      var m = new Date().getMonth();
      if (m >= 2 && m <= 4) { theme = 'seasonal-spring'; }
      else if (m >= 5 && m <= 7) { theme = 'seasonal-summer'; }
      else if (m >= 8 && m <= 10) { theme = 'seasonal-fall'; }
      else { theme = 'seasonal-winter'; }
    }
    document.documentElement.setAttribute('data-theme', theme);

    if (settings.customThemeColors && theme === 'custom') {
      Object.keys(settings.customThemeColors).forEach(function(key) {
        document.documentElement.style.setProperty('--' + key, settings.customThemeColors[key]);
      });
    } else if (theme !== 'custom') {
      var customKeys = ['bg-base','bg-surface','bg-sidebar','bg-hover','bg-active','text-primary','text-secondary','text-muted','accent-primary','accent-hover','accent-soft','border-subtle','border-strong'];
      customKeys.forEach(function(key) {
        document.documentElement.style.removeProperty('--' + key);
      });
    }

    var speed = settings.animSpeed || 'normal';
    var durations = { slow: '0.35s', normal: '0.18s', fast: '0.1s' };
    var dur = durations[speed] || '0.18s';
    document.documentElement.style.setProperty('--transition-duration', dur);

    if (settings.animations === false) {
      document.documentElement.style.setProperty('--transition', 'none');
    } else {
      document.documentElement.style.setProperty('--transition', 'all ' + dur + ' cubic-bezier(0.4, 0, 0.2, 1)');
    }

    document.documentElement.classList.toggle('reduce-motion', !!settings.reduceMotion);
    if (settings.reduceMotion && window.freezeGifImages) window.freezeGifImages(document);

    document.body.setAttribute('data-message-anim', settings.messageAnim || 'slide');

    if (settings.chatWallpaper) {
      document.documentElement.style.setProperty('--chat-bg-image', 'url("' + settings.chatWallpaper + '")');
      document.documentElement.style.setProperty('--chat-bg-size', 'cover');
    } else if (settings.bgPattern === 'Dots') {
      document.documentElement.style.setProperty('--chat-bg-image', 'radial-gradient(var(--border-subtle) 1px, transparent 1px)');
      document.documentElement.style.setProperty('--chat-bg-size', '20px 20px');
    } else if (settings.bgPattern === 'Grid') {
      document.documentElement.style.setProperty('--chat-bg-image', 'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)');
      document.documentElement.style.setProperty('--chat-bg-size', '20px 20px');
    } else if (settings.bgPattern === 'Diagonal Stripes') {
      document.documentElement.style.setProperty('--chat-bg-image', 'repeating-linear-gradient(45deg, transparent, transparent 12px, var(--border-subtle) 12px, var(--border-subtle) 13px)');
      document.documentElement.style.setProperty('--chat-bg-size', '');
    } else if (settings.bgPattern === 'Crosshatch') {
      document.documentElement.style.setProperty('--chat-bg-image', 'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px), radial-gradient(var(--border-subtle) 0.5px, transparent 0.5px)');
      document.documentElement.style.setProperty('--chat-bg-size', '30px 30px, 30px 30px, 15px 15px');
    } else if (settings.bgPattern === 'Circles') {
      document.documentElement.style.setProperty('--chat-bg-image', 'radial-gradient(circle at 50% 50%, var(--border-subtle) 2px, transparent 2px)');
      document.documentElement.style.setProperty('--chat-bg-size', '30px 30px');
    } else {
      document.documentElement.style.setProperty('--chat-bg-image', 'none');
    }

    document.body.setAttribute('data-bubbles', settings.messageBubbles || 'Modern');

    if (settings.fontSize === 'Small') document.body.style.fontSize = '14px';
    else if (settings.fontSize === 'Large') document.body.style.fontSize = '18px';
    else document.body.style.fontSize = '16px';

    document.documentElement.classList.toggle('dev-mode', !!settings.devMode);
    document.documentElement.classList.toggle('debug-display', !!settings.debugDisplay);
    document.documentElement.classList.toggle('show-message-ids', !!settings.showMessageIds);
    document.documentElement.classList.toggle('show-conn-stats', !!settings.showConnectionStats);
    document.documentElement.classList.toggle('experimental', !!settings.enableExperimental);
    document.documentElement.classList.toggle('experimental-animated-avatars', !!settings.experimentalAnimatedAvatars);
    document.documentElement.classList.toggle('experimental-message-fx', !!settings.experimentalMessageFx);
    document.documentElement.classList.toggle('experimental-compact-spacing', !!settings.experimentalCompactSpacing);
    document.documentElement.classList.toggle('experimental-fps-monitor', !!settings.experimentalFpsMonitor);
    document.documentElement.classList.toggle('experimental-dev-overlay', !!settings.experimentalDevOverlay);
    var perfMode = !!settings.experimentalPerformanceMode;
    document.documentElement.classList.toggle('performance-mode', perfMode);
    window._performanceMode = perfMode;

    // GIF freezing — bypass reduceMotion check when perf mode is on
    if (perfMode && window.freezeGifImages) {
      window.freezeGifImages(document, true);
    }

    // Link previews — disable background OG fetching
    if (perfMode) {
      window._linkPreviewCache = {};
    }

    // Connection stats overlay — stop the 2s interval
    if (perfMode && window._connStatsInterval) {
      clearInterval(window._connStatsInterval);
      window._connStatsInterval = null;
    }

    // Offline check interval — slow to 60s in perf mode, restore to 15s otherwise
    if (window._offlineCheckInterval) {
      clearInterval(window._offlineCheckInterval);
    }
    window._offlineCheckInterval = setInterval(function() {
      var state = window.store.getState();
      var now = Date.now();
      var updated = state.friends.map(function(f) {
        if (f.userId !== 'local-echo' && f.status === 'online' && f.lastSeen && now - f.lastSeen > 45000) {
          return { ...f, status: 'offline' };
        }
        return f;
      });
      window.store.setState({ friends: updated });
    }, perfMode ? 60000 : 15000);
  };

  // Freeze GIF images when reduce-motion or performance mode is enabled
  window._frozenCache = new Map();
  window.freezeGifImages = function(root, force) {
    if (!root) root = document;
    if (!root.querySelectorAll) return;
    if (!force) {
      var reduceMotion = window.store && window.store.getState && window.store.getState().settings && window.store.getState().settings.reduceMotion;
      if (!reduceMotion && !window._performanceMode) return;
    }
    function freezeOne(img) {
      img.setAttribute('data-frozen', 'true');
      var src = img.currentSrc || img.src;
      if (window._frozenCache.has(src)) {
        if (img.src !== window._frozenCache.get(src)) img.src = window._frozenCache.get(src);
        return;
      }
      if (img.complete && img.naturalWidth > 0) {
        var canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        var frozen = canvas.toDataURL('image/png');
        window._frozenCache.set(src, frozen);
        img.src = frozen;
      } else {
        img.addEventListener('load', function() {
          var c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          var frozen = c.toDataURL('image/png');
          window._frozenCache.set(img.currentSrc || img.src, frozen);
          img.src = frozen;
        });
      }
    }
    root.querySelectorAll('img[src*=".gif"]:not([data-frozen]), img[src*="data:image/gif"]:not([data-frozen]), .avatar img:not([data-frozen])').forEach(freezeOne);
  };

  applySettings(window.store.getState().settings);

  document.body.style.zoom = (window.store.getState().settings.appZoom || 100) + '%';

  darkModeMedia.addEventListener('change', () => {
    var state = window.store.getState();
    if (state.settings.theme === 'system') {
      applySettings(state.settings);
    }
  });

  // ---- Phase 1 (immediate): Settings, layout, keyboard shortcuts ----
  const appLayout = document.getElementById('app-layout');
  const resizer = document.getElementById('sidebar-resizer');
  let isResizing = false;
  let currentSidebarWidth = window.Storage ? window.Storage.get('sidebarWidth', 260) : 260;

  const updateSidebarWidth = (width) => {
    if (width < 200) width = 200;
    if (width > 500) width = 500;
    currentSidebarWidth = width;
    appLayout.style.gridTemplateColumns = '64px ' + width + 'px 1fr';
  };

  updateSidebarWidth(currentSidebarWidth);

  if (resizer) {
    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
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

  document.addEventListener('keydown', function(e) {
    var ctrl = e.ctrlKey || e.metaKey;
    var key = e.key.toLowerCase();
    if (ctrl && key === 'k') {
      e.preventDefault();
      if (window.ChatPanel) window.ChatPanel.showSearchModal();
      return;
    }
    if (ctrl && e.shiftKey && key === 'm') {
      e.preventDefault();
      var state = window.store.getState();
      var chatId = state.activeChatId;
      if (chatId && chatId !== 'local-echo') {
        window.store.toggleMute(chatId);
        var isMuted = state.mutedChats && state.mutedChats[chatId];
        if (window.Toast) window.Toast.show(isMuted ? 'Unmuted' : 'Muted', isMuted ? 'Notifications enabled' : 'Notifications muted');
      }
      return;
    }
    if ((ctrl && e.shiftKey && key === 'i') || key === 'f12') {
      e.preventDefault();
      var state = window.store.getState();
      if (state.settings && state.settings.devMode) {
        if (window.orbitAPI && window.orbitAPI.toggleDevtools) {
          window.orbitAPI.toggleDevtools();
        }
      } else {
        if (window.Toast) {
          window.Toast.show('Access Denied', 'Enable Developer Mode in Advanced Settings to access tools.', 'warning', 3000);
        }
      }
      return;
    }
    if (key === '/' && !ctrl && !e.shiftKey && !e.altKey) {
      var active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
      e.preventDefault();
      var input = document.getElementById('chat-input');
      if (input) input.focus();
      return;
    }
  });

  // ---- Phase 2 (next frame): Identity, network, views ----
  function startPhase2() {
    setTimeout(function() {
    window.store.subscribe((state, changedState) => {
      if (!changedState || 'settings' in changedState) applySettings(state.settings);
    });

    window.store.subscribe((state, changedState) => {
      if (!changedState || !('activeTab' in changedState || 'sidebarMiddleVisible' in changedState)) return;
      const panelMiddle = document.getElementById('panel-middle');
      if (state.activeTab === 'gallery') {
        if (panelMiddle) panelMiddle.style.display = 'none';
        appLayout.classList.remove('sidebar-collapsed');
        appLayout.style.gridTemplateColumns = '64px 1fr';
        if (window._sidebarToggleBtn) window._sidebarToggleBtn.style.display = 'none';
        return;
      }
      if (panelMiddle) panelMiddle.style.display = 'flex';
      if (!state.sidebarMiddleVisible) {
        appLayout.classList.add('sidebar-collapsed');
        appLayout.style.gridTemplateColumns = '';
        var btn = window._sidebarToggleBtn;
        if (!btn) {
          btn = document.createElement('button');
          btn.id = 'btn-reopen-sidebar';
          btn.title = 'Show Sidebar';
          btn.style.cssText = 'position:absolute;left:0;top:50%;transform:translateY(-50%);z-index:10;width:24px;height:48px;border:1px solid var(--border-subtle);border-left:none;background:var(--bg-surface);color:var(--text-secondary);cursor:pointer;border-radius:0 8px 8px 0;display:flex;align-items:center;justify-content:center;transition:opacity 0.2s;';
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
        appLayout.classList.remove('sidebar-collapsed');
        appLayout.style.gridTemplateColumns = '64px ' + currentSidebarWidth + 'px 1fr';
        if (window._sidebarToggleBtn) window._sidebarToggleBtn.style.display = 'none';
      }
    });

    if (window.Identity) {
      window.Identity.init();
      // Filter data for the current user (per-account message isolation)
      if (window.store) {
        window.store.reloadDataForCurrentUser();
        window.store.trackChatForCurrentUser('local-echo');
      }
    }

    // Profile frame migration — runs after Identity.init() so currentUser is real
    (function() {
      var state = window.store.getState();
      var pf = state.settings && state.settings.profileFrame;
      var cur = state.currentUser && state.currentUser.profileFrame;
      if (state.currentUser && state.currentUser.userId && pf && pf !== cur) {
        var updated = { ...state.currentUser, profileFrame: pf };
        window.store.setState({ currentUser: updated });
        if (window.orbitAPI) window.orbitAPI.dbSaveUser(updated);
      }
    })();

    // P2P stats tracking
    window._p2pStartTime = Date.now();
    window._p2pSentCount = 0;
    window._p2pRecvCount = 0;

    if (window.orbitAPI) {
      var state = window.store.getState();
      var reconnectEnabled = state.settings.netAutoReconnect !== false;
      var reconnectIntervalMs = (state.settings.netReconnectInterval || 10) * 1000;
      window.orbitAPI.networkStart(state.currentUser, reconnectEnabled, reconnectIntervalMs);

      window.orbitAPI.on('peer-found', (peer) => {
        console.log('[Renderer] peer-found:', peer.username, 'IP:', peer.ip);
        window.store.addOrUpdatePeer(peer);
      });

      window.orbitAPI.on('peer-gone', (peerId) => {
        if (peerId === 'local-echo') return;
        console.log('[Renderer] peer-gone:', peerId);
        var state = window.store.getState();
        var friends = state.friends.map(function(f) {
          if (f.userId === peerId && f.status === 'online') {
            return { ...f, status: 'offline', lastSeen: Date.now() };
          }
          return f;
        });
        window.store.setState({ friends: friends });
      });

      window.orbitAPI.on('network-message', (packet) => {
        if (packet.type === window.Protocol.Types.TYPING) {
          var chatId = packet.to || packet.from;
          var isTyping = packet.payload && packet.payload.isTyping;
          var username = packet.payload ? packet.payload.username : 'Someone';
          if (isTyping) {
            window.TypingState.addUser(chatId, packet.from, username);
          } else {
            window.TypingState.removeUser(chatId, packet.from);
          }
          return;
        }
        if (packet.type === window.Protocol.Types.GROUP_JOIN_REQUEST) {
          var joinPayload = packet.payload;
          var currentState = window.store.getState();
          var myGroup = currentState.groups.find(function(g) { return g.inviteCode === joinPayload.inviteCode && g.ownerId === currentState.currentUser.userId; });
          if (myGroup && window.ConfirmModal) {
            var requester = currentState.friends.find(function(f) { return f.userId === joinPayload.userId; });
            var requesterName = requester ? requester.username : joinPayload.username || 'Someone';
            window.ConfirmModal.show({
              title: 'Join Request',
              message: requesterName + ' wants to join "' + myGroup.groupName + '". Allow them in?',
              confirmText: 'Accept',
              cancelText: 'Deny',
              danger: false,
              onConfirm: function() {
                var newMember = { userId: joinPayload.userId, username: joinPayload.username, usertag: joinPayload.usertag || '', avatar: joinPayload.avatar || null, status: 'online', ip: requester ? requester.ip || '' : '', role: 'member', publicKey: joinPayload.publicKey || null };
                window.store.addMemberToGroup(myGroup.groupId, newMember);
                if (window.orbitAPI && requester) {
                  window.orbitAPI.networkSend(joinPayload.userId, requester.ip || '', window.Protocol.Types.GROUP_JOIN_RESPONSE, {
                    groupId: myGroup.groupId,
                    groupName: myGroup.groupName,
                    groupAvatar: myGroup.avatarDataUrl || null,
                    accepted: true,
                    members: [...(myGroup.members || []), newMember]
                  });
                  (myGroup.members || []).forEach(function(m) {
                    if (m.userId !== currentState.currentUser.userId) {
                      window.orbitAPI.networkSend(m.userId, m.ip || '', window.Protocol.Types.GROUP_MEMBER_ADDED, {
                        groupId: myGroup.groupId,
                        user: { userId: newMember.userId, username: newMember.username, usertag: newMember.usertag, avatar: newMember.avatar, status: 'online', role: 'member', joinedAt: new Date().toISOString(), publicKey: newMember.publicKey }
                      });
                    }
                  });
                }
              },
              onCancel: function() {
                if (window.orbitAPI && requester) {
                  window.orbitAPI.networkSend(joinPayload.userId, requester.ip || '', window.Protocol.Types.GROUP_JOIN_RESPONSE, {
                    groupId: myGroup.groupId,
                    groupName: myGroup.groupName,
                    accepted: false
                  });
                }
              }
            });
          } else if (myGroup) {
            var newMember = { userId: joinPayload.userId, username: joinPayload.username, usertag: joinPayload.usertag || '', avatar: joinPayload.avatar || null, status: 'online', ip: null, role: 'member', publicKey: joinPayload.publicKey || null };
            window.store.addMemberToGroup(myGroup.groupId, newMember);
            var requester = currentState.friends.find(function(f) { return f.userId === joinPayload.userId; });
            if (window.orbitAPI && requester) {
              window.orbitAPI.networkSend(joinPayload.userId, requester.ip || '', window.Protocol.Types.GROUP_JOIN_RESPONSE, {
                groupId: myGroup.groupId,
                groupName: myGroup.groupName,
                groupAvatar: myGroup.avatarDataUrl || null,
                accepted: true,
                members: [...(myGroup.members || []), newMember]
              });
              (myGroup.members || []).forEach(function(m) {
                if (m.userId !== currentState.currentUser.userId) {
                  window.orbitAPI.networkSend(m.userId, m.ip || '', window.Protocol.Types.GROUP_MEMBER_ADDED, {
                    groupId: myGroup.groupId,
                    user: { userId: newMember.userId, username: newMember.username, usertag: newMember.usertag, avatar: newMember.avatar, status: 'online', role: 'member', joinedAt: new Date().toISOString(), publicKey: newMember.publicKey }
                  });
                }
              });
            }
          }
          return;
        }
        if (packet.type === window.Protocol.Types.BEACON) {
          var bp = packet.payload || {};
          var state = window.store.getState();
          var friends = state.friends.map(function(f) {
            if (f.userId === (packet.from || bp.userId)) {
              var updated = { ...f, lastSeen: Date.now(), status: bp.status || f.status };
              if (bp.avatar) updated.avatar = bp.avatar;
              if (bp.banner !== undefined) updated.banner = bp.banner;
              if (bp.bio !== undefined) updated.bio = bp.bio;
              if (bp.profileFrame !== undefined) updated.profileFrame = bp.profileFrame;
              if (bp.publicKey) updated.publicKey = bp.publicKey;
              return updated;
            }
            return f;
          });
          window.store.setState({ friends: friends });
          return;
        }

        if (packet.type === window.Protocol.Types.CALL_OFFER) {
          var offerData = packet.payload;
          var state = window.store.getState();
          var caller = state.friends.find(function(f) { return f.userId === packet.from; }) || { username: packet.payload.callerName, avatar: packet.payload.callerAvatar };

          // Group call offer
          if (offerData.groupId) {
            if (window.CallManager && window.CallManager.activeCall && window.CallManager.activeCall.isGroup && window.CallManager.groupCallId === offerData.groupId) {
              // Already in this group call — this is another member connecting to us
              window.CallManager._connectGroupParticipant(packet.from, offerData.callerName, offerData.callerAvatar, offerData.sdp, offerData.isVideo, offerData.groupId);
              return;
            }
            if (window.CallManager && window.CallManager.activeCall) {
              if (window.orbitAPI) {
                window.orbitAPI.networkSend(packet.from, packet._fromIp || '', window.Protocol.Types.CALL_DECLINE, { reason: 'busy', groupId: offerData.groupId });
              }
              return;
            }
            // New incoming group call
            window.CallManager.targetUserId = packet.from;
            window.CallManager.targetPeerIp = packet._fromIp || (caller ? caller.ip : '');
            window.CallManager.incomingCallData = {
              callerId: packet.from, sdp: offerData.sdp, isVideo: offerData.isVideo,
              callerName: offerData.callerName, callerAvatar: offerData.callerAvatar,
              groupId: offerData.groupId
            };
            if (window.CallModal) {
              window.CallModal.show({ username: offerData.callerName || caller.username, avatar: offerData.callerAvatar || caller.avatar }, offerData.isVideo, true);
              var statusEl = window.CallModal.overlay && window.CallModal.overlay.querySelector('#call-status-text');
              if (statusEl) statusEl.textContent = 'Group call from ' + (offerData.groupName || 'Group');
            }
            return;
          }

          // DM call
          if (window.CallManager && window.CallManager.activeCall) {
            if (window.orbitAPI) {
              window.orbitAPI.networkSend(packet.from, packet._fromIp || '', window.Protocol.Types.CALL_DECLINE, { reason: 'busy' });
            }
            return;
          }
          window.CallManager.targetUserId = packet.from;
          window.CallManager.targetPeerIp = packet._fromIp || (caller ? caller.ip : '');
          window.CallManager.incomingCallData = {
            callerId: packet.from, sdp: offerData.sdp, isVideo: offerData.isVideo,
            callerName: offerData.callerName, callerAvatar: offerData.callerAvatar
          };
          if (window.CallModal) {
            window.CallModal.show({ username: offerData.callerName || caller.username, avatar: offerData.callerAvatar || caller.avatar }, offerData.isVideo, true);
          }
          return;
        }

        if (packet.type === window.Protocol.Types.CALL_ANSWER) {
          if (packet.payload.groupId && window.CallManager && window.CallManager.peerConnections) {
            var answererId = packet.payload.answererId || packet.from;
            var pc = window.CallManager.peerConnections[answererId];
            if (pc) {
              var answerDesc = new RTCSessionDescription({ type: 'answer', sdp: packet.payload.sdp });
              pc.setRemoteDescription(answerDesc).catch(function(err) {
                console.error('Set remote description (group answer) error:', err);
              });
            }
          } else if (window.CallManager && window.CallManager.peerConnection) {
            var answerDesc = new RTCSessionDescription({ type: 'answer', sdp: packet.payload.sdp });
            window.CallManager.peerConnection.setRemoteDescription(answerDesc).catch(function(err) {
              console.error('Set remote description (answer) error:', err);
            });
          }
          return;
        }

        if (packet.type === window.Protocol.Types.CALL_ICE_CANDIDATE) {
          if (packet.payload.groupId && window.CallManager) {
            window.CallManager.addGroupIceCandidate(packet.from, packet.payload);
          } else if (window.CallManager) {
            window.CallManager.addIceCandidate(packet.payload);
          }
          return;
        }

        if (packet.type === window.Protocol.Types.CALL_END) {
          if (window.CallManager && window.CallManager.activeCall && window.CallManager.activeCall.isGroup) {
            var leftUserId = packet.payload.userId || packet.from;
            if (window.CallManager.participants[leftUserId]) {
              if (window.CallModal) window.CallModal.removeParticipant(leftUserId);
              window.CallManager._removeGroupParticipant(leftUserId);
            } else {
              window.CallManager.cleanup();
            }
          } else {
            if (window.Toast) window.Toast.show('Call Ended', 'The other party ended the call.', 'info');
            if (window.CallManager) window.CallManager.cleanup();
          }
          return;
        }

        if (packet.type === window.Protocol.Types.CALL_DECLINE) {
          if (window.CallManager && window.CallManager.activeCall && window.CallManager.activeCall.isGroup) {
            var declUserId = packet.from;
            if (window.CallModal) window.CallModal.removeParticipant(declUserId);
            if (window.CallManager.peerConnections[declUserId]) {
              try { window.CallManager.peerConnections[declUserId].close(); } catch(e) {}
              delete window.CallManager.peerConnections[declUserId];
            }
            if (window.Toast) window.Toast.show('Declined', 'A participant declined the call.', 'warning');
          } else {
            if (window.Toast) window.Toast.show('Call Declined', 'The other party declined the call.', 'warning');
            if (window.CallManager) {
              if (window.CallModal) window.CallModal.updateStatus('Declined');
              setTimeout(function() { if (window.CallManager) window.CallManager.cleanup(); }, 1000);
            }
          }
          return;
        }

        window.store.handleIncomingPacket(packet);
      });

      window.orbitAPI.on('file-received', (data) => {
        console.log('File received:', data);
        var settings = window.store.getState().settings || {};
        if (settings.notifySound && !settings.notifyDnd && window.NotificationSound) {
          window.NotificationSound.play({ volume: settings.notifyVolume, type: settings.notifySoundType });
        }
        if ((document.hidden || window.store.getState().activeChatId !== data.sender) && window.orbitAPI && window.orbitAPI.showNotification) {
          var senderName = 'Someone';
          var senderAvatar = null;
          var friend = window.store.getState().friends.find(function(f) { return f.userId === data.sender; });
          if (friend) { senderName = friend.username; senderAvatar = friend.avatar; }
          window.orbitAPI.showNotification('File from ' + senderName, data.name, senderAvatar);
        }
        const isImage = data.name.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i) != null;
        const isAudio = data.name.match(/\.(webm|mp3|wav|ogg|flac|aac|m4a|wma)$/i) != null;
        const attId = data.fileId || (window.orbitAPI ? window.orbitAPI.getUuid() : Date.now().toString());
        const fileSize = data.size || 0;
        var attType = 'file';
        var attMime = 'application/octet-stream';
        if (isImage) {
          attType = 'image';
          attMime = data.name.toLowerCase().endsWith('.gif') ? 'image/gif' : (data.name.toLowerCase().endsWith('.png') ? 'image/png' : (data.name.toLowerCase().endsWith('.webp') ? 'image/webp' : (data.name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg')));
        } else if (isAudio) {
          attType = 'audio';
          var extMap = { webm: 'audio/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4', wma: 'audio/x-ms-wma' };
          var ext = data.name.split('.').pop().toLowerCase();
          attMime = extMap[ext] || 'audio/webm';
        }
        window.store.handleIncomingPacket({
          type: window.Protocol.Types.MESSAGE,
          from: data.sender,
          payload: {
            text: '',
            attachments: [{
              id: attId,
              type: attType,
              mimeType: attMime,
              name: data.name,
              size: fileSize,
              path: data.path,
              url: 'orbit-db://attachment/' + attId
            }]
          }
        });
      });

      window.orbitAPI.on('transfer-progress', (data) => {
        window.store.handleTransferProgress(data);
      });

      window.orbitAPI.on('transfer-error', (data) => {
        window.store.handleTransferError(data);
      });

      window.orbitAPI.on('state-invalidate', () => {
        window.location.reload();
      });
    }

    if (window.SidebarLeft) window.SidebarLeft.init();
    if (window.SidebarMiddle) window.SidebarMiddle.init();
    if (window.ChatPanel) window.ChatPanel.init();

    // Orbit Echo welcome sequence
    (function() {
      var state = window.store.getState();
      var echoMsgs = state.messages && state.messages['local-echo'];
      if (!echoMsgs || echoMsgs.length === 0) {
        var CID = 'local-echo', UID = 'local-echo', UNAME = 'Orbit Echo';
        var TXTS = [
          "Hi! I'm Orbit Echo! You can call me Bit if you want.",
          "You can send messages in here and i'll echo it back at you! (except for images, files, folders and sounds files)",
          "**THIS MESSAGE WILL SELF-DESTRUCT AFTER 5s**",
          "_Just kidding.._"
        ];
        var DELAYS = [5000, 7000, 7000, 7000];
        (function show(i) {
          if (i >= TXTS.length) return;
          window.TypingState.addUser(CID, UID, UNAME);
          setTimeout(function() {
            window.TypingState.removeUser(CID, UID);
            window.store.addMessage(CID, {
              id: 'echo-welcome-' + i + '-' + Date.now(),
              sender: UID,
              text: TXTS[i],
              timestamp: new Date().toISOString()
            });
            show(i + 1);
          }, DELAYS[i]);
        })(0);
      }
    })();

    if (window.ContextMenu) window.ContextMenu.init();

    // Offline check is created in applySettings() — not duplicated here

    console.log('Orbit Shell Ready.');
  }, 0);
  }

  // PIN Lock Check — block Phase 2/3 if PIN is enabled
  var pinEnabled = window.orbitAPI ? window.orbitAPI.pinStatus() : false;
  if (pinEnabled) {
    if (window.PinLockScreen) {
      window.PinLockScreen.show(function() {
        startPhase2();
        requestIdleCallback(function() {
          if (window.EmojiPicker) window.EmojiPicker.init();
          if (window.Toast) window.Toast.init();
          if (window.CustomThemeModal) window.CustomThemeModal.init();
          if (window.AccountSwitcher) window.AccountSwitcher.init();
          setTimeout(function() {
            if (window.TutorialModal && window.TutorialModal.shouldShowOnStartup()) {
              window.TutorialModal.show();
            }
          }, 800);
        });
      });
      return; // Don't proceed with normal boot until unlocked
    }
  }
  startPhase2();

  // ---- Phase 3 (idle): Non-critical components ----
  requestIdleCallback(function() {
    if (window.EmojiPicker) window.EmojiPicker.init();
    if (window.Toast) window.Toast.init();
    if (window.CustomThemeModal) window.CustomThemeModal.init();
    if (window.AccountSwitcher) window.AccountSwitcher.init();

    setTimeout(function() {
      if (window.TutorialModal && window.TutorialModal.shouldShowOnStartup()) {
        window.TutorialModal.show();
      }
    }, 800);
  });
});

// Frame overlay helper
window.Frames = {
  getFrameSrc(frameNum) {
    if (!frameNum || frameNum === 0) return null;
    return 'icons/frames/pfp_frame_' + frameNum + '.png';
  },
  wrapAvatar(avatarHtml, frameNum) {
    var src = this.getFrameSrc(frameNum);
    if (!src) return avatarHtml;
    return '<div style="position:relative;display:inline-block;">' +
      avatarHtml +
      '<img src="' + src + '" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;object-fit:contain;" draggable="false" alt="">' +
    '</div>';
  },
  wrapAvatarContainer(container, frameNum) {
    var src = this.getFrameSrc(frameNum);
    if (!src) return;
    if (!container) return;
    var existing = container.querySelector('.frame-overlay');
    if (existing) existing.remove();
    var img = document.createElement('img');
    img.className = 'frame-overlay';
    img.src = src;
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;object-fit:contain;';
    img.draggable = false;
    img.alt = 'frame';
    container.style.position = 'relative';
    container.appendChild(img);
  },
  getFrameForUser(userId) {
    var state = window.store ? window.store.getState() : null;
    if (!state) return 0;
    // Self — use currentUser.profileFrame (per-account)
    if (state.currentUser && state.currentUser.userId === userId) {
      return (state.currentUser.profileFrame != null ? state.currentUser.profileFrame : 0);
    }
    // Friend/peer
    var friend = state.friends.find(function(f) { return f.userId === userId; });
    if (friend && friend.profileFrame) return friend.profileFrame;
    // Group member
    for (var i = 0; i < state.groups.length; i++) {
      var member = state.groups[i].members.find(function(m) { return m.userId === userId; });
      if (member && member.profileFrame) return member.profileFrame;
    }
    return 0;
  }
};
