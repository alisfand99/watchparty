// Drawing on top of the picture: laser pointer, pen, eraser, emoji stamps. Shared with everyone and saved with the room.
(() => {
  const { $ } = WP;
  const cv = $('draw');
  const ctx = cv.getContext('2d');
  const video = $('video');
  const COLORS = ['#ff4d4d', '#ffd23f', '#3ddc84', '#4da3ff', '#c77dff', '#ffffff'];
  const EMOJIS = ['🔥', '😂', '❤️', '👍', '😮', '😢', '👏', '🎉'];
  let tool = 'none', color = COLORS[0], size = 0.006, emoji = EMOJIS[0], fade = false;
  let cur = null, pending = [], flushT = 0, erasing = false, counter = 0;
  const lasers = new Map(); // peer id -> { x, y, c, name, t, trail }
  let dirty = true;

  const D = () => WP.rec.draw;
  const viewKey = () => (WP.view && WP.view.mode === 'browser' ? 'b' : 'p');

  // Drawings are placed relative to the picture itself, so they line up on every screen.
  function contentRect() {
    const W = cv.clientWidth, H = cv.clientHeight;
    if (viewKey() === 'b') return { x: 0, y: 0, w: W, h: H };
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return { x: 0, y: 0, w: W, h: H };
    const s = Math.min(W / vw, H / vh);
    const w = vw * s, h = vh * s;
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }
  WP.contentRect = contentRect;
  const norm = (e) => {
    const b = cv.getBoundingClientRect(), r = contentRect();
    return [Math.min(1, Math.max(0, (e.clientX - b.left - r.x) / r.w)), Math.min(1, Math.max(0, (e.clientY - b.top - r.y) / r.h))];
  };
  const r4 = (n) => Math.round(n * 10000) / 10000;

  // ---------- rendering ----------
  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    dirty = true;
  }
  new ResizeObserver(sizeCanvas).observe(cv);
  video.addEventListener('loadedmetadata', () => (dirty = true));

  function render(now) {
    requestAnimationFrame(render);
    if (!WP.rec) return;
    let busy = lasers.size > 0;
    const d = D();
    if (d.items.some((it) => it.f)) {
      busy = true;
      const keep = d.items.filter((it) => !it.f || Date.now() - it.ts < 8500);
      if (keep.length !== d.items.length) d.items = keep;
    }
    if (!dirty && !busy) return;
    dirty = false;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
    const r = contentRect();
    const vk = viewKey();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const it of d.items) {
      if ((it.v || 'p') !== vk) continue;
      let alpha = 1;
      if (it.f) { const age = Date.now() - it.ts; alpha = age < 7000 ? 1 : Math.max(0, 1 - (age - 7000) / 1500); }
      ctx.globalAlpha = alpha;
      if (it.k === 'pen') {
        const p = it.p;
        if (p.length < 2) continue;
        ctx.strokeStyle = it.c;
        ctx.lineWidth = Math.max(1.5, it.s * r.w);
        ctx.beginPath();
        ctx.moveTo(r.x + p[0] * r.w, r.y + p[1] * r.h);
        if (p.length === 2) ctx.lineTo(r.x + p[0] * r.w + 0.1, r.y + p[1] * r.h);
        for (let i = 2; i < p.length; i += 2) ctx.lineTo(r.x + p[i] * r.w, r.y + p[i + 1] * r.h);
        ctx.stroke();
      } else if (it.k === 'emoji') {
        ctx.font = `${Math.max(14, it.s * r.w)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(it.e, r.x + it.x * r.w, r.y + it.y * r.h);
      }
    }
    ctx.globalAlpha = 1;
    for (const [id, l] of lasers) {
      if (Date.now() - l.t > 1500) { lasers.delete(id); continue; }
      const px = r.x + l.x * r.w, py = r.y + l.y * r.h;
      l.trail = l.trail.filter((q) => Date.now() - q.t < 350);
      for (const q of l.trail) {
        ctx.globalAlpha = Math.max(0, 1 - (Date.now() - q.t) / 350) * 0.5;
        ctx.fillStyle = l.c;
        ctx.beginPath(); ctx.arc(r.x + q.x * r.w, r.y + q.y * r.h, 5, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(px, py, 0, px, py, 16);
      g.addColorStop(0, l.c); g.addColorStop(0.35, l.c); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, 16, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 3.5, 0, 7); ctx.fill();
      if (l.name) {
        ctx.font = '12px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        const tw = ctx.measureText(l.name).width + 10;
        ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(px + 12, py + 6, tw, 18);
        ctx.fillStyle = '#fff'; ctx.fillText(l.name, px + 17, py + 19);
      }
    }
  }
  requestAnimationFrame(render);

  // ---------- model ----------
  function findItem(id) { return D().items.find((x) => x.id === id); }
  function addItem(it) {
    const d = D();
    if (it.ts <= d.clearedAt || d.erased.includes(it.id)) return null;
    d.items.push(it);
    if (d.items.length > 600) d.items.splice(0, d.items.length - 600);
    dirty = true;
    return it;
  }
  function eraseIds(ids, local) {
    const d = D();
    const set = new Set(ids);
    d.items = d.items.filter((x) => !set.has(x.id));
    for (const id of ids) if (!d.erased.includes(id)) d.erased.push(id);
    if (d.erased.length > 2000) d.erased.splice(0, d.erased.length - 2000);
    dirty = true;
    WP.save();
    if (local) WP.broadcast({ t: 'draw-erase', ids });
  }

  // ---------- local drawing ----------
  const meta = () => ({ c: color, s: size, f: fade ? 1 : 0, v: viewKey(), by: WP.me.name });
  function flush(end) {
    clearTimeout(flushT); flushT = 0;
    if (!cur) return;
    if (pending.length || end) {
      WP.broadcast({ t: 'draw', id: cur.id, k: 'pen', c: cur.c, s: cur.s, f: cur.f, v: cur.v, ts: cur.ts, by: cur.by, p: pending, end: !!end });
      pending = [];
    }
  }
  function startStroke(p) {
    cur = { id: WP.myId.slice(0, 4) + '-' + Date.now().toString(36) + (++counter), k: 'pen', ts: Date.now(), p: [r4(p[0]), r4(p[1])], ...meta() };
    addItem(cur);
    pending = [...cur.p];
  }
  function extend(p) {
    if (!cur) return;
    const n = cur.p.length;
    if (Math.abs(cur.p[n - 2] - p[0]) < 0.0008 && Math.abs(cur.p[n - 1] - p[1]) < 0.0008) return;
    cur.p.push(r4(p[0]), r4(p[1]));
    pending.push(r4(p[0]), r4(p[1]));
    dirty = true;
    if (!flushT) flushT = setTimeout(() => flush(false), 40);
  }
  function endStroke() {
    if (!cur) return;
    flush(true);
    if (cur.p.length === 2) cur.p.push(cur.p[0] + 0.0001, cur.p[1]);
    WP.act('draw', '', WP.vtime());
    WP.save();
    cur = null;
  }
  function stamp(p) {
    const it = { id: WP.myId.slice(0, 4) + '-' + Date.now().toString(36) + (++counter), k: 'emoji', e: emoji, x: r4(p[0]), y: r4(p[1]), s: 0.045, ts: Date.now(), v: viewKey(), by: WP.me.name, f: fade ? 1 : 0 };
    addItem(it);
    WP.broadcast({ t: 'draw', ...it, end: true });
    WP.act('emoji', emoji, WP.vtime());
    WP.save();
  }
  function eraseAt(p) {
    const r = contentRect();
    const rad = 14 / r.w;
    const vk = viewKey();
    const hit = [];
    for (const it of D().items) {
      if ((it.v || 'p') !== vk) continue;
      if (it.k === 'emoji') {
        if (Math.hypot(it.x - p[0], (it.y - p[1]) * (r.h / r.w)) < it.s * 0.6) hit.push(it.id);
      } else {
        for (let i = 0; i < it.p.length; i += 2) {
          if (Math.hypot(it.p[i] - p[0], (it.p[i + 1] - p[1]) * (r.h / r.w)) < rad + it.s) { hit.push(it.id); break; }
        }
      }
    }
    if (hit.length) eraseIds(hit, true);
  }
  let lastLaser = 0;
  function laser(p, on) {
    const now = Date.now();
    if (on && now - lastLaser < 30) return;
    lastLaser = now;
    WP.broadcast({ t: 'laser', x: r4(p[0]), y: r4(p[1]), c: color, on: on ? 1 : 0, v: viewKey() });
  }

  cv.addEventListener('pointerdown', (e) => {
    if (tool === 'none' || e.button > 0) return;
    cv.setPointerCapture(e.pointerId);
    const p = norm(e);
    if (tool === 'pen') startStroke(p);
    else if (tool === 'eraser') { erasing = true; eraseAt(p); }
    else if (tool === 'emoji') stamp(p);
    else if (tool === 'laser') laser(p, true);
  });
  cv.addEventListener('pointermove', (e) => {
    if (tool === 'none') return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) {
      const p = norm(ev);
      if (tool === 'pen' && cur) extend(p);
      else if (tool === 'eraser' && erasing) eraseAt(p);
      else if (tool === 'laser') laser(p, true);
    }
  });
  const up = () => { if (cur) endStroke(); erasing = false; };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { if (tool === 'laser') WP.broadcast({ t: 'laser', on: 0 }); });

  // ---------- remote ----------
  WP.onMsg('draw', (entry, m) => {
    let it = findItem(m.id);
    if (!it) {
      const ts = m.f ? Date.now() : m.ts; // fading strokes follow this computer's clock
      if (m.k === 'emoji') it = addItem({ id: m.id, k: 'emoji', e: String(m.e || '').slice(0, 8), x: m.x, y: m.y, s: m.s || 0.045, ts, v: m.v || 'p', by: m.by, f: m.f });
      else it = addItem({ id: m.id, k: 'pen', c: String(m.c || '#fff').slice(0, 9), s: m.s || 0.006, f: m.f, v: m.v || 'p', ts, by: m.by, p: [] });
    }
    if (!it) return;
    if (m.p && m.p.length) it.p.push(...m.p);
    dirty = true;
    if (m.end) WP.save();
  });
  WP.onMsg('draw-erase', (entry, m) => eraseIds(m.ids || [], false));
  WP.onMsg('draw-clear', (entry, m) => clearAll(m.ts, false));
  WP.onMsg('laser', (entry, m) => {
    if (!m.on) { lasers.delete(entry.id); return; }
    if ((m.v || 'p') !== viewKey()) return;
    const l = lasers.get(entry.id) || { trail: [] };
    l.trail.push({ x: l.x ?? m.x, y: l.y ?? m.y, t: Date.now() });
    Object.assign(l, { x: m.x, y: m.y, c: m.c, name: entry.name, t: Date.now() });
    lasers.set(entry.id, l);
  });
  // A computer that just connected gets everything drawn so far.
  WP.onMsg('req-state', (entry) => {
    const d = D();
    if (!d.items.length && !d.clearedAt && !d.erased.length) return;
    const items = d.items.filter((it) => !it.f);
    for (let i = 0; i === 0 || i < items.length; i += 40) {
      WP.sendTo(entry, { t: 'draw-all', items: items.slice(i, i + 40), erased: i === 0 ? d.erased : [], clearedAt: i === 0 ? d.clearedAt : 0 });
    }
  });
  WP.onMsg('draw-all', (entry, m) => {
    const d = D();
    d.clearedAt = Math.max(d.clearedAt, m.clearedAt || 0);
    for (const id of m.erased || []) if (!d.erased.includes(id)) d.erased.push(id);
    const have = new Set(d.items.map((x) => x.id));
    let added = 0;
    for (const it of m.items || []) if (!have.has(it.id) && addItem(it)) added++;
    d.items = d.items.filter((x) => x.ts > d.clearedAt && !d.erased.includes(x.id));
    d.items.sort((a, b) => a.ts - b.ts);
    dirty = true;
    WP.save();
  });
  function clearAll(ts, local) {
    const d = D();
    d.clearedAt = Math.max(d.clearedAt, ts);
    d.items = [];
    dirty = true;
    WP.save();
    if (local) WP.broadcast({ t: 'draw-clear', ts });
  }

  // ---------- tool bar ----------
  const bar = $('drawbar');
  function setTool(t) {
    if (cur) endStroke();
    tool = t;
    bar.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    $('emojiRow').classList.toggle('hidden', t !== 'emoji');
    cv.classList.toggle('on', t !== 'none');
    cv.style.cursor = { pen: 'crosshair', eraser: 'cell', emoji: 'copy', laser: 'none', none: '' }[t];
    $('drawBtn').classList.toggle('on', !bar.classList.contains('hidden'));
  }
  bar.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  COLORS.forEach((c, i) => {
    const sw = document.createElement('i');
    sw.style.background = c;
    if (i === 0) sw.className = 'active';
    sw.onclick = () => { color = c; $('swatches').querySelectorAll('i').forEach((x) => x.classList.toggle('active', x === sw)); };
    $('swatches').appendChild(sw);
  });
  EMOJIS.forEach((e, i) => {
    const b = document.createElement('button');
    b.textContent = e;
    if (i === 0) b.className = 'active';
    b.onclick = () => { emoji = e; $('emojiRow').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); };
    $('emojiRow').appendChild(b);
  });
  bar.querySelectorAll('[data-size]').forEach((b) => {
    b.onclick = () => { size = +b.dataset.size; bar.querySelectorAll('[data-size]').forEach((x) => x.classList.toggle('active', x === b)); };
  });
  $('fadeBtn').onclick = () => { fade = !fade; $('fadeBtn').classList.toggle('active', fade); };
  $('undoBtn').onclick = () => {
    const mine = D().items.filter((x) => x.by === WP.me.name && (x.v || 'p') === viewKey()).pop();
    if (mine) eraseIds([mine.id], true);
  };
  $('clearBtn').onclick = () => clearAll(Date.now(), true);
  $('drawBtn').onclick = () => {
    bar.classList.toggle('hidden');
    if (bar.classList.contains('hidden')) setTool('none');
    else setTool(tool === 'none' ? 'pen' : tool);
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tool !== 'none') setTool('none');
    if ((e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey && !$('app').classList.contains('hidden') && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) $('drawBtn').click();
  });
  WP.on('view-change', () => (dirty = true));
  WP.draw = { setTool, get tool() { return tool; }, get items() { return D().items; }, redraw: () => (dirty = true) };
})();
