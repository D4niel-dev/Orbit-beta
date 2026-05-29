// src/js/utils/storage.js

window.Storage = {
  get(key, defaultValue = null) {
    if (window.orbitAPI) {
      const val = window.orbitAPI.storeGet(key);
      return val !== undefined && val !== null ? val : defaultValue;
    }
    // Fallback to localStorage for browser dev
    const val = localStorage.getItem(key);
    if (val) {
      try { return JSON.parse(val); } catch(e) { return val; }
    }
    return defaultValue;
  },

  set(key, value) {
    if (window.orbitAPI) {
      window.orbitAPI.storeSet(key, value);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  },

  remove(key) {
    if (window.orbitAPI) {
      window.orbitAPI.storeDelete(key);
    } else {
      localStorage.removeItem(key);
    }
  }
};
