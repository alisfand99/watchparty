// Shared namespace: tiny event bus, message routing, local room storage and activity history.
(() => {
  const $ = (id) => document.getElementById(id);
  const bus = {};
  const msgs = {};
  const rnd = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, '');

  const WP = {
    $,
    myId: rnd().slice(0, 12),
    me: { name: 'Guest' },
    roomCode: '',
    peers: new Map(), // id -> { id, pc, dc, name, ... }
    rec: null, // the saved record of the current room
    env: window.wpEnv || null,
    MAX_PEOPLE: 6,
    uid: () => rnd().slice(0, 10),
    on(e, f) { (bus[e] || (bus[e] = [])).push(f); },
    emit(e, ...a) { for (const f of bus[e] || []) { try { f(...a); } catch (err) { console.error(e, err); } } },
    onMsg(t, f) { (msgs[t] || (msgs[t] = [])).push(f); },
    dispatch(entry, m) { for (const f of msgs[m.t] || []) { try { f(entry, m); } catch (err) { console.error(m.t, err); } } },
    fmt(s) {
      s = Math.max(0, Math.floor(s || 0));
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
      return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
    },
  };
  window.WP = WP;

  // ---------- local room storage ----------
  const KEY = 'wp-rooms';
  const norm = (c) => c.trim().toLowerCase();
  const readAll = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const writeAll = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); return true; } catch { return false; } };
  const blank = (key) => ({
    key, created: Date.now(), movie: null, paths: {}, layout: null, view: null,
    draw: { items: [], erased: [], clearedAt: 0 }, activity: [], chat: [],
  });

  WP.rooms = {
    list() { return Object.values(readAll()).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)); },
    forget(key) { const all = readAll(); delete all[key]; writeAll(all); },
    open(code, name) {
      const all = readAll();
      const key = norm(code);
      const r = Object.assign(blank(key), all[key] || {});
      r.code = code.trim();
      r.name = name;
      r.lastSeen = Date.now();
      r.prevSeen = (all[key] && all[key].lastSeen) || 0; // when I was last here before this visit
      WP.rec = r;
      WP.saveNow();
      return r;
    },
  };
  let saveT = 0;
  WP.save = () => { clearTimeout(saveT); saveT = setTimeout(WP.saveNow, 400); };
  WP.saveNow = () => {
    clearTimeout(saveT);
    const r = WP.rec;
    if (!r) return;
    const all = readAll();
    all[r.key] = r;
    if (!writeAll(all)) { // storage full: drop the heaviest, least important parts and retry
      r.chat = r.chat.slice(-40);
      r.activity = r.activity.slice(-100);
      r.draw.items = r.draw.items.slice(-150);
      all[r.key] = r;
      writeAll(all);
    }
  };
  setInterval(() => { if (WP.rec) { WP.rec.lastSeen = Date.now(); WP.emit('persist'); WP.saveNow(); } }, 4000);
  window.addEventListener('pagehide', () => { if (WP.rec) { WP.rec.lastSeen = Date.now(); WP.emit('persist'); WP.saveNow(); } });

  // ---------- activity history (shared between everyone, saved locally) ----------
  function addEntry(e) {
    const r = WP.rec;
    if (!r || !e || !e.id || r.activity.some((x) => x.id === e.id)) return false;
    r.activity.push(e);
    r.activity.sort((a, b) => a.ts - b.ts);
    if (r.activity.length > 400) r.activity.splice(0, r.activity.length - 400);
    WP.save();
    return true;
  }
  // Records something that I did, tells everyone.
  WP.act = (kind, info, vt) => {
    const e = { id: WP.uid(), ts: Date.now(), who: WP.me.name, kind, info: info == null ? '' : info, vt: vt == null ? null : vt };
    if (addEntry(e)) WP.broadcast({ t: 'act', e });
    return e;
  };
  // A fact that every computer notices on its own (someone joined or left): same id everywhere, not sent.
  WP.note = (id, who, kind, info) => addEntry({ id, ts: Date.now(), who, kind, info: info || '', vt: null });
  WP.onMsg('act', (entry, m) => { if (addEntry(m.e)) WP.emit('act', m.e, entry); });
  // When a connection opens, ask for what I missed and offer what I know.
  WP.on('peer-open', (entry) => {
    const since = (WP.rec && WP.rec.prevSeen) || 0;
    WP.sendTo(entry, { t: 'hist', since });
  });
  WP.onMsg('hist', (entry, m) => {
    const list = WP.rec.activity.filter((e) => e.ts > (m.since || 0)).slice(-200);
    if (list.length) WP.sendTo(entry, { t: 'hist-r', list });
  });
  WP.onMsg('hist-r', (entry, m) => {
    const fresh = (m.list || []).filter((e) => addEntry(e));
    if (fresh.length) WP.emit('hist-new', fresh);
  });
})();
