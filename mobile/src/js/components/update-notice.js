// mobile/src/js/components/update-notice.js
// Android counterpart of desktop/src/js/components/update-notice.js.
//
// Detection lives in shared/network/update-check.js. On Android the request goes
// through Capacitor's native HTTP plugin (see capacitorTransport in the engine),
// so the WebView's https://localhost origin never hits a CORS wall.
//
// UX differs from desktop on purpose: Orbit is distributed as a sideloaded APK,
// so there is no store to hand the update to. When a new version is detected the
// dialog is shown once (subject to the 6h throttle and "skip this version"),
// with the APK download one tap away. Settings → About can trigger a check
// manually at any time.
//
// Exposes window.UpdateNotice

window.UpdateNotice = {
  _modal: null,
  _lastResult: null,

  /* -- helpers -- */

  _esc(s) {
    if (window.Sanitize && window.Sanitize.escapeHtml) return window.Sanitize.escapeHtml(String(s == null ? '' : s));
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  _engine() {
    return (window.Orbit && window.Orbit.UpdateCheck) || null;
  },

  _toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
  },

  _icons(root) {
    if (window.lucide && window.lucide.createIcons) {
      try { window.lucide.createIcons({ root: root }); } catch (e) { /* non-fatal */ }
    }
  },

  // Android has no shell.openExternal equivalent wired up; the WebView hands
  // target=_blank navigations to the system browser, which is the same route
  // the existing About-screen GitHub links already take.
  /* ── In-app update: download the APK, then hand it to the system installer ──
     Sideloaded apps cannot be updated silently, so the best we can do is remove
     every step the user would otherwise do by hand: fetch the file here (with
     progress), launch the installer, then offer to close Orbit so the update can
     take effect. */
  _downloadAndInstall(res, overlay) {
    var self = this;
    var btn = overlay.querySelector('#update-modal-download');
    var url = res.downloadUrl;
    if (!url) { self._toast('No download link for this release', 'error'); return; }
    // update-check falls back to the release PAGE url when a release carries no
    // matching artifact. Downloading that and handing it to the installer is how
    // "There's a problem with the app file" is produced — the file is HTML. Say so
    // instead.
    if (!res.asset || !res.asset.name) {
      self._toast('This release has no Android APK attached', 'error');
      if (self._openExternal(res.releaseUrl || url)) self._toast('Opening the release page\u2026', 'info');
      return;
    }

    var plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
    var FS = plugins.Filesystem;
    var P2P = plugins.OrbitP2P;

    if (!FS || !P2P || typeof P2P.installApk !== 'function') {
      // No native path: the bar would sit at 0% forever while the browser downloads.
      var _w = overlay.querySelector('#update-modal-progress');
      if (_w) _w.style.display = 'none';
      // Older native build: fall back to handing the URL to the browser.
      if (self._openExternal(url)) self._toast('Opening the APK download in your browser\u2026', 'success');
      else self._toast('Could not open the download link', 'error');
      return;
    }

    var APK_DIR = 'downloads';
    var APK_NAME = 'orbit-update.apk';
    var APK_PATH = APK_DIR + '/' + APK_NAME;

    var setLabel = function (txt) {
      if (btn) { btn.disabled = true; btn.style.opacity = '0.75'; btn.textContent = txt; }
      var note = document.querySelector('#orbit-download-modal #orbit-dl-note');
      if (note) note.textContent = txt;
    };

    var _dlStartedAt = Date.now();

    var _bytes = function (n) {
      if (!n || n < 0) return '0 MB';
      return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
    };

    // Time remaining, from the rate actually observed so far.
    //
    // Nothing before 1.5s: the first chunk of a download says more about the round trip
    // than about the throughput, and an estimate that starts at "2m left" and settles on
    // "20s left" is worse than no estimate. Seconds under a minute, minutes above it.
    var _eta = function (received, total) {
      var elapsed = (Date.now() - _dlStartedAt) / 1000;
      if (!received || !total || elapsed < 1.5) return '';
      var rate = received / elapsed;
      if (!rate) return '';
      var left = (total - received) / rate;
      if (!isFinite(left) || left <= 0.5) return '';
      return left < 60 ? ('~' + Math.round(left) + 's left') : ('~' + Math.round(left / 60) + 'm left');
    };

    // pct < 0 hides the bar. Called from the streaming loop with the same numbers the
    // label uses, so the three cannot disagree.
    var setProgress = function (pct, received, total) {
      // The download sheet is the one on screen now, so it takes the bar. The changelog's
      // copy stays wired as a fallback: this function must not depend on which is up.
      var dl = document.getElementById('orbit-dl-sheet') || document.getElementById('orbit-download-modal');
      var wrap = dl ? dl.querySelector('#orbit-dl-fill') : overlay.querySelector('#update-modal-progress');
      var fill = dl ? dl.querySelector('#orbit-dl-fill') : overlay.querySelector('#update-modal-progress-fill');
      var note = dl ? dl.querySelector('#orbit-dl-note') : overlay.querySelector('#update-modal-progress-note');
      if (!fill) return;
      if (!dl) {
        if (!wrap) return;
        if (pct == null || pct < 0) { wrap.style.display = 'none'; return; }
        wrap.style.display = 'block';
      }
      var shown = Math.max(0, Math.min(100, pct < 0 ? 0 : pct));
      fill.style.width = shown + '%';
      // The number is the thing you actually read while waiting, so it is its own
      // element rather than being buried in the note.
      var pctEl = dl ? dl.querySelector('#orbit-dl-pct') : null;
      if (pctEl && !dl.classList.contains('is-installing')) pctEl.textContent = shown + '%';
      if (note) {
        note.textContent = (total && received != null)
          ? (_bytes(received) + ' of ' + _bytes(total))
          : ('Downloading\u2026 ' + shown + '%');
      }
      var etaEl = dl ? dl.querySelector('#orbit-dl-eta') : null;
      if (etaEl) etaEl.textContent = _eta(received, total) || '';
    };
    setLabel('Starting download\u2026');

    // Both declared here, at the top of the function, so every step of the chain below can
    // see them. `total` was hoisted when it threw "total is not defined" — declared inside
    // the response callback and read in the verification step, a different callback.
    //
    // `received` had the SAME bug and was left behind, which is what Dan hit: the progress
    // callback declares it, and the verification step two callbacks later reads it, so the
    // whole download died with "Update failed: received is not defined" before it could
    // install anything. Fixing one variable of a pair is how this happens.
    var total = 0;
    var received = 0;

    FS.mkdir({ path: APK_DIR, directory: 'CACHE', recursive: true })
      .catch(function () { /* already there */ })
      .then(function () { return FS.deleteFile({ path: APK_PATH, directory: 'CACHE' }).catch(function () {}); })
      .then(function () { return fetch(url); })
      .then(function (resp) {
        if (!resp.ok) throw new Error('Download failed (HTTP ' + resp.status + ')');

        // Don't assume the Response is a full implementation. CapacitorHttp's patched
        // fetch constructs a real Response, but a partial one would make
        // resp.headers.get(...) throw and turn a working download into
        // "Cannot read properties of undefined". Length is only used for the progress
        // readout, so treat it as optional.
        // Assigned, not declared: a `var` here shadows the one at the top of the
        // function, so the verification step further down would read the outer 0 and
        // silently stop checking the download size.
        try {
          if (resp.headers && typeof resp.headers.get === 'function') {
            total = parseInt(resp.headers.get('content-length') || '0', 10) || 0;
            // The mobile Response is patched to buffer the whole body, so Content-Length is
            // often absent — and with total 0 the bar was pinned at 0% for the entire download
            // while the label counted megabytes. The release asset's declared size is already
            // used further down to VERIFY the download; it works just as well as the denominator.
            if (!total && res.asset && res.asset.size) total = res.asset.size;
          }
        } catch (e) { total = 0; }

        // CapacitorHttp (enabled in capacitor.config.json so the update CHECK can
        // reach GitHub without hitting WebView CORS) patches window.fetch to run
        // through native code — and the patched Response buffers the whole body, so
        // there is no ReadableStream and body.getReader() is unavailable.
        //
        // Stream when we can: it keeps peak memory to one chunk and gives real
        // progress. Fall back to a buffered write when we cannot, rather than
        // refusing the download — the updater has to work under both transports.
        if (!resp.body || typeof resp.body.getReader !== 'function') {
          setLabel('Downloading\u2026');
          self._setDownloadState('downloading', 'Downloading the update');
          return resp.arrayBuffer().then(function (ab) {
            var bytes = new Uint8Array(ab);
            if (!bytes.length) throw new Error('The download came back empty');
            // base64 via a chunked String.fromCharCode to avoid blowing the argument
            // limit on a large APK.
            var bin = '';
            for (var i = 0; i < bytes.length; i += 0x8000) {
              bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i + 0x8000)));
            }
            return FS.writeFile({ path: APK_PATH, directory: 'CACHE', data: btoa(bin) })
              .then(function () { return bytes.length; });
          });
        }

        var reader = resp.body.getReader();
        received = 0;          // assigned, not declared: the outer one is the one that counts
        var carry = new Uint8Array(0);

        // Filesystem takes strings, so chunks are written as base64. base64 only
        // encodes cleanly in 3-byte groups, so a partial group is carried over to
        // the next append — appending independently padded base64 is exactly the
        // corruption bug the file-transfer code hit.
        var append = function (bytes) {
          var buf = new Uint8Array(carry.length + bytes.length);
          buf.set(carry, 0);
          buf.set(bytes, carry.length);
          var usable = buf.length - (buf.length % 3);
          carry = buf.slice(usable);
          if (!usable) return Promise.resolve();
          var bin = '';
          for (var i = 0; i < usable; i += 0x8000) {
            bin += String.fromCharCode.apply(null, buf.subarray(i, Math.min(usable, i + 0x8000)));
          }
          return FS.appendFile({ path: APK_PATH, directory: 'CACHE', data: btoa(bin) });
        };

        var pump = function () {
          return reader.read().then(function (r) {
            if (r.done) return null;
            received += r.value.length;
            var pct = total ? Math.round(received / total * 100) : 0;
            setProgress(total ? pct : -1, received, total);
            setLabel(total
              ? 'Downloading\u2026 ' + pct + '% (' + Math.round(received / 1048576) + ' MB)'
              : 'Downloading\u2026 ' + Math.round(received / 1048576) + ' MB');
            return append(r.value).then(pump);
          });
        };

        return pump().then(function () {
          if (carry.length) {
            // The trailing bytes, written UNPADDED.
            //
            // The 3-byte grouping above exists because appending independently padded
            // base64 corrupts the stream — but that only applies to appends with more
            // data still to come. This is the last one, and padding it wrote zero bytes
            // that were never in the file: a 200,000-byte download landed as 200,001.
            //
            // That is not a cosmetic off-by-one. Android checks an APK's zip against
            // its signature, so a file one or two bytes long is refused with "There's a
            // problem with the app file" — the very error this function's size check was
            // written to prevent, arriving by a different route. It only shows up when
            // the byte count is not a multiple of three, which is most of the time.
            var bin = '';
            for (var i = 0; i < carry.length; i++) bin += String.fromCharCode(carry[i]);
            carry = new Uint8Array(0);
            return FS.appendFile({ path: APK_PATH, directory: 'CACHE', data: btoa(bin) });
          }
          return null;
        }).then(function () { return received; });
      })
      .then(function (bytes) {
        // Verify BEFORE the installer sees it.
        //
        // Android's own error for a bad APK is "There's a problem with the app
        // file", which tells the user nothing and looks like an app bug. A partial
        // download is the common cause, and the expected size is known two ways:
        // the API's declared asset size, and Content-Length. Refuse to install
        // anything short, and delete it so the next attempt starts clean.
        var expected = (res.asset && res.asset.size) ? res.asset.size : 0;
        var short = (expected && bytes < expected) || (total && bytes < total);
        if (short) {
          return FS.deleteFile({ path: APK_PATH, directory: 'CACHE' }).catch(function () {}).then(function () {
            // KB under a megabyte: rounding a small file to "0 of 0 MB" tells the
            // user nothing, and it is the message they get when a download fails.
            var _mb = function (n) { return n >= 1048576 ? (Math.round(n / 1048576) + ' MB') : (Math.round(n / 1024) + ' KB'); };
            var want = _mb(expected || total);
            var got = _mb(bytes);
            throw new Error('The download stopped early (' + got + ' of ' + want + ') \u2014 try again');
          });
        }
        // `bytes` is the count that actually arrived — the streaming path returns `received`
        // and the buffered path returns bytes.length, so this is right for both. Reading
        // `received` directly here was the crash.
        setProgress(100, bytes, total || bytes);
        // The bytes are all in. Say so before the installer takes over — the old
        // title stayed on "Downloading" right through the install.
        self._setDownloadState('done', _bytes(bytes) + ' downloaded');
        setLabel('Opening installer\u2026');
        self._setDownloadState('installing', 'Follow the prompt to finish');
        return P2P.installApk({ path: APK_PATH }).then(function () {
          return bytes;
        });
      })
      .then(function (bytes) {
        self._toast('Downloaded ' + (bytes >= 1048576 ? Math.round(bytes / 1048576) + ' MB' : Math.round(bytes / 1024) + ' KB') + ' \u2014 finish the install, then close Orbit', 'success');
        if (window.Changelog && window.Changelog.close) window.Changelog.close();
        self._hideDownloadModal();
        self._offerRestart(overlay);
      })
      .catch(function (err) {
        var msg = (err && err.message) ? err.message : String(err);
        if (msg.indexOf('NEED_INSTALL_PERMISSION') !== -1 || (err && err.code === 'NEED_INSTALL_PERMISSION')) {
          self._toast('Allow Orbit to install unknown apps, then tap Download again', 'warning');
        } else {
          self._toast('Update failed: ' + msg, 'error');
        }
        self._hideDownloadModal();
        if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.textContent = 'Download APK'; }
      });
  },

  /* After the installer has been launched, the update only applies once Orbit is
     not running — so make that one tap rather than a manual trip to the launcher. */
  /* The download gets its own modal, and the changelog is dismissed when it starts.
     Dan's read on it is right: you have already read the release notes by the time you tap
     Download, so watching a progress bar inside a list of notes you are not reading is the
     wrong place for it. Tens of megabytes takes a while, and it deserves the whole screen. */
  /* A sheet rather than a centred modal. A download is a WAIT, not a question,
     so it should not black out the app and sit in the middle of the screen
     pretending to be a decision. The styling lives in redesign.css now — the old
     version was all inline, which is why it could not use the app's tokens and
     why its title stayed "Downloading Orbit…" through the install. */
  _showDownloadModal() {
    this._hideDownloadModal();
    var html =
      '<div class="update-dl-sheet" id="orbit-dl-sheet">' +
        '<div class="update-dl-head">' +
          '<div class="update-dl-icon" id="orbit-dl-icon"><i data-lucide="download-cloud"></i></div>' +
          '<div class="update-dl-titles">' +
            '<span class="update-dl-title" id="orbit-dl-title">Downloading Orbit</span>' +
            '<span class="update-dl-sub" id="orbit-dl-sub">Getting ready\u2026</span>' +
          '</div>' +
          '<span class="update-dl-pct" id="orbit-dl-pct">0%</span>' +
        '</div>' +
        '<div class="update-dl-track"><div class="update-dl-fill" id="orbit-dl-fill"></div></div>' +
        '<div class="update-dl-meta">' +
          '<span id="orbit-dl-note">Starting\u2026</span>' +
          '<span id="orbit-dl-eta"></span>' +
        '</div>' +
      '</div>';

    var sheet = (typeof window !== 'undefined' && window.OrbitSheet)
      ? window.OrbitSheet
      : (typeof OrbitSheet !== 'undefined' ? OrbitSheet : null);
    if (sheet && typeof sheet.showCustom === 'function') {
      sheet.showCustom(html);
    } else {
      // No sheet available — fall back to the same markup as a plain overlay so
      // the download still shows something.
      var box = document.createElement('div');
      box.id = 'orbit-download-modal';
      box.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:flex-end;' +
        'justify-content:center;background:rgba(0,0,0,0.45);';
      box.innerHTML = '<div style="background:var(--bg-surface);border-radius:20px 20px 0 0;width:100%;">' + html + '</div>';
      document.body.appendChild(box);
    }
    var root = document.getElementById('orbit-dl-sheet');
    if (window.lucide && root) { try { window.lucide.createIcons({ root: root }); } catch (e) { /* non-fatal */ } }
    return root;
  },

  /**
   * Move the download through its states. The old modal had one — "Downloading
   * Orbit…" — and kept it while the installer ran, which is the part Dan noticed.
   */
  _setDownloadState(state, sub) {
    var sheet = document.getElementById('orbit-dl-sheet');
    if (!sheet) return;
    sheet.classList.toggle('is-done', state === 'done');
    sheet.classList.toggle('is-installing', state === 'installing');
    var title = sheet.querySelector('#orbit-dl-title');
    var icon = sheet.querySelector('#orbit-dl-icon');
    var subEl = sheet.querySelector('#orbit-dl-sub');
    var TITLES = { downloading: 'Downloading Orbit', done: 'Downloaded', installing: 'Installing' };
    var ICONS = { downloading: 'download-cloud', done: 'check-circle-2', installing: 'package-open' };
    if (title) title.textContent = TITLES[state] || TITLES.downloading;
    if (subEl && sub !== undefined) subEl.textContent = sub;
    if (icon) {
      icon.innerHTML = '<i data-lucide="' + (ICONS[state] || ICONS.downloading) + '"></i>';
      if (window.lucide) { try { window.lucide.createIcons({ root: icon }); } catch (e) { /* non-fatal */ } }
    }
    if (state === 'installing') {
      var pct = sheet.querySelector('#orbit-dl-pct');
      if (pct) pct.innerHTML = '<span class="update-dl-spinner"></span>';
    }
  },

  _hideDownloadModal() {
    var sheet = (typeof window !== 'undefined' && window.OrbitSheet)
      ? window.OrbitSheet
      : (typeof OrbitSheet !== 'undefined' ? OrbitSheet : null);
    if (sheet && typeof sheet.hide === 'function') { try { sheet.hide(); } catch (e) { /* non-fatal */ } }
    var box = document.getElementById('orbit-download-modal');
    if (box) box.remove();
  },

  _offerRestart(overlay) {
    var self = this;
    var plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
    var P2P = plugins.OrbitP2P;

    var existing = document.getElementById('orbit-restart-prompt');
    if (existing) existing.remove();

    var box = document.createElement('div');
    box.id = 'orbit-restart-prompt';
    box.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;' +
      'justify-content:center;padding:16px;box-sizing:border-box;background:rgba(0,0,0,0.6);';
    box.innerHTML =
      '<div style="background:var(--bg-surface);border-radius:16px;padding:20px;max-width:340px;width:100%;' +
        'border:1px solid var(--border-subtle);box-shadow:0 20px 60px rgba(0,0,0,0.4);">' +
        '<div style="font-weight:700;font-size:15px;color:var(--text-primary);margin-bottom:6px;">' +
          'Finish the update</div>' +
        '<div style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-bottom:16px;">' +
          'Complete the install in the dialog Android opened, then close Orbit so the new version can start.' +
        '</div>' +
        '<button id="orbit-restart-close" style="width:100%;padding:12px;border-radius:11px;border:none;' +
          'background:var(--accent-primary);color:#fff;font-weight:600;font-size:14px;cursor:pointer;' +
          'margin-bottom:8px;">Close Orbit</button>' +
        '<button id="orbit-restart-later" style="width:100%;padding:10px;border-radius:11px;border:none;' +
          'background:transparent;color:var(--text-secondary);font-size:13px;cursor:pointer;">Later</button>' +
        '<div id="orbit-restart-count" style="font-size:11.5px;color:var(--text-muted);text-align:center;' +
          'margin-top:10px;"></div>' +
      '</div>';

    // Closes itself after a countdown, as Dan asked.
    //
    // Worth being exact about what closing does, because it is easy to assume it does more:
    // **closing Orbit does not install the update.** The installer already has the APK and
    // Android runs the install in its own process — it kills this app partway through
    // regardless. What closing does is make the NEW version the one that starts next, and
    // that matters because an app cannot replace itself while it is running.
    //
    // So the countdown is a convenience, not the mechanism. It is cancellable, and both
    // buttons stop it — closing someone's app out from under them without a way out would be
    // the wrong trade for saving one tap.
    var secs = 10;
    var countEl = box.querySelector('#orbit-restart-count');
    var timer = null;
    var stopCountdown = function () { if (timer) { clearInterval(timer); timer = null; } };
    var tick = function () {
      if (countEl) countEl.textContent = 'Closing Orbit in ' + secs + 's\u2026';
      if (secs <= 0) {
        stopCountdown();
        if (P2P && typeof P2P.exitApp === 'function') P2P.exitApp().catch(function () {});
        return;
      }
      secs--;
    };
    tick();
    timer = setInterval(tick, 1000);

    box.querySelector('#orbit-restart-close').addEventListener('click', function () {
      stopCountdown();
      if (P2P && typeof P2P.exitApp === 'function') P2P.exitApp().catch(function () {});
    });
    box.querySelector('#orbit-restart-later').addEventListener('click', function () {
      stopCountdown();
      box.remove();
    });
    document.body.appendChild(box);
  },

  _openExternal(url) {
    if (!url) return false;
    try {
      var a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function() { if (a.parentNode) a.parentNode.removeChild(a); }, 1000);
      return true;
    } catch (e) {
      return false;
    }
  },

  /* -- boot -- */

  init(opts) {
    opts = opts || {};
    var self = this;
    var engine = this._engine();
    if (!engine) return;

    // Respect the user's opt-out. checkManual() deliberately ignores this — an
    // explicit tap is not an automatic check.
    var settings = (window.MStore && window.MStore.settings) || {};
    if (settings.updateCheckEnabled === false) return;

    // Delay so the update dialog never competes with app startup.
    setTimeout(function() {
      engine.checkThrottled(opts).then(function(res) {
        if (res && res.ok && res.hasUpdate) {
          self._lastResult = res;
          self.openModal(res);
        }
      }).catch(function() { /* never break boot over an update check */ });
    }, opts.delayMs || 6000);
  },

  checkManual(opts) {
    var self = this;
    var engine = this._engine();
    if (!engine) {
      this._toast('Updates unavailable', 'error');
      return Promise.resolve(null);
    }
    var request = Object.assign({}, opts || {}, { force: true });
    this._toast('Checking for updates\u2026', 'info');
    return engine.checkThrottled(request).then(function(res) {
      if (!res || !res.ok) {
        self._toast('Could not check for updates', 'error');
        return res;
      }
      if (!res.hasUpdate) {
        self._toast('You\u2019re up to date \u2014 v' + res.current, 'success');
        return res;
      }
      self._lastResult = res;
      self.openModal(res);
      return res;
    });
  },

  /* -- dialog -- */

  closeModal() {
    if (this._modal && this._modal.parentNode) this._modal.parentNode.removeChild(this._modal);
    this._modal = null;
    document.removeEventListener('keydown', this._onKeydown || function() {});
  },

  openModal(res) {
    if (!res) return;
    this.closeModal();
    var self = this;

    var highlightsHtml;
    if (res.highlights && res.highlights.length) {
      highlightsHtml = res.highlights.map(function(h) {
        return '<div style="display:flex;gap:10px;align-items:flex-start;">' +
          '<div style="width:6px;height:6px;border-radius:50%;background:var(--accent-primary);' +
            'margin-top:7px;flex-shrink:0;"></div>' +
          '<div style="font-size:13px;color:var(--text-secondary);line-height:1.5;">' + self._esc(h) + '</div>' +
        '</div>';
      }).join('');
    } else {
      highlightsHtml =
        '<div style="font-size:13px;color:var(--text-muted);line-height:1.5;">' +
          'Release notes weren\u2019t published for this version. Open the release page for the full list.' +
        '</div>';
    }

    // Also drop a system notification, so the update is still discoverable after
    // this dialog is dismissed — and so it reaches the user if the app is
    // backgrounded. Same group key, so repeated checks collapse into one entry.
    if (window.orbitNotify) {
      window.orbitNotify('UPDATE',
        'Orbit v' + res.latest + ' is available',
        'You’re on v' + res.current + '. Tap to update.',
        'orbit_update');
    }

    var overlay = document.createElement('div');
    overlay.id = 'update-notice-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);' +
      'z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';

    overlay.innerHTML =
      '<div style="background:var(--bg-surface);border-radius:16px;width:100%;max-width:420px;' +
        'max-height:82vh;display:flex;flex-direction:column;overflow:hidden;' +
        'box-shadow:0 20px 60px rgba(0,0,0,0.4);border:1px solid var(--border-subtle);">' +

        '<div style="padding:18px 18px 0;display:flex;align-items:flex-start;gap:12px;">' +
          '<div style="width:38px;height:38px;border-radius:11px;background:var(--accent-primary);' +
            'display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff;">' +
            '<i data-lucide="download-cloud" style="width:19px;height:19px;"></i>' +
          '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:700;font-size:15px;color:var(--text-primary);line-height:1.3;">' +
              'Orbit v' + this._esc(res.latest) + ' is available' +
            '</div>' +
            '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">' +
              'You\u2019re on v' + this._esc(res.current) + (res.prerelease ? ' \u00b7 pre-release' : '') +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div style="padding:16px 18px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:10px;">' +
          '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;' +
            'letter-spacing:.5px;">What\u2019s new</div>' +
          highlightsHtml +
        '</div>' +

        '<div style="padding:14px 18px 18px;border-top:1px solid var(--border-subtle);' +
          'display:flex;flex-direction:column;gap:10px;">' +
          // A bar, not just a percentage on the button. The download is tens of
          // megabytes and the button label was the only sign anything was happening —
          // and once the label reads "Opening installer…" there is no sign at all.
          // Same bar as the desktop's update modal: 6px, accent, .15s linear.
          '<div id="update-modal-progress" style="display:none;">' +
            '<div style="height:6px;border-radius:3px;background:var(--border-subtle);overflow:hidden;">' +
              '<div id="update-modal-progress-fill" style="height:100%;width:0%;' +
                'background:var(--accent-primary);transition:width .15s linear;"></div>' +
            '</div>' +
            '<div id="update-modal-progress-note" style="font-size:11px;color:var(--text-muted);' +
              'margin-top:6px;">Starting\u2026</div>' +
          '</div>' +
          '<button id="update-modal-download" style="width:100%;padding:13px;border-radius:11px;border:none;' +
            'background:var(--accent-primary);color:#fff;font-size:14px;font-weight:600;cursor:pointer;">' +
            'Download APK' +
          '</button>' +
          '<div style="display:flex;gap:10px;">' +
            '<button id="update-modal-later" style="flex:1;padding:11px;border-radius:11px;' +
              'border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);' +
              'font-size:13px;font-weight:500;cursor:pointer;">Later</button>' +
            '<button id="update-modal-skip" style="flex:1;padding:11px;border-radius:11px;' +
              'border:1px solid var(--border-subtle);background:transparent;color:var(--text-muted);' +
              'font-size:13px;font-weight:500;cursor:pointer;">Skip this version</button>' +
          '</div>' +
          '<button id="update-modal-notes" style="background:transparent;border:none;cursor:pointer;' +
            'color:var(--text-muted);font-size:12px;padding:2px;">View full release notes</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    this._icons(overlay);
    this._modal = overlay;

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) self.closeModal();
    });
    this._onKeydown = function(e) { if (e.key === 'Escape') self.closeModal(); };
    document.addEventListener('keydown', this._onKeydown);

    overlay.querySelector('#update-modal-download').addEventListener('click', function() {
      // The changelog gets out of the way and the download takes the screen.
      //
      // It used to stay open because the progress bar lived inside it — but you have read
      // the notes by the time you tap Download, so the bar was sitting in a list nobody was
      // reading. Dan's flow, and it is the better one: dismiss this, show a small modal that
      // is only about the download, then ask about the install when it lands.
      self.closeModal();
      self._showDownloadModal();
      self._downloadAndInstall(res, overlay);
    });

    overlay.querySelector('#update-modal-notes').addEventListener('click', function() {
      if (!self._openExternal(res.releaseUrl)) self._toast('Could not open the release page', 'error');
    });

    overlay.querySelector('#update-modal-later').addEventListener('click', function() {
      self.closeModal();
    });

    overlay.querySelector('#update-modal-skip').addEventListener('click', function() {
      var engine = self._engine();
      if (engine) engine.skipVersion(res.latest);
      self.closeModal();
      self._toast('Skipped v' + res.latest, 'info');
    });
  }
};
