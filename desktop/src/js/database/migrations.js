const migrations = [
  // v1
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        userId TEXT PRIMARY KEY,
        username TEXT,
        usertag TEXT,
        status TEXT,
        avatar BLOB,
        banner BLOB,
        bio TEXT
      );
      
      CREATE TABLE IF NOT EXISTS friends (
        userId TEXT PRIMARY KEY,
        username TEXT,
        usertag TEXT,
        status TEXT,
        avatar BLOB,
        bio TEXT
      );
      
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chatId TEXT,
        sender TEXT,
        text TEXT,
        timestamp TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_messages_chatId ON messages(chatId);
      
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        messageId TEXT,
        type TEXT,
        name TEXT,
        size INTEGER,
        data BLOB,
        FOREIGN KEY(messageId) REFERENCES messages(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_attachments_messageId ON attachments(messageId);
      
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  },
  // v2
  (db) => {
    db.exec(`
      ALTER TABLE attachments ADD COLUMN hash TEXT;
      ALTER TABLE attachments ADD COLUMN thumbnail BLOB;
    `);
  },
  // v3 - Groups & group members
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS groups (
        groupId TEXT PRIMARY KEY,
        groupName TEXT,
        ownerId TEXT,
        createdAt TEXT
      );

      CREATE TABLE IF NOT EXISTS group_members (
        groupId TEXT NOT NULL,
        userId TEXT NOT NULL,
        username TEXT,
        usertag TEXT,
        status TEXT,
        avatar TEXT,
        ip TEXT,
        joinedAt TEXT,
        PRIMARY KEY (groupId, userId),
        FOREIGN KEY (groupId) REFERENCES groups(groupId) ON DELETE CASCADE
      );
    `);
  },
  // v4 - Add localPath column for privacy mode temp file references
  (db) => {
    db.exec(`
      ALTER TABLE attachments ADD COLUMN localPath TEXT;
    `);
  },
  // v5 - Group enhancements (avatar, description, settings, invite code)
  (db) => {
    db.exec(`
      ALTER TABLE groups ADD COLUMN avatarPath TEXT;
      ALTER TABLE groups ADD COLUMN description TEXT DEFAULT '';
      ALTER TABLE groups ADD COLUMN pinned INTEGER DEFAULT 0;
      ALTER TABLE groups ADD COLUMN notificationMuted INTEGER DEFAULT 0;
      ALTER TABLE groups ADD COLUMN inviteCode TEXT;
    `);
  },
  // v6 - Avatar cache buster timestamp
  (db) => {
    db.exec(`
      ALTER TABLE groups ADD COLUMN avatarUpdatedAt INTEGER DEFAULT 0;
    `);
  },
  // v7 - Group member roles
  (db) => {
    db.exec(`
      ALTER TABLE group_members ADD COLUMN role TEXT DEFAULT 'member';
      UPDATE group_members SET role = 'owner' WHERE userId IN (SELECT ownerId FROM groups WHERE groups.groupId = group_members.groupId);
    `);
  },
  // v8 - Read state and mentions tracking
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS read_state (
        chatId TEXT PRIMARY KEY,
        lastReadMsgId TEXT,
        lastReadTimestamp TEXT
      );
      CREATE TABLE IF NOT EXISTS mentions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chatId TEXT,
        msgId TEXT,
        senderId TEXT,
        timestamp TEXT
      );
    `);
  },
  // v9 - Add performance indexes
  (db) => {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_mentions_chatId ON mentions(chatId);
      CREATE INDEX IF NOT EXISTS idx_messages_chatId_timestamp ON messages(chatId, timestamp DESC);
    `);
  },
  // v10 - Add profileFrame to users table
  (db) => {
    db.exec(`
      ALTER TABLE users ADD COLUMN profileFrame INTEGER DEFAULT 0;
    `);
  },
  // v11 - Add accountOwnerId for per-account data isolation
  // (distinct from groups.ownerId which is the group creator)
  (db) => {
    // Check if column exists before adding (handles partial migration)
    var cols;
    try { cols = db.pragma('table_info(friends)'); } catch(e) { cols = []; }
    if (!cols.some(function(c) { return c.name === 'accountOwnerId'; })) {
      try { db.exec("ALTER TABLE friends ADD COLUMN accountOwnerId TEXT"); } catch(e) {}
    }
    try { cols = db.pragma('table_info(groups)'); } catch(e) { cols = []; }
    if (!cols.some(function(c) { return c.name === 'accountOwnerId'; })) {
      try { db.exec("ALTER TABLE groups ADD COLUMN accountOwnerId TEXT"); } catch(e) {}
    }
    try { cols = db.pragma('table_info(group_members)'); } catch(e) { cols = []; }
    if (!cols.some(function(c) { return c.name === 'accountOwnerId'; })) {
      try { db.exec("ALTER TABLE group_members ADD COLUMN accountOwnerId TEXT"); } catch(e) {}
    }
    // Backfill existing data with the first user's userId so pre-migration data
    // is assigned to the original (first) account, not orphaned.
    var firstUser = db.prepare('SELECT userId FROM users LIMIT 1').get();
    if (firstUser && firstUser.userId) {
      var uid = firstUser.userId;
      db.prepare('UPDATE friends SET accountOwnerId = ? WHERE accountOwnerId IS NULL').run(uid);
      db.prepare('UPDATE groups SET accountOwnerId = ? WHERE accountOwnerId IS NULL').run(uid);
      db.prepare('UPDATE group_members SET accountOwnerId = ? WHERE accountOwnerId IS NULL').run(uid);
    }
  },
  // v12 - Add avatarDataUrl column to groups table
  (db) => {
    var cols;
    try { cols = db.pragma('table_info(groups)'); } catch(e) { cols = []; }
    if (!cols.some(function(c) { return c.name === 'avatarDataUrl'; })) {
      try { db.exec("ALTER TABLE groups ADD COLUMN avatarDataUrl TEXT"); } catch(e) {}
    }
  }
];

module.exports = {
  run: (db) => {
    // Check current user_version
    const { user_version } = db.prepare('PRAGMA user_version').get();
    let currentVersion = user_version || 0;
    
    // Guard: if user_version >= 11 but accountOwnerId columns are missing
    // (e.g. from a partially-rolled-back transaction), force re-run v11
    if (currentVersion >= 11) {
      try {
        var friendCols = db.pragma('table_info(friends)').map(function(c) { return c.name; });
        var groupCols = db.pragma('table_info(groups)').map(function(c) { return c.name; });
        var memberCols = db.pragma('table_info(group_members)').map(function(c) { return c.name; });
        var hasAccountOwnerId = friendCols.indexOf('accountOwnerId') >= 0
          && groupCols.indexOf('accountOwnerId') >= 0
          && memberCols.indexOf('accountOwnerId') >= 0;
        if (!hasAccountOwnerId) {
          console.log('[Migration] accountOwnerId columns missing, resetting to v10');
          currentVersion = 10;
          db.pragma('user_version = 10');
        }
      } catch(e) {
        console.warn('[Migration] Column check failed, resetting:', e.message);
        currentVersion = 10;
        db.pragma('user_version = 10');
      }
    }
    
    // Begin transaction for migrations
    const migrateTransaction = db.transaction(() => {
      while (currentVersion < migrations.length) {
        migrations[currentVersion](db);
        currentVersion++;
        db.pragma(`user_version = ${currentVersion}`);
      }
    });
    
    migrateTransaction();
  }
};
