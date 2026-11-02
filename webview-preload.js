// Runs inside every page of the shared browser. Reports what the person does and replays what others did.
const { ipcRenderer } = require('electron');

let applyUntil = 0; // while replaying something from another person, do not report it back
const applying = () => Date.now() < applyUntil;
const send = (m) => { try { ipcRenderer.sendToHost('wp', m); } catch {} };
const SENSITIVE = /pass|card|cvv|cvc|ssn|secret|token|otp|pin/i;

function pathOf(el) {
  if (!el || el.nodeType !== 1) return null;
  const parts = [];
  while (el && el.nodeType === 1 && el !== document.documentElement && parts.length < 14) {
    if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) { parts.unshift('#' + CSS.escape(el.id)); break; }
    let n = 1, s = el;
    while ((s = s.previousElementSibling)) if (s.tagName === el.tagName) n++;
    parts.unshift(el.tagName.toLowerCase() + ':nth-of-type(' + n + ')');
    el = el.parentElement;
  }
  return parts.join('>');
}
const byPath = (p) => { try { return p ? document.querySelector(p) : null; } catch { return null; } };
const isSecret = (el) => el && (el.type === 'password' || SENSITIVE.test((el.name || '') + ' ' + (el.id || '') + ' ' + (el.autocomplete || '')));

// ----- scrolling -----
let scrollT = 0;
addEventListener('scroll', () => {
  if (applying() || scrollT) return;
  scrollT = setTimeout(() => {
    scrollT = 0;
    const de = document.documentElement;
    const mx = Math.max(1, de.scrollWidth - innerWidth), my = Math.max(1, de.scrollHeight - innerHeight);
    send({ k: 'scroll', fx: scrollX / mx, fy: scrollY / my });
  }, 120);
}, { passive: true, capture: true });

// ----- clicks and typing -----
addEventListener('click', (e) => {
  if (!e.isTrusted) return; // replayed events are not trusted, so they never echo
  const t = e.target;
  if (!(t instanceof Element)) return;
  if (t.closest('video, .html5-video-player')) return; // the video itself is synced separately
  const a = t.closest('a[href]');
  if (a && !/^(#|javascript:)/i.test(a.getAttribute('href') || '')) return; // moving to another page is synced by address
  const el = t.closest('button,input,select,textarea,label,summary,[role=button],[role=tab],[role=menuitem],[onclick],[tabindex]') || t;
  if (isSecret(el)) return;
  send({ k: 'click', path: pathOf(el), fx: e.clientX / innerWidth, fy: e.clientY / innerHeight });
}, true);
addEventListener('input', (e) => {
  if (!e.isTrusted) return; // replayed events are not trusted, so they never echo
  const t = e.target;
  if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) || isSecret(t)) return;
  send({ k: 'input', path: pathOf(t), value: t.value });
}, true);
addEventListener('keydown', (e) => {
  if (!e.isTrusted || e.key !== 'Enter') return;
  const t = e.target;
  if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) || isSecret(t)) return;
  send({ k: 'enter', path: pathOf(t) });
}, true);

// ----- page video (YouTube and others) -----
const seen = new WeakSet();
let expect = { until: 0, set: new Set() };
function hookVideo(v) {
  if (seen.has(v)) return;
  seen.add(v);
  const rep = (a) => {
    if (expect.until > Date.now() && expect.set.has(a)) return; // this is the page obeying someone else
    send({ k: 'vid', a, t: v.currentTime, r: v.playbackRate });
  };
  v.addEventListener('play', () => rep('play'));
  v.addEventListener('pause', () => { if (!v.ended) rep('pause'); });
  v.addEventListener('seeked', () => rep('seek'));
  v.addEventListener('ratechange', () => rep('rate'));
}
const mainVideo = () => {
  let best = null, area = 0;
  for (const v of document.querySelectorAll('video')) { const a = v.clientWidth * v.clientHeight; if (a >= area) { best = v; area = a; } }
  return best;
};
setInterval(() => { for (const v of document.querySelectorAll('video')) hookVideo(v); }, 800);

// ----- replaying what other people did -----
ipcRenderer.on('wp-cmd', (_e, m) => {
  try {
    if (m.k === 'scroll') {
      applyUntil = Date.now() + 450;
      const de = document.documentElement;
      scrollTo(m.fx * Math.max(0, de.scrollWidth - innerWidth), m.fy * Math.max(0, de.scrollHeight - innerHeight));
    } else if (m.k === 'click') {
      let el = byPath(m.path);
      if (!el) el = document.elementFromPoint(m.fx * innerWidth, m.fy * innerHeight);
      if (!el) return;
      applyUntil = Date.now() + 80; // these events are not trusted, so they are ignored anyway
      const r = el.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
      if (el.focus) el.focus({ preventScroll: true });
      for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) el.dispatchEvent(new MouseEvent(t, o));
      el.click();
    } else if (m.k === 'input') {
      const el = byPath(m.path);
      if (!el || isSecret(el)) return;
      applyUntil = Date.now() + 80;
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(m.value));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (m.k === 'enter') {
      const el = byPath(m.path);
      if (!el) return;
      applyUntil = Date.now() + 80;
      for (const t of ['keydown', 'keypress', 'keyup']) el.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      if (el.form && el.form.requestSubmit) { try { el.form.requestSubmit(); } catch {} }
    } else if (m.k === 'vid') {
      const v = mainVideo();
      if (!v) return;
      expect = { until: Date.now() + 900, set: new Set(['seek', 'rate', m.a === 'pause' ? 'pause' : 'play']) };
      if (m.r && v.playbackRate !== m.r) v.playbackRate = m.r;
      if (m.t >= 0 && Math.abs(v.currentTime - m.t) > 0.8) v.currentTime = m.t;
      if (m.a === 'play') v.play().catch(() => {});
      else if (m.a === 'pause') v.pause();
    }
  } catch {}
});
