// mobile/src/js/components/bottom-sheet.js
// v0.5.3 — Bottom Sheet System

var OrbitSheet = {
  /**
   * Keep the overlay inside the VISIBLE area.
   *
   * `.bottom-sheet-overlay` is `position: fixed; top: 0; bottom: 0`, which
   * resolves against the LAYOUT viewport. Android does not shrink that when the
   * soft keyboard opens — the keyboard simply overlays it — so a bottom-anchored
   * sheet renders BEHIND the keyboard and the user sees nothing at all.
   * `visualViewport` tracks the genuinely visible region, so we size to that.
   *
   * The same measurement is published as `--sheet-vh` so the sheet's own
   * max-height can be capped against the visible height rather than `vh`
   * (see .bottom-sheet in mobile.css). Without that the sheet could end up
   * taller than the box it is anchored in, pushing its top — and the drag
   * handle — off-screen while covering the entire backdrop.
   */
  _syncViewport: function() {
    var overlay = document.getElementById('bottom-sheet-overlay');
    if (!overlay) return;

    // Which height the sheet is sized against depends on whether the keyboard is
    // a concern at all.
    //
    // A sheet with NO text field has no reason to avoid the keyboard, and sizing
    // it from `visualViewport` means inheriting the keyboard-shrunken height — a
    // measurement Android does not always grow back when the keyboard hides. That
    // is what left /help capped at roughly a third of the screen on Dan's phone,
    // with its Cancel footer pushed off the bottom. The layout viewport
    // (`innerHeight`) is stable and recovers, so use it.
    //
    // A sheet WITH a field (the /poll builder, rename prompts) does want to stay
    // above the keyboard, and there the visual viewport is exactly right.
    var sheet = document.getElementById('bottom-sheet');
    var hasInput = !!(sheet && sheet.querySelector('input, textarea, [contenteditable="true"]'));
    var vv = window.visualViewport;
    var h = hasInput ? ((vv && vv.height) ? vv.height : window.innerHeight) : window.innerHeight;

    if (!h) {
      overlay.style.height = '';
      overlay.style.removeProperty('--sheet-vh');
      return;
    }
    overlay.style.height = h + 'px';
    overlay.style.setProperty('--sheet-vh', h + 'px');
  },

  /**
   * Re-measure the viewport a few times after a sheet opens.
   *
   * A sheet opened from a slash command (/help, /poll) opens while the soft
   * keyboard is still UP: _dismissKeyboard() only asks it to close, and Android
   * takes a few hundred ms to animate it away. Measuring once at open time
   * therefore records the keyboard-up height — on a 2400px screen that is about
   * 1423px — and the sheet stays capped to 0.7 x that for its whole life, so a
   * 19-command list shows three and looks truncated. Measured from a real device
   * screenshot: the sheet came out 996px tall, which is exactly 0.7 x 1423.
   *
   * The visualViewport resize event that should correct this does not reliably
   * arrive on Android when the keyboard hides, so re-measure on a short schedule
   * instead of trusting a single sample. Each pass re-reads the CURRENT height,
   * so a sheet that legitimately wants keyboard avoidance (the /poll builder)
   * still shrinks when its own field raises the keyboard.
   */
  _settleViewport: function() {
    var self = this;
    if (this._settleTimers) this._settleTimers.forEach(function(t) { clearTimeout(t); });
    this._settleTimers = [0, 180, 450, 900, 1500].map(function(ms) {
      return setTimeout(function() {
        var overlay = document.getElementById('bottom-sheet-overlay');
        if (!overlay || !overlay.classList.contains('active')) return;
        self._syncViewport();
        self._syncScrollHint();
      }, ms);
    });
  },

  /**
   * Close the soft keyboard if a text field is focused.
   *
   * Belt-and-braces alongside _syncViewport: the conventional mobile behaviour
   * is that opening a sheet dismisses the keyboard, and it guarantees the sheet
   * is visible even on WebView builds where visualViewport is unreliable.
   */
  _dismissKeyboard: function() {
    try {
      var el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        el.blur();
      }
    } catch (e) { /* ignore */ }
  },

  /**
   * Drop any transform/transition left on the sheet by a drag.
   *
   * show/hide work by toggling `.active` on the overlay, but an INLINE
   * transform beats both CSS rules. The drag-to-close handlers write
   * `sheet.style.transform` on every touchmove, and if that gesture ends in a
   * touchcancel instead of a touchend (Android does this whenever the WebView
   * claims the gesture, e.g. as a scroll) the inline value is never cleared —
   * after which hide() looks like it does nothing at all, because the sheet
   * keeps the transform it was left with. Called on open and on close.
   */
  _resetSheetTransform: function() {
    var sheet = document.getElementById('bottom-sheet');
    if (!sheet) return;
    sheet.style.transform = '';
    sheet.style.transition = '';
    sheet.style.willChange = '';
  },

  /** Show a bottom sheet with items (icon left, label right) */
  show: function(items) {
    var overlay = document.getElementById('bottom-sheet-overlay');
    var content = document.getElementById('bottom-sheet-content');
    var backdrop = document.getElementById('bottom-sheet-backdrop');
    var sheetEl = document.getElementById('bottom-sheet');
    
    if (!overlay || !content) return;
    if (sheetEl) sheetEl.classList.remove('bottom-sheet-tall');

    OrbitSheet._dismissKeyboard();
    OrbitSheet._syncViewport();
    OrbitSheet._settleViewport();
    OrbitSheet._resetSheetTransform();
    
    // Build content
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      html += '<button class="bottom-sheet-item" data-action="' + (item.action || '') + '">';
      if (item.icon) {
        html += '<i data-lucide="' + item.icon + '"></i>';
      }
      html += '<span>' + (item.label || '') + '</span>';
      if (item.subtext) {
        html += '<span class="bottom-sheet-subtext">' + item.subtext + '</span>';
      }
      html += '</button>';
    }
    content.innerHTML = html;
    content.scrollTop = 0;
    
    // Add cancel pill
    OrbitSheet._addCancelPill();
    OrbitSheet._addCloseButton();
    
    // Show
    overlay.classList.add('active');
    
    // Re-init icons
    if (window.lucide) lucide.createIcons();
    
    // Wire click handlers
    var btns = content.querySelectorAll('.bottom-sheet-item');
    for (var j = 0; j < btns.length; j++) {
      (function(btn) {
        btn.addEventListener('click', function(e) {
          var action = btn.getAttribute('data-action');
          OrbitSheet.hide();
          if (typeof OrbitSheet._callbacks === 'object' && OrbitSheet._callbacks[action]) {
            OrbitSheet._callbacks[action]();
          }
        });
      })(btns[j]);
    }
    
    // Backdrop click to dismiss
    if (backdrop) {
      backdrop.onclick = function() { OrbitSheet.hide(); };
    }
    requestAnimationFrame(function() { OrbitSheet._syncScrollHint(); });
  },

  /** Show a bottom sheet with custom HTML content.
   *  opts.tall — for reference lists (see .bottom-sheet-tall in mobile.css). */
  showCustom: function(html, opts) {
    var overlay = document.getElementById('bottom-sheet-overlay');
    var content = document.getElementById('bottom-sheet-content');
    var backdrop = document.getElementById('bottom-sheet-backdrop');
    var sheetEl = document.getElementById('bottom-sheet');
    if (!overlay || !content) return;
    // Clear first: a tall sheet must not make the NEXT sheet tall too.
    if (sheetEl) sheetEl.classList.toggle('bottom-sheet-tall', !!(opts && opts.tall));

    // Must happen BEFORE the sheet becomes visible — see _syncViewport.
    OrbitSheet._dismissKeyboard();
    OrbitSheet._syncViewport();
    OrbitSheet._settleViewport();
    OrbitSheet._resetSheetTransform();
    
    content.innerHTML = html;
    content.scrollTop = 0;
    OrbitSheet._addCancelPill();
    OrbitSheet._addCloseButton();
    overlay.classList.add('active');
    if (window.lucide) lucide.createIcons();
    
    if (backdrop) {
      backdrop.onclick = function() { OrbitSheet.hide(); };
    }
    requestAnimationFrame(function() { OrbitSheet._syncScrollHint(); });
  },

  /** Hide bottom sheet */
  hide: function() {
    var overlay = document.getElementById('bottom-sheet-overlay');
    if (!overlay) return;
    // Clear the drag transform FIRST, or it overrides the closed-state CSS and
    // the sheet visibly stays open. See _resetSheetTransform.
    OrbitSheet._resetSheetTransform();
    overlay.classList.remove('active');
  },

  /** Add cancel pill to bottom sheet.
   *  Appended to #bottom-sheet (a flex column) AFTER #bottom-sheet-content, so
   *  it is a pinned footer and always on screen — the content scrolls, the pill
   *  does not. */
  _addCancelPill: function() {
    var existing = document.querySelector('.bottom-sheet-cancel');
    if (existing) existing.remove();
    var sheet = document.getElementById('bottom-sheet');
    if (!sheet) return;
    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'bottom-sheet-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function() { OrbitSheet.hide(); });
    sheet.appendChild(cancelBtn);
  },

  /**
   * Add a close (X) button to the sheet.
   *
   * The Cancel pill lives at the BOTTOM of the sheet, so on a long list — /help
   * carries 19 commands — it sits below the fold and a user who does not think
   * to scroll has no visible way out at all. This puts a dismiss affordance at
   * the top-right, where it is always on screen. Same inline-SVG approach as the
   * player controls: no lucide pass needed, so it cannot be lost to icon timing.
   */
  _addCloseButton: function() {
    var existing = document.querySelector('.bottom-sheet-close');
    if (existing) existing.remove();
    var sheet = document.getElementById('bottom-sheet');
    if (!sheet) return;
    var btn = document.createElement('button');
    btn.className = 'bottom-sheet-close';
    btn.setAttribute('aria-label', 'Close');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';
    btn.addEventListener('click', function(e) { e.stopPropagation(); OrbitSheet.hide(); });
    sheet.appendChild(btn);
  },

  /**
   * Flag whether there is more content below the fold, for the fade affordance.
   *
   * Android WebView renders an overlay scrollbar that is invisible until the
   * content is already being scrolled, so a clipped list looks like it simply
   * ends — which is exactly how /help read. The class drives a mask that fades
   * the last visible line while more remains.
   */
  _syncScrollHint: function() {
    var sheet = document.getElementById('bottom-sheet');
    var content = document.getElementById('bottom-sheet-content');
    if (!sheet || !content) return;
    var max = content.scrollHeight - content.clientHeight;
    var more = (max - content.scrollTop) > 8;
    sheet.classList.toggle('has-more', more);

    // A real, always-visible scroll thumb.
    //
    // Android WebView paints overlay scrollbars that only appear while you are
    // ALREADY scrolling, and styled ::-webkit-scrollbar rules do not change that
    // — so a clipped list gives no hint that it continues. This is an element we
    // position ourselves, sized and moved to match the scroll position, which is
    // what "a slider to scroll and see the other commands" needs.
    var bar = sheet.querySelector('.bottom-sheet-scrollbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'bottom-sheet-scrollbar';
      sheet.appendChild(bar);
    }
    if (max <= 1) {
      bar.style.display = 'none';
      return;
    }
    var track = content.clientHeight;
    var thumb = Math.max(28, Math.round(track * (track / content.scrollHeight)));
    var travel = Math.max(0, track - thumb);
    var progress = max > 0 ? (content.scrollTop / max) : 0;
    bar.style.display = 'block';
    bar.style.height = thumb + 'px';
    bar.style.top = (content.offsetTop + Math.round(travel * progress)) + 'px';
  },

  /** Set callbacks for actions */
  _callbacks: {}
};

// Swipe-down-to-close
(function() {
  var sheet = document.getElementById('bottom-sheet');
  var overlay = document.getElementById('bottom-sheet-overlay');
  if (!sheet || !overlay) return;
  var startY = 0, curY = 0, dragging = false, dragConfirmed = false, startTime = 0;
  var _rafPending = false, _lastDy = 0;

  function canStartDrag(target) {
    // The handle is always a grab. So is the sheet body itself while the list is
    // scrolled to the top: there the gesture cannot scroll (the content has
    // overscroll-behavior: contain and nothing above it), so dragging down
    // closes the sheet instead of doing nothing. Requiring the 4px handle was
    // why the panel read as "not draggable" — the body is the obvious thing to
    // grab. Once the list is scrolled, the body scrolls as normal.
    if (!target || !target.closest) return false;
    if (target.closest('.bottom-sheet-handle')) return true;
    var content = document.getElementById('bottom-sheet-content');
    return !!(content && content.contains(target) && content.scrollTop <= 0);
  }

  function endDrag() {
    if (!dragging) return false;
    dragging = false;
    sheet.style.transition = '';
    sheet.style.willChange = '';
    sheet.style.transform = '';
    return true;
  }

  sheet.addEventListener('touchstart', function (e) {
    if (!overlay.classList.contains('active')) { dragging = false; return; }
    if (!canStartDrag(e.target)) { dragging = false; return; }
    dragging = true;
    dragConfirmed = false;
    startTime = Date.now();
    startY = e.touches[0].clientY;
    curY = startY;
    sheet.style.willChange = 'transform'; // promote to its own layer for the drag
  }, { passive: true });

  sheet.addEventListener('touchmove', function (e) {
    if (!dragging) return;
    var dy = e.touches[0].clientY - startY;

    // Direction is only knowable here, not at touchstart, and the decision has to
    // be made from it: an UPWARD gesture over content that can scroll is a scroll,
    // never a drag. Without this the body-drag (allowed while scrollTop is 0) took
    // over the first swipe of every long list, so the sheet moved with the finger
    // while the list tried to scroll underneath it.
    if (!dragConfirmed) {
      var content = document.getElementById('bottom-sheet-content');
      var canScroll = !!(content && content.scrollHeight > content.clientHeight + 1);
      if (dy < 0 && canScroll) {
        dragging = false;
        sheet.style.willChange = '';
        return;
      }
      dragConfirmed = true;
    }
    if (dy < 0) dy = 0;
    curY = e.touches[0].clientY;
    _lastDy = dy;
    sheet.style.transition = 'none';
    if (_rafPending) return;
    _rafPending = true;
    requestAnimationFrame(function () {
      _rafPending = false;
      sheet.style.transform = 'translate3d(0,' + _lastDy + 'px,0)';
    });
  }, { passive: true });

  sheet.addEventListener('touchend', function () {
    if (!dragging) return;
    var dy = curY - startY;
    var elapsed = Math.max(1, Date.now() - startTime);
    var velocity = dy / elapsed;
    endDrag();
    if (dy > 120 || velocity > 0.5) OrbitSheet.hide();
  });

  // Android cancels the touch stream whenever the WebView takes the gesture over
  // (a scroll, a system edge swipe, the keyboard appearing). Without this the
  // drag never ends, so the sheet keeps the inline transform it was left with
  // and hide() becomes a no-op. Always reset.
  sheet.addEventListener('touchcancel', function () { endDrag(); }, { passive: true });
})();

/* ---- Keep the sheet inside the visible area while the keyboard moves ----
   Sheets that contain their own inputs (the /poll builder, folder rename, …)
   re-open the keyboard as soon as the user taps a field, which would cover the
   sheet again. Re-sync on every visualViewport change while a sheet is open. */
function _resyncWhileOpen() {
  var overlay = document.getElementById('bottom-sheet-overlay');
  if (overlay && overlay.classList.contains('active')) OrbitSheet._syncViewport();
  // Rotating or the keyboard opening changes what fits, so re-evaluate the
  // "more below" fade too.
  OrbitSheet._syncScrollHint();
}

// Both events, because they are not interchangeable on Android. Input-less sheets
// are sized from the layout viewport (`innerHeight`, see _syncViewport), and that
// can change with no visualViewport resize at all — which is the same class of
// unreliability that left /help stuck at a keyboard-sized height. The settle
// timers only cover the first 1.5s after opening, so without this a keyboard that
// hides later would leave the sheet short until it was reopened.
window.addEventListener('resize', _resyncWhileOpen);

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', function () {
    _resyncWhileOpen();
  });
}

/* Re-evaluate the fade as the content scrolls (passive: never blocks scrolling). */
(function () {
  var content = document.getElementById('bottom-sheet-content');
  if (!content) return;
  content.addEventListener('scroll', function () { OrbitSheet._syncScrollHint(); }, { passive: true });
})();

/* ---- Reusable drag-close for bespoke sheets ---- */
OrbitSheet.enableDragClose = function (opts) {
  opts = opts || {};
  var el = opts.sheet;
  if (!el || el.__dragCloseBound) return;
  var onClose = typeof opts.onClose === 'function' ? opts.onClose : function () {};
  el.__dragCloseBound = true;

  // Visible grab affordance, same look as the main sheet's handle.
  if (!el.querySelector('.bottom-sheet-handle')) {
    var h = document.createElement('div');
    h.className = 'bottom-sheet-handle';
    el.insertBefore(h, el.firstChild);
  }

  var startY = 0, curY = 0, dragging = false, startTime = 0;
  var _rafPending = false, _lastDy = 0;

  function canStart(target) {
    return !!(target && target.closest && target.closest('.bottom-sheet-handle'));
  }

  function endDrag() {
    if (!dragging) return false;
    dragging = false;
    el.style.transition = '';
    el.style.willChange = '';
    el.style.transform = '';
    return true;
  }

  el.addEventListener('touchstart', function (e) {
    if (!canStart(e.target)) { dragging = false; return; }
    dragging = true;
    startTime = Date.now();
    startY = e.touches[0].clientY;
    curY = startY;
    el.style.willChange = 'transform'; // promote to its own layer for the drag
  }, { passive: true });

  el.addEventListener('touchmove', function (e) {
    if (!dragging) return;
    var dy = e.touches[0].clientY - startY;
    if (dy < 0) dy = 0;
    curY = e.touches[0].clientY;
    _lastDy = dy;
    el.style.transition = 'none';
    if (_rafPending) return;
    _rafPending = true;
    requestAnimationFrame(function () {
      _rafPending = false;
      el.style.transform = 'translate3d(0,' + _lastDy + 'px,0)';
    });
  }, { passive: true });

  el.addEventListener('touchend', function () {
    if (!dragging) return;
    var dy = curY - startY;
    var elapsed = Math.max(1, Date.now() - startTime);
    var velocity = dy / elapsed;
    endDrag();
    if (dy > 120 || velocity > 0.5) onClose();
  });

  // Same touchcancel leak as the main sheet — reset instead of leaving the
  // element parked at whatever offset the cancelled drag reached.
  el.addEventListener('touchcancel', function () { endDrag(); }, { passive: true });
};
