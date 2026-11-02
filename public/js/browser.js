// Shared browser: everyone sees the same page. Pages, scrolling, clicks, typing and page videos are mirrored.
// In the installed app it is a real <webview>; in a plain browser (tests) it falls back to an <iframe>.
(() => {
  const { $ } = WP;
  const screen = $('screen');
  const pane = $('browserPane');
  const host = $('bHost');
  const urlBox = $('bUrl');
  const isEl = !!(WP.env && WP.env.electron && WP.env.webviewPreload);
  const view = (WP.view = { mode: 'lobby', url: '', ver: 0, scroll: null, vid: null });
  let wv = null, ready = false, quiet = 0, cmdQueue = [];
  const dbg = { sent: {}, dropped: {}, got: {} };
  const hist = []; let hi = -1; // history for the iframe fallback

  const cleanUA = () => navigator.userAgent.replace(/\sElectron\/\S+/, '').replace(/\sWatchParty\/\S+/, '');
  const isHttp = (u) => /^https?:\/\//i.test(u);
  const HOME = 'https://duckduckgo.com/';

  function normalize(text) {
    text = String(text || '').trim();
    if (!text) return '';
    if (isHttp(text)) return text;
    if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(text) || /^localhost(:\d+)?(\/\S*)?$/.test(text)) return 'https://' + text;
    return 'https://duckduckgo.com/?q=' + encodeURIComponent(text);
  }

  // ---------- the page element ----------
  function ensureView() {
    if (wv) return wv;
    if (isEl) {
      wv = document.createElement('webview');
      wv.setAttribute('partition', 'persist:wpbrowser');
      wv.setAttribute('useragent', cleanUA());
      wv.setAttribute('preload', WP.env.webviewPreload);
      wv.setAttribute('webpreferences', 'autoplayPolicy=no-user-restriction');
      wv.setAttribute('allowpopups', 'true'); // popups are denied in the main process and opened in this browser instead
      wv.addEventListener('dom-ready', () => { ready = true; flushCmds(); });
      wv.addEventListener('did-start-loading', () => { ready = false; });
      wv.addEventListener('did-navigate', (e) => onPageNav(e.url));
      wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) onPageNav(e.url); });
      wv.addEventListener('did-finish-load', () => { ready = true; flushCmds(); afterLoad(); });
      wv.addEventListener('ipc-message', (e) => { if (e.channel === 'wp') onPageMsg(e.args[0] || {}); });
      host.appendChild(wv);
    } else {
      wv = document.createElement('iframe');
      wv.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
      wv.addEventListener('load', () => { ready = true; afterLoad(); });
      host.appendChild(wv);
    }
    return wv;
  }
  function load(url) {
    ensureView();
    urlBox.value = url;
    if (isEl) {
      let cur = '';
      try { cur = wv.getURL(); } catch { /* not ready yet */ }
      if (cur === url) return; // already showing it: keep its place and video
      ready = false;
      try { if (cur) wv.loadURL(url).catch(() => {}); else wv.setAttribute('src', url); } catch { wv.setAttribute('src', url); }
    } else { ready = false; wv.src = url; }
  }
  function cmd(m) {
    if (!isEl) return;
    dbg.got[m.k] = (dbg.got[m.k] || 0) + 1;
    cmdQueue.push(m);
    if (ready) flushCmds();
  }
  function flushCmds() {
    if (!wv || !ready) return;
    const q = cmdQueue; cmdQueue = [];
    for (const m of q) { try { wv.send('wp-cmd', m); } catch { cmdQueue.push(m); } }
  }

  // ---------- local navigation ----------
  function go(text) {
    const url = normalize(text);
    if (!url) return;
    if (!isEl) { hist.splice(hi + 1); hist.push(url); hi = hist.length - 1; }
    view.url = url; view.scroll = null; view.vid = null;
    load(url);
    WP.broadcast({ t: 'nav', url });
    persist();
    refreshDock();
    WP.act('nav', url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60));
  }
  function onPageNav(url) {
    if (!isHttp(url)) return;
    urlBox.value = url;
    if (url === view.url) return;
    view.url = url; view.scroll = null; view.vid = null;
    if (Date.now() > quiet) { WP.broadcast({ t: 'nav', url }); WP.act('nav', url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)); }
    persist();
  }
  function applyRemoteNav(url) {
    if (!isHttp(url) || url === view.url) return;
    if (view.mode !== 'browser') setMode('browser', true);
    view.url = url; view.scroll = null; view.vid = null;
    quiet = Date.now() + 1800;
    if (!isEl) { hist.splice(hi + 1); hist.push(url); hi = hist.length - 1; }
    load(url);
    persist();
    refreshDock();
  }

  // ---------- mirrored actions from the page ----------
  WP.on('fullscreen', (on) => { if (!on && wv && isEl) { try { wv.send('wp-cmd', { k: 'fs-exit' }); } catch {} } });
  function onPageMsg(m) {
    dbg.sent[m.k] = (dbg.sent[m.k] || 0) + 1;
    if (m.k === 'fs') { WP.setFs(!!m.on); return; } // fullscreen is personal, never shared
    if (Date.now() < quiet && m.k !== 'vid') { dbg.dropped[m.k] = (dbg.dropped[m.k] || 0) + 1; return; }
    switch (m.k) {
      case 'scroll': view.scroll = { fx: m.fx, fy: m.fy }; WP.broadcast({ t: 'bs', fx: m.fx, fy: m.fy }); break;
      case 'click': WP.broadcast({ t: 'bc', path: m.path, fx: m.fx, fy: m.fy }); break;
      case 'input': WP.broadcast({ t: 'bi', path: m.path, value: m.value }); break;
      case 'enter': WP.broadcast({ t: 'be', path: m.path }); break;
      case 'vid': view.vid = { a: m.a, t: m.t, r: m.r, at: Date.now() }; WP.broadcast({ t: 'bv', a: m.a, tm: m.t, r: m.r }); break;
    }
  }
  WP.onMsg('nav', (e, m) => applyRemoteNav(m.url));
  WP.onMsg('bs', (e, m) => { view.scroll = { fx: m.fx, fy: m.fy }; cmd({ k: 'scroll', fx: m.fx, fy: m.fy }); });
  WP.onMsg('bc', (e, m) => cmd({ k: 'click', path: m.path, fx: m.fx, fy: m.fy }));
  WP.onMsg('bi', (e, m) => cmd({ k: 'input', path: m.path, value: m.value }));
  WP.onMsg('be', (e, m) => cmd({ k: 'enter', path: m.path }));
  WP.onMsg('bv', (e, m) => { view.vid = { a: m.a, t: m.tm, r: m.r, at: Date.now() }; cmd({ k: 'vid', a: m.a, t: m.tm, r: m.r }); });

  // a page that finished loading catches up with what the room was doing
  function afterLoad() {
    if (view.scroll) cmd({ k: 'scroll', fx: view.scroll.fx, fy: view.scroll.fy });
    if (view.vid) {
      const v = view.vid;
      const t = v.a === 'play' ? v.t + (Date.now() - v.at) / 1000 : v.t;
      setTimeout(() => cmd({ k: 'vid', a: v.a === 'seek' ? 'pause' : v.a, t, r: v.r }), 1500);
    }
  }

  // ---------- switching between movie and browser ----------
  function setMode(mode, fromRemote) {
    if (view.mode === mode) return;
    view.mode = mode;
    screen.dataset.mode = mode;
    pane.classList.toggle('hidden', mode !== 'browser');
    if (mode === 'browser') { WP.pauseQuiet(); ensureView(); if (view.url) load(view.url); }
    else if (wv) { // the page keeps its place but goes quiet
      if (isEl) { cmd({ k: 'vid', a: 'pause', t: -1 }); try { wv.setAudioMuted(true); } catch {} } else wv.src = 'about:blank';
    }
    if (mode === 'lobby') WP.pauseQuiet();
    if (mode === 'browser' && isEl && wv) { try { wv.setAudioMuted(false); } catch {} }
    WP.emit('view-change', mode);
    if (!fromRemote) view.ver = Date.now();
    persist();
  }
  WP.setMode = (mode, broadcast) => {
    if (view.mode === mode) return;
    setMode(mode, false);
    if (broadcast !== false) WP.broadcast({ t: 'view', mode, url: view.url, ver: view.ver });
  };
  function open(url) {
    if (view.mode !== 'browser') {
      const target = normalize(url) || HOME;
      view.url = target;
      setMode('browser', false);
      WP.broadcast({ t: 'view', mode: 'browser', url: target, ver: view.ver });
      WP.act('nav', target.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60));
    } else go(url);
    refreshDock();
  }
  function refreshDock() { WP.emit('tool-refresh'); }
  WP.on('view-change', refreshDock);

  WP.onMsg('view', (entry, m) => {
    if (m.mode === view.mode && (m.mode !== 'browser' || m.url === view.url)) { view.ver = Math.max(view.ver, m.ver || 0); return; }
    if ((m.ver || 0) <= view.ver) return;
    view.ver = m.ver || view.ver;
    if (m.scroll) view.scroll = m.scroll;
    if (m.vid) view.vid = { ...m.vid, at: Date.now() };
    if (m.mode === 'browser') {
      if (!isHttp(m.url || '')) return;
      view.url = m.url;
      quiet = Date.now() + 1800;
      if (view.mode !== 'browser') setMode('browser', true); else load(view.url);
      refreshDock();
    } else setMode(m.mode === 'lobby' ? 'lobby' : 'player', true);
  });
  WP.onMsg('req-state', (entry) => {
    const vid = view.vid && { ...view.vid, t: view.vid.a === 'play' ? view.vid.t + (Date.now() - view.vid.at) / 1000 : view.vid.t };
    WP.sendTo(entry, { t: 'view', mode: view.mode, url: view.url, ver: view.ver, scroll: view.scroll, vid });
  });

  function persist() { if (WP.rec) { WP.rec.view = { mode: view.mode, url: view.url, ver: view.ver }; WP.save(); } }
  WP.restoreView = () => {
    const v = WP.rec && WP.rec.view;
    if (!v) return;
    view.ver = v.ver || 0;
    if (v.mode === 'browser' && isHttp(v.url || '')) { view.url = v.url; setMode('browser', true); }
    else if (v.mode === 'player') setMode('player', true);
  };

  // ---------- controls ----------
  $('bGo').onclick = () => go(urlBox.value);
  urlBox.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(urlBox.value); e.stopPropagation(); });
  $('bClose').onclick = () => WP.setMode('lobby');
  $('bReload').onclick = () => { if (!wv) return; if (isEl) { try { wv.reload(); } catch {} } else wv.src = view.url; };
  $('bBack').onclick = () => {
    if (isEl) { try { if (wv.canGoBack()) wv.goBack(); } catch {} }
    else if (hi > 0) { hi--; view.url = hist[hi]; load(view.url); WP.broadcast({ t: 'nav', url: view.url }); }
  };
  $('bFwd').onclick = () => {
    if (isEl) { try { if (wv.canGoForward()) wv.goForward(); } catch {} }
    else if (hi < hist.length - 1) { hi++; view.url = hist[hi]; load(view.url); WP.broadcast({ t: 'nav', url: view.url }); }
  };
  if (WP.env && WP.env.onOpenUrl) WP.env.onOpenUrl((u) => { if (isHttp(u)) open(u); });


  WP.browser = { open, go, view, HOME, debug: () => ({ ready, queued: cmdQueue.length, dbg }), isElectron: isEl, get el() { return wv; } };
})();
