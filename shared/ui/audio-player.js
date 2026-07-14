(function() {
  if (window.OrbitAudioPlayer) return;

  var _audioCtx = null;

  function getCtx() {
    if (!_audioCtx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      _audioCtx = new C();
    }
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    return _audioCtx;
  }

  function fmt(s) {
    if (!s || !isFinite(s)) return '0:00';
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  var _players = [];

  var _anyMenu = null;
  var _menuCleanup = null;

  function closeAnyMenu() {
    if (_anyMenu) { _anyMenu.remove(); _anyMenu = null; }
    if (_menuCleanup) { _menuCleanup(); _menuCleanup = null; }
  }

  window.OrbitAudioPlayer = {
    create: function(container, url) {
      var wrapper = document.createElement('div');
      wrapper.className = 'oap-wrap';

      var canvas = document.createElement('canvas');
      canvas.className = 'oap-canvas';
      canvas.width = 400;
      canvas.height = 200;

      var _pendingDataUrl = (typeof url === 'string' && url.indexOf('data:') === 0) ? url : null;
      var audio = null;
      var _audioReady = !_pendingDataUrl;
      var _loadingLazy = false;

      if (!_pendingDataUrl) {
        _initAudio(url);
      }

      var seek = document.createElement('div');
      seek.className = 'oap-seek';
      var seekTrack = document.createElement('div');
      seekTrack.className = 'oap-seek-track';
      var seekFill = document.createElement('div');
      seekFill.className = 'oap-seek-fill';
      var seekThumb = document.createElement('div');
      seekThumb.className = 'oap-seek-thumb';
      var seekTip = document.createElement('div');
      seekTip.className = 'oap-seek-tip';
      seekTrack.appendChild(seekFill);
      seekTrack.appendChild(seekThumb);
      seek.appendChild(seekTrack);
      seek.appendChild(seekTip);

      var ctrl = document.createElement('div');
      ctrl.className = 'oap-ctrl';

      var playBtn = document.createElement('button');
      playBtn.className = 'oap-btn oap-play';
      playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>';

      var stopBtn = document.createElement('button');
      stopBtn.className = 'oap-btn oap-stop';
      stopBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>';

      var volBtn = document.createElement('button');
      volBtn.className = 'oap-btn oap-vol';
      volBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" stroke="currentColor" stroke-width="2" fill="none"/></svg>';

      var volSlider = document.createElement('input');
      volSlider.type = 'range';
      volSlider.className = 'oap-vol-slider';
      volSlider.min = 0;
      volSlider.max = 100;
      volSlider.value = 100;
      volSlider.style.display = 'none';

      var moreBtn = document.createElement('button');
      moreBtn.className = 'oap-btn oap-more';
      moreBtn.title = 'More';
      moreBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>';

      var timeEl = document.createElement('span');
      timeEl.className = 'oap-time';
      timeEl.textContent = '0:00 / 0:00';

      ctrl.appendChild(playBtn);
      ctrl.appendChild(stopBtn);
      ctrl.appendChild(volBtn);
      ctrl.appendChild(volSlider);
      ctrl.appendChild(moreBtn);
      ctrl.appendChild(timeEl);
      wrapper.style.position = 'relative';
      var canvasBox = document.createElement('div');
      canvasBox.className = 'oap-canvas-box';
      canvasBox.appendChild(canvas);
      wrapper.appendChild(canvasBox);
      /* audio appended in _initAudio */
      wrapper.appendChild(seek);
      wrapper.appendChild(ctrl);
      container.appendChild(wrapper);

      var analyser = null;
      var srcNode = null;
      var animId = null;
      var hue = Math.random() * 360;
      var dead = false;
      var srcConnected = false;
      var playing = false;
      var looping = false;

      function connectSrc() {
        if (!audio) return;
        if (srcConnected) return;
        var ctx = getCtx();
        if (!ctx) return;
        try {
          srcNode = ctx.createMediaElementSource(audio);
          analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          srcNode.connect(analyser);
          analyser.connect(ctx.destination);
          srcConnected = true;
        } catch(e) {
          if (window.MStore && MStore.settings.logNetworkPackets) console.log('[OAP] connectSrc:', e.message);
        }
      }

      function draw() {
        if (dead || !playing) { animId = requestAnimationFrame(draw); return; }
        if (!analyser) { animId = requestAnimationFrame(draw); return; }
        var data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        var c = canvas.getContext('2d');
        c.clearRect(0, 0, canvas.width, canvas.height);
        var len = data.length;
        var w = canvas.width / len;
        for (var i = 0; i < len; i++) {
          var h = (data[i] / 255) * canvas.height;
          var barHue = (hue + i * 12) % 360;
          c.fillStyle = 'hsl(' + barHue + ', 80%, 60%)';
          c.fillRect(i * w + 1, canvas.height - h, Math.max(w - 2, 1), h);
        }
        hue = (hue + 0.5) % 360;
        animId = requestAnimationFrame(draw);
      }

      function updTime() {
        timeEl.textContent = fmt(audio.currentTime) + ' / ' + fmt(audio.duration);
        var pct = audio.duration ? (audio.currentTime / audio.duration * 100) : 0;
        seekFill.style.width = pct + '%';
        seekThumb.style.left = pct + '%';
      }

      function _initAudio(srcUrl) {
        audio = document.createElement('audio');
        audio.src = srcUrl;
        audio.preload = 'auto';
        var _isMobile = typeof navigator !== 'undefined' && (/android|iphone|ipad|ipod/i.test(navigator.userAgent) || !!window.Capacitor);
        if (_isMobile) audio.muted = true;
        audio.style.display = 'none';
        wrapper.appendChild(audio);
        audio.addEventListener('timeupdate', updTime);
        audio.addEventListener('loadedmetadata', updTime);
        audio.addEventListener('ended', function() {
          if (looping) { audio.currentTime = 0; doPlay(); }
          else { playing = false; playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>'; }
        });
        audio.addEventListener('error', function() { timeEl.textContent = 'Error'; });
        audio.load();
        _audioReady = true;
        try { if (player) player._a = audio; } catch(e) {}
      }

      function _ensureLoaded(callback) {
        if (_audioReady) { callback(); return; }
        if (_loadingLazy) { setTimeout(function() { _ensureLoaded(callback); }, 100); return; }
        _loadingLazy = true;
        setTimeout(function() {
          try {
            if (typeof url === 'string' && url.indexOf('data:') === 0) {
              _initAudio(url);
              audio.addEventListener('canplaythrough', function onReady() {
                audio.removeEventListener('canplaythrough', onReady);
                _loadingLazy = false;
                callback();
              });
              setTimeout(function() {
                if (_loadingLazy) { _loadingLazy = false; callback(); }
              }, 10000);
              return;
            }
          } catch(e) {}
          _loadingLazy = false;
          callback();
        }, 50);
      }

      function _doPlayInner() {
        connectSrc();
        var ctx = getCtx();
        if (ctx && ctx.state === 'suspended') ctx.resume();
        audio.play().then(function() {
          playing = true;
          playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
          if (!animId) draw();
        }).catch(function(e) {
          if (window.MStore && MStore.settings.logNetworkPackets) console.log('[OAP] play fail:', e.message);
        });
      }

      function doPlay() {
        if (_pendingDataUrl && !_audioReady) {
          _ensureLoaded(function() { if (audio) doPlay(); });
          return;
        }
        if (!audio) { timeEl.textContent = 'Error'; return; }
        if (audio.muted && audio.volume > 0) audio.muted = false;
        if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
          var onReady = function() {
            audio.removeEventListener('canplaythrough', onReady);
            if (!audio || dead) return;
            _doPlayInner();
          };
          audio.addEventListener('canplaythrough', onReady, { once: true });
          audio.load();
          return;
        }
        _doPlayInner();
      }

      function doPause() {
        playing = false;
        if (audio) audio.pause();
        playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>';
      }

      function doStop() {
        playing = false;
        if (audio) audio.pause();
        if (audio) audio.currentTime = 0;
        playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>';
        updTime();
        var c = canvas.getContext('2d');
        c.clearRect(0, 0, canvas.width, canvas.height);
        hue = Math.random() * 360;
      }

      playBtn.addEventListener('click', function(e) { e.stopPropagation(); if (!audio || audio.paused) doPlay(); else doPause(); });
      stopBtn.addEventListener('click', function(e) { e.stopPropagation(); doStop(); });

      volBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeAnyMenu();
        volSlider.style.display = volSlider.style.display === 'none' ? 'block' : 'none';
      });
      volSlider.addEventListener('input', function() {
        if (!audio) return;
        audio.volume = this.value / 100;
        volBtn.innerHTML = this.value == 0
          ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'
          : '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" stroke="currentColor" stroke-width="2" fill="none"/></svg>';
      });

      var speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
      var currentSpeed = 1;

      function menuCSS(z) {
        var r = 'system-ui,-apple-system,sans-serif';
        return 'position:fixed;top:auto;bottom:auto;left:auto;right:auto;background:var(--bg-surface,#222);border:1px solid var(--border-color,#333);border-radius:8px;padding:4px 0;min-width:180px;box-shadow:0 4px 16px rgba(0,0,0,0.4);box-shadow:var(--shadow-md, 0 4px 16px rgba(0,0,0,0.4));z-index:' + z + ';font-family:' + r + ';font-size:13px;overflow:hidden;';
      }

      function showMenu(rect) {
        closeAnyMenu();
        var menu = document.createElement('div');
        menu.className = 'oap-menu';

        function mi(label, iconSvg, onClick, disabled, active) {
          var item = document.createElement('div');
          var tc = disabled ? 'var(--text-muted,#666)' : 'var(--text-primary,#eee)';
          item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:13px;color:' + tc + ';cursor:' + (disabled ? 'default' : 'pointer') + ';transition:background 0.1s;';
          if (active) item.style.background = 'rgba(255,255,255,0.08)';
          if (!disabled) {
            item.addEventListener('mouseenter', function() { if (!active) item.style.background = 'var(--bg-hover,#333)'; });
            item.addEventListener('mouseleave', function() { if (!active) item.style.background = 'transparent'; });
          }
          item.innerHTML = iconSvg + '<span>' + label + '</span>';
          if (!disabled) item.addEventListener('click', function(e) { e.stopPropagation(); closeAnyMenu(); onClick(); });
          menu.appendChild(item);
        }

        function subMenu(title, items) {
          closeAnyMenu();
          var sub = document.createElement('div');
          sub.className = 'oap-menu';
          sub.style.cssText = menuCSS(100000) + 'min-width:160px;';

          var back = document.createElement('div');
          back.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:13px;color:var(--text-muted,#999);cursor:pointer;transition:background 0.1s;border-bottom:1px solid var(--border-color,#333);';
          back.addEventListener('mouseenter', function() { back.style.background = 'var(--bg-hover,#333)'; });
          back.addEventListener('mouseleave', function() { back.style.background = 'transparent'; });
          back.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg><span>' + title + '</span>';
          back.addEventListener('click', function(e) { e.stopPropagation(); closeAnyMenu(); showMenu(rect); });
          sub.appendChild(back);

          items.forEach(function(it) {
            var sel = document.createElement('div');
            var isActive = it.active;
            sel.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:13px;color:var(--text-primary,#eee);cursor:pointer;transition:background 0.1s;';
            if (isActive) sel.style.background = 'rgba(255,255,255,0.08)';
            sel.addEventListener('mouseenter', function() { sel.style.background = isActive ? 'rgba(255,255,255,0.08)' : 'var(--bg-hover,#333)'; });
            sel.addEventListener('mouseleave', function() { sel.style.background = isActive ? 'rgba(255,255,255,0.08)' : 'transparent'; });
            sel.innerHTML = (isActive ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="20,6 9,17 4,12"/></svg>' : '<span style="width:14px"></span>') + '<span>' + it.label + '</span>';
            sel.addEventListener('click', function(e) { e.stopPropagation(); it.action(); closeAnyMenu(); });
            sub.appendChild(sel);
          });

          positionAndShow(sub, rect);
          _anyMenu = sub;
          listenClose(sub);
        }

        mi(looping ? 'Loop: On' : 'Loop: Off',
          looping
            ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>'
            : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
          function() { looping = !looping; }, false, looping
        );

        mi('Playback Speed', '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', function() {
          subMenu('Playback Speed', speeds.map(function(spd) {
            return { label: spd + 'x', active: spd === currentSpeed, action: function() { currentSpeed = spd; if (audio) audio.playbackRate = spd; } };
          }));
        });

        positionAndShow(menu, rect);
        _anyMenu = menu;
        listenClose(menu);
      }

      function positionAndShow(el, rect) {
        el.style.cssText = menuCSS(99999);
        el.style.left = Math.min(rect.right + 4, window.innerWidth - 180) + 'px';
        el.style.top = (rect.bottom + 4) + 'px';
        el.style.visibility = 'visible';
        document.body.appendChild(el);
        var maxH = window.innerHeight - rect.bottom - 10;
        if (maxH < 120) {
          el.style.top = '';
          el.style.bottom = '4px';
          el.style.maxHeight = (rect.top - 10) + 'px';
          el.style.overflowY = 'auto';
        } else {
          el.style.maxHeight = maxH + 'px';
          el.style.overflowY = 'auto';
        }
      }

      function listenClose(el) {
        var fn = function(e2) { if (!el.contains(e2.target) && e2.target !== moreBtn) closeAnyMenu(); };
        document.addEventListener('click', fn);
        _menuCleanup = function() { document.removeEventListener('click', fn); };
      }

      moreBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        volSlider.style.display = 'none';
        if (_anyMenu) { closeAnyMenu(); return; }
        showMenu(moreBtn.getBoundingClientRect());
      });

      var _seekDrag = false;
      function seekFromClientX(clientX) {
        if (!audio) return;
        var rect = seekTrack.getBoundingClientRect();
        var x = clientX - rect.left;
        var pct = Math.max(0, Math.min(1, x / rect.width));
        if (audio.duration) audio.currentTime = pct * audio.duration;
      }
      function updateSeekTip(clientX) {
        if (!audio) return;
        var rect = seekTrack.getBoundingClientRect();
        var x = clientX - rect.left;
        var pct = Math.max(0, Math.min(1, x / rect.width));
        var t = audio.duration ? pct * audio.duration : 0;
        seekTip.textContent = fmt(t);
        var tipW = seekTip.offsetWidth || 40;
        var tx = Math.max(2, Math.min(rect.width - tipW - 2, x - tipW / 2));
        seekTip.style.left = tx + 'px';
        seekTip.style.display = 'block';
      }
      seekTrack.addEventListener('mousedown', function(e) { e.preventDefault(); _seekDrag = true; seekFromClientX(e.clientX); });
      document.addEventListener('mousemove', function(e) { if (_seekDrag) seekFromClientX(e.clientX); });
      document.addEventListener('mouseup', function() { _seekDrag = false; });
      seekTrack.addEventListener('touchstart', function(e) { e.preventDefault(); var t = e.touches[0]; seekFromClientX(t.clientX); });
      seekTrack.addEventListener('touchmove', function(e) { e.preventDefault(); var t = e.touches[0]; seekFromClientX(t.clientX); });
      seekTrack.addEventListener('mousemove', function(e) { updateSeekTip(e.clientX); });
      seekTrack.addEventListener('mouseleave', function() { seekTip.style.display = 'none'; });

      var player = {
        _w: wrapper,
        _a: audio,
        destroy: function() {
          dead = true;
          closeAnyMenu();
          if (audio) { audio.pause(); audio.src = ''; }
          if (animId) cancelAnimationFrame(animId);
          if (srcNode) { try { srcNode.disconnect(); } catch(e) {} }
          if (analyser) { try { analyser.disconnect(); } catch(e) {} }
          wrapper.remove();
          var idx = _players.indexOf(player);
          if (idx !== -1) _players.splice(idx, 1);
        }
      };
      _players.push(player);
      return player;
    },

    isAnyPlaying: function() {
      for (var i = 0; i < _players.length; i++) {
        if (_players[i]._a && !_players[i]._a.paused) return true;
      }
      return false;
    },
    savePlaying: function() {
      var saved = [];
      for (var i = _players.length - 1; i >= 0; i--) {
        if (_players[i]._a && !_players[i]._a.paused) {
          var p = _players.splice(i, 1)[0];
          var row = p._w.parentElement ? p._w.closest('.message-row') : null;
          p._msgId = row ? row.getAttribute('data-msg-id') : null;
          p._w.remove();
          saved.push(p);
        }
      }
      return saved;
    },
    restorePlaying: function(saved) {
      if (!saved || !saved.length) return;
      var feed = document.getElementById('chat-message-feed');
      saved.forEach(function(p) {
        if (feed && p._msgId) {
          var row = feed.querySelector('.message-row[data-msg-id="' + p._msgId + '"]');
          if (row) {
            var ph = row.querySelector('.oap-placeholder');
            if (ph) {
              var dup = ph.querySelector('.oap-wrap');
              if (dup) {
                for (var j = _players.length - 1; j >= 0; j--) {
                  if (_players[j]._w === dup) { _players[j].destroy(); break; }
                }
                dup.remove();
              }
              ph.appendChild(p._w);
              ph._oapInited = true;
              _players.push(p);
              return;
            }
          }
        }
        if (feed) feed.appendChild(p._w);
        _players.push(p);
      });
    },

    _observer: null,
    _getObserver: function() {
      if (!this._observer) {
        var self = this;
        this._observer = new IntersectionObserver(function(entries) {
          entries.forEach(function(entry) {
            if (entry.isIntersecting) {
              var el = entry.target;
              self._observer.unobserve(el);
              if (el._oapInited) return;
              if (!el.isConnected) return;
              el._oapInited = true;
              var url = el.getAttribute('data-oap-url');
              if (url) window.OrbitAudioPlayer.create(el, url);
            }
          });
        }, { rootMargin: '200px' });
      }
      return this._observer;
    },

    init: function(root) {
      root = root || document;
      while (_players.length) _players[0].destroy();
      var observer = this._getObserver();
      root.querySelectorAll('.oap-placeholder').forEach(function(el) {
        if (el._oapInited) return;
        observer.observe(el);
      });
    }
  };
})();
