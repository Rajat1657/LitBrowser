const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

class BookmarksManager {
  /**
   * @param {string} dataPath - Directory where bookmarks.db will be stored, or direct path to bookmarks.db
   */
  constructor(dataPath) {
    if (!dataPath) {
      throw new Error('BookmarksManager requires a dataPath');
    }
    this.dataPath = dataPath;
    this.dbPath = (typeof dataPath === 'string' && dataPath.toLowerCase().endsWith('.db'))
      ? dataPath
      : path.join(dataPath, 'bookmarks.db');
    this.db = null;
    this.SQL = null;
  }

  /**
   * Initialize sql.js, open/create bookmarks.db, and ensure table exists.
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
        console.warn('[BookmarksManager] Failed to read existing db file, creating fresh database:', err);
        this.db = new this.SQL.Database();
      }
    } else {
      this.db = new this.SQL.Database();
    }

    this.db.run(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE,
        title TEXT,
        favicon TEXT,
        created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_bookmarks_url ON bookmarks (url);
      CREATE INDEX IF NOT EXISTS idx_bookmarks_created ON bookmarks (created_at DESC);
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
   * Add a bookmark (insert or replace by url), then persist.
   * @param {string} url
   * @param {string} [title]
   * @param {string} [favicon]
   * @returns {Promise<object>} The added bookmark object
   */
  async add(url, title, favicon) {
    this._ensureDb();
    if (!url || typeof url !== 'string') {
      throw new Error('Valid URL is required to add bookmark');
    }

    const cleanUrl = url.trim();
    const cleanTitle = (title !== undefined && title !== null && String(title).trim().length > 0)
      ? String(title).trim()
      : cleanUrl;
    const cleanFavicon = (favicon !== undefined && favicon !== null) ? String(favicon).trim() : '';
    const createdAt = new Date().toISOString();

    this.db.run(
      'INSERT OR REPLACE INTO bookmarks (url, title, favicon, created_at) VALUES (?, ?, ?, ?)',
      [cleanUrl, cleanTitle, cleanFavicon, createdAt]
    );
    this.persist();

    return {
      url: cleanUrl,
      title: cleanTitle,
      favicon: cleanFavicon,
      created_at: createdAt
    };
  }

  /**
   * Remove a bookmark by URL, then persist.
   * @param {string} url
   * @returns {Promise<boolean>} True if operation succeeded
   */
  async remove(url) {
    this._ensureDb();
    if (!url || typeof url !== 'string') return false;

    this.db.run('DELETE FROM bookmarks WHERE url = ?', [url.trim()]);
    this.persist();
    return true;
  }

  /**
   * Retrieve all bookmarks ordered by created_at DESC.
   * @returns {Promise<Array<object>>}
   */
  async getAll() {
    this._ensureDb();
    const stmt = this.db.prepare(
      'SELECT id, url, title, favicon, created_at FROM bookmarks ORDER BY created_at DESC'
    );
    try {
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
   * Check if a URL is currently bookmarked.
   * @param {string} url
   * @returns {Promise<boolean>}
   */
  async isBookmarked(url) {
    this._ensureDb();
    if (!url || typeof url !== 'string') return false;

    const stmt = this.db.prepare('SELECT 1 FROM bookmarks WHERE url = ? LIMIT 1');
    try {
      stmt.bind([url.trim()]);
      return stmt.step();
    } finally {
      stmt.free();
    }
  }

  /**
   * Search bookmarks by title or URL using LIKE search.
   * @param {string} query
   * @returns {Promise<Array<object>>}
   */
  async search(query) {
    this._ensureDb();
    if (!query || typeof query !== 'string') return [];

    const pattern = `%${query.trim()}%`;
    const stmt = this.db.prepare(
      'SELECT id, url, title, favicon, created_at FROM bookmarks WHERE title LIKE ? OR url LIKE ? ORDER BY created_at DESC'
    );
    try {
      stmt.bind([pattern, pattern]);
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
      throw new Error('Bookmarks database not initialized. Please call await init() first.');
    }
  }
}

module.exports = BookmarksManager;
