// Lit Browser - Downloads Module
const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

class DownloadsManager {
  constructor() {
    this.userDataPath = '';
    this.filePath = '';
    this.downloads = [];
  }

  initialize(userDataPath) {
    this.userDataPath = userDataPath;
    this.filePath = path.join(userDataPath, 'downloads.json');
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const data = JSON.parse(raw);
        this.downloads = Array.isArray(data) ? data : [];
      } else {
        this.downloads = [];
        this.save();
      }
    } catch (e) {
      console.error('[Downloads] Error loading downloads:', e);
      this.downloads = [];
    }
  }

  save() {
    try {
      if (this.userDataPath && !fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.downloads, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Downloads] Error saving downloads:', e);
    }
  }

  recordDownload(itemData) {
    const existingIndex = this.downloads.findIndex((d) => d.id === itemData.id);
    if (existingIndex >= 0) {
      this.downloads[existingIndex] = { ...this.downloads[existingIndex], ...itemData };
    } else {
      this.downloads.unshift(itemData);
    }
    this.save();
  }

  getDownloads() {
    return Promise.resolve(this.downloads);
  }

  openDownload(filePath) {
    if (filePath && fs.existsSync(filePath)) {
      shell.openPath(filePath);
    }
  }

  showInFolder(filePath) {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
    }
  }
}

const downloadsInstance = new DownloadsManager();
module.exports = downloadsInstance;
