const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage, protocol, net, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const tcpNet = require('net');
const crypto = require('crypto');
const { exec } = require('child_process');
const uuidv4 = () => crypto.randomUUID();

function tryAddFirewallRule() {
  if (process.platform !== 'win32') return;
  const ruleName = 'Orbit P2P Discovery (UDP 45678)';
  exec('netsh advfirewall firewall show rule name="' + ruleName + '"', function(err, stdout) {
    if (err || !stdout.includes(ruleName)) {
      exec('netsh advfirewall firewall add rule name="' + ruleName + '" dir=in protocol=udp localport=45678 action=allow program="' + process.execPath.replace(/\\/g, '\\\\') + '"', function(addErr) {
        if (addErr) {
          console.log('[Firewall] Could not add rule (not running as admin). Run this to enable LAN discovery:');
          console.log('[Firewall]   netsh advfirewall firewall add rule name="Orbit P2P Discovery" dir=in protocol=udp localport=45678 action=allow program="' + process.execPath + '"');
        } else {
          console.log('[Firewall] Added inbound rule for UDP 45678');
        }
      });
    }
  });
}

function getLocalIPv4() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return null;
}

function scanBatch(socketMgr, subnet, localIp, start, end, onDone) {
  var remaining = [];
  for (var i = start; i <= end; i++) {
    var ip = subnet + i;
    if (ip !== localIp) remaining.push(ip);
  }
  if (remaining.length === 0) { if (onDone) onDone(); return; }

  var completed = 0;
  var total = remaining.length;

  remaining.forEach(function(ip) {
    var s = new tcpNet.Socket();
    var settled = false;

    function finish() {
      if (settled) return;
      settled = true;
      completed++;
      if (completed === total && onDone) onDone();
    }

    var scanPort = socketMgr ? socketMgr.TCP_PORT : 46000;
    s.connect(scanPort, ip, function() {
      // Dedup: skip if already connected to this IP
      for (var entry of socketMgr.connections.values()) {
        if (entry.remoteAddress === ip) {
          s.destroy();
          finish();
          return;
        }
      }
      console.log('[LAN-Scan] Found peer at ' + ip);
      socketMgr.setupSocket(s, null);
      socketMgr.sendBeacon(s);
      finish();
    });

    s.on('error', function() {
      s.destroy();
      finish();
    });

    setTimeout(function() {
      s.destroy();
      finish();
    }, 800);
  });
}

function startLanScan(socketMgr) {
  if (!socketMgr) return;
  var localIp = getLocalIPv4();
  if (!localIp) return;
  var parts = localIp.split('.');
  var subnet = parts[0] + '.' + parts[1] + '.' + parts[2] + '.';

  function scanAll() {
    scanBatch(socketMgr, subnet, localIp, 1, 254, function() {
      console.log('[LAN-Scan] Full scan complete');
    });
  }

  console.log('[LAN-Scan] Scanning ' + subnet + '1-254 for Orbit peers...');
  scanAll();
  if (_lanScanTimer) clearInterval(_lanScanTimer);
  _lanScanTimer = setInterval(scanAll, 60000);
}

let _lanScanTimer = null;
let _networkMonitorTimer = null;
let _lastLocalIP = null;

function startNetworkMonitor() {
  _lastLocalIP = getLocalIPv4();
  if (_networkMonitorTimer) clearInterval(_networkMonitorTimer);
  _networkMonitorTimer = setInterval(() => {
    var currentIP = getLocalIPv4();
    if (currentIP && currentIP !== _lastLocalIP) {
      console.log('[Network] IP changed from', _lastLocalIP, 'to', currentIP, '— restarting network');
      _lastLocalIP = currentIP;
      // Restart LAN scan with new subnet
      if (_lanScanTimer) {
        clearInterval(_lanScanTimer);
        _lanScanTimer = null;
      }
      startLanScan(socketInstance);
      // Restart discovery beacon interval by recreating discovery
      if (discoveryInstance) {
        var oldIdentity = currentIdentity;
        discoveryInstance.stop();
        discoveryInstance = new Discovery(() => currentIdentity, (peer) => {
          // Re-register the same callback
          console.log('[AutoConnect] Peer discovered:', peer.username, peer.userId, 'at IP', peer.ip);
          if (mainWindow) mainWindow.webContents.send('peer-found', peer);
          if (socketInstance && peer.userId && peer.ip) {
            var alreadyConnected = socketInstance.connections.has(peer.userId) ||
              socketInstance._pendingConnects.has(peer.userId);
            if (alreadyConnected) return;
            console.log('[AutoConnect] Initiating TCP connect to', peer.userId, peer.ip + ':' + (peer.tcpPort || 46000));
            socketInstance.connectToPeer(peer.userId, peer.ip, peer.tcpPort || 46000).catch(function(err) {
              console.error('[AutoConnect] Connection to', peer.userId, 'failed:', err && err.message);
            });
          }
        });
        if (socketInstance && socketInstance.TCP_PORT) {
          discoveryInstance.TCP_PORT = socketInstance.TCP_PORT;
        }
        discoveryInstance.onPeerGone = function(peerId) {
          console.log('[AutoConnect] Peer gone:', peerId);
          if (mainWindow) mainWindow.webContents.send('peer-gone', peerId);
        };
        discoveryInstance.onAnyBeacon = _tryAutoConnect;
        discoveryInstance.start();
      }
    }
  }, 10000);
}

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
let e2eeKeyPair = null; // { publicKey, privateKey } hex strings
const _autoConnectLastAttempt = new Map(); // peerId -> timestamp of last TCP attempt
const AUTO_CONNECT_THROTTLE = 30000; // Don't retry same peer more than once per 30s

// Throttled auto-connect: retries TCP on every beacon if not already connected
function _tryAutoConnect(peer) {
  if (!socketInstance) {
    console.log('[AutoConnect] SKIP: socketInstance not ready');
    return;
  }
  if (!peer.userId) {
    console.log('[AutoConnect] SKIP: peer.userId missing', JSON.stringify(peer));
    return;
  }
  if (!peer.ip) {
    console.log('[AutoConnect] SKIP: peer.ip missing for', peer.userId);
    return;
  }
  var alreadyConnected = socketInstance.connections.has(peer.userId) ||
    socketInstance._pendingConnects.has(peer.userId);
  if (alreadyConnected) {
    _autoConnectLastAttempt.delete(peer.userId);
    return;
  }
  var last = _autoConnectLastAttempt.get(peer.userId) || 0;
  if (Date.now() - last < AUTO_CONNECT_THROTTLE) {
    console.log('[AutoConnect] THROTTLED: skipping', peer.userId, 'last attempt was', (Date.now() - last) + 'ms ago');
    return;
  }
  _autoConnectLastAttempt.set(peer.userId, Date.now());
  console.log('[AutoConnect] Retry TCP to', peer.userId, peer.ip + ':' + (peer.tcpPort || 46000));
  socketInstance.connectToPeer(peer.userId, peer.ip, peer.tcpPort || 46000).then(function() {
    console.log('[AutoConnect] Connected to', peer.userId);
    _autoConnectLastAttempt.delete(peer.userId);
    // Immediately update peer status in UI (don't wait for remote's response beacon)
    if (mainWindow) {
      mainWindow.webContents.send('peer-found', {
        userId: peer.userId,
        username: peer.username || peer.userId,
        avatar: peer.avatar || null,
        status: 'online',
        ip: peer.ip,
        tcpPort: peer.tcpPort || 46000,
        lastSeen: Date.now()
      });
    }
  }).catch(function(err) {
    console.error('[AutoConnect] Retry failed for', peer.userId, ':', err && err.message);
  });
}

// E2EE helpers using Node crypto
function e2eeGetOrCreateKeyPair() {
  if (e2eeKeyPair) return e2eeKeyPair;
  var saved = persistentStore.get('e2ee-keypair');
  if (saved && saved.publicKey && saved.privateKey) {
    e2eeKeyPair = saved;
    return saved;
  }
  var ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  e2eeKeyPair = {
    publicKey: ecdh.getPublicKey('hex'),
    privateKey: ecdh.getPrivateKey('hex')
  };
  persistentStore.set('e2ee-keypair', e2eeKeyPair);
  return e2eeKeyPair;
}

function e2eeDeriveAESKey(peerPublicKeyHex) {
  var kp = e2eeGetOrCreateKeyPair();
  var ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(kp.privateKey, 'hex');
  var shared = ecdh.computeSecret(peerPublicKeyHex, 'hex');
  return crypto.createHash('sha256').update(shared).digest();
}

function e2eeEncrypt(plaintext, peerPublicKeyHex) {
  var key = e2eeDeriveAESKey(peerPublicKeyHex);
  var iv = crypto.randomBytes(12);
  var cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  var enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  var tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString('base64');
}

function e2eeDecrypt(ciphertextB64, peerPublicKeyHex) {
  var key = e2eeDeriveAESKey(peerPublicKeyHex);
  var buf = Buffer.from(ciphertextB64, 'base64');
  var iv = buf.subarray(0, 12);
  var tag = buf.subarray(buf.length - 16);
  var enc = buf.subarray(12, buf.length - 16);
  var decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc) + decipher.final('utf8');
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'orbit-file', privileges: { secure: true, standard: true, supportFetchAPI: true } },
  { scheme: 'orbit-db', privileges: { secure: true, standard: true, supportFetchAPI: true } },
  { scheme: 'orbit-avatar', privileges: { secure: true, standard: true, supportFetchAPI: true } }
]);

app.whenReady().then(() => {
  protocol.handle('orbit-file', (request) => {
    const urlPath = request.url.replace('orbit-file://', '');
    const decodedPath = decodeURIComponent(urlPath).replace(/\\/g, '/');
    return net.fetch('file:///' + decodedPath).then(r => {
      return new Response(r.body, { headers: cacheHeaders({ 'Content-Type': r.headers.get('Content-Type') || 'application/octet-stream' }) });
    });
  });
  function contentTypeFromAtt(att) {
    if (!att) return 'application/octet-stream';
    if (att.type && att.type.includes('/')) return att.type;
    if (att.type === 'image') {
      var ext = (att.name || '').split('.').pop().toLowerCase();
      var mimeMap = { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon' };
      return mimeMap[ext] || 'image/png';
    }
    if (att.type === 'audio') {
      var ext = (att.name || '').split('.').pop().toLowerCase();
      var audioMimeMap = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4', wma: 'audio/x-ms-wma', webm: 'audio/webm' };
      return audioMimeMap[ext] || 'audio/webm';
    }
    if (att.type === 'video') {
      var ext = (att.name || '').split('.').pop().toLowerCase();
      var videoMimeMap = { mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', ogv: 'video/ogg', mkv: 'video/x-matroska', avi: 'video/x-msvideo', mov: 'video/quicktime', m4v: 'video/mp4', '3gp': 'video/3gpp' };
      return videoMimeMap[ext] || 'video/mp4';
    }
    return 'application/octet-stream';
  }

  function cacheHeaders(extra) {
    var h = { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Access-Control-Allow-Origin': '*' };
    if (extra) Object.assign(h, extra);
    return h;
  }

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
                headers: cacheHeaders({ 'Content-Type': 'image/webp' })
              }));
              return;
            } else if (att && att.data && att.data.length > 0) {
              // Fallback to original image if no thumbnail yet
              resolve(new Response(att.data, {
                headers: cacheHeaders({ 'Content-Type': contentTypeFromAtt(att) })
              }));
              return;
            } else if (att && att.localPath && fs.existsSync(att.localPath)) {
              // Fallback for privacy mode: serve from filesystem
              resolve(net.fetch('file:///' + att.localPath.replace(/\\/g, '/')).then(r => {
                return new Response(r.body, {
                  headers: cacheHeaders({ 'Content-Type': contentTypeFromAtt(att) })
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
              var ct = contentTypeFromAtt(att);
              var extraHeaders = { 'Content-Type': ct, 'Content-Length': String(att.data.length) };
              if (ct.startsWith('audio/') || ct.startsWith('video/')) {
                extraHeaders['Accept-Ranges'] = 'bytes';
              }
              
              const rangeHeader = request.headers.get('Range');
              if (rangeHeader && (ct.startsWith('audio/') || ct.startsWith('video/'))) {
                const parts = rangeHeader.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] && parts[1] !== '' ? parseInt(parts[1], 10) : att.data.length - 1;
                const chunksize = (end - start) + 1;
                extraHeaders['Content-Range'] = `bytes ${start}-${end}/${att.data.length}`;
                extraHeaders['Content-Length'] = String(chunksize);
                
                let slicedData;
                if (Buffer.isBuffer(att.data)) {
                  slicedData = att.data.subarray(start, end + 1);
                } else if (att.data.slice) {
                  slicedData = att.data.slice(start, end + 1);
                } else {
                  slicedData = Buffer.from(att.data).subarray(start, end + 1);
                }
                
                resolve(new Response(slicedData, {
                  status: 206,
                  headers: cacheHeaders(extraHeaders)
                }));
                return;
              }


              resolve(new Response(att.data, {
                headers: cacheHeaders(extraHeaders)
              }));
              return;
            }
            // Fallback: serve from localPath (privacy mode temp files)
            if (att && att.localPath && fs.existsSync(att.localPath)) {
              resolve(net.fetch('file:///' + att.localPath.replace(/\\/g, '/'), { headers: request.headers }).then(r => {
                const h = cacheHeaders({ 'Content-Type': contentTypeFromAtt(att) });
                r.headers.forEach((v, k) => {
                  if (k.toLowerCase() !== 'content-type') h[k] = v;
                });
                return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
              }));
              return;
            }
            // Debug: log why attachment failed to load
            if (att) {
              console.warn('[orbit-db] Attachment "' + att.name + '" (id=' + id + ') has no data: data=' + (att.data ? att.data.length : 'null') + ', localPath=' + att.localPath);
            } else {
              console.warn('[orbit-db] Attachment not found for id=' + id);
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
              return new Response(r.body, { headers: cacheHeaders({ 'Content-Type': 'image/webp' }) });
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

  // Check attachment integrity on startup
  try {
    const attCheck = globalDb.checkAttachmentIntegrity();
    if (!attCheck.ok) {
      console.warn('[Startup] Attachment integrity issues found:', attCheck.warnings);
      // Auto-clean broken attachments with empty data
      const cleanup = globalDb.cleanupBrokenAttachments();
      if (cleanup.ok && cleanup.removed > 0) {
        console.log('[Startup] Removed ' + cleanup.removed + ' broken attachment(s)');
      }
    }
  } catch(e) { /* ignore */ }

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
  mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
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

  ipcMain.on('relaunch-app', () => {
    app.relaunch();
    app.exit(0);
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
  ipcMain.on('show-notification', (event, title, body, iconData) => {
    if (Notification.isSupported()) {
      let notifIcon = icon;
      if (iconData && typeof iconData === 'string') {
        try {
          notifIcon = nativeImage.createFromDataURL(iconData);
        } catch(e) {
          notifIcon = icon;
        }
      }
      const notif = new Notification({ title, body, icon: notifIcon });
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
  ipcMain.on('write-clipboard', (event, text) => {
    clipboard.writeText(text || '');
    event.returnValue = true;
  });

  // E2EE IPC
  ipcMain.on('e2ee-get-public-key', (event) => {
    var kp = e2eeGetOrCreateKeyPair();
    event.returnValue = kp.publicKey;
  });
  ipcMain.on('e2ee-encrypt', (event, plaintext, peerPublicKeyHex) => {
    try {
      event.returnValue = e2eeEncrypt(plaintext, peerPublicKeyHex);
    } catch (e) {
      event.returnValue = null;
    }
  });
  ipcMain.on('e2ee-decrypt', (event, ciphertextB64, peerPublicKeyHex) => {
    try {
      event.returnValue = e2eeDecrypt(ciphertextB64, peerPublicKeyHex);
    } catch (e) {
      event.returnValue = null;
    }
  });

  ipcMain.on('pin-verify', (event, pin) => {
    var currentHash = persistentStore.get('pin_hash');
    if (!currentHash) { event.returnValue = false; return; }
    var hash = crypto.createHash('sha256').update(String(pin)).digest('hex');
    event.returnValue = hash === currentHash;
  });

  ipcMain.on('pin-set', (event, pin) => {
    var hash = crypto.createHash('sha256').update(String(pin)).digest('hex');
    persistentStore.set('pin_hash', hash);
    persistentStore.set('pin_enabled', true);
    event.returnValue = true;
  });

  ipcMain.on('pin-disable', (event, currentPin) => {
    var currentHash = persistentStore.get('pin_hash');
    if (currentHash) {
      var hash = crypto.createHash('sha256').update(String(currentPin)).digest('hex');
      if (hash !== currentHash) { event.returnValue = false; return; }
    }
    persistentStore.delete('pin_hash');
    persistentStore.set('pin_enabled', false);
    event.returnValue = true;
  });

  ipcMain.on('pin-status', (event) => {
    event.returnValue = persistentStore.get('pin_enabled', false);
  });

  ipcMain.on('pin-forgot', () => {
    persistentStore.delete('pin_hash');
    persistentStore.set('pin_enabled', false);
  });

  // Database IPC
  ipcMain.on('db-get-all-startup-data', (event, userId) => {
    if (!globalDb) { event.returnValue = null; return; }
    event.returnValue = globalDb.getAllStartupData(userId || null);
  });
  ipcMain.on('db-get-local-user', (event) => {
    event.returnValue = globalDb.getLocalUser();
  });
  ipcMain.on('db-get-user', (event, userId) => {
    event.returnValue = globalDb.getUser(userId);
  });
  ipcMain.on('db-get-all-users', (event) => {
    event.returnValue = globalDb.getAllUsers();
  });
  ipcMain.on('db-delete-user', (event, userId) => {
    globalDb.deleteUser(userId);
    event.returnValue = true;
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
  ipcMain.on('db-set-member-role', (event, groupId, userId, role) => {
    globalDb.setMemberRole(groupId, userId, role);
    event.returnValue = true;
  });
  ipcMain.on('db-delete-group', (event, groupId) => {
    globalDb.deleteGroup(groupId);
    event.returnValue = true;
  });
  ipcMain.on('db-delete-friend', (event, userId) => {
    globalDb.deleteFriend(userId);
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

  // Read State
  ipcMain.on('db-get-read-state', (event, chatId) => {
    if (!globalDb) { event.returnValue = null; return; }
    event.returnValue = globalDb.getReadState(chatId);
  });
  ipcMain.on('db-set-read-state', (event, chatId, lastReadMsgId) => {
    if (!globalDb) { event.returnValue = false; return; }
    globalDb.setReadState(chatId, lastReadMsgId);
    event.returnValue = true;
  });
  ipcMain.on('db-add-mention', (event, chatId, msgId, senderId) => {
    if (!globalDb) { event.returnValue = false; return; }
    globalDb.addMention(chatId, msgId, senderId);
    event.returnValue = true;
  });
  ipcMain.on('db-get-mentions', (event, chatId) => {
    if (!globalDb) { event.returnValue = []; return; }
    event.returnValue = globalDb.getMentions(chatId);
  });
  ipcMain.on('db-clear-mentions', (event, chatId) => {
    if (!globalDb) { event.returnValue = false; return; }
    globalDb.clearMentions(chatId);
    event.returnValue = true;
  });

  // Database Health Check
  ipcMain.on('db-health-check', (event) => {
    if (!globalDb) { event.returnValue = { ok: false, errors: ['Database not initialized'], warnings: [] }; return; }
    event.returnValue = globalDb.healthCheck();
  });

  // Database Repair
  ipcMain.on('db-repair', (event) => {
    if (!globalDb) { event.returnValue = { ok: false, repaired: [], warnings: ['Database not initialized'] }; return; }
    event.returnValue = globalDb.repairDatabase();
  });

  // Attachment Integrity Check
  ipcMain.on('db-check-attachment-integrity', (event) => {
    if (!globalDb) { event.returnValue = { ok: false, warnings: ['Database not initialized'] }; return; }
    event.returnValue = globalDb.checkAttachmentIntegrity();
  });

  // Backup dialog
  ipcMain.handle('backup-create', async (event, format) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: 'Orbit-Backup-' + new Date().toISOString().split('T')[0] + (format === 'orzip' ? '.orzip' : '.zip'),
        filters: [
          { name: 'Orbit Backup', extensions: ['orzip'] },
          { name: 'ZIP Archive', extensions: ['zip'] }
        ]
      });
      if (result.canceled) return { canceled: true };
      if (format === 'orzip') {
        return { ...globalDb.exportBackupAsOrzip(result.filePath), canceled: false };
      } else {
        return { ...await globalDb.exportBackupAsZip(result.filePath), canceled: false };
      }
    } catch (e) {
      return { canceled: false, error: e.message };
    }
  });

  // Restore dialog
  ipcMain.handle('backup-restore', async (event) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        filters: [{ name: 'Orbit Backup', extensions: ['orzip', 'zip'] }],
        properties: ['openFile']
      });
      if (result.canceled || result.filePaths.length === 0) return { canceled: true };
      const filePath = result.filePaths[0];
      const validation = globalDb.validateBackup(filePath);
      if (!validation.valid) return { ok: false, error: validation.error };
      const restoreResult = globalDb.restoreBackup(filePath);
      if (restoreResult.ok && mainWindow) mainWindow.webContents.send('state-invalidate');
      return restoreResult;
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Backup validation (dry-run)
  ipcMain.handle('backup-validate', async (event, filePath) => {
    return globalDb.validateBackup(filePath);
  });

  // Renderer → main process logging (appears in terminal)
  ipcMain.on('log', (event, ...args) => {
    console.log('[OVP-IPC]', ...args);
  });

  // Networking IPC
  ipcMain.on('toggle-devtools', () => {
    if (mainWindow) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools({ mode: 'bottom' });
      }
    }
  });

  function setupNetworkInstances() {
    if (socketInstance) return;
    socketInstance = new SocketManager(() => currentIdentity);
    transferInstance = new TransferManager(socketInstance);

    transferInstance.onProgress = (fileId, progressData) => {
      if (mainWindow) {
        mainWindow.webContents.send('transfer-progress', { fileId, ...progressData });
      }
    };

    transferInstance.onError = (fileId, errorMsg) => {
      if (mainWindow) {
        mainWindow.webContents.send('transfer-error', { fileId, error: errorMsg });
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
        }, (errorMsg, fileId) => {
           console.error('File Transfer Error:', errorMsg);
           if (mainWindow) {
             mainWindow.webContents.send('transfer-error', { fileId, error: errorMsg });
           }
        });
      } else if (packet.type === Protocol.Types.FILE_TRANSFER_CANCEL) {
        transferInstance.handleCancel(packet);
        if (mainWindow) {
          mainWindow.webContents.send('transfer-error', { fileId: packet.payload.fileId, error: 'Sender cancelled the transfer' });
        }
      } else if (packet.type === Protocol.Types.FILE_TRANSFER_REJECT) {
        if (mainWindow) {
          var reason = packet.payload.reason === 'disk_space' ? 'Recipient has insufficient disk space' : 'Transfer rejected by recipient';
          mainWindow.webContents.send('transfer-error', { fileId: packet.payload.fileId, error: reason });
        }
      } else if (packet.type === Protocol.Types.BEACON) {
        if (packet.payload && mainWindow) {
          var peerData = packet.payload;
          // Bug #1: mobile BEACON lacks ip — fall back to socket remote address
          peerData.ip = peerData.ip || packet._fromIp || null;
          mainWindow.webContents.send('peer-found', peerData);
        }
      } else {
        mainWindow.webContents.send('network-message', packet);
      }
    });

    socketInstance.startServer();
  }

  ipcMain.on('network-start', (event, identity, reconnectEnabled, reconnectIntervalMs) => {
    currentIdentity = identity;
    setupNetworkInstances();

    // Apply stored reconnect settings
    if (socketInstance) {
      socketInstance.setReconnect(reconnectEnabled !== false, reconnectIntervalMs || 10000);
    }

    if (!discoveryInstance) {
      discoveryInstance = new Discovery(() => currentIdentity, (peer) => {
        console.log('[AutoConnect] Peer discovered:', peer.username, peer.userId, 'at IP', peer.ip);
        mainWindow.webContents.send('peer-found', peer);
        if (socketInstance && peer.userId && peer.ip) {
          // Check if already connected before auto-connecting
          var alreadyConnected = socketInstance.connections.has(peer.userId) ||
            socketInstance._pendingConnects.has(peer.userId);
          if (alreadyConnected) {
            console.log('[AutoConnect] Already connected or connecting to', peer.userId);
            return;
          }
          console.log('[AutoConnect] Initiating TCP connect to', peer.userId, peer.ip + ':' + (peer.tcpPort || 46000));
          socketInstance.connectToPeer(peer.userId, peer.ip, peer.tcpPort || 46000).then(function() {
            console.log('[AutoConnect] Connected to', peer.userId);
          }).catch(function(err) {
            console.error('[AutoConnect] Connection to', peer.userId, 'failed:', err && err.message);
          });
        } else {
          console.log('[AutoConnect] Skipped — socket:', !!socketInstance, 'userId:', !!peer.userId, 'ip:', !!peer.ip);
        }
      });
      // Sync TCP port from socket instance so beacon broadcasts the right port
      if (socketInstance && socketInstance.TCP_PORT) {
        discoveryInstance.TCP_PORT = socketInstance.TCP_PORT;
      }
      discoveryInstance.onPeerGone = function(peerId) {
        console.log('[AutoConnect] Peer gone:', peerId);
        mainWindow.webContents.send('peer-gone', peerId);
      };
      discoveryInstance.onAnyBeacon = _tryAutoConnect;
      discoveryInstance.start();
      tryAddFirewallRule();
      startLanScan(socketInstance);
      startNetworkMonitor();
    }
    event.returnValue = true;
  });

  ipcMain.on('network-set-reconnect', (event, enabled, intervalMs) => {
    if (socketInstance) {
      socketInstance.setReconnect(enabled, intervalMs);
    }
    event.returnValue = true;
  });

  ipcMain.on('network-stop', () => {
    if (_lanScanTimer) {
      clearInterval(_lanScanTimer);
      _lanScanTimer = null;
    }
    if (_networkMonitorTimer) {
      clearInterval(_networkMonitorTimer);
      _networkMonitorTimer = null;
    }
    if (socketInstance) {
      socketInstance.stop();
      socketInstance = null;
    }
    if (discoveryInstance) {
      discoveryInstance.stop();
      discoveryInstance = null;
    }
    if (transferInstance) {
      transferInstance.destroy();
      transferInstance = null;
    }
  });

  ipcMain.on('network-connect', (event, ip, port) => {
    if (socketInstance) {
      var localIp = getLocalIPv4();
      if (ip === localIp || ip === '127.0.0.1' || ip === 'localhost' || ip === '0.0.0.0' || ip === '::1') {
        if (mainWindow) mainWindow.webContents.send('toast', 'Cannot connect to yourself', 'error');
        return;
      }
      socketInstance.connectToPeer('manual', ip, port || 46000);
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

  ipcMain.on('cancel-transfer', (event, fileId) => {
    if (transferInstance) {
      transferInstance.cancelSend(fileId);
    }
  });

  // Open Graph metadata fetch for link previews
  ipcMain.handle('fetch-og', async (event, url) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(function() { controller.abort(); }, 5000);
      const resp = await net.fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
      clearTimeout(timeout);
      if (!resp.ok) return { url: url, title: '', description: '', image: '', domain: '' };
      const html = await resp.text();
      var domain = '';
      try { domain = new URL(url).hostname; } catch(e) { domain = url; }
      var og = { url: url, title: '', description: '', image: '', domain: domain };
      var titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) og.title = titleMatch[1].trim();
      var ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i);
      if (ogTitleMatch) og.title = ogTitleMatch[1];
      var ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
      if (ogDescMatch) { og.description = ogDescMatch[1]; }
      else {
        var descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
        if (descMatch) og.description = descMatch[1];
      }
      var ogImgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i);
      if (ogImgMatch) {
        og.image = ogImgMatch[1];
        if (og.image && !og.image.startsWith('http')) {
          try { og.image = new URL(og.image, url).href; } catch(e) {}
        }
      }
      if (!og.image && !og.title && !og.description) {
        og.description = html.replace(/<[^>]+>/g, '').substring(0, 200).trim();
      }
      return og;
    } catch (e) {
      return { url: url, title: '', description: '', image: '', domain: '', error: e.message };
    }
  });

  ipcMain.handle('check-disk-space', () => {
    try {
      const statfs = require('fs').statfsSync(require('os').tmpdir());
      const available = statfs.bavail * statfs.bsize;
      return { ok: true, available };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('get-attachment-duration', (event, url) => {
    try {
      console.log('[IPC-get-attachment-duration] url=' + url);
      const u = new URL(url);
      console.log('[IPC-get-attachment-duration] protocol=' + u.protocol + ' hostname=' + u.hostname + ' pathname=' + u.pathname);
      if (u.protocol !== 'orbit-db:') { console.log('[IPC-get-attachment-duration] wrong protocol'); return null; }
      if (u.hostname !== 'attachment' && !u.pathname.startsWith('/attachment/')) { console.log('[IPC-get-attachment-duration] wrong hostname/path'); return null; }
      const id = u.hostname === 'attachment' ? u.pathname.slice(1) : u.pathname.replace('/attachment/', '');
      console.log('[IPC-get-attachment-duration] id=' + id + ' globalDb=' + (globalDb ? 'yes' : 'no'));
      if (!globalDb) { console.log('[IPC-get-attachment-duration] no globalDb'); return null; }
      const att = globalDb.getAttachment(id);
      console.log('[IPC-get-attachment-duration] att=' + (att ? 'found' : 'null') + ' data=' + (att && att.data ? att.data.length + ' bytes' : 'null') + ' localPath=' + (att && att.localPath ? att.localPath : 'null'));
      if (!att || !att.data || att.data.length < 16) { console.log('[IPC-get-attachment-duration] no data'); return null; }
      const buf = Buffer.isBuffer(att.data) ? att.data : Buffer.from(att.data);
      const len = buf.length;
      console.log('[IPC-get-attachment-duration] buf len=' + len);

      // Unsigned 32-bit big-endian read (safe for MP4 atom sizes & durations)
      function u32(o) {
        if (o + 4 > len) return 0;
        return buf.readUInt32BE(o);
      }
      function str4(o) {
        return String.fromCharCode(buf[o], buf[o+1], buf[o+2], buf[o+3]);
      }

      // Find moov box
      var moovStart = -1, moovEnd = -1;
      var i = 0;
      while (i < len - 8) {
        var size = u32(i);
        var type = str4(i + 4);
        if (size === 0) { size = len - i; }
        else if (size === 1) {
          if (i + 16 > len) break;
          // 64-bit extended size — read high 32 bits and low 32 bits
          size = u32(i + 8) * 4294967296 + u32(i + 12);
        }
        if (size < 8) break;
        if (type === 'moov') { moovStart = i; moovEnd = i + size; break; }
        i += size;
      }
      if (moovStart < 0) { console.log('[IPC-get-attachment-duration] no moov found'); return null; }
      console.log('[IPC-get-attachment-duration] found moov at ' + moovStart + ' size=' + (moovEnd - moovStart));

      // Scan children of moov for mvhd, trak→tkhd, trak→mdia→mdhd
      var mvhdDur = null, mvhdTs = 0;
      var bestTrackDur = null;
      var trexDefaultDurMap = null;
      var trackTimescaleMap = {};

      function scanBox(start, end, depth, currentTrackId) {
        var p = start;
        while (p < end - 8) {
          var bSize = u32(p);
          var bType = str4(p + 4);
          if (bSize === 0) bSize = end - p;
          else if (bSize === 1) {
            if (p + 16 > end) break;
            bSize = u32(p + 8) * 4294967296 + u32(p + 12);
          }
          if (bSize < 8) break;
          var bEnd = p + bSize;
          if (bEnd > end) bEnd = end;
          console.log('[IPC-get-attachment-duration] moov child: ' + bType + ' size=' + bSize + ' offset=' + p);

          if (bType === 'mvhd') {
            var ver = buf[p + 8];
            var ts, dur;
            if (ver === 0) {
              ts = u32(p + 20);
              dur = u32(p + 24);
            } else {
              ts = u32(p + 28);
              dur = u32(p + 32) * 4294967296 + u32(p + 36);
            }
            console.log('[IPC-get-attachment-duration] mvhd ver=' + ver + ' ts=' + ts + ' dur=' + dur);
            mvhdTs = ts;
            if (ts > 0 && dur > 0) {
              mvhdDur = dur / ts;
              console.log('[IPC-get-attachment-duration] mvhd duration=' + mvhdDur + 's');
            }
          } else if (bType === 'tkhd') {
            var ver = buf[p + 8];
            var tkDur, tkTs, tkId;
            if (ver === 0) {
              tkId = u32(p + 20);
              tkTs = mvhdTs || 1000;
              tkDur = u32(p + 28);
            } else {
              tkId = u32(p + 28);
              tkTs = mvhdTs || 1000;
              tkDur = u32(p + 36) * 4294967296 + u32(p + 40);
            }
            console.log('[IPC-get-attachment-duration] tkhd ver=' + ver + ' id=' + tkId + ' dur=' + tkDur + ' ts=' + tkTs + ' => ' + (tkTs > 0 && tkDur > 0 ? tkDur/tkTs + 's' : '0'));
            if (tkTs > 0 && tkDur > 0) {
              var d = tkDur / tkTs;
              if (bestTrackDur === null || d > bestTrackDur) bestTrackDur = d;
            }
          } else if (bType === 'mdhd') {
            if (currentTrackId !== undefined) {
              var ver = buf[p + 8];
              var mdTs, mdDur;
              if (ver === 0) {
                mdTs = u32(p + 20);
                mdDur = u32(p + 24);
              } else {
                mdTs = u32(p + 28);
                mdDur = u32(p + 32) * 4294967296 + u32(p + 36);
              }
              console.log('[IPC-get-attachment-duration] mdhd ver=' + ver + ' id=' + currentTrackId + ' ts=' + mdTs + ' dur=' + mdDur + ' => ' + (mdTs > 0 && mdDur > 0 ? mdDur/mdTs + 's' : '0'));
              trackTimescaleMap[currentTrackId] = mdTs;
              if (mdTs > 0 && mdDur > 0) {
                var d = mdDur / mdTs;
                if (bestTrackDur === null || d > bestTrackDur) bestTrackDur = d;
              }
            }
          } else if (bType === 'mehd') {
            var ver = buf[p + 8];
            var meDur;
            if (ver === 0) {
              meDur = u32(p + 12);
            } else {
              meDur = u32(p + 12) * 4294967296 + u32(p + 16);
            }
            if (meDur > 0) {
              var d = meDur / (mvhdTs || 1000);
              console.log('[IPC-get-attachment-duration] mehd ver=' + ver + ' dur=' + meDur + ' ts=' + (mvhdTs || 1000) + ' => ' + d + 's');
              if (bestTrackDur === null || d > bestTrackDur) bestTrackDur = d;
            }
          } else if (bType === 'trak') {
            // Container — recurse and pass track ID from the tkhd inside
            var trappedTrackId;
            (function() {
              var sp = p + 8;
              while (sp < bEnd - 8) {
                var sbSize = u32(sp);
                var sbType = str4(sp + 4);
                if (sbSize === 0) sbSize = bEnd - sp;
                else if (sbSize === 1) { if (sp + 16 > bEnd) break; sbSize = u32(sp + 8) * 4294967296 + u32(sp + 12); }
                if (sbSize < 8) break;
                if (sbType === 'tkhd') {
                  var tver = buf[sp + 8];
                  trappedTrackId = tver === 0 ? u32(sp + 20) : u32(sp + 28);
                  break;
                }
                sp += sbSize;
              }
            })();
            console.log('[IPC-get-attachment-duration] trak id=' + trappedTrackId);
            scanBox(p + 8, bEnd, depth + 1, trappedTrackId);
          } else if (bType === 'mdia' || bType === 'minf' || bType === 'stbl') {
            // Container boxes — recurse into children
            scanBox(p + 8, bEnd, depth + 1, currentTrackId);
          } else if (bType === 'mvex') {
            // Parse trex children for default sample durations
            scanBox(p + 8, bEnd, depth + 1, currentTrackId);
            var trexMap = {};
            var tx = p + 8;
            while (tx < bEnd - 8) {
              var txSize = u32(tx);
              var txType = str4(tx + 4);
              if (txSize === 0) txSize = bEnd - tx;
              else if (txSize === 1) { if (tx + 16 > bEnd) break; txSize = u32(tx + 8) * 4294967296 + u32(tx + 12); }
              if (txSize < 8) break;
              if (txType === 'trex') {
                var trackId = u32(tx + 12);
                var defDur = u32(tx + 20);
                if (defDur > 0) { trexMap[trackId] = defDur; }
              }
              tx += txSize;
            }
            if (Object.keys(trexMap).length > 0) trexDefaultDurMap = trexMap;
          }
          p += bSize;
        }
      }

      scanBox(moovStart + 8, moovEnd, 0);

      // If moov had no duration, scan the ENTIRE file for moof→traf→trun boxes
      // (fragmented MP4 stores sample durations in movie fragments)
      if (bestTrackDur === null || bestTrackDur <= 0) {
        console.log('[IPC-get-attachment-duration] scanning entire file for moof fragments');
        var trackFragDurs = {};
        var i2 = 0;
        while (i2 < len - 8) {
          var fSize = u32(i2);
          var fType = str4(i2 + 4);
          if (fSize === 0) fSize = len - i2;
          else if (fSize === 1) { if (i2 + 16 > len) break; fSize = u32(i2+8) * 4294967296 + u32(i2+12); }
          if (fSize < 8) break;
          var fEnd = Math.min(i2 + fSize, len);
          if (fType === 'moof') {
            // Scan traf→trun boxes inside this moof
            var p = i2 + 8;
            while (p < fEnd - 8) {
              var tSize = u32(p);
              var tType = str4(p + 4);
              if (tSize === 0) tSize = fEnd - p;
              else if (tSize === 1) { if (p + 16 > fEnd) break; tSize = u32(p+8)*4294967296 + u32(p+12); }
              if (tSize < 8) break;
              var tEnd = Math.min(p + tSize, fEnd);
              if (tType === 'traf') {
                // Scan children: tfhd (default duration) then trun (sample durations)
                var defaultSampleDur = 0;
                var trafTrackId;
                var q = p + 8;
                while (q < tEnd - 8) {
                  var rSize = u32(q);
                  var rType = str4(q + 4);
                  if (rSize === 0) rSize = tEnd - q;
                  else if (rSize === 1) { if (q + 16 > tEnd) break; rSize = u32(q+8)*4294967296 + u32(q+12); }
                  if (rSize < 8) break;
                  if (rType === 'tfhd') {
                    var tfFlags = u32(q + 8) & 0x00FFFFFF;
                    var tfOff = 12;
                    trafTrackId = u32(q + tfOff); tfOff += 4;
                    if (tfFlags & 0x000001) tfOff += 8;
                    if (tfFlags & 0x000002) tfOff += 4;
                    if (tfFlags & 0x000008) { defaultSampleDur = u32(q + tfOff); tfOff += 4; }
                    else if (trexDefaultDurMap && trexDefaultDurMap[trafTrackId]) { defaultSampleDur = trexDefaultDurMap[trafTrackId]; }
                    if (tfFlags & 0x000010) tfOff += 4;
                    if (tfFlags & 0x000020) tfOff += 4;
                  } else if (rType === 'trun') {
                    var trFlags = u32(q + 8) & 0x00FFFFFF;
                    var sampleCount = u32(q + 12);
                    var offset = 16;
                    if (trFlags & 0x000001) offset += 4;
                    if (trFlags & 0x000004) offset += 4;
                    var trackSum = 0;
                    for (var s = 0; s < sampleCount; s++) {
                      if (trFlags & 0x000100) { trackSum += u32(q + offset); offset += 4; }
                      else if (defaultSampleDur > 0) { trackSum += defaultSampleDur; }
                      if (trFlags & 0x000200) offset += 4;
                      if (trFlags & 0x000400) offset += 4;
                      if (trFlags & 0x000800) offset += 4;
                    }
                    if (trackSum > 0 && trafTrackId !== undefined) {
                      if (!trackFragDurs[trafTrackId]) trackFragDurs[trafTrackId] = 0;
                      trackFragDurs[trafTrackId] += trackSum;
                    }
                  }
                  q += rSize;
                }
              }
              p += tSize;
            }
          }
          i2 += fSize;
        }
        // Convert per-track fragment sums to seconds using each track's timescale, take max
        if (Object.keys(trackFragDurs).length > 0) {
          var maxFragDur = 0;
          for (var tid in trackFragDurs) {
            var ts = trackTimescaleMap[tid] || mvhdTs || 1000;
            var d = trackFragDurs[tid] / ts;
            console.log('[IPC-get-attachment-duration] track ' + tid + ' fragment sum: ' + trackFragDurs[tid] + ' / ' + ts + ' = ' + d + 's');
            if (d > maxFragDur) maxFragDur = d;
          }
          console.log('[IPC-get-attachment-duration] max per-track fragment duration: ' + maxFragDur + 's');
          if (bestTrackDur === null || maxFragDur > bestTrackDur) bestTrackDur = maxFragDur;
        } else {
          console.log('[IPC-get-attachment-duration] no moof fragments found or all trun had no sample_duration flag');
        }
      }

      // Priority: mvhd duration > tkhd/mdhd/mehd/fragment duration
      if (mvhdDur !== null && mvhdDur > 0) {
        console.log('[IPC-get-attachment-duration] RESULT (mvhd): ' + mvhdDur + 's');
        return mvhdDur;
      }
      if (bestTrackDur !== null && bestTrackDur > 0) {
        console.log('[IPC-get-attachment-duration] RESULT (tkhd/mdhd/fragment): ' + bestTrackDur + 's');
        return bestTrackDur;
      }

      console.log('[IPC-get-attachment-duration] no valid duration found, returning null');
      return null;
    } catch (e) {
      console.log('[IPC-get-attachment-duration] EXCEPTION: ' + e.message);
      return null;
    }
  });
});

app.on('before-quit', () => {
  if (transferInstance) transferInstance.destroy();
  if (discoveryInstance) discoveryInstance.stop();
  if (socketInstance) socketInstance.stop();
  // Only clean up temp directory when privacy mode is enabled
  if (globalDb) {
    const settings = globalDb.getSetting('settings', {});
    if (settings.privacyMode === true && tempDirPath && fs.existsSync(tempDirPath)) {
      try {
        fs.rmSync(tempDirPath, { recursive: true, force: true });
      } catch(e) {
        console.error('Failed to clean up temp directory:', e.message);
      }
    }
    // Ensure WAL is checkpointed before exit to prevent data loss
    try { globalDb.db.pragma('wal_checkpoint(TRUNCATE)'); } catch(e) {}
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
