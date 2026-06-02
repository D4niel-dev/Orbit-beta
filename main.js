const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const Store = require('electron-store');
const Discovery = require('./src/js/network/discovery');
const SocketManager = require('./src/js/network/socket');
const TransferManager = require('./src/js/network/transfer');
const Protocol = require('./src/js/network/protocol');
const OrbitDatabase = require('./src/js/database/database');

const persistentStore = new Store();
let globalDb = null;
let discoveryInstance = null;
let socketInstance = null;
let transferInstance = null;
let currentIdentity = null;
let mainWindow = null;
let tray = null;
let tempDirPath = null;

protocol.registerSchemesAsPrivileged([
  { scheme: 'orbit-file', privileges: { secure: true, standard: true, supportFetchAPI: true } },
  { scheme: 'orbit-db', privileges: { secure: true, standard: true, supportFetchAPI: true } },
  { scheme: 'orbit-avatar', privileges: { secure: true, standard: true, supportFetchAPI: true } }
]);

app.whenReady().then(() => {
  protocol.handle('orbit-file', (request) => {
    const urlPath = request.url.replace('orbit-file://', '');
    const decodedPath = decodeURIComponent(urlPath).replace(/\\/g, '/');
    return net.fetch('file:///' + decodedPath);
  });
  protocol.handle('orbit-db', (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname === 'thumbnail' || url.pathname.startsWith('/thumbnail/')) {
        const id = url.hostname === 'thumbnail' ? url.pathname.slice(1) : url.pathname.replace('/thumbnail/', '');
        return new Promise((resolve) => {
          if (globalDb) {
            const att = globalDb.getAttachmentThumbnail(id);
            if (att && att.thumbnail && att.thumbnail.length > 0) {
              resolve(new Response(att.thumbnail, {
                headers: { 'Content-Type': 'image/webp' }
              }));
              return;
            } else if (att && att.data && att.data.length > 0) {
              // Fallback to original image if no thumbnail yet
              resolve(new Response(att.data, {
                headers: { 'Content-Type': att.type || 'application/octet-stream' }
              }));
              return;
            } else if (att && att.localPath && fs.existsSync(att.localPath)) {
              // Fallback for privacy mode: serve from filesystem
              resolve(net.fetch('file:///' + att.localPath.replace(/\\/g, '/')).then(r => {
                return new Response(r.body, {
                  headers: { 'Content-Type': att.type || 'application/octet-stream' }
                });
              }));
              return;
            }
          }
          resolve(new Response(null, { status: 404 }));
        });
      }

      if (url.hostname === 'attachment' || url.pathname.startsWith('/attachment/')) {
        const id = url.hostname === 'attachment' ? url.pathname.slice(1) : url.pathname.replace('/attachment/', '');
        return new Promise((resolve) => {
          if (globalDb) {
            const att = globalDb.getAttachment(id);
            if (att && att.data && att.data.length > 0) {
              resolve(new Response(att.data, {
                headers: { 'Content-Type': att.type || 'application/octet-stream' }
              }));
              return;
            }
            // Fallback: serve from localPath (privacy mode temp files)
            if (att && att.localPath && fs.existsSync(att.localPath)) {
              resolve(net.fetch('file:///' + att.localPath.replace(/\\/g, '/')).then(r => {
                return new Response(r.body, {
                  headers: { 'Content-Type': att.type || 'application/octet-stream' }
                });
              }));
              return;
            }
          }
          resolve(new Response(null, { status: 404 }));
        });
      }
    } catch (e) {
      return new Response(null, { status: 404 });
    }
    return new Response(null, { status: 404 });
  });
  protocol.handle('orbit-avatar', (request) => {
    try {
      const groupId = request.url.replace('orbit-avatar://', '').split('/')[0];
      return new Promise((resolve) => {
        if (globalDb) {
          const group = globalDb.getGroup(groupId);
          if (group && group.avatarPath && fs.existsSync(group.avatarPath)) {
            resolve(net.fetch('file:///' + group.avatarPath.replace(/\\/g, '/')).then(r => {
              return new Response(r.body, { headers: { 'Content-Type': 'image/webp' } });
            }));
            return;
          }
        }
        resolve(new Response(null, { status: 404 }));
      });
    } catch (e) {
      return new Response(null, { status: 404 });
    }
  });

  // Init DB
  globalDb = new OrbitDatabase(app.getPath('userData'));
  tempDirPath = path.join(app.getPath('userData'), 'temp');

  // Ensure avatars directory exists
  const avatarDirPath = path.join(app.getPath('userData'), 'avatars');
  if (!fs.existsSync(avatarDirPath)) {
    fs.mkdirSync(avatarDirPath, { recursive: true });
  }
  if (!fs.existsSync(tempDirPath)) {
    fs.mkdirSync(tempDirPath, { recursive: true });
  }

  // Periodic temp dir cleanup for orphaned files (every hour)
  setInterval(() => {
    if (globalDb && tempDirPath && fs.existsSync(tempDirPath)) {
      const settings = globalDb.getSetting('settings', {});
      if (settings.privacyMode === true) {
        // In privacy mode, clean temp files that aren't referenced by active sessions
        try {
          const files = fs.readdirSync(tempDirPath);
          const maxAge = 24 * 60 * 60 * 1000; // 24 hours
          const now = Date.now();
          files.forEach(f => {
            const filePath = path.join(tempDirPath, f);
            const stat = fs.statSync(filePath);
            if (now - stat.mtimeMs > maxAge) {
              fs.unlinkSync(filePath);
            }
          });
        } catch(e) { /* ignore cleanup errors */ }
      }
    }
  }, 3600000);

  // Start background attachment cleanup
  setInterval(() => {
    if (globalDb) {
      const settings = globalDb.getSetting('settings', {});
      let cleanupMinutes = 0; // Default to Never
      if (settings.deleteAttachmentsAfter !== undefined && settings.deleteAttachmentsAfter !== null) {
        cleanupMinutes = settings.deleteAttachmentsAfter;
      }
      if (cleanupMinutes > 0) {
        globalDb.cleanupOldAttachments(cleanupMinutes);
      }
    }
  }, 60000); // Check every minute

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 860,
    minHeight: 600,
    frame: false,          // Custom titlebar
    transparent: true,
    backgroundColor: '#0E0F14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'src/icons/app/orbit.ico'),
    titleBarStyle: 'hidden',
  });
  mainWindow.loadFile('src/index.html');
  mainWindow.maximize();

  // Handle window controls
  ipcMain.on('window-controls', (event, action) => {
    if (action === 'minimize') mainWindow.minimize();
    if (action === 'maximize') {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
    if (action === 'close') {
      // By default, just hide to tray
      mainWindow.hide();
    }
  });

  // Tray Setup
  const iconPath = path.join(__dirname, 'src/icons/app/orbit.ico');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Orbit', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Quit Orbit', click: () => app.quit() }
  ]);
  tray.setToolTip('Orbit');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });

  // Notification Handler
  ipcMain.on('show-notification', (event, title, body) => {
    if (Notification.isSupported()) {
      const notif = new Notification({ title, body, icon });
      notif.on('click', () => {
        if (mainWindow) {
           if (mainWindow.isMinimized()) mainWindow.restore();
           mainWindow.show();
        }
      });
      notif.show();
    }
  });

  // Handle storage and system info synchronously
  ipcMain.on('store-get', (event, key) => {
    event.returnValue = persistentStore.get(key);
  });
  ipcMain.on('store-set', (event, key, val) => {
    persistentStore.set(key, val);
    event.returnValue = true;
  });
  ipcMain.on('store-delete', (event, key) => {
    persistentStore.delete(key);
    event.returnValue = true;
  });
  ipcMain.on('get-hostname', (event) => {
    event.returnValue = os.hostname();
  });
  ipcMain.on('get-uuid', (event) => {
    event.returnValue = uuidv4();
  });

  // Database IPC
  ipcMain.on('db-get-local-user', (event) => {
    event.returnValue = globalDb.getLocalUser();
  });
  ipcMain.on('db-get-user', (event, userId) => {
    event.returnValue = globalDb.getUser(userId);
  });
  ipcMain.on('db-save-user', (event, user) => {
    globalDb.saveUser(user);
    event.returnValue = true;
  });
  ipcMain.on('db-get-friends', (event) => {
    event.returnValue = globalDb.getFriends();
  });
  ipcMain.on('db-save-friend', (event, friend) => {
    globalDb.saveFriend(friend);
    event.returnValue = true;
  });
  ipcMain.on('db-get-messages', (event, chatId) => {
    event.returnValue = globalDb.getMessages(chatId);
  });
  ipcMain.on('db-all-messages-raw', (event) => {
    event.returnValue = globalDb.getAllMessagesRaw();
  });
  ipcMain.on('db-add-message', (event, chatId, msg) => {
    globalDb.addMessage(chatId, msg);
    event.returnValue = true;
  });
  ipcMain.on('db-delete-message', (event, chatId, msgId) => {
    globalDb.deleteMessage(chatId, msgId);
    event.returnValue = true;
  });
  ipcMain.on('db-save-attachment', (event, msgId, attachment) => {
    event.returnValue = globalDb.saveAttachment(msgId, attachment);
  });
  ipcMain.on('db-get-attachment', (event, attachmentId) => {
    event.returnValue = globalDb.getAttachment(attachmentId);
  });
  ipcMain.on('db-delete-attachment', (event, attachmentId) => {
    globalDb.stmts.deleteAttachment.run(attachmentId);
    event.returnValue = true;
  });
  ipcMain.on('db-edit-message', (event, chatId, msgId, newText) => {
    globalDb.editMessage(chatId, msgId, newText);
    event.returnValue = true;
  });
  ipcMain.on('db-delete-message', (event, chatId, msgId) => {
    globalDb.deleteMessage(chatId, msgId);
    event.returnValue = true;
  });
  ipcMain.on('db-clear-attachments', (event) => {
    globalDb.clearAllAttachments();
    event.returnValue = true;
  });
  ipcMain.on('db-get-setting', (event, key, def) => {
    event.returnValue = globalDb.getSetting(key, def);
  });
  ipcMain.on('db-set-setting', (event, key, val) => {
    globalDb.setSetting(key, val);
    event.returnValue = true;
  });

  // Group IPC
  ipcMain.on('db-get-groups', (event) => {
    event.returnValue = globalDb.getGroups();
  });
  ipcMain.on('db-get-group', (event, groupId) => {
    event.returnValue = globalDb.getGroup(groupId);
  });
  ipcMain.on('db-save-group', (event, group) => {
    globalDb.saveGroup(group);
    event.returnValue = true;
  });
  ipcMain.on('db-add-group-member', (event, groupId, user) => {
    globalDb.addGroupMember(groupId, user);
    event.returnValue = true;
  });
  ipcMain.on('db-remove-group-member', (event, groupId, userId) => {
    globalDb.removeGroupMember(groupId, userId);
    event.returnValue = true;
  });
  ipcMain.on('db-get-group-members', (event, groupId) => {
    event.returnValue = globalDb.getGroupMembers(groupId);
  });
  ipcMain.on('db-delete-group', (event, groupId) => {
    globalDb.deleteGroup(groupId);
    event.returnValue = true;
  });
  ipcMain.on('db-update-group-field', (event, groupId, field, value) => {
    globalDb.updateGroupField(groupId, field, value);
    event.returnValue = true;
  });
  ipcMain.on('db-get-group-by-invite', (event, code) => {
    event.returnValue = globalDb.getGroupByInviteCode(code);
  });
  ipcMain.handle('save-avatar', async (event, groupId, base64Data) => {
    try {
      const avatarDirPath = path.join(app.getPath('userData'), 'avatars');
      const filePath = path.join(avatarDirPath, groupId + '.webp');
      const buf = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(filePath, buf);
      if (globalDb) globalDb.updateGroupField(groupId, 'avatarUpdatedAt', Date.now());
      return filePath;
    } catch (e) {
      return null;
    }
  });

  // Networking IPC
  ipcMain.on('network-start', (event, identity) => {
    currentIdentity = identity;
    
    if (!socketInstance) {
      socketInstance = new SocketManager(() => currentIdentity);
      transferInstance = new TransferManager(socketInstance);
      
      transferInstance.onProgress = (fileId, progressData) => {
        if (mainWindow) {
          mainWindow.webContents.send('transfer-progress', { fileId, ...progressData });
        }
      };
      
      socketInstance.on('message', (packet) => {
        if (packet.type === Protocol.Types.FILE_TRANSFER_START) {
          transferInstance.handleStart(packet);
        } else if (packet.type === Protocol.Types.FILE_CHUNK) {
          transferInstance.handleChunk(packet);
        } else if (packet.type === Protocol.Types.FILE_TRANSFER_END) {
          transferInstance.handleEnd(packet, (savedPath, fileName, fileId, fileSize) => {
             mainWindow.webContents.send('file-received', { path: savedPath, name: fileName, sender: packet.from, fileId: fileId, size: fileSize });
          }, (errorMsg) => {
             console.error('File Transfer Error:', errorMsg);
          });
        } else {
          mainWindow.webContents.send('network-message', packet);
        }
      });
      
      socketInstance.startServer();
    }
    
    if (!discoveryInstance) {
      discoveryInstance = new Discovery(() => currentIdentity, (peer) => {
        mainWindow.webContents.send('peer-found', peer);
      });
      discoveryInstance.start();
    }
    event.returnValue = true;
  });

  ipcMain.on('network-connect', (event, ip) => {
    if (socketInstance) {
      socketInstance.connectToPeer('manual', ip, 46000);
    }
  });

  ipcMain.on('network-send', (event, toPeerId, toIp, type, payload) => {
    if (socketInstance) {
      const success = socketInstance.sendMessage(toPeerId, toIp, type, payload);
      event.returnValue = success;
    } else {
      event.returnValue = false;
    }
  });

  ipcMain.handle('network-send-file', async (event, toPeerId, toIp, filePath, fileName) => {
    if (transferInstance) {
      try {
        const fid = await transferInstance.sendFile(toPeerId, toIp, filePath, fileName);
        return fid;
      } catch (e) {
        throw e;
      }
    }
    throw new Error('Network not started');
  });
});

app.on('before-quit', () => {
  if (discoveryInstance) discoveryInstance.stop();
  if (socketInstance) socketInstance.stop();
  // Clean up privacy mode temp directory
  if (tempDirPath && fs.existsSync(tempDirPath)) {
    try {
      fs.rmSync(tempDirPath, { recursive: true, force: true });
    } catch(e) {
      console.error('Failed to clean up temp directory:', e.message);
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
