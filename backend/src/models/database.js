const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

let db = null;

// Initialize database connection
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(process.env.DATABASE_URL || './data/subscriptions.db');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const dbPath = process.env.DATABASE_URL || './data/subscriptions.db';
      db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          createTables().then(resolve).catch(reject);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Create necessary tables
function createTables() {
  return new Promise((resolve, reject) => {
    const createSubscriptionsTable = `
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL UNIQUE,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        status TEXT NOT NULL DEFAULT 'inactive',
        current_period_start INTEGER,
        current_period_end INTEGER,
        translation_count INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `;

    const createUsageTable = `
      CREATE TABLE IF NOT EXISTS usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        translation_text TEXT,
        source_language TEXT,
        target_language TEXT,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES subscriptions (user_id)
      )
    `;

    db.run(createSubscriptionsTable, (err) => {
      if (err) {
        reject(err);
        return;
      }
      
      db.run(createUsageTable, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        console.log('Database tables created successfully');
        resolve();
      });
    });
  });
}

// Get database instance
function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

// User/Subscription management functions
const SubscriptionModel = {
  // Create or get user
  async createUser(userId) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT OR IGNORE INTO subscriptions (user_id, status, translation_count) 
        VALUES (?, 'inactive', 0)
      `;
      
      db.run(query, [userId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ userId, created: this.changes > 0 });
        }
      });
    });
  },

  // Get user subscription
  async getUserSubscription(userId) {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM subscriptions WHERE user_id = ?`;
      
      db.get(query, [userId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  // Update subscription
  async updateSubscription(userId, data) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];
      
      Object.keys(data).forEach(key => {
        if (data[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(data[key]);
        }
      });
      
      if (fields.length === 0) {
        resolve({ updated: false });
        return;
      }
      
      fields.push('updated_at = ?');
      values.push(Math.floor(Date.now() / 1000));
      values.push(userId);
      
      const query = `UPDATE subscriptions SET ${fields.join(', ')} WHERE user_id = ?`;
      
      db.run(query, values, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ updated: this.changes > 0, changes: this.changes });
        }
      });
    });
  },

  // Increment translation count
  async incrementTranslationCount(userId) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE subscriptions 
        SET translation_count = translation_count + 1, updated_at = ? 
        WHERE user_id = ?
      `;
      
      db.run(query, [Math.floor(Date.now() / 1000), userId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ updated: this.changes > 0 });
        }
      });
    });
  },

  // Log translation usage
  async logTranslation(userId, translationData) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO usage_logs (user_id, translation_text, source_language, target_language) 
        VALUES (?, ?, ?, ?)
      `;
      
      db.run(query, [
        userId, 
        translationData.text || '', 
        translationData.sourceLang || 'auto', 
        translationData.targetLang || 'en'
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
    });
  },

  // Get user usage stats
  async getUserUsageStats(userId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          COUNT(*) as total_translations,
          COUNT(CASE WHEN timestamp > strftime('%s', 'now', '-30 days') THEN 1 END) as last_30_days
        FROM usage_logs 
        WHERE user_id = ?
      `;
      
      db.get(query, [userId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || { total_translations: 0, last_30_days: 0 });
        }
      });
    });
  }
};

module.exports = {
  initializeDatabase,
  getDatabase,
  SubscriptionModel
};
