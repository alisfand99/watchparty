// Synced media player: custom controls, shared play/pause/seek/speed, subtitles, fullscreen, saved position.
(() => {
  const { $ } = WP;
  const video = $('video');
  const screen = $('screen');
  const state = { src: null, playing: false, time: 0, rate: 1, updatedAt: Date.now(), ver: 0 };
  let currentSrc = null;
  let localFileName = null; // name of the file this user loaded from disk
  let applyingRemote = false; // blocks echo while a remote event is applied
  let forceUntil = 0;
  let pendingState = null;
  let triedPath = false;
  WP.state = state;
  WP.video = video;

  const curTime = () => (state.playing ? state.time + ((Date.now() - state.updatedAt) / 1000) * state.rate : state.time);
  const snapshot = () => ({ src: state.src, playing: state.playing, time: curTime(), rate: state.rate, ver: state.ver });
  WP.vtime = () => (video.currentTime || 0);
  WP.pauseQuiet = () => { applyingRemote = true; video.pause(); setTimeout(() => (applyingRemote = false), 300); };

  const status = (t) => { $('status').textContent = t || ''; };
  WP.setStatus = status;

  // ---------- opening a file again from its last location (installed app only) ----------
  function fileUrl(p) {
    p = String(p).replace(/\\/g, '/');
    const m = /^([A-Za-z]:)(\/.*)?$/.exec(p);
    const head = m ? m[1] : '';
    const rest = (m ? m[2] || '' : p).split('/').map((s, i) => (i === 0 && !s ? s : encodeURIComponent(s))).join('/');
    return 'file://' + (m ? '/' + head : '') + rest;
  }
  function tryPath(src) {
    const p = WP.rec && WP.rec.paths && WP.rec.paths[src.name];
    if (!p || triedPath === src.name) return false;
    triedPath = src.name;
    video.src = fileUrl(p);
    localFileName = src.name;
    return true;
  }
  video.addEventListener('error', () => {
    if (currentSrc && currentSrc.type === 'file' && localFileName === currentSrc.name && triedPath === currentSrc.name) {
      // the saved location no longer works: ask for the file again
      if (WP.rec) delete WP.rec.paths[currentSrc.name];
      localFileName = null;
      showPicker(currentSrc);
    }
  });

  function showPicker(src) {
    video.pause();
    status(`Select file: ${src.name}`);
    $('empty').querySelector('p').textContent = `Select file: ${src.name}`;
    $('empty').style.display = 'grid';
  }

  function setSource(src) {
    currentSrc = src;
    triedPath = false;
    $('empty').style.display = src ? 'none' : 'grid';
    if (!src) { video.removeAttribute('src'); video.load(); return; }
    clearSubs();
    if (src.type === 'url') {
      video.src = src.url;
      localFileName = null;
      status('');
    } else if (localFileName === src.name) {
      $('empty').style.display = 'none'; // this user already loaded the same file
      status(src.name);
    } else if (tryPath(src)) {
      $('empty').style.display = 'none';
      status(src.name);
    } else {
      showPicker(src); // local file: each person picks the same file
    }
  }

  function applyState(s) {
    state.src = s.src; state.playing = s.playing; state.time = s.time; state.updatedAt = Date.now();
    state.rate = s.rate || 1; state.ver = s.ver || state.ver;
    applyingRemote = true;
    if (s.src && (!currentSrc || JSON.stringify(currentSrc) !== JSON.stringify(s.src))) setSource(s.src);
    // Always follow the newest state at the moment the video is ready, never a stale copy.
    const go = () => {
      const cur = snapshot();
      applyingRemote = true;
      video.playbackRate = cur.rate;
      if (Math.abs(video.currentTime - cur.time) > 0.5) video.currentTime = cur.time;
      if (cur.playing) video.play().catch(() => status('Click the video to play.'));
      else video.pause();
      setTimeout(() => (applyingRemote = false), 300);
    };
    if (video.readyState >= 1) go();
    else {
      pendingState = s;
      video.addEventListener('loadedmetadata', () => { if (pendingState) { pendingState = null; go(); } }, { once: true });
      setTimeout(() => (applyingRemote = false), 300);
    }
    refreshUi();
  }

  function applyRemoteEvent(m) {
    applyingRemote = true;
    if (m.action === 'source') {
      state.src = m.src; state.playing = false; state.time = 0; state.updatedAt = Date.now();
      setSource(m.src);
      if (WP.setMode) WP.setMode('player', false);
      WP.say('Movie changed.', 'sys');
    } else {
      state.time = m.time; state.updatedAt = Date.now();
      if (m.action === 'play') state.playing = true;
      if (m.action === 'pause') state.playing = false;
      if (m.action === 'rate') { state.rate = m.rate || 1; video.playbackRate = state.rate; }
      if (Math.abs(video.currentTime - m.time) > 0.4) video.currentTime = m.time;
      if (m.action === 'play') video.play().catch(() => status('Click the video to play.'));
      if (m.action === 'pause') video.pause();
    }
    setTimeout(() => (applyingRemote = false), 300);
    refreshUi();
  }

  let lastSeekAct = 0;
  function localEvent(action, src) {
    const t = video.currentTime;
    if (action === 'source') { state.src = src; state.playing = false; state.time = 0; }
    else if (action === 'play') { state.playing = true; state.time = t; }
    else if (action === 'pause') { state.playing = false; state.time = t; }
    else if (action === 'seek') { state.time = t; }
    else if (action === 'rate') { state.rate = video.playbackRate; state.time = t; }
    state.updatedAt = Date.now();
    state.ver = Date.now();
    WP.broadcast({ t: 'sync', action, time: state.time, rate: state.rate, src: state.src, ver: state.ver });
    // history for people who are away
    if (action === 'source') WP.act('source', src.type === 'file' ? src.name : src.url);
    else if (action === 'seek') { if (Date.now() - lastSeekAct > 1500) WP.act('seek', '', t); lastSeekAct = Date.now(); }
    else if (action === 'play' || action === 'pause') WP.act(action, '', t);
    else if (action === 'rate') WP.act('rate', state.rate + 'x', t);
    persist();
  }

  video.addEventListener('play', () => { if (!applyingRemote) localEvent('play'); refreshUi(); });
  video.addEventListener('pause', () => { if (!applyingRemote) localEvent('pause'); refreshUi(); });
  video.addEventListener('seeked', () => { if (!applyingRemote) localEvent('seek'); });

  WP.onMsg('sync', (entry, m) => { state.ver = m.ver || Date.now(); if (m.rate) state.rate = m.rate; applyRemoteEvent(m); });
  WP.onMsg('req-state', (entry) => WP.sendTo(entry, { t: 'state', state: snapshot() }));
  WP.onMsg('state', (entry, m) => {
    if (m.state && (!state.src || m.state.ver > state.ver || Date.now() < forceUntil)) applyState(m.state);
  });

  // ---------- saved position (so the room can be continued later) ----------
  function persist() {
    if (!WP.rec || !state.src) return;
    WP.rec.movie = { src: state.src, time: video.currentTime || curTime(), ver: state.ver, rate: state.rate };
    WP.save();
  }
  WP.on('persist', persist);
  WP.restoreMovie = () => {
    const m = WP.rec && WP.rec.movie;
    if (!m || !m.src) return;
    applyState({ src: m.src, playing: false, time: m.time || 0, rate: m.rate || 1, ver: m.ver || 0 });
    status(m.src.type === 'file' ? m.src.name : '');
  };

  // ---------- choosing media ----------
  $('file').onchange = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const sameAsRoom = state.src && state.src.type === 'file' && state.src.name === f.name;
    applyingRemote = true;
    video.src = URL.createObjectURL(f);
    triedPath = f.name; // we already hold the real file
    localFileName = f.name;
    currentSrc = { type: 'file', name: f.name };
    try { const p = WP.env && WP.env.pathFor && WP.env.pathFor(f); if (p && WP.rec) WP.rec.paths[f.name] = p; } catch {}
    $('empty').style.display = 'none';
    status(f.name);
    clearSubs();
    if (WP.setMode) WP.setMode('player');
    if (sameAsRoom) applyState(snapshot()); // join the movie the room is already watching
    else { setTimeout(() => (applyingRemote = false), 300); localEvent('source', currentSrc); }
    WP.save();
  };
  $('urlBtn').onclick = () => {
    const url = $('url').value.trim();
    if (!/^https?:\/\//i.test(url)) { status('Invalid link.'); return; }
    if (WP.setMode) WP.setMode('player');
    $('openMenu').classList.add('hidden');
    setSource({ type: 'url', url });
    localEvent('source', currentSrc);
  };
  $('resync').onclick = () => { $('openMenu').classList.add('hidden'); forceUntil = Date.now() + 2500; WP.broadcast({ t: 'req-state' }); };

  // movie menu ("More") and the empty-state buttons
  const openMenu = $('openMenu');
  $('openBtn').onclick = (e) => { e.stopPropagation(); openMenu.classList.toggle('hidden'); };
  $('pickFile').onclick = () => $('file').click();
  $('pickLink').onclick = (e) => { e.stopPropagation(); openMenu.classList.remove('hidden'); $('url').focus(); };
  $('openFile').onclick = () => { openMenu.classList.add('hidden'); $('file').click(); };
  $('openSub').onclick = () => { openMenu.classList.add('hidden'); $('subFile').click(); };
  $('url').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('urlBtn').click(); e.stopPropagation(); });
  document.addEventListener('click', (e) => { if (!e.target.closest('#openMenu')) openMenu.classList.add('hidden'); });

  // ---------- subtitles (local only) ----------
  let subUrl = null;
  function clearSubs() {
    video.querySelectorAll('track').forEach((t) => t.remove());
    if (subUrl) { URL.revokeObjectURL(subUrl); subUrl = null; }
    $('subBtn').classList.remove('on');
  }
  function srtToVtt(text) {
    return 'WEBVTT\n\n' + text.replace(/\r/g, '').replace(/^﻿/, '').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  }
  $('subFile').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let text = await f.text();
    if (!/^﻿?WEBVTT/.test(text)) text = srtToVtt(text);
    clearSubs();
    subUrl = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
    const tr = document.createElement('track');
    tr.kind = 'subtitles'; tr.label = f.name; tr.default = true; tr.src = subUrl;
    video.appendChild(tr);
    tr.addEventListener('load', () => { tr.track.mode = 'showing'; });
    tr.track.mode = 'showing';
    $('subBtn').classList.add('on');
    status('Subtitles: ' + f.name);
  };
  $('subBtn').onclick = () => {
    const tr = video.textTracks[0];
    if (!tr) { $('subFile').click(); return; }
    tr.mode = tr.mode === 'showing' ? 'hidden' : 'showing';
    $('subBtn').classList.toggle('on', tr.mode === 'showing');
  };

  // ---------- controls ----------
  const playBtn = $('playBtn'), seek = $('seek'), vol = $('vol');
  let scrubbing = false;
  const icon = (n) => (WP.icon ? WP.icon(n) : '');
  function refreshUi() {
    playBtn.innerHTML = icon(video.paused ? 'play' : 'pause');
    $('speedBtn').textContent = (video.playbackRate || 1) + 'x';
    $('muteBtn').innerHTML = icon(video.muted || video.volume === 0 ? 'mute' : 'volume');
    screen.classList.toggle('paused', video.paused);
  }
  function tick() {
    const d = video.duration;
    if (!scrubbing) {
      const p = d ? (video.currentTime / d) * 1000 : 0;
      seek.value = p;
      seek.style.setProperty('--p', p / 10 + '%');
    }
    $('timeLbl').textContent = `${WP.fmt(video.currentTime)} / ${WP.fmt(d || 0)}`;
  }
  video.addEventListener('timeupdate', tick);
  video.addEventListener('loadedmetadata', () => { tick(); refreshUi(); });
  video.addEventListener('durationchange', tick);
  video.addEventListener('ratechange', refreshUi);
  video.addEventListener('volumechange', () => { refreshUi(); vol.value = video.muted ? 0 : video.volume; vol.style.setProperty('--p', vol.value * 100 + '%'); });

  const toggle = () => { if (!video.src && !video.currentSrc) return; if (video.paused) video.play().catch(() => {}); else video.pause(); };
  const skip = (d) => { if (!video.duration) return; video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + d)); };
  playBtn.onclick = toggle;
  $('backBtn').onclick = () => skip(-10);
  $('fwdBtn').onclick = () => skip(10);
  seek.addEventListener('input', () => { scrubbing = true; seek.style.setProperty('--p', seek.value / 10 + '%'); if (video.duration) $('timeLbl').textContent = `${WP.fmt((seek.value / 1000) * video.duration)} / ${WP.fmt(video.duration)}`; });
  seek.addEventListener('change', () => { scrubbing = false; if (video.duration) video.currentTime = (seek.value / 1000) * video.duration; });
  vol.addEventListener('input', () => { video.volume = +vol.value; video.muted = +vol.value === 0; });
  $('muteBtn').onclick = () => { video.muted = !video.muted; };
  const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
  function setRate(r) { video.playbackRate = r; localEvent('rate'); }
  $('speedBtn').onclick = () => { const i = RATES.indexOf(video.playbackRate); setRate(RATES[(i + 1) % RATES.length]); };
  // Fullscreen is our own: the screen fills the window (and the window fills the display), so the cameras,
  // drawings and controls stay on top of the movie and of the shared browser.
  WP.fsOn = false;
  function setFs(on, fromSystem) {
    on = !!on;
    if (on === WP.fsOn) return;
    WP.fsOn = on;
    screen.classList.toggle('fs', on);
    document.body.classList.toggle('fs', on);
    $('fsBtn').classList.toggle('on', on);
    if (!fromSystem) {
      if (WP.env && WP.env.setFullscreen) WP.env.setFullscreen(on);
      else if (on) { const r = document.documentElement.requestFullscreen; if (r) r.call(document.documentElement).catch(() => {}); }
      else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
    WP.emit('fullscreen', on);
  }
  const fs = () => setFs(!WP.fsOn);
  WP.setFs = setFs;
  $('fsBtn').onclick = fs;
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && WP.fsOn && !(WP.env && WP.env.setFullscreen)) setFs(false, true); });
  if (WP.env && WP.env.onFullscreen) WP.env.onFullscreen((on) => setFs(on, true));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && WP.fsOn && !document.querySelector('.modal:not(.hidden)')) setFs(false); });

  // click on the picture plays or pauses, double click goes fullscreen
  let clickT = 0;
  screen.addEventListener('click', (e) => {
    if (e.target !== video || screen.dataset.mode === 'browser') return;
    clearTimeout(clickT);
    clickT = setTimeout(toggle, 220);
  });
  screen.addEventListener('dblclick', (e) => { if (e.target !== video) return; clearTimeout(clickT); fs(); });

  // after a mouse click a button gives focus back, so Space and the arrows keep controlling the film
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b && e.detail > 0) b.blur(); });

  // controls hide when the mouse rests
  let idleT = 0;
  function wake() {
    screen.classList.remove('idle');
    clearTimeout(idleT);
    idleT = setTimeout(() => { if (!video.paused && !screen.matches(':has(.controls:hover, .drawbar:hover, .rail:hover, .popover:not(.hidden))')) screen.classList.add('idle'); }, 2800);
  }
  screen.addEventListener('mousemove', wake);
  screen.addEventListener('pointerdown', wake);
  video.addEventListener('pause', wake);
  video.addEventListener('play', wake);

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && t.type !== 'range') || (t && t.isContentEditable)) return;
    if (document.querySelector('.modal:not(.hidden)') || $('app').classList.contains('hidden')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (t && t.tagName === 'BUTTON' && (k === ' ' || k === 'Enter')) return; // let the focused button handle it
    let used = true;
    const inPlayer = screen.dataset.mode === 'player';
    if (k === 'f' || k === 'F') fs();
    else if (!inPlayer) used = false;
    else if (k === ' ' || k === 'k' || k === 'K') toggle();
    else if (k === 'j' || k === 'J') skip(-10);
    else if (k === 'l' || k === 'L') skip(10);
    else if (k === 'ArrowLeft') skip(-5);
    else if (k === 'ArrowRight') skip(5);
    else if (k === 'ArrowUp') { video.muted = false; video.volume = Math.min(1, video.volume + 0.1); }
    else if (k === 'ArrowDown') video.volume = Math.max(0, video.volume - 0.1);
    else if (k === 'm' || k === 'M') video.muted = !video.muted;
    else if (k === '>' || k === '.') { const i = RATES.indexOf(video.playbackRate); if (i < RATES.length - 1) setRate(RATES[i + 1]); }
    else if (k === '<' || k === ',') { const i = RATES.indexOf(video.playbackRate); if (i > 0) setRate(RATES[i - 1]); }
    else used = false;
    if (used) { e.preventDefault(); wake(); }
  });
  window.WP.player = { toggle, skip, setRate, fs };
  refreshUi();
  WP.on('icons-ready', refreshUi);
})();
