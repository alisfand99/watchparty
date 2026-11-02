// Meme and card editor: captions, text, emoji, signature, pen, filters and card frames. Saves into the room gallery.
(() => {
  const { $ } = WP;
  const cv = $('edCanvas');
  const ctx = cv.getContext('2d');
  const SCRIPT = '"Segoe Script","Bradley Hand","Brush Script MT","Lucida Handwriting",cursive';
  const IMPACT = 'Impact,"Arial Black","Haettenschweiler",sans-serif';
  const EMOJIS = ['😂', '🤣', '😭', '😱', '🔥', '💀', '❤️', '👀', '🤯', '🥹', '😎', '🍿', '👏', '💩', '🎬', '⭐'];
  const MAXW = 1280;
  let st = null;

  // ---------- open ----------
  async function open(item) {
    const bmp = await createImageBitmap(item.blob);
    const k = Math.min(1, MAXW / bmp.width);
    st = {
      item, img: bmp, W: Math.round(bmp.width * k), H: Math.round(bmp.height * k),
      objs: [], top: '', bottom: '', cap: 'classic', filter: 'none', frame: 'none',
      sel: null, pen: false, color: '#ffe066',
    };
    $('edTop').value = ''; $('edBottom').value = ''; $('edCap').value = 'classic';
    $('edFilter').value = 'none'; $('edFrame').value = 'none';
    $('edPen').classList.remove('active');
    $('edColor').value = '#ffe066';
    $('editor').classList.remove('hidden');
    syncSel();
    draw();
  }
  function close() { $('editor').classList.add('hidden'); st = null; }

  // ---------- geometry ----------
  const band = (text) => (st.cap === 'bar' && text ? st.W * 0.15 * (String(text).split('\n').length) : 0);
  const bandTop = () => band(st.top), bandBot = () => band(st.bottom);
  const CH = () => st.H + bandTop() + bandBot(); // content height
  function pads() {
    const W = st.W;
    switch (st.frame) {
      case 'polaroid': return { l: W * 0.05, t: W * 0.05, r: W * 0.05, b: W * 0.2 };
      case 'ticket': return { l: W * 0.04, t: W * 0.1, r: W * 0.04, b: W * 0.22 };
      case 'film': return { l: W * 0.09, t: W * 0.04, r: W * 0.09, b: W * 0.04 };
      default: return { l: 0, t: 0, r: 0, b: 0 };
    }
  }
  const total = () => { const p = pads(); return { TW: st.W + p.l + p.r, TH: CH() + p.t + p.b, p }; };

  // ---------- drawing ----------
  function fitText(c, text, font, maxW, startPx) {
    let px = startPx;
    for (; px > 10; px -= 2) { c.font = font(px); if (c.measureText(text).width <= maxW) break; }
    return px;
  }
  function classicCaption(c, text, W, y0, atTop, H) {
    const lines = String(text).toUpperCase().split('\n');
    const px = Math.min(...lines.map((l) => fitText(c, l, (p) => `900 ${p}px ${IMPACT}`, W * 0.94, W * 0.1)));
    c.font = `900 ${px}px ${IMPACT}`;
    c.textAlign = 'center';
    c.lineJoin = 'round';
    c.lineWidth = px * 0.16;
    c.strokeStyle = '#000';
    c.fillStyle = '#fff';
    c.textBaseline = atTop ? 'top' : 'bottom';
    lines.forEach((l, i) => {
      const y = atTop ? y0 + px * 0.1 + i * px * 1.05 : y0 + H - px * 0.1 - (lines.length - 1 - i) * px * 1.05;
      c.strokeText(l, W / 2, y);
      c.fillText(l, W / 2, y);
    });
  }
  function barCaption(c, text, W, y, h) {
    c.fillStyle = '#fff';
    c.fillRect(0, y, W, h);
    const lines = String(text).split('\n');
    const px = Math.min(...lines.map((l) => fitText(c, l, (p) => `800 ${p}px system-ui, "Segoe UI", sans-serif`, W * 0.92, W * 0.075)));
    c.font = `800 ${px}px system-ui, "Segoe UI", sans-serif`;
    c.fillStyle = '#000';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    lines.forEach((l, i) => c.fillText(l, W / 2, y + (h / lines.length) * (i + 0.5)));
  }
  function applyFilter(c, W, H, y0) {
    const f = st.filter;
    if (f === 'bw') c.filter = 'grayscale(1) contrast(1.1)';
    else if (f === 'sepia') c.filter = 'sepia(.85) contrast(1.05)';
    else if (f === 'vhs') c.filter = 'saturate(1.5) contrast(1.15) hue-rotate(-6deg) blur(.5px)';
    else if (f === 'fry') c.filter = 'contrast(1.9) saturate(3) brightness(1.1)';
    if (f === 'fry') { // chunky and crunchy
      const sw = Math.max(40, Math.round(W / 5)), sh = Math.round(sw * (H / W));
      const s = document.createElement('canvas');
      s.width = sw; s.height = sh;
      const sc = s.getContext('2d');
      sc.filter = c.filter;
      sc.drawImage(st.img, 0, 0, sw, sh);
      c.filter = 'none';
      c.imageSmoothingEnabled = false;
      c.drawImage(s, 0, y0, W, H);
      c.imageSmoothingEnabled = true;
      return;
    }
    c.drawImage(st.img, 0, y0, W, H);
    c.filter = 'none';
    if (f === 'vhs') {
      c.globalAlpha = 0.25; c.globalCompositeOperation = 'screen';
      c.drawImage(st.img, 4, y0, W, H); c.drawImage(st.img, -4, y0, W, H);
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      c.fillStyle = 'rgba(0,0,0,.16)';
      for (let y = y0; y < y0 + H; y += 4) c.fillRect(0, y, W, 1.5);
    }
    if (f === 'vignette') {
      const g = c.createRadialGradient(W / 2, y0 + H / 2, Math.min(W, H) * 0.3, W / 2, y0 + H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.75)');
      c.fillStyle = g; c.fillRect(0, y0, W, H);
    }
  }
  function drawObj(c, o, W, H) {
    if (o.type === 'pen') {
      c.strokeStyle = o.color; c.lineWidth = o.w * W; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      o.pts.forEach(([x, y], i) => (i ? c.lineTo(x * W, y * H) : c.moveTo(x * W, y * H)));
      if (o.pts.length === 1) c.lineTo(o.pts[0][0] * W + 0.1, o.pts[0][1] * H);
      c.stroke();
      return;
    }
    const px = o.size * W;
    const font = o.type === 'sign' ? `${px}px ${SCRIPT}` : o.type === 'emoji' ? `${px}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif` : `900 ${px}px ${IMPACT}`;
    c.font = font;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const lines = String(o.text).split('\n');
    const w = Math.max(...lines.map((l) => c.measureText(l).width)), h = px * 1.15 * lines.length;
    o._b = { x: o.x * W, y: o.y * H, w, h };
    c.save();
    c.translate(o.x * W, o.y * H);
    if (o.rot) c.rotate(o.rot);
    if (o.type === 'text') { c.lineJoin = 'round'; c.lineWidth = px * 0.14; c.strokeStyle = '#000'; }
    lines.forEach((l, i) => {
      const y = (i - (lines.length - 1) / 2) * px * 1.15;
      if (o.type === 'text') c.strokeText(l, 0, y);
      c.fillStyle = o.color;
      c.fillText(l, 0, y);
    });
    c.restore();
  }
  function frameBg(c, TW, TH, p) {
    if (st.frame === 'polaroid') { c.fillStyle = '#f8f5ee'; c.fillRect(0, 0, TW, TH); }
    else if (st.frame === 'ticket') {
      const g = c.createLinearGradient(0, 0, TW, TH);
      g.addColorStop(0, '#20233a'); g.addColorStop(1, '#10121f');
      c.fillStyle = g; c.fillRect(0, 0, TW, TH);
      c.strokeStyle = '#d8b45a'; c.lineWidth = Math.max(2, TW * 0.004);
      c.strokeRect(TW * 0.012, TW * 0.012, TW - TW * 0.024, TH - TW * 0.024);
    } else if (st.frame === 'film') {
      c.fillStyle = '#111'; c.fillRect(0, 0, TW, TH);
      c.fillStyle = '#f2f2f2';
      const hw = p.l * 0.42, hh = TW * 0.032;
      for (let y = TW * 0.02; y < TH - hh; y += TW * 0.06) {
        c.beginPath();
        c.roundRect(p.l * 0.29, y, hw, hh, 3); c.fill();
        c.beginPath();
        c.roundRect(TW - p.l * 0.29 - hw, y, hw, hh, 3); c.fill();
      }
    }
  }
  function frameText(c, TW, TH, p) {
    const names = [...new Set([...(st.item.signed || []), ...(mySigned() ? [WP.me.name] : [])])];
    const cap = (st.top || st.bottom || '').replace(/\n/g, ' ');
    const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    const movie = st.item.movie || '';
    c.textAlign = 'center';
    if (st.frame === 'polaroid') {
      const y = p.t + CH();
      c.fillStyle = '#2b2b2b';
      c.textBaseline = 'middle';
      c.font = `${TW * 0.05}px ${SCRIPT}`;
      c.fillText(cap || movie || 'Movie night', TW / 2, y + p.b * 0.4, TW * 0.9);
      c.font = `${TW * 0.028}px system-ui, sans-serif`;
      c.fillStyle = '#6b6b6b';
      c.fillText(date + (names.length ? '  ·  signed by ' + names.join(', ') : ''), TW / 2, y + p.b * 0.78, TW * 0.9);
    } else if (st.frame === 'ticket') {
      c.textBaseline = 'middle';
      c.fillStyle = '#d8b45a';
      c.font = `700 ${TW * 0.03}px system-ui, sans-serif`;
      c.fillText('★  WATCHPARTY  ·  ADMIT ONE  ★', TW / 2, p.t / 2, TW * 0.9);
      const y = p.t + CH();
      c.strokeStyle = 'rgba(216,180,90,.7)'; c.setLineDash([8, 8]); c.lineWidth = 2;
      c.beginPath(); c.moveTo(TW * 0.03, y + 4); c.lineTo(TW * 0.97, y + 4); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#fff';
      c.font = `800 ${TW * 0.04}px system-ui, sans-serif`;
      c.fillText(cap || movie || 'Movie night', TW / 2, y + p.b * 0.3, TW * 0.9);
      c.font = `${TW * 0.026}px system-ui, sans-serif`;
      c.fillStyle = '#c9cce0';
      c.fillText(`${movie ? movie + '  ·  ' : ''}Room ${WP.rec ? WP.rec.code : ''}  ·  ${date}${st.item.mt ? '  ·  at ' + WP.fmt(st.item.mt) : ''}`, TW / 2, y + p.b * 0.58, TW * 0.92);
      if (names.length) { c.fillStyle = '#d8b45a'; c.font = `${TW * 0.034}px ${SCRIPT}`; c.fillText('Signed by ' + names.join(', '), TW / 2, y + p.b * 0.82, TW * 0.9); }
    }
  }
  function draw(preview = true, target = cv) {
    if (!st) return;
    const { TW, TH, p } = total();
    const c = target.getContext('2d');
    target.width = TW; target.height = TH;
    frameBg(c, TW, TH, p);
    c.save();
    c.translate(p.l, p.t);
    c.beginPath(); c.rect(0, 0, st.W, CH()); c.clip();
    const bt = bandTop();
    c.fillStyle = '#fff'; c.fillRect(0, 0, st.W, CH());
    applyFilter(c, st.W, st.H, bt);
    if (st.cap === 'bar') {
      if (st.top) barCaption(c, st.top, st.W, 0, bt);
      if (st.bottom) barCaption(c, st.bottom, st.W, bt + st.H, bandBot());
    } else {
      if (st.top) classicCaption(c, st.top, st.W, 0, true, st.H);
      if (st.bottom) classicCaption(c, st.bottom, st.W, 0, false, st.H);
    }
    for (const o of st.objs) drawObj(c, o, st.W, CH());
    if (preview && st.sel && st.sel._b) {
      const b = st.sel._b;
      c.strokeStyle = '#6c8cff'; c.lineWidth = 2; c.setLineDash([6, 4]);
      c.strokeRect(b.x - b.w / 2 - 6, b.y - b.h / 2 - 4, b.w + 12, b.h + 8);
      c.setLineDash([]);
    }
    c.restore();
    frameText(c, TW, TH, p);
  }

  // ---------- selection and panel ----------
  const mySigned = () => !!(st && st.objs.some((o) => o.type === 'sign'));
  function syncSel() {
    const o = st && st.sel;
    $('edSelBox').classList.toggle('hidden', !o || o.type === 'pen');
    if (o && o.type !== 'pen') {
      $('edText').value = o.text;
      $('edText').disabled = o.type === 'emoji';
      $('edSize').value = Math.round(o.size * 1000);
      $('edColor').value = o.color || '#ffffff';
    }
  }
  function addObj(o) {
    Object.assign(o, { x: 0.5, y: 0.5, size: 0.08, color: st.color, rot: 0 }, o);
    st.objs.push(o);
    st.sel = o;
    syncSel();
    draw();
  }
  $('edAddText').onclick = () => st && addObj({ type: 'text', text: 'TEXT', color: '#ffffff' });
  $('edSign').onclick = () => {
    if (!st) return;
    st.objs = st.objs.filter((o) => o.type !== 'sign');
    addObj({ type: 'sign', text: WP.me.name, x: 0.78, y: 0.9, size: 0.075, color: st.color });
  };
  $('edEmoji').append(...EMOJIS.map((e) => { const b = document.createElement('button'); b.textContent = e; b.onclick = () => st && addObj({ type: 'emoji', text: e, size: 0.14 }); return b; }));
  $('edPen').onclick = () => { if (!st) return; st.pen = !st.pen; $('edPen').classList.toggle('active', st.pen); };
  $('edUndo').onclick = () => { if (!st) return; const o = st.objs.pop(); if (o === st.sel) st.sel = null; syncSel(); draw(); };
  $('edDel').onclick = () => { if (!st || !st.sel) return; st.objs = st.objs.filter((o) => o !== st.sel); st.sel = null; syncSel(); draw(); };
  $('edTop').oninput = () => { st.top = $('edTop').value; draw(); };
  $('edBottom').oninput = () => { st.bottom = $('edBottom').value; draw(); };
  $('edCap').onchange = () => { st.cap = $('edCap').value; draw(); };
  $('edFilter').onchange = () => { st.filter = $('edFilter').value; draw(); };
  $('edFrame').onchange = () => { st.frame = $('edFrame').value; draw(); };
  $('edText').oninput = () => { if (st.sel && st.sel.type !== 'emoji') { st.sel.text = $('edText').value || ' '; draw(); } };
  $('edSize').oninput = () => { if (st.sel) { st.sel.size = $('edSize').value / 1000; draw(); } };
  $('edColor').oninput = () => { st.color = $('edColor').value; if (st.sel && st.sel.type !== 'emoji') st.sel.color = st.color; draw(); };

  // pointer: move objects or draw with the pen
  let drag = null;
  const pt = (e) => {
    const r = cv.getBoundingClientRect(), { TW, p } = total();
    const k = TW / r.width;
    return { x: ((e.clientX - r.left) * k - p.l) / st.W, y: ((e.clientY - r.top) * k - p.t) / CH(), k };
  };
  cv.addEventListener('pointerdown', (e) => {
    if (!st) return;
    cv.setPointerCapture(e.pointerId);
    const q = pt(e);
    if (st.pen) {
      const o = { type: 'pen', color: st.color, w: 0.008, pts: [[q.x, q.y]] };
      st.objs.push(o);
      drag = { pen: o };
      draw();
      return;
    }
    const x = q.x * st.W, y = q.y * CH();
    st.sel = null;
    for (let i = st.objs.length - 1; i >= 0; i--) {
      const o = st.objs[i], b = o._b;
      if (o.type !== 'pen' && b && Math.abs(x - b.x) <= b.w / 2 + 8 && Math.abs(y - b.y) <= b.h / 2 + 8) { st.sel = o; drag = { o, dx: o.x - q.x, dy: o.y - q.y }; break; }
    }
    syncSel();
    draw();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag || !st) return;
    const q = pt(e);
    if (drag.pen) drag.pen.pts.push([q.x, q.y]);
    else { drag.o.x = q.x + drag.dx; drag.o.y = q.y + drag.dy; }
    draw();
  });
  const up = () => { drag = null; };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);

  // ---------- saving ----------
  async function exportBlob() {
    const c = document.createElement('canvas');
    draw(false, c);
    return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
  }
  async function save(share) {
    if (!st) return;
    const blob = await exportBlob();
    const signed = [...new Set([...(st.item.signed || []), ...(mySigned() ? [WP.me.name] : [])])];
    const decorated = st.frame !== 'none';
    const edited = !!(st.top || st.bottom || st.objs.length || st.filter !== 'none');
    const it = await WP.gallery.add({
      kind: 'image', blob, signed, parent: st.item.id, mt: st.item.mt, movie: st.item.movie,
      title: st.top || st.bottom || '', note: decorated ? 'card' : (edited || signed.length) ? 'meme' : st.item.note || '',
    });
    close();
    WP.toast(share ? 'Saved. Sharing with the room...' : 'Saved to the room gallery');
    if (share) await WP.gallery.share(it);
    return it;
  }
  $('edSave').onclick = () => save(false);
  $('edShare').onclick = () => save(true);
  $('edCancel').onclick = close;
  $('edDownload').onclick = async () => {
    if (!st) return;
    const blob = await exportBlob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'watchparty-card.jpg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  document.addEventListener('keydown', (e) => {
    if (!st) return;
    if (e.key === 'Escape') close();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel && !/^(INPUT|TEXTAREA)$/.test((e.target || {}).tagName)) $('edDel').click();
  }, true);

  WP.editor = { open, close, get state() { return st; }, draw };
})();
