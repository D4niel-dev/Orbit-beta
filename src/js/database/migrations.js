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
