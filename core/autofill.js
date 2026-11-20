const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

/**
 * AutofillManager handles storing, retrieving, and mapping autofill profiles
 * (personal, address, card) for Lit Browser.
 * Card numbers and sensitive card data are encrypted using AES-256-GCM.
 */
class AutofillManager {
  /**
   * @param {string} [dataPath] - Directory where autofill.db will be stored
   */
  constructor(dataPath) {
    this.dataPath = dataPath || '';
    this.dbPath = dataPath ? path.join(dataPath, 'autofill.db') : '';
    this.db = null;
    this.SQL = null;
    this.encryptionKey = null;
  }

  /**
   * Initializes sql.js, creates or loads autofill.db, and ensures profiles table exists.
   */
  async init(dataPath) {
    if (dataPath) {
      this.dataPath = dataPath;
      this.dbPath = path.join(dataPath, 'autofill.db');
    }
    if (!this.dataPath) {
      throw new Error('dataPath is required to initialize AutofillManager');
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

    // Create table: profiles (id, type TEXT, label TEXT, data TEXT, created_at TEXT)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        label TEXT,
        data TEXT,
        created_at TEXT
      );
    `);

    // Derive machine encryption key for sensitive card data
    this.encryptionKey = this._deriveKey();

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
      this.dbPath = path.join(userDataPath, 'autofill.db');
    }
    return this.init();
  }

  /**
   * Derives encryption key from machine info: os.hostname() + os.userInfo().username + 'lit-browser-key'
   * @private
   * @returns {Buffer}
   */
  _deriveKey() {
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
   * Encrypts plaintext using AES-256-GCM.
   * @private
   * @param {string} text
   * @returns {{ encrypted: string, iv: string, authTag: string }}
   */
  _encrypt(text) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
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
   * @private
   * @param {string} encrypted - Hex encrypted string
   * @param {string} iv - Hex IV string
   * @param {string} authTag - Hex authentication tag string
   * @returns {string} Plaintext
   */
  _decrypt(encrypted, iv, authTag) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Encrypts sensitive fields within a card data object.
   * @private
   * @param {object} cardData
   * @returns {object} Copy of cardData with sensitive fields encrypted
   */
  _encryptCardData(cardData) {
    if (!cardData || typeof cardData !== 'object') return cardData;
    const cloned = { ...cardData };
    const sensitiveFields = [
      'number',
      'cardNumber',
      'card_number',
      'cvv',
      'cvc',
      'csc',
      'securityCode',
      'security_code'
    ];

    for (const field of sensitiveFields) {
      const val = cloned[field];
      if (val !== undefined && val !== null) {
        // If already encrypted, skip
        if (typeof val === 'object' && val.encrypted && val.iv && val.authTag) {
          continue;
        }
        cloned[field] = this._encrypt(String(val));
      }
    }

    return cloned;
  }

  /**
   * Decrypts sensitive fields within a card data object.
   * @private
   * @param {object} cardData
   * @returns {object} Copy of cardData with sensitive fields decrypted
   */
  _decryptCardData(cardData) {
    if (!cardData || typeof cardData !== 'object') return cardData;
    const decrypted = { ...cardData };
    const sensitiveFields = [
      'number',
      'cardNumber',
      'card_number',
      'cvv',
      'cvc',
      'csc',
      'securityCode',
      'security_code'
    ];

    for (const field of sensitiveFields) {
      const val = decrypted[field];
      if (val && typeof val === 'object' && val.encrypted && val.iv && val.authTag) {
        try {
          decrypted[field] = this._decrypt(val.encrypted, val.iv, val.authTag);
        } catch (e) {
          // If decryption fails, retain original value
        }
      } else if (typeof val === 'string' && val.startsWith('enc_gcm:')) {
        const parts = val.split(':');
        if (parts.length === 4) {
          try {
            decrypted[field] = this._decrypt(parts[1], parts[2], parts[3]);
          } catch (e) {}
        }
      }
    }

    return decrypted;
  }

  /**
   * Saves a profile: encrypts card data if type is 'card', inserts into DB, and persists.
   * @param {string} type - 'personal', 'address', or 'card'
   * @param {string} label - Display label (e.g. 'Home', 'Work', 'Visa')
   * @param {object|string} data - Profile data object or JSON string
   * @returns {Promise<object>} The saved profile object with decrypted data
   */
  async saveProfile(type, label, data) {
    if (!this.db) {
      throw new Error('AutofillManager is not initialized. Call init() first.');
    }

    const normType = (type || '').trim().toLowerCase();
    const normLabel = (label || '').trim();

    let dataObj;
    if (typeof data === 'string') {
      try {
        dataObj = JSON.parse(data);
      } catch (e) {
        dataObj = { raw: data };
      }
    } else if (data && typeof data === 'object') {
      dataObj = { ...data };
    } else {
      dataObj = {};
    }

    // Encrypt sensitive card numbers if type is 'card'
    const storedObj = normType === 'card' ? this._encryptCardData(dataObj) : dataObj;
    const dataJson = JSON.stringify(storedObj);
    const now = new Date().toISOString();

    this.db.run(
      'INSERT INTO profiles (type, label, data, created_at) VALUES (?, ?, ?, ?)',
      [normType, normLabel, dataJson, now]
    );

    const res = this.db.exec('SELECT last_insert_rowid() as id');
    const id = res[0].values[0][0];

    this._persist();

    return {
      id,
      type: normType,
      label: normLabel,
      data: normType === 'card' ? this._decryptCardData(storedObj) : storedObj,
      created_at: now
    };
  }

  /**
   * Returns all profiles, optionally filtered by type, with card data decrypted.
   * @param {string} [type] - Optional filter: 'personal', 'address', or 'card'
   * @returns {Promise<Array<object>>}
   */
  async getProfiles(type) {
    if (!this.db) {
      throw new Error('AutofillManager is not initialized. Call init() first.');
    }

    let sql = 'SELECT id, type, label, data, created_at FROM profiles';
    const params = [];

    if (type) {
      sql += ' WHERE type = ?';
      params.push(String(type).trim().toLowerCase());
    }

    sql += ' ORDER BY id ASC';

    const rows = this._query(sql, params);
    const results = [];

    for (const row of rows) {
      let parsed = {};
      try {
        parsed = JSON.parse(row.data);
      } catch (e) {
        parsed = row.data;
      }

      if (row.type === 'card' && typeof parsed === 'object' && parsed !== null) {
        parsed = this._decryptCardData(parsed);
      }

      results.push({
        id: row.id,
        type: row.type,
        label: row.label,
        data: parsed,
        created_at: row.created_at
      });
    }

    return results;
  }

  /**
   * Deletes a profile by id and persists.
   * @param {number|string} id
   * @returns {Promise<boolean>}
   */
  async deleteProfile(id) {
    if (!this.db) {
      throw new Error('AutofillManager is not initialized. Call init() first.');
    }

    this.db.run('DELETE FROM profiles WHERE id = ?', [id]);
    this._persist();
    return true;
  }

  /**
   * Maps an individual field name, id, or type to a profile data key using heuristics.
   *
   * Heuristics:
   * - name fields -> personal.name
   * - email -> personal.email
   * - phone -> personal.phone
   * - address/street -> address.street
   * - city -> address.city
   * - state -> address.state
   * - zip -> address.zip
   * - country -> address.country
   * - cc-number/card-number -> card.number
   * - cc-name -> card.name
   * - cc-exp -> card.expiry
   * - cvv/cvc -> card.cvv
   *
   * @private
   * @param {string} raw
   * @returns {string|null}
   */
  _mapFieldToProfileKey(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const str = raw.trim().toLowerCase();
    const clean = str.replace(/[-_ ]+/g, '');

    // 1. Credit card CVV / CVC
    if (
      /^(cc[-_ ]?)?(cvv2?|cvc2?|csc)$/i.test(str) ||
      /security[-_ ]?code|card[-_ ]?verification/i.test(str) ||
      clean === 'cardcvv'
    ) {
      return 'card.cvv';
    }

    // 2. Credit card Expiry
    if (
      /^(cc[-_ ]?)?exp(ir(y|ation))?$/i.test(str) ||
      /exp[-_ ]?date|exp[-_ ]?(month|year)/i.test(str) ||
      /expiration[-_ ]?date/i.test(str) ||
      clean === 'cardexpiry'
    ) {
      return 'card.expiry';
    }

    // 3. Credit card Number
    if (
      /^(cc[-_ ]*|card[-_ ]*)(number|num|no)$/i.test(str) ||
      /^credit[-_ ]?card/i.test(str) ||
      clean === 'ccnumber' ||
      clean === 'cardnumber' ||
      clean === 'ccnum' ||
      clean === 'cardnum' ||
      clean === 'pan'
    ) {
      return 'card.number';
    }

    // 4. Credit card Name
    if (
      /^(cc[-_ ]*|card[-_ ]*)name$/i.test(str) ||
      /card[-_ ]?holder/i.test(str) ||
      /name[-_ ]?on[-_ ]?card/i.test(str) ||
      clean === 'ccname' ||
      clean === 'cardname' ||
      clean === 'cardholdername'
    ) {
      return 'card.name';
    }

    // 5. Email
    if (
      /^e[-_ ]?mail/i.test(str) ||
      clean === 'email' ||
      clean === 'useremail' ||
      clean === 'contactemail' ||
      clean === 'mail'
    ) {
      return 'personal.email';
    }

    // 6. Phone
    if (
      /phone|telephone|mobile|cell/i.test(str) ||
      /^(tel|phone[-_ ]?num(ber)?)$/i.test(str)
    ) {
      return 'personal.phone';
    }

    // 7. Zip / Postal code
    if (/zip|postal|post[-_ ]?code/i.test(str)) {
      return 'address.zip';
    }

    // 8. City
    if (/city|town|locality/i.test(str)) {
      return 'address.city';
    }

    // 9. State / Province / Region
    if (/state|province|region/i.test(str)) {
      return 'address.state';
    }

    // 10. Country
    if (/country/i.test(str)) {
      return 'address.country';
    }

    // 11. Street Address (exclude email-address / ip-address)
    if (/address|addr|street/i.test(str) && !/email|ip[-_ ]?addr/i.test(str)) {
      return 'address.street';
    }

    // 12. Name fields (exclude username/login/domain/filename)
    if (
      (/name/i.test(str) || /fname|lname|surname/i.test(str)) &&
      !/user[-_ ]?name|login|account|host|file|tag|domain/i.test(str)
    ) {
      return 'personal.name';
    }

    return null;
  }

  /**
   * Maps field names (or field descriptor objects) to profile data keys using heuristics.
   *
   * Supported mappings:
   *   name fields -> personal.name, email -> personal.email, phone -> personal.phone
   *   address/street -> address.street, city -> address.city, state -> address.state,
   *   zip -> address.zip, country -> address.country
   *   cc-number/card-number -> card.number, cc-name -> card.name,
   *   cc-exp -> card.expiry, cvv/cvc -> card.cvv
   *
   * @param {Array<string|object>|object|string} formFields
   * @returns {object} Object mapping field names to profile data keys
   */
  getFieldMapping(formFields) {
    if (!formFields) return {};

    const mapping = {};

    const processItem = (item) => {
      if (!item) return;

      if (typeof item === 'string') {
        const target = this._mapFieldToProfileKey(item);
        if (target) {
          mapping[item] = target;
        }
        return;
      }

      if (typeof item === 'object') {
        // Collect candidate names to test heuristics against
        const candidates = [
          item.name,
          item.id,
          item.fieldType,
          item.field,
          item.type,
          item.autocomplete
        ].filter(Boolean);

        let target = null;
        for (const cand of candidates) {
          target = this._mapFieldToProfileKey(cand);
          if (target) break;
        }

        if (target) {
          if (item.name) mapping[item.name] = target;
          if (item.id && !mapping[item.id]) mapping[item.id] = target;
          if (!item.name && !item.id && item.fieldType) mapping[item.fieldType] = target;
        }
      }
    };

    if (Array.isArray(formFields)) {
      for (const item of formFields) {
        processItem(item);
      }
    } else if (typeof formFields === 'string') {
      processItem(formFields);
    } else if (typeof formFields === 'object') {
      if (formFields.name || formFields.id || formFields.fieldType) {
        processItem(formFields);
      } else {
        for (const key of Object.keys(formFields)) {
          const target = this._mapFieldToProfileKey(key);
          if (target) {
            mapping[key] = target;
          }
        }
      }
    }

    return mapping;
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

  /**
   * Generates a client-side autofill JavaScript snippet for injection into web pages.
   * @param {object} profile
   * @returns {string}
   */
  getFillScript(profile) {
    const serialized = JSON.stringify(profile);
    return `(() => {
      try {
        const profile = ${serialized};
        if (!profile) return;
        
        function setInputValue(el, value) {
          if (!el || value === undefined || value === null) return;
          el.focus();
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="password"]), select, textarea'));
        for (const input of inputs) {
          const name = (input.name || '').toLowerCase();
          const id = (input.id || '').toLowerCase();
          const autocomplete = (input.getAttribute('autocomplete') || '').toLowerCase();
          const placeholder = (input.getAttribute('placeholder') || '').toLowerCase();
          const type = (input.type || '').toLowerCase();

          const matchField = (keyword) => name.includes(keyword) || id.includes(keyword) || autocomplete.includes(keyword) || placeholder.includes(keyword);

          if (profile.name && (matchField('name') || autocomplete === 'name' || autocomplete === 'given-name' || matchField('fname'))) {
            setInputValue(input, profile.name);
          } else if (profile.email && (type === 'email' || matchField('email') || autocomplete === 'email')) {
            setInputValue(input, profile.email);
          } else if (profile.phone && (type === 'tel' || matchField('phone') || matchField('tel') || autocomplete === 'tel')) {
            setInputValue(input, profile.phone);
          } else if (profile.address && (matchField('address') || matchField('street') || autocomplete === 'street-address')) {
            setInputValue(input, profile.address);
          } else if (profile.city && (matchField('city') || autocomplete === 'address-level2')) {
            setInputValue(input, profile.city);
          } else if (profile.state && (matchField('state') || matchField('region') || autocomplete === 'address-level1')) {
            setInputValue(input, profile.state);
          } else if (profile.zip && (matchField('zip') || matchField('postal') || autocomplete === 'postal-code')) {
            setInputValue(input, profile.zip);
          } else if (profile.country && (matchField('country') || autocomplete === 'country' || autocomplete === 'country-name')) {
            setInputValue(input, profile.country);
          }
        }
      } catch (err) {
        console.error('[Autofill Fill Error]', err);
      }
    })();`;
  }
}

module.exports = AutofillManager;
