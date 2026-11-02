// Joining, recent rooms, chat, history digest, icons, help, updates.
(() => {
  const { $ } = WP;

  // ---------- icons ----------
  const P = {
    play: 'M8 5v14l11-7z',
    pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
    volume: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z',
    mute: 'M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z',
    fullscreen: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
    mic: 'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z',
    cam: 'M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z',
    layout: 'M3 3h8v8H3V3zm10 0h8v5h-8V3zM3 13h8v8H3v-8zm10-3h8v11h-8V10z',
    pen: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
    cc: 'M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM11 11H9.5v-.5h-2v3h2V13H11v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1z',
    film: 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4h-4z',
    globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.95a15.6 15.6 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.9 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14a8.2 8.2 0 0 1 0-4h3.38a16.5 16.5 0 0 0 0 4H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.99 7.99 0 0 1 5.08 16zm2.95-8H5.08a7.99 7.99 0 0 1 4.33-3.56A15.6 15.6 0 0 0 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14a16.5 16.5 0 0 0 0-4h3.38a8.2 8.2 0 0 1 0 4h-3.38z',
    back: 'M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z',
    fwd: 'M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z',
    camera: 'M9 2 7.17 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3.17L15 2H9zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-1.8a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z',
    rec: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z',
    gallery: 'M22 16V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2zm-11-4 2.03 2.71L16 11l4 5H8l3-4zM2 6v14a2 2 0 0 0 2 2h14v-2H4V6H2z',
    reload: 'M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  };
  WP.icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${P[n] || ''}"/></svg>`;
  document.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = WP.icon(el.dataset.icon)));
  WP.emit('icons-ready');

  // ---------- log ----------
  const log = $('log');
  function addLine(el, persist) {
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    if (persist && WP.rec) { WP.rec.chat.push(persist); if (WP.rec.chat.length > 150) WP.rec.chat.splice(0, WP.rec.chat.length - 150); WP.save(); }
  }
  function toast(text) {
    if (!WP.fsOn) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    $('toasts').appendChild(t);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => t.remove(), 6000);
  }
  WP.say = (text, cls) => {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = text;
    addLine(d, { k: 's', text, ts: Date.now() });
    toast(text);
  };
  WP.chatLine = (name, text) => {
    const d = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = name + ': ';
    d.append(b, document.createTextNode(text));
    addLine(d, { k: 'c', who: name, text, ts: Date.now() });
    toast(`${name}: ${text}`);
  };
  WP.onMsg('chat', (entry, m) => WP.chatLine(entry.name, String(m.text || '').slice(0, 500)));
  $('chatForm').onsubmit = (e) => {
    e.preventDefault();
    const t = $('chatInput').value.trim();
    if (!t) return;
    WP.broadcast({ t: 'chat', text: t });
    WP.chatLine('You', t);
    $('chatInput').value = '';
  };
  $('copyLink').onclick = async () => {
    try { await navigator.clipboard.writeText(WP.roomCode); WP.setStatus('Copied.'); }
    catch { WP.setStatus(WP.roomCode); }
  };

  // Things other people did that everyone should notice right away.
  WP.on('act', (e) => {
    if (e.kind === 'source') WP.say(`${e.who} changed the movie.`, 'sys');
    else if (e.kind === 'nav') WP.say(`${e.who} opened ${e.info}`, 'sys');
  });

  // ---------- what happened while I was away ----------
  let digestBuf = [], digestT = 0;
  WP.on('hist-new', (list) => {
    digestBuf.push(...list);
    clearTimeout(digestT);
    digestT = setTimeout(() => { showDigest(digestBuf); digestBuf = []; }, 1500);
  });
  function showDigest(list) {
    const since = WP.rec.prevSeen || 0;
    const by = {};
    for (const e of list) if (e.who !== WP.me.name && e.ts > since) (by[e.who] || (by[e.who] = [])).push(e);
    const lines = [];
    for (const [who, es] of Object.entries(by)) {
      const parts = [];
      const seeks = es.filter((e) => e.kind === 'seek');
      if (seeks.length) parts.push(`moved the video to ${WP.fmt(seeks[seeks.length - 1].vt)}`);
      const draws = es.filter((e) => e.kind === 'draw').length;
      if (draws) parts.push(`drew ${draws} time${draws > 1 ? 's' : ''}`);
      const emoji = es.filter((e) => e.kind === 'emoji');
      if (emoji.length) parts.push(`added ${emoji.map((e) => e.info).join(' ')}`);
      const src = es.filter((e) => e.kind === 'source');
      if (src.length) parts.push(`changed the movie to ${src[src.length - 1].info}`);
      const snaps = es.filter((e) => e.kind === 'snap').length;
      if (snaps) parts.push(`took ${snaps} snap${snaps > 1 ? 's' : ''}`);
      const shares = es.filter((e) => e.kind === 'share').length;
      if (shares) parts.push(`shared ${shares} item${shares > 1 ? 's' : ''} to the gallery`);
      const nav = es.filter((e) => e.kind === 'nav').length;
      if (nav) parts.push(`opened ${nav} web page${nav > 1 ? 's' : ''}`);
      if (parts.length) lines.push(`${who} ${parts.join(', ')}.`);
    }
    if (!lines.length) return;
    const d = document.createElement('div');
    d.className = 'digest';
    const h = document.createElement('b');
    h.textContent = 'While you were away';
    d.append(h);
    for (const l of lines) { const p = document.createElement('div'); p.textContent = l; d.append(p); }
    addLine(d, null);
    WP.digestLines = lines;
  }

  // ---------- recent rooms ----------
  const ago = (ts) => {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    if (m < 1440) return Math.round(m / 60) + ' h ago';
    return Math.round(m / 1440) + ' d ago';
  };
  function renderRecent() {
    const list = WP.rooms.list();
    $('recentBox').classList.toggle('hidden', !list.length);
    const ul = $('recent');
    ul.innerHTML = '';
    for (const r of list.slice(0, 8)) {
      const li = document.createElement('li');
      const meta = document.createElement('div');
      meta.className = 'meta';
      const b = document.createElement('b'); b.textContent = r.code;
      const sm = document.createElement('small');
      const movie = r.movie && r.movie.src ? (r.movie.src.name || r.movie.src.url) + ' at ' + WP.fmt(r.movie.time) : 'no movie yet';
      sm.textContent = `${ago(r.lastSeen || 0)} · ${movie}`;
      meta.append(b, sm);
      const rejoin = document.createElement('button');
      rejoin.textContent = 'Rejoin';
      rejoin.dataset.act = 'rejoin';
      rejoin.onclick = () => { $('room').value = r.code; if (r.name) $('name').value = r.name; $('joinBtn').click(); };
      const del = document.createElement('button');
      del.textContent = '×'; del.title = 'Forget this room'; del.dataset.act = 'forget';
      del.onclick = () => { WP.rooms.forget(r.key); renderRecent(); };
      li.append(meta, rejoin, del);
      ul.appendChild(li);
    }
  }
  renderRecent();

  // ---------- joining ----------
  $('room').value = new URLSearchParams(location.search).get('room') || '';
  $('name').value = (() => { try { return localStorage.getItem('wp-name') || ''; } catch { return ''; } })();

  $('joinBtn').onclick = async () => {
    const name = $('name').value.trim();
    const room = $('room').value.trim();
    $('joinErr').textContent = '';
    if (!name || !room) { $('joinErr').textContent = 'Enter your name and a room code.'; return; }
    try { localStorage.setItem('wp-name', name); } catch {}
    WP.me.name = name;
    WP.roomCode = room;
    $('joinBtn').disabled = true;
    await WP.getMedia();
    try { await WP.connect(room); }
    catch (e) {
      $('joinErr').textContent = 'Could not reach the connection service. Check your internet.';
      $('joinBtn').disabled = false;
      if (WP.localStream) { WP.localStream.getTracks().forEach((t) => t.stop()); WP.localStream = null; }
      return;
    }
    WP.rooms.open(room, name);
    showRoom();
    WP.hello();
  };

  function showRoom() {
    $('join').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('roomLabel').textContent = WP.roomCode;
    // earlier conversation of this room
    const old = WP.rec.chat.slice();
    if (old.length) {
      const frag = document.createDocumentFragment();
      for (const c of old) {
        const d = document.createElement('div');
        if (c.k === 's') { d.className = 'sys'; d.textContent = c.text; }
        else { const b = document.createElement('b'); b.textContent = c.who + ': '; d.append(b, document.createTextNode(c.text)); }
        frag.appendChild(d);
      }
      const dv = document.createElement('div');
      dv.className = 'divider';
      dv.textContent = 'Earlier in this room';
      frag.appendChild(dv);
      log.prepend(frag);
      log.scrollTop = log.scrollHeight;
    }
    WP.addMyTile();
    WP.restoreMovie();
    WP.restoreView();
  }

  $('leaveBtn').onclick = () => {
    WP.stopNet();
    WP.emit('persist');
    WP.saveNow();
    location.reload();
  };

  // ---------- help ----------
  const toggleHelp = (show) => $('help').classList.toggle('hidden', !show);
  $('helpBtn').onclick = () => toggleHelp(true);
  $('helpBtn2').onclick = () => toggleHelp(true);
  $('helpClose').onclick = () => toggleHelp(false);
  $('help').onclick = (e) => { if (e.target === $('help')) toggleHelp(false); };

  // ---------- app version and updates ----------
  if (WP.env && WP.env.version) $('verLabel').textContent = 'Version ' + WP.env.version;
  if (WP.env && WP.env.onUpdate) {
    const ver = () => (WP.env && WP.env.version ? 'Version ' + WP.env.version : '');
    WP.env.onUpdate((u) => {
      const bar = $('updateBar');
      let note = '';
      if (u.state === 'downloading') { bar.classList.remove('hidden'); $('updateTxt').textContent = `Downloading update ${u.version || ''} ${u.percent ? Math.round(u.percent) + '%' : ''}`; $('updateBtn').classList.add('hidden'); note = ' · downloading update'; }
      else if (u.state === 'ready') { bar.classList.remove('hidden'); $('updateTxt').textContent = `Update ${u.version || ''} is ready.`; $('updateBtn').classList.remove('hidden'); note = ' · update ' + (u.version || '') + ' ready, restart the app'; }
      else if (u.state === 'error') { bar.classList.remove('hidden'); $('updateTxt').textContent = 'Update check failed: ' + (u.message || 'unknown error'); $('updateBtn').classList.add('hidden'); note = ' · update check failed'; setTimeout(() => { if (/check failed/.test($('updateTxt').textContent)) bar.classList.add('hidden'); }, 20000); }
      else if (u.state === 'none') { bar.classList.add('hidden'); note = ' · up to date'; }
      $('verLabel').textContent = ver() + note;
    });
    if ($('updCheck')) $('updCheck').classList.remove('hidden');
    if ($('updCheck')) $('updCheck').onclick = () => { $('verLabel').textContent = ver() + ' · checking...'; WP.env.checkUpdate(); };
    $('updateBtn').onclick = () => WP.env.installUpdate();
  }
})();
