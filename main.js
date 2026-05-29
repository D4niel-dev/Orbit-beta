const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage, protocol, net } = require('electron');
const path = require('path');
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

protocol.registerSchemesAsPrivileged([
  { scheme: 'orbit-file', privileges: { secure: true, standard: true, supportFetchAPI: true } },
  { scheme: 'orbit-db', privileges: { secure: true, standard: true, supportFetchAPI: true } }
]);

app.whenReady().then(() => {
  protocol.handle('orbit-file', (request) => {
    const urlPath = request.url.replace('orbit-file://', '');
    const decodedPath = decodeURIComponent(urlPath);
    return net.fetch('file:///' + decodedPath);
  });
  protocol.handle('orbit-db', (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname === 'attachment' || url.pathname.startsWith('/attachment/')) {
        const id = url.hostname === 'attachment' ? url.pathname.slice(1) : url.pathname.replace('/attachment/', '');
        return new Promise((resolve) => {
          if (globalDb) {
            const att = globalDb.getAttachment(id);
            if (att && att.data) {
              resolve(new Response(att.data, {
                headers: { 'Content-Type': att.type || 'application/octet-stream' }
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

  // Init DB
  globalDb = new OrbitDatabase(app.getPath('userData'));

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
  ipcMain.on('db-get-setting', (event, key, def) => {
    event.returnValue = globalDb.getSetting(key, def);
  });
  ipcMain.on('db-set-setting', (event, key, val) => {
    globalDb.setSetting(key, val);
    event.returnValue = true;
  });


  // Networking IPC
  ipcMain.on('network-start', (event, identity) => {
    currentIdentity = identity;
    
    if (!socketInstance) {
      socketInstance = new SocketManager(() => currentIdentity);
      transferInstance = new TransferManager(socketInstance);
      
      socketInstance.on('message', (packet) => {
        if (packet.type === Protocol.Types.FILE_CHUNK) {
          transferInstance.handleChunk(packet, (savedPath, fileName) => {
             mainWindow.webContents.send('file-received', { path: savedPath, name: fileName, sender: packet.from });
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

  ipcMain.on('network-send', (event, toPeerId, toIp, type, payload) => {
    if (socketInstance) {
      const success = socketInstance.sendMessage(toPeerId, toIp, type, payload);
      event.returnValue = success;
    } else {
      event.returnValue = false;
    }
  });

  ipcMain.handle('network-send-file', async (event, toPeerId, toIp, filePath) => {
    if (transferInstance) {
      try {
        const fileId = await transferInstance.sendFile(toPeerId, toIp, filePath);
        return fileId;
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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
