// shared/database/sqlite-desktop.js
// Desktop database implementation — wraps window.orbitAPI IPC calls

window.Orbit = window.Orbit || {};

Orbit.DesktopDatabase = function() {
  this.api = window.orbitAPI;
};

Orbit.DesktopDatabase.prototype.getLocalUser = function() {
  return this.api ? this.api.dbGetLocalUser() : null;
};

Orbit.DesktopDatabase.prototype.saveUser = function(user) {
  if (this.api) this.api.dbSaveUser(user);
};

Orbit.DesktopDatabase.prototype.getFriends = function() {
  return this.api ? this.api.dbGetFriends() : [];
};

Orbit.DesktopDatabase.prototype.saveFriend = function(friend) {
  if (this.api) this.api.dbSaveFriend(friend);
};

Orbit.DesktopDatabase.prototype.removeFriend = function(userId) {
  if (this.api) this.api.dbRemoveFriend(userId);
};

Orbit.DesktopDatabase.prototype.getMessages = function(chatId) {
  return this.api ? this.api.dbGetMessages(chatId) : [];
};

Orbit.DesktopDatabase.prototype.addMessage = function(chatId, msg) {
  if (this.api) this.api.dbAddMessage(chatId, msg);
};

Orbit.DesktopDatabase.prototype.getGroups = function() {
  return this.api ? this.api.dbGetGroups() : [];
};

Orbit.DesktopDatabase.prototype.saveGroup = function(group) {
  if (this.api) this.api.dbSaveGroup(group);
};

Orbit.DesktopDatabase.prototype.getSetting = function(key, defaultValue) {
  return this.api ? this.api.dbGetSetting(key, defaultValue) : defaultValue;
};

Orbit.DesktopDatabase.prototype.saveSetting = function(key, value) {
  if (this.api) this.api.dbSaveSetting(key, value);
};
