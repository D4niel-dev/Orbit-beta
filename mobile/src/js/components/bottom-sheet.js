// mobile/src/js/components/bottom-sheet.js
// v0.2.8 — Bottom Sheet System

var OrbitSheet = {
  /**
   * Keep the overlay inside the VISIBLE area.
   *
   * `.bottom-sheet-overlay` is `position: fixed; top: 0; bottom: 0`, which
   * resolves against the LAYOUT viewport. Android does not shrink that when the
   * soft keyboard opens — the keyboard simply overlays it — so a bottom-anchored
   * sheet renders BEHIND the keyboard and the user sees nothing at all.
   * `visualViewport` tracks the genuinely visible region, so we size to that.
   */
  _syncViewport: function() {
    var overlay = document.getElementById('bottom-sheet-overlay');
    if (!overlay) return;
    var vv = window.visualViewport;
    if (!vv || !vv.height) { overlay.style.height = ''; return; }
    overlay.style.height = vv.height + 'px';
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

  /** Show a bottom sheet with items (icon left, label right) */
  show: function(items) {
    var overlay = document.getElementById('bottom-sheet-overlay');
    var content = document.getElementById('bottom-sheet-content');
    var backdrop = document.getElementById('bottom-sheet-backdrop');
    
    if (!overlay || !content) return;

    OrbitSheet._dismissKeyboard();
    OrbitSheet._syncViewport();
    
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
    
    // Add cancel pill
    OrbitSheet._addCancelPill();
    
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
  },

  /** Show a bottom sheet with custom HTML content */
  showCustom: function(html) {
    var overlay = document.getElementById('bottom-sheet-overlay');
    var content = document.getElementById('bottom-sheet-content');
    var backdrop = document.getElementById('bottom-sheet-backdrop');
    if (!overlay || !content) return;

    // Must happen BEFORE the sheet becomes visible — see _syncViewport.
    OrbitSheet._dismissKeyboard();
    OrbitSheet._syncViewport();
    
    content.innerHTML = html;
    OrbitSheet._addCancelPill();
    overlay.classList.add('active');
    if (window.lucide) lucide.createIcons();
    
    if (backdrop) {
      backdrop.onclick = function() { OrbitSheet.hide(); };
    }
  },

  /** Hide bottom sheet */
  hide: function() {
    var overlay = document.getElementById('bottom-sheet-overlay');
    if (overlay) overlay.classList.remove('active');
  },

  /** Add cancel pill to bottom sheet */
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

  /** Set callbacks for actions */
  _callbacks: {}
};

// Swipe-down-to-close
(function() {
  var sheet = document.getElementById('bottom-sheet');
  var overlay = document.getElementById('bottom-sheet-overlay');
  if (!sheet || !overlay) return;
  var startY = 0, curY = 0, dragging = false, startTime = 0;
  var _rafPending = false, _lastDy = 0;

  function canStartDrag(target) {
    // Handle-only grabbing: dragging anywhere else conflicts with content
    // scrolling and horizontal swipes.
    return !!(target && target.closest && target.closest('.bottom-sheet-handle'));
  }

  sheet.addEventListener('touchstart', function (e) {
    if (!overlay.classList.contains('active')) { dragging = false; return; }
    if (!canStartDrag(e.target)) { dragging = false; return; }
    dragging = true;
    startTime = Date.now();
    startY = e.touches[0].clientY;
    curY = startY;
    sheet.style.willChange = 'transform'; // promote to its own layer for the drag
  }, { passive: true });

  sheet.addEventListener('touchmove', function (e) {
    if (!dragging) return;
    var dy = e.touches[0].clientY - startY;
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
    dragging = false;
    var dy = curY - startY;
    var elapsed = Math.max(1, Date.now() - startTime);
    var velocity = dy / elapsed;
    sheet.style.transition = '';
    sheet.style.willChange = '';
    sheet.style.transform = '';
    if (dy > 120 || velocity > 0.5) OrbitSheet.hide();
  });
})();

/* ---- Keep the sheet inside the visible area while the keyboard moves ----
   Sheets that contain their own inputs (the /poll builder, folder rename, …)
   re-open the keyboard as soon as the user taps a field, which would cover the
   sheet again. Re-sync on every visualViewport change while a sheet is open. */
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', function () {
    var overlay = document.getElementById('bottom-sheet-overlay');
    if (overlay && overlay.classList.contains('active')) OrbitSheet._syncViewport();
  });
}

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
    dragging = false;
    var dy = curY - startY;
    var elapsed = Math.max(1, Date.now() - startTime);
    var velocity = dy / elapsed;
    el.style.transition = '';
    el.style.willChange = '';
    el.style.transform = '';
    if (dy > 120 || velocity > 0.5) onClose();
  });
};
