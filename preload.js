const { contextBridge, ipcRenderer } = require('electron');

/**
 * Helper to register an IPC event listener and return a cleanup function.
 * Listens on the primary channel and an alias channel for full compatibility.
 *
 * @param {string} primaryChannel
 * @param {string} secondaryChannel
 * @param {Function} callback
 * @returns {Function} cleanup function that removes the listener
 */
function addListener(primaryChannel, secondaryChannel, callback) {
  if (typeof callback !== 'function') {
    return () => {};
  }
  const handler = (_event, data) => callback(data);
  ipcRenderer.on(primaryChannel, handler);

  return () => {
    ipcRenderer.removeListener(primaryChannel, handler);
  };
}

contextBridge.exposeInMainWorld('lit', {
  // ==========================================
  // Navigation
  // ==========================================
  navigate: (url) => ipcRenderer.send('lit:navigate', url),
  goBack: () => ipcRenderer.send('lit:go-back'),
  goForward: () => ipcRenderer.send('lit:go-forward'),
  reload: () => ipcRenderer.send('lit:reload'),
  stopLoading: () => ipcRenderer.send('lit:stop-loading'),

  // ==========================================
  // Tabs
  // ==========================================
  newTab: (url) => ipcRenderer.send('lit:new-tab', url),
  closeTab: (tabId) => ipcRenderer.send('lit:close-tab', tabId),
  switchTab: (tabId) => ipcRenderer.send('lit:switch-tab', tabId),
  onTabCreated: (callback) =>
    addListener('lit:tab-created', 'lit:on-tab-created', callback),
  onTabUpdated: (callback) =>
    addListener('lit:tab-updated', 'lit:on-tab-updated', callback),
  onTabRemoved: (callback) =>
    addListener('lit:tab-removed', 'lit:on-tab-removed', callback),
  onActiveTabChanged: (callback) =>
    addListener('lit:active-tab-changed', 'lit:on-active-tab-changed', callback),

  // ==========================================
  // Ad Blocker
  // ==========================================
  getBlockedCount: () => ipcRenderer.invoke('lit:get-blocked-count'),
  toggleAdBlocker: (enabled) => ipcRenderer.send('lit:toggle-ad-blocker', enabled),
  isAdBlockerEnabled: () => ipcRenderer.invoke('lit:is-ad-blocker-enabled'),
  onBlockedCountUpdated: (callback) =>
    addListener('lit:blocked-count-updated', 'lit:on-blocked-count-updated', callback),

  // ==========================================
  // Passwords
  // ==========================================
  onPasswordSavePrompt: (callback) =>
    addListener('lit:password-save-prompt', 'lit:on-password-save-prompt', callback),
  savePassword: (entry) => ipcRenderer.send('lit:save-password', entry),
  dismissPasswordSave: () => ipcRenderer.send('lit:dismiss-password-save'),
  getPasswords: () => ipcRenderer.invoke('lit:get-passwords'),
  deletePassword: (id) => ipcRenderer.send('lit:delete-password', id),
  updatePassword: (id, entry) => ipcRenderer.send('lit:update-password', id, entry),
  setMasterPassword: (password) => ipcRenderer.send('lit:set-master-password', password),
  unlockVault: (password) => ipcRenderer.invoke('lit:unlock-vault', password),
  isVaultLocked: () => ipcRenderer.invoke('lit:is-vault-locked'),

  // ==========================================
  // Autofill
  // ==========================================
  getAutofillProfiles: () => ipcRenderer.invoke('lit:get-autofill-profiles'),
  saveAutofillProfile: (profile) => ipcRenderer.send('lit:save-autofill-profile', profile),
  deleteAutofillProfile: (id) => ipcRenderer.send('lit:delete-autofill-profile', id),
  onAutofillSuggestion: (callback) =>
    addListener('lit:autofill-suggestion', 'lit:on-autofill-suggestion', callback),
  acceptAutofill: (profileId, tabId) =>
    ipcRenderer.send('lit:accept-autofill', profileId, tabId),

  // ==========================================
  // Bookmarks
  // ==========================================
  addBookmark: (url, title, favicon) =>
    ipcRenderer.send('lit:add-bookmark', url, title, favicon),
  removeBookmark: (url) => ipcRenderer.send('lit:remove-bookmark', url),
  getBookmarks: () => ipcRenderer.invoke('lit:get-bookmarks'),
  isBookmarked: (url) => ipcRenderer.invoke('lit:is-bookmarked', url),

  // ==========================================
  // History
  // ==========================================
  getHistory: (query, limit) => ipcRenderer.invoke('lit:get-history', query, limit),
  clearHistory: () => ipcRenderer.send('lit:clear-history'),
  deleteHistoryEntry: (id) => ipcRenderer.send('lit:delete-history-entry', id),

  // ==========================================
  // Downloads
  // ==========================================
  onDownloadStarted: (callback) =>
    addListener('lit:download-started', 'lit:on-download-started', callback),
  onDownloadProgress: (callback) =>
    addListener('lit:download-progress', 'lit:on-download-progress', callback),
  onDownloadCompleted: (callback) =>
    addListener('lit:download-completed', 'lit:on-download-completed', callback),
  openDownload: (filePath) => ipcRenderer.send('lit:open-download', filePath),
  showInFolder: (filePath) => ipcRenderer.send('lit:show-in-folder', filePath),
  getDownloads: () => ipcRenderer.invoke('lit:get-downloads'),

  // ==========================================
  // Settings
  // ==========================================
  getSettings: () => ipcRenderer.invoke('lit:get-settings'),
  updateSettings: (settings) => ipcRenderer.send('lit:update-settings', settings),
  onSettingsChanged: (callback) =>
    addListener('lit:settings-changed', 'lit:on-settings-changed', callback),

  // ==========================================
  // Window Controls
  // ==========================================
  minimizeWindow: () => ipcRenderer.send('lit:minimize-window'),
  maximizeWindow: () => ipcRenderer.send('lit:maximize-window'),
  closeWindow: () => ipcRenderer.send('lit:close-window'),
  isMaximized: () => ipcRenderer.invoke('lit:is-maximized'),
  onMaximizedChanged: (callback) =>
    addListener('lit:maximized-changed', 'lit:on-maximized-changed', callback),

  // ==========================================
  // Find in Page
  // ==========================================
  findInPage: (text, options) => ipcRenderer.send('lit:find-in-page', text, options),
  stopFindInPage: () => ipcRenderer.send('lit:stop-find-in-page'),
  onFindResults: (callback) =>
    addListener('lit:find-results', 'lit:on-find-results', callback)
});
