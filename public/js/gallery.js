// Room gallery: snaps, clips and cards saved on this computer (per room), shared with the room, with emoji votes.
(() => {
  const { $ } = WP;
  const REACTS = ['😂', '❤️', '🔥', '😮', '👏', '💀'];
  const MAX_SHARE = 6e6;
  let filter = 'all', viewId = null, urls = [], newCount = 0;

  // ---------- storage ----------
  let dbp = null;
  const mem = [];
  const openDb = () => dbp || (dbp = new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('no idb'));
    const q = indexedDB.open('wp-gallery', 1);
    q.onupgradeneeded = () => { const s = q.result.createObjectStore('items', { keyPath: 'id' }); s.createIndex('room', 'room'); };
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  }));
  const run = (mode, fn) => openDb().then((db) => new Promise((res, rej) => {
    const t = db.transaction('items', mode);
    const r = fn(t.objectStore('items'));
    t.oncomplete = () => res(r && r.result);
    t.onerror = () => rej(t.error);
  }));
  const dbPut = (it) => run('readwrite', (s) => s.put(it)).catch(() => { const i = mem.findIndex((x) => x.id === it.id); if (i >= 0) mem[i] = it; else mem.push(it); });
  const dbAll = () => run('readonly', (s) => s.index('room').getAll(WP.rec.key)).catch(() => mem.filter((x) => x.room === WP.rec.key));
  const dbGet = (id) => run('readonly', (s) => s.get(id)).catch(() => mem.find((x) => x.id === id));
  const dbDel = (id) => run('readwrite', (s) => s.delete(id)).catch(() => { const i = mem.findIndex((x) => x.id === id); if (i >= 0) mem.splice(i, 1); });

  async function thumbOf(blob) {
    try {
      const bmp = await createImageBitmap(blob);
      const k = Math.min(1, 360 / bmp.width);
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.7);
    } catch { return ''; }
  }

  async function add(item) {
    const it = Object.assign({ id: WP.uid(), room: WP.rec.key, ts: Date.now(), reacts: {}, signed: [], by: WP.me.name, title: '' }, item);
    if (!it.thumb && it.kind !== 'clip') it.thumb = await thumbOf(it.blob);
    await dbPut(it);
    WP.emit('gallery-change', it);
    if (!$('gallery').classList.contains('hidden')) render();
    return it;
  }
  const update = async (it) => { await dbPut(it); if (!$('gallery').classList.contains('hidden')) render(); };

  // ---------- small notice on the screen ----------
  WP.toast = (text) => {
    const t = document.createElement('div');
    t.className = 'snaptoast';
    t.textContent = text;
    $('screen').appendChild(t);
    setTimeout(() => t.remove(), 3200);
  };

  // ---------- sharing over the room's peer connections ----------
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function share(it, quiet) {
    const peers = [...WP.peers.values()].filter((p) => p.dc && p.dc.readyState === 'open');
    if (!peers.length) { if (!quiet) WP.toast('Nobody else is in the room'); return false; }
    if (it.blob.size > MAX_SHARE) { WP.toast('Too big to share (limit 6 MB). Try a shorter clip.'); return false; }
    const buf = new Uint8Array(await it.blob.arrayBuffer());
    const SZ = 9000, n = Math.ceil(buf.length / SZ) || 1;
    WP.broadcast({ t: 'gs', id: it.id, kind: it.kind, mime: it.blob.type, title: it.title || '', by: it.by, ts: it.ts, mt: it.mt || 0, movie: it.movie || '', signed: it.signed || [], dur: it.dur || 0, note: it.note || '', n, size: buf.length, parent: it.parent || '' });
    for (let i = 0; i < n; i++) {
      while (peers.some((p) => p.dc.readyState === 'open' && p.dc.bufferedAmount > 262144)) await sleep(15);
      WP.broadcast({ t: 'gc', id: it.id, i, d: b64(buf.subarray(i * SZ, (i + 1) * SZ)) });
    }
    WP.toast('Shared with the room');
    WP.act('share', (it.kind === 'clip' ? 'a clip' : it.signed && it.signed.length ? 'a signed card' : 'a picture'), it.mt || null);
    return true;
  }
  const incoming = new Map();
  WP.onMsg('gs', (entry, m) => {
    if (!m.id || !(m.n > 0) || m.n > 2000 || m.size > MAX_SHARE) return;
    incoming.set(entry.id + m.id, { head: m, parts: new Array(m.n), got: 0, from: entry.name });
  });
  WP.onMsg('gc', async (entry, m) => {
    const inc = incoming.get(entry.id + m.id);
    if (!inc || inc.parts[m.i]) return;
    inc.parts[m.i] = unb64(String(m.d));
    if (++inc.got < inc.head.n) return;
    incoming.delete(entry.id + m.id);
    const h = inc.head;
    const blob = new Blob(inc.parts, { type: h.mime || 'image/jpeg' });
    const old = await dbGet(h.id);
    if (old) return; // already have it
    const it = await add({ id: h.id, kind: h.kind === 'clip' ? 'clip' : 'image', blob, ts: h.ts, mt: h.mt, movie: h.movie, by: h.by, title: h.title, signed: Array.isArray(h.signed) ? h.signed.slice(0, 20) : [], dur: h.dur, note: h.note, parent: h.parent, from: inc.from, thumb: h.kind === 'clip' ? '' : undefined });
    newCount++;
    badge();
    WP.toast(`${inc.from} shared ${h.kind === 'clip' ? 'a clip' : 'a picture'}. See it in the gallery.`);
    WP.say(`${inc.from} shared ${h.kind === 'clip' ? 'a clip' : 'a picture'} to the gallery.`, 'sys');
    return it;
  });
  WP.onMsg('gr', async (entry, m) => {
    const it = await dbGet(m.id);
    if (!it || !REACTS.includes(m.emoji)) return;
    if (m.emoji === '') delete it.reacts[entry.name]; else it.reacts[entry.name] = m.emoji;
    await update(it);
  });
  async function react(it, emoji) {
    const mine = it.reacts[WP.me.name];
    if (mine === emoji) { delete it.reacts[WP.me.name]; WP.broadcast({ t: 'gr', id: it.id, emoji: '' }); }
    else { it.reacts[WP.me.name] = emoji; WP.broadcast({ t: 'gr', id: it.id, emoji }); }
    await update(it);
    if (viewId === it.id) showItem(it.id);
  }
  // an empty emoji is a removal and must pass the filter above
  REACTS.push('');

  // ---------- panel ----------
  function badge() { $('galBtn').classList.toggle('badge', newCount > 0); }
  const score = (it) => Object.keys(it.reacts || {}).length;
  async function render() {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
    const all = (await dbAll()) || [];
    all.sort((a, b) => b.ts - a.ts);
    const best = all.reduce((m, x) => (score(x) > (m ? score(m) : 1) ? x : m), null);
    const list = all.filter((x) => filter === 'all' || (filter === 'mine' ? x.by === WP.me.name : filter === 'clips' ? x.kind === 'clip' : filter === 'cards' ? x.note === 'card' : filter === 'memes' ? x.note === 'meme' : x.kind === 'image' && x.note !== 'card' && x.note !== 'meme'));
    const grid = $('galGrid');
    grid.textContent = '';
    $('galEmpty').classList.toggle('hidden', list.length > 0);
    $('galCount').textContent = all.length + (all.length === 1 ? ' item' : ' items');
    document.querySelectorAll('#galFilters [data-f]').forEach((b) => b.classList.toggle('active', b.dataset.f === filter));
    for (const it of list) {
      const d = document.createElement('div');
      d.className = 'gitem';
      d.dataset.id = it.id;
      if (it.kind === 'clip' && !it.thumb) {
        const v = document.createElement('video');
        v.muted = true; v.preload = 'metadata';
        const u = URL.createObjectURL(it.blob); urls.push(u); v.src = u + '#t=0.2';
        d.appendChild(v);
      } else {
        const img = document.createElement('img');
        img.alt = '';
        if (it.thumb) img.src = it.thumb; else { const u = URL.createObjectURL(it.blob); urls.push(u); img.src = u; }
        d.appendChild(img);
      }
      const meta = document.createElement('div');
      meta.className = 'gmeta';
      const rs = Object.values(it.reacts || {});
      meta.textContent = `${it.by}${it.movie ? ' · ' + WP.fmt(it.mt) : ''}${rs.length ? '  ' + rs.join('') : ''}`;
      d.appendChild(meta);
      if (it.kind === 'clip') { const p = document.createElement('span'); p.className = 'gplay'; p.textContent = '▶ ' + WP.fmt(it.dur || 0); d.appendChild(p); }
      if (it.signed && it.signed.length) { const s = document.createElement('span'); s.className = 'gsign'; s.textContent = '✍ ' + it.signed.length; d.appendChild(s); }
      if (best && best.id === it.id) { const c = document.createElement('span'); c.className = 'gcrown'; c.textContent = '👑'; c.title = 'Best of the night'; d.appendChild(c); }
      d.onclick = () => showItem(it.id);
      grid.appendChild(d);
    }
  }

  const viewer = $('galView');
  async function showItem(id) {
    const it = await dbGet(id);
    if (!it) return hideItem();
    viewId = id;
    viewer.classList.remove('hidden');
    const box = $('galMedia');
    const old = box.querySelector('img,video');
    if (old && old.dataset.id !== id) { if (old.src.startsWith('blob:')) URL.revokeObjectURL(old.src); old.remove(); }
    let el = box.querySelector('img,video');
    if (!el) {
      el = document.createElement(it.kind === 'clip' ? 'video' : 'img');
      el.dataset.id = id;
      if (it.kind === 'clip') { el.controls = true; el.autoplay = true; }
      el.src = URL.createObjectURL(it.blob);
      box.appendChild(el);
    }
    $('galInfo').textContent = `${it.by}${it.from && it.from !== it.by ? ' (shared by ' + it.from + ')' : ''} · ${new Date(it.ts).toLocaleString()}${it.movie ? ' · ' + it.movie + ' at ' + WP.fmt(it.mt) : ''}${it.signed && it.signed.length ? ' · Signed by ' + it.signed.join(', ') : ''}`;
    const row = $('galReacts');
    row.textContent = '';
    for (const e of REACTS.filter(Boolean)) {
      const b = document.createElement('button');
      const n = Object.values(it.reacts || {}).filter((x) => x === e).length;
      b.textContent = e + (n ? ' ' + n : '');
      if (it.reacts && it.reacts[WP.me.name] === e) b.classList.add('active');
      b.onclick = () => react(it, e);
      row.appendChild(b);
    }
    $('galEdit').classList.toggle('hidden', it.kind === 'clip');
  }
  function hideItem() {
    viewId = null;
    viewer.classList.add('hidden');
    const el = $('galMedia').querySelector('img,video');
    if (el) { if (el.src.startsWith('blob:')) URL.revokeObjectURL(el.src); el.remove(); }
  }
  const extOf = (it) => (it.kind === 'clip' ? 'webm' : it.blob.type === 'image/png' ? 'png' : 'jpg');
  $('galClose2').onclick = hideItem;
  $('galShare').onclick = async () => { const it = await dbGet(viewId); if (it) share(it); };
  $('galEdit').onclick = async () => { const it = await dbGet(viewId); if (it && WP.editor) { hideItem(); WP.editor.open(it); } };
  $('galDownload').onclick = async () => {
    const it = await dbGet(viewId);
    if (!it) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(it.blob);
    a.download = `watchparty-${new Date(it.ts).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${extOf(it)}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  $('galDelete').onclick = async () => { if (!viewId) return; await dbDel(viewId); hideItem(); render(); };

  function open() { $('gallery').classList.remove('hidden'); newCount = 0; badge(); render(); }
  function close() { hideItem(); $('gallery').classList.add('hidden'); }
  $('galBtn').onclick = open;
  $('galClose').onclick = close;
  document.querySelectorAll('#galFilters [data-f]').forEach((b) => { b.onclick = () => { filter = b.dataset.f; render(); }; });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!viewer.classList.contains('hidden')) hideItem();
    else if (!$('gallery').classList.contains('hidden')) close();
  });

  WP.gallery = { add, update, share, list: dbAll, get: dbGet, del: dbDel, open, close, render };
})();
