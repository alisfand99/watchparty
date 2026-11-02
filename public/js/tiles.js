// Camera tiles floating over the screen: drag, resize, click to enlarge, ready made layouts.
(() => {
  const { $ } = WP;
  const layer = $('tileLayer');
  const AR = 0.75; // tile height / width
  const geo = new Map(); // id -> { x, y, w } as fractions of the screen
  const els = new Map(); // id -> element
  let order = [];
  let layout = { preset: 'right', pos: {}, hidden: false, off: {} };
  const chips = document.createElement('div');
  chips.className = 'chips';
  layer.appendChild(chips);
  // the empty seat at the table: a frame with a plus that creates an invite link
  const invite = document.createElement('button');
  invite.id = 'inviteSeat';
  invite.className = 'tile invite hidden';
  invite.innerHTML = '<span class="plus">+</span><small>Invite a friend</small>';
  invite.onclick = () => WP.emit('invite-open');
  layer.appendChild(invite);
  const isOff = (id) => !!(layout.off && layout.off[key(id)]);
  const vis = () => order.filter((id) => !isOff(id));
  let spotId = null, spotPrev = null;

  const key = (id) => (id === 'me' ? 'me' : 'n:' + (WP.peers.get(id) ? WP.peers.get(id).name : '').toLowerCase());
  const size = () => ({ W: layer.clientWidth || 1, H: layer.clientHeight || 1 });
  const hFrac = (w) => { const { W, H } = size(); return w * AR * (W / H); }; // tile height as a fraction of the screen height
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const MODE = () => document.getElementById('screen').dataset.mode;
  const inLobby = () => MODE() === 'lobby';
  const bottomPad = () => (inLobby() ? 60 : 96) / size().H; // keep clear of the control bar
  const top = () => (MODE() === 'browser' ? 56 : 12) / size().H; // keep clear of the browser bar
  // Free area for the cameras, as fractions of the screen. The tool rail takes a strip on its side.
  function insets() {
    const { W, H } = size();
    const o = { l: 0.01, r: 0.01, t: top(), b: bottomPad() };
    const rl = WP.rail;
    if (rl && rl.open && !inLobby()) {
      if (rl.side === 'left') o.l += (rl.size + 6) / W;
      else if (rl.side === 'right') o.r += (rl.size + 6) / W;
      else if (rl.side === 'top') o.t += (rl.size + 6) / H;
      else o.b += (rl.size + 6) / H;
    }
    return o;
  }

  function fit(g) {
    const w = clamp(g.w, 0.07, 0.7);
    const h = hFrac(w);
    return { w, x: clamp(g.x, 0, 1 - w), y: clamp(g.y, 0, Math.max(0, 1 - h)) };
  }

  // ----- presets: return positions for n tiles -----
  const PRESETS = {
    right(n) {
      const I = insets();
      const avail = 1 - I.b - I.t - 0.02;
      const { W, H } = size();
      const ww = Math.min(0.2, (avail - 0.01 * n) / (n * AR * (W / H)));
      const h = hFrac(ww);
      return Array.from({ length: n }, (_, i) => ({ x: 1 - I.r - ww, y: I.t + i * (h + 0.01), w: ww }));
    },
    left(n) { const I = insets(); return PRESETS.right(n).map((g) => ({ ...g, x: I.l })); },
    top(n) {
      const I = insets();
      const w = Math.min(0.18, (1 - I.l - I.r) / n - 0.01);
      const total = n * (w + 0.01);
      return Array.from({ length: n }, (_, i) => ({ x: I.l + (1 - I.l - I.r - total) / 2 + i * (w + 0.01), y: I.t, w }));
    },
    bottom(n) {
      const I = insets();
      const w = Math.min(0.18, (1 - I.l - I.r) / n - 0.01);
      const total = n * (w + 0.01);
      const y = 1 - hFrac(w) - I.b - 0.01;
      return Array.from({ length: n }, (_, i) => ({ x: I.l + (1 - I.l - I.r - total) / 2 + i * (w + 0.01), y, w }));
    },
    corners(n) {
      const I = insets();
      const w = 0.17;
      const h = hFrac(w);
      const spots = [[I.l, I.t], [1 - I.r - w, I.t], [I.l, 1 - h - I.b], [1 - I.r - w, 1 - h - I.b]];
      return Array.from({ length: n }, (_, i) => {
        const [x, y] = spots[i % 4];
        const layerIdx = Math.floor(i / 4);
        return { x: x + (x < 0.5 ? 1 : -1) * layerIdx * (w + 0.01), y, w };
      });
    },
    grid(n) {
      const I = insets();
      const { W, H } = size();
      const cols = Math.ceil(Math.sqrt(n * (H / W) * (1 / AR)));
      const c = Math.max(1, Math.min(n, cols));
      const rows = Math.ceil(n / c);
      const availH = 1 - I.b - I.t - 0.02;
      const availW = 1 - I.l - I.r;
      const w = Math.min(availW / c - 0.01, (availH / rows - 0.01) / (AR * (W / H)));
      const totalW = c * (w + 0.01);
      const h = hFrac(w);
      const totalH = rows * (h + 0.01);
      return Array.from({ length: n }, (_, i) => ({
        x: I.l + (availW - totalW) / 2 + (i % c) * (w + 0.01),
        y: I.t + (availH - totalH) / 2 + Math.floor(i / c) * (h + 0.01),
        w,
      }));
    },
    // Round the table: seat 0 (you) at the bottom, the others spread around the ellipse.
    table(m) {
      const I = insets();
      const { W, H } = size();
      const availW = 1 - I.l - I.r, availH = 1 - I.t - I.b;
      const w = Math.min(0.18, availW / 4.4, (availH / 2.6) / (AR * (W / H)));
      const h = hFrac(w);
      const rx = (availW - w) / 2, ry = (availH - h) / 2;
      const cx = I.l + availW / 2, cy = I.t + availH / 2;
      PRESETS.tableBox = { x: cx - (rx - w / 2 + 0.02), y: cy - (ry - h / 2 + 0.05), w: 2 * (rx - w / 2 + 0.02), h: 2 * (ry - h / 2 + 0.05) };
      return Array.from({ length: m }, (_, i) => {
        const a = Math.PI / 2 + (i * 2 * Math.PI) / m;
        return { x: cx + rx * Math.cos(a) - w / 2, y: cy + ry * Math.sin(a) - h / 2, w };
      });
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

  let wasLobby = false;
  const effOff = (id) => !inLobby() && isOff(id);
  function relayout() {
    const lobby = inLobby();
    if (lobby && spotId) { const id = spotId; const el = els.get(id); if (el) el.classList.remove('spot'); spotId = null; spotPrev = null; }
    layer.classList.toggle('hidden', !!layout.hidden && !lobby);
    layer.classList.toggle('attable', lobby);
    const v = lobby ? order.slice() : vis();
    for (const id of order) { const el = els.get(id); if (el) el.classList.toggle('off', effOff(id)); }
    if (lobby) {
      const seats = Math.min(WP.MAX_PEOPLE, v.length + 1);
      const slots = PRESETS.table(Math.max(1, seats));
      v.forEach((id, i) => geo.set(id, slots[i]));
      const g = slots[v.length];
      if (g && v.length < WP.MAX_PEOPLE) {
        const f = fit(g);
        invite.style.left = f.x * 100 + '%'; invite.style.top = f.y * 100 + '%'; invite.style.width = f.w * 100 + '%';
        invite.classList.remove('hidden');
      } else invite.classList.add('hidden');
      const tb = PRESETS.tableBox;
      const tEl = document.getElementById('table');
      if (tb && tEl) { tEl.style.left = tb.x * 100 + '%'; tEl.style.top = tb.y * 100 + '%'; tEl.style.width = tb.w * 100 + '%'; tEl.style.height = tb.h * 100 + '%'; }
    } else {
      invite.classList.add('hidden');
      if (wasLobby && layout.preset === 'custom') for (const id of order) geo.set(id, layout.pos[key(id)] || newSlot(id));
      if (layout.preset === 'custom') {
        for (const id of v) if (id !== spotId && !geo.has(id)) geo.set(id, newSlot(id));
      } else {
        const slots = PRESETS[layout.preset](Math.max(1, v.length));
        v.forEach((id, i) => { if (id === spotId) { spotPrev = slots[i]; } else geo.set(id, slots[i]); });
      }
    }
    wasLobby = lobby;
    paintAll();
    drawChips();
    save();
  }
  function drawChips() {
    chips.textContent = '';
    for (const id of order) {
      if (!effOff(id)) continue;
      const b = document.createElement('button');
      const nm = id === 'me' ? 'You' : (WP.peers.get(id) ? WP.peers.get(id).name : '?');
      b.className = 'chip';
      b.title = 'Show ' + nm;
      b.dataset.id = id;
      const dot = document.createElement('span');
      dot.textContent = (nm[0] || '?').toUpperCase();
      const t = document.createElement('em');
      t.textContent = nm;
      b.append(dot, t);
      b.onclick = (e) => { e.stopPropagation(); setOff(id, false); };
      chips.appendChild(b);
    }
  }
  function setOff(id, off) {
    if (!layout.off) layout.off = {};
    if (off) { layout.off[key(id)] = true; if (spotId === id) { const el = els.get(id); if (el) el.classList.remove('spot'); if (spotPrev) geo.set(id, spotPrev); spotId = null; spotPrev = null; } }
    else { delete layout.off[key(id)]; if (layout.preset === 'custom' && !geo.has(id)) geo.set(id, newSlot(id)); }
    relayout();
  }
  function newSlot(id) {
    const saved = layout.pos[key(id)];
    if (saved) return saved;
    // free place: next position of the right column
    const v = vis();
    const slots = PRESETS.right(Math.max(v.length, 1));
    return slots[Math.max(0, v.indexOf(id))] || slots[0];
  }
  function save() {
    if (!WP.rec) return;
    if (layout.preset === 'custom' && !inLobby()) {
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
  // Enlarge in place: the tile grows around its own centre, then stays inside the free area.
  function spot(id) {
    if (spotId === id) return unspot();
    unspot();
    const g = geo.get(id);
    if (!g || inLobby()) return;
    spotId = id;
    spotPrev = { ...g };
    const { W, H } = size();
    const I = insets();
    const maxW = Math.min(0.46, (1 - I.l - I.r) - 0.01, (1 - I.t - I.b) / (AR * (W / H)));
    const w = Math.min(maxW, Math.max(g.w * 2.2, 0.26));
    const h = hFrac(w);
    const cx = g.x + g.w / 2, cy = g.y + hFrac(g.w) / 2;
    geo.set(id, { w, x: clamp(cx - w / 2, I.l, 1 - I.r - w), y: clamp(cy - h / 2, I.t, 1 - I.b - h) });
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
    const hb = document.createElement('button');
    hb.className = 'hidebtn';
    hb.title = 'Hide this camera (a small name tag stays to bring it back)';
    hb.textContent = '\u2212';
    hb.addEventListener('pointerdown', (e) => e.stopPropagation());
    hb.addEventListener('click', (e) => { e.stopPropagation(); setOff(id, true); });
    el.append(v, l, grip, hb);
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
      if (e.button !== 0 || inLobby()) return;
      // an enlarged camera only reacts to a click (so a shaky mouse never drags it away)
      mode = spotId === id ? 'click' : (e.target === grip ? 'resize' : 'drag');
      sx = e.clientX; sy = e.clientY; moved = false;
      start = { ...geo.get(id) };
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (!mode || mode === 'click') return;
      const { W, H } = size();
      const dx = (e.clientX - sx) / W, dy = (e.clientY - sy) / H;
      if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < 6) return;
      if (!moved) { moved = true; el.classList.add('dragging'); toCustom(); }
      if (mode === 'drag') geo.set(id, { ...start, x: start.x + dx, y: start.y + dy });
      else geo.set(id, { ...start, w: start.w + dx });
      paint(id);
    });
    const end = (e) => {
      if (!mode) return;
      const wasMove = moved, m = mode;
      mode = null;
      el.classList.remove('dragging');
      if (m === 'click') { if (Math.hypot(e.clientX - sx, e.clientY - sy) < 30) unspot(); return; }
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

  WP.on('view-change', () => relayout());
  WP.on('rail-change', () => relayout());
  WP.on('fullscreen', () => { requestAnimationFrame(() => { if (layout.preset !== 'custom' || inLobby()) relayout(); else paintAll(); }); });
  new ResizeObserver(() => paintAll()).observe(layer);

  // ----- wiring to the network -----
  WP.addMyTile = () => {
    if (WP.rec && WP.rec.layout) layout = Object.assign({ preset: 'right', pos: {}, hidden: false, off: {} }, WP.rec.layout);
    markMenu();
    addTile('me', WP.me.name + ' (You)', WP.localStream, true);
  };
  WP.on('peer-add', (entry) => addTile(entry.id, entry.name, null, false));
  WP.on('peer-stream', (entry, stream) => { const el = els.get(entry.id); if (el) el.querySelector('video').srcObject = stream; });
  WP.on('peer-name', (entry) => {
    const el = els.get(entry.id);
    if (el) el.querySelector('.label').textContent = entry.name;
    if (layout.preset === 'custom' && layout.pos[key(entry.id)]) { geo.set(entry.id, layout.pos[key(entry.id)]); paint(entry.id); }
    relayout();
  });
  WP.on('peer-remove', (entry) => removeTile(entry.id));
  WP.on('local-stream', () => { const el = els.get('me'); if (el) el.querySelector('video').srcObject = WP.localStream; });
  WP.tiles = { geo, spot, setOff, isOff, get layout() { return layout; } };
})();
