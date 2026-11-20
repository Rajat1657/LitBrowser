// Lit Browser - Main Electron Process
// A super lightweight, minimalistic browser for Windows

const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  session,
  protocol,
  Menu,
  shell,
  nativeTheme,
  net
} = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// -------------------------------------------------------------
// Module Loader Helper (Supports both Class and Object exports)
// -------------------------------------------------------------
function getModuleInstance(mod, arg) {
  if (!mod) return null;
  if (typeof mod === 'function') {
    try {
      return new mod(arg);
    } catch (e) {
      return new mod();
    }
  }
  return mod;
}

// -------------------------------------------------------------
// Core Modules Requirements
// -------------------------------------------------------------
let adblocker;
let passwords;
let autofill;
let bookmarks;
let history;
let downloads;

try {
  adblocker = getModuleInstance(require('./core/adblocker'));
} catch (e) {
  console.warn('[Lit] Failed to load ./core/adblocker:', e.message);
}

try {
  passwords = getModuleInstance(require('./core/passwords'));
} catch (e) {
  console.warn('[Lit] Failed to load ./core/passwords:', e.message);
}

try {
  autofill = getModuleInstance(require('./core/autofill'));
} catch (e) {
  console.warn('[Lit] Failed to load ./core/autofill:', e.message);
}

try {
  bookmarks = getModuleInstance(require('./core/bookmarks'));
} catch (e) {
  console.warn('[Lit] Failed to load ./core/bookmarks:', e.message);
}

try {
  history = getModuleInstance(require('./core/history'));
} catch (e) {
  console.warn('[Lit] Failed to load ./core/history:', e.message);
}

try {
  downloads = getModuleInstance(require('./core/downloads'));
} catch (e) {
  console.warn('[Lit] Failed to load ./core/downloads:', e.message);
}

// -------------------------------------------------------------
// Constants & Application State
// -------------------------------------------------------------
const CHROME_HEIGHT = 86; // 86px modern unified chrome area from top
let mainWindow = null;
let activeTabId = null;
const tabs = new Map(); // tabId -> { id, view, url, title, favicon, loading, canGoBack, canGoForward, blockedCount }
let tabCounter = 0;
let pendingPasswordEntry = null;

// Settings Management
const DEFAULT_SETTINGS = {
  theme: 'dark',
  searchEngine: 'duckduckgo',
  adBlocker: true,
  homePage: 'lit://newtab'
};
let settings = { ...DEFAULT_SETTINGS };
let settingsFilePath = '';

function initSettings() {
  const userData = app.getPath('userData');
  settingsFilePath = path.join(userData, 'settings.json');
  try {
    if (fs.existsSync(settingsFilePath)) {
      const data = JSON.parse(fs.readFileSync(settingsFilePath, 'utf-8'));
      settings = { ...DEFAULT_SETTINGS, ...data };
    } else {
      if (!fs.existsSync(userData)) {
        fs.mkdirSync(userData, { recursive: true });
      }
      fs.writeFileSync(settingsFilePath, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('[Lit] Failed to load settings:', err);
    settings = { ...DEFAULT_SETTINGS };
  }

  applyTheme(settings.theme);
}

function applyTheme(theme) {
  if (theme === 'light') {
    nativeTheme.themeSource = 'light';
  } else if (theme === 'system') {
    nativeTheme.themeSource = 'system';
  } else {
    nativeTheme.themeSource = 'dark';
  }
}

function saveSettings(newSettings) {
  settings = { ...settings, ...newSettings };
  try {
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Lit] Failed to save settings:', err);
  }

  if (newSettings.theme !== undefined) {
    applyTheme(newSettings.theme);
  }

  if (newSettings.adBlocker !== undefined && adblocker) {
    if (typeof adblocker.toggle === 'function') {
      adblocker.toggle(newSettings.adBlocker);
    } else if (typeof adblocker.setEnabled === 'function') {
      adblocker.setEnabled(newSettings.adBlocker);
    }
  }

  emitToRenderer(['settings-changed', 'settingsChanged', 'onSettingsChanged'], settings);
}

// -------------------------------------------------------------
// Content Scripts Caching
// -------------------------------------------------------------
let formDetectorScript = '';
const formDetectorPath = path.join(__dirname, 'src', 'content', 'form-detector.js');

function getFormDetectorScript() {
  if (!formDetectorScript) {
    try {
      if (fs.existsSync(formDetectorPath)) {
        const mod = require(formDetectorPath);
        formDetectorScript = typeof mod === 'string' ? mod : fs.readFileSync(formDetectorPath, 'utf-8');
      }
    } catch (e) {
      try {
        let content = fs.readFileSync(formDetectorPath, 'utf-8');
        content = content.replace(/^module\.exports\s*=\s*[`'"]/, '').replace(/[`'"];?\s*$/, '');
        formDetectorScript = content;
      } catch (err) {
        console.error('[Lit] Error reading form-detector.js:', err);
      }
    }
  }
  return formDetectorScript;
}

let autofillDetectorScript = '';
const autofillDetectorPath = path.join(__dirname, 'src', 'content', 'autofill.js');

function getAutofillDetectorScript() {
  if (!autofillDetectorScript) {
    try {
      if (fs.existsSync(autofillDetectorPath)) {
        autofillDetectorScript = fs.readFileSync(autofillDetectorPath, 'utf-8');
      }
    } catch (e) {
      console.error('[Lit] Error reading autofill.js:', e);
    }
  }
  return autofillDetectorScript;
}

// -------------------------------------------------------------
// Protocol Registration (Must be called before app ready)
// -------------------------------------------------------------
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'lit',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

// -------------------------------------------------------------
// Single Instance Lock
// -------------------------------------------------------------
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const lastArg = commandLine[commandLine.length - 1];
      if (lastArg && (lastArg.startsWith('http://') || lastArg.startsWith('https://') || lastArg.startsWith('lit://'))) {
        createTab(lastArg);
      }
    }
  });
}

// -------------------------------------------------------------
// Helper: URL formatting
// -------------------------------------------------------------
function formatUrl(input, searchEngine = 'duckduckgo') {
  if (!input) return settings.homePage || 'lit://newtab';
  input = input.trim();

  if (input.startsWith('lit://') || input.startsWith('about:') || input.startsWith('file://')) {
    return input;
  }

  if (/^https?:\/\//i.test(input)) {
    return input;
  }

  // Check if input looks like a valid domain or local address
  const isDomain = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/i.test(input) ||
                   /^localhost(:\d+)?(\/.*)?$/i.test(input) ||
                   /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(input);

  if (isDomain) {
    return 'https://' + input;
  }

  // Otherwise treat as search engine query
  const query = encodeURIComponent(input);
  switch ((searchEngine || 'duckduckgo').toLowerCase()) {
    case 'google':
      return `https://www.google.com/search?q=${query}`;
    case 'bing':
      return `https://www.bing.com/search?q=${query}`;
    case 'duckduckgo':
    default:
      return `https://duckduckgo.com/?q=${query}`;
  }
}

// -------------------------------------------------------------
// Helper: Broadcast to Renderer
// -------------------------------------------------------------
function emitToRenderer(channels, ...args) {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents) return;
  const channelList = Array.isArray(channels) ? channels : [channels];
  const toSend = new Set();
  for (const ch of channelList) {
    toSend.add(ch);
    toSend.add(`lit:${ch}`);
    toSend.add(`lit:on-${ch}`);
    const kebab = ch.replace(/([A-Z])/g, '-$1').toLowerCase();
    toSend.add(kebab);
    toSend.add(`lit:${kebab}`);
    toSend.add(`lit:on-${kebab}`);
  }
  for (const targetCh of toSend) {
    try {
      mainWindow.webContents.send(targetCh, ...args);
    } catch (e) {}
  }
}

// -------------------------------------------------------------
// Tab Management via WebContentsView
// -------------------------------------------------------------
function updateTabBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const { width, height } = mainWindow.getContentBounds();
  const contentHeight = Math.max(0, height - CHROME_HEIGHT);

  for (const [id, tab] of tabs.entries()) {
    if (tab && tab.view) {
      if (id === activeTabId) {
        tab.view.setBounds({ x: 0, y: CHROME_HEIGHT, width, height: contentHeight });
      } else {
        tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      }
    }
  }
}

function updateNavState(tab) {
  if (!tab || !tab.view || tab.view.webContents.isDestroyed()) return;
  const wc = tab.view.webContents;
  tab.canGoBack = wc.navigationHistory ? wc.navigationHistory.canGoBack() : wc.canGoBack();
  tab.canGoForward = wc.navigationHistory ? wc.navigationHistory.canGoForward() : wc.canGoForward();
}

function emitTabUpdated(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) return;
  emitToRenderer(['tab-updated', 'tabUpdated', 'onTabUpdated'], {
    id: tab.id,
    url: tab.url,
    title: tab.title,
    favicon: tab.favicon,
    loading: tab.loading,
    canGoBack: tab.canGoBack,
    canGoForward: tab.canGoForward
  });
}

function createTab(initialUrl) {
  tabCounter++;
  const tabId = 'tab-' + Date.now() + '-' + tabCounter;

  // Tab WebPreferences: contextIsolation: true, nodeIntegration: false, sandbox: true, NO preload
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
      // NO preload
    }
  });

  const tab = {
    id: tabId,
    view: view,
    url: initialUrl || settings.homePage || 'lit://newtab',
    title: 'New Tab',
    favicon: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    blockedCount: 0
  };

  tabs.set(tabId, tab);
  mainWindow.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });

  // Attach tab events
  setupTabWebContents(tab);

  // Emit created event
  emitToRenderer(['tab-created', 'tabCreated', 'onTabCreated'], {
    id: tabId,
    url: tab.url,
    title: tab.title
  });

  // Switch to this new tab
  switchTab(tabId);

  // Navigate to initial URL
  const target = formatUrl(tab.url, settings.searchEngine);
  view.webContents.loadURL(target).catch((err) => {
    console.error(`[Lit] Error loading ${target}:`, err.message);
  });

  return tabId;
}

function switchTab(tabId) {
  if (!tabs.has(tabId)) return;
  activeTabId = tabId;
  updateTabBounds();

  const activeTab = tabs.get(tabId);
  if (activeTab && activeTab.view && !activeTab.view.webContents.isDestroyed()) {
    activeTab.view.webContents.focus();
    updateNavState(activeTab);
    emitTabUpdated(tabId);
    emitToRenderer(['blocked-count-updated', 'blockedCountUpdated', 'onBlockedCountUpdated'], {
      tabId: tabId,
      count: activeTab.blockedCount || 0
    });
  }

  emitToRenderer(['active-tab-changed', 'activeTabChanged', 'onActiveTabChanged'], tabId);
}

let lastTabCreateTime = 0;
let lastTabCloseTime = 0;

function safeCreateTab(initialUrl) {
  const now = Date.now();
  if (now - lastTabCreateTime < 300) return null;
  lastTabCreateTime = now;
  return createTab(initialUrl);
}

function safeCloseTab(tabId) {
  const now = Date.now();
  if (now - lastTabCloseTime < 300) return;
  lastTabCloseTime = now;

  const targetId = tabId || activeTabId;
  if (!targetId || !tabs.has(targetId)) return;

  if (tabs.size === 1) {
    const onlyTab = tabs.get(targetId);
    if (onlyTab) {
      if (onlyTab.url !== 'lit://newtab') {
        onlyTab.url = 'lit://newtab';
        onlyTab.title = 'New Tab';
        onlyTab.favicon = '';
        onlyTab.blockedCount = 0;
        onlyTab.view.webContents.loadURL('lit://newtab').catch(() => {});
        emitTabUpdated(targetId);
      }
      return;
    }
  }

  closeTab(targetId);
}

function closeTab(tabId) {
  if (!tabs.has(tabId)) return;
  const tab = tabs.get(tabId);

  const tabIds = Array.from(tabs.keys());
  const currentIndex = tabIds.indexOf(tabId);
  let nextActiveId = null;

  if (activeTabId === tabId) {
    if (tabIds.length > 1) {
      if (currentIndex > 0) {
        nextActiveId = tabIds[currentIndex - 1];
      } else {
        nextActiveId = tabIds[currentIndex + 1];
      }
    }
  }

  try {
    mainWindow.contentView.removeChildView(tab.view);
  } catch (e) {}

  try {
    tab.view.webContents.close();
  } catch (e) {}

  tabs.delete(tabId);
  emitToRenderer(['tab-removed', 'tabRemoved', 'onTabRemoved'], tabId);

  if (tabs.size === 0) {
    createTab(settings.homePage || 'lit://newtab');
  } else if (nextActiveId) {
    switchTab(nextActiveId);
  }
}

function switchNextTab() {
  const tabIds = Array.from(tabs.keys());
  if (tabIds.length <= 1) return;
  const currentIndex = tabIds.indexOf(activeTabId);
  const nextIndex = (currentIndex + 1) % tabIds.length;
  switchTab(tabIds[nextIndex]);
}

function switchPrevTab() {
  const tabIds = Array.from(tabs.keys());
  if (tabIds.length <= 1) return;
  const currentIndex = tabIds.indexOf(activeTabId);
  const prevIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
  switchTab(tabIds[prevIndex]);
}

// -------------------------------------------------------------
// Tab WebContents Event Listeners & Context Menu
// -------------------------------------------------------------
function setupTabWebContents(tab) {
  const wc = tab.view.webContents;

  // Window open / new window handling
  wc.setWindowOpenHandler(({ url }) => {
    createTab(url);
    return { action: 'deny' };
  });

  wc.on('new-window', (e, url) => {
    e.preventDefault();
    createTab(url);
  });

  // Navigation state events
  wc.on('did-start-loading', () => {
    tab.loading = true;
    updateNavState(tab);
    emitTabUpdated(tab.id);
  });

  wc.on('did-stop-loading', () => {
    tab.loading = false;
    updateNavState(tab);
    emitTabUpdated(tab.id);
  });

  wc.on('will-navigate', (event, url) => {
    tab.url = url;
    updateNavState(tab);
    emitTabUpdated(tab.id);
  });

  wc.on('did-navigate', (event, url) => {
    tab.url = url;
    tab.title = wc.getTitle() || tab.title;
    updateNavState(tab);
    emitTabUpdated(tab.id);

    // Track history on navigation
    if (history && url && !url.startsWith('lit://newtab') && !url.startsWith('about:')) {
      if (typeof history.addEntry === 'function') {
        history.addEntry({ url, title: tab.title });
      } else if (typeof history.addHistory === 'function') {
        history.addHistory(url, tab.title);
      }
    }
  });

  wc.on('did-navigate-in-page', (event, url, isMainFrame) => {
    if (isMainFrame) {
      tab.url = url;
      updateNavState(tab);
      emitTabUpdated(tab.id);
    }
  });

  wc.on('page-title-updated', (event, title) => {
    tab.title = title;
    emitTabUpdated(tab.id);
  });

  wc.on('page-favicon-updated', (event, favicons) => {
    if (favicons && favicons.length > 0) {
      tab.favicon = favicons[0];
      emitTabUpdated(tab.id);
    }
  });

  wc.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame) {
      tab.loading = false;
      updateNavState(tab);
      emitTabUpdated(tab.id);
    }
  });

  // Execute form detector and autofill script on did-finish-load
  wc.on('did-finish-load', () => {
    const curUrl = wc.getURL() || '';
    if (curUrl.startsWith('lit://') || curUrl.startsWith('about:')) return;

    const detector = getFormDetectorScript();
    if (detector) {
      wc.executeJavaScript(detector).catch(() => {});
    }

    const autofillScript = getAutofillDetectorScript();
    if (autofillScript) {
      wc.executeJavaScript(autofillScript).catch(() => {});
    }
  });

  // Intercept password prompts and autofill suggestions from console messages
  wc.on('console-message', (...args) => {
    let messageText = '';
    for (const arg of args) {
      if (typeof arg === 'string' && arg.startsWith('__LIT_')) {
        messageText = arg;
        break;
      } else if (arg && typeof arg === 'object' && typeof arg.message === 'string' && arg.message.startsWith('__LIT_')) {
        messageText = arg.message;
        break;
      }
    }

    if (!messageText) return;

    if (messageText.startsWith('__LIT_PASSWORD_PROMPT__:')) {
      try {
        const payload = JSON.parse(messageText.slice('__LIT_PASSWORD_PROMPT__:'.length));
        pendingPasswordEntry = {
          url: payload.url || tab.url,
          username: payload.username || '',
          password: payload.password || ''
        };
        emitToRenderer(['password-save-prompt', 'passwordSavePrompt', 'onPasswordSavePrompt'], pendingPasswordEntry);
      } catch (err) {
        console.error('[Lit] Failed to parse password payload:', err);
      }
    } else if (messageText.startsWith('__LIT_AUTOFILL_SUGGESTION__:')) {
      try {
        const payload = JSON.parse(messageText.slice('__LIT_AUTOFILL_SUGGESTION__:'.length));
        emitToRenderer(['autofill-suggestion', 'autofillSuggestion', 'onAutofillSuggestion'], payload);
      } catch (err) {
        console.error('[Lit] Failed to parse autofill payload:', err);
      }
    }
  });

  // Find in page results
  wc.on('found-in-page', (event, result) => {
    emitToRenderer(['find-results', 'findResults', 'onFindResults'], result);
  });

  // Context Menu: Back, Forward, Reload, Copy, Paste, Select All, Save Image, Open Link in New Tab
  wc.on('context-menu', (event, params) => {
    const canBack = wc.navigationHistory ? wc.navigationHistory.canGoBack() : wc.canGoBack();
    const canForward = wc.navigationHistory ? wc.navigationHistory.canGoForward() : wc.canGoForward();

    const menuTemplate = [
      {
        label: 'Back',
        enabled: canBack,
        click: () => {
          if (wc.navigationHistory) wc.navigationHistory.goBack();
          else wc.goBack();
        }
      },
      {
        label: 'Forward',
        enabled: canForward,
        click: () => {
          if (wc.navigationHistory) wc.navigationHistory.goForward();
          else wc.goForward();
        }
      },
      {
        label: 'Reload',
        click: () => wc.reload()
      },
      { type: 'separator' },
      {
        label: 'Copy',
        role: 'copy',
        enabled: (params.editFlags && params.editFlags.canCopy) || !!params.selectionText
      },
      {
        label: 'Paste',
        role: 'paste',
        enabled: params.editFlags ? params.editFlags.canPaste : true
      },
      {
        label: 'Select All',
        role: 'selectAll',
        enabled: params.editFlags ? params.editFlags.canSelectAll : true
      }
    ];

    if (params.mediaType === 'image' || params.srcURL) {
      menuTemplate.push(
        { type: 'separator' },
        {
          label: 'Save Image',
          click: () => {
            if (params.srcURL) {
              wc.downloadURL(params.srcURL);
            }
          }
        }
      );
    }

    if (params.linkURL) {
      menuTemplate.push(
        { type: 'separator' },
        {
          label: 'Open Link in New Tab',
          click: () => {
            createTab(params.linkURL);
          }
        }
      );
    }

    const contextMenu = Menu.buildFromTemplate(menuTemplate);
    contextMenu.popup({ window: mainWindow });
  });

  // Tab WebContents before-input-event for keyboard shortcuts
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    const key = (input.key || '').toLowerCase();
    const ctrl = input.control;
    const shift = input.shift;
    const alt = input.alt;

    if (ctrl && !shift && !alt && key === 't') {
      event.preventDefault();
      safeCreateTab();
    } else if (ctrl && !shift && !alt && key === 'w') {
      event.preventDefault();
      safeCloseTab(tab.id);
    } else if (ctrl && !shift && !alt && key === 'tab') {
      event.preventDefault();
      switchNextTab();
    } else if (ctrl && shift && !alt && key === 'tab') {
      event.preventDefault();
      switchPrevTab();
    } else if (ctrl && !shift && !alt && key === 'l') {
      event.preventDefault();
      emitToRenderer(['focus-url-bar', 'focusUrlBar']);
    } else if ((ctrl && !shift && !alt && key === 'r') || input.key === 'F5') {
      event.preventDefault();
      wc.reload();
    } else if (ctrl && !shift && !alt && key === 'f') {
      event.preventDefault();
      emitToRenderer(['open-find', 'find-in-page', 'findInPage']);
    } else if (alt && !ctrl && !shift && input.key === 'ArrowLeft') {
      event.preventDefault();
      if (wc.navigationHistory ? wc.navigationHistory.canGoBack() : wc.canGoBack()) {
        if (wc.navigationHistory) wc.navigationHistory.goBack();
        else wc.goBack();
      }
    } else if (alt && !ctrl && !shift && input.key === 'ArrowRight') {
      event.preventDefault();
      if (wc.navigationHistory ? wc.navigationHistory.canGoForward() : wc.canGoForward()) {
        if (wc.navigationHistory) wc.navigationHistory.goForward();
        else wc.goForward();
      }
    } else if (ctrl && !shift && !alt && key === 'd') {
      event.preventDefault();
      emitToRenderer(['prompt-bookmark', 'add-bookmark', 'bookmarkCurrentPage'], {
        url: tab.url,
        title: tab.title,
        favicon: tab.favicon
      });
    } else if (ctrl && !shift && !alt && key === 'h') {
      event.preventDefault();
      emitToRenderer(['open-history', 'toggle-history', 'openHistory']);
    } else if (input.key === 'F11') {
      event.preventDefault();
      if (mainWindow) {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
      }
    } else if (input.key === 'F12') {
      event.preventDefault();
      const isDev = process.argv.includes('--dev') || !app.isPackaged;
      if (isDev) {
        wc.toggleDevTools();
      }
    }
  });
}

// -------------------------------------------------------------
// Application Menu & Accelerators
// -------------------------------------------------------------
function setupApplicationMenu() {
  const isDev = process.argv.includes('--dev') || !app.isPackaged;

  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => safeCreateTab()
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            if (activeTabId) safeCloseTab(activeTabId);
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find in Page',
          accelerator: 'CmdOrCtrl+F',
          click: () => {
            emitToRenderer(['open-find', 'find-in-page', 'findInPage']);
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            const activeTab = tabs.get(activeTabId);
            if (activeTab && activeTab.view) activeTab.view.webContents.reload();
          }
        },
        {
          label: 'Reload (F5)',
          accelerator: 'F5',
          visible: false,
          acceleratorWorksWhenHidden: true,
          click: () => {
            const activeTab = tabs.get(activeTabId);
            if (activeTab && activeTab.view) activeTab.view.webContents.reload();
          }
        },
        {
          label: 'Toggle Fullscreen',
          accelerator: 'F11',
          click: () => {
            if (mainWindow) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen());
            }
          }
        },
        {
          label: 'Developer Tools',
          accelerator: 'F12',
          click: () => {
            if (isDev) {
              const activeTab = tabs.get(activeTabId);
              if (activeTab && activeTab.view) {
                activeTab.view.webContents.toggleDevTools();
              } else if (mainWindow) {
                mainWindow.webContents.toggleDevTools();
              }
            }
          }
        }
      ]
    },
    {
      label: 'Navigation',
      submenu: [
        {
          label: 'Back',
          accelerator: 'Alt+Left',
          click: () => {
            const activeTab = tabs.get(activeTabId);
            if (activeTab && activeTab.view) {
              const wc = activeTab.view.webContents;
              if (wc.navigationHistory ? wc.navigationHistory.canGoBack() : wc.canGoBack()) {
                if (wc.navigationHistory) wc.navigationHistory.goBack();
                else wc.goBack();
              }
            }
          }
        },
        {
          label: 'Forward',
          accelerator: 'Alt+Right',
          click: () => {
            const activeTab = tabs.get(activeTabId);
            if (activeTab && activeTab.view) {
              const wc = activeTab.view.webContents;
              if (wc.navigationHistory ? wc.navigationHistory.canGoForward() : wc.canGoForward()) {
                if (wc.navigationHistory) wc.navigationHistory.goForward();
                else wc.goForward();
              }
            }
          }
        },
        {
          label: 'Next Tab',
          accelerator: 'Ctrl+Tab',
          click: () => switchNextTab()
        },
        {
          label: 'Previous Tab',
          accelerator: 'Ctrl+Shift+Tab',
          click: () => switchPrevTab()
        },
        {
          label: 'Focus Address Bar',
          accelerator: 'CmdOrCtrl+L',
          click: () => {
            emitToRenderer(['focus-url-bar', 'focusUrlBar']);
          }
        },
        {
          label: 'Bookmark Current Page',
          accelerator: 'CmdOrCtrl+D',
          click: () => {
            const activeTab = tabs.get(activeTabId);
            if (activeTab) {
              emitToRenderer(['prompt-bookmark', 'add-bookmark', 'bookmarkCurrentPage'], {
                url: activeTab.url,
                title: activeTab.title,
                favicon: activeTab.favicon
              });
            }
          }
        },
        {
          label: 'History Panel',
          accelerator: 'CmdOrCtrl+H',
          click: () => {
            emitToRenderer(['open-history', 'toggle-history', 'openHistory']);
          }
        }
      ]
    }
  ];

  const appMenu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(appMenu);
}

// -------------------------------------------------------------
// Window Setup
// -------------------------------------------------------------
function createMainWindow() {
  // Frameless BrowserWindow (custom title bar). Size 1200x800 default, min 800x500.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#141414',
    icon: path.join(__dirname, 'assets', 'icons', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.on('maximize', () => {
    updateTabBounds();
    emitToRenderer(['maximized-changed', 'maximizedChanged', 'onMaximizedChanged'], true);
  });

  mainWindow.on('unmaximize', () => {
    updateTabBounds();
    emitToRenderer(['maximized-changed', 'maximizedChanged', 'onMaximizedChanged'], false);
  });

  mainWindow.on('resize', () => {
    updateTabBounds();
  });

  mainWindow.on('restore', () => {
    updateTabBounds();
  });

  // Load the browser chrome UI
  const chromeUiPath = path.join(__dirname, 'src', 'browser', 'index.html');
  const rootIndexHtml = path.join(__dirname, 'index.html');

  if (fs.existsSync(chromeUiPath)) {
    mainWindow.loadFile(chromeUiPath);
  } else if (fs.existsSync(rootIndexHtml)) {
    mainWindow.loadFile(rootIndexHtml);
  } else {
    mainWindow.loadFile(chromeUiPath);
  }

  // Once mainWindow finishes loading, open initial tab if none exists
  mainWindow.webContents.once('did-finish-load', () => {
    if (tabs.size === 0) {
      createTab(settings.homePage || 'lit://newtab');
    }
  });
}

// -------------------------------------------------------------
// IPC Registration Helper
// -------------------------------------------------------------
function registerIpcAction(channelNames, fn) {
  const names = Array.isArray(channelNames) ? channelNames : [channelNames];
  const allNames = new Set();
  for (const n of names) {
    allNames.add(n);
    allNames.add(`lit:${n}`);
    const kebab = n.replace(/([A-Z])/g, '-$1').toLowerCase();
    allNames.add(kebab);
    allNames.add(`lit:${kebab}`);
  }
  for (const name of allNames) {
    ipcMain.on(name, async (event, ...args) => {
      try {
        await fn(...args);
      } catch (e) {
        console.error(`[Lit] Error handling ipcMain.on '${name}':`, e);
      }
    });

    ipcMain.handle(name, async (event, ...args) => {
      try {
        return await fn(...args);
      } catch (e) {
        console.error(`[Lit] Error handling ipcMain.handle '${name}':`, e);
        throw e;
      }
    });
  }
}

// -------------------------------------------------------------
// Register All Shared IPC Handlers
// -------------------------------------------------------------
function registerAllIpcHandlers() {
  // Navigation
  registerIpcAction(['navigate', 'navigation:navigate'], (url) => {
    const activeTab = tabs.get(activeTabId);
    if (activeTab && activeTab.view && !activeTab.view.webContents.isDestroyed()) {
      const formatted = formatUrl(url, settings.searchEngine);
      activeTab.url = formatted;
      activeTab.view.webContents.loadURL(formatted).catch((err) => {
        console.error(`[Lit] Error navigating to ${formatted}:`, err.message);
      });
    }
  });

  registerIpcAction(['goBack', 'go-back', 'navigation:goBack'], () => {
    const activeTab = tabs.get(activeTabId);
    if (activeTab && activeTab.view && !activeTab.view.webContents.isDestroyed()) {
      const wc = activeTab.view.webContents;
      if (wc.navigationHistory ? wc.navigationHistory.canGoBack() : wc.canGoBack()) {
        if (wc.navigationHistory) wc.navigationHistory.goBack();
        else wc.goBack();
      }
    }
  });

  registerIpcAction(['goForward', 'go-forward', 'navigation:goForward'], () => {
    const activeTab = tabs.get(activeTabId);
    if (activeTab && activeTab.view && !activeTab.view.webContents.isDestroyed()) {
      const wc = activeTab.view.webContents;
      if (wc.navigationHistory ? wc.navigationHistory.canGoForward() : wc.canGoForward()) {
        if (wc.navigationHistory) wc.navigationHistory.goForward();
        else wc.goForward();
      }
    }
  });

  registerIpcAction(['reload', 'navigation:reload'], () => {
    const activeTab = tabs.get(activeTabId);
    if (activeTab && activeTab.view && !activeTab.view.webContents.isDestroyed()) {
      activeTab.view.webContents.reload();
    }
  });

  registerIpcAction(['stopLoading', 'stop-loading', 'navigation:stopLoading'], () => {
    const activeTab = tabs.get(activeTabId);
    if (activeTab && activeTab.view && !activeTab.view.webContents.isDestroyed()) {
      activeTab.view.webContents.stop();
    }
  });

  // Tabs
  registerIpcAction(['newTab', 'new-tab', 'tabs:newTab'], (url) => {
    return safeCreateTab(url);
  });

  registerIpcAction(['closeTab', 'close-tab', 'tabs:closeTab'], (tabId) => {
    safeCloseTab(tabId || activeTabId);
  });

  registerIpcAction(['switchTab', 'switch-tab', 'tabs:switchTab'], (tabId) => {
    switchTab(tabId);
  });

  // Ad Blocker
  registerIpcAction(['getBlockedCount', 'get-blocked-count', 'adblock:getBlockedCount'], () => {
    if (adblocker && typeof adblocker.getBlockedCount === 'function') {
      return adblocker.getBlockedCount(activeTabId);
    }
    const tab = tabs.get(activeTabId);
    return {
      total: tab ? tab.blockedCount : 0,
      session: tab ? tab.blockedCount : 0
    };
  });

  registerIpcAction(['toggleAdBlocker', 'toggle-ad-blocker', 'adblock:toggleAdBlocker'], (enabled) => {
    if (adblocker) {
      if (typeof adblocker.toggle === 'function') {
        adblocker.toggle(enabled);
      } else if (typeof adblocker.setEnabled === 'function') {
        adblocker.setEnabled(enabled);
      }
    }
    saveSettings({ adBlocker: enabled });
  });

  registerIpcAction(['isAdBlockerEnabled', 'is-ad-blocker-enabled', 'adblock:isAdBlockerEnabled'], () => {
    if (adblocker && typeof adblocker.isEnabled === 'function') {
      return adblocker.isEnabled();
    }
    return settings.adBlocker !== false;
  });

  // Passwords
  registerIpcAction(['savePassword', 'save-password', 'passwords:savePassword'], async (entryOrUrl, maybeUser, maybePass) => {
    if (!passwords) return;
    const toSave = entryOrUrl || pendingPasswordEntry;
    if (!toSave) return;

    if (typeof toSave === 'object') {
      const url = toSave.url || '';
      const user = toSave.username || '';
      const pass = toSave.password || '';
      try {
        if (typeof passwords.savePassword === 'function') {
          if (passwords.savePassword.length >= 2) {
            await passwords.savePassword(url, user, pass);
          } else {
            await passwords.savePassword(toSave);
          }
        }
      } catch (e) {
        console.error('[Lit] Error saving password:', e);
      }
    } else if (typeof toSave === 'string') {
      if (typeof passwords.savePassword === 'function') {
        await passwords.savePassword(toSave, maybeUser, maybePass);
      }
    }
    pendingPasswordEntry = null;
  });

  registerIpcAction(['dismissPasswordSave', 'dismiss-password-save', 'passwords:dismissPasswordSave'], () => {
    pendingPasswordEntry = null;
  });

  registerIpcAction(['getPasswords', 'get-passwords', 'passwords:getPasswords'], async () => {
    if (passwords && typeof passwords.getPasswords === 'function') {
      try {
        return await passwords.getPasswords();
      } catch (err) {
        return [];
      }
    }
    return [];
  });

  registerIpcAction(['deletePassword', 'delete-password', 'passwords:deletePassword'], async (id) => {
    if (passwords && typeof passwords.deletePassword === 'function') {
      await passwords.deletePassword(id);
    }
  });

  registerIpcAction(['updatePassword', 'update-password', 'passwords:updatePassword'], async (id, entryOrUser, maybePass) => {
    if (!passwords) return;
    if (typeof entryOrUser === 'object' && entryOrUser !== null) {
      if (typeof passwords.updatePassword === 'function') {
        if (passwords.updatePassword.length >= 2) {
          await passwords.updatePassword(id, entryOrUser.username, entryOrUser.password);
        } else {
          await passwords.updatePassword(id, entryOrUser);
        }
      }
    } else {
      if (typeof passwords.updatePassword === 'function') {
        await passwords.updatePassword(id, entryOrUser, maybePass);
      }
    }
  });

  registerIpcAction(['setMasterPassword', 'set-master-password', 'passwords:setMasterPassword'], async (password) => {
    if (passwords && typeof passwords.setMasterPassword === 'function') {
      await passwords.setMasterPassword(password);
    }
  });

  registerIpcAction(['unlockVault', 'unlock-vault', 'passwords:unlockVault'], async (password) => {
    if (!passwords) return true;
    if (typeof passwords.unlockVault === 'function') {
      return await passwords.unlockVault(password);
    }
    if (typeof passwords.unlock === 'function') {
      return await passwords.unlock(password);
    }
    return true;
  });

  registerIpcAction(['isVaultLocked', 'is-vault-locked', 'passwords:isVaultLocked'], async () => {
    if (!passwords) return false;
    if (typeof passwords.isVaultLocked === 'function') {
      return await passwords.isVaultLocked();
    }
    if (typeof passwords.isLocked === 'function') {
      return await passwords.isLocked();
    }
    return false;
  });

  // Autofill
  registerIpcAction(['getAutofillProfiles', 'get-autofill-profiles', 'autofill:getAutofillProfiles'], async () => {
    if (!autofill) return [];
    if (typeof autofill.getAutofillProfiles === 'function') {
      return await autofill.getAutofillProfiles();
    }
    if (typeof autofill.getProfiles === 'function') {
      return await autofill.getProfiles();
    }
    return [];
  });

  registerIpcAction(['saveAutofillProfile', 'save-autofill-profile', 'autofill:saveAutofillProfile'], async (profile, maybeLabel, maybeData) => {
    if (!autofill) return;
    if (typeof autofill.saveAutofillProfile === 'function') {
      return await autofill.saveAutofillProfile(profile);
    }
    if (typeof autofill.saveProfile === 'function') {
      if (typeof profile === 'string') {
        return await autofill.saveProfile(profile, maybeLabel, maybeData);
      }
      const type = (profile && profile.type) || 'personal';
      const label = (profile && (profile.label || profile.name)) || 'Profile';
      const data = (profile && profile.data) || profile;
      return await autofill.saveProfile(type, label, data);
    }
  });

  registerIpcAction(['deleteAutofillProfile', 'delete-autofill-profile', 'autofill:deleteAutofillProfile'], async (id) => {
    if (!autofill) return;
    if (typeof autofill.deleteAutofillProfile === 'function') {
      return await autofill.deleteAutofillProfile(id);
    }
    if (typeof autofill.deleteProfile === 'function') {
      return await autofill.deleteProfile(id);
    }
  });

  registerIpcAction(['acceptAutofill', 'accept-autofill', 'autofill:acceptAutofill'], async (profileId, tabId) => {
    const targetTabId = tabId || activeTabId;
    const tab = tabs.get(targetTabId);
    if (!tab || !tab.view || tab.view.webContents.isDestroyed()) return;

    if (autofill) {
      let profileData = null;
      if (typeof autofill.getProfile === 'function') {
        profileData = await autofill.getProfile(profileId);
      } else if (typeof autofill.getProfiles === 'function') {
        const profiles = await autofill.getProfiles();
        profileData = profiles.find((p) => p.id === Number(profileId));
      }

      if (profileData) {
        const dataToFill = profileData.data || profileData;
        const fillScript = `(() => {
          try {
            const profile = ${JSON.stringify(dataToFill)};
            function fillInput(el, val) {
              if (!el || val === undefined || val === null) return;
              el.focus();
              el.value = val;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="password"]), select, textarea');
            inputs.forEach((input) => {
              const name = (input.name || '').toLowerCase();
              const id = (input.id || '').toLowerCase();
              const auto = (input.getAttribute('autocomplete') || '').toLowerCase();
              const match = (k) => name.includes(k) || id.includes(k) || auto.includes(k);
              if (profile.name && (match('name') || auto === 'name')) fillInput(input, profile.name);
              else if (profile.email && (match('email') || auto === 'email' || input.type === 'email')) fillInput(input, profile.email);
              else if (profile.phone && (match('phone') || match('tel') || auto === 'tel')) fillInput(input, profile.phone);
              else if (profile.address && (match('address') || match('street'))) fillInput(input, profile.address);
              else if (profile.city && match('city')) fillInput(input, profile.city);
              else if (profile.state && match('state')) fillInput(input, profile.state);
              else if (profile.zip && (match('zip') || match('postal'))) fillInput(input, profile.zip);
              else if (profile.country && match('country')) fillInput(input, profile.country);
            });
          } catch (err) {}
        })();`;
        tab.view.webContents.executeJavaScript(fillScript).catch(() => {});
      }
    }
  });

  // Bookmarks
  registerIpcAction(['addBookmark', 'add-bookmark', 'bookmarks:addBookmark'], async (url, title, favicon) => {
    if (bookmarks) {
      if (typeof bookmarks.addBookmark === 'function') {
        await bookmarks.addBookmark(url, title, favicon);
      }
    }
  });

  registerIpcAction(['removeBookmark', 'remove-bookmark', 'bookmarks:removeBookmark'], async (url) => {
    if (bookmarks) {
      if (typeof bookmarks.removeBookmark === 'function') {
        await bookmarks.removeBookmark(url);
      }
    }
  });

  registerIpcAction(['getBookmarks', 'get-bookmarks', 'bookmarks:getBookmarks'], async () => {
    if (bookmarks) {
      if (typeof bookmarks.getBookmarks === 'function') {
        return await bookmarks.getBookmarks();
      }
    }
    return [];
  });

  registerIpcAction(['isBookmarked', 'is-bookmarked', 'bookmarks:isBookmarked'], async (url) => {
    if (bookmarks) {
      if (typeof bookmarks.isBookmarked === 'function') {
        return await bookmarks.isBookmarked(url);
      }
    }
    return false;
  });

  // History
  registerIpcAction(['getHistory', 'get-history', 'history:getHistory'], async (query, limit) => {
    if (history) {
      if (typeof history.getHistory === 'function') {
        return await history.getHistory(query, limit);
      }
    }
    return [];
  });

  registerIpcAction(['clearHistory', 'clear-history', 'history:clearHistory'], async () => {
    if (history) {
      if (typeof history.clearHistory === 'function') {
        await history.clearHistory();
      }
    }
  });

  registerIpcAction(['deleteHistoryEntry', 'delete-history-entry', 'history:deleteHistoryEntry'], async (id) => {
    if (history) {
      if (typeof history.deleteHistoryEntry === 'function') {
        await history.deleteHistoryEntry(id);
      } else if (typeof history.deleteEntry === 'function') {
        await history.deleteEntry(id);
      }
    }
  });

  // Downloads
  registerIpcAction(['openDownload', 'open-download', 'downloads:openDownload'], (filePath) => {
    if (downloads && typeof downloads.openDownload === 'function') {
      downloads.openDownload(filePath);
    } else if (filePath && fs.existsSync(filePath)) {
      shell.openPath(filePath);
    }
  });

  registerIpcAction(['showInFolder', 'show-in-folder', 'downloads:showInFolder'], (filePath) => {
    if (downloads && typeof downloads.showInFolder === 'function') {
      downloads.showInFolder(filePath);
    } else if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
    }
  });

  registerIpcAction(['getDownloads', 'get-downloads', 'downloads:getDownloads'], async () => {
    if (downloads && typeof downloads.getDownloads === 'function') {
      return await downloads.getDownloads();
    }
    return [];
  });

  // Settings
  registerIpcAction(['getSettings', 'get-settings', 'settings:getSettings'], () => {
    return settings;
  });

  registerIpcAction(['updateSettings', 'update-settings', 'settings:updateSettings'], (newSettings) => {
    saveSettings(newSettings);
  });

  // Window Controls
  registerIpcAction(['minimizeWindow', 'minimize-window', 'window:minimize'], () => {
    if (mainWindow) mainWindow.minimize();
  });

  registerIpcAction(['maximizeWindow', 'maximize-window', 'window:maximize'], () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  registerIpcAction(['closeWindow', 'close-window', 'window:close'], () => {
    if (mainWindow) mainWindow.close();
  });

  registerIpcAction(['isMaximized', 'is-maximized', 'window:isMaximized'], () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });

  // Find in page
  registerIpcAction(['findInPage', 'find-in-page'], (text, options) => {
    const activeTab = tabs.get(activeTabId);
    if (activeTab && activeTab.view && !activeTab.view.webContents.isDestroyed() && text) {
      activeTab.view.webContents.findInPage(text, options || {});
    }
  });

  registerIpcAction(['stopFindInPage', 'stop-find-in-page'], () => {
    const activeTab = tabs.get(activeTabId);
    if (activeTab && activeTab.view && !activeTab.view.webContents.isDestroyed()) {
      activeTab.view.webContents.stopFindInPage('clearSelection');
    }
  });
}

// -------------------------------------------------------------
// Downloads Setup via session.defaultSession.on('will-download')
// -------------------------------------------------------------
function setupDownloads() {
  const ses = session.defaultSession;
  ses.on('will-download', (event, item, webContents) => {
    const downloadId = 'dl-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const filename = item.getFilename();
    const totalBytes = item.getTotalBytes();
    const url = item.getURL();

    const initialData = {
      id: downloadId,
      filename,
      totalBytes,
      receivedBytes: 0,
      state: item.getState(),
      url,
      savePath: item.getSavePath(),
      startTime: Date.now()
    };

    if (downloads && typeof downloads.recordDownload === 'function') {
      downloads.recordDownload(initialData);
    }

    emitToRenderer(['download-started', 'downloadStarted', 'onDownloadStarted'], initialData);

    let lastTime = Date.now();
    let lastBytes = 0;

    item.on('updated', (updateEvent, state) => {
      const now = Date.now();
      const currentBytes = item.getReceivedBytes();
      const elapsedSec = (now - lastTime) / 1000;
      const speed = elapsedSec > 0 ? (currentBytes - lastBytes) / elapsedSec : 0;
      lastTime = now;
      lastBytes = currentBytes;

      const progressData = {
        id: downloadId,
        filename,
        receivedBytes: currentBytes,
        totalBytes: item.getTotalBytes(),
        percent: item.getTotalBytes() > 0 ? (currentBytes / item.getTotalBytes()) * 100 : 0,
        speed: Math.round(speed),
        state
      };

      if (downloads && typeof downloads.recordDownload === 'function') {
        downloads.recordDownload(progressData);
      }

      emitToRenderer(['download-progress', 'downloadProgress', 'onDownloadProgress'], progressData);
    });

    item.once('done', (doneEvent, state) => {
      const completedData = {
        id: downloadId,
        filename,
        filePath: item.getSavePath(),
        success: state === 'completed',
        error: state === 'cancelled' ? 'cancelled' : (state === 'interrupted' ? 'interrupted' : null),
        state
      };

      if (downloads && typeof downloads.recordDownload === 'function') {
        downloads.recordDownload(completedData);
      }

      emitToRenderer(['download-completed', 'downloadCompleted', 'onDownloadCompleted'], completedData);
    });
  });
}

// -------------------------------------------------------------
// Ad Blocker Initialization
// -------------------------------------------------------------
function setupAdBlocker() {
  if (adblocker) {
    if (typeof adblocker.init === 'function') {
      adblocker.init(session.defaultSession);
    } else if (typeof adblocker.initialize === 'function') {
      adblocker.initialize(session.defaultSession);
    }

    if (typeof adblocker.onBlocked === 'function') {
      adblocker.onBlocked((data) => {
        const tab = tabs.get(activeTabId);
        if (tab) {
          tab.blockedCount = (tab.blockedCount || 0) + 1;
        }
        emitToRenderer(['blocked-count-updated', 'blockedCountUpdated', 'onBlockedCountUpdated'], {
          tabId: (data && data.tabId) || activeTabId,
          count: tab ? tab.blockedCount : 1,
          total: typeof adblocker.getBlockedCount === 'function' ? adblocker.getBlockedCount().total : undefined,
          session: typeof adblocker.getBlockedCount === 'function' ? adblocker.getBlockedCount().session : undefined
        });
      });
    }

    if (typeof adblocker.toggle === 'function') {
      adblocker.toggle(settings.adBlocker !== false);
    } else if (typeof adblocker.setEnabled === 'function') {
      adblocker.setEnabled(settings.adBlocker !== false);
    }
  }
}

// -------------------------------------------------------------
// Custom 'lit://' Protocol Handler
// -------------------------------------------------------------
function setupCustomProtocol() {
  protocol.handle('lit', (request) => {
    try {
      const parsed = new URL(request.url);
      const host = (parsed.hostname || '').toLowerCase();
      const pathname = decodeURIComponent(parsed.pathname || '').replace(/^\/+/, '');

      let filePath;
      if (host === 'newtab' || pathname === 'newtab' || pathname.startsWith('newtab/')) {
        if (!pathname || pathname === 'newtab' || pathname === 'newtab/index.html') {
          filePath = path.join(__dirname, 'src', 'browser', 'newtab.html');
        } else {
          filePath = path.join(__dirname, 'src', 'browser', pathname.replace(/^newtab\//, ''));
        }
      } else if (host === 'settings' || pathname === 'settings' || pathname.startsWith('settings/')) {
        if (!pathname || pathname === 'settings' || pathname === 'settings/index.html') {
          filePath = path.join(__dirname, 'src', 'pages', 'settings.html');
        } else {
          filePath = path.join(__dirname, 'src', 'pages', pathname.replace(/^settings\//, ''));
        }
      } else {
        filePath = path.join(__dirname, 'src', 'browser', 'newtab.html');
      }

      if (fs.existsSync(filePath)) {
        return net.fetch(pathToFileURL(filePath).toString());
      }

      // Safe HTML fallback
      const pageTitle = host === 'settings' ? 'Lit Settings' : 'Lit Browser';
      const fallbackHtml = `<!DOCTYPE html><html><head><title>${pageTitle}</title><style>body{background:#121212;color:#eee;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}h1{font-weight:300;}</style></head><body><h1>${pageTitle}</h1></body></html>`;
      return new Response(fallbackHtml, {
        headers: { 'Content-Type': 'text/html' }
      });
    } catch (err) {
      console.error('[Lit] Error in lit:// protocol handle:', err);
      return new Response('Not Found', { status: 404 });
    }
  });
}

// -------------------------------------------------------------
// App Lifecycle
// -------------------------------------------------------------
app.whenReady().then(async () => {
  const userData = app.getPath('userData');

  // Initialize settings
  initSettings();

  // Instantiate & initialize core modules with userData
  if (!passwords) {
    try { passwords = getModuleInstance(require('./core/passwords'), userData); } catch (e) {}
  }
  if (passwords) {
    if (typeof passwords.init === 'function') await passwords.init(userData);
    else if (typeof passwords.initialize === 'function') await passwords.initialize(userData);
  }

  if (!autofill) {
    try { autofill = getModuleInstance(require('./core/autofill'), userData); } catch (e) {}
  }
  if (autofill) {
    if (typeof autofill.init === 'function') await autofill.init(userData);
    else if (typeof autofill.initialize === 'function') await autofill.initialize(userData);
  }

  if (!bookmarks) {
    try { bookmarks = getModuleInstance(require('./core/bookmarks'), userData); } catch (e) {}
  }
  if (bookmarks) {
    if (typeof bookmarks.init === 'function') await bookmarks.init(userData);
    else if (typeof bookmarks.initialize === 'function') await bookmarks.initialize(userData);
  }

  if (!history) {
    try { history = getModuleInstance(require('./core/history'), userData); } catch (e) {}
  }
  if (history) {
    if (typeof history.init === 'function') await history.init(userData);
    else if (typeof history.initialize === 'function') await history.initialize(userData);
  }

  if (!downloads) {
    try { downloads = getModuleInstance(require('./core/downloads'), userData); } catch (e) {}
  }
  if (downloads) {
    if (typeof downloads.init === 'function') await downloads.init(userData);
    else if (typeof downloads.initialize === 'function') await downloads.initialize(userData);
  }

  // Setup custom protocol
  setupCustomProtocol();

  // Setup adblocker
  setupAdBlocker();

  // Setup downloads
  setupDownloads();

  // Register IPC handlers
  registerAllIpcHandlers();

  // Setup Application Menu & Accelerators
  setupApplicationMenu();

  // Create main window
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
