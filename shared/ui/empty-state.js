// shared/ui/empty-state.js
//
// One treatment for every "there is nothing here yet" surface.
//
// The app had five of them and they had drifted: a bare icon and a grey line in
// the chat panel, a plain sentence in the sidebar, a bolded query in search. They
// are the same idea, so they are the same component now — a glass icon tile with a
// soft bloom, a title, an optional hint, and an optional action.
//
// Shared by both platforms like the other modules in shared/ui/: edit this file,
// then run `npm run shared:sync` in mobile/.
(function () {
  'use strict';

  function esc(s) {
    if (window.Sanitize && window.Sanitize.escapeHtml) return window.Sanitize.escapeHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // The caller renders this markup into a bigger template and usually never runs a
  // lucide pass over it — that is exactly what happened at all eight call sites,
  // and the icon then stayed an empty <i>. The component schedules its own
  // conversion instead of depending on the caller's habits, coalesced to one pass
  // per frame. lucide skips elements it has already replaced, so a repeated pass
  // only touches what is new.
  var _iconPass = false;
  function scheduleIconPass() {
    if (_iconPass) return;
    _iconPass = true;
    var run = function () {
      _iconPass = false;
      if (window.lucide && window.lucide.createIcons) {
        try { window.lucide.createIcons(); } catch (e) {}
      }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  window.OrbitEmpty = {
    /**
     * Build the markup.
     *
     * opts:
     *   icon    lucide name (required)
     *   title   the headline (required)
     *   hint    one line of explanation, optional
     *   action  { id, label } — an optional pill button; the caller wires the id
     *   compact smaller scale, for a list rather than a whole panel
     *   muted   no accent tint — for states that are passive ("waiting for peers")
     *           rather than something the user can act on
     */
    html: function (opts) {
      opts = opts || {};
      var cls = 'oe-root';
      if (opts.compact) cls += ' is-compact';
      if (opts.muted) cls += ' is-muted';

      var html = '<div class="' + cls + '">';
      html += '<div class="oe-icon"><i data-lucide="' + esc(opts.icon || 'circle') + '"></i></div>';
      if (opts.title) html += '<div class="oe-title">' + esc(opts.title) + '</div>';
      // The hint may carry intentional markup from the caller (a highlighted query,
      // for instance), so it is passed through — callers escape what they interpolate.
      if (opts.hint) html += '<div class="oe-hint">' + opts.hint + '</div>';
      if (opts.action && opts.action.label) {
        html += '<button class="oe-action"' + (opts.action.id ? ' id="' + esc(opts.action.id) + '"' : '') + '>' +
          esc(opts.action.label) + '</button>';
      }
      html += '</div>';
      scheduleIconPass();
      return html;
    },

    // Render into a host element and convert the icon. Returns the host.
    mount: function (host, opts) {
      if (!host) return host;
      host.innerHTML = this.html(opts);
      if (window.lucide && window.lucide.createIcons) {
        try { window.lucide.createIcons({ root: host }); } catch (e) {}
      }
      return host;
    }
  };
})();
