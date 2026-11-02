// Runs before the app page. Gives the page a few safe helpers and nothing else.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const info = ipcRenderer.sendSync('wp-info');
contextBridge.exposeInMainWorld('wpEnv', {
  electron: true,
  version: info.version,
  packaged: info.packaged,
  webviewPreload: info.webviewPreload,
  // Real location of a file the person picked (used to reopen the same movie later).
  pathFor: (file) => { try { return webUtils.getPathForFile(file) || ''; } catch { return ''; } },
  onOpenUrl: (cb) => ipcRenderer.on('wp-open-url', (_e, url) => cb(url)),
  onUpdate: (cb) => ipcRenderer.on('wp-update', (_e, u) => cb(u)),
  installUpdate: () => ipcRenderer.send('wp-update-install'),
});
