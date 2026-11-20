/**
 * Lit Browser - Main Renderer Process Script
 * File: src/browser/app.js
 *
 * Manages all browser UI interactions, custom tab bar, navigation chrome,
 * bookmarking, history panels, adblock counters, password manager,
 * downloads shelf, in-page search, and settings via the window.lit preload bridge.
 */

(() => {
  'use strict';

  // ============================================================================
  // 1. SAFE IPC BRIDGE (window.lit)
  // ============================================================================

  const lit = window.lit || {
    // Navigation
    navigate: (url) => console.warn('[lit-mock] navigate:', url),
    goBack: () => console.warn('[lit-mock] goBack'),
    goForward: () => console.warn('[lit-mock] goForward'),
    reload: () => console.warn('[lit-mock] reload'),
    stopLoading: () => console.warn('[lit-mock] stopLoading'),

    // Tabs
    newTab: (url) => console.warn('[lit-mock] newTab:', url),
    closeTab: (tabId) => console.warn('[lit-mock] closeTab:', tabId),
    switchTab: (tabId) => console.warn('[lit-mock] switchTab:', tabId),
    onTabCreated: (cb) => {},
    onTabUpdated: (cb) => {},
    onTabRemoved: (cb) => {},
    onActiveTabChanged: (cb) => {},

    // Ad Blocker
    getBlockedCount: async () => ({ total: 0, session: 0 }),
    toggleAdBlocker: (enabled) => console.warn('[lit-mock] toggleAdBlocker:', enabled),
    isAdBlockerEnabled: async () => true,
    onBlockedCountUpdated: (cb) => {},

    // Passwords
    onPasswordSavePrompt: (cb) => {},
    savePassword: (entry) => console.warn('[lit-mock] savePassword:', entry),
    dismissPasswordSave: () => console.warn('[lit-mock] dismissPasswordSave'),
    getPasswords: async () => [],
    deletePassword: (id) => console.warn('[lit-mock] deletePassword:', id),
    updatePassword: (id, entry) => console.warn('[lit-mock] updatePassword:', id, entry),
    setMasterPassword: (pwd) => console.warn('[lit-mock] setMasterPassword'),
    unlockVault: async (pwd) => true,
    isVaultLocked: async () => false,

    // Autofill
    getAutofillProfiles: async () => [],
    saveAutofillProfile: (profile) => console.warn('[lit-mock] saveAutofillProfile:', profile),
    deleteAutofillProfile: (id) => console.warn('[lit-mock] deleteAutofillProfile:', id),
    onAutofillSuggestion: (cb) => {},
    acceptAutofill: (profileId, tabId) => console.warn('[lit-mock] acceptAutofill:', profileId, tabId),

    // Bookmarks
    addBookmark: (url, title, favicon) => console.warn('[lit-mock] addBookmark:', url),
    removeBookmark: (url) => console.warn('[lit-mock] removeBookmark:', url),
    getBookmarks: async () => [],
    isBookmarked: async (url) => false,

    // History
    getHistory: async (query, limit) => [],
    clearHistory: () => console.warn('[lit-mock] clearHistory'),
    deleteHistoryEntry: (id) => console.warn('[lit-mock] deleteHistoryEntry:', id),

    // Downloads
    onDownloadStarted: (cb) => {},
    onDownloadProgress: (cb) => {},
    onDownloadCompleted: (cb) => {},
    openDownload: (filePath) => console.warn('[lit-mock] openDownload:', filePath),
    showInFolder: (filePath) => console.warn('[lit-mock] showInFolder:', filePath),
    getDownloads: async () => [],

    // Settings
    getSettings: async () => ({ searchEngine: 'duckduckgo', homepage: 'about:blank', adBlocker: true }),
    updateSettings: (settings) => console.warn('[lit-mock] updateSettings:', settings),
    onSettingsChanged: (cb) => {},

    // Window Controls
    minimizeWindow: () => console.warn('[lit-mock] minimizeWindow'),
    maximizeWindow: () => console.warn('[lit-mock] maximizeWindow'),
    closeWindow: () => console.warn('[lit-mock] closeWindow'),
    isMaximized: async () => false,
    onMaximizedChanged: (cb) => {},

    // Find in Page
    findInPage: (text, options) => console.warn('[lit-mock] findInPage:', text, options),
    stopFindInPage: (action) => console.warn('[lit-mock] stopFindInPage:', action),
    onFindResults: (cb) => {}
  };

  // ============================================================================
  // 2. SVG ICON ASSETS
  // ============================================================================

  const ICONS = {
    back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`,
    forward: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`,
    reload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`,
    stop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    starOutline: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
    starFilled: `<svg viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
    shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
    menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>`,
    plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    minimize: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    maximize: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="5" width="14" height="14" rx="2" ry="2"></rect></svg>`,
    restore: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="8" width="12" height="12" rx="1.5"></rect><path d="M8 4h10a2 2 0 0 1 2 2v10"></path></svg>`,
    chevronUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`,
    chevronDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
    globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
    download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
    folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
    key: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-1.5 1.5L14 9l-3 3-3-3-4 4 1.5 1.5L4 16l3 3 1.5-1.5L10 19l4-4 3.5-3.5 1.5-1.5L21 2z"></path><circle cx="16.5" cy="7.5" r="2.5"></circle></svg>`,
    eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
    copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`
  };

  // ============================================================================
  // 3. INTERNAL STATE
  // ============================================================================

  const state = {
    tabs: new Map(), // tabId -> { id, element, url, title, favicon, loading, canGoBack, canGoForward, blockedCount }
    activeTabId: null,
    isMaximized: false,
    adBlockerEnabled: true,
    downloads: new Map(), // id -> downloadItem
    vaultLocked: true,
    settings: {
      searchEngine: 'google',
      homepage: 'lit://newtab',
      adBlocker: true,
      theme: 'dark'
    }
  };

  let passwordBannerTimer = null;
  let activePanel = null; // 'bookmarks' | 'history' | 'settings' | 'about' | null

  // ============================================================================
  // 4. CORE STYLES (Injected for Glassmorphism, animations, modern UI)
  // ============================================================================

  function injectCoreStyles() {
    if (document.getElementById('lit-core-styles')) return;
    const style = document.createElement('style');
    style.id = 'lit-core-styles';
    style.textContent = `
      :root {
        --bg-main: #0f1117;
        --bg-header: #161922;
        --bg-surface: rgba(26, 29, 40, 0.75);
        --bg-glass: rgba(22, 25, 34, 0.82);
        --bg-glass-card: rgba(36, 40, 56, 0.55);
        --bg-input: #1d212d;
        --border-glass: rgba(255, 255, 255, 0.08);
        --border-glass-bright: rgba(255, 255, 255, 0.18);
        --text-primary: #f3f4f6;
        --text-secondary: #9ca3af;
        --text-muted: #6b7280;
        --accent: #6366f1;
        --accent-hover: #4f46e5;
        --accent-glow: rgba(99, 102, 241, 0.35);
        --success: #10b981;
        --warning: #f59e0b;
        --danger: #ef4444;
        --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        user-select: none;
      }

      body {
        font-family: var(--font-sans);
        background: var(--bg-main);
        color: var(--text-primary);
        height: 100vh;
        width: 100vw;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      button, input, select {
        font-family: inherit;
        outline: none;
        border: none;
      }

      button {
        cursor: pointer;
        background: transparent;
        color: var(--text-secondary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: all 0.15s ease;
      }
      button:hover:not(:disabled) {
        color: var(--text-primary);
        background: rgba(255, 255, 255, 0.08);
      }
      button:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      button svg {
        width: 16px;
        height: 16px;
        pointer-events: none;
      }

      /* Chrome Container */
      #browser-chrome {
        background: var(--bg-header);
        border-bottom: 1px solid var(--border-glass);
        display: flex;
        flex-direction: column;
        z-index: 100;
        position: relative;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      }

      /* Titlebar & Tabs Bar */
      #titlebar {
        display: flex;
        align-items: center;
        height: 38px;
        background: #12141c;
        -webkit-app-region: drag;
        padding-left: 8px;
        gap: 6px;
      }

      #tabs-container {
        display: flex;
        align-items: center;
        flex: 1;
        height: 100%;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none;
        -webkit-app-region: no-drag;
        gap: 4px;
        padding-top: 4px;
      }
      #tabs-container::-webkit-scrollbar {
        display: none;
      }

      /* Individual Tab */
      .tab {
        display: flex;
        align-items: center;
        min-width: 140px;
        max-width: 220px;
        height: 32px;
        padding: 0 10px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid transparent;
        border-bottom: none;
        border-radius: 8px 8px 0 0;
        font-size: 12.5px;
        color: var(--text-secondary);
        cursor: pointer;
        position: relative;
        transition: all 200ms cubic-bezier(0.2, 0, 0, 1);
        overflow: hidden;
      }
      .tab:hover:not(.active) {
        background: rgba(255, 255, 255, 0.06);
        color: var(--text-primary);
      }
      .tab.active {
        background: var(--bg-header);
        color: var(--text-primary);
        border-color: var(--border-glass);
        box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.15);
      }
      .tab.active::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--accent);
      }

      /* Tab Animation States */
      .tab.tab-opening {
        opacity: 0;
        transform: scale(0.92) translateY(3px);
        max-width: 0;
        padding-left: 0;
        padding-right: 0;
        min-width: 0;
      }
      .tab.tab-closing {
        opacity: 0;
        transform: scale(0.92) translateY(3px);
        max-width: 0 !important;
        min-width: 0 !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
        margin: 0 !important;
      }

      .tab-favicon {
        width: 16px;
        height: 16px;
        margin-right: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .tab-favicon img {
        width: 16px;
        height: 16px;
        border-radius: 3px;
        object-fit: contain;
      }
      .tab-favicon svg {
        width: 14px;
        height: 14px;
        color: var(--text-muted);
      }
      .tab-favicon .spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.15);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .tab-title {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 500;
      }

      .tab-close {
        width: 18px;
        height: 18px;
        border-radius: 4px;
        margin-left: 6px;
        flex-shrink: 0;
        opacity: 0;
        transition: opacity 0.15s ease, background 0.15s ease;
      }
      .tab:hover .tab-close,
      .tab.active .tab-close {
        opacity: 0.7;
      }
      .tab-close:hover {
        opacity: 1 !important;
        background: rgba(255, 255, 255, 0.15) !important;
      }
      .tab-close svg {
        width: 12px;
        height: 12px;
      }

      #new-tab-btn {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        margin-left: 4px;
        margin-right: 8px;
        -webkit-app-region: no-drag;
      }

      /* Window Controls */
      #window-controls {
        display: flex;
        align-items: center;
        height: 100%;
        -webkit-app-region: no-drag;
      }
      .win-btn {
        width: 44px;
        height: 100%;
        border-radius: 0;
        color: var(--text-secondary);
      }
      .win-btn:hover {
        background: rgba(255, 255, 255, 0.08);
      }
      .win-btn.close-btn:hover {
        background: var(--danger);
        color: #fff;
      }

      /* Navigation Bar */
      #nav-bar {
        display: flex;
        align-items: center;
        height: 44px;
        padding: 0 10px;
        gap: 8px;
        background: var(--bg-header);
      }

      .nav-btn {
        width: 32px;
        height: 32px;
        border-radius: 6px;
      }

      /* URL Bar Container */
      #url-container {
        flex: 1;
        height: 32px;
        background: var(--bg-input);
        border: 1px solid var(--border-glass);
        border-radius: 8px;
        display: flex;
        align-items: center;
        padding: 0 10px;
        transition: all 0.2s ease;
        position: relative;
      }
      #url-container:focus-within {
        border-color: var(--accent);
        box-shadow: 0 0 0 2px var(--accent-glow);
        background: #141721;
      }

      #security-indicator {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        margin-right: 8px;
        color: var(--text-muted);
      }
      #security-indicator.secure {
        color: var(--success);
      }
      #security-indicator.insecure {
        color: var(--danger);
      }

      #url-input {
        flex: 1;
        background: transparent;
        color: var(--text-primary);
        font-size: 13.5px;
        font-weight: 400;
        user-select: text;
        width: 100%;
      }
      #url-input::placeholder {
        color: var(--text-muted);
      }

      /* Bookmark Star Button */
      #bookmark-btn {
        width: 28px;
        height: 28px;
        margin-left: 4px;
        border-radius: 6px;
      }
      #bookmark-btn.pop {
        animation: starPop 350ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      @keyframes starPop {
        0% { transform: scale(1); }
        50% { transform: scale(1.45) rotate(15deg); }
        100% { transform: scale(1) rotate(0deg); }
      }

      /* Adblock Button & Badge */
      #adblock-btn {
        position: relative;
        padding: 0 8px;
        height: 32px;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
      }
      #adblock-badge {
        background: rgba(99, 102, 241, 0.2);
        color: #818cf8;
        padding: 2px 6px;
        border-radius: 10px;
        font-size: 11px;
        min-width: 18px;
        text-align: center;
      }

      /* App Menu Button */
      #menu-btn {
        width: 32px;
        height: 32px;
        border-radius: 6px;
      }

      /* Dropdown Menu */
      #app-menu {
        position: absolute;
        top: 86px;
        right: 12px;
        width: 220px;
        background: var(--bg-glass);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border: 1px solid var(--border-glass-bright);
        border-radius: 10px;
        padding: 6px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
        display: none;
        flex-direction: column;
        z-index: 1000;
        animation: fadeInMenu 0.15s ease-out;
      }
      #app-menu.visible {
        display: flex;
      }
      @keyframes fadeInMenu {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .menu-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-radius: 6px;
        color: var(--text-primary);
        font-size: 13px;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .menu-item:hover {
        background: rgba(255, 255, 255, 0.08);
      }
      .menu-item-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .menu-item-left svg {
        width: 16px;
        height: 16px;
        color: var(--text-secondary);
      }
      .menu-shortcut {
        font-size: 11px;
        color: var(--text-muted);
      }
      .menu-divider {
        height: 1px;
        background: var(--border-glass);
        margin: 4px 6px;
      }

      /* Password Save Banner */
      #password-save-banner {
        position: absolute;
        top: -100px;
        right: 48px;
        width: 360px;
        background: var(--bg-glass);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border: 1px solid var(--border-glass-bright);
        border-radius: 12px;
        padding: 14px 16px;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5);
        z-index: 999;
        transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
        opacity: 0;
        pointer-events: none;
      }
      #password-save-banner.visible {
        transform: translateY(182px);
        opacity: 1;
        pointer-events: auto;
      }
      .banner-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
      }
      .banner-header svg {
        width: 20px;
        height: 20px;
        color: var(--accent);
      }
      .banner-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .banner-subtitle {
        font-size: 12px;
        color: var(--text-secondary);
        margin-bottom: 12px;
        word-break: break-all;
      }
      .banner-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      .btn-primary {
        background: var(--accent);
        color: #fff;
        padding: 6px 14px;
        border-radius: 6px;
        font-size: 12.5px;
        font-weight: 500;
      }
      .btn-primary:hover {
        background: var(--accent-hover);
      }
      .btn-secondary {
        background: rgba(255, 255, 255, 0.08);
        color: var(--text-primary);
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12.5px;
      }
      .btn-secondary:hover {
        background: rgba(255, 255, 255, 0.15);
      }

      /* Autofill Suggestion Popup */
      #autofill-popup {
        position: absolute;
        top: 86px;
        left: 120px;
        width: 280px;
        background: var(--bg-glass);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border: 1px solid var(--border-glass-bright);
        border-radius: 10px;
        padding: 6px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        z-index: 1000;
        display: none;
        flex-direction: column;
      }
      #autofill-popup.visible {
        display: flex;
      }
      .autofill-profile-item {
        padding: 8px 10px;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .autofill-profile-item:hover {
        background: rgba(255, 255, 255, 0.08);
      }
      .autofill-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .autofill-details {
        font-size: 11.5px;
        color: var(--text-muted);
      }

      /* Find Bar */
      #find-bar {
        position: absolute;
        top: -60px;
        right: 48px;
        background: var(--bg-glass);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border: 1px solid var(--border-glass-bright);
        border-radius: 8px;
        padding: 6px 10px;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        z-index: 999;
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
        opacity: 0;
        pointer-events: none;
      }
      #find-bar.visible {
        transform: translateY(146px);
        opacity: 1;
        pointer-events: auto;
      }
      #find-input {
        background: var(--bg-input);
        border: 1px solid var(--border-glass);
        border-radius: 6px;
        padding: 4px 8px;
        color: var(--text-primary);
        font-size: 12.5px;
        width: 170px;
        user-select: text;
      }
      #find-input:focus {
        border-color: var(--accent);
      }
      #find-count {
        font-size: 12px;
        color: var(--text-muted);
        min-width: 50px;
        text-align: center;
      }
      .find-btn {
        width: 24px;
        height: 24px;
        border-radius: 4px;
      }

      /* Downloads Shelf Bar */
      #downloads-bar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: var(--bg-glass);
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        border-top: 1px solid var(--border-glass-bright);
        display: flex;
        align-items: center;
        height: 56px;
        padding: 0 16px;
        gap: 14px;
        box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.35);
        transform: translateY(100%);
        transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 800;
        overflow-x: auto;
      }
      #downloads-bar.visible {
        transform: translateY(0);
      }
      #downloads-container {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1;
        overflow-x: auto;
      }
      .download-card {
        display: flex;
        align-items: center;
        gap: 10px;
        background: var(--bg-glass-card);
        border: 1px solid var(--border-glass);
        padding: 6px 12px;
        border-radius: 8px;
        min-width: 220px;
        max-width: 280px;
      }
      .download-card-info {
        flex: 1;
        overflow: hidden;
      }
      .download-card-filename {
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .download-progress-bg {
        width: 100%;
        height: 4px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
        margin-top: 4px;
        overflow: hidden;
      }
      .download-progress-bar {
        height: 100%;
        width: 0%;
        background: var(--accent);
        transition: width 0.15s ease;
      }
      .download-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      /* Slide-out Glass Panels (Bookmarks, History) */
      .side-panel {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: 380px;
        max-width: 90vw;
        background: var(--bg-glass);
        backdrop-filter: blur(28px) saturate(190%);
        -webkit-backdrop-filter: blur(28px) saturate(190%);
        border-left: 1px solid var(--border-glass-bright);
        box-shadow: -12px 0 36px rgba(0, 0, 0, 0.55);
        z-index: 1200;
        transform: translateX(100%);
        transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        flex-direction: column;
      }
      .side-panel.open {
        transform: translateX(0);
      }
      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-glass);
      }
      .panel-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .panel-search-box {
        padding: 12px 20px;
        border-bottom: 1px solid var(--border-glass);
      }
      .panel-search-input {
        width: 100%;
        background: var(--bg-input);
        border: 1px solid var(--border-glass);
        border-radius: 6px;
        padding: 8px 12px;
        color: var(--text-primary);
        font-size: 13px;
        user-select: text;
      }
      .panel-search-input:focus {
        border-color: var(--accent);
      }
      .panel-content {
        flex: 1;
        overflow-y: auto;
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .panel-footer {
        padding: 14px 20px;
        border-top: 1px solid var(--border-glass);
        display: flex;
        justify-content: flex-end;
      }

      /* Panel Items */
      .panel-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 6px;
        background: var(--bg-glass-card);
        border: 1px solid transparent;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .panel-item:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: var(--border-glass);
      }
      .panel-item-favicon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .panel-item-favicon img {
        width: 16px;
        height: 16px;
        border-radius: 3px;
      }
      .panel-item-info {
        flex: 1;
        overflow: hidden;
      }
      .panel-item-title {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .panel-item-url {
        font-size: 11px;
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .panel-item-delete {
        opacity: 0;
        width: 24px;
        height: 24px;
      }
      .panel-item:hover .panel-item-delete {
        opacity: 0.8;
      }
      .panel-item-delete:hover {
        opacity: 1 !important;
        color: var(--danger) !important;
      }

      .history-date-header {
        font-size: 11.5px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--text-muted);
        letter-spacing: 0.5px;
        margin: 12px 4px 4px 4px;
      }

      /* Backdrop Overlay */
      #panel-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(4px);
        z-index: 1100;
        display: none;
        opacity: 0;
        transition: opacity 0.25s ease;
      }
      #panel-backdrop.active {
        display: block;
        opacity: 1;
      }

      /* Settings & Passwords Modal */
      #settings-modal, #about-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.95);
        width: 620px;
        max-width: 92vw;
        max-height: 85vh;
        background: var(--bg-glass);
        backdrop-filter: blur(32px) saturate(190%);
        -webkit-backdrop-filter: blur(32px) saturate(190%);
        border: 1px solid var(--border-glass-bright);
        border-radius: 14px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
        z-index: 2000;
        display: none;
        flex-direction: column;
        opacity: 0;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        overflow: hidden;
      }
      #settings-modal.open, #about-modal.open {
        display: flex;
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
      .modal-nav {
        display: flex;
        border-bottom: 1px solid var(--border-glass);
        padding: 0 16px;
        gap: 6px;
      }
      .modal-tab-btn {
        padding: 12px 14px;
        border-radius: 0;
        font-size: 13px;
        font-weight: 500;
        border-bottom: 2px solid transparent;
      }
      .modal-tab-btn.active {
        color: var(--accent);
        border-bottom-color: var(--accent);
      }
      .modal-body {
        padding: 20px;
        overflow-y: auto;
        flex: 1;
      }
      .settings-section {
        display: none;
        flex-direction: column;
        gap: 16px;
      }
      .settings-section.active {
        display: flex;
      }
      .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .form-group label {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary);
      }
      .form-control {
        background: var(--bg-input);
        border: 1px solid var(--border-glass);
        border-radius: 6px;
        padding: 8px 12px;
        color: var(--text-primary);
        font-size: 13px;
        user-select: text;
      }
      .form-control:focus {
        border-color: var(--accent);
      }

      /* Toast Notification Container */
      #toast-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        display: flex;
        flex-direction: column-reverse;
        gap: 10px;
        z-index: 99999;
        pointer-events: none;
      }
      .toast {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 10px;
        background: var(--bg-glass);
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        border: 1px solid var(--border-glass-bright);
        padding: 10px 16px;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
        color: var(--text-primary);
        font-size: 13px;
        animation: toastIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        transition: transform 0.2s ease, opacity 0.2s ease;
        max-width: 340px;
      }
      .toast.toast-success svg { color: var(--success); }
      .toast.toast-error svg { color: var(--danger); }
      .toast.toast-warning svg { color: var(--warning); }
      .toast.toast-info svg { color: var(--accent); }
      .toast.removing {
        opacity: 0;
        transform: translateX(40px);
      }
      @keyframes toastIn {
        from { opacity: 0; transform: translateX(40px); }
        to { opacity: 1; transform: translateX(0); }
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================================================
  // 5. DOM STRUCTURE BOOTSTRAPPER
  // ============================================================================

  function ensureDOMStructure() {
    injectCoreStyles();

    let chrome = document.getElementById('browser-chrome');
    if (!chrome) {
      chrome = document.createElement('div');
      chrome.id = 'browser-chrome';
      document.body.prepend(chrome);
    }

    // 1. Titlebar & Tab Bar
    let titlebar = document.getElementById('titlebar');
    if (!titlebar) {
      titlebar = document.createElement('div');
      titlebar.id = 'titlebar';
      titlebar.innerHTML = `
        <div id="tabs-container"></div>
        <button id="new-tab-btn" title="New Tab (Ctrl+T)">${ICONS.plus}</button>
        <div id="window-controls">
          <button class="win-btn" id="min-btn" title="Minimize">${ICONS.minimize}</button>
          <button class="win-btn" id="max-btn" title="Maximize">${ICONS.maximize}</button>
          <button class="win-btn close-btn" id="close-btn" title="Close">${ICONS.close}</button>
        </div>
      `;
      chrome.appendChild(titlebar);
    }

    // 2. Navigation Toolbar
    let navBar = document.getElementById('toolbar') || document.getElementById('nav-bar');
    if (!navBar) {
      navBar = document.createElement('div');
      navBar.id = 'toolbar';
      navBar.innerHTML = `
        <button class="nav-btn" id="back-btn" title="Click to go back (Alt+Left)" disabled>${ICONS.back}</button>
        <button class="nav-btn" id="forward-btn" title="Click to go forward (Alt+Right)" disabled>${ICONS.forward}</button>
        <button class="nav-btn" id="reload-btn" title="Reload (Ctrl+R)">${ICONS.reload}</button>
        <div id="url-container">
          <span id="security-indicator" title="Security">${ICONS.lock}</span>
          <input type="text" id="url-input" placeholder="Search or enter address" autocomplete="off" spellcheck="false" />
          <button id="bookmark-btn" title="Bookmark this tab">${ICONS.starOutline}</button>
        </div>
        <button id="adblock-btn" title="Ad Blocker">
          ${ICONS.shield}
          <span id="adblock-badge">0</span>
        </button>
        <button class="nav-btn" id="menu-btn" title="Menu">${ICONS.menu}</button>
      `;
      chrome.appendChild(navBar);
    }

    // 3. Dropdown Menu
    let appMenu = document.getElementById('app-menu');
    if (!appMenu) {
      appMenu = document.createElement('div');
      appMenu.id = 'app-menu';
      appMenu.innerHTML = `
        <div class="menu-item" data-action="new-tab">
          <div class="menu-item-left">${ICONS.plus}<span>New Tab</span></div>
          <span class="menu-shortcut">Ctrl+T</span>
        </div>
        <div class="menu-divider"></div>
        <div class="menu-item" data-action="bookmarks">
          <div class="menu-item-left">${ICONS.starFilled}<span>Bookmarks</span></div>
          <span class="menu-shortcut">Ctrl+B</span>
        </div>
        <div class="menu-item" data-action="history">
          <div class="menu-item-left">${ICONS.globe}<span>History</span></div>
          <span class="menu-shortcut">Ctrl+H</span>
        </div>
        <div class="menu-item" data-action="downloads">
          <div class="menu-item-left">${ICONS.download}<span>Downloads</span></div>
          <span class="menu-shortcut">Ctrl+J</span>
        </div>
        <div class="menu-item" data-action="find">
          <div class="menu-item-left">${ICONS.search}<span>Find in Page</span></div>
          <span class="menu-shortcut">Ctrl+F</span>
        </div>
        <div class="menu-divider"></div>
        <div class="menu-item" data-action="passwords">
          <div class="menu-item-left">${ICONS.key}<span>Passwords & Vault</span></div>
        </div>
        <div class="menu-item" data-action="settings">
          <div class="menu-item-left">${ICONS.warning}<span>Settings</span></div>
        </div>
        <div class="menu-divider"></div>
        <div class="menu-item" data-action="about">
          <div class="menu-item-left">${ICONS.info}<span>About Lit</span></div>
        </div>
      `;
      document.body.appendChild(appMenu);
    }

    // 4. Password Save Banner
    let passBanner = document.getElementById('password-save-banner');
    if (!passBanner) {
      passBanner = document.createElement('div');
      passBanner.id = 'password-save-banner';
      passBanner.innerHTML = `
        <div class="banner-header">
          ${ICONS.key}
          <div class="banner-title" id="pass-banner-title">Save password?</div>
        </div>
        <div class="banner-subtitle" id="pass-banner-subtitle">Lit can save your credentials for this site.</div>
        <div class="banner-actions">
          <button class="btn-secondary" id="pass-banner-dismiss">Never</button>
          <button class="btn-primary" id="pass-banner-save">Save Password</button>
        </div>
      `;
      document.body.appendChild(passBanner);
    }

    // 5. Autofill Popup
    let autofillPopup = document.getElementById('autofill-popup');
    if (!autofillPopup) {
      autofillPopup = document.createElement('div');
      autofillPopup.id = 'autofill-popup';
      document.body.appendChild(autofillPopup);
    }

    // 6. Find in Page Bar
    let findBar = document.getElementById('find-bar');
    if (!findBar) {
      findBar = document.createElement('div');
      findBar.id = 'find-bar';
      findBar.innerHTML = `
        <input type="text" id="find-input" placeholder="Find in page..." />
        <span id="find-count">0 of 0</span>
        <button class="find-btn" id="find-prev" title="Previous match">${ICONS.chevronUp}</button>
        <button class="find-btn" id="find-next" title="Next match">${ICONS.chevronDown}</button>
        <button class="find-btn" id="find-close" title="Close find bar">${ICONS.close}</button>
      `;
      document.body.appendChild(findBar);
    }

    // 7. Downloads Shelf Bar
    let downloadsBar = document.getElementById('downloads-bar');
    if (!downloadsBar) {
      downloadsBar = document.createElement('div');
      downloadsBar.id = 'downloads-bar';
      downloadsBar.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;color:var(--text-secondary)">
          ${ICONS.download} Downloads
        </div>
        <div id="downloads-container"></div>
        <button class="find-btn" id="downloads-close-btn" title="Close">${ICONS.close}</button>
      `;
      document.body.appendChild(downloadsBar);
    }

    // 8. Bookmarks Side Panel
    let bookmarksPanel = document.getElementById('bookmarks-panel');
    if (!bookmarksPanel) {
      bookmarksPanel = document.createElement('div');
      bookmarksPanel.id = 'bookmarks-panel';
      bookmarksPanel.className = 'side-panel';
      bookmarksPanel.innerHTML = `
        <div class="panel-header">
          <div class="panel-title">${ICONS.starFilled} Bookmarks</div>
          <button class="panel-close" id="close-bookmarks-panel">${ICONS.close}</button>
        </div>
        <div class="panel-search-box">
          <input type="text" class="panel-search-input" id="bookmarks-search-input" placeholder="Search bookmarks..." />
        </div>
        <div class="panel-content" id="bookmarks-list"></div>
      `;
      document.body.appendChild(bookmarksPanel);
    }

    // 9. History Side Panel
    let historyPanel = document.getElementById('history-panel');
    if (!historyPanel) {
      historyPanel = document.createElement('div');
      historyPanel.id = 'history-panel';
      historyPanel.className = 'side-panel';
      historyPanel.innerHTML = `
        <div class="panel-header">
          <div class="panel-title">${ICONS.globe} Browsing History</div>
          <button class="panel-close" id="close-history-panel">${ICONS.close}</button>
        </div>
        <div class="panel-search-box">
          <input type="text" class="panel-search-input" id="history-search-input" placeholder="Search history..." />
        </div>
        <div class="panel-content" id="history-list"></div>
        <div class="panel-footer">
          <button class="btn-secondary" id="clear-history-btn" style="color:var(--danger)">Clear All History</button>
        </div>
      `;
      document.body.appendChild(historyPanel);
    }

    // 10. Settings & Password Vault Modal
    let settingsModal = document.getElementById('settings-modal');
    if (!settingsModal) {
      settingsModal = document.createElement('div');
      settingsModal.id = 'settings-modal';
      settingsModal.innerHTML = `
        <div class="panel-header">
          <div class="panel-title">Settings & Preferences</div>
          <button class="panel-close" id="close-settings-modal">${ICONS.close}</button>
        </div>
        <div class="modal-nav">
          <button class="modal-tab-btn active" data-tab="general">General</button>
          <button class="modal-tab-btn" data-tab="passwords">Passwords & Vault</button>
          <button class="modal-tab-btn" data-tab="autofill">Autofill</button>
          <button class="modal-tab-btn" data-tab="privacy">Privacy & AdBlock</button>
        </div>
        <div class="modal-body">
          <!-- General -->
          <div class="settings-section active" id="settings-general">
            <div class="form-group">
              <label>Default Search Engine</label>
              <select class="form-control" id="settings-search-engine">
                <option value="duckduckgo">DuckDuckGo (Privacy)</option>
                <option value="google">Google</option>
                <option value="bing">Bing</option>
              </select>
            </div>
            <div class="form-group">
              <label>Homepage URL</label>
              <input type="text" class="form-control" id="settings-homepage" value="https://duckduckgo.com" />
            </div>
          </div>
          <!-- Passwords -->
          <div class="settings-section" id="settings-passwords">
            <div id="vault-locked-view" style="display:none;flex-direction:column;gap:12px;">
              <p style="font-size:13px;color:var(--text-secondary)">Unlock your master password vault to view saved credentials.</p>
              <input type="password" class="form-control" id="vault-password-input" placeholder="Enter Master Password" />
              <button class="btn-primary" id="vault-unlock-btn">Unlock Vault</button>
            </div>
            <div id="vault-unlocked-view" style="display:flex;flex-direction:column;gap:12px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:13px;font-weight:600">Saved Passwords</span>
              </div>
              <div id="vault-passwords-list" style="display:flex;flex-direction:column;gap:8px;"></div>
            </div>
          </div>
          <!-- Autofill -->
          <div class="settings-section" id="settings-autofill">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:13px;font-weight:600">Saved Autofill Profiles</span>
              <button class="btn-secondary" id="add-autofill-profile-btn">+ New Profile</button>
            </div>
            <div id="autofill-profiles-list" style="display:flex;flex-direction:column;gap:8px;margin-top:10px;"></div>
          </div>
          <!-- Privacy -->
          <div class="settings-section" id="settings-privacy">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-glass)">
              <div>
                <div style="font-size:13px;font-weight:600">Ad & Tracker Blocker</div>
                <div style="font-size:12px;color:var(--text-muted)">Block intrusive ads and invasive tracking scripts</div>
              </div>
              <input type="checkbox" id="settings-adblock-toggle" checked style="width:18px;height:18px;cursor:pointer" />
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;">
              <div>
                <div style="font-size:13px;font-weight:600">Total Trackers Blocked</div>
                <div style="font-size:12px;color:var(--text-muted)" id="settings-blocked-stats">Loading...</div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(settingsModal);
    }

    // 11. About Modal
    let aboutModal = document.getElementById('about-modal');
    if (!aboutModal) {
      aboutModal = document.createElement('div');
      aboutModal.id = 'about-modal';
      aboutModal.innerHTML = `
        <div class="panel-header">
          <div class="panel-title">${ICONS.info} About Lit Browser</div>
          <button class="panel-close" id="close-about-modal">${ICONS.close}</button>
        </div>
        <div class="modal-body" style="text-align:center;padding:32px 20px;">
          <h2 style="font-size:24px;font-weight:700;color:var(--accent);margin-bottom:8px;">Lit Browser</h2>
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">A super lightweight, minimalistic browser for Windows</p>
          <div style="display:inline-block;padding:4px 12px;background:rgba(255,255,255,0.06);border-radius:20px;font-size:12px;color:var(--text-muted);margin-bottom:24px;">
            Version 1.0.0 (Release)
          </div>
          <p style="font-size:12px;color:var(--text-muted)">Built with Electron, sql.js & modern Web Standards.</p>
        </div>
      `;
      document.body.appendChild(aboutModal);
    }

    // 12. Backdrop Overlay
    let backdrop = document.getElementById('panel-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'panel-backdrop';
      document.body.appendChild(backdrop);
    }

    // 13. Toast Container
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      document.body.appendChild(toastContainer);
    }
  }

  // ============================================================================
  // 6. TOAST NOTIFICATIONS
  // ============================================================================

  function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = ICONS.info;
    if (type === 'success') iconSvg = ICONS.check;
    else if (type === 'warning') iconSvg = ICONS.warning;
    else if (type === 'error') iconSvg = ICONS.close;

    toast.innerHTML = `
      ${iconSvg}
      <span style="flex:1">${escapeHtml(message)}</span>
      <button class="tab-close" style="opacity:0.6">${ICONS.close}</button>
    `;

    const closeBtn = toast.querySelector('button');
    const dismiss = () => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 200);
    };

    closeBtn.addEventListener('click', dismiss);
    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(dismiss, duration);
    }
  }

  // ============================================================================
  // 7. TAB MANAGEMENT
  // ============================================================================

  function createTabElement(tabData) {
    const container = document.getElementById('tabs-container');
    if (!container) return null;

    // Prevent duplicate tab elements for the same tab ID
    let existing = container.querySelector(`.tab[data-tab-id="${tabData.id}"]`);
    if (existing) {
      updateTabElement(tabData.id, tabData);
      return existing;
    }

    const tab = document.createElement('div');
    tab.className = 'tab tab-opening';
    tab.setAttribute('data-tab-id', tabData.id);

    const title = tabData.title || tabData.url || 'New Tab';
    tab.setAttribute('title', title);

    tab.innerHTML = `
      <span class="tab-favicon">
        ${renderFavicon(tabData.favicon, tabData.loading)}
      </span>
      <span class="tab-title">${escapeHtml(title)}</span>
      <button class="tab-close" title="Close tab">${ICONS.close}</button>
    `;

    // Tab Click -> Switch Tab
    tab.addEventListener('click', (e) => {
      if (e.target.closest('.tab-close')) return;
      lit.switchTab(tabData.id);
    });

    // Middle-click -> Close Tab
    tab.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        lit.closeTab(tabData.id);
      }
    });

    // Close Button Click
    const closeBtn = tab.querySelector('.tab-close');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      lit.closeTab(tabData.id);
    });

    container.appendChild(tab);

    // Remove opening class after 200ms
    setTimeout(() => {
      tab.classList.remove('tab-opening');
    }, 200);

    return tab;
  }

  function renderFavicon(faviconUrl, isLoading) {
    if (isLoading) {
      return `<div class="spinner"></div>`;
    }
    if (faviconUrl && typeof faviconUrl === 'string' && faviconUrl.trim() !== '') {
      return `<img src="${escapeHtml(faviconUrl)}" onerror="this.outerHTML='${ICONS.globe.replace(/"/g, '&quot;')}'" alt="favicon" />`;
    }
    return ICONS.globe;
  }

  function updateTabElement(tabId, data) {
    const tabRecord = state.tabs.get(tabId);
    if (!tabRecord || !tabRecord.element) return;

    const el = tabRecord.element;
    const title = data.title || data.url || tabRecord.title || 'New Tab';
    el.setAttribute('title', title);

    const titleSpan = el.querySelector('.tab-title');
    if (titleSpan) titleSpan.textContent = title;

    const faviconSpan = el.querySelector('.tab-favicon');
    if (faviconSpan) {
      faviconSpan.innerHTML = renderFavicon(data.favicon ?? tabRecord.favicon, data.loading ?? tabRecord.loading);
    }
  }

  function removeTabElement(tabId) {
    const tabRecord = state.tabs.get(tabId);
    if (!tabRecord || !tabRecord.element) return;

    const el = tabRecord.element;
    el.classList.add('tab-closing');

    setTimeout(() => {
      el.remove();
      state.tabs.delete(tabId);
    }, 200);
  }

  function setActiveTab(tabId) {
    state.activeTabId = tabId;

    // Synchronize active class across all tabs in DOM
    const allTabEls = document.querySelectorAll('#tabs-container .tab');
    allTabEls.forEach(el => {
      if (el.getAttribute('data-tab-id') === tabId) {
        el.classList.add('active');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      } else {
        el.classList.remove('active');
      }
    });

    for (const [id, tab] of state.tabs.entries()) {
      if (tab.element) {
        if (id === tabId) tab.element.classList.add('active');
        else tab.element.classList.remove('active');
      }
    }

    const currentTab = state.tabs.get(tabId);
    if (!currentTab) return;

    // Update URL bar
    updateUrlBarDisplay(currentTab.url);

    // Update Navigation Buttons
    updateNavButtons(currentTab);

    // Update Bookmark Star
    checkBookmarkState(currentTab.url);

    // Update AdBlock badge count for current tab
    updateAdBlockBadge(currentTab.blockedCount || 0);
  }

  // ============================================================================
  // 8. URL BAR & NAVIGATION LOGIC
  // ============================================================================

  function formatSimplifiedUrl(url) {
    if (!url || url === 'about:blank' || url.startsWith('lit://')) return '';
    try {
      const parsed = new URL(url);
      let simplified = parsed.hostname;
      if (simplified.startsWith('www.')) simplified = simplified.slice(4);
      const path = parsed.pathname === '/' ? '' : parsed.pathname;
      return simplified + path + parsed.search;
    } catch {
      return url;
    }
  }

  function updateUrlBarDisplay(url) {
    const urlInput = document.getElementById('url-input');
    const secIndicator = document.getElementById('security-indicator');
    if (!urlInput) return;

    // Only update text if URL bar is not currently focused by user
    if (document.activeElement !== urlInput) {
      urlInput.value = formatSimplifiedUrl(url);
    }

    // Security indicator
    if (secIndicator) {
      secIndicator.className = '';
      if (!url || url === 'about:blank' || url.startsWith('lit://')) {
        secIndicator.innerHTML = ICONS.globe;
        secIndicator.setAttribute('title', 'Lit Internal');
      } else if (url.startsWith('https://')) {
        secIndicator.classList.add('secure');
        secIndicator.innerHTML = ICONS.lock;
        secIndicator.setAttribute('title', 'Connection is secure (HTTPS)');
      } else if (url.startsWith('http://')) {
        secIndicator.classList.add('insecure');
        secIndicator.innerHTML = ICONS.warning;
        secIndicator.setAttribute('title', 'Connection is not secure (HTTP)');
      } else {
        secIndicator.innerHTML = ICONS.globe;
        secIndicator.setAttribute('title', 'Lit Browser');
      }
    }
  }

  function handleUrlSubmit() {
    const urlInput = document.getElementById('url-input');
    if (!urlInput) return;

    const rawInput = urlInput.value.trim();
    if (!rawInput) return;

    let targetUrl = rawInput;
    const protocolRegex = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

    if (protocolRegex.test(rawInput) || rawInput.startsWith('about:') || rawInput.startsWith('file:') || rawInput.startsWith('chrome:') || rawInput.startsWith('lit:')) {
      targetUrl = rawInput;
    } else if (rawInput.includes('.') && !/\s/.test(rawInput)) {
      targetUrl = 'https://' + rawInput;
    } else {
      const engine = state.settings.searchEngine || 'google';
      if (engine === 'duckduckgo') {
        targetUrl = `https://duckduckgo.com/?q=${encodeURIComponent(rawInput)}`;
      } else if (engine === 'bing') {
        targetUrl = `https://www.bing.com/search?q=${encodeURIComponent(rawInput)}`;
      } else {
        targetUrl = `https://www.google.com/search?q=${encodeURIComponent(rawInput)}`;
      }
    }

    lit.navigate(targetUrl);
    urlInput.blur();
  }

  function updateNavButtons(tab) {
    const backBtn = document.getElementById('btn-back') || document.getElementById('back-btn');
    const fwdBtn = document.getElementById('btn-forward') || document.getElementById('forward-btn');
    const reloadBtn = document.getElementById('btn-reload') || document.getElementById('reload-btn');

    if (backBtn) backBtn.disabled = !tab.canGoBack;
    if (fwdBtn) fwdBtn.disabled = !tab.canGoForward;

    if (reloadBtn) {
      if (tab.loading) {
        reloadBtn.innerHTML = ICONS.stop;
        reloadBtn.setAttribute('title', 'Stop loading');
      } else {
        reloadBtn.innerHTML = ICONS.reload;
        reloadBtn.setAttribute('title', 'Reload (Ctrl+R)');
      }
    }
  }

  // ============================================================================
  // 9. BOOKMARK STAR
  // ============================================================================

  async function checkBookmarkState(url) {
    const bookmarkBtn = document.getElementById('btn-bookmark-star') || document.getElementById('bookmark-btn');
    if (!bookmarkBtn) return;

    if (!url || url === 'about:blank' || url.startsWith('lit://')) {
      bookmarkBtn.classList.remove('bookmarked');
      bookmarkBtn.setAttribute('title', 'Bookmark this tab');
      return;
    }

    try {
      const isBookmarked = await lit.isBookmarked(url);
      setBookmarkStarVisual(isBookmarked);
    } catch {
      setBookmarkStarVisual(false);
    }
  }

  function setBookmarkStarVisual(isBookmarked) {
    const bookmarkBtn = document.getElementById('btn-bookmark-star') || document.getElementById('bookmark-btn');
    if (!bookmarkBtn) return;

    if (isBookmarked) {
      bookmarkBtn.classList.add('bookmarked');
      bookmarkBtn.setAttribute('title', 'Remove bookmark');
    } else {
      bookmarkBtn.classList.remove('bookmarked');
      bookmarkBtn.setAttribute('title', 'Bookmark this tab');
    }
  }

  async function toggleBookmarkActiveTab() {
    const currentTab = state.tabs.get(state.activeTabId);
    if (!currentTab || !currentTab.url || currentTab.url === 'about:blank') return;

    const url = currentTab.url;
    const bookmarkBtn = document.getElementById('btn-bookmark-star') || document.getElementById('bookmark-btn');

    // Trigger pop animation
    if (bookmarkBtn) {
      bookmarkBtn.classList.remove('pop');
      void bookmarkBtn.offsetWidth; // force reflow
      bookmarkBtn.classList.add('pop');
      setTimeout(() => bookmarkBtn.classList.remove('pop'), 350);
    }

    const isBookmarked = await lit.isBookmarked(url);
    if (isBookmarked) {
      lit.removeBookmark(url);
      setBookmarkStarVisual(false);
      showToast('Bookmark removed', 'info');
    } else {
      lit.addBookmark(url, currentTab.title || url, currentTab.favicon || '');
      setBookmarkStarVisual(true);
      showToast('Bookmark added', 'success');
    }

    if (activePanel === 'bookmarks') {
      renderBookmarksList();
    }
  }

  // ============================================================================
  // 10. AD BLOCK BADGE
  // ============================================================================

  function updateAdBlockBadge(count) {
    const badge = document.querySelector('#badge-adblock .adblock-count') || document.getElementById('adblock-badge') || document.getElementById('badge-adblock');
    if (badge) {
      badge.textContent = count > 0 ? count : '0';
    }
  }

  // ============================================================================
  // 11. PASSWORD SAVE BANNER
  // ============================================================================

  function showPasswordSaveBanner(entry) {
    const banner = document.getElementById('password-save-banner');
    if (!banner) return;

    let domain = 'this website';
    try {
      domain = new URL(entry.url).hostname;
    } catch {}

    const titleEl = document.getElementById('pass-banner-title');
    const subEl = document.getElementById('pass-banner-subtitle');
    if (titleEl) titleEl.textContent = `Save password for ${domain}?`;
    if (subEl) subEl.textContent = entry.username ? `Username: ${entry.username}` : `Credentials for ${domain}`;

    const saveBtn = document.getElementById('pass-banner-save');
    const dismissBtn = document.getElementById('pass-banner-dismiss');

    // Clear any previous timer
    if (passwordBannerTimer) clearTimeout(passwordBannerTimer);

    // Save action
    saveBtn.onclick = () => {
      lit.savePassword(entry);
      hidePasswordSaveBanner();
      showToast('Password saved to vault', 'success');
    };

    // Dismiss action
    dismissBtn.onclick = () => {
      lit.dismissPasswordSave();
      hidePasswordSaveBanner();
    };

    banner.classList.add('visible');

    // Auto-dismiss after 10 seconds
    passwordBannerTimer = setTimeout(() => {
      lit.dismissPasswordSave();
      hidePasswordSaveBanner();
    }, 10000);
  }

  function hidePasswordSaveBanner() {
    const banner = document.getElementById('password-save-banner');
    if (banner) banner.classList.remove('visible');
    if (passwordBannerTimer) {
      clearTimeout(passwordBannerTimer);
      passwordBannerTimer = null;
    }
  }

  // ============================================================================
  // 12. AUTOFILL POPUP
  // ============================================================================

  async function showAutofillSuggestions(suggestionData) {
    const popup = document.getElementById('autofill-popup');
    if (!popup) return;

    let profiles = suggestionData?.profiles;
    if (!profiles || !profiles.length) {
      profiles = await lit.getAutofillProfiles();
    }
    if (!profiles || !profiles.length) return;

    popup.innerHTML = `
      <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;padding:4px 6px;">Autofill Profile</div>
    `;

    profiles.forEach((profile) => {
      const item = document.createElement('div');
      item.className = 'autofill-profile-item';
      item.innerHTML = `
        <div class="autofill-name">${escapeHtml(profile.name || 'Profile')}</div>
        <div class="autofill-details">${escapeHtml(profile.email || '')} ${profile.phone ? '• ' + escapeHtml(profile.phone) : ''}</div>
      `;
      item.addEventListener('click', () => {
        lit.acceptAutofill(profile.id, state.activeTabId);
        hideAutofillPopup();
      });
      popup.appendChild(item);
    });

    if (suggestionData?.rect) {
      popup.style.top = `${suggestionData.rect.y + suggestionData.rect.height + 6}px`;
      popup.style.left = `${suggestionData.rect.x}px`;
    }

    popup.classList.add('visible');
  }

  function hideAutofillPopup() {
    const popup = document.getElementById('autofill-popup');
    if (popup) popup.classList.remove('visible');
  }

  // ============================================================================
  // 13. SIDE PANELS: BOOKMARKS & HISTORY
  // ============================================================================

  function openPanel(panelName) {
    closePanels();
    activePanel = panelName;

    const panel = document.getElementById(`${panelName}-panel`);
    const backdrop = document.getElementById('panel-backdrop');

    if (panel) panel.classList.add('open');
    if (backdrop) {
      backdrop.classList.add('active');
      backdrop.classList.add('visible');
    }

    if (panelName === 'bookmarks') {
      renderBookmarksList();
      const search = document.getElementById('bookmarks-search-input');
      if (search) { search.value = ''; search.focus(); }
    } else if (panelName === 'history') {
      renderHistoryList();
      const search = document.getElementById('history-search-input');
      if (search) { search.value = ''; search.focus(); }
    }
  }

  function closePanels() {
    activePanel = null;
    document.querySelectorAll('.side-glass-panel, .side-panel').forEach(p => p.classList.remove('open'));
    const backdrop = document.getElementById('panel-backdrop');
    if (backdrop) {
      backdrop.classList.remove('active');
      backdrop.classList.remove('visible');
    }

    // Also close modals and dropdowns
    closeModals();
    closeAppMenu();
    hideDownloadsBar();
  }

  async function renderBookmarksList(query = '') {
    const listContainer = document.getElementById('bookmarks-list');
    if (!listContainer) return;

    listContainer.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:12px">Loading...</div>';

    let bookmarks = await lit.getBookmarks();
    if (query.trim()) {
      const q = query.toLowerCase();
      bookmarks = bookmarks.filter(b => (b.title && b.title.toLowerCase().includes(q)) || (b.url && b.url.toLowerCase().includes(q)));
    }

    if (!bookmarks.length) {
      listContainer.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:24px;text-align:center;">No bookmarks found</div>`;
      return;
    }

    listContainer.innerHTML = '';
    bookmarks.forEach(b => {
      const item = document.createElement('div');
      item.className = 'panel-item';
      item.innerHTML = `
        <div class="panel-item-favicon">
          ${renderFavicon(b.favicon, false)}
        </div>
        <div class="panel-item-info">
          <div class="panel-item-title">${escapeHtml(b.title || b.url)}</div>
          <div class="panel-item-url">${escapeHtml(b.url)}</div>
        </div>
        <button class="panel-item-delete" title="Delete bookmark">${ICONS.trash}</button>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.panel-item-delete')) return;
        lit.navigate(b.url);
        closePanels();
      });

      const delBtn = item.querySelector('.panel-item-delete');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        lit.removeBookmark(b.url);
        item.remove();
        showToast('Bookmark removed', 'info');
        const activeTab = state.tabs.get(state.activeTabId);
        if (activeTab && activeTab.url === b.url) {
          setBookmarkStarVisual(false);
        }
      });

      listContainer.appendChild(item);
    });
  }

  async function renderHistoryList(query = '') {
    const listContainer = document.getElementById('history-list');
    if (!listContainer) return;

    listContainer.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:12px">Loading...</div>';

    const historyItems = await lit.getHistory(query, 100);

    if (!historyItems || !historyItems.length) {
      listContainer.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:24px;text-align:center;">No history recorded</div>`;
      return;
    }

    listContainer.innerHTML = '';

    // Group history items by date
    const groups = groupByDate(historyItems);

    for (const [groupName, items] of Object.entries(groups)) {
      if (!items.length) continue;

      const header = document.createElement('div');
      header.className = 'history-date-header';
      header.textContent = groupName;
      listContainer.appendChild(header);

      items.forEach(h => {
        const item = document.createElement('div');
        item.className = 'panel-item';
        item.innerHTML = `
          <div class="panel-item-favicon">${ICONS.globe}</div>
          <div class="panel-item-info">
            <div class="panel-item-title">${escapeHtml(h.title || h.url)}</div>
            <div class="panel-item-url">${escapeHtml(h.url)}</div>
          </div>
          <button class="panel-item-delete" title="Delete entry">${ICONS.trash}</button>
        `;

        item.addEventListener('click', (e) => {
          if (e.target.closest('.panel-item-delete')) return;
          lit.navigate(h.url);
          closePanels();
        });

        const delBtn = item.querySelector('.panel-item-delete');
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          lit.deleteHistoryEntry(h.id);
          item.remove();
        });

        listContainer.appendChild(item);
      });
    }
  }

  function groupByDate(items) {
    const groups = { Today: [], Yesterday: [], 'Last 7 Days': [], Older: [] };
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayMidnight = todayMidnight - 86400000;
    const sevenDaysAgo = todayMidnight - 86400000 * 7;

    items.forEach(item => {
      const time = new Date(item.timestamp || item.date || Date.now()).getTime();
      if (time >= todayMidnight) {
        groups.Today.push(item);
      } else if (time >= yesterdayMidnight) {
        groups.Yesterday.push(item);
      } else if (time >= sevenDaysAgo) {
        groups['Last 7 Days'].push(item);
      } else {
        groups.Older.push(item);
      }
    });

    return groups;
  }

  // ============================================================================
  // 14. DOWNLOADS SHELF BAR
  // ============================================================================

  function handleDownloadStarted(item) {
    state.downloads.set(item.id || item.filename, item);
    renderDownloadItem(item);
    showDownloadsBar();
  }

  function handleDownloadProgress(item) {
    const key = item.id || item.filename;
    state.downloads.set(key, item);
    updateDownloadItem(item);
  }

  function handleDownloadCompleted(item) {
    const key = item.id || item.filename;
    state.downloads.set(key, item);
    updateDownloadItem(item, true);
    showToast(`Download finished: ${item.filename}`, 'success');
  }

  async function toggleDownloadsBar() {
    const bar = document.getElementById('downloads-bar');
    if (!bar) return;
    const isVisible = bar.classList.contains('visible') || bar.classList.contains('open');
    if (isVisible) {
      hideDownloadsBar();
    } else {
      await showDownloadsBar();
    }
  }

  async function showDownloadsBar() {
    const bar = document.getElementById('downloads-bar');
    if (bar) {
      bar.classList.add('visible');
      bar.classList.add('open');
    }
    await renderAllDownloads();
  }

  function hideDownloadsBar() {
    const bar = document.getElementById('downloads-bar');
    if (bar) {
      bar.classList.remove('visible');
      bar.classList.remove('open');
    }
  }

  async function renderAllDownloads() {
    const container = document.getElementById('downloads-container');
    if (!container) return;

    let items = [];
    try {
      items = await lit.getDownloads();
    } catch (e) {
      items = [];
    }

    if (!Array.isArray(items) || items.length === 0) {
      container.innerHTML = `
        <div class="downloads-empty">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          <div>No recent downloads</div>
          <button class="header-action-btn" id="empty-open-folder-btn" style="padding:4px 10px;margin-top:4px;">Open Downloads Folder</button>
        </div>
      `;
      document.getElementById('empty-open-folder-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        lit.showInFolder('');
      });
      return;
    }

    container.innerHTML = '';
    items.slice(0, 30).forEach(item => {
      const id = `dl-${item.id || sanitizeId(item.filename)}`;
      const card = document.createElement('div');
      card.id = id;
      card.className = 'download-card';

      const filePath = item.filePath || item.savePath || '';

      card.innerHTML = `
        <div style="color:var(--text-sub);display:flex;align-items:center;">${ICONS.download}</div>
        <div class="download-card-info">
          <div class="download-card-filename" title="${escapeHtml(item.filename || 'Download')}">${escapeHtml(item.filename || 'Download')}</div>
          <div class="download-progress-bg">
            <div class="download-progress-bar" style="width: 100%; background: #ffffff;"></div>
          </div>
        </div>
        <div class="download-actions">
          <button class="download-action-btn" title="Open file" id="${id}-open">${ICONS.check}</button>
          <button class="download-action-btn" title="Show in folder" id="${id}-folder">${ICONS.folder}</button>
        </div>
      `;

      card.querySelector(`#${id}-open`)?.addEventListener('click', (e) => {
        e.stopPropagation();
        lit.openDownload(filePath);
      });
      card.querySelector(`#${id}-folder`)?.addEventListener('click', (e) => {
        e.stopPropagation();
        lit.showInFolder(filePath);
      });

      container.appendChild(card);
    });
  }

  function renderDownloadItem(item) {
    const container = document.getElementById('downloads-container');
    if (!container) return;

    const id = `dl-${item.id || sanitizeId(item.filename)}`;
    let card = document.getElementById(id);

    if (!card) {
      card = document.createElement('div');
      card.id = id;
      card.className = 'download-card';
      container.appendChild(card);
    }

    card.innerHTML = `
      <div style="color:var(--accent)">${ICONS.download}</div>
      <div class="download-card-info">
        <div class="download-card-filename" title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</div>
        <div class="download-progress-bg">
          <div class="download-progress-bar" id="${id}-bar"></div>
        </div>
      </div>
      <div class="download-actions" id="${id}-actions"></div>
    `;
  }

  function updateDownloadItem(item, isComplete = false) {
    const id = `dl-${item.id || sanitizeId(item.filename)}`;
    const card = document.getElementById(id);
    if (!card) {
      renderDownloadItem(item);
    }

    const bar = document.getElementById(`${id}-bar`);
    const actions = document.getElementById(`${id}-actions`);

    let percent = item.percent || 0;
    if (!percent && item.totalBytes && item.receivedBytes) {
      percent = Math.round((item.receivedBytes / item.totalBytes) * 100);
    }

    if (bar) {
      bar.style.width = isComplete ? '100%' : `${percent}%`;
      if (isComplete) bar.style.backgroundColor = 'var(--success)';
    }

    if (isComplete && actions) {
      actions.innerHTML = `
        <button class="find-btn" id="${id}-open" title="Open file">${ICONS.check}</button>
        <button class="find-btn" id="${id}-folder" title="Show in folder">${ICONS.folder}</button>
      `;

      const path = item.filePath || item.savePath;
      document.getElementById(`${id}-open`)?.addEventListener('click', () => {
        lit.openDownload(path);
      });
      document.getElementById(`${id}-folder`)?.addEventListener('click', () => {
        lit.showInFolder(path);
      });
    }
  }

  // ============================================================================
  // 15. FIND IN PAGE
  // ============================================================================

  function toggleFindBar() {
    const findBar = document.getElementById('find-bar');
    if (!findBar) return;

    const isOpen = findBar.classList.contains('visible');
    if (isOpen) {
      hideFindBar();
    } else {
      showFindBar();
    }
  }

  function showFindBar() {
    const findBar = document.getElementById('find-bar');
    const input = document.getElementById('find-input');
    if (!findBar || !input) return;

    findBar.classList.add('visible');
    input.focus();
    input.select();

    if (input.value) {
      lit.findInPage(input.value, { forward: true, findNext: false });
    }
  }

  function hideFindBar() {
    const findBar = document.getElementById('find-bar');
    if (findBar) findBar.classList.remove('visible');
    lit.stopFindInPage('clearSelection');
  }

  // ============================================================================
  // 16. APP DROPDOWN MENU
  // ============================================================================

  function toggleAppMenu() {
    const menu = document.getElementById('app-menu');
    if (!menu) return;
    const isOpen = menu.classList.contains('visible') || menu.classList.contains('open');
    if (isOpen) {
      closeAppMenu();
    } else {
      menu.classList.add('visible');
      menu.classList.add('open');
    }
  }

  function closeAppMenu() {
    const menu = document.getElementById('app-menu');
    if (menu) {
      menu.classList.remove('visible');
      menu.classList.remove('open');
    }
  }

  function handleMenuAction(action) {
    closeAppMenu();
    switch (action) {
      case 'new-tab':
        lit.newTab();
        break;
      case 'bookmarks':
        openPanel('bookmarks');
        break;
      case 'history':
        openPanel('history');
        break;
      case 'downloads':
        toggleDownloadsBar();
        break;
      case 'find':
        showFindBar();
        break;
      case 'passwords':
        lit.newTab('lit://settings#passwords');
        break;
      case 'settings':
        lit.newTab('lit://settings');
        break;
      case 'about':
        lit.newTab('lit://settings#about');
        break;
    }
  }

  // ============================================================================
  // 17. SETTINGS & PASSWORD VAULT MODAL
  // ============================================================================

  function openSettingsModal(defaultSection = 'general') {
    closePanels();
    const modal = document.getElementById('settings-modal');
    const backdrop = document.getElementById('panel-backdrop');

    if (modal) modal.classList.add('open');
    if (backdrop) backdrop.classList.add('active');

    switchSettingsTab(defaultSection);
    loadSettingsData();
  }

  function closeModals() {
    document.querySelectorAll('#settings-modal, #about-modal').forEach(m => m.classList.remove('open'));
  }

  function openAboutModal() {
    closePanels();
    const modal = document.getElementById('about-modal');
    const backdrop = document.getElementById('panel-backdrop');
    if (modal) modal.classList.add('open');
    if (backdrop) backdrop.classList.add('active');
  }

  function switchSettingsTab(sectionName) {
    document.querySelectorAll('.modal-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === sectionName);
    });
    document.querySelectorAll('.settings-section').forEach(sec => {
      sec.classList.toggle('active', sec.id === `settings-${sectionName}`);
    });

    if (sectionName === 'passwords') {
      checkVaultStatus();
    } else if (sectionName === 'autofill') {
      loadAutofillProfiles();
    } else if (sectionName === 'privacy') {
      loadPrivacyStats();
    }
  }

  async function loadSettingsData() {
    try {
      const s = await lit.getSettings();
      if (s) {
        state.settings = { ...state.settings, ...s };
        const engineSelect = document.getElementById('settings-search-engine');
        const homeInput = document.getElementById('settings-homepage');
        const adToggle = document.getElementById('settings-adblock-toggle');

        if (engineSelect && s.searchEngine) engineSelect.value = s.searchEngine;
        if (homeInput && s.homepage) homeInput.value = s.homepage;
        if (adToggle && s.adBlocker !== undefined) adToggle.checked = s.adBlocker;
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
  }

  async function checkVaultStatus() {
    const isLocked = await lit.isVaultLocked();
    const lockedView = document.getElementById('vault-locked-view');
    const unlockedView = document.getElementById('vault-unlocked-view');

    if (isLocked) {
      if (lockedView) lockedView.style.display = 'flex';
      if (unlockedView) unlockedView.style.display = 'none';
    } else {
      if (lockedView) lockedView.style.display = 'none';
      if (unlockedView) unlockedView.style.display = 'flex';
      loadVaultPasswords();
    }
  }

  async function loadVaultPasswords() {
    const list = document.getElementById('vault-passwords-list');
    if (!list) return;

    list.innerHTML = '<div style="color:var(--text-muted);font-size:12px">Loading passwords...</div>';
    const passwords = await lit.getPasswords();

    if (!passwords.length) {
      list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:12px 0;">No passwords saved yet.</div>';
      return;
    }

    list.innerHTML = '';
    passwords.forEach(p => {
      const item = document.createElement('div');
      item.className = 'panel-item';
      item.innerHTML = `
        <div style="flex:1">
          <div style="font-weight:600;font-size:13px">${escapeHtml(p.url)}</div>
          <div style="font-size:12px;color:var(--text-muted)">User: ${escapeHtml(p.username)}</div>
        </div>
        <button class="find-btn copy-pass-btn" title="Copy password">${ICONS.copy}</button>
        <button class="panel-item-delete" title="Delete password">${ICONS.trash}</button>
      `;

      item.querySelector('.copy-pass-btn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(p.password);
        showToast('Password copied to clipboard', 'info');
      });

      item.querySelector('.panel-item-delete')?.addEventListener('click', () => {
        lit.deletePassword(p.id);
        item.remove();
        showToast('Password deleted', 'info');
      });

      list.appendChild(item);
    });
  }

  async function loadAutofillProfiles() {
    const list = document.getElementById('autofill-profiles-list');
    if (!list) return;

    const profiles = await lit.getAutofillProfiles();
    if (!profiles.length) {
      list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:12px 0;">No autofill profiles saved.</div>';
      return;
    }

    list.innerHTML = '';
    profiles.forEach(pr => {
      const item = document.createElement('div');
      item.className = 'panel-item';
      item.innerHTML = `
        <div style="flex:1">
          <div style="font-weight:600;font-size:13px">${escapeHtml(pr.name)}</div>
          <div style="font-size:12px;color:var(--text-muted)">${escapeHtml(pr.email || '')} • ${escapeHtml(pr.phone || '')}</div>
        </div>
        <button class="panel-item-delete" title="Delete profile">${ICONS.trash}</button>
      `;

      item.querySelector('.panel-item-delete')?.addEventListener('click', () => {
        lit.deleteAutofillProfile(pr.id);
        item.remove();
        showToast('Profile deleted', 'info');
      });

      list.appendChild(item);
    });
  }

  async function loadPrivacyStats() {
    const statsEl = document.getElementById('settings-blocked-stats');
    if (!statsEl) return;
    try {
      const stats = await lit.getBlockedCount();
      statsEl.textContent = `Total: ${stats.total || 0} ads & trackers (Session: ${stats.session || 0})`;
    } catch {
      statsEl.textContent = 'Ad blocker is active.';
    }
  }

  // ============================================================================
  // 18. WINDOW CONTROLS & EVENT BINDINGS
  // ============================================================================

  function bindUIEventListeners() {
    // New tab button
    document.getElementById('new-tab-btn')?.addEventListener('click', () => lit.newTab());

    // Navigation buttons
    (document.getElementById('btn-back') || document.getElementById('back-btn'))?.addEventListener('click', () => lit.goBack());
    (document.getElementById('btn-forward') || document.getElementById('forward-btn'))?.addEventListener('click', () => lit.goForward());
    (document.getElementById('btn-reload') || document.getElementById('reload-btn'))?.addEventListener('click', () => {
      const activeTab = state.tabs.get(state.activeTabId);
      if (activeTab?.loading) {
        lit.stopLoading();
      } else {
        lit.reload();
      }
    });

    // Bookmark button
    (document.getElementById('btn-bookmark-star') || document.getElementById('bookmark-btn'))?.addEventListener('click', toggleBookmarkActiveTab);

    // URL input focus / blur / enter
    const urlInput = document.getElementById('url-input');
    if (urlInput) {
      urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          handleUrlSubmit();
        } else if (e.key === 'Escape') {
          const currentTab = state.tabs.get(state.activeTabId);
          urlInput.value = formatSimplifiedUrl(currentTab?.url);
          urlInput.blur();
        }
      });

      urlInput.addEventListener('focus', () => {
        const currentTab = state.tabs.get(state.activeTabId);
        urlInput.value = currentTab?.url || '';
        urlInput.select();
      });

      urlInput.addEventListener('blur', () => {
        const currentTab = state.tabs.get(state.activeTabId);
        urlInput.value = formatSimplifiedUrl(currentTab?.url);
      });
    }

    // AdBlock badge toggle
    (document.getElementById('badge-adblock') || document.getElementById('adblock-btn'))?.addEventListener('click', async () => {
      const enabled = await lit.isAdBlockerEnabled();
      lit.toggleAdBlocker(!enabled);
      state.adBlockerEnabled = !enabled;
      showToast(enabled ? 'Ad Blocker disabled' : 'Ad Blocker enabled', 'info');
    });

    // Downloads button in toolbar
    document.getElementById('btn-downloads')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDownloadsBar();
    });

    document.getElementById('btn-open-downloads-folder')?.addEventListener('click', (e) => {
      e.stopPropagation();
      lit.showInFolder('');
    });

    // App menu
    (document.getElementById('btn-menu') || document.getElementById('menu-btn'))?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleAppMenu();
    });

    document.querySelectorAll('#app-menu .menu-item, #browser-menu .menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action || item.id?.replace('menu-item-', '');
        handleMenuAction(action);
      });
    });

    // Window controls
    (document.getElementById('btn-minimize') || document.getElementById('min-btn'))?.addEventListener('click', () => lit.minimizeWindow());
    (document.getElementById('btn-maximize') || document.getElementById('max-btn'))?.addEventListener('click', () => lit.maximizeWindow());
    (document.getElementById('btn-close') || document.getElementById('close-btn'))?.addEventListener('click', () => lit.closeWindow());

    // Panel close buttons
    (document.getElementById('close-bookmarks-panel') || document.querySelector('#bookmarks-panel .panel-close-btn'))?.addEventListener('click', closePanels);
    (document.getElementById('close-history-panel') || document.querySelector('#history-panel .panel-close-btn'))?.addEventListener('click', closePanels);
    document.getElementById('close-settings-modal')?.addEventListener('click', closePanels);
    document.getElementById('close-about-modal')?.addEventListener('click', closePanels);
    document.getElementById('panel-backdrop')?.addEventListener('click', closePanels);

    // Bookmarks search
    (document.querySelector('#bookmarks-panel .panel-search-input') || document.getElementById('bookmarks-search-input'))?.addEventListener('input', (e) => {
      renderBookmarksList(e.target.value);
    });

    // History search & clear
    (document.querySelector('#history-panel .panel-search-input') || document.getElementById('history-search-input'))?.addEventListener('input', (e) => {
      renderHistoryList(e.target.value);
    });
    (document.getElementById('clear-history-btn') || document.querySelector('#history-panel .panel-action-btn.text-btn'))?.addEventListener('click', () => {
      lit.clearHistory();
      renderHistoryList();
      showToast('Browsing history cleared', 'info');
    });

    // Downloads bar close
    (document.getElementById('btn-close-downloads-bar') || document.getElementById('downloads-close-btn'))?.addEventListener('click', hideDownloadsBar);

    // Find in Page controls
    const findInput = document.getElementById('find-input');
    findInput?.addEventListener('input', (e) => {
      lit.findInPage(e.target.value, { forward: true, findNext: false });
    });
    findInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        lit.findInPage(findInput.value, { forward: !e.shiftKey, findNext: true });
      } else if (e.key === 'Escape') {
        hideFindBar();
      }
    });
    (document.getElementById('find-next-btn') || document.getElementById('find-next'))?.addEventListener('click', () => {
      lit.findInPage(findInput?.value || '', { forward: true, findNext: true });
    });
    (document.getElementById('find-prev-btn') || document.getElementById('find-prev'))?.addEventListener('click', () => {
      lit.findInPage(findInput?.value || '', { forward: false, findNext: true });
    });
    (document.getElementById('find-close-btn') || document.getElementById('find-close'))?.addEventListener('click', hideFindBar);

    // Modal navigation tabs
    document.querySelectorAll('.modal-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        switchSettingsTab(btn.dataset.tab);
      });
    });

    // Vault Unlock
    document.getElementById('vault-unlock-btn')?.addEventListener('click', async () => {
      const pwdInput = document.getElementById('vault-password-input');
      const pwd = pwdInput?.value || '';
      if (!pwd) return;
      const success = await lit.unlockVault(pwd);
      if (success) {
        pwdInput.value = '';
        checkVaultStatus();
        showToast('Vault unlocked', 'success');
      } else {
        showToast('Incorrect master password', 'error');
      }
    });

    // Settings inputs auto-save
    document.getElementById('settings-search-engine')?.addEventListener('change', (e) => {
      state.settings.searchEngine = e.target.value;
      lit.updateSettings({ searchEngine: e.target.value });
    });
    document.getElementById('settings-homepage')?.addEventListener('change', (e) => {
      state.settings.homepage = e.target.value;
      lit.updateSettings({ homepage: e.target.value });
    });
    document.getElementById('settings-adblock-toggle')?.addEventListener('change', (e) => {
      lit.toggleAdBlocker(e.target.checked);
      lit.updateSettings({ adBlocker: e.target.checked });
    });

    // Click outside handler for popup & dropdowns
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#app-menu') && !e.target.closest('#btn-menu') && !e.target.closest('#menu-btn')) {
        closeAppMenu();
      }
      if (!e.target.closest('#downloads-bar') && !e.target.closest('#btn-downloads')) {
        hideDownloadsBar();
      }
      if (!e.target.closest('#autofill-popup')) {
        hideAutofillPopup();
      }
    });

    // Bridge shortcut events from main process (CmdOrCtrl+J, CmdOrCtrl+F, CmdOrCtrl+H, etc.)
    if (typeof lit.onToggleDownloads === 'function') {
      lit.onToggleDownloads(() => toggleDownloadsBar());
    }
    if (typeof lit.onOpenFind === 'function') {
      lit.onOpenFind(() => showFindBar());
    }
    if (typeof lit.onToggleHistory === 'function') {
      lit.onToggleHistory(() => {
        if (activePanel === 'history') closePanels();
        else openPanel('history');
      });
    }
    if (typeof lit.onPromptBookmark === 'function') {
      lit.onPromptBookmark(() => toggleBookmarkActiveTab());
    }
    if (typeof lit.onFocusUrlBar === 'function') {
      lit.onFocusUrlBar(() => {
        const input = document.getElementById('url-input');
        if (input) {
          input.focus();
          input.select();
        }
      });
    }
  }

  // ============================================================================
  // 19. GLOBAL KEYBOARD SHORTCUTS
  // ============================================================================

  function bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Escape -> Close panels, find bar, dropdowns, popups
      if (e.key === 'Escape') {
        hideFindBar();
        closePanels();
        hidePasswordSaveBanner();
        hideAutofillPopup();
        return;
      }

      // Ctrl + L or Alt + D -> Focus URL bar
      if ((isCtrlOrCmd && (e.key === 'l' || e.key === 'L')) || (e.altKey && (e.key === 'd' || e.key === 'D'))) {
        e.preventDefault();
        const urlInput = document.getElementById('url-input');
        if (urlInput) {
          urlInput.focus();
          urlInput.select();
        }
        return;
      }

      // Ctrl + T and Ctrl + W are handled globally by Electron Menu accelerators
      // to avoid double-firing.

      // Ctrl + R or F5 -> Reload
      if ((isCtrlOrCmd && (e.key === 'r' || e.key === 'R')) || e.key === 'F5') {
        e.preventDefault();
        lit.reload();
        return;
      }

      // Ctrl + F -> Find in page
      if (isCtrlOrCmd && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        toggleFindBar();
        return;
      }

      // Ctrl + H -> History
      if (isCtrlOrCmd && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        openPanel('history');
        return;
      }

      // Ctrl + B or Ctrl + Shift + O -> Bookmarks
      if ((isCtrlOrCmd && (e.key === 'b' || e.key === 'B')) || (isCtrlOrCmd && e.shiftKey && (e.key === 'o' || e.key === 'O'))) {
        e.preventDefault();
        openPanel('bookmarks');
        return;
      }

      // Ctrl + J -> Downloads
      if (isCtrlOrCmd && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        showDownloadsBar();
        return;
      }

      // Ctrl + D -> Bookmark active tab
      if (isCtrlOrCmd && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        toggleBookmarkActiveTab();
        return;
      }

      // Alt + Left -> Back
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        lit.goBack();
        return;
      }

      // Alt + Right -> Forward
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        lit.goForward();
        return;
      }

      // Ctrl + 1..9 -> Switch to Tab N
      if (isCtrlOrCmd && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const tabList = Array.from(state.tabs.keys());
        if (!tabList.length) return;

        if (e.key === '9') {
          // Switch to last tab
          lit.switchTab(tabList[tabList.length - 1]);
        } else {
          const index = parseInt(e.key, 10) - 1;
          if (index < tabList.length) {
            lit.switchTab(tabList[index]);
          }
        }
      }
    });
  }

  // ============================================================================
  // 20. IPC LISTENERS (Binding preload callbacks)
  // ============================================================================

  function bindBridgeListeners() {
    // Tabs
    lit.onTabCreated((tab) => {
      const element = createTabElement(tab);
      state.tabs.set(tab.id, {
        ...tab,
        element,
        loading: false,
        canGoBack: false,
        canGoForward: false,
        blockedCount: 0
      });
    });

    lit.onTabUpdated((tab) => {
      const existing = state.tabs.get(tab.id) || {};
      const updated = { ...existing, ...tab };
      state.tabs.set(tab.id, updated);
      updateTabElement(tab.id, updated);

      if (tab.id === state.activeTabId) {
        updateNavButtons(updated);
        updateUrlBarDisplay(updated.url);
        checkBookmarkState(updated.url);
      }
    });

    lit.onTabRemoved((tabId) => {
      removeTabElement(tabId);
    });

    lit.onActiveTabChanged((tabId) => {
      setActiveTab(tabId);
    });

    // Ad blocker
    lit.onBlockedCountUpdated(({ tabId, count }) => {
      const tab = state.tabs.get(tabId);
      if (tab) tab.blockedCount = count;
      if (tabId === state.activeTabId) {
        updateAdBlockBadge(count);
      }
    });

    // Passwords
    lit.onPasswordSavePrompt((entry) => {
      showPasswordSaveBanner(entry);
    });

    // Autofill
    lit.onAutofillSuggestion((data) => {
      showAutofillSuggestions(data);
    });

    // Downloads
    lit.onDownloadStarted(handleDownloadStarted);
    lit.onDownloadProgress(handleDownloadProgress);
    lit.onDownloadCompleted(handleDownloadCompleted);

    // Settings
    lit.onSettingsChanged((newSettings) => {
      state.settings = { ...state.settings, ...newSettings };
    });

    // Window controls
    lit.onMaximizedChanged((isMaximized) => {
      state.isMaximized = isMaximized;
      const maxBtn = document.getElementById('max-btn');
      if (maxBtn) {
        maxBtn.innerHTML = isMaximized ? ICONS.restore : ICONS.maximize;
        maxBtn.setAttribute('title', isMaximized ? 'Restore' : 'Maximize');
      }
    });

    // Find in Page Results
    lit.onFindResults((results) => {
      const countEl = document.getElementById('find-count');
      if (!countEl) return;
      if (results.matches > 0) {
        countEl.textContent = `${results.activeMatchOrdinal} of ${results.matches}`;
      } else {
        const findInput = document.getElementById('find-input');
        countEl.textContent = findInput?.value ? '0 of 0' : '';
      }
    });
  }

  // ============================================================================
  // 21. HELPER UTILITIES
  // ============================================================================

  function escapeHtml(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeId(str) {
    if (!str) return 'dl';
    return String(str).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  // ============================================================================
  // 22. INITIALIZATION
  // ============================================================================

  async function init() {
    ensureDOMStructure();
    bindUIEventListeners();
    bindKeyboardShortcuts();
    bindBridgeListeners();

    // Check window maximized state
    try {
      const isMax = await lit.isMaximized();
      state.isMaximized = isMax;
      const maxBtn = document.getElementById('max-btn');
      if (maxBtn) {
        maxBtn.innerHTML = isMax ? ICONS.restore : ICONS.maximize;
        maxBtn.setAttribute('title', isMax ? 'Restore' : 'Maximize');
      }
    } catch {}

    // Load initial settings
    loadSettingsData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
