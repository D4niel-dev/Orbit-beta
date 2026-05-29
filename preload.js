const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orbitAPI', {
  send:     (channel, data)   => ipcRenderer.send(channel, data),
  sendSync: (channel, ...args)=> ipcRenderer.sendSync(channel, ...args),
  on:       (channel, cb)     => ipcRenderer.on(channel, (e, data) => cb(data)),
  invoke:   (channel, data)   => ipcRenderer.invoke(channel, data),
  platform: process.platform,
  version:  process.env.npm_package_version ?? '1.0.0',
  
  // Storage & SysInfo
  storeGet: (key) => ipcRenderer.sendSync('store-get', key),
  storeSet: (key, val) => ipcRenderer.sendSync('store-set', key, val),
  storeDelete: (key) => ipcRenderer.sendSync('store-delete', key),
  getHostname: () => ipcRenderer.sendSync('get-hostname'),
  getUuid: () => ipcRenderer.sendSync('get-uuid'),
  
  // Networking
  networkStart: (identity) => ipcRenderer.sendSync('network-start', identity),
  networkSend: (toPeerId, toIp, type, payload) => ipcRenderer.sendSync('network-send', toPeerId, toIp, type, payload),
  networkSendFile: (toPeerId, toIp, filePath) => ipcRenderer.invoke('network-send-file', toPeerId, toIp, filePath),

  // OS Integration
  showNotification: (title, body) => ipcRenderer.send('show-notification', title, body),

  // Database
  dbGetLocalUser: () => ipcRenderer.sendSync('db-get-local-user'),
  dbGetUser: (userId) => ipcRenderer.sendSync('db-get-user', userId),
  dbSaveUser: (user) => ipcRenderer.sendSync('db-save-user', user),
  dbGetFriends: () => ipcRenderer.sendSync('db-get-friends'),
  dbSaveFriend: (friend) => ipcRenderer.sendSync('db-save-friend', friend),
  dbGetMessages: (chatId) => ipcRenderer.sendSync('db-get-messages', chatId),
  dbAllMessagesRaw: () => ipcRenderer.sendSync('db-all-messages-raw'),
  dbAddMessage: (chatId, msg) => ipcRenderer.sendSync('db-add-message', chatId, msg),
  dbDeleteMessage: (chatId, msgId) => ipcRenderer.sendSync('db-delete-message', chatId, msgId),
  dbSaveAttachment: (msgId, attachment) => ipcRenderer.sendSync('db-save-attachment', msgId, attachment),
  dbGetAttachment: (attachmentId) => ipcRenderer.sendSync('db-get-attachment', attachmentId),
  dbGetSetting: (key, def) => ipcRenderer.sendSync('db-get-setting', key, def),
  dbSetSetting: (key, val) => ipcRenderer.sendSync('db-set-setting', key, val)
});
