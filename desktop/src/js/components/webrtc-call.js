function _callAvatarColor(str) {
  if (!str) return '#5865f2';
  var h = 0;
  for (var i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i);
  return 'hsl(' + (Math.abs(h) % 360) + ', 45%, 35%)';
}

window.CallModal = {
  overlay: null,
  timerInterval: null,
  seconds: 0,
  isGroup: false,

  show(callerInfo, isVideo, isIncoming) {
    this.hide();
    this.isGroup = false;
    this.seconds = 0;
    var overlay = document.createElement('div');
    overlay.className = 'call-modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;';

    var callerName = (callerInfo.username || callerInfo.name || 'Unknown');
    var callStatus = isIncoming ? 'Incoming Call...' : 'Calling...';

    var avatarHtml = callerInfo.avatar
      ? '<img src="' + callerInfo.avatar + '" style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid var(--accent-primary);display:block;margin:0 auto;">'
      : '<div style="width:88px;height:88px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700;color:#fff;margin:0 auto;">' + (callerInfo.username || '?').charAt(0).toUpperCase() + '</div>';

    var mediaArea;
    if (isVideo) {
      mediaArea =
        '<div id="call-video-container" style="width:100%;min-height:340px;position:relative;background:#0a0a0a;border-radius:14px;overflow:hidden;margin-bottom:20px;display:flex;align-items:center;justify-content:center;">' +
          '<video id="remote-video" autoplay playsinline style="width:100%;height:100%;position:absolute;top:0;left:0;object-fit:contain;"></video>' +
          '<div id="local-video-wrap" style="position:absolute;bottom:14px;right:14px;width:140px;height:100px;border-radius:10px;overflow:hidden;border:2px solid rgba(255,255,255,0.25);background:#111;z-index:10;box-shadow:0 4px 20px rgba(0,0,0,0.5);">' +
            '<video id="local-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;display:block;"></video>' +
            '<div id="local-placeholder" style="display:none;position:absolute;top:0;left:0;width:100%;height:100%;align-items:center;justify-content:center;"></div>' +
          '</div>' +
          '<div style="color:rgba(255,255,255,0.15);font-size:13px;">Video</div>' +
        '</div>';
    } else {
      mediaArea =
        '<div id="call-audio-area" style="margin:8px 0 18px 0;display:flex;flex-direction:column;align-items:center;">' +
          avatarHtml +
          '<div class="call-audio-wave" style="width:120px;height:32px;margin:14px auto 0;display:flex;align-items:flex-end;justify-content:center;gap:5px;">' +
            '<span style="display:inline-block;width:5px;height:16px;background:var(--accent-primary);border-radius:3px;animation:audioWave 0.9s ease-in-out infinite;transform-origin:center bottom;"></span>' +
            '<span style="display:inline-block;width:5px;height:26px;background:var(--accent-primary);border-radius:3px;animation:audioWave 0.9s ease-in-out 0.15s infinite;transform-origin:center bottom;"></span>' +
            '<span style="display:inline-block;width:5px;height:10px;background:var(--accent-primary);border-radius:3px;animation:audioWave 0.9s ease-in-out 0.3s infinite;transform-origin:center bottom;"></span>' +
            '<span style="display:inline-block;width:5px;height:20px;background:var(--accent-primary);border-radius:3px;animation:audioWave 0.9s ease-in-out 0.45s infinite;transform-origin:center bottom;"></span>' +
            '<span style="display:inline-block;width:5px;height:30px;background:var(--accent-primary);border-radius:3px;animation:audioWave 0.9s ease-in-out 0.6s infinite;transform-origin:center bottom;"></span>' +
          '</div>' +
        '</div>';
    }

    var bottomBtns;
    if (isIncoming) {
      bottomBtns =
        '<div style="display:flex;align-items:center;justify-content:center;gap:40px;margin-top:20px;">' +
          '<button id="call-decline-btn" style="width:60px;height:60px;border-radius:50%;border:none;background:var(--accent-danger);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(239,68,68,0.45);transition:transform 0.15s;" onmouseover="this.style.transform=\'scale(1.08)\'" onmouseout="this.style.transform=\'scale(1)\'"><i data-lucide="phone-off" style="width:26px;height:26px;"></i></button>' +
          '<button id="call-accept-btn" style="width:60px;height:60px;border-radius:50%;border:none;background:var(--accent-success);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(34,197,94,0.45);transition:transform 0.15s;" onmouseover="this.style.transform=\'scale(1.08)\'" onmouseout="this.style.transform=\'scale(1)\'"><i data-lucide="phone" style="width:26px;height:26px;"></i></button>' +
        '</div>';
    } else {
      var cameraBtnHtml = isVideo
        ? '<button id="call-camera-btn" style="width:50px;height:50px;border-radius:50%;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s,transform 0.15s;" title="Camera" onmouseover="this.style.background=\'rgba(255,255,255,0.15)\';this.style.transform=\'scale(1.05)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.08)\';this.style.transform=\'scale(1)\'"><i data-lucide="video" style="width:20px;height:20px;"></i></button>'
        : '';
      bottomBtns =
        '<div style="display:flex;align-items:center;justify-content:center;gap:28px;margin-top:22px;">' +
          cameraBtnHtml +
          '<button id="call-mute-btn" style="width:50px;height:50px;border-radius:50%;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s,transform 0.15s;" title="Mute" onmouseover="this.style.background=\'rgba(255,255,255,0.15)\';this.style.transform=\'scale(1.05)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.08)\';this.style.transform=\'scale(1)\'"><i data-lucide="mic" style="width:20px;height:20px;"></i></button>' +
          '<button id="call-end-btn" style="width:60px;height:60px;border-radius:50%;border:none;background:var(--accent-danger);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(239,68,68,0.45);transition:transform 0.15s;" onmouseover="this.style.transform=\'scale(1.08)\'" onmouseout="this.style.transform=\'scale(1)\'"><i data-lucide="phone-off" style="width:26px;height:26px;"></i></button>' +
          '<button id="call-speaker-btn" style="width:50px;height:50px;border-radius:50%;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s,transform 0.15s;" title="Speaker" onmouseover="this.style.background=\'rgba(255,255,255,0.15)\';this.style.transform=\'scale(1.05)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.08)\';this.style.transform=\'scale(1)\'"><i data-lucide="volume-2" style="width:20px;height:20px;"></i></button>' +
        '</div>';
    }

    overlay.innerHTML =
      '<div id="call-modal-inner" style="display:flex;flex-direction:column;align-items:center;width:100%;max-width:400px;padding:28px 24px 32px;text-align:center;">' +
        mediaArea +
        '<div id="call-name-text" style="font-size:22px;font-weight:700;color:#fff;font-family:var(--font-display);letter-spacing:0.3px;">' + callerName + '</div>' +
        '<div id="call-status-text" style="font-size:14px;color:rgba(255,255,255,0.5);margin-top:6px;font-weight:400;">' + callStatus + '</div>' +
        '<div id="call-timer" style="font-size:13px;color:rgba(255,255,255,0.35);margin-top:6px;display:none;font-variant-numeric:tabular-nums;">00:00</div>' +
        bottomBtns +
      '</div>';

    if (!document.getElementById('call-modal-styles')) {
      var style = document.createElement('style');
      style.id = 'call-modal-styles';
      style.textContent = '@keyframes audioWave { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }';
      document.head.appendChild(style);
    }

    document.body.appendChild(overlay);
    this.overlay = overlay;
    if (window.lucide) window.lucide.createIcons({ root: overlay });

    var endBtn = overlay.querySelector('#call-end-btn');
    if (endBtn) endBtn.addEventListener('click', function() { if (window.CallManager) window.CallManager.endCall(); });
    var declineBtn = overlay.querySelector('#call-decline-btn');
    if (declineBtn) declineBtn.addEventListener('click', function() { if (window.CallManager) window.CallManager._declineCall(); });
    var acceptBtn = overlay.querySelector('#call-accept-btn');
    if (acceptBtn) acceptBtn.addEventListener('click', function() { if (window.CallManager) window.CallManager._acceptIncoming(); });
    var muteBtn = overlay.querySelector('#call-mute-btn');
    if (muteBtn) muteBtn.addEventListener('click', function() {
      if (window.CallManager && window.CallManager.localStream) {
        var enabled = !window.CallManager.localStream.getAudioTracks()[0].enabled;
        window.CallManager.localStream.getAudioTracks()[0].enabled = enabled;
        this.querySelector('svg').setAttribute('data-lucide', enabled ? 'mic' : 'mic-off');
        this.title = enabled ? 'Mute' : 'Unmute';
        if (window.lucide) window.lucide.createIcons({ root: this });
      }
    });
    var speakerBtn = overlay.querySelector('#call-speaker-btn');
    if (speakerBtn) speakerBtn.addEventListener('click', function() {
      var vid = document.getElementById('remote-video');
      if (vid) {
        vid.muted = !vid.muted;
        this.querySelector('svg').setAttribute('data-lucide', vid.muted ? 'volume-x' : 'volume-2');
        this.title = vid.muted ? 'Unmute Speaker' : 'Mute Speaker';
        if (window.lucide) window.lucide.createIcons({ root: this });
      }
    });
    var cameraBtn = overlay.querySelector('#call-camera-btn');
    if (cameraBtn) cameraBtn.addEventListener('click', function() {
      if (window.CallManager && window.CallManager.localStream) {
        var tracks = window.CallManager.localStream.getVideoTracks();
        if (tracks.length > 0) {
          var enabled = !tracks[0].enabled;
          tracks[0].enabled = enabled;
          this.querySelector('svg').setAttribute('data-lucide', enabled ? 'video' : 'video-off');
          this.title = enabled ? 'Camera' : 'Camera Off';
          if (window.lucide) window.lucide.createIcons({ root: this });
          var lv = document.getElementById('local-video');
          var ph = document.getElementById('local-placeholder');
          if (lv && ph) {
            if (!enabled) {
              lv.style.display = 'none';
              var cu = (window.store.getState() || {}).currentUser || {};
              ph.style.display = 'flex';
              ph.style.background = _callAvatarColor(cu.username);
              if (cu.avatar) {
                ph.innerHTML = '<img src="' + cu.avatar + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.35);box-shadow:0 2px 10px rgba(0,0,0,0.3);">';
              } else {
                ph.innerHTML = '<div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;color:#fff;border:2px solid rgba(255,255,255,0.35);box-shadow:0 2px 10px rgba(0,0,0,0.3);">' + ((cu.username || '?').charAt(0).toUpperCase()) + '</div>';
              }
            } else {
              lv.style.display = 'block';
              ph.style.display = 'none';
              ph.innerHTML = '';
            }
          }
        }
      }
    });
  },

  showGroup(groupTitle, participants, isVideo) {
    this.hide();
    this.isGroup = true;
    this.seconds = 0;
    this._participants = participants || {};
    var overlay = document.createElement('div');
    overlay.className = 'call-modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;';

    var pCount = Object.keys(participants).length;
    var cols = pCount <= 2 ? 'repeat(' + pCount + ', 1fr)' : 'repeat(auto-fit, minmax(180px, 1fr))';

    var videoArea = isVideo
      ? '<div id="call-video-container" style="width:100%;height:380px;position:relative;background:#0a0a0a;border-radius:14px;overflow:hidden;margin-bottom:14px;">' +
          '<div id="group-remote-videos" style="width:100%;height:100%;display:grid;grid-template-columns:' + cols + ';gap:3px;padding:3px;box-sizing:border-box;"></div>' +
        '</div>'
      : '<div id="call-audio-area" style="margin:10px 0 16px 0;width:100%;">' +
          '<div id="group-participant-avatars" style="display:flex;flex-wrap:wrap;justify-content:center;gap:16px;padding:8px 0;"></div>' +
        '</div>';

    overlay.innerHTML =
      '<div id="call-modal-inner" style="display:flex;flex-direction:column;align-items:center;width:100%;max-width:560px;padding:20px 20px 24px;text-align:center;">' +
        '<div style="font-size:17px;font-weight:700;color:#fff;font-family:var(--font-display);">' + window.Sanitize.escapeHtml(groupTitle) + '</div>' +
        '<div id="call-participant-count" style="font-size:12px;color:rgba(255,255,255,0.35);margin-top:3px;">' + pCount + ' participant' + (pCount !== 1 ? 's' : '') + '</div>' +
        videoArea +
        '<div id="call-timer" style="font-size:13px;color:rgba(255,255,255,0.35);margin-bottom:10px;display:none;font-variant-numeric:tabular-nums;">00:00</div>' +
        '<div id="call-status-text" style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:12px;">Calling...</div>' +
        '<div style="display:flex;align-items:center;justify-content:center;gap:28px;">' +
          (isVideo ? '<button id="call-camera-btn" style="width:50px;height:50px;border-radius:50%;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s,transform 0.15s;" title="Camera" onmouseover="this.style.background=\'rgba(255,255,255,0.15)\';this.style.transform=\'scale(1.05)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.08)\';this.style.transform=\'scale(1)\'"><i data-lucide="video" style="width:20px;height:20px;"></i></button>' : '') +
          '<button id="call-mute-btn" style="width:50px;height:50px;border-radius:50%;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s,transform 0.15s;" title="Mute" onmouseover="this.style.background=\'rgba(255,255,255,0.15)\';this.style.transform=\'scale(1.05)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.08)\';this.style.transform=\'scale(1)\'"><i data-lucide="mic" style="width:20px;height:20px;"></i></button>' +
          '<button id="call-end-btn" style="width:60px;height:60px;border-radius:50%;border:none;background:var(--accent-danger);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(239,68,68,0.45);transition:transform 0.15s;" onmouseover="this.style.transform=\'scale(1.08)\'" onmouseout="this.style.transform=\'scale(1)\'"><i data-lucide="phone-off" style="width:26px;height:26px;"></i></button>' +
          '<button id="call-speaker-btn" style="width:50px;height:50px;border-radius:50%;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s,transform 0.15s;" title="Speaker" onmouseover="this.style.background=\'rgba(255,255,255,0.15)\';this.style.transform=\'scale(1.05)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.08)\';this.style.transform=\'scale(1)\'"><i data-lucide="volume-2" style="width:20px;height:20px;"></i></button>' +
        '</div>' +
      '</div>';

    if (!document.getElementById('call-modal-styles')) {
      var style = document.createElement('style');
      style.id = 'call-modal-styles';
      style.textContent = '@keyframes audioWave { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }';
      document.head.appendChild(style);
    }

    document.body.appendChild(overlay);
    this.overlay = overlay;
    this._renderGroupParticipants(participants, isVideo);
    if (window.lucide) window.lucide.createIcons({ root: overlay });

    var endBtn = overlay.querySelector('#call-end-btn');
    if (endBtn) endBtn.addEventListener('click', function() { if (window.CallManager) window.CallManager.endCall(); });
    var muteBtn = overlay.querySelector('#call-mute-btn');
    if (muteBtn) muteBtn.addEventListener('click', function() {
      if (window.CallManager && window.CallManager.localStream) {
        var enabled = !window.CallManager.localStream.getAudioTracks()[0].enabled;
        window.CallManager.localStream.getAudioTracks()[0].enabled = enabled;
        this.querySelector('svg').setAttribute('data-lucide', enabled ? 'mic' : 'mic-off');
        this.title = enabled ? 'Mute' : 'Unmute';
        if (window.lucide) window.lucide.createIcons({ root: this });
      }
    });
    var speakerBtn = overlay.querySelector('#call-speaker-btn');
    if (speakerBtn) speakerBtn.addEventListener('click', function() {
      var vids = document.querySelectorAll('#group-remote-videos video');
      var muted = vids.length > 0 && vids[0].muted;
      vids.forEach(function(v) { v.muted = !muted; });
      this.querySelector('svg').setAttribute('data-lucide', !muted ? 'volume-x' : 'volume-2');
      this.title = !muted ? 'Unmute Speaker' : 'Mute Speaker';
      if (window.lucide) window.lucide.createIcons({ root: this });
    });
    var cameraBtn = overlay.querySelector('#call-camera-btn');
    if (cameraBtn) cameraBtn.addEventListener('click', function() {
      if (window.CallManager && window.CallManager.localStream) {
        var tracks = window.CallManager.localStream.getVideoTracks();
        if (tracks.length > 0) {
          var enabled = !tracks[0].enabled;
          tracks[0].enabled = enabled;
          this.querySelector('svg').setAttribute('data-lucide', enabled ? 'video' : 'video-off');
          this.title = enabled ? 'Camera' : 'Camera Off';
          if (window.lucide) window.lucide.createIcons({ root: this });
          var lv = document.getElementById('local-video');
          var ph = document.getElementById('local-placeholder');
          if (lv && ph) {
            if (!enabled) {
              lv.style.display = 'none';
              var cu = (window.store.getState() || {}).currentUser || {};
              ph.style.display = 'flex';
              ph.style.background = _callAvatarColor(cu.username);
              if (cu.avatar) {
                ph.innerHTML = '<img src="' + cu.avatar + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.35);box-shadow:0 2px 10px rgba(0,0,0,0.3);">';
              } else {
                ph.innerHTML = '<div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;color:#fff;border:2px solid rgba(255,255,255,0.35);box-shadow:0 2px 10px rgba(0,0,0,0.3);">' + ((cu.username || '?').charAt(0).toUpperCase()) + '</div>';
              }
            } else {
              lv.style.display = 'block';
              ph.style.display = 'none';
              ph.innerHTML = '';
            }
          }
        }
      }
    });
  },

  _renderGroupParticipants(participants, isVideo) {
    if (!this.overlay) return;
    this._participants = participants;
    var pCount = Object.keys(participants).length;
    var countEl = this.overlay.querySelector('#call-participant-count');
    if (countEl) countEl.textContent = pCount + ' participant' + (pCount !== 1 ? 's' : '');

    if (isVideo) {
      var grid = this.overlay.querySelector('#group-remote-videos');
      if (!grid) return;
      grid.innerHTML = '';
      var cols = pCount <= 2 ? 'repeat(' + pCount + ', 1fr)' : 'repeat(auto-fit, minmax(180px, 1fr))';
      grid.style.gridTemplateColumns = cols;
      var userIds = Object.keys(participants);
      var currentUserId = (window.store.getState().currentUser || {}).userId;
      userIds.forEach(function(uid) {
        var p = participants[uid];
        var isMe = uid === currentUserId;
        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative;background:#111;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;';
        var nameLabel = isMe ? 'You' : (p.name || '');
        var vidId = isMe ? 'local-video' : 'gvid-' + uid.replace(/[^a-zA-Z0-9]/g, '_');
        var placeholderHtml = isMe ? '<div id="local-placeholder" style="display:none;position:absolute;top:0;left:0;width:100%;height:100%;align-items:center;justify-content:center;"></div>' : '';
        wrapper.innerHTML =
          '<video id="' + vidId + '" autoplay playsinline ' + (isMe ? 'muted' : '') + ' style="width:100%;height:100%;position:absolute;top:0;left:0;object-fit:cover;display:block;"></video>' +
          placeholderHtml +
          '<div style="position:absolute;bottom:6px;left:8px;font-size:11px;color:#fff;background:rgba(0,0,0,0.55);padding:2px 10px;border-radius:4px;max-width:calc(100% - 16px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window.Sanitize.escapeHtml(nameLabel) + '</div>';
        grid.appendChild(wrapper);
        // Attach local stream to local video immediately if available
        if (isMe && window.CallManager && window.CallManager.localStream) {
          var lv = wrapper.querySelector('#local-video');
          if (lv) lv.srcObject = window.CallManager.localStream;
        }
      });
    } else {
      var container = this.overlay.querySelector('#group-participant-avatars');
      if (!container) return;
      container.innerHTML = '';
      var userIds = Object.keys(participants);
      userIds.forEach(function(uid) {
        var p = participants[uid];
        var isMe = uid === (window.store.getState().currentUser || {}).userId;
        var nameLabel = isMe ? 'You' : (p.name || '');
        var avatarHtml = p.avatar
          ? '<img src="' + p.avatar + '" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid var(--accent-primary);display:block;">'
          : '<div style="width:56px;height:56px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#fff;border:2px solid var(--accent-primary);">' + (p.name || '?').charAt(0).toUpperCase() + '</div>';
        var item = document.createElement('div');
        item.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:5px;min-width:64px;';
        item.innerHTML = avatarHtml + '<div style="font-size:11px;color:rgba(255,255,255,0.65);max-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.3;">' + window.Sanitize.escapeHtml(nameLabel) + '</div>';
        container.appendChild(item);
      });
    }
  },

  addParticipant(userId, name, avatar) {
    if (!this._participants) this._participants = {};
    this._participants[userId] = { name: name, avatar: avatar };
    var isVideo = !!(this.overlay && this.overlay.querySelector('#group-remote-videos'));
    this._renderGroupParticipants(this._participants, isVideo);
    return this._participants;
  },

  removeParticipant(userId) {
    if (!this._participants) return;
    delete this._participants[userId];
    var isVideo = !!(this.overlay && this.overlay.querySelector('#group-remote-videos'));
    this._renderGroupParticipants(this._participants, isVideo);
  },

  updateGroupStatus(text) {
    var el = this.overlay && this.overlay.querySelector('#call-status-text');
    if (el) el.textContent = text;
  },

  updateStatus(text) {
    var el = this.overlay && this.overlay.querySelector('#call-status-text');
    if (el) el.textContent = text;
  },

  setCallerName(name) {
    var el = this.overlay && this.overlay.querySelector('#call-name-text');
    if (el) el.textContent = name;
  },

  startTimer() {
    var el = this.overlay && this.overlay.querySelector('#call-timer');
    if (el) el.style.display = 'block';
    var statusEl = this.overlay && this.overlay.querySelector('#call-status-text');
    if (statusEl) statusEl.style.display = this.isGroup ? 'block' : 'none';
    if (this.isGroup && statusEl) statusEl.textContent = 'Connected';
    this.seconds = 0;
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(function() {
      this.seconds++;
      var m = Math.floor(this.seconds / 60);
      var s = this.seconds % 60;
      var display = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      var timerEl = this.overlay && this.overlay.querySelector('#call-timer');
      if (timerEl) timerEl.textContent = display;
    }.bind(this), 1000);
  },

  hide() {
    clearInterval(this.timerInterval);
    this.isGroup = false;
    this._participants = null;
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
};

window.CallManager = {
  activeCall: null,
  localStream: null,
  remoteStream: null,
  peerConnection: null,
  dataChannel: null,
  targetUserId: null,
  targetPeerIp: null,
  incomingCallData: null,
  peerConnections: {},
  participants: {},
  groupCallId: null,

  startCall(isVideo, targetUserId, targetPeerIp) {
    var state = window.store.getState();
    var currentUser = state.currentUser;
    var friend = state.friends.find(function(f) { return f.userId === targetUserId; });
    if (!friend || !currentUser) return false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (window.Toast) window.Toast.show('Call Error', 'WebRTC not supported in this browser.', 'error');
      return false;
    }
    this.targetUserId = targetUserId;
    this.targetPeerIp = targetPeerIp;
    var constraints = { audio: true };
    if (isVideo) constraints.video = { width: { ideal: 640 }, height: { ideal: 480 } };
    navigator.mediaDevices.getUserMedia(constraints)
      .then(function(stream) {
        this.localStream = stream;
        this.activeCall = { isVideo: isVideo, direction: 'outgoing', isGroup: false };
        if (window.CallModal) {
          window.CallModal.show({ username: friend.username, avatar: friend.avatar }, isVideo, false);
          var localVid = document.getElementById('local-video');
          if (localVid) localVid.srcObject = stream;
        }
        this._createPeerConnection(targetUserId, isVideo);
        return this.peerConnection.createOffer();
      }.bind(this))
      .then(function(offer) {
        return this.peerConnection.setLocalDescription(offer);
      }.bind(this))
      .then(function() {
        var offer = this.peerConnection.localDescription;
        var packet = {
          sdp: offer.sdp, type: offer.type,
          callerId: window.store.getState().currentUser.userId,
          callerName: window.store.getState().currentUser.username,
          callerAvatar: window.store.getState().currentUser.avatar,
          isVideo: this.activeCall ? this.activeCall.isVideo : false
        };
        if (window.orbitAPI) {
          window.orbitAPI.networkSend(targetUserId, targetPeerIp, window.Protocol.Types.CALL_OFFER, packet);
          if (window.Toast) window.Toast.show('Calling', 'Calling ' + (friend.username || 'friend') + '...');
        }
      }.bind(this))
      .catch(function(err) {
        console.error('Call start error:', err);
        if (window.Toast) window.Toast.show('Call Error', err.message || 'Failed to start call', 'error');
        this.cleanup();
      }.bind(this));
    return true;
  },

  // ---- Group Call ----
  startGroupCall(isVideo, groupId) {
    var state = window.store.getState();
    var currentUser = state.currentUser;
    var group = state.groups.find(function(g) { return g.groupId === groupId; });
    if (!group || !currentUser) return false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (window.Toast) window.Toast.show('Call Error', 'WebRTC not supported.', 'error');
      return false;
    }
    var members = group.members || [];
    var otherMembers = members.filter(function(m) {
      var mid = typeof m === 'string' ? m : m.userId;
      return mid !== currentUser.userId;
    });
    if (otherMembers.length === 0) {
      if (window.Toast) window.Toast.show('Call Error', 'No other members in this group.', 'error');
      return false;
    }
    this.groupCallId = groupId;
    this.peerConnections = {};
    this.participants = {};
    this.participants[currentUser.userId] = { name: currentUser.username, avatar: currentUser.avatar };
    var initialParticipants = {};
    initialParticipants[currentUser.userId] = { name: currentUser.username, avatar: currentUser.avatar };
    otherMembers.forEach(function(m) {
      var mid = typeof m === 'string' ? m : m.userId;
      var friend = state.friends.find(function(f) { return f.userId === mid; });
      initialParticipants[mid] = { name: friend ? friend.username : mid, avatar: friend ? friend.avatar : null };
    });
    var constraints = { audio: true };
    if (isVideo) constraints.video = { width: { ideal: 640 }, height: { ideal: 480 } };
    navigator.mediaDevices.getUserMedia(constraints)
      .then(function(stream) {
        this.localStream = stream;
        this.activeCall = { isVideo: isVideo, direction: 'outgoing', isGroup: true, groupId: groupId };
        if (window.CallModal) {
          window.CallModal.showGroup(group.groupName, initialParticipants, isVideo);
          var localVid = document.getElementById('local-video');
          if (localVid) localVid.srcObject = stream;
          window.CallModal.updateGroupStatus('Calling ' + otherMembers.length + ' member' + (otherMembers.length !== 1 ? 's' : '') + '...');
        }
        otherMembers.forEach(function(m) {
          var mid = typeof m === 'string' ? m : m.userId;
          var friend = state.friends.find(function(f) { return f.userId === mid; });
          if (friend) {
            this.participants[mid] = { name: friend.username, avatar: friend.avatar };
            this._createGroupPeerConnection(mid, friend.ip || '', isVideo, groupId);
          }
        }.bind(this));
      }.bind(this))
      .catch(function(err) {
        console.error('Group call start error:', err);
        if (window.Toast) window.Toast.show('Call Error', err.message || 'Failed to start group call', 'error');
        this.cleanup();
      }.bind(this));
    return true;
  },

  _createGroupPeerConnection(userId, peerIp, isVideo, groupId) {
    var pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    this.peerConnections[userId] = pc;
    if (this.localStream) {
      this.localStream.getTracks().forEach(function(track) {
        pc.addTrack(track, this.localStream);
      }.bind(this));
    }
    pc.ontrack = function(event) {
      if (!this.participants[userId]) return;
      var safeId = 'gvid-' + userId.replace(/[^a-zA-Z0-9]/g, '_');
      var vid = document.getElementById(safeId);
      if (vid) {
        vid.srcObject = event.streams[0];
      } else if (!this.activeCall.isVideo && window.CallModal) {
        window.CallModal.startTimer();
      }
      if (window.CallModal && this.activeCall.isVideo) {
        var allConnected = Object.keys(this.peerConnections).every(function(uid) {
          return this.peerConnections[uid].connectionState === 'connected';
        }.bind(this));
        if (allConnected) window.CallModal.startTimer();
      }
    }.bind(this);
    pc.onicecandidate = function(event) {
      if (event.candidate && window.orbitAPI) {
        window.orbitAPI.networkSend(userId, peerIp, window.Protocol.Types.CALL_ICE_CANDIDATE, {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          groupId: groupId
        });
      }
    }.bind(this);
    pc.onconnectionstatechange = function() {
      if (pc.connectionState === 'connected') {
        if (window.CallModal) window.CallModal.addParticipant(userId,
          (this.participants[userId] || {}).name || userId,
          (this.participants[userId] || {}).avatar || null
        );
      }
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        if (window.CallModal) window.CallModal.removeParticipant(userId);
        delete this.peerConnections[userId];
        if (Object.keys(this.peerConnections).length === 0) {
          if (window.Toast) window.Toast.show('Call Ended', 'All participants left.', 'info');
          this.cleanup();
        }
      }
    }.bind(this);
    pc.createOffer()
      .then(function(offer) { return pc.setLocalDescription(offer); }.bind(this))
      .then(function() {
        var offer = pc.localDescription;
        if (window.orbitAPI) {
          var group = window.store.getState().groups.find(function(g) { return g.groupId === groupId; });
          window.orbitAPI.networkSend(userId, peerIp, window.Protocol.Types.CALL_OFFER, {
            sdp: offer.sdp, type: offer.type,
            callerId: window.store.getState().currentUser.userId,
            callerName: window.store.getState().currentUser.username,
            callerAvatar: window.store.getState().currentUser.avatar,
            isVideo: isVideo,
            groupId: groupId,
            groupName: group ? group.groupName : 'Group'
          });
        }
      }.bind(this))
      .catch(function(err) {
        console.error('Group offer error for ' + userId + ':', err);
        delete this.peerConnections[userId];
      }.bind(this));
    return pc;
  },

  _createPeerConnection(targetUserId, isVideo) {
    var config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    this.peerConnection = new RTCPeerConnection(config);
    if (this.localStream) {
      this.localStream.getTracks().forEach(function(track) {
        this.peerConnection.addTrack(track, this.localStream);
      }.bind(this));
    }
    this.peerConnection.ontrack = function(event) {
      this.remoteStream = event.streams[0];
      var remoteVid = document.getElementById('remote-video');
      if (remoteVid) remoteVid.srcObject = this.remoteStream;
      if (window.CallModal) window.CallModal.startTimer();
    }.bind(this);
    this.peerConnection.onicecandidate = function(event) {
      if (event.candidate && window.orbitAPI && this.targetUserId) {
        window.orbitAPI.networkSend(this.targetUserId, this.targetPeerIp, window.Protocol.Types.CALL_ICE_CANDIDATE, {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex
        });
      }
    }.bind(this);
    this.peerConnection.onconnectionstatechange = function() {
      if (this.peerConnection.connectionState === 'disconnected' || this.peerConnection.connectionState === 'failed') {
        if (window.Toast) window.Toast.show('Call Ended', 'Connection lost.', 'info');
        this.cleanup();
      }
    }.bind(this);
    return this.peerConnection;
  },

  answerCall(callData) {
    var state = window.store.getState();
    var callerId = callData.callerId;
    var friend = state.friends.find(function(f) { return f.userId === callerId; });
    if (!friend) return;
    this.targetUserId = callerId;
    this.targetPeerIp = friend.ip || state.remoteIp;
    var isVideo = callData.isVideo;
    var constraints = { audio: true };
    if (isVideo) constraints.video = { width: { ideal: 640 }, height: { ideal: 480 } };
    navigator.mediaDevices.getUserMedia(constraints)
      .then(function(stream) {
        this.localStream = stream;
        this.activeCall = { isVideo: isVideo, direction: 'incoming', isGroup: false };
        if (window.CallModal) {
          window.CallModal.show({ username: friend.username, avatar: friend.avatar }, isVideo, false);
          var localVid = document.getElementById('local-video');
          if (localVid) localVid.srcObject = stream;
          window.CallModal.updateStatus('Connecting...');
        }
        this._createPeerConnection(callerId, isVideo);
        var remoteDesc = new RTCSessionDescription({ type: 'offer', sdp: callData.sdp });
        return this.peerConnection.setRemoteDescription(remoteDesc);
      }.bind(this))
      .then(function() { return this.peerConnection.createAnswer(); }.bind(this))
      .then(function(answer) { return this.peerConnection.setLocalDescription(answer); }.bind(this))
      .then(function() {
        var answer = this.peerConnection.localDescription;
        if (window.orbitAPI) {
          window.orbitAPI.networkSend(this.targetUserId, this.targetPeerIp, window.Protocol.Types.CALL_ANSWER, {
            sdp: answer.sdp, type: answer.type,
            answererId: window.store.getState().currentUser.userId,
            answererName: window.store.getState().currentUser.username
          });
        }
      }.bind(this))
      .catch(function(err) {
        console.error('Answer call error:', err);
        if (window.Toast) window.Toast.show('Call Error', err.message || 'Failed to answer call', 'error');
        this.cleanup();
      }.bind(this));
  },

  // ---- Answer a group call offer (join group call) ----
  _answerGroupCall(callData, groupId) {
    var state = window.store.getState();
    var currentUser = state.currentUser;
    var callerId = callData.callerId;
    var group = state.groups.find(function(g) { return g.groupId === groupId; });
    if (!group || !currentUser) return;
    this.groupCallId = groupId;
    var isVideo = callData.isVideo;
    var constraints = { audio: true };
    if (isVideo) constraints.video = { width: { ideal: 640 }, height: { ideal: 480 } };
    navigator.mediaDevices.getUserMedia(constraints)
      .then(function(stream) {
        this.localStream = stream;
        this.activeCall = { isVideo: isVideo, direction: 'incoming', isGroup: true, groupId: groupId };
        var initialParticipants = {};
        initialParticipants[currentUser.userId] = { name: currentUser.username, avatar: currentUser.avatar };
        initialParticipants[callerId] = { name: callData.callerName || callerId, avatar: callData.callerAvatar || null };
        if (window.CallModal) {
          window.CallModal.showGroup(group.groupName, initialParticipants, isVideo);
          var localVid = document.getElementById('local-video');
          if (localVid) localVid.srcObject = stream;
          window.CallModal.updateGroupStatus('Connecting...');
        }
        this.participants = {};
        this.participants[currentUser.userId] = { name: currentUser.username, avatar: currentUser.avatar };
        this.participants[callerId] = { name: callData.callerName || callerId, avatar: callData.callerAvatar || null };
        this.peerConnections = {};
        this._createGroupPeerConnectionAnswer(callerId, state.friends.find(function(f) { return f.userId === callerId; }), callData, isVideo, groupId);
      }.bind(this))
      .catch(function(err) {
        console.error('Join group call error:', err);
        if (window.Toast) window.Toast.show('Call Error', err.message || 'Failed to join group call', 'error');
        this.cleanup();
      }.bind(this));
  },

  _createGroupPeerConnectionAnswer(userId, friend, callData, isVideo, groupId) {
    var peerIp = friend ? friend.ip : '';
    var pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    this.peerConnections[userId] = pc;
    if (this.localStream) {
      this.localStream.getTracks().forEach(function(track) {
        pc.addTrack(track, this.localStream);
      }.bind(this));
    }
    pc.ontrack = function(event) {
      var safeId = 'gvid-' + userId.replace(/[^a-zA-Z0-9]/g, '_');
      var vid = document.getElementById(safeId);
      if (vid) vid.srcObject = event.streams[0];
      if (window.CallModal) window.CallModal.startTimer();
    }.bind(this);
    pc.onicecandidate = function(event) {
      if (event.candidate && window.orbitAPI) {
        window.orbitAPI.networkSend(userId, peerIp, window.Protocol.Types.CALL_ICE_CANDIDATE, {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          groupId: groupId
        });
      }
    }.bind(this);
    pc.onconnectionstatechange = function() {
      if (pc.connectionState === 'connected') {
        if (window.CallModal) window.CallModal.addParticipant(userId, callData.callerName || userId, callData.callerAvatar || null);
      }
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        if (window.CallModal) window.CallModal.removeParticipant(userId);
        delete this.peerConnections[userId];
        if (Object.keys(this.peerConnections).length === 0) { this.cleanup(); }
      }
    }.bind(this);
    var remoteDesc = new RTCSessionDescription({ type: 'offer', sdp: callData.sdp });
    pc.setRemoteDescription(remoteDesc)
      .then(function() { return pc.createAnswer(); }.bind(this))
      .then(function(answer) { return pc.setLocalDescription(answer); }.bind(this))
      .then(function() {
        var answer = pc.localDescription;
        if (window.orbitAPI) {
          window.orbitAPI.networkSend(userId, peerIp, window.Protocol.Types.CALL_ANSWER, {
            sdp: answer.sdp, type: answer.type,
            answererId: window.store.getState().currentUser.userId,
            answererName: window.store.getState().currentUser.username
          });
        }
      }.bind(this))
      .catch(function(err) {
        console.error('Group answer error for ' + userId + ':', err);
        delete this.peerConnections[userId];
      }.bind(this));
    return pc;
  },

  _connectGroupParticipant(userId, callerName, callerAvatar, offerSdp, isVideo, groupId) {
    if (this.peerConnections[userId]) return;
    var state = window.store.getState();
    var friend = state.friends.find(function(f) { return f.userId === userId; });
    var peerIp = friend ? friend.ip : '';
    this.participants[userId] = { name: callerName || userId, avatar: callerAvatar || null };
    if (window.CallModal) window.CallModal.addParticipant(userId, callerName || userId, callerAvatar || null);
    var pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    this.peerConnections[userId] = pc;
    if (this.localStream) {
      this.localStream.getTracks().forEach(function(track) {
        pc.addTrack(track, this.localStream);
      }.bind(this));
    }
    pc.ontrack = function(event) {
      var safeId = 'gvid-' + userId.replace(/[^a-zA-Z0-9]/g, '_');
      var vid = document.getElementById(safeId);
      if (vid) vid.srcObject = event.streams[0];
    }.bind(this);
    pc.onicecandidate = function(event) {
      if (event.candidate && window.orbitAPI) {
        window.orbitAPI.networkSend(userId, peerIp, window.Protocol.Types.CALL_ICE_CANDIDATE, {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          groupId: groupId
        });
      }
    }.bind(this);
    pc.onconnectionstatechange = function() {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        if (window.CallModal) window.CallModal.removeParticipant(userId);
        delete this.peerConnections[userId];
      }
    }.bind(this);
    var remoteDesc = new RTCSessionDescription({ type: 'offer', sdp: offerSdp });
    pc.setRemoteDescription(remoteDesc)
      .then(function() { return pc.createAnswer(); }.bind(this))
      .then(function(answer) { return pc.setLocalDescription(answer); }.bind(this))
      .then(function() {
        var answer = pc.localDescription;
        if (window.orbitAPI) {
          window.orbitAPI.networkSend(userId, peerIp, window.Protocol.Types.CALL_ANSWER, {
            sdp: answer.sdp, type: answer.type,
            answererId: window.store.getState().currentUser.userId,
            answererName: window.store.getState().currentUser.username
          });
        }
      }.bind(this))
      .catch(function(err) {
        console.error('Group connect error for ' + userId + ':', err);
        delete this.peerConnections[userId];
      }.bind(this));
  },

  addIceCandidate(candidateData) {
    if (!this.peerConnection) return;
    try {
      var candidate = new RTCIceCandidate(candidateData);
      this.peerConnection.addIceCandidate(candidate);
    } catch (err) {
      console.error('Add ICE candidate error:', err);
    }
  },

  addGroupIceCandidate(userId, candidateData) {
    var pc = this.peerConnections[userId];
    if (!pc) return;
    try {
      var candidate = new RTCIceCandidate(candidateData);
      pc.addIceCandidate(candidate);
    } catch (err) {
      console.error('Add group ICE candidate error:', err);
    }
  },

  _acceptIncoming() {
    if (this.incomingCallData) {
      if (this.incomingCallData.groupId) {
        this._answerGroupCall(this.incomingCallData, this.incomingCallData.groupId);
      } else {
        this.answerCall(this.incomingCallData);
      }
      this.incomingCallData = null;
    }
  },

  _declineIncomingGroup() {
    if (this.incomingCallData && window.orbitAPI) {
      window.orbitAPI.networkSend(this.incomingCallData.callerId, this.targetPeerIp, window.Protocol.Types.CALL_DECLINE, { groupId: this.incomingCallData.groupId });
    }
    this.incomingCallData = null;
    if (window.CallModal) window.CallModal.hide();
    this.cleanup();
  },

  _declineCall() {
    if (this.incomingCallData && this.incomingCallData.groupId) {
      this._declineIncomingGroup();
      return;
    }
    if (window.orbitAPI && this.targetUserId) {
      window.orbitAPI.networkSend(this.targetUserId, this.targetPeerIp, window.Protocol.Types.CALL_DECLINE, {});
    }
    if (window.CallModal) window.CallModal.updateStatus('Declined');
    setTimeout(function() {
      if (window.CallModal) window.CallModal.hide();
      this.cleanup();
    }.bind(this), 1000);
  },

  endCall() {
    if (this.activeCall && this.activeCall.isGroup) {
      Object.keys(this.peerConnections).forEach(function(uid) {
        if (window.orbitAPI) {
          window.orbitAPI.networkSend(uid, '', window.Protocol.Types.CALL_END, { userId: window.store.getState().currentUser.userId, groupId: this.groupCallId });
        }
      }.bind(this));
    } else if (window.orbitAPI && this.targetUserId) {
      window.orbitAPI.networkSend(this.targetUserId, this.targetPeerIp, window.Protocol.Types.CALL_END, {});
    }
    this.cleanup();
  },

  _removeGroupParticipant(userId) {
    if (window.CallModal) window.CallModal.removeParticipant(userId);
    var pc = this.peerConnections[userId];
    if (pc) {
      try { pc.close(); } catch(e) {}
      delete this.peerConnections[userId];
    }
    delete this.participants[userId];
    if (Object.keys(this.peerConnections).length === 0) {
      if (window.Toast) window.Toast.show('Call Ended', 'All participants left.', 'info');
      this.cleanup();
    }
  },

  cleanup() {
    this.activeCall = null;
    this.targetUserId = null;
    this.targetPeerIp = null;
    this.incomingCallData = null;
    this.remoteStream = null;
    this.groupCallId = null;
    this.participants = {};
    if (this.peerConnection) {
      try { this.peerConnection.close(); } catch(e) {}
      this.peerConnection = null;
    }
    Object.keys(this.peerConnections).forEach(function(uid) {
      try { this.peerConnections[uid].close(); } catch(e) {}
    }.bind(this));
    this.peerConnections = {};
    if (this.localStream) {
      this.localStream.getTracks().forEach(function(t) { t.stop(); });
      this.localStream = null;
    }
    if (window.CallModal) window.CallModal.hide();
  }
};
