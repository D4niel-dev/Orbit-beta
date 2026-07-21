// mobile/src/js/components/navigation.js
// v0.2.8 — Navigation Helpers (panel open/close only, no bottom nav conflicts)

var OrbitNav = {
  _currentHomeTab: 'friends',

  /** Open chat panel (slide in) */
  openChat: function() {
    var panel = document.getElementById('panel-chat');
    if (panel) {
      panel.classList.add('open');
      var nav = document.getElementById('mobile-nav');
      if (nav) nav.classList.add('nav-hidden');
    }
    var pill = document.getElementById('profile-pill');
    if (pill) { pill.style.opacity = '0'; pill.style.pointerEvents = 'none'; }
  },

  /** Close chat panel (slide out) */
  closeChat: function() {
    var panel = document.getElementById('panel-chat');
    if (panel) {
      panel.classList.remove('open');
      var nav = document.getElementById('mobile-nav');
      if (nav) nav.classList.remove('nav-hidden');
    }
    var pill = document.getElementById('profile-pill');
    if (pill) { pill.style.opacity = ''; pill.style.pointerEvents = ''; }
  },

  /** Show bottom sheet */
  showBottomSheet: function() {
    var overlay = document.getElementById('bottom-sheet-overlay');
    if (overlay) overlay.classList.add('active');
  },

  /** Hide bottom sheet */
  hideBottomSheet: function() {
    var overlay = document.getElementById('bottom-sheet-overlay');
    if (overlay) overlay.classList.remove('active');
  }
};
