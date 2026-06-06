// shared/core/env.js
// Runtime environment detection — works in Electron, Capacitor, and browser

window.Orbit = window.Orbit || {};

Orbit.env = (function() {
  var hasElectronAPI = typeof window.orbitAPI !== 'undefined' && window.orbitAPI !== null;
  var hasCapacitor = typeof window.Capacitor !== 'undefined' && window.Capacitor !== null;
  var isElectron = hasElectronAPI;
  var isAndroid = hasCapacitor && window.Capacitor.getPlatform() === 'android';
  var isIOS = hasCapacitor && window.Capacitor.getPlatform() === 'ios';
  var isMobile = isAndroid || isIOS || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  var isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  return {
    isElectron: isElectron,
    isAndroid: isAndroid,
    isIOS: isIOS,
    isMobile: isMobile,
    isTouchDevice: isTouchDevice,
    hasElectronAPI: hasElectronAPI,
    hasCapacitor: hasCapacitor,
    platform: isElectron ? 'electron' : (isAndroid ? 'android' : (isIOS ? 'ios' : 'web'))
  };
})();
