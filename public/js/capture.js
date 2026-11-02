// Moments: snap the screen (movie or shared browser, cameras, drawings), reaction snap with a shared countdown, clip recorder.
(() => {
  const { $ } = WP;
  const screen = $('screen'), video = $('video'), draw = $('draw');
  const MAXW = 1600;
  let browserImg = null;

  const movieName = () => {
    const m = WP.rec && WP.rec.movie;
    if (!m || !m.src) return '';
    return typeof m.src === 'string' ? m.src : (m.src.name || m.src.url || '');
  };

  // Latest picture of the shared browser page (only the installed app can take it).
  async function grabBrowser() {
    const wv = WP.browser && WP.browser.el;
    if (!(wv && wv.capturePage)) return null;
    try {
      const ni = await wv.capturePage();
      const img = new Image();
      img.src = ni.toDataURL();
      await img.decode();
      return img;
    } catch { return null; }
  }

  function drawCover(ctx, v, x, y, w, h, radius) {
    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius); else ctx.rect(x, y, w, h);
    ctx.clip();
    const vw = v.videoWidth, vh = v.videoHeight;
    if (vw && vh) {
      const s = Math.max(w / vw, h / vh), sw = w / s, sh = h / s;
      ctx.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, w, h);
    } else { ctx.fillStyle = '#15171d'; ctx.fillRect(x, y, w, h); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius); else ctx.rect(x, y, w, h);
    ctx.stroke();
  }
  function label(ctx, text, x, y, k) {
    ctx.font = `600 ${Math.max(11, 13 * k)}px system-ui, sans-serif`;
    const tw = Math.min(ctx.measureText(text).width, 200 * k) + 14 * k;
    ctx.fillStyle = 'rgba(0,0,0,.65)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, tw, 20 * k, 6 * k); else ctx.rect(x, y, tw, 20 * k);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 7 * k, y + 10.5 * k, 200 * k);
  }
  const tileEls = () => [...document.querySelectorAll('#tileLayer .tile:not(.off):not(.invite)')];
  const nameOf = (el) => (el.querySelector('.label') || {}).textContent || '';

  function paint(ctx, W, H, r, k, o) {
    ctx.fillStyle = screen.dataset.mode === 'lobby' ? '#141824' : '#000';
    ctx.fillRect(0, 0, W, H);
    if (o.only) {
      const els = tileEls().concat([...document.querySelectorAll('#tileLayer .tile.off:not(.invite)')]);
      const n = Math.max(1, els.length), cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
      const g = 10 * k, cw = (W - g * (cols + 1)) / cols, ch = (H - g * (rows + 1)) / rows;
      els.forEach((el, i) => {
        const x = g + (i % cols) * (cw + g), y = g + Math.floor(i / cols) * (ch + g);
        drawCover(ctx, el.querySelector('video'), x, y, cw, ch, 12 * k);
        label(ctx, nameOf(el), x + 8 * k, y + ch - 28 * k, k);
      });
      return;
    }
    if (screen.dataset.mode === 'browser') {
      const hb = $('bHost').getBoundingClientRect();
      const x = (hb.left - r.left) * k, y = (hb.top - r.top) * k;
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, y, hb.width * k, hb.height * k);
      if (o.base) ctx.drawImage(o.base, x, y, hb.width * k, hb.height * k);
    } else if (video.videoWidth && screen.dataset.mode !== 'lobby') {
      const s = Math.min(W / video.videoWidth, H / video.videoHeight), w = video.videoWidth * s, h = video.videoHeight * s;
      ctx.drawImage(video, (W - w) / 2, (H - h) / 2, w, h);
    }
    if (draw.width && screen.dataset.mode !== 'lobby') ctx.drawImage(draw, 0, 0, W, H);
    if (o.faces && !$('tileLayer').classList.contains('hidden')) {
      for (const el of tileEls()) {
        const b = el.getBoundingClientRect();
        const x = (b.left - r.left) * k, y = (b.top - r.top) * k, w = b.width * k, h = b.height * k;
        drawCover(ctx, el.querySelector('video'), x, y, w, h, 10 * k);
        label(ctx, nameOf(el), x + 6 * k, y + h - 26 * k, k);
      }
    }
  }
  function dims(maxW) {
    const r = screen.getBoundingClientRect();
    const k = Math.min(1, (maxW || MAXW) / r.width);
    return { r, k, W: Math.max(2, Math.round(r.width * k)), H: Math.max(2, Math.round(r.height * k)) };
  }
  function compose(o = {}) {
    const { r, k, W, H } = dims();
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    paint(cv.getContext('2d'), W, H, r, k, { faces: o.faces !== false, only: !!o.only, base: o.base !== undefined ? o.base : browserImg });
    return cv;
  }

  function flash() {
    const f = document.createElement('div');
    f.className = 'snapflash';
    screen.appendChild(f);
    setTimeout(() => f.remove(), 500);
  }
  const blobOf = (cv, type = 'image/jpeg', q = 0.9) => new Promise((res) => cv.toBlob(res, type, q));

  async function snap(o = {}) {
    if (!WP.rec) return null;
    if (screen.dataset.mode === 'browser' && !o.only) browserImg = await grabBrowser();
    const cv = compose(o);
    flash();
    const blob = await blobOf(cv);
    const item = await WP.gallery.add({ kind: 'image', blob, mt: video.currentTime || 0, movie: movieName(), by: WP.me.name, note: o.note || '' });
    WP.act('snap', o.note === 'reaction' ? 'reaction snap' : 'snap', video.currentTime || null);
    WP.toast('Saved to the room gallery');
    return item;
  }

  // ---------- countdown shared by everyone ----------
  let cdBusy = false;
  function countdown(text) {
    if (cdBusy) return Promise.resolve(false);
    cdBusy = true;
    return new Promise((res) => {
      const el = document.createElement('div');
      el.className = 'countdown';
      screen.appendChild(el);
      let n = 3;
      const step = () => {
        if (n === 0) { el.remove(); cdBusy = false; res(true); return; }
        el.innerHTML = `<small>${text}</small><b>${n}</b>`;
        n--;
        setTimeout(step, 1000);
      };
      step();
    });
  }
  async function reactionSnap() {
    if (cdBusy) return;
    WP.broadcast({ t: 'snapcd' });
    await countdown('Make a face!');
    const item = await snap({ note: 'reaction' });
    if (item) WP.gallery.share(item, true);
  }
  WP.onMsg('snapcd', (entry) => { countdown(entry.name + ' is taking a reaction snap. Make a face!'); });

  // ---------- clip recorder ----------
  let rec = null;
  async function startRec() {
    if (rec || !WP.rec || typeof MediaRecorder === 'undefined') return;
    const { r, k, W, H } = dims(1280);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const out = cv.captureStream(24);

    let ac = null;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const dest = ac.createMediaStreamDestination();
      const add = (stream) => {
        if (!stream) return;
        const a = stream.getAudioTracks();
        if (a.length) try { ac.createMediaStreamSource(new MediaStream([a[0]])).connect(dest); } catch {}
      };
      add(video.captureStream ? video.captureStream() : null);
      add(WP.localStream);
      document.querySelectorAll('#tileLayer .tile:not([data-id="me"]) video').forEach((v) => add(v.srcObject));
      dest.stream.getAudioTracks().forEach((t) => out.addTrack(t));
    } catch {}

    const opts = {};
    for (const m of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) if (MediaRecorder.isTypeSupported(m)) { opts.mimeType = m; break; }
    opts.videoBitsPerSecond = 2500000;
    const mr = new MediaRecorder(out, opts);
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const t0 = Date.now();
    const mt = video.currentTime || 0;
    let thumb = null, grabbing = false;
    const tick = () => {
      const d = dims(1280);
      if (screen.dataset.mode === 'browser' && !grabbing) { grabbing = true; grabBrowser().then((i) => { if (i) browserImg = i; grabbing = false; }); }
      paint(ctx, W, H, d.r, W / d.r.width, { faces: true, base: browserImg });
      if (!thumb && Date.now() - t0 > 400) thumb = cv.toDataURL('image/jpeg', 0.6);
      const s = Math.round((Date.now() - t0) / 1000);
      $('recTime').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      if (s >= 60) stopRec();
    };
    rec = { mr, chunks, ac, timer: setInterval(tick, 1000 / 24), t0, mt, getThumb: () => thumb || cv.toDataURL('image/jpeg', 0.6), cv };
    tick();
    mr.start(1000);
    $('recBtn').classList.add('on');
    $('snapBtn').classList.add('rec');
    $('recTime').classList.remove('hidden');
    WP.act('rec', 'started recording', mt);
    WP.broadcast({ t: 'recnote', on: true });
  }
  function stopRec() {
    if (!rec) return Promise.resolve(null);
    const cur = rec;
    rec = null;
    clearInterval(cur.timer);
    $('recBtn').classList.remove('on');
    $('snapBtn').classList.remove('rec');
    $('recTime').classList.add('hidden');
    WP.broadcast({ t: 'recnote', on: false });
    return new Promise((res) => {
      cur.mr.onstop = async () => {
        try { if (cur.ac) cur.ac.close(); } catch {}
        const blob = new Blob(cur.chunks, { type: 'video/webm' });
        const item = await WP.gallery.add({ kind: 'clip', blob, thumb: cur.getThumb(), mt: cur.mt, dur: Math.round((Date.now() - cur.t0) / 1000), movie: movieName(), by: WP.me.name });
        WP.toast('Clip saved to the room gallery');
        res(item);
      };
      try { cur.mr.stop(); } catch { cur.mr.onstop(); }
    });
  }
  WP.onMsg('recnote', (entry, m) => { WP.toast(entry.name + (m.on ? ' started recording a clip' : ' stopped recording')); });

  // ---------- buttons ----------
  const menu = $('snapMenu');
  $('snapBtn').onclick = (e) => { e.stopPropagation(); menu.classList.toggle('hidden'); };
  document.addEventListener('click', (e) => { if (!e.target.closest('#snapMenu')) menu.classList.add('hidden'); });
  menu.querySelectorAll('[data-snap]').forEach((b) => {
    b.onclick = () => {
      menu.classList.add('hidden');
      const w = b.dataset.snap;
      if (w === 'now') snap();
      else if (w === 'react') reactionSnap();
      else if (w === 'movie') snap({ faces: false });
      else if (w === 'faces') snap({ only: true });
    };
  });
  $('recBtn').onclick = () => { if (rec) stopRec(); else startRec(); };
  $('recTime').onclick = () => stopRec();
  menu.addEventListener('click', (e) => { if (e.target.closest('button')) menu.classList.add('hidden'); });
  WP.on('leave', () => { if (rec) stopRec(); });

  WP.capture = { compose, snap, reactionSnap, startRec, stopRec, get recording() { return !!rec; } };
})();
