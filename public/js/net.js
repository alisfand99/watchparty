// Encrypted introductions through a public relay, then direct WebRTC connections between everyone.
(() => {
  const RELAY = (() => {
    try { return (new URLSearchParams(location.search).get('relay') || localStorage.getItem('wp-relay') || 'https://ntfy.sh').replace(/\/+$/, ''); }
    catch { return 'https://ntfy.sh'; }
  })();
  const ICE = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
  };
  const myId = WP.myId;
  let keys = null;
  let es = null;
  let byeText = '';

  // ---------- encryption (key derived from the room code) ----------
  const enc = new TextEncoder();
  const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); };
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function deriveKeys(code) {
    const norm = code.trim().toLowerCase();
    const base = await crypto.subtle.importKey('raw', enc.encode(norm), 'PBKDF2', false, ['deriveKey', 'deriveBits']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode('watchparty-v1-key'), iterations: 100000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode('watchparty-v1-topic'), iterations: 100000, hash: 'SHA-256' }, base, 160);
    const topic = 'wp' + [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return { key, topic };
  }
  async function gzip(str) {
    const s = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function gunzip(bytes) {
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(s).text();
  }
  async function seal(obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keys.key, await gzip(JSON.stringify(obj))));
    const out = new Uint8Array(12 + ct.length);
    out.set(iv);
    out.set(ct, 12);
    return toB64(out);
  }
  async function unseal(text) {
    try {
      const raw = fromB64(text);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, keys.key, raw.slice(12));
      return JSON.parse(await gunzip(new Uint8Array(pt)));
    } catch { return null; }
  }

  // ---------- signaling through the relay ----------
  function startSignaling() {
    return new Promise((resolve, reject) => {
      let opened = false;
      const timer = setTimeout(() => { if (!opened) { try { es.close(); } catch {} reject(new Error('timeout')); } }, 12000);
      es = new EventSource(`${RELAY}/${keys.topic}/sse`);
      es.addEventListener('open', () => { if (!opened) { opened = true; clearTimeout(timer); resolve(); } });
      es.onmessage = async (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (!m || (m.event && m.event !== 'message') || typeof m.message !== 'string') return;
        const msg = await unseal(m.message);
        if (msg && msg.from && msg.from !== myId) onSig(msg).catch(() => {});
      };
    });
  }
  async function pub(obj) {
    try {
      const body = await seal(obj);
      if (body.length > 3900) WP.say('Connection message too large.', 'sys');
      await fetch(`${RELAY}/${keys.topic}`, { method: 'POST', body });
    } catch (e) { /* relay hiccup, peers retry on next event */ }
  }

  async function onSig(m) {
    if (m.to && m.to !== myId) return;
    switch (m.t) {
      case 'hello':
        if (!WP.peers.has(m.from) && WP.peers.size >= WP.MAX_PEOPLE - 1) { pub({ t: 'full', from: myId, to: m.from }); break; }
        ensurePeer(m.from, m.name);
        pub({ t: 'here', from: myId, to: m.from, name: WP.me.name });
        break;
      case 'here': ensurePeer(m.from, m.name); break;
      case 'offer':
        if (!WP.peers.has(m.from) && WP.peers.size >= WP.MAX_PEOPLE - 1) { pub({ t: 'full', from: myId, to: m.from }); break; }
        await onOffer(m); break;
      case 'full':
        if (!WP.peers.size) { WP.emit('room-full'); }
        break;
      case 'answer': await onAnswer(m); break;
      case 'bye': removePeer(m.from); break;
    }
  }

  // ---------- peers (WebRTC mesh) ----------
  function gathered(pc) {
    return new Promise((res) => {
      if (pc.iceGatheringState === 'complete') return res();
      const chk = () => { if (pc.iceGatheringState === 'complete') done(); };
      const done = () => { pc.removeEventListener('icegatheringstatechange', chk); res(); };
      pc.addEventListener('icegatheringstatechange', chk);
      setTimeout(done, 4000);
    });
  }

  function makePeer(id, name) {
    const pc = new RTCPeerConnection(ICE);
    const entry = { id, pc, dc: null, name: name || 'Guest', started: false, timer: 0, announced: false };
    WP.peers.set(id, entry);
    if (WP.localStream) WP.localStream.getTracks().forEach((t) => pc.addTrack(t, WP.localStream));
    WP.emit('peer-add', entry);
    pc.ontrack = (e) => WP.emit('peer-stream', entry, e.streams[0] || new MediaStream([e.track]));
    pc.ondatachannel = (e) => setupChannel(entry, e.channel);
    pc.onconnectionstatechange = () => {
      clearTimeout(entry.timer);
      const st = pc.connectionState;
      if (st === 'failed') { WP.say(`Could not connect to ${entry.name}.`, 'sys'); removePeer(id, true); }
      else if (st === 'closed') removePeer(id, true);
      else if (st === 'disconnected') entry.timer = setTimeout(() => removePeer(id), 8000);
    };
    return entry;
  }

  function ensurePeer(id, name) {
    let entry = WP.peers.get(id);
    if (entry) { if (name) setPeerName(entry, name); return entry; }
    entry = makePeer(id, name);
    if (myId < id) startOffer(entry); // the smaller id always makes the offer, so offers never collide
    return entry;
  }
  function setPeerName(entry, name) {
    if (entry.name === name) return;
    entry.name = name;
    WP.emit('peer-name', entry);
  }

  async function startOffer(entry) {
    if (entry.started) return;
    entry.started = true;
    try {
      setupChannel(entry, entry.pc.createDataChannel('wp'));
      await entry.pc.setLocalDescription(await entry.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true }));
      await gathered(entry.pc);
      pub({ t: 'offer', from: myId, to: entry.id, name: WP.me.name, sdp: entry.pc.localDescription.sdp });
    } catch (e) { entry.started = false; }
  }
  async function onOffer(m) {
    const entry = WP.peers.get(m.from) || makePeer(m.from, m.name);
    if (m.name) setPeerName(entry, m.name);
    try {
      await entry.pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
      await entry.pc.setLocalDescription(await entry.pc.createAnswer());
      await gathered(entry.pc);
      pub({ t: 'answer', from: myId, to: m.from, sdp: entry.pc.localDescription.sdp });
    } catch (e) { /* duplicate or out of order offer */ }
  }
  async function onAnswer(m) {
    const entry = WP.peers.get(m.from);
    if (!entry || entry.pc.signalingState !== 'have-local-offer') return;
    try { await entry.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }); } catch (e) { /* ignore */ }
  }

  function setupChannel(entry, dc) {
    entry.dc = dc;
    dc.onopen = () => {
      if (!entry.announced) {
        entry.announced = true;
        WP.say(`${entry.name} joined.`, 'sys');
        WP.note('j-' + entry.id, entry.name, 'join');
      }
      dc.send(JSON.stringify({ t: 'req-state' }));
      WP.emit('peer-open', entry);
    };
    dc.onmessage = (e) => { try { WP.dispatch(entry, JSON.parse(e.data)); } catch (err) { console.error(err); } };
    dc.onclose = () => removePeer(entry.id);
  }
  WP.sendTo = (entry, obj) => { if (entry.dc && entry.dc.readyState === 'open') entry.dc.send(JSON.stringify(obj)); };
  WP.broadcast = (obj) => {
    const s = JSON.stringify(obj);
    for (const p of WP.peers.values()) if (p.dc && p.dc.readyState === 'open') p.dc.send(s);
  };

  function removePeer(id, silent) {
    const entry = WP.peers.get(id);
    if (!entry) return;
    WP.peers.delete(id);
    clearTimeout(entry.timer);
    if (entry.announced && !silent) { WP.say(`${entry.name} left.`, 'sys'); WP.note('l-' + entry.id, entry.name, 'leave'); }
    try { entry.pc.close(); } catch {}
    WP.emit('peer-remove', entry);
  }

  // ---------- joining ----------
  // Resolves when the relay is reachable. Throws if it is not.
  WP.connect = async (room) => {
    keys = await deriveKeys(room);
    try { await startSignaling(); }
    catch (e) { if (es) es.close(); throw e; }
    byeText = await seal({ t: 'bye', from: myId });
    window.addEventListener('pagehide', () => { try { navigator.sendBeacon(`${RELAY}/${keys.topic}`, byeText); } catch {} });
    WP.hello = () => pub({ t: 'hello', from: myId, name: WP.me.name });
  };
  WP.stopNet = () => {
    if (es) es.close();
    try { navigator.sendBeacon(`${RELAY}/${keys.topic}`, byeText); } catch {}
    for (const id of [...WP.peers.keys()]) removePeer(id, true);
  };
})();
