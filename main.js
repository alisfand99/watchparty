// Electron main process: opens the app window, protects the shared browser, keeps the app up to date.
const { app, BrowserWindow, session, Menu, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');

const argv = process.argv;
const argVal = (n) => { const a = argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : null; };
const SELFTEST = argv.includes('--selftest');
const SMOKE = argVal('smoke');
if (SELFTEST) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}

const WEBVIEW_PRELOAD = path.join(__dirname, 'webview-preload.js');
let mainWindow = null;

// ---------- invite links: watchparty://join/<room code> ----------
const linkIn = (list) => (list || []).find((x) => typeof x === 'string' && /^watchparty:\/\//i.test(x)) || null;
let pendingJoin = linkIn(argv);
function sendJoin() {
  if (pendingJoin && mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('wp-join', pendingJoin);
    pendingJoin = null;
  }
}
if (app.isPackaged && !SELFTEST && !SMOKE) {
  if (!app.requestSingleInstanceLock()) app.quit();
  else {
    app.on('second-instance', (_e, argv2) => {
      const l = linkIn(argv2);
      if (l) pendingJoin = l;
      if (mainWindow && !mainWindow.isDestroyed()) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
      sendJoin();
    });
  }
}

ipcMain.on('wp-info', (e) => {
  e.returnValue = { version: app.getVersion(), packaged: app.isPackaged, webviewPreload: pathToFileURL(WEBVIEW_PRELOAD).href };
});

ipcMain.on('wp-fullscreen', (e, on) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setFullScreen(!!on); });

function createWindow(opts = {}) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1115',
    title: 'WatchParty',
    show: !SMOKE,
    ...(opts.bounds || {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
      autoplayPolicy: 'no-user-restriction',
      backgroundThrottling: !SELFTEST,
      ...(opts.partition ? { partition: opts.partition } : {}),
    },
  });
  const tellFs = (on) => { try { win.webContents.send('wp-fs', on); } catch {} };
  win.on('enter-full-screen', () => tellFs(true));
  win.on('leave-full-screen', () => tellFs(false));
  win.loadFile(path.join(__dirname, 'public', 'index.html'), opts.query ? { query: opts.query } : undefined);
  return win;
}

// The shared browser may only show web pages, always with our own preload and no node access.
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    if (!/^https?:\/\//i.test(params.src || '')) { event.preventDefault(); return; }
    webPreferences.preload = WEBVIEW_PRELOAD;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.webviewTag = false;
    webPreferences.autoplayPolicy = 'no-user-restriction';
    delete webPreferences.preloadURL;
  });
  // No window ever opens by itself. A page that wants a new window opens it in the shared browser instead.
  contents.setWindowOpenHandler(({ url }) => {
    const host = contents.hostWebContents;
    if (SELFTEST) console.log('[wp] window open', url, !!host, contents.getType());
    if (host && !host.isDestroyed() && /^https?:\/\//i.test(url)) host.send('wp-open-url', url);
    return { action: 'deny' };
  });
});

// ---------- updates ----------
let autoUpdater = null;
function setupUpdates() {
  if (!app.isPackaged || SMOKE) return;
  try { ({ autoUpdater } = require('electron-updater')); } catch { return; }
  const tell = (u) => BrowserWindow.getAllWindows().forEach((w) => { if (!w.isDestroyed()) w.webContents.send('wp-update', u); });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (i) => ulog('available ' + i.version) || tell({ state: 'downloading', version: i.version }));
  autoUpdater.on('download-progress', (p) => tell({ state: 'downloading', percent: p.percent }));
  autoUpdater.on('update-downloaded', (i) => { ulog('downloaded ' + i.version); tell({ state: 'ready', version: i.version }); });
  autoUpdater.on('update-not-available', () => { ulog('none'); tell({ state: 'none', manual }); manual = false; });
  const ulog = (t) => { try { fs.appendFileSync(path.join(app.getPath('userData'), 'updater.log'), new Date().toISOString() + ' ' + t + '\n'); } catch {} };
  ulog('start v' + app.getVersion());
  let manual = false;
  autoUpdater.on('checking-for-update', () => ulog('checking'));
  autoUpdater.on('error', (e) => { ulog('error ' + (e && e.message)); tell({ state: 'error', message: String((e && e.message) || e).split('\n')[0].slice(0, 160) }); });
  ipcMain.on('wp-update-install', () => { try { autoUpdater.quitAndInstall(); } catch {} });
  const check = () => { try { autoUpdater.checkForUpdates().catch((e) => ulog('check failed ' + (e && e.message))); } catch (e) { ulog('check threw ' + e.message); } };
  ipcMain.on('wp-update-check', () => { manual = true; check(); });
  setTimeout(check, 4000);
  setInterval(check, 30 * 60 * 1000);
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  // Camera, microphone and speaker choice for our own page only. The shared browser gets fullscreen and nothing else.
  const allowed = new Set(['media', 'mediaKeySystem', 'speaker-selection', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
  const web = session.fromPartition('persist:wpbrowser');
  const okWeb = new Set(['fullscreen', 'clipboard-sanitized-write']);
  web.setPermissionRequestHandler((_wc, permission, cb) => cb(okWeb.has(permission)));
  web.setPermissionCheckHandler((_wc, permission) => okWeb.has(permission));

  if (SMOKE) { // proves the packaged app starts, then quits
    const win = createWindow();
    win.webContents.on('did-finish-load', async () => {
      let info = {};
      try {
        info = await win.webContents.executeJavaScript(`({ env: !!window.wpEnv && window.wpEnv.electron, version: window.wpEnv && window.wpEnv.version, packaged: window.wpEnv && window.wpEnv.packaged, preload: !!(window.wpEnv && window.wpEnv.webviewPreload), joinVisible: !document.getElementById('join').classList.contains('hidden'), modules: typeof WP === 'object' && Object.keys(WP).length })`);
      } catch (e) { info = { error: String(e) }; }
      let updater = false;
      try { require('electron-updater'); updater = true; } catch (e) { updater = String(e.message); }
      let webview = false;
      try { webview = fs.existsSync(WEBVIEW_PRELOAD); } catch {}
      let updateYml = false;
      try { updateYml = fs.existsSync(path.join(process.resourcesPath, 'app-update.yml')); } catch {}
      fs.writeFileSync(SMOKE, JSON.stringify({ ok: true, info, updater, updateYml, webviewPreloadExists: webview, electron: process.versions.electron }, null, 2));
      app.quit();
    });
    return;
  }
  if (SELFTEST) {
    try { await require('./selftest.js').run({ app, createWindow, BrowserWindow, log: argVal('selftest-log') }); }
    catch (e) { console.error(e); app.exit(1); }
    return;
  }

  mainWindow = createWindow();
  mainWindow.webContents.on('did-finish-load', () => setTimeout(sendJoin, 300));
  if (app.isPackaged) { try { app.setAsDefaultProtocolClient('watchparty'); } catch {} }
  setupUpdates();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow(); });
});

app.on('window-all-closed', () => app.quit());
