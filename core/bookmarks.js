// Lit Browser - Bookmarks Module
const fs = require('fs');
const path = require('path');

class BookmarksManager {
  constructor() {
    this.userDataPath = '';
    this.filePath = '';
    this.bookmarks = [];
  }

  initialize(userDataPath) {
    this.userDataPath = userDataPath;
    this.filePath = path.join(userDataPath, 'bookmarks.json');
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const data = JSON.parse(raw);
        this.bookmarks = Array.isArray(data) ? data : [];
      } else {
        this.bookmarks = [];
        this.save();
      }
    } catch (e) {
      console.error('[Bookmarks] Error loading bookmarks:', e);
      this.bookmarks = [];
    }
  }

  save() {
    try {
      if (this.userDataPath && !fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.bookmarks, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Bookmarks] Error saving bookmarks:', e);
    }
  }

  addBookmark(url, title, favicon) {
    if (!url) return;
    const existingIndex = this.bookmarks.findIndex((b) => b.url === url);
    const now = Date.now();

    if (existingIndex >= 0) {
      this.bookmarks[existingIndex].title = title || this.bookmarks[existingIndex].title;
      this.bookmarks[existingIndex].favicon = favicon || this.bookmarks[existingIndex].favicon;
      this.bookmarks[existingIndex].updatedAt = now;
    } else {
      const newId = this.bookmarks.length > 0 
        ? Math.max(...this.bookmarks.map((b) => b.id || 0)) + 1 
        : 1;

      this.bookmarks.push({
        id: newId,
        url,
        title: title || url,
        favicon: favicon || '',
        createdAt: now
      });
    }
    this.save();
  }

  removeBookmark(url) {
    this.bookmarks = this.bookmarks.filter((b) => b.url !== url);
    this.save();
  }

  getBookmarks() {
    return Promise.resolve(this.bookmarks);
  }

  isBookmarked(url) {
    const exists = this.bookmarks.some((b) => b.url === url);
    return Promise.resolve(exists);
  }
}

const bookmarksInstance = new BookmarksManager();
module.exports = bookmarksInstance;
