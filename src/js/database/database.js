const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const migrations = require('./migrations');
const Store = require('electron-store'); 

class OrbitDatabase {
  constructor(userDataPath) {
    this.dbPath = path.join(userDataPath, 'orbit.db');
    this.userDataPath = userDataPath;
    this.tempDirPath = path.join(userDataPath, 'temp');
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

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDirPath)) {
      try { fs.mkdirSync(this.tempDirPath, { recursive: true }); } catch(e) {}
    }
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
      editMessage: this.db.prepare('UPDATE messages SET text = ? WHERE id = ? AND chatId = ?'),
      deleteMessage: this.db.prepare('DELETE FROM messages WHERE id = ? AND chatId = ?'),
      
      // Attachments
      saveAttachment: this.db.prepare('INSERT INTO attachments (id, messageId, type, name, size, data, hash, localPath) VALUES (@id, @messageId, @type, @name, @size, @data, @hash, @localPath)'),
      getAttachmentsForMessage: this.db.prepare('SELECT id, type, name, size, localPath FROM attachments WHERE messageId = ?'),
      getAttachmentData: this.db.prepare('SELECT type, name, data, localPath FROM attachments WHERE id = ?'),
      getAttachmentThumbnail: this.db.prepare('SELECT type, name, thumbnail, localPath FROM attachments WHERE id = ?'),
      deleteAttachment: this.db.prepare('DELETE FROM attachments WHERE id = ?'),
      
      // Groups
      getGroups: this.db.prepare('SELECT g.*, COUNT(gm.userId) as memberCount FROM groups g LEFT JOIN group_members gm ON g.groupId = gm.groupId GROUP BY g.groupId ORDER BY g.pinned DESC, g.createdAt DESC'),
      getGroup: this.db.prepare('SELECT * FROM groups WHERE groupId = ?'),
      saveGroup: this.db.prepare('INSERT OR REPLACE INTO groups (groupId, groupName, ownerId, createdAt, avatarPath, description, pinned, notificationMuted, inviteCode) VALUES (@groupId, @groupName, @ownerId, @createdAt, @avatarPath, @description, @pinned, @notificationMuted, @inviteCode)'),
      deleteGroup: this.db.prepare('DELETE FROM groups WHERE groupId = ?'),
      // no updateGroupField prepared statement — uses dynamic sql via method
      getGroupByInviteCode: this.db.prepare('SELECT * FROM groups WHERE inviteCode = ?'),
      addGroupMember: this.db.prepare('INSERT OR REPLACE INTO group_members (groupId, userId, username, usertag, status, avatar, ip, joinedAt) VALUES (@groupId, @userId, @username, @usertag, @status, @avatar, @ip, @joinedAt)'),
      removeGroupMember: this.db.prepare('DELETE FROM group_members WHERE groupId = ? AND userId = ?'),
      getGroupMembers: this.db.prepare('SELECT * FROM group_members WHERE groupId = ?'),
      
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

  // --- Groups ---
  getGroups() {
    return this.stmts.getGroups.all().map(g => {
      g.members = this.stmts.getGroupMembers.all(g.groupId);
      return g;
    });
  }

  getGroup(groupId) {
    const group = this.stmts.getGroup.get(groupId);
    if (!group) return null;
    group.members = this.stmts.getGroupMembers.all(groupId);
    return group;
  }

  saveGroup(group) {
    this.stmts.saveGroup.run({
      groupId: group.groupId,
      groupName: group.groupName,
      ownerId: group.ownerId,
      createdAt: group.createdAt || new Date().toISOString(),
      avatarPath: group.avatarPath || null,
      description: group.description || '',
      pinned: group.pinned ? 1 : 0,
      notificationMuted: group.notificationMuted ? 1 : 0,
      inviteCode: group.inviteCode || null
    });
    if (group.members && Array.isArray(group.members)) {
      group.members.forEach(m => this.addGroupMember(group.groupId, m));
    }
  }

  updateGroupField(groupId, field, value) {
    // field is controlled by our code, not user input — safe for dynamic sql
    this.db.prepare(`UPDATE groups SET ${field} = ? WHERE groupId = ?`).run(value, groupId);
  }

  getGroupByInviteCode(code) {
    const group = this.stmts.getGroupByInviteCode.get(code);
    if (!group) return null;
    group.members = this.stmts.getGroupMembers.all(group.groupId);
    return group;
  }

  addGroupMember(groupId, user) {
    this.stmts.addGroupMember.run({
      groupId: groupId,
      userId: user.userId,
      username: user.username,
      usertag: user.usertag || '',
      status: user.status || 'online',
      avatar: user.avatar || null,
      ip: user.ip || null,
      joinedAt: user.joinedAt || new Date().toISOString()
    });
  }

  removeGroupMember(groupId, userId) {
    this.stmts.removeGroupMember.run(groupId, userId);
  }

  getGroupMembers(groupId) {
    return this.stmts.getGroupMembers.all(groupId);
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
        url: a.localPath ? `orbit-file://${encodeURIComponent(a.localPath)}` : `orbit-db://attachment/${a.id}`
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
        url: a.localPath ? `orbit-file://${encodeURIComponent(a.localPath)}` : `orbit-db://attachment/${a.id}`
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
    const pendingThumbnails = [];

    this.db.transaction(() => {
      try {
        this.stmts.addMessage.run({
          id: msg.id.toString(),
          chatId: chatId,
          sender: msg.sender,
          text: msg.text || '',
          timestamp: msg.timestamp || new Date().toISOString()
        });
      } catch (e) {
        if (e.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') throw e;
      }
      
      if (msg.attachments && msg.attachments.length > 0) {
        const settings = this.getSetting('settings', {});
        const isPrivacyMode = settings.privacyMode === true;

        msg.attachments.forEach(att => {
          const attId = att.id || require('crypto').randomUUID();
          
          let bufferData = Buffer.alloc(0);
          let localPath = att.localPath || null;

          if (isPrivacyMode) {
            if (att.path && fs.existsSync(att.path)) {
              localPath = path.join(this.tempDirPath || require('os').tmpdir(), 'orbit_att_' + attId + '_' + (att.name || 'file'));
              try {
                const dir = path.dirname(localPath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.copyFileSync(att.path, localPath);
              } catch(e) {
                console.error('Failed to copy attachment to temp dir:', e.message);
                localPath = null;
              }
            } else if (att.data) {
              localPath = path.join(this.tempDirPath || require('os').tmpdir(), 'orbit_att_' + attId + '_' + (att.name || 'file'));
              try {
                const dir = path.dirname(localPath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(localPath, att.data);
              } catch(e) {
                console.error('Failed to write attachment to temp dir:', e.message);
                localPath = null;
              }
            }
          } else {
            if (att.data) {
              if (Buffer.isBuffer(att.data) && att.data.length > 0) {
                bufferData = att.data;
              } else if (att.data instanceof ArrayBuffer && att.data.byteLength > 0) {
                bufferData = Buffer.from(att.data);
              } else if (typeof att.data === 'object' && att.data !== null && typeof att.data.length === 'number' && att.data.length > 0) {
                try { bufferData = Buffer.from(att.data); } catch(e) { /* ignore */ }
              }
            }
            if (bufferData.length === 0 && att.path && fs.existsSync(att.path)) {
               try {
                 bufferData = fs.readFileSync(att.path);
               } catch(e) {
                 console.error('Failed to read attachment from path ' + att.path + ':', e.message);
               }
            }
          }

          try {
            this.stmts.saveAttachment.run({
              id: attId,
              messageId: msg.id.toString(),
              type: att.type,
              name: att.name,
              size: att.size || bufferData.length,
              data: bufferData,
              hash: att.hash || null,
              localPath: localPath
            });
          } catch(e) {
             if (e.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') throw e;
          }

          if (!isPrivacyMode && att.type === 'image' && bufferData.length > 0) {
            pendingThumbnails.push({ bufferData, attId });
          }
        });
      }
    })();

    // Generate thumbnails AFTER the transaction commits (sharp native
    // binary may not be installed, and we must not let it roll back saves).
    for (const job of pendingThumbnails) {
      this._generateThumbnail(job.bufferData, job.attId);
    }
  }

  _generateThumbnail(bufferData, attId) {
    try {
      const sharp = require('sharp');
      sharp(bufferData)
        .resize(200, 200, { fit: 'inside' })
        .webp({ quality: 80 })
        .toBuffer()
        .then(thumbBuffer => {
          this.db.prepare('UPDATE attachments SET thumbnail = ? WHERE id = ?').run(thumbBuffer, attId);
        })
        .catch(err => console.error('Failed to generate thumbnail for ' + attId, err));
    } catch(e) {
      console.error('Thumbnail generation unavailable (sharp not installed):', e.message);
    }
  }
  
  deleteMessage(chatId, msgId) {
    // Attachments will be deleted automatically due to ON DELETE CASCADE
    this.stmts.deleteMessage.run(msgId.toString(), chatId);
  }

  editMessage(chatId, msgId, newText) {
    this.stmts.editMessage.run(newText, msgId.toString(), chatId);
  }

  // --- Attachments ---
  saveAttachment(msgId, attachment) {
    const attId = attachment.id || require('crypto').randomUUID();
    
    let bufferData = Buffer.alloc(0);
    const settings = this.getSetting('settings', {});
    const isPrivacyMode = settings.privacyMode === true;
    
    if (!isPrivacyMode) {
      if (attachment.data) bufferData = attachment.data;
      else if (attachment.path && fs.existsSync(attachment.path)) bufferData = fs.readFileSync(attachment.path);
    }

    this.stmts.saveAttachment.run({
      id: attId,
      messageId: msgId.toString(),
      type: attachment.type,
      name: attachment.name,
      size: attachment.size || bufferData.length,
      data: bufferData,
      hash: attachment.hash || null
    });
    return attId;
  }
  
  getAttachment(attachmentId) {
    return this.stmts.getAttachmentData.get(attachmentId);
  }

  getAttachmentThumbnail(attachmentId) {
    return this.stmts.getAttachmentThumbnail.get(attachmentId);
  }

  clearAllAttachments() {
    this.db.prepare('UPDATE attachments SET data = zeroblob(0), thumbnail = NULL').run();
  }

  cleanupOldAttachments(minutes) {
    // if minutes is 0, we don't delete. If no setting, user requested > 365 days (525600 min)
    if (minutes <= 0) return;
    
    // SQLite datetime('now', '-N minutes')
    const query = `
      UPDATE attachments SET data = zeroblob(0), thumbnail = NULL 
      WHERE messageId IN (
        SELECT id FROM messages 
        WHERE timestamp < datetime('now', '-${minutes} minutes')
      ) AND (data != zeroblob(0) OR thumbnail IS NOT NULL)
    `;
    this.db.prepare(query).run();
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
          bio: identity.bio || ''
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
