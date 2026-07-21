// mobile/src/js/components/bottom-sheet.js
// v0.2.8 — Bottom Sheet System

var OrbitSheet = {
  /** Show a bottom sheet with items (icon left, label right) */
  show: function(items) {
    var overlay = document.getElementById('bottom-sheet-overlay');
    var content = document.getElementById('bottom-sheet-content');
    var backdrop = document.getElementById('bottom-sheet-backdrop');
    
    if (!overlay || !content) return;
    
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
