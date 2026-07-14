(function() {
  if (window.OrbitVideoPlayer) return;

  // Inject loading spinner keyframe once
  if (!document.getElementById('ovp-spinner-style')) {
    var os = document.createElement('style');
    os.id = 'ovp-spinner-style';
    os.textContent = '@keyframes ovp-spin{to{transform:rotate(360deg)}}.ovp-loading{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);z-index:5;border-radius:8px}.ovp-spinner{width:40px;height:40px;border:4px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;animation:ovp-spin .8s linear infinite}';
    document.head.appendChild(os);
  }

  var _anyMenu = null;
  var _menuCleanup = null;

  function closeAnyMenu() {
    if (_anyMenu) { _anyMenu.remove(); _anyMenu = null; }
    if (_menuCleanup) { _menuCleanup(); _menuCleanup = null; }
  }

  function dbg() {
    var args = Array.prototype.slice.call(arguments);
    if (window.MStore && MStore.settings && MStore.settings.logNetworkPackets) {
      console.log.apply(console, ['[OVP]'].concat(args));
    }
    if (window.orbitAPI && window.orbitAPI.log) {
      try { window.orbitAPI.log.apply(window.orbitAPI, ['[OVP]'].concat(args)); } catch(e) {}
    }
  }

  function fmt(s) {
    if (!s || !isFinite(s)) return '0:00';
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  /* Parse MP4 duration from the moov→mvhd atom inside an ArrayBuffer.
     Falls back to tkhd/mdhd for fragmented MP4s where mvhd.duration=0.
     Returns seconds or null if parsing fails. */
  function parseMp4Duration(ab) {
    if (!ab || ab.byteLength === 0) return null;
    var bytes = new Uint8Array(ab);
    var len = bytes.length;
    function u32(o) {
      if (o + 4 > len) return 0;
      return ((bytes[o] << 24) | (bytes[o+1] << 16) |
              (bytes[o+2] << 8) | bytes[o+3]) >>> 0;
    }
    function str4(o) {
      if (o + 4 > len) return '';
      return String.fromCharCode(bytes[o], bytes[o+1], bytes[o+2], bytes[o+3]);
    }

    // Find moov
    var moovStart = -1, moovEnd = -1;
    var i = 0;
    while (i < len - 8) {
      var size = u32(i);
      var type = str4(i + 4);
      if (size === 0) size = len - i;
      else if (size === 1) { if (i + 16 > len) break; size = u32(i+8) * 4294967296 + u32(i+12); }
      if (size < 8) break;
      if (type === 'moov') { moovStart = i; moovEnd = i + size; break; }
      i += size;
    }
    if (moovStart < 0) return null;

    var mvhdDur = null, mvhdTs = 0, bestTrackDur = null;

    function scan(start, end) {
      var p = start;
      while (p < end - 8) {
        var bs = u32(p); var bt = str4(p + 4);
        if (bs === 0) bs = end - p;
        else if (bs === 1) { if (p + 16 > end) break; bs = u32(p+8)*4294967296 + u32(p+12); }
        if (bs < 8) break;
        var be = Math.min(p + bs, end);
          if (bt === 'mvhd') {
          var ver = bytes[p + 8];
          var ts, dur;
          if (ver === 0) { ts = u32(p+20); dur = u32(p+24); }
          else { ts = u32(p+28); dur = u32(p+32)*4294967296 + u32(p+36); }
          mvhdTs = ts;
          if (ts > 0 && dur > 0) mvhdDur = dur / ts;
        } else if (bt === 'tkhd') {
          var ver = bytes[p + 8];
          var tkTs = mvhdTs || 1000;
          var tkDur = ver === 0 ? u32(p+28) : u32(p+36)*4294967296 + u32(p+40);
          if (tkTs > 0 && tkDur > 0) { var d = tkDur / tkTs; if (bestTrackDur === null || d > bestTrackDur) bestTrackDur = d; }
        } else if (bt === 'mdhd') {
          var ver = bytes[p + 8];
          var mdTs, mdDur;
          if (ver === 0) { mdTs = u32(p+20); mdDur = u32(p+24); }
          else { mdTs = u32(p+28); mdDur = u32(p+32)*4294967296 + u32(p+36); }
          if (mdTs > 0 && mdDur > 0) { var d = mdDur / mdTs; if (bestTrackDur === null || d > bestTrackDur) bestTrackDur = d; }
        } else if (bt === 'mehd') {
          var ver = bytes[p + 8];
          var meDur = ver === 0 ? u32(p+12) : u32(p+12)*4294967296 + u32(p+16);
          if (meDur > 0) { var d = meDur / (mvhdTs || 1000); if (bestTrackDur === null || d > bestTrackDur) bestTrackDur = d; }
        } else if (bt === 'trak' || bt === 'mdia' || bt === 'minf' || bt === 'stbl' || bt === 'mvex') {
          scan(p + 8, be);
        }
        p += bs;
      }
    }
    scan(moovStart + 8, moovEnd);

    // fMP4 fallback: scan entire buffer for moof→traf→trun
    if (!bestTrackDur || bestTrackDur <= 0) {
      var totalFragDur = 0;
      var fragTs = mvhdTs || 1000;
      var i2 = 0;
      while (i2 < len - 8) {
        var fSize = u32(i2); var fType = str4(i2 + 4);
        if (fSize === 0) fSize = len - i2;
        else if (fSize === 1) { if (i2 + 16 > len) break; fSize = u32(i2+8)*4294967296 + u32(i2+12); }
        if (fSize < 8) break;
        var fEnd = Math.min(i2 + fSize, len);
        if (fType === 'moof') {
          var p = i2 + 8;
          while (p < fEnd - 8) {
            var tSize = u32(p); var tType = str4(p + 4);
            if (tSize === 0) tSize = fEnd - p;
            else if (tSize === 1) { if (p + 16 > fEnd) break; tSize = u32(p+8)*4294967296 + u32(p+12); }
            if (tSize < 8) break;
            var tEnd = Math.min(p + tSize, fEnd);
            if (tType === 'traf') {
              var q = p + 8;
              while (q < tEnd - 8) {
                var rSize = u32(q); var rType = str4(q + 4);
                if (rSize === 0) rSize = tEnd - q;
                else if (rSize === 1) { if (q + 16 > tEnd) break; rSize = u32(q+8)*4294967296 + u32(q+12); }
                if (rSize < 8) break;
                if (rType === 'trun') {
                  var flags = u32(q + 8) & 0x00FFFFFF;
                  var sampleCount = u32(q + 12);
                  var off = 16;
                  if (flags & 0x000001) off += 4;
                  if (flags & 0x000004) off += 4;
                  for (var s = 0; s < sampleCount; s++) {
                    if (flags & 0x000100) { totalFragDur += u32(q + off); off += 4; }
                    if (flags & 0x000200) off += 4;
                    if (flags & 0x000400) off += 4;
                    if (flags & 0x000800) off += 4;
                  }
                }
                q += rSize;
              }
            }
            p += tSize;
          }
        }
        i2 += fSize;
      }
      if (totalFragDur > 0) {
        var d = totalFragDur / fragTs;
        if (!bestTrackDur || d > bestTrackDur) bestTrackDur = d;
      }
    }

    if (mvhdDur !== null && mvhdDur > 0) return mvhdDur;
    if (bestTrackDur !== null && bestTrackDur > 0) return bestTrackDur;
    return null;
  }

  var _players = [];

  window.OrbitVideoPlayer = {
    create: function(container, url) {
      var wrapper = document.createElement('div');
      wrapper.className = 'ovp-wrap';

      var _logId = Math.random().toString(36).slice(2, 6);

      dbg('[' + _logId + '] create() url type=' + (url ? url.slice(0, 5) : 'null') + ' len=' + (url ? url.length : 0));

      // For data: URLs, defer video element creation — decode to blob on first play.
      // This avoids Android WebView blob decode corruption from setting blob: URLs as video.src directly.
      var _pendingDataUrl = (typeof url === 'string' && url.indexOf('data:') === 0) ? url : null;
      var video = null;
      var _videoReady = !_pendingDataUrl;
      var _loadingLazy = false;
      var knownDuration = null;
      var dead = false;
      var playing = false;
      var looping = false;
      var _decodeRetries = 0;
      var _skipCorrupted = null;

      wrapper.style.position = 'relative';

      // Loading overlay
      var loadingOverlay = document.createElement('div');
      loadingOverlay.className = 'ovp-loading';
      var spinnerEl = document.createElement('div');
      spinnerEl.className = 'ovp-spinner';
      loadingOverlay.appendChild(spinnerEl);
      loadingOverlay.style.display = 'none';

      var seek = document.createElement('div');
      seek.className = 'ovp-seek';
      var seekTrack = document.createElement('div');
      seekTrack.className = 'ovp-seek-track';
      var seekFill = document.createElement('div');
      seekFill.className = 'ovp-seek-fill';
      var seekThumb = document.createElement('div');
      seekThumb.className = 'ovp-seek-thumb';
      var seekTip = document.createElement('div');
      seekTip.className = 'ovp-seek-tip';
      seekTrack.appendChild(seekFill);
      seekTrack.appendChild(seekThumb);
      seek.appendChild(seekTrack);
      seek.appendChild(seekTip);

      var ctrl = document.createElement('div');
      ctrl.className = 'ovp-ctrl';

      var playBtn = document.createElement('button');
      playBtn.className = 'ovp-btn ovp-play';
      playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>';

      var stopBtn = document.createElement('button');
      stopBtn.className = 'ovp-btn ovp-stop';
      stopBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>';

      // Volume
      var volBtn = document.createElement('button');
      volBtn.className = 'ovp-btn ovp-vol';
      volBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" stroke="currentColor" stroke-width="2" fill="none"/></svg>';

      var volSlider = document.createElement('input');
      volSlider.type = 'range';
      volSlider.className = 'ovp-vol-slider';
      volSlider.min = 0;
      volSlider.max = 100;
      volSlider.value = 100;
      volSlider.style.display = 'none';

      // Fullscreen button
      var fsBtn = document.createElement('button');
      fsBtn.className = 'ovp-btn ovp-fs';
      fsBtn.title = 'Fullscreen';
      fsBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';

      // More options button (⋮)
      var moreBtn = document.createElement('button');
      moreBtn.className = 'ovp-btn ovp-more';
      moreBtn.title = 'More';
      moreBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>';

      var timeEl = document.createElement('span');
      timeEl.className = 'ovp-time';
      timeEl.textContent = '0:00 / 0:00';

      ctrl.appendChild(playBtn);
      ctrl.appendChild(stopBtn);
      ctrl.appendChild(volBtn);
      ctrl.appendChild(volSlider);
      ctrl.appendChild(fsBtn);
      ctrl.appendChild(moreBtn);
      ctrl.appendChild(timeEl);
      var videoBox = document.createElement('div');
      videoBox.className = 'ovp-video-box';
      wrapper.appendChild(videoBox);
      wrapper.appendChild(loadingOverlay);
      wrapper.appendChild(seek);
      wrapper.appendChild(ctrl);
      container.appendChild(wrapper);

      function _initVideo(srcUrl) {
        video = document.createElement('video');
        video.className = 'ovp-video';
        video.preload = 'auto';
        video.playsInline = true;
        var _isMobile = typeof navigator !== 'undefined' && (/android|iphone|ipad|ipod/i.test(navigator.userAgent) || !!window.Capacitor);
        if (_isMobile) video.muted = true;
        video.src = srcUrl;
        dbg('[' + _logId + '] _initVideo src=' + (srcUrl ? srcUrl.slice(0, 20) : 'null'));

        video.addEventListener('timeupdate', updTime);
        video.addEventListener('loadedmetadata', function() {
          dbg('[' + _logId + '] loadedmetadata  knownDuration=' + knownDuration + '  browserDuration=' + video.duration + ' (' + fmt(video.duration) + ')  readyState=' + video.readyState + '  vw=' + video.videoWidth + 'x' + video.videoHeight);
          updTime();
          parseDurationFromSource(srcUrl);
        });
        video.addEventListener('durationchange', function() {
          dbg('[' + _logId + '] durationchange  knownDuration=' + knownDuration + '  browserDuration=' + video.duration + ' (' + fmt(video.duration) + ')  readyState=' + video.readyState);
          updTime();
        });

        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          dbg('[' + _logId + '] metadata already available at init, updTime()');
          setTimeout(updTime, 10);
        }

        video.addEventListener('play', function() { dbg('[' + _logId + '] PLAY  currentTime=' + video.currentTime); });
        video.addEventListener('playing', function() { dbg('[' + _logId + '] PLAYING  currentTime=' + video.currentTime + '  paused=' + video.paused); });
        video.addEventListener('pause', function() {
          dbg('[' + _logId + '] PAUSE  currentTime=' + video.currentTime + '  readyState=' + video.readyState);
        });
        video.addEventListener('seeking', function() { dbg('[' + _logId + '] SEEKING  currentTime=' + video.currentTime); });
        video.addEventListener('seeked', function() { dbg('[' + _logId + '] SEEKED  knownDuration=' + knownDuration + '  browserDuration=' + video.duration + '  currentTime=' + video.currentTime); updTime(); if (video.currentTime > 1e9) { dbg('[' + _logId + '] seeked was forced seek, seeking back to 0'); video.currentTime = 0; } });
        video.addEventListener('waiting', function() { dbg('[' + _logId + '] WAITING  currentTime=' + video.currentTime + '  readyState=' + video.readyState); });
        video.addEventListener('suspend', function() { dbg('[' + _logId + '] SUSPEND  currentTime=' + video.currentTime); });
        video.addEventListener('stalled', function() { dbg('[' + _logId + '] STALLED  currentTime=' + video.currentTime); });
        video.addEventListener('ended', function() {
          if (looping) {
            video.currentTime = 0;
            doPlay();
          } else {
            playing = false;
            playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>';
          }
        });
        video.addEventListener('error', handleVideoError);

        videoBox.appendChild(video);
        _videoReady = true;
        video.load();
        // Update player reference if created lazily
        try { if (player) player._v = video; } catch(e) {}
        dbg('[' + _logId + '] _initVideo complete');
      }

      // For non-data URLs, create video element eagerly
      if (!_pendingDataUrl) _initVideo(url);

      function handleVideoError() {
        var errMsg = video.error ? video.error.message : 'none';
        dbg('[' + _logId + '] ERROR  code=' + (video.error ? video.error.code : 'unknown') + ' message=' + errMsg + '  currentTime=' + video.currentTime);

        if (errMsg.indexOf('PIPELINE_ERROR_DECODE') !== -1) {
          if (video.duration && video.currentTime > video.duration - 5) {
            dbg('[' + _logId + '] decode error near end of available buffer (' + video.currentTime.toFixed(2) + 's / ' + video.duration.toFixed(2) + 's), treating as ended');
            timeEl.textContent = 'Incomplete';
            video.dispatchEvent(new Event('ended'));
            return;
          }
          if (_decodeRetries < 3) {
            _decodeRetries++;
            var skipTo = video.currentTime + 2;
            dbg('[' + _logId + '] decode error (' + _decodeRetries + '/3), reloading and skipping to ' + skipTo.toFixed(2) + 's');
            video.src = '';
            setTimeout(function() {
              if (dead) return;
              video.src = url;
              var onMeta = function() {
                video.removeEventListener('loadedmetadata', onMeta);
                if (dead) return;
                video.currentTime = skipTo;
                video.play().catch(function(e2) { dbg('[' + _logId + '] retry play failed:', e2.message); });
              };
              video.addEventListener('loadedmetadata', onMeta);
            }, 200);
            return;
          }
          // Retries exhausted — check if the DOM placeholder has a refreshed URL
          var freshUrl = container.getAttribute('data-ovp-url');
          if (freshUrl && freshUrl !== url) {
            dbg('[' + _logId + '] retry exhausted, trying fresh URL from DOM');
            url = freshUrl;
            _decodeRetries = 0;
            video.src = url;
            video.load();
            return;
          }
          // Retries exhausted, URL unchanged — try permanent corruption skip
          // Store the skip point so replays don't re-encounter the corruption
          if (knownDuration && video && video.currentTime > 0 && video.currentTime < knownDuration - 2) {
            var skipPoint = video.currentTime + 2;
            dbg('[' + _logId + '] permanent corruption skip: storing skip=' + skipPoint + 's for future replays');
            _skipCorrupted = skipPoint;
            // Reload from after corruption point
            video.src = '';
            setTimeout(function() {
              if (dead) return;
              video.src = url;
              var onMeta = function() {
                video.removeEventListener('loadedmetadata', onMeta);
                if (dead) return;
                video.currentTime = skipPoint;
                video.play().catch(function(e2) { dbg('[' + _logId + '] skip play failed:', e2.message); });
              };
              video.addEventListener('loadedmetadata', onMeta);
            }, 200);
            return;
          }
        }
        timeEl.textContent = 'Error';
      }

      function parseDurationFromSource(srcUrl) {
        if (knownDuration) return;
        if (!srcUrl) return;
        if (_pendingDataUrl) {
          // Decode duration directly from the original data URL's base64 — no blob fetch needed
          var m = _pendingDataUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (!m) return;
          try {
            var ab = window.orbitBase64ToArrayBuffer(m[2]);
            if (ab && ab.byteLength > 0) {
              var d = parseMp4Duration(ab);
              if (d && d > 0) {
                knownDuration = d;
                dbg('[' + _logId + '] parsed MP4 duration from data: URL=' + knownDuration + 's');
                updTime();
              }
            }
          } catch(e) { dbg('[' + _logId + '] data URL duration parse error:', e); }
        } else if (srcUrl.startsWith('blob:')) {
          setTimeout(function() {
            if (dead || knownDuration) return;
            dbg('[' + _logId + '] fetching blob to parse MP4 duration');
            fetch(srcUrl).then(function(r) { return r.arrayBuffer(); }).then(function(ab) {
              if (dead || knownDuration) return;
              var d = parseMp4Duration(ab);
              if (d && d > 0) {
                knownDuration = d;
                dbg('[' + _logId + '] parsed MP4 duration from blob=' + knownDuration + 's');
                updTime();
              }
            }).catch(function(e) {
              dbg('[' + _logId + '] blob fetch failed:', e);
              // Fallback: try parsing from original data URL
              if (_pendingDataUrl) {
                try {
                  var dm2 = _pendingDataUrl.match(/^data:([^;]+);base64,(.+)$/);
                  if (dm2) {
                    var fallbackAb = window.orbitBase64ToArrayBuffer(dm2[2]);
                    if (fallbackAb && fallbackAb.byteLength > 0) {
                      var d2 = parseMp4Duration(fallbackAb);
                      if (d2 && d2 > 0) {
                        knownDuration = d2;
                        dbg('[' + _logId + '] parsed MP4 duration from data URL fallback=' + knownDuration + 's');
                        updTime();
                      }
                    }
                  }
                } catch(e2) { dbg('[' + _logId + '] data URL duration fallback error:', e2); }
              }
            });
          }, 0);
        } else if (!srcUrl.startsWith('orbit-db://') && !srcUrl.startsWith('orbit-file://')) {
          dbg('[' + _logId + '] no knownDuration and browser duration zero, seeking to force read');
          if (video) video.currentTime = 1e7;
        }
      }

      function dur() { return knownDuration || (video ? video.duration : 0); }

      function updTime() {
        if (!video) return;
        var d = dur();
        timeEl.textContent = fmt(video.currentTime) + ' / ' + fmt(d);
        var pct = d ? (video.currentTime / d * 100) : 0;
        seekFill.style.width = pct + '%';
        seekThumb.style.left = pct + '%';
      }

      function doPlay() {
        if (_pendingDataUrl && !_videoReady) {
          _ensureLoaded(function() { if (video) doPlay(); });
          return;
        }
        if (!video) { timeEl.textContent = 'Error'; return; }
        if (video.muted && video.volume > 0) video.muted = false;
        video.play().then(function() {
          playing = true;
          playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
        }).catch(function(e) {
          if (window.MStore && MStore.settings.logNetworkPackets) console.log('[OVP] play fail:', e.message);
        });
      }

      function _ensureLoaded(callback) {
        if (_videoReady) { callback(); return; }
        if (_loadingLazy) { setTimeout(function() { _ensureLoaded(callback); }, 100); return; }
        _loadingLazy = true;
        loadingOverlay.style.display = 'flex';

        setTimeout(function() {
          try {
            // Set video.src directly to the original data URL — avoids Android WebView
            // blob decode corruption. The browser handles data: URLs natively.
            if (typeof url === 'string' && url.indexOf('data:') === 0) {
              dbg('[' + _logId + '] lazy-init video with data: URL directly');
              _initVideo(url);
              video.addEventListener('canplaythrough', function onReady() {
                video.removeEventListener('canplaythrough', onReady);
                _loadingLazy = false;
                loadingOverlay.style.display = 'none';
                callback();
              });
              setTimeout(function() {
                if (_loadingLazy) { _loadingLazy = false; loadingOverlay.style.display = 'none'; callback(); }
              }, 10000);
              return;
            }
          } catch(e) { dbg('[' + _logId + '] lazy init error:', e); }
          _loadingLazy = false;
          loadingOverlay.style.display = 'none';
          callback();
        }, 50);
      }

      function doPause() {
        playing = false;
        if (video) video.pause();
        playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>';
      }

      function doStop() {
        playing = false;
        if (video) { video.pause(); video.currentTime = 0; }
        _skipCorrupted = null;
        playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>';
        updTime();
      }

      playBtn.addEventListener('click', function(e) { e.stopPropagation(); if (!video || video.paused) doPlay(); else doPause(); });
      stopBtn.addEventListener('click', function(e) { e.stopPropagation(); doStop(); });

      volBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeAnyMenu();
        volSlider.style.display = volSlider.style.display === 'none' ? 'block' : 'none';
      });
      volSlider.addEventListener('input', function() {
        if (!video) return;
        video.volume = this.value / 100;
        volBtn.innerHTML = this.value == 0
          ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'
          : '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" stroke="currentColor" stroke-width="2" fill="none"/></svg>';
      });

      // ── Fullscreen toggle ──
      var _inFS = false;

      function updateFSButton() {
        fsBtn.title = _inFS ? 'Exit Fullscreen' : 'Fullscreen';
        fsBtn.innerHTML = _inFS
          ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'
          : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
      }

      function onFSChange() {
        if (!video) return;
        if (document.fullscreenElement === wrapper) {
          _inFS = true;
          wrapper.style.maxWidth = 'none';
          wrapper.style.maxHeight = '100vh';
          wrapper.style.width = '100vw';
          wrapper.style.background = 'var(--bg-surface)';
          seek.style.marginTop = '14px';
          video.style.maxHeight = 'calc(100vh - 62px)';
          video.style.objectFit = 'contain';
          video.style.width = '100%';
          video.style.background = 'var(--bg-surface)';
          video.style.boxShadow = '0 0 60px rgba(0,0,0,0.5)';
        } else if (!document.fullscreenElement && _inFS) {
          _inFS = false;
          wrapper.style.maxWidth = '';
          wrapper.style.maxHeight = '';
          wrapper.style.width = '';
          wrapper.style.background = '';
          seek.style.marginTop = '';
          video.style.maxHeight = '';
          video.style.objectFit = '';
          video.style.width = '';
          video.style.background = '';
          video.style.boxShadow = '';
        }
        updateFSButton();
      }

      document.addEventListener('fullscreenchange', onFSChange);

      function toggleFS() {
        closeAnyMenu();
        volSlider.style.display = 'none';
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(function() {});
        } else if (wrapper.requestFullscreen) {
          wrapper.requestFullscreen().catch(function() {});
        } else if (wrapper.webkitRequestFullscreen) {
          wrapper.webkitRequestFullscreen();
        }
      }

      fsBtn.addEventListener('click', function(e) { e.stopPropagation(); toggleFS(); });

      // ── More Options Menu (appended inside wrapper in fullscreen, else body) ──
      var speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
      var currentSpeed = 1;

      function menuCSS(z) {
        var r = 'system-ui,-apple-system,sans-serif';
        return 'position:fixed;top:auto;bottom:auto;left:auto;right:auto;background:var(--bg-surface,#222);border:1px solid var(--border-color,#333);border-radius:8px;padding:4px 0;min-width:180px;box-shadow:0 4px 16px rgba(0,0,0,0.4);box-shadow:var(--shadow-md, 0 4px 16px rgba(0,0,0,0.4));z-index:' + z + ';font-family:' + r + ';font-size:13px;overflow:hidden;';
      }

      function menuParent() {
        return document.fullscreenElement === wrapper ? wrapper : document.body;
      }

      function showMenu(rect) {
        closeAnyMenu();
        var parent = menuParent();
        var menu = document.createElement('div');
        menu.className = 'ovp-menu';

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
          sub.className = 'ovp-menu';
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

          positionAndShow(sub, rect, parent);
          _anyMenu = sub;
          listenClose(sub);
        }

        mi(looping ? 'Loop: On' : 'Loop: Off',
          looping
            ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>'
            : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
          function() { looping = !looping; }, false, looping
        );

        mi('Quality', '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="14" y2="16"/></svg>', function() {
          if (typeof showToast === 'function') showToast('Quality options are currently unavailable', 'info');
        }, true);

        mi('Playback Speed', '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', function() {
          subMenu('Playback Speed', speeds.map(function(spd) {
            return { label: spd + 'x', active: spd === currentSpeed, action: function() { currentSpeed = spd; if (video) video.playbackRate = spd; } };
          }));
        });

        mi('Picture-in-Picture', '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><rect x="11" y="9" width="8" height="5" rx="1" fill="currentColor"/></svg>', function() {
          if (!video) { if (typeof showToast === 'function') showToast('Load video first', 'info'); return; }
          if (document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(function() {});
          } else if (video.requestPictureInPicture) {
            video.requestPictureInPicture().catch(function() {});
          } else {
            if (typeof showToast === 'function') showToast('PiP not supported on this device', 'info');
          }
        });

        mi(_inFS ? 'Exit Fullscreen' : 'Fullscreen',
          _inFS
            ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'
            : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
          function() { toggleFS(); });

        positionAndShow(menu, rect, parent);
        _anyMenu = menu;
        listenClose(menu);
      }

      function positionAndShow(el, rect, parent) {
        el.style.cssText = menuCSS(99999);
        el.style.left = Math.min(rect.right + 4, window.innerWidth - 180) + 'px';
        el.style.top = (rect.bottom + 4) + 'px';
        el.style.visibility = 'visible';
        parent.appendChild(el);
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

      // Seek bar
      var _seekDrag = false;
      function seekFromClientX(clientX) {
        var d = dur();
        if (!d) return;
        if (!video) return;
        var rect = seekTrack.getBoundingClientRect();
        var x = clientX - rect.left;
        var pct = Math.max(0, Math.min(1, x / rect.width));
        video.currentTime = pct * d;
      }
      function updateSeekTip(clientX) {
        if (!video) return;
        var d = dur();
        var rect = seekTrack.getBoundingClientRect();
        var x = clientX - rect.left;
        var pct = Math.max(0, Math.min(1, x / rect.width));
        var t = d ? pct * d : 0;
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

      /* For orbit protocol URLs, ask the main process to look up the attachment
         in SQLite and parse the MP4 duration directly from the buffer. */
      if (typeof url === 'string' && !knownDuration && (url.startsWith('orbit-db://') || url.startsWith('orbit-file://')) && !dead && window.orbitAPI && window.orbitAPI.invoke) {
        dbg('[' + _logId + '] requesting attachment duration via IPC');
        window.orbitAPI.invoke('get-attachment-duration', url).then(function(d) {
          if (dead) return;
          dbg('[' + _logId + '] IPC returned duration=' + d);
          if (d !== null && d !== undefined && d > 0) {
            knownDuration = d;
            dbg('[' + _logId + '] IPC parsed MP4 duration=' + knownDuration + 's (' + fmt(knownDuration) + ')');
            updTime();
          }
        }).catch(function(e) {
          dbg('[' + _logId + '] IPC error:', e.message || e);
        });
      }

      var player = {
        _w: wrapper,
        _v: video,
        _url: url,
        _pendingDataUrl: _pendingDataUrl,
        destroy: function() {
          dead = true;
          console.log('[OVP] [' + _logId + '] destroy() called');
          if (video) { video.pause(); video.src = ''; }
          document.removeEventListener('fullscreenchange', onFSChange);
          if (_inFS) document.exitFullscreen().catch(function() {});
          closeAnyMenu();
          wrapper.remove();
          var idx = _players.indexOf(player);
          if (idx !== -1) _players.splice(idx, 1);
        }
      };
      player._v = video; // null for data: URLs until lazy loaded
      _players.push(player);
      return player;
    },

    isAnyPlaying: function() {
      for (var i = 0; i < _players.length; i++) {
        if (_players[i]._v && !_players[i]._v.paused) return true;
      }
      return false;
    },
    savePlaying: function() {
      var saved = [];
      for (var i = _players.length - 1; i >= 0; i--) {
        if (_players[i]._v && !_players[i]._v.paused) {
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
            var ph = row.querySelector('.ovp-placeholder');
            if (ph) {
              var dup = ph.querySelector('.ovp-wrap');
              if (dup) {
                for (var j = _players.length - 1; j >= 0; j--) {
                  if (_players[j]._w === dup) { _players[j].destroy(); break; }
                }
                dup.remove();
              }
              ph.appendChild(p._w);
              ph._ovpInited = true;
              _players.push(p);
              return;
            }
          }
        }
        if (feed) feed.appendChild(p._w);
        _players.push(p);
      });
    },

    // Shared IntersectionObserver instance for lazy player creation
    _observer: null,
    _getObserver: function() {
      if (!this._observer) {
        var self = this;
        this._observer = new IntersectionObserver(function(entries) {
          entries.forEach(function(entry) {
            if (entry.isIntersecting) {
              var el = entry.target;
              self._observer.unobserve(el);
              if (el._ovpInited) return;
              if (!el.isConnected) return; // placeholder was removed from DOM during re-render
              el._ovpInited = true;
              var url = el.getAttribute('data-ovp-url');
              if (url) window.OrbitVideoPlayer.create(el, url);
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
      root.querySelectorAll('.ovp-placeholder').forEach(function(el) {
        if (el._ovpInited) return;
        observer.observe(el);
      });
    }
  };
})();
