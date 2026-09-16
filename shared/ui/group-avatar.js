// shared/ui/group-avatar.js
// Default group avatar — a grid of member avatars, shown whenever a group has
// no uploaded image.
//
// Layout (product spec):
//   4+ members  -> all four corners (top-left, top-right, bottom-left, bottom-right)
//   < 4 members -> at most two, bottom-right first, then top-left
//
// This used to be desktop-only (desktop/src/js/components/group-avatar.js) while
// mobile rendered a single initial letter in four separate places. It lives in
// shared/ now so both platforms render the same thing from one implementation.
//
// Exposes window.OrbitGroupAvatar.html(members, size, borderColor)
//   and   window.OrbitGroupAvatar.setResolver(fn)   — optional, see below.

(function() {
  function esc(s) {
    if (window.Sanitize && window.Sanitize.escapeHtml) return window.Sanitize.escapeHtml(s);
    return String(s == null ? '' : s);
  }

  // Platform hook. A member record is not always self-describing: on mobile a
  // group synced from a peer can carry nothing but a userId, while the display
  // name and avatar live on the matching friend record. Rather than teach this
  // shared module about MStore, each platform can install a resolver that turns
  // whatever it has into {name, avatar}. Returning a falsy value falls back to
  // the generic handling below, so desktop (which installs nothing) is
  // unaffected.
  var userResolver = null;

  function resolveMember(m) {
    if (userResolver) {
      try {
        var r = userResolver(m);
        if (r) return { name: r.name || '', avatar: r.avatar || null };
      } catch (e) { /* fall through to the generic path */ }
    }
    return null;
  }

  // Accepts either a member object or a bare id string.
  function memberInfo(m) {
    var resolved = resolveMember(m);
    if (resolved) return resolved;
    if (!m) return null;
    if (typeof m === 'string') return { name: m, avatar: null };
    return {
      name: m.username || m.name || m.userId || '',
      avatar: m.avatar || null
    };
  }

  function inner(info, px) {
    if (info.avatar) {
      return '<img src="' + esc(info.avatar) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">';
    }
    var initial = info.name ? info.name.charAt(0).toUpperCase() : '?';
    return '<div style="width:100%;height:100%;border-radius:50%;background:var(--accent-primary);' +
      'display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;' +
      'font-size:' + Math.max(9, Math.round(px * 0.42)) + 'px;">' + esc(initial) + '</div>';
  }

  function cell(info, px, pos, border) {
    var css = 'position:absolute;width:' + px + 'px;height:' + px + 'px;border-radius:50%;' +
      'overflow:hidden;box-sizing:border-box;border:2px solid ' + border + ';';
    if (pos === 'tl') css += 'top:0;left:0;';
    else if (pos === 'tr') css += 'top:0;right:0;';
    else if (pos === 'bl') css += 'bottom:0;left:0;';
    else css += 'bottom:0;right:0;';
    return '<div style="' + css + '">' + inner(info, px) + '</div>';
  }

  /**
   * @param members      group members (objects or id strings)
   * @param size         container size in px
   * @param borderColor  ring colour, so the cells read against their backdrop
   */
  function html(members, size, borderColor) {
    size = size || 40;
    var border = borderColor || 'var(--bg-base)';
    var infos = (members || []).map(memberInfo).filter(Boolean);

    if (infos.length === 0) {
      return '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:12px;' +
        'background:var(--bg-hover);display:flex;align-items:center;justify-content:center;">' +
        '<i data-lucide="users" style="width:' + Math.round(size * 0.45) + 'px;height:' +
        Math.round(size * 0.45) + 'px;color:var(--text-muted);"></i></div>';
    }

    var positions = infos.length >= 4 ? ['tl', 'tr', 'bl', 'br'] : ['br', 'tl'];
    var count = Math.min(infos.length, positions.length);
    var px = Math.round(size * 0.58);

    var out = '';
    for (var i = 0; i < count; i++) {
      out += cell(infos[i], px, positions[i], border);
    }
    return '<div style="position:relative;width:' + size + 'px;height:' + size + 'px;">' + out + '</div>';
  }

  window.OrbitGroupAvatar = {
    html: html,
    setResolver: function(fn) { userResolver = (typeof fn === 'function') ? fn : null; }
  };
})();
