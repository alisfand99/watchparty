// Camera tiles floating over the screen: drag, resize, click to enlarge, ready made layouts.
(() => {
  const { $ } = WP;
  const layer = $('tileLayer');
  const AR = 0.75; // tile height / width
  const geo = new Map(); // id -> { x, y, w } as fractions of the screen
  const els = new Map(); // id -> element
  let order = [];
  let layout = { preset: 'right', pos: {}, hidden: false };
  let spotId = null, spotPrev = null;

  const key = (id) => (id === 'me' ? 'me' : 'n:' + (WP.peers.get(id) ? WP.peers.get(id).name : '').toLowerCase());
  const size = () => ({ W: layer.clientWidth || 1, H: layer.clientHeight || 1 });
  const hFrac = (w) => { const { W, H } = size(); return w * AR * (W / H); }; // tile height as a fraction of the screen height
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const bottomPad = () => 96 / size().H; // keep clear of the control bar
  const top = () => (document.getElementById('screen').dataset.mode === 'browser' ? 56 : 12) / size().H; // keep clear of the browser bar

  function fit(g) {
    const w = clamp(g.w, 0.07, 0.7);
    const h = hFrac(w);
    return { w, x: clamp(g.x, 0, 1 - w), y: clamp(g.y, 0, Math.max(0, 1 - h)) };
  }

  // ----- presets: return positions for n tiles -----
  const PRESETS = {
    right(n) {
      const avail = 0.98 - bottomPad() - top();
      const { W, H } = size();
      const ww = Math.min(0.2, (avail - 0.01 * n) / (n * AR * (W / H)));
      const h = hFrac(ww);
      return Array.from({ length: n }, (_, i) => ({ x: 1 - ww - 0.01, y: top() + i * (h + 0.01), w: ww }));
    },
    left(n) { return PRESETS.right(n).map((g) => ({ ...g, x: 0.01 })); },
    top(n) {
      const w = Math.min(0.18, 0.96 / n - 0.01);
      const total = n * (w + 0.01);
      return Array.from({ length: n }, (_, i) => ({ x: (1 - total) / 2 + i * (w + 0.01), y: top(), w }));
    },
    bottom(n) {
      const w = Math.min(0.18, 0.96 / n - 0.01);
      const total = n * (w + 0.01);
      const y = 1 - hFrac(w) - bottomPad() - 0.01;
      return Array.from({ length: n }, (_, i) => ({ x: (1 - total) / 2 + i * (w + 0.01), y, w }));
    },
    corners(n) {
      const w = 0.17;
      const h = hFrac(w);
      const spots = [[0.01, top()], [0.99 - w, top()], [0.01, 1 - h - bottomPad()], [0.99 - w, 1 - h - bottomPad()]];
      return Array.from({ length: n }, (_, i) => {
        const [x, y] = spots[i % 4];
        const layerIdx = Math.floor(i / 4);
        return { x: x + (x < 0.5 ? 1 : -1) * layerIdx * (w + 0.01), y, w };
      });
    },
    grid(n) {
      const { W, H } = size();
      const cols = Math.ceil(Math.sqrt(n * (H / W) * (1 / AR)));
      const c = Math.max(1, Math.min(n, cols));
      const rows = Math.ceil(n / c);
      const availH = 1 - bottomPad() - top() - 0.02;
      const w = Math.min(0.96 / c - 0.01, (availH / rows - 0.01) / (AR * (W / H)));
      const totalW = c * (w + 0.01);
      const h = hFrac(w);
      const totalH = rows * (h + 0.01);
      return Array.from({ length: n }, (_, i) => ({
        x: (1 - totalW) / 2 + (i % c) * (w + 0.01),
        y: top() + (availH - totalH) / 2 + Math.floor(i / c) * (h + 0.01),
        w,
      }));
    },
  };

  function paint(id) {
    const el = els.get(id), g = geo.get(id);
    if (!el || !g) return;
    const f = fit(g);
    geo.set(id, f);
    el.style.left = f.x * 100 + '%';
    el.style.top = f.y * 100 + '%';
    el.style.width = f.w * 100 + '%';
  }
  function paintAll() { for (const id of els.keys()) paint(id); }

  function relayout() {
    layer.classList.toggle('hidden', !!layout.hidden);
    if (layout.preset === 'custom') {
      for (const id of order) if (id !== spotId && !geo.has(id)) geo.set(id, newSlot(id));
    } else {
      const slots = PRESETS[layout.preset](Math.max(1, order.length));
      order.forEach((id, i) => { if (id === spotId) { spotPrev = slots[i]; } else geo.set(id, slots[i]); });
    }
    paintAll();
    save();
  }
  function newSlot(id) {
    const saved = layout.pos[key(id)];
    if (saved) return saved;
    // free place: next position of the right column
    const slots = PRESETS.right(Math.max(order.length, 1));
    return slots[Math.max(0, order.indexOf(id))] || slots[0];
  }
  function save() {
    if (!WP.rec) return;
    if (layout.preset === 'custom') {
      layout.pos = {};
      for (const [id, g] of geo) if (id !== spotId) layout.pos[key(id)] = { x: +g.x.toFixed(4), y: +g.y.toFixed(4), w: +g.w.toFixed(4) };
      if (spotId && spotPrev) layout.pos[key(spotId)] = spotPrev;
    }
    WP.rec.layout = layout;
    WP.save();
  }
  function toCustom() {
    if (layout.preset === 'custom') return;
    layout.preset = 'custom';
    markMenu();
  }

  // ----- spotlight (click to enlarge) -----
  function unspot() {
    if (!spotId) return;
    const id = spotId;
    const el = els.get(id);
    if (el) el.classList.remove('spot');
    if (spotPrev) geo.set(id, spotPrev);
    spotId = null; spotPrev = null;
    if (layout.preset !== 'custom') relayout(); else { paint(id); save(); }
  }
  function spot(id) {
    if (spotId === id) return unspot();
    unspot();
    const g = geo.get(id);
    if (!g) return;
    spotId = id;
    spotPrev = { ...g };
    const { W, H } = size();
    const w = Math.min(0.62, (1 - bottomPad() - 0.04) / (AR * (W / H)));
    const h = hFrac(w);
    geo.set(id, { w, x: (1 - w) / 2, y: Math.max(top(), (1 - bottomPad() - h) / 2) });
    els.get(id).classList.add('spot');
    paint(id);
  }

  // ----- tiles -----
  function addTile(id, name, stream, muted) {
    if (els.has(id)) return els.get(id);
    const el = document.createElement('div');
    el.className = 'tile';
    el.dataset.id = id;
    const v = document.createElement('video');
    v.autoplay = true; v.playsInline = true; v.muted = muted;
    if (stream) v.srcObject = stream;
    WP.emit('tile-video', v);
    const l = document.createElement('div');
    l.className = 'label';
    l.textContent = name;
    const grip = document.createElement('div');
    grip.className = 'grip';
    el.append(v, l, grip);
    layer.appendChild(el);
    els.set(id, el);
    order.push(id);
    wire(el, id, grip);
    if (layout.preset === 'custom') geo.set(id, newSlot(id));
    relayout();
    return el;
  }
  function removeTile(id) {
    if (spotId === id) { spotId = null; spotPrev = null; }
    const el = els.get(id);
    if (el) el.remove();
    els.delete(id); geo.delete(id);
    order = order.filter((x) => x !== id);
    relayout();
  }

  function wire(el, id, grip) {
    let mode = null, sx = 0, sy = 0, start = null, moved = false;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      mode = e.target === grip ? 'resize' : 'drag';
      sx = e.clientX; sy = e.clientY; moved = false;
      start = { ...geo.get(id) };
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (!mode) return;
      const { W, H } = size();
      const dx = (e.clientX - sx) / W, dy = (e.clientY - sy) / H;
      if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < 5) return;
      if (!moved) { moved = true; el.classList.add('dragging'); toCustom(); if (spotId === id) { el.classList.remove('spot'); spotId = null; spotPrev = null; } }
      if (mode === 'drag') geo.set(id, { ...start, x: start.x + dx, y: start.y + dy });
      else geo.set(id, { ...start, w: start.w + dx });
      paint(id);
    });
    const end = () => {
      if (!mode) return;
      const wasMove = moved, m = mode;
      mode = null;
      el.classList.remove('dragging');
      if (wasMove) save();
      else if (m === 'drag') spot(id);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // ----- layout menu -----
  function markMenu() {
    document.querySelectorAll('#layoutMenu [data-preset]').forEach((b) => b.classList.toggle('active', b.dataset.preset === layout.preset));
    $('hideCams').textContent = layout.hidden ? 'Show cameras' : 'Hide cameras';
  }
  document.querySelectorAll('#layoutMenu [data-preset]').forEach((b) => {
    b.onclick = () => { unspot(); layout.preset = b.dataset.preset; layout.hidden = false; markMenu(); relayout(); $('layoutMenu').classList.add('hidden'); };
  });
  $('hideCams').onclick = () => { layout.hidden = !layout.hidden; markMenu(); relayout(); $('layoutMenu').classList.add('hidden'); };
  $('layoutBtn').onclick = (e) => { e.stopPropagation(); $('layoutMenu').classList.toggle('hidden'); };
  document.addEventListener('click', (e) => { if (!e.target.closest('#layoutMenu')) $('layoutMenu').classList.add('hidden'); });

  WP.on('view-change', () => { if (layout.preset !== 'custom') relayout(); });
  new ResizeObserver(() => paintAll()).observe(layer);

  // ----- wiring to the network -----
  WP.addMyTile = () => {
    if (WP.rec && WP.rec.layout) layout = Object.assign({ preset: 'right', pos: {}, hidden: false }, WP.rec.layout);
    markMenu();
    addTile('me', WP.me.name + ' (You)', WP.localStream, true);
  };
  WP.on('peer-add', (entry) => addTile(entry.id, entry.name, null, false));
  WP.on('peer-stream', (entry, stream) => { const el = els.get(entry.id); if (el) el.querySelector('video').srcObject = stream; });
  WP.on('peer-name', (entry) => {
    const el = els.get(entry.id);
    if (el) el.querySelector('.label').textContent = entry.name;
    if (layout.preset === 'custom' && layout.pos[key(entry.id)]) { geo.set(entry.id, layout.pos[key(entry.id)]); paint(entry.id); }
  });
  WP.on('peer-remove', (entry) => removeTile(entry.id));
  WP.on('local-stream', () => { const el = els.get('me'); if (el) el.querySelector('video').srcObject = WP.localStream; });
  WP.tiles = { geo, spot, get layout() { return layout; } };
})();
