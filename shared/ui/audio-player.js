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

  window.OrbitAudioPlayer = {
    create: function(container, url) {
      var wrapper = document.createElement('div');
      wrapper.className = 'oap-wrap';

      var canvas = document.createElement('canvas');
      canvas.className = 'oap-canvas';
      canvas.width = 400;
      canvas.height = 200;

      var _blobUrl = null;
      // Android WebView chokes on large data: URIs for <audio> — convert to blob
      if (typeof url === 'string' && url.startsWith('data:')) {
        try {
          var m = url.match(/^data:(audio\/[^;]+|application\/octet-stream);base64,(.+)$/);
          if (m) {
            var raw = atob(m[2]);
            var buf = new ArrayBuffer(raw.length);
            var bytes = new Uint8Array(buf);
            for (var bi = 0; bi < raw.length; bi++) bytes[bi] = raw.charCodeAt(bi);
            _blobUrl = URL.createObjectURL(new Blob([buf], { type: m[1] }));
            url = _blobUrl;
          }
        } catch(e) { /* silently keep original url */ }
      }
      var audio = document.createElement('audio');
      audio.src = url;
      audio.preload = 'metadata';
      audio.style.display = 'none';

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

      var loopBtn = document.createElement('button');
      loopBtn.className = 'oap-btn oap-loop';
      loopBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
      loopBtn.style.opacity = '0.4';

      var timeEl = document.createElement('span');
      timeEl.className = 'oap-time';
      timeEl.textContent = '0:00 / 0:00';

      ctrl.appendChild(playBtn);
      ctrl.appendChild(stopBtn);
      ctrl.appendChild(loopBtn);
      ctrl.appendChild(timeEl);
      wrapper.appendChild(canvas);
      wrapper.appendChild(seek);
      wrapper.appendChild(audio);
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
        if (srcConnected) return;
        var ctx = getCtx();
        if (!ctx) return;
        try {
          srcNode = ctx.createMediaElementSource(audio);
          analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          var bufLen = analyser.frequencyBinCount;
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

      function doPlay() {
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

      function doPause() {
        playing = false;
        audio.pause();
        playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>';
      }

      function doStop() {
        playing = false;
        audio.pause();
        audio.currentTime = 0;
        playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>';
        updTime();
        var c = canvas.getContext('2d');
        c.clearRect(0, 0, canvas.width, canvas.height);
        hue = Math.random() * 360;
      }

      playBtn.addEventListener('click', function(e) { e.stopPropagation(); if (audio.paused) doPlay(); else doPause(); });
      stopBtn.addEventListener('click', function(e) { e.stopPropagation(); doStop(); });
      loopBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        looping = !looping;
        loopBtn.style.opacity = looping ? '1' : '0.4';
      });

      // Seek bar
      var _seekDrag = false;
      function seekFromClientX(clientX) {
        var rect = seekTrack.getBoundingClientRect();
        var x = clientX - rect.left;
        var pct = Math.max(0, Math.min(1, x / rect.width));
        if (audio.duration) audio.currentTime = pct * audio.duration;
      }
      function updateSeekTip(clientX) {
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

      audio.addEventListener('timeupdate', updTime);
      audio.addEventListener('loadedmetadata', updTime);
      audio.addEventListener('ended', function() {
        if (looping) {
          audio.currentTime = 0;
          doPlay();
        } else {
          playing = false;
          playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>';
        }
      });
      audio.addEventListener('error', function() { timeEl.textContent = 'Error'; });
      audio.load();

      var player = {
        _w: wrapper,
        destroy: function() {
          dead = true;
          audio.pause();
          audio.src = '';
          if (_blobUrl) URL.revokeObjectURL(_blobUrl);
          if (animId) cancelAnimationFrame(animId);
          if (srcNode) { try { srcNode.disconnect(); } catch(e) {} }
          wrapper.remove();
          var idx = _players.indexOf(player);
          if (idx !== -1) _players.splice(idx, 1);
        }
      };
      _players.push(player);
      return player;
    },

    init: function(root) {
      root = root || document;
      // Destroy all tracked players (handles re-render cleanup — old wrappers
      // were already removed from DOM by innerHTML replacement before init call)
      while (_players.length) _players[0].destroy();
      root.querySelectorAll('.oap-placeholder').forEach(function(el) {
        if (el._oapInited) return;
        el._oapInited = true;
        var url = el.getAttribute('data-oap-url');
        if (url) window.OrbitAudioPlayer.create(el, url);
      });
    }
  };
})();
