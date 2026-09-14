// desktop/src/js/components/update-notice.js
// "A new version of Orbit is out" — the heads-up card and the What's New dialog.
//
// The detection logic lives in shared/network/update-check.js; this file is only
// presentation. Three surfaces:
//
//   1. init()          — silent, throttled check shortly after boot
//   2. a persistent card (bottom-left, so it never collides with Toast, which
//      owns bottom-right) offering "What's new" / dismiss
//   3. a modal with the release highlights and a Download button that opens the
//      right installer for this platform in the user's browser
//
// Orbit builds are unsigned, so silent self-update is not on the table yet:
// electron-updater needs a signed NSIS/dmg before it can replace the binary in
// place. Until then "the app does the updating" means handing the user the exact
// file for their platform, one click from the notice.
//
// Exposes window.UpdateNotice

window.UpdateNotice = {
  _card: null,
  _modal: null,
  _lastResult: null,

  /* -- helpers -- */

  _esc(s) {
    return window.Sanitize ? window.Sanitize.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s);
  },

  _engine() {
    return (window.Orbit && window.Orbit.UpdateCheck) || null;
  },

  _platformLabel(platform) {
    if (platform === 'darwin') return 'macOS';
    if (platform === 'linux') return 'Linux';
    if (platform === 'android') return 'Android';
    return 'Windows';
  },

  _toast(title, msg, type) {
    if (window.Toast && window.Toast.show) window.Toast.show(title, msg, type || 'info');
  },

  _icons(root) {
    if (window.lucide && window.lucide.createIcons) {
      try { window.lucide.createIcons({ root: root }); } catch (e) { /* non-fatal */ }
    }
  },

  // Opens the release/asset page in the user's browser. The main process
  // validates the URL and rejects anything that is not https on a GitHub host.
  _openExternal(url) {
    if (!url) return false;
    if (window.orbitAPI && window.orbitAPI.openExternal) {
      try { return !!window.orbitAPI.openExternal(url); } catch (e) { return false; }
    }
    // Web/dev fallback.
    try { window.open(url, '_blank', 'noopener'); return true; } catch (e) { return false; }
  },

  /* -- boot -- */

  // Silent check a few seconds after boot so it never competes with the
  // startup work (tutorial overlay, message load, first paint).
  init(opts) {
    opts = opts || {};
    var self = this;
    var engine = this._engine();
    if (!engine) return;

    // Respect the user's opt-out. checkManual() deliberately ignores this — an
    // explicit click is not an automatic check.
    var settings = (window.store && window.store.getState().settings) || {};
    if (settings.updateCheckEnabled === false) return;

    setTimeout(function() {
      engine.checkThrottled(opts).then(function(res) {
        if (res && res.ok && res.hasUpdate) {
          self._lastResult = res;
          self.showCard(res);
        }
      }).catch(function() { /* never break boot over an update check */ });
    }, opts.delayMs || 4000);
  },

  // Manual check (Settings → About). Always reports an outcome.
  // opts is passed through to the engine — used by tests to inject a transport.
  checkManual(opts) {
    var self = this;
    var engine = this._engine();
    if (!engine) {
      this._toast('Updates unavailable', 'The update module did not load.', 'error');
      return Promise.resolve(null);
    }
    var request = Object.assign({}, opts || {}, { force: true });
    this._toast('Checking for updates', 'Looking for a newer version of Orbit…', 'info');
    return engine.checkThrottled(request).then(function(res) {
      if (!res || !res.ok) {
        self._toast('Could not check for updates', (res && res.error) || 'No connection to GitHub.', 'error');
        return res;
      }
      if (!res.hasUpdate) {
        self._toast('You\u2019re up to date', 'Orbit v' + res.current + ' is the newest version.', 'success');
        return res;
      }
      self._lastResult = res;
      self.hideCard();
      self.openModal(res);
      return res;
    });
  },

  /* -- heads-up card -- */

  hideCard() {
    if (this._card && this._card.parentNode) this._card.parentNode.removeChild(this._card);
    this._card = null;
  },

  showCard(res) {
    if (this._card) return;
    var self = this;

    var card = document.createElement('div');
    card.id = 'update-notice-card';
    // bottom-left: Toast owns bottom-right. Raised clear of the own-avatar at
    // the foot of the nav rail so the two don't overlap.
    card.style.cssText = 'position:fixed;left:24px;bottom:104px;z-index:9500;width:340px;' +
      'background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:12px;' +
      'box-shadow:var(--shadow-xl);padding:16px;display:flex;gap:12px;align-items:flex-start;' +
      'transform:translateY(16px);opacity:0;transition:transform .25s ease,opacity .25s ease;';

    card.innerHTML =
      '<div style="width:36px;height:36px;border-radius:10px;background:var(--accent-primary);' +
        'display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff;">' +
        '<i data-lucide="download-cloud" style="width:18px;height:18px;"></i>' +
      '</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:600;font-size:14px;color:var(--text-primary);">' +
          'Orbit v' + this._esc(res.latest) + ' is available' +
        '</div>' +
        '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;line-height:1.4;">' +
          'You\u2019re running v' + this._esc(res.current) + '. ' +
          (res.highlights && res.highlights.length
            ? this._esc(res.highlights.length) + ' change' + (res.highlights.length === 1 ? '' : 's') + ' to catch up on.'
            : 'A newer release is ready to download.') +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;">' +
          '<button id="update-card-open" style="padding:7px 14px;border-radius:8px;border:none;' +
            'background:var(--accent-primary);color:#fff;font-size:12px;font-weight:600;cursor:pointer;">What\u2019s new</button>' +
          '<button id="update-card-later" style="padding:7px 14px;border-radius:8px;' +
            'border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);' +
            'font-size:12px;font-weight:500;cursor:pointer;">Later</button>' +
        '</div>' +
      '</div>' +
      '<button id="update-card-close" title="Dismiss" style="background:transparent;border:none;' +
        'cursor:pointer;color:var(--text-muted);padding:2px;line-height:1;flex-shrink:0;">' +
        '<i data-lucide="x" style="width:16px;height:16px;"></i>' +
      '</button>';

    document.body.appendChild(card);
    this._icons(card);
    this._card = card;

    requestAnimationFrame(function() {
      card.style.transform = 'translateY(0)';
      card.style.opacity = '1';
    });

    card.querySelector('#update-card-open').addEventListener('click', function() {
      self.hideCard();
      self.openModal(self._lastResult || res);
    });
    // "Later" and the X behave the same: dismiss now, the 6h throttle decides
    // when we may mention it again.
    card.querySelector('#update-card-later').addEventListener('click', function() { self.hideCard(); });
    card.querySelector('#update-card-close').addEventListener('click', function() { self.hideCard(); });
  },

  /* -- What's New modal -- */

  closeModal() {
    if (this._modal && this._modal.parentNode) this._modal.parentNode.removeChild(this._modal);
    this._modal = null;
    document.removeEventListener('keydown', this._onKeydown || function() {});
  },

  openModal(res) {
    if (!res) return;
    this.closeModal();
    var self = this;

    var platformLabel = this._platformLabel(res.platform);
    var hasAsset = !!(res.asset && res.asset.url);

    var highlightsHtml;
    if (res.highlights && res.highlights.length) {
      highlightsHtml = '<div style="display:flex;flex-direction:column;gap:10px;">' +
        res.highlights.map(function(h) {
          return '<div style="display:flex;gap:10px;align-items:flex-start;">' +
            '<div style="width:6px;height:6px;border-radius:50%;background:var(--accent-primary);' +
              'margin-top:7px;flex-shrink:0;"></div>' +
            '<div style="font-size:13px;color:var(--text-secondary);line-height:1.5;">' + self._esc(h) + '</div>' +
          '</div>';
        }).join('') +
      '</div>';
    } else {
      highlightsHtml =
        '<div style="font-size:13px;color:var(--text-muted);line-height:1.5;">' +
          'Release notes weren\u2019t published for this version. Open the release page for the full list.' +
        '</div>';
    }

    var overlay = document.createElement('div');
    overlay.id = 'update-notice-modal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,0.6);' +
      'backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;';

    overlay.innerHTML =
      '<div style="width:480px;max-width:92vw;max-height:82vh;background:var(--bg-surface);' +
        'border-radius:16px;border:1px solid var(--border-subtle);box-shadow:var(--shadow-xl);' +
        'display:flex;flex-direction:column;overflow:hidden;">' +

        '<div style="padding:22px 24px 0;display:flex;align-items:flex-start;gap:14px;">' +
          '<div style="width:40px;height:40px;border-radius:12px;background:var(--accent-primary);' +
            'display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff;">' +
            '<i data-lucide="sparkles" style="width:20px;height:20px;"></i>' +
          '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:700;font-size:16px;color:var(--text-primary);">' +
              'Orbit v' + this._esc(res.latest) + ' is available' +
            '</div>' +
            '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">' +
              'You\u2019re on v' + this._esc(res.current) +
              (res.prerelease ? ' \u00b7 pre-release' : '') +
            '</div>' +
          '</div>' +
          '<button id="update-modal-close" style="background:transparent;border:none;cursor:pointer;' +
            'color:var(--text-muted);padding:4px;"><i data-lucide="x" style="width:18px;height:18px;"></i></button>' +
        '</div>' +

        '<div style="padding:20px 24px;overflow-y:auto;flex:1;">' +
          '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;' +
            'letter-spacing:.5px;margin-bottom:12px;">What\u2019s new</div>' +
          highlightsHtml +
        '</div>' +

        '<div style="padding:16px 24px 20px;border-top:1px solid var(--border-subtle);' +
          'display:flex;align-items:center;gap:10px;">' +
          '<button id="update-modal-skip" style="background:transparent;border:none;cursor:pointer;' +
            'color:var(--text-muted);font-size:12px;padding:6px 0;">Skip this version</button>' +
          '<div style="flex:1;"></div>' +
          '<button id="update-modal-notes" style="padding:9px 16px;border-radius:9px;' +
            'border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);' +
            'font-size:13px;font-weight:500;cursor:pointer;">Release notes</button>' +
          '<button id="update-modal-download" style="padding:9px 18px;border-radius:9px;border:none;' +
            'background:var(--accent-primary);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">' +
            (hasAsset ? 'Download for ' + this._esc(platformLabel) : 'Open release page') +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    this._icons(overlay);
    this._modal = overlay;

    overlay.addEventListener('mousedown', function(e) {
      if (e.target === overlay) self.closeModal();
    });
    this._onKeydown = function(e) { if (e.key === 'Escape') self.closeModal(); };
    document.addEventListener('keydown', this._onKeydown);

    overlay.querySelector('#update-modal-close').addEventListener('click', function() { self.closeModal(); });

    overlay.querySelector('#update-modal-notes').addEventListener('click', function() {
      if (!self._openExternal(res.releaseUrl)) {
        self._toast('Could not open browser', 'Visit github.com/D4niel-dev/Orbit-beta/releases', 'error');
      }
    });

    overlay.querySelector('#update-modal-skip').addEventListener('click', function() {
      var engine = self._engine();
      if (engine) engine.skipVersion(res.latest);
      self.closeModal();
      self.hideCard();
      self._toast('Skipped v' + res.latest, 'You won\u2019t be reminded about this version again.', 'info');
    });

    overlay.querySelector('#update-modal-download').addEventListener('click', function() {
      if (!self._openExternal(res.downloadUrl)) {
        self._toast('Could not open browser', 'Download it from github.com/D4niel-dev/Orbit-beta/releases', 'error');
        return;
      }
      self._toast(
        'Download started',
        hasAsset
          ? 'Your browser is downloading ' + res.asset.name + '. Install it once it finishes.'
          : 'Opening the release page in your browser.',
        'success'
      );
      self.closeModal();
      self.hideCard();
    });
  }
};
