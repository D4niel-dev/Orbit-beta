// shared/database/sqlite-mobile.js
// Mobile database implementation — uses @capacitor-community/sqlite
// TODO: Fully implement for Android in Phase 5

window.Orbit = window.Orbit || {};

Orbit.MobileDatabase = function() {
  this.initialized = false;
};

Orbit.MobileDatabase.prototype.init = async function() {
  try {
    // Will use Capacitor SQLite plugin
    // const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
    console.log('[Orbit.MobileDatabase] init called');
    this.initialized = true;
    return true;
  } catch(e) {
    console.error('[Orbit.MobileDatabase] init error:', e);
    return false;
  }
};

Orbit.MobileDatabase.prototype.getLocalUser = function() {
  return null; // TODO
};

Orbit.MobileDatabase.prototype.saveUser = function(user) {
  // TODO
};

Orbit.MobileDatabase.prototype.getFriends = function() {
  return []; // TODO
};

Orbit.MobileDatabase.prototype.saveFriend = function(friend) {
  // TODO
};

Orbit.MobileDatabase.prototype.getMessages = function(chatId) {
  return []; // TODO
};

Orbit.MobileDatabase.prototype.addMessage = function(chatId, msg) {
  // TODO
};

Orbit.MobileDatabase.prototype.getGroups = function() {
  return []; // TODO
};

Orbit.MobileDatabase.prototype.saveGroup = function(group) {
  // TODO
};

Orbit.MobileDatabase.prototype.getSetting = function(key, defaultValue) {
  return defaultValue; // TODO
};

Orbit.MobileDatabase.prototype.saveSetting = function(key, value) {
  // TODO
};
