const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const migrations = require('./migrations');
const Store = require('electron-store'); 

class OrbitDatabase {
  constructor(userDataPath) {
    this.dbPath = path.join(userDataPath, 'orbit.db');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    
    // Run migrations
    migrations.run(this.db);
    
    // Initialize prepared statements
    this.initStatements();
    
    // Check if we need to migrate from electron-store
    this.migrateFromElectronStore();
    // Force re-migrate avatars since they were dropped in v1
    this.migrateFromElectronStore(true);
  }

  initStatements() {
    this.stmts = {
      // Users
      getUser: this.db.prepare('SELECT * FROM users WHERE userId = ?'),
      getLocalUser: this.db.prepare('SELECT * FROM users LIMIT 1'),
      saveUser: this.db.prepare('INSERT OR REPLACE INTO users (userId, username, usertag, status, avatar, banner, bio) VALUES (@userId, @username, @usertag, @status, @avatar, @banner, @bio)'),
      
      // Friends
      getFriends: this.db.prepare('SELECT * FROM friends'),
      saveFriend: this.db.prepare('INSERT OR REPLACE INTO friends (userId, username, usertag, status, avatar, bio) VALUES (@userId, @username, @usertag, @status, @avatar, @bio)'),
      
      // Messages
      getMessages: this.db.prepare('SELECT * FROM messages WHERE chatId = ? ORDER BY timestamp ASC'),
      getAllMessagesRaw: this.db.prepare('SELECT * FROM messages'),
      addMessage: this.db.prepare('INSERT INTO messages (id, chatId, sender, text, timestamp) VALUES (@id, @chatId, @sender, @text, @timestamp)'),
      deleteMessage: this.db.prepare('DELETE FROM messages WHERE id = ? AND chatId = ?'),
      
      // Attachments
      saveAttachment: this.db.prepare('INSERT INTO attachments (id, messageId, type, name, size, data) VALUES (@id, @messageId, @type, @name, @size, @data)'),
      getAttachmentsForMessage: this.db.prepare('SELECT id, type, name, size FROM attachments WHERE messageId = ?'),
      getAttachmentData: this.db.prepare('SELECT type, name, data FROM attachments WHERE id = ?'),
      deleteAttachment: this.db.prepare('DELETE FROM attachments WHERE id = ?'),
      
      // Settings
      getSetting: this.db.prepare('SELECT value FROM settings WHERE key = ?'),
      setSetting: this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (@key, @value)')
    };
  }

  // --- Users ---
  getUser(userId) {
    const user = this.stmts.getUser.get(userId);
    if (!user) return null;
    return this.parseUser(user);
  }
  
  getLocalUser() {
    const user = this.stmts.getLocalUser.get();
    if (!user) return null;
    return this.parseUser(user);
  }
  
  saveUser(user) {
    this.stmts.saveUser.run({
      userId: user.id || user.userId,
      username: user.username,
      usertag: user.usertag,
      status: user.status,
      avatar: (user.avatar instanceof Buffer || typeof user.avatar === 'string') ? user.avatar : null,
      banner: (user.banner instanceof Buffer || typeof user.banner === 'string') ? user.banner : null,
      bio: user.bio || ''
    });
  }

  parseUser(row) {
    return {
       ...row,
       // We can return base64 strings if needed, but for now we just return the raw object
    };
  }

  // --- Friends ---
  getFriends() {
    return this.stmts.getFriends.all().map(f => {
      // Clean up buffers if needed or keep as is. Usually frontend doesn't need huge buffers in friends list unless it's base64 encoded.
      // For simplicity, we just return the row. If avatar is buffer, we might want to skip it or provide a URL.
      // Let's assume for now we don't have large buffers in friends yet.
      return f;
    });
  }

  saveFriend(friend) {
    this.stmts.saveFriend.run({
      userId: friend.userId,
      username: friend.username,
      usertag: friend.usertag,
      status: friend.status,
      avatar: (friend.avatar instanceof Buffer || typeof friend.avatar === 'string') ? friend.avatar : null,
      bio: friend.bio || ''
    });
  }

  // --- Messages ---
  getMessages(chatId) {
    const msgs = this.stmts.getMessages.all(chatId);
    return msgs.map(m => {
      const atts = this.stmts.getAttachmentsForMessage.all(m.id);
      const attachments = atts.map(a => ({
        id: a.id,
        type: a.type,
        name: a.name,
        size: a.size,
        url: `orbit-db://attachment/${a.id}` // DB-backed protocol URL
      }));
      
      return {
        id: m.id,
        sender: m.sender,
        text: m.text,
        timestamp: m.timestamp,
        attachments: attachments.length > 0 ? attachments : undefined
      };
    });
  }

  getAllMessagesRaw() {
    const rawMsgs = this.stmts.getAllMessagesRaw.all();
    const result = {};
    rawMsgs.forEach(m => {
      if (!result[m.chatId]) result[m.chatId] = [];
      const atts = this.stmts.getAttachmentsForMessage.all(m.id);
      const attachments = atts.map(a => ({
        id: a.id,
        type: a.type,
        name: a.name,
        size: a.size,
        url: `orbit-db://attachment/${a.id}`
      }));
      
      result[m.chatId].push({
        id: m.id,
        sender: m.sender,
        text: m.text,
        timestamp: m.timestamp,
        attachments: attachments.length > 0 ? attachments : undefined
      });
    });
    return result;
  }

  addMessage(chatId, msg) {
    this.db.transaction(() => {
      // Need to handle potential duplicate IDs if client generates same ID on retry
      try {
        this.stmts.addMessage.run({
          id: msg.id.toString(),
          chatId: chatId,
          sender: msg.sender,
          text: msg.text || '',
          timestamp: msg.timestamp || new Date().toISOString()
        });
      } catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
          // ignore or update
        } else {
          throw e;
        }
      }
      
      if (msg.attachments && msg.attachments.length > 0) {
        msg.attachments.forEach(att => {
          const attId = att.id || require('crypto').randomUUID();
          
          let bufferData = Buffer.alloc(0);
          if (att.data) {
             bufferData = att.data;
          } else if (att.path && fs.existsSync(att.path)) {
             bufferData = fs.readFileSync(att.path);
          }

          try {
            this.stmts.saveAttachment.run({
              id: attId,
              messageId: msg.id.toString(),
              type: att.type,
              name: att.name,
              size: att.size || bufferData.length,
              data: bufferData
            });
          } catch(e) {
             // Handle duplicate attachment
             if (e.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') throw e;
          }
        });
      }
    })();
  }
  
  deleteMessage(chatId, msgId) {
    // Attachments will be deleted automatically due to ON DELETE CASCADE
    this.stmts.deleteMessage.run(msgId.toString(), chatId);
  }

  // --- Attachments ---
  saveAttachment(msgId, attachment) {
    const attId = attachment.id || require('crypto').randomUUID();
    
    let bufferData = Buffer.alloc(0);
    if (attachment.data) bufferData = attachment.data;
    else if (attachment.path && fs.existsSync(attachment.path)) bufferData = fs.readFileSync(attachment.path);

    this.stmts.saveAttachment.run({
      id: attId,
      messageId: msgId.toString(),
      type: attachment.type,
      name: attachment.name,
      size: attachment.size || bufferData.length,
      data: bufferData
    });
    return attId;
  }
  
  getAttachment(attachmentId) {
    return this.stmts.getAttachmentData.get(attachmentId);
  }

  // --- Settings ---
  getSetting(key, def) {
    const row = this.stmts.getSetting.get(key);
    if (!row) return def;
    try {
      return JSON.parse(row.value);
    } catch(e) {
      return def;
    }
  }

  setSetting(key, value) {
    this.stmts.setSetting.run({
      key: key,
      value: JSON.stringify(value)
    });
  }

  // --- Migration from old JSON store ---
  migrateFromElectronStore(forceAvatarsOnly = false) {
    const migrated = this.getSetting('migrated_from_electron_store', false);
    if (migrated && !forceAvatarsOnly) return;
    
    console.log('Migrating data from electron-store to SQLite...');
    const oldStore = new Store();
    
    this.db.transaction(() => {
      // Settings
      const settings = oldStore.get('settings');
      if (settings) this.setSetting('settings', settings);
      
      const networkSettings = oldStore.get('networkSettings');
      if (networkSettings) this.setSetting('networkSettings', networkSettings);
      
      // Identity
      const identity = oldStore.get('identity');
      if (identity) {
        this.saveUser({
          id: identity.id || identity.userId || require('crypto').randomUUID(),
          username: identity.username || 'User',
          usertag: identity.usertag || '0000',
          status: identity.status || 'online',
          avatar: identity.avatar || null,
          banner: identity.banner || null,
          bio: ''
        });
      }
      
      // AppData (friends, messages, groups)
      const appData = oldStore.get('appData');
      if (appData) {
        if (appData.friends && Array.isArray(appData.friends)) {
          appData.friends.forEach(f => {
            this.saveFriend({
              userId: f.userId,
              username: f.username,
              usertag: f.usertag || '0000',
              status: f.status || 'offline',
              avatar: f.avatar || null,
              bio: f.bio || ''
            });
          });
        }
        
        if (!forceAvatarsOnly && appData.messages && typeof appData.messages === 'object') {
          for (const [chatId, msgs] of Object.entries(appData.messages)) {
            msgs.forEach(m => {
              this.stmts.addMessage.run({
                id: m.id.toString(),
                chatId: chatId,
                sender: m.sender,
                text: m.text || '',
                timestamp: m.timestamp
              });
              
              if (m.attachments && Array.isArray(m.attachments)) {
                m.attachments.forEach(att => {
                  const attId = require('crypto').randomUUID();
                  
                  // If legacy URL was orbit-file://, we can try to read the file and ingest it.
                  let bufferData = Buffer.alloc(0);
                  if (att.url && att.url.startsWith('orbit-file://')) {
                     try {
                        const originalPath = decodeURIComponent(att.url.replace('orbit-file://', ''));
                        if (fs.existsSync(originalPath)) {
                           bufferData = fs.readFileSync(originalPath);
                        }
                     } catch(e) { console.error("Error migrating file", e); }
                  }

                  this.stmts.saveAttachment.run({
                    id: attId,
                    messageId: m.id.toString(),
                    type: att.type || 'file',
                    name: att.name || 'Unknown',
                    size: att.size || bufferData.length,
                    data: bufferData
                  });
                });
              }
            });
          }
        }
      }
      
      this.setSetting('migrated_from_electron_store', true);
    })();
    console.log('Migration from electron-store complete.');
  }
}

module.exports = OrbitDatabase;
