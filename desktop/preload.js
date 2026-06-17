const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orbitAPI', {
  send:     (channel, data)   => ipcRenderer.send(channel, data),
  sendSync: (channel, ...args)=> ipcRenderer.sendSync(channel, ...args),
  on:       (channel, cb)     => ipcRenderer.on(channel, (e, data) => cb(data)),
  invoke:   (channel, data)   => ipcRenderer.invoke(channel, data),
  platform: process.platform,
  version:  process.env.npm_package_version ?? '0.1.2-beta',
  electronVersion: process.versions.electron,
  nodeVersion: process.versions.node,
  
  // Storage & SysInfo
  storeGet: (key) => ipcRenderer.sendSync('store-get', key),
  storeSet: (key, val) => ipcRenderer.sendSync('store-set', key, val),
  storeDelete: (key) => ipcRenderer.sendSync('store-delete', key),
  getHostname: () => ipcRenderer.sendSync('get-hostname'),
  getUuid: () => ipcRenderer.sendSync('get-uuid'),
  
  // Networking
  networkStart: (identity) => ipcRenderer.sendSync('network-start', identity),
  networkSend: (toPeerId, toIp, type, payload) => ipcRenderer.sendSync('network-send', toPeerId, toIp, type, payload),
  networkSendFile: (toPeerId, toIp, filePath, fileName) => ipcRenderer.invoke('network-send-file', toPeerId, toIp, filePath, fileName),
  connect: (ip) => ipcRenderer.send('network-connect', ip),
  cancelTransfer: (fileId) => ipcRenderer.send('cancel-transfer', fileId),
  checkDiskSpace: () => ipcRenderer.invoke('check-disk-space'),

  // OS Integration
  showNotification: (title, body) => ipcRenderer.send('show-notification', title, body),
  toggleDevtools: () => ipcRenderer.send('toggle-devtools'),
  writeClipboard: (text) => ipcRenderer.sendSync('write-clipboard', text),

  // E2EE
  e2eeGetPublicKey: () => ipcRenderer.sendSync('e2ee-get-public-key'),
  e2eeEncrypt: (plaintext, peerPublicKey) => ipcRenderer.sendSync('e2ee-encrypt', plaintext, peerPublicKey),
  e2eeDecrypt: (ciphertext, peerPublicKey) => ipcRenderer.sendSync('e2ee-decrypt', ciphertext, peerPublicKey),

  // Database
  dbGetAllStartupData: () => ipcRenderer.sendSync('db-get-all-startup-data'),
  dbGetLocalUser: () => ipcRenderer.sendSync('db-get-local-user'),
  dbGetUser: (userId) => ipcRenderer.sendSync('db-get-user', userId),
  dbSaveUser: (user) => ipcRenderer.sendSync('db-save-user', user),
  dbGetFriends: () => ipcRenderer.sendSync('db-get-friends'),
  dbSaveFriend: (friend) => ipcRenderer.sendSync('db-save-friend', friend),
  dbGetMessages: (chatId) => ipcRenderer.sendSync('db-get-messages', chatId),
  dbAllMessagesRaw: () => ipcRenderer.sendSync('db-all-messages-raw'),
  dbAddMessage: (chatId, msg) => ipcRenderer.sendSync('db-add-message', chatId, msg),
  dbDeleteMessage: (chatId, msgId) => ipcRenderer.sendSync('db-delete-message', chatId, msgId),
  dbEditMessage: (chatId, msgId, newText) => ipcRenderer.sendSync('db-edit-message', chatId, msgId, newText),
  dbSaveAttachment: (msgId, attachment) => ipcRenderer.sendSync('db-save-attachment', msgId, attachment),
  dbGetAttachment: (attachmentId) => ipcRenderer.sendSync('db-get-attachment', attachmentId),
  dbDeleteAttachment: (attachmentId) => ipcRenderer.sendSync('db-delete-attachment', attachmentId),
  dbClearAttachments: () => ipcRenderer.sendSync('db-clear-attachments'),
  dbGetSetting: (key, def) => ipcRenderer.sendSync('db-get-setting', key, def),
  dbSetSetting: (key, val) => ipcRenderer.sendSync('db-set-setting', key, val),
  dbHealthCheck: () => ipcRenderer.sendSync('db-health-check'),
  dbRepair: () => ipcRenderer.sendSync('db-repair'),
  backupCreate: (format) => ipcRenderer.invoke('backup-create', format),
  backupRestore: () => ipcRenderer.invoke('backup-restore'),
  backupValidate: (filePath) => ipcRenderer.invoke('backup-validate', filePath),

  // Groups
  dbGetGroups: () => ipcRenderer.sendSync('db-get-groups'),
  dbGetGroup: (groupId) => ipcRenderer.sendSync('db-get-group', groupId),
  dbSaveGroup: (group) => ipcRenderer.sendSync('db-save-group', group),
  dbAddGroupMember: (groupId, user) => ipcRenderer.sendSync('db-add-group-member', groupId, user),
  dbRemoveGroupMember: (groupId, userId) => ipcRenderer.sendSync('db-remove-group-member', groupId, userId),
  dbGetGroupMembers: (groupId) => ipcRenderer.sendSync('db-get-group-members', groupId),
  dbSetMemberRole: (groupId, userId, role) => ipcRenderer.sendSync('db-set-member-role', groupId, userId, role),
  dbDeleteGroup: (groupId) => ipcRenderer.sendSync('db-delete-group', groupId),
  dbDeleteFriend: (userId) => ipcRenderer.sendSync('db-delete-friend', userId),
  dbUpdateGroupField: (groupId, field, value) => ipcRenderer.sendSync('db-update-group-field', groupId, field, value),
  dbGetGroupByInvite: (code) => ipcRenderer.sendSync('db-get-group-by-invite', code),
  saveAvatar: (groupId, base64Data) => ipcRenderer.invoke('save-avatar', groupId, base64Data),

  // Read State
  dbGetReadState: (chatId) => ipcRenderer.sendSync('db-get-read-state', chatId),
  dbSetReadState: (chatId, lastReadMsgId) => ipcRenderer.sendSync('db-set-read-state', chatId, lastReadMsgId),
  dbAddMention: (chatId, msgId, senderId) => ipcRenderer.sendSync('db-add-mention', chatId, msgId, senderId),
  dbGetMentions: (chatId) => ipcRenderer.sendSync('db-get-mentions', chatId),
  dbClearMentions: (chatId) => ipcRenderer.sendSync('db-clear-mentions', chatId)
});
