# 🔥 Lit Browser

A super-lightweight, minimalistic browser for Windows. No AI, no bloat, no ads. Built for speed, privacy, and simplicity.

---

## ✨ Features

- 🏎️ **Ultra-Minimalist & Fast**: Inspired by Arc Search on Mac. Clean chrome, maximum screen space for content, zero bloat.
- 🛡️ **Built-in Ad & Tracker Blocker**: 
  - Blocks 200+ known ad and tracker networks at the network request level (`session.webRequest`).
  - Strips third-party tracking cookies.
  - Automatically sends `DNT: 1` (Do Not Track).
  - Real-time badge counter showing blocked items.
- 🔐 **Encrypted Password Manager**:
  - Encrypted local vault using AES-256-GCM.
  - Key derived using PBKDF2 (100,000 iterations, SHA-512).
  - Optional Master Password protection.
  - Automatic **Save Password** slide-down prompt on login/signup forms.
  - Autofill credentials with domain matching.
- 📋 **Personal Info & Card Autofill**:
  - Store and autofill Personal profiles (Name, Email, Phone).
  - Address profiles (Street, City, State, ZIP, Country).
  - Payment Cards (encrypted number & CVV).
  - Auto-detection heuristics for web checkout and signup forms.
- 🎬 **Smooth 60fps Micro-Animations**:
  - Animated tab open/close and crossfade transitions.
  - URL bar expansion and subtle glow on focus.
  - Smooth slide-down password banner and find-in-page bar.
  - Slide-in glass-morphism panels for Bookmarks and History.
  - Indeterminate shimmering page-load progress indicator.
- 📑 **Modern Tab System**:
  - Multi-tab support powered by Chromium `WebContentsView`.
  - DuckDuckGo privacy search integration.
  - Minimal custom new tab page with quick shortcuts and clean clock.
  - Full internal settings page (`lit://settings`).

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl + T` | Open new tab |
| `Ctrl + W` | Close current tab |
| `Ctrl + Tab` | Next tab |
| `Ctrl + Shift + Tab` | Previous tab |
| `Ctrl + 1` to `9` | Jump directly to tab 1-9 |
| `Ctrl + L` / `Alt + D` | Focus URL / search bar |
| `Ctrl + R` / `F5` | Reload page |
| `Alt + Left` | Go back |
| `Alt + Right` | Go forward |
| `Ctrl + D` | Bookmark / unbookmark current page |
| `Ctrl + H` | Toggle History panel |
| `Ctrl + F` | Find in page |
| `F11` | Toggle Fullscreen |
| `F12` | Toggle Developer Tools |

---

## 🚀 Running Lit Browser

To start the browser:

```bash
npm start
```

Or in development mode:

```bash
npm run dev
```

---

## 📦 Building Windows Installer (.exe)

To build a standalone Windows installer:

```bash
npm run build
```

The resulting installer will be generated in the `dist/` directory.

---

## 🛠️ Tech Architecture

- **Runtime**: Electron 33 (Chromium + Node.js)
- **UI Engine**: Pure Vanilla HTML5 / Modern CSS / Vanilla JS (zero framework overhead)
- **Database**: Pure JS SQLite (`sql.js`) with disk persistence
- **Security**: AES-256-GCM + PBKDF2 with Node.js Crypto
- **Content Interception**: Electron `webRequest` API for network blocking & DOM injection for form detection
