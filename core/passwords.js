const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

/**
 * PasswordManager handles secure credential storage and retrieval for Lit Browser.
 * It uses SQLite via sql.js (pure JavaScript) and encrypts passwords using AES-256-GCM.
 * Keys are derived via PBKDF2 (100,000 iterations, SHA-512, 32 bytes).
 */
class PasswordManager {
  /**
   * @param {string} [dataPath] - Directory where passwords.db will be stored
   */
  constructor(dataPath) {
    this.dataPath = dataPath || '';
    this.dbPath = dataPath ? path.join(dataPath, 'passwords.db') : '';
    this.db = null;
    this.SQL = null;
    this.masterKey = null;
    this.isMasterPasswordSet = false;
  }

  /**
   * Initializes sql.js, creates or loads the database, and ensures tables exist.
   */
  async init(dataPath) {
    if (dataPath) {
      this.dataPath = dataPath;
      this.dbPath = path.join(dataPath, 'passwords.db');
    }
    if (!this.dataPath) {
      throw new Error('dataPath is required to initialize PasswordManager');
    }

    fs.mkdirSync(this.dataPath, { recursive: true });

    if (!this.SQL) {
      this.SQL = await initSqlJs();
    }

    if (fs.existsSync(this.dbPath)) {
      try {
        const buf = fs.readFileSync(this.dbPath);
        if (buf.length > 0) {
          this.db = new this.SQL.Database(buf);
        } else {
          this.db = new this.SQL.Database();
        }
      } catch (err) {
        this.db = new this.SQL.Database();
      }
    } else {
      this.db = new this.SQL.Database();
    }

    // Create required tables
    this.db.run(`
      CREATE TABLE IF NOT EXISTS passwords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT,
        username TEXT,
        encrypted_password TEXT,
        iv TEXT,
        auth_tag TEXT,
        created_at TEXT,
        updated_at TEXT
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS master_key (
        id INTEGER PRIMARY KEY,
        key_hash TEXT,
        salt TEXT
      );
    `);

    // Check if master password is configured
    const rows = this._query('SELECT id, key_hash, salt FROM master_key WHERE id = 1 LIMIT 1');
    if (rows.length > 0) {
      this.isMasterPasswordSet = true;
      this.masterKey = null; // Locked until unlock(password) is called
    } else {
      this.isMasterPasswordSet = false;
      this.masterKey = this._deriveDefaultKey();
    }

    this._persist();
    return this;
  }

  /**
   * Backwards-compatible initializer.
   * @param {string} userDataPath
   */
  async initialize(userDataPath) {
    if (userDataPath) {
      this.dataPath = userDataPath;
      this.dbPath = path.join(userDataPath, 'passwords.db');
    }
    return this.init();
  }

  /**
   * Returns whether the manager is currently locked.
   * @returns {boolean}
   */
  isLocked() {
    return this.masterKey === null;
  }

  /**
   * Returns whether a master password has been configured.
   * @returns {boolean}
   */
  hasMasterPassword() {
    return this.isMasterPasswordSet;
  }

  /**
   * Locks the password manager if a master password is set.
   */
  lock() {
    if (this.isMasterPasswordSet) {
      this.masterKey = null;
    }
  }

  /**
   * Derives default encryption key from machine and user info when no master password is set.
   * key = PBKDF2(os.hostname() + os.userInfo().username + 'lit-browser-key', 'lit-browser-salt', 100000, 32, 'sha512')
   * @private
   * @returns {Buffer}
   */
  _deriveDefaultKey() {
    let username = '';
    try {
      username = (os.userInfo && os.userInfo().username) || '';
    } catch (e) {
      username = process.env.USERNAME || process.env.USER || 'lit-user';
    }
    const rawMaterial = os.hostname() + username + 'lit-browser-key';
    return crypto.pbkdf2Sync(rawMaterial, 'lit-browser-salt', 100000, 32, 'sha512');
  }

  /**
   * Derives key from a password and salt using PBKDF2.
   * @private
   * @param {string} password
   * @param {string|Buffer} salt
   * @returns {Buffer}
   */
  _deriveKeyFromPassword(password, salt) {
    const saltBuffer = typeof salt === 'string' ? Buffer.from(salt, 'hex') : salt;
    return crypto.pbkdf2Sync(String(password), saltBuffer, 100000, 32, 'sha512');
  }

  /**
   * Computes a verification hash for a derived key.
   * @private
   * @param {Buffer} key
   * @returns {string} hex hash
   */
  _hashKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Sets or updates the master password, hashing it and re-encrypting all existing passwords.
   * @param {string} password - New master password
   * @returns {Promise<boolean>}
   */
  async setMasterPassword(password) {
    if (this.isLocked()) {
      throw new Error('Password manager is locked. Unlock before setting master password.');
    }
    if (!password || typeof password !== 'string') {
      throw new Error('Master password must be a non-empty string.');
    }

    // 1. Decrypt all existing passwords using current key
    const existing = await this.getPasswords();

    // 2. Generate new random salt and derive new key
    const saltBuffer = crypto.randomBytes(16);
    const saltHex = saltBuffer.toString('hex');
    const newKey = this._deriveKeyFromPassword(password, saltBuffer);
    const keyHash = this._hashKey(newKey);

    // 3. Re-encrypt all records with the new key
    const now = new Date().toISOString();
    for (const item of existing) {
      const encryptedData = this._encrypt(item.password, newKey);
      this.db.run(
        `UPDATE passwords
         SET encrypted_password = ?, iv = ?, auth_tag = ?, updated_at = ?
         WHERE id = ?`,
        [encryptedData.encrypted, encryptedData.iv, encryptedData.authTag, now, item.id]
      );
    }

    // 4. Update master_key table
    this.db.run('DELETE FROM master_key;');
    this.db.run(
      'INSERT INTO master_key (id, key_hash, salt) VALUES (1, ?, ?);',
      [keyHash, saltHex]
    );

    // 5. Update state
    this.masterKey = newKey;
    this.isMasterPasswordSet = true;
    this._persist();

    return true;
  }

  /**
   * Unlocks the password manager by verifying the master password hash and caching the key.
   * @param {string} password
   * @returns {Promise<boolean>}
   */
  async unlock(password) {
    const rows = this._query('SELECT key_hash, salt FROM master_key WHERE id = 1 LIMIT 1');
    if (rows.length === 0) {
      // No master password set, default machine key is active
      this.masterKey = this._deriveDefaultKey();
      this.isMasterPasswordSet = false;
      return true;
    }

    const { key_hash, salt } = rows[0];
    const candidateKey = this._deriveKeyFromPassword(password, salt);
    const candidateHash = this._hashKey(candidateKey);

    if (crypto.timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(key_hash, 'hex'))) {
      this.masterKey = candidateKey;
      return true;
    }

    return false;
  }

  /**
   * Encrypts plaintext using AES-256-GCM.
   * @param {string} text - Plaintext to encrypt
   * @param {Buffer} [keyOverride] - Optional key to use instead of cached masterKey
   * @returns {{ encrypted: string, iv: string, authTag: string }}
   */
  _encrypt(text, keyOverride = null) {
    const key = keyOverride || this.masterKey;
    if (!key) {
      throw new Error('Password manager is locked');
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(String(text), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag
    };
  }

  /**
   * Decrypts ciphertext using AES-256-GCM.
   * @param {string} encrypted - Hex encrypted string
   * @param {string} iv - Hex IV string
   * @param {string} authTag - Hex authentication tag string
   * @param {Buffer} [keyOverride] - Optional key to use instead of cached masterKey
   * @returns {string} Plaintext
   */
  _decrypt(encrypted, iv, authTag, keyOverride = null) {
    const key = keyOverride || this.masterKey;
    if (!key) {
      throw new Error('Password manager is locked');
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Saves a password: encrypts the password, upserts (by url + username), and persists.
   * @param {string} url
   * @param {string} username
   * @param {string} password
   * @returns {Promise<object>} The saved password object
   */
  async savePassword(url, username, password) {
    if (this.isLocked()) {
      throw new Error('Password manager is locked');
    }

    const normUrl = (url || '').trim();
    const normUser = (username || '').trim();
    const encryptedData = this._encrypt(password);
    const now = new Date().toISOString();

    // Check for existing record by url and username
    const existing = this._query(
      'SELECT id FROM passwords WHERE url = ? AND username = ? LIMIT 1',
      [normUrl, normUser]
    );

    let id;
    if (existing.length > 0) {
      id = existing[0].id;
      this.db.run(
        `UPDATE passwords
         SET encrypted_password = ?, iv = ?, auth_tag = ?, updated_at = ?
         WHERE id = ?`,
        [encryptedData.encrypted, encryptedData.iv, encryptedData.authTag, now, id]
      );
    } else {
      this.db.run(
        `INSERT INTO passwords (url, username, encrypted_password, iv, auth_tag, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [normUrl, normUser, encryptedData.encrypted, encryptedData.iv, encryptedData.authTag, now, now]
      );
      const res = this.db.exec('SELECT last_insert_rowid() as id');
      id = res[0].values[0][0];
    }

    this._persist();

    return {
      id,
      url: normUrl,
      username: normUser,
      password: String(password),
      created_at: now,
      updated_at: now
    };
  }

  /**
   * Returns all passwords with decrypted plain passwords.
   * @returns {Promise<Array<object>>}
   */
  async getPasswords() {
    if (this.isLocked()) {
      throw new Error('Password manager is locked');
    }

    const rows = this._query('SELECT * FROM passwords ORDER BY id ASC');
    const results = [];

    for (const row of rows) {
      try {
        const decrypted = this._decrypt(row.encrypted_password, row.iv, row.auth_tag);
        results.push({
          id: row.id,
          url: row.url,
          username: row.username,
          password: decrypted,
          created_at: row.created_at,
          updated_at: row.updated_at
        });
      } catch (err) {
        results.push({
          id: row.id,
          url: row.url,
          username: row.username,
          password: null,
          error: 'Decryption failed',
          created_at: row.created_at,
          updated_at: row.updated_at
        });
      }
    }

    return results;
  }

  /**
   * Extracts clean hostname/domain from a URL string.
   * @private
   * @param {string} urlStr
   * @returns {string} domain (e.g. "github.com")
   */
  _extractDomain(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return '';
    let str = urlStr.trim();
    if (!/^https?:\/\//i.test(str)) {
      str = 'http://' + str;
    }
    try {
      const parsed = new URL(str);
      let hostname = parsed.hostname.toLowerCase();
      if (hostname.startsWith('www.')) {
        hostname = hostname.slice(4);
      }
      return hostname;
    } catch (e) {
      let cleaned = urlStr.toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
      if (cleaned.startsWith('www.')) cleaned = cleaned.slice(4);
      return cleaned;
    }
  }

  /**
   * Finds matching password for a given URL by domain.
   * Returns the best matching decrypted password object (or null if none found).
   * Also supports indexed access, iteration, and .allMatches for multi-account compatibility.
   * @param {string} url
   * @returns {Promise<object|null>}
   */
  async getPasswordForUrl(url) {
    if (this.isLocked()) {
      throw new Error('Password manager is locked');
    }

    const all = await this.getPasswords();
    const targetDomain = this._extractDomain(url);
    if (!targetDomain) return null;

    const matches = all.filter(p => {
      const pDomain = this._extractDomain(p.url);
      if (!pDomain) return false;
      return (
        pDomain === targetDomain ||
        targetDomain.endsWith('.' + pDomain) ||
        pDomain.endsWith('.' + targetDomain)
      );
    });

    if (matches.length === 0) {
      return null;
    }

    // Sort: exact domain matches first, exact URL matches first, then latest updated_at
    matches.sort((a, b) => {
      const aDomain = this._extractDomain(a.url);
      const bDomain = this._extractDomain(b.url);
      const aExactDomain = aDomain === targetDomain ? 1 : 0;
      const bExactDomain = bDomain === targetDomain ? 1 : 0;
      if (aExactDomain !== bExactDomain) return bExactDomain - aExactDomain;

      const aExactUrl = a.url === url ? 1 : 0;
      const bExactUrl = b.url === url ? 1 : 0;
      if (aExactUrl !== bExactUrl) return bExactUrl - aExactUrl;

      return (b.updated_at || '').localeCompare(a.updated_at || '');
    });

    const primary = matches[0];
    const hybrid = new Proxy(primary, {
      get(target, prop, receiver) {
        if (prop === '0') return target;
        if (prop === 'length') return matches.length;
        if (prop === 'allMatches') return matches;
        if (prop === Symbol.iterator) {
          return function* () {
            yield* matches;
          };
        }
        return Reflect.get(target, prop, receiver);
      }
    });

    return hybrid;
  }

  /**
   * Returns all matching passwords for a given URL domain.
   * @param {string} url
   * @returns {Promise<Array<object>>}
   */
  async getPasswordsForUrl(url) {
    if (this.isLocked()) {
      throw new Error('Password manager is locked');
    }

    const all = await this.getPasswords();
    const targetDomain = this._extractDomain(url);
    if (!targetDomain) return [];

    return all.filter(p => {
      const pDomain = this._extractDomain(p.url);
      if (!pDomain) return false;
      return (
        pDomain === targetDomain ||
        targetDomain.endsWith('.' + pDomain) ||
        pDomain.endsWith('.' + targetDomain)
      );
    });
  }

  /**
   * Updates an existing password by id and persists.
   * @param {number|string} id
   * @param {string} username
   * @param {string} password
   * @returns {Promise<boolean>}
   */
  async updatePassword(id, username, password) {
    if (this.isLocked()) {
      throw new Error('Password manager is locked');
    }

    const normUser = (username || '').trim();
    const encryptedData = this._encrypt(password);
    const now = new Date().toISOString();

    this.db.run(
      `UPDATE passwords
       SET username = ?, encrypted_password = ?, iv = ?, auth_tag = ?, updated_at = ?
       WHERE id = ?`,
      [normUser, encryptedData.encrypted, encryptedData.iv, encryptedData.authTag, now, id]
    );

    this._persist();
    return true;
  }

  /**
   * Deletes a password by id and persists.
   * @param {number|string} id
   * @returns {Promise<boolean>}
   */
  async deletePassword(id) {
    this.db.run('DELETE FROM passwords WHERE id = ?', [id]);
    this._persist();
    return true;
  }

  /**
   * Helper to execute a prepared SQL query and return rows as objects.
   * @private
   * @param {string} sql
   * @param {Array} [params]
   * @returns {Array<object>}
   */
  _query(sql, params = []) {
    const stmt = this.db.prepare(sql);
    if (params && params.length > 0) {
      stmt.bind(params);
    }
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  /**
   * Exports the SQLite database and writes it to disk.
   * @private
   */
  _persist() {
    if (!this.db || !this.dataPath) return;
    fs.mkdirSync(this.dataPath, { recursive: true });
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  /**
   * Closes and persists the database.
   */
  close() {
    if (this.db) {
      this._persist();
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = PasswordManager;
