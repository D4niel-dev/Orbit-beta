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
  }
];

module.exports = {
  run: (db) => {
    // Check current user_version
    const { user_version } = db.prepare('PRAGMA user_version').get();
    let currentVersion = user_version || 0;
    
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
