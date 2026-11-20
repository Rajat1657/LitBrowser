// Lit Browser - History Module
const fs = require('fs');
const path = require('path');

class HistoryManager {
  constructor() {
    this.userDataPath = '';
    this.filePath = '';
    this.history = [];
    this.maxEntries = 10000;
  }

  initialize(userDataPath) {
    this.userDataPath = userDataPath;
    this.filePath = path.join(userDataPath, 'history.json');
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const data = JSON.parse(raw);
        this.history = Array.isArray(data) ? data : [];
      } else {
        this.history = [];
        this.save();
      }
    } catch (e) {
      console.error('[History] Error loading history:', e);
      this.history = [];
    }
  }

  save() {
    try {
      if (this.userDataPath && !fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.history, null, 2), 'utf-8');
    } catch (e) {
      console.error('[History] Error saving history:', e);
    }
  }

  addEntry(urlOrObj, maybeTitle) {
    let url = '';
    let title = '';

    if (typeof urlOrObj === 'object' && urlOrObj !== null) {
      url = urlOrObj.url || '';
      title = urlOrObj.title || url;
    } else {
      url = urlOrObj || '';
      title = maybeTitle || url;
    }

    if (!url || url.startsWith('about:') || url.startsWith('lit://newtab')) {
      return;
    }

    const now = Date.now();
    const existingIndex = this.history.findIndex((h) => h.url === url);

    if (existingIndex >= 0) {
      const item = this.history[existingIndex];
      item.title = title || item.title;
      item.visitTime = now;
      item.visitCount = (item.visitCount || 1) + 1;
      // Move to top
      this.history.splice(existingIndex, 1);
      this.history.unshift(item);
    } else {
      const newId = this.history.length > 0 
        ? Math.max(...this.history.map((h) => h.id || 0)) + 1 
        : 1;

      this.history.unshift({
        id: newId,
        url,
        title: title || url,
        visitTime: now,
        visitCount: 1
      });
    }

    if (this.history.length > this.maxEntries) {
      this.history = this.history.slice(0, this.maxEntries);
    }

    this.save();
  }

  getHistory(query = '', limit = 100) {
    let results = this.history;
    if (query && typeof query === 'string' && query.trim().length > 0) {
      const q = query.toLowerCase().trim();
      results = results.filter(
        (h) => (h.title && h.title.toLowerCase().includes(q)) || 
               (h.url && h.url.toLowerCase().includes(q))
      );
    }

    const max = typeof limit === 'number' && limit > 0 ? limit : 100;
    return Promise.resolve(results.slice(0, max));
  }

  clearHistory() {
    this.history = [];
    this.save();
  }

  deleteHistoryEntry(id) {
    this.history = this.history.filter((h) => h.id !== Number(id));
    this.save();
  }
}

const historyInstance = new HistoryManager();
module.exports = historyInstance;
