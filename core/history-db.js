const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

class HistoryManager {
  /**
   * @param {string} dataPath - Directory where history.db will be stored, or direct path to history.db
   */
  constructor(dataPath) {
    if (!dataPath) {
      throw new Error('HistoryManager requires a dataPath');
    }
    this.dataPath = dataPath;
    this.dbPath = (typeof dataPath === 'string' && dataPath.toLowerCase().endsWith('.db'))
      ? dataPath
      : path.join(dataPath, 'history.db');
    this.db = null;
    this.SQL = null;
  }

  /**
   * Initialize sql.js, open/create history.db, and ensure table exists.
   */
  async init() {
    if (!this.SQL) {
      this.SQL = await initSqlJs();
    }

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.dbPath)) {
      try {
        const buf = fs.readFileSync(this.dbPath);
        this.db = new this.SQL.Database(buf);
      } catch (err) {
        console.warn('[HistoryManager] Failed to read existing db file, creating fresh database:', err);
        this.db = new this.SQL.Database();
      }
    } else {
      this.db = new this.SQL.Database();
    }

    this.db.run(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT,
        title TEXT,
        visited_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_history_visited_at ON history (visited_at DESC);
      CREATE INDEX IF NOT EXISTS idx_history_url ON history (url);
    `);

    this.persist();
    return this;
  }

  /**
   * Persist in-memory database to disk.
   */
  persist() {
    if (!this.db) return;
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  /**
   * Save alias for persist.
   */
  save() {
    this.persist();
  }

  /**
   * Add a visit to history (insert, not upsert).
   * Automatically skips lit:// and about: internal browser URLs, then persists.
   * @param {string} url
   * @param {string} [title]
   * @returns {Promise<object|null>} The inserted history entry, or null if skipped
   */
  async add(url, title) {
    if (!url || typeof url !== 'string') return null;

    const cleanUrl = url.trim();
    const lowerUrl = cleanUrl.toLowerCase();

    // Skip internal browser URLs
    if (lowerUrl.startsWith('lit://') || lowerUrl.startsWith('about:')) {
      return null;
    }

    this._ensureDb();
    const cleanTitle = (title !== undefined && title !== null && String(title).trim().length > 0)
      ? String(title).trim()
      : cleanUrl;
    const visitedAt = new Date().toISOString();

    this.db.run(
      'INSERT INTO history (url, title, visited_at) VALUES (?, ?, ?)',
      [cleanUrl, cleanTitle, visitedAt]
    );
    this.persist();

    return {
      url: cleanUrl,
      title: cleanTitle,
      visited_at: visitedAt
    };
  }

  /**
   * Retrieve recent history entries ordered by visited_at DESC.
   * @param {number} [limit=100]
   * @returns {Promise<Array<object>>}
   */
  async getAll(limit = 100) {
    this._ensureDb();
    const safeLimit = Number(limit) > 0 ? Math.floor(Number(limit)) : 100;
    const stmt = this.db.prepare(
      'SELECT id, url, title, visited_at FROM history ORDER BY visited_at DESC LIMIT ?'
    );
    try {
      stmt.bind([safeLimit]);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  /**
   * Search history by title or URL using LIKE search.
   * @param {string} query
   * @param {number} [limit=50]
   * @returns {Promise<Array<object>>}
   */
  async search(query, limit = 50) {
    this._ensureDb();
    if (!query || typeof query !== 'string') return [];

    const pattern = `%${query.trim()}%`;
    const safeLimit = Number(limit) > 0 ? Math.floor(Number(limit)) : 50;
    const stmt = this.db.prepare(
      'SELECT id, url, title, visited_at FROM history WHERE title LIKE ? OR url LIKE ? ORDER BY visited_at DESC LIMIT ?'
    );
    try {
      stmt.bind([pattern, pattern, safeLimit]);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  /**
   * Delete a specific history entry by id, then persist.
   * @param {number|string} id
   * @returns {Promise<boolean>}
   */
  async deleteEntry(id) {
    this._ensureDb();
    if (id === undefined || id === null) return false;

    this.db.run('DELETE FROM history WHERE id = ?', [Number(id)]);
    this.persist();
    return true;
  }

  /**
   * Clear all history entries, then persist.
   * @returns {Promise<boolean>}
   */
  async clear() {
    this._ensureDb();
    this.db.run('DELETE FROM history');
    this.persist();
    return true;
  }

  /**
   * Retrieve recent unique URLs (distinct URLs with their most recent visit timestamp).
   * @param {number} [limit=10]
   * @returns {Promise<Array<object>>}
   */
  async getRecent(limit = 10) {
    this._ensureDb();
    const safeLimit = Number(limit) > 0 ? Math.floor(Number(limit)) : 10;
    const stmt = this.db.prepare(
      'SELECT id, url, title, MAX(visited_at) AS visited_at FROM history GROUP BY url ORDER BY visited_at DESC LIMIT ?'
    );
    try {
      stmt.bind([safeLimit]);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  /**
   * Close the database after persisting.
   */
  close() {
    if (this.db) {
      this.persist();
      this.db.close();
      this.db = null;
    }
  }

  _ensureDb() {
    if (!this.db) {
      throw new Error('History database not initialized. Please call await init() first.');
    }
  }
}

module.exports = HistoryManager;
