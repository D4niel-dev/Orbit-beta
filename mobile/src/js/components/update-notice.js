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
      if (!self._openExternal(res.downloadUrl)) {
        self._toast('Could not open the download link', 'error');
        return;
      }
      self._toast('Opening the APK download in your browser\u2026', 'success');
      self.closeModal();
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
