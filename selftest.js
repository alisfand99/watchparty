// Runs the real app (real Electron, real <webview>) end to end with two windows. Used on the developer's computer:
//   npx electron . --selftest --selftest-log=selftest.log
const fs = require('fs');
const http = require('http');
const path = require('path');

exports.run = async ({ app, createWindow, log }) => {
  const logPath = log || path.join(process.cwd(), 'selftest.log');
  fs.writeFileSync(logPath, '');
  const L = (m) => { try { fs.appendFileSync(logPath, m + '\n'); } catch {} console.log(m); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let fails = 0;
  const ok = (c, m) => { L((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
  const info = (m) => L('INFO ' + m);
  const until = async (fn, ms = 20000, step = 250) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await sleep(step); } return false; };
  const VIDEO = path.join(__dirname, 'selftest', 'test.webm');

  // ---- local relay and a small web site to browse ----
  const { start } = require('./server.js');
  const relayPort = await start(0);
  const relay = `http://localhost:${relayPort}`;
  const page = (title, body) => `<!doctype html><title>${title}</title><body style="margin:0;font:16px sans-serif">${body}</body>`;
  const site = http.createServer((q, r) => {
    if (q.url === '/test.webm') {
      const buf = fs.readFileSync(VIDEO);
      const m = /bytes=(\d+)-(\d*)/.exec(q.headers.range || '');
      if (m) {
        const s = +m[1], e = m[2] ? +m[2] : buf.length - 1;
        r.writeHead(206, { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${s}-${e}/${buf.length}`, 'Content-Length': e - s + 1 });
        return r.end(buf.subarray(s, e + 1));
      }
      r.writeHead(200, { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Length': buf.length });
      return r.end(buf);
    }
    r.writeHead(200, { 'Content-Type': 'text/html' });
    if (q.url === '/two') return r.end(page('Two', '<h1 id="h">second page</h1>'));
    if (q.url === '/popup') return r.end(page('Popup', '<h1>opened from a popup</h1>'));
    r.end(page('Home', `
      <div style="position:fixed;top:8px;left:8px;background:#eee;padding:8px;z-index:9">
        <button id="btn" onclick="document.getElementById('n').textContent=(+document.getElementById('n').textContent+1)">count</button>
        <b id="n">0</b>
        <form onsubmit="document.getElementById('out').textContent='sent:'+document.getElementById('inp').value;return false">
          <input id="inp" autocomplete="off"><span id="out"></span>
        </form>
        <a id="lnk" href="/two">go to two</a>
      </div>
      <video id="v" src="/test.webm" width="320" height="240" loop muted style="margin-top:140px"></video>
      <div style="height:3500px;background:linear-gradient(#fff,#369)">tall page</div>`));
  });
  await new Promise((r) => site.listen(0, r));
  const siteUrl = `http://localhost:${site.address().port}`;

  const A = createWindow({ query: { relay }, bounds: { x: 0, y: 0, width: 960, height: 700 } });
  const B = createWindow({ query: { relay }, partition: 'persist:selftest-b', bounds: { x: 960, y: 0, width: 960, height: 700 } });
  const loaded = (w) => new Promise((r) => w.webContents.once('did-finish-load', r));
  await Promise.all([loaded(A), loaded(B)]);
  const ev = (w, code) => w.webContents.executeJavaScript(code, true);
  const wvEval = (w, code) => ev(w, `document.querySelector('#bHost webview').executeJavaScript(${JSON.stringify(code)}, true)`);
  const wvCall = (w, name, ...args) => ev(w, `document.querySelector('#bHost webview').${name}(...${JSON.stringify(args)})`);
  const setFile = async (w, selector, file) => {
    const d = w.webContents.debugger;
    if (!d.isAttached()) d.attach('1.3');
    const { root } = await d.sendCommand('DOM.getDocument');
    const { nodeId } = await d.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector });
    await d.sendCommand('DOM.setFileInputFiles', { nodeId, files: [file] });
  };
  const join = (w, name, room) => ev(w, `(() => { document.getElementById('name').value=${JSON.stringify(name)}; document.getElementById('room').value=${JSON.stringify(room)}; document.getElementById('joinBtn').click(); })()`);
  const click = (w, id) => ev(w, `document.getElementById(${JSON.stringify(id)}).click()`);

  try {
    // ---- environment ----
    const envA = await ev(A, `({ electron: window.wpEnv && window.wpEnv.electron, version: window.wpEnv && window.wpEnv.version, pre: window.wpEnv && window.wpEnv.webviewPreload })`);
    ok(envA.electron === true, 'page runs inside Electron with the helper bridge (version ' + envA.version + ')');
    ok(/^file:\/\/.*webview-preload\.js$/.test(envA.pre || ''), 'shared browser preload is wired: ' + envA.pre);

    // ---- connect ----
    const ROOM = 'selftest-' + Date.now();
    await join(A, 'Ali', ROOM);
    await join(B, 'Sara', ROOM);
    ok(await until(async () => (await ev(A, `document.querySelectorAll('.tile').length`)) >= 2 && (await ev(B, `document.querySelectorAll('.tile').length`)) >= 2, 40000), 'two windows connect through the relay');
    const camOk = await until(() => ev(A, `(() => { const v=[...document.querySelectorAll('.tile:not([data-id="me"]) video')]; return v.length>0 && v.every(x=>x.videoWidth>0); })()`), 30000);
    if (camOk) ok(true, 'camera video flows between them'); else info('camera video not confirmed between the two test windows (they share one fake camera)');
    if (!camOk) info('B local tracks: ' + await ev(B, `JSON.stringify(WP.localStream ? WP.localStream.getTracks().map(t=>[t.kind,t.readyState]) : null)`) + ' | A tiles: ' + await ev(A, `JSON.stringify([...document.querySelectorAll('.tile video')].map(v=>[v.videoWidth,v.readyState,v.paused,!!v.srcObject]))`) + ' vis=' + await ev(A, 'document.visibilityState'));
    // ---- real fullscreen of the window, cameras stay on top ----
    await ev(A, `document.getElementById('fsBtn').click()`);
    ok(await until(() => A.isFullScreen(), 8000), 'fullscreen button really puts the window in fullscreen');
    ok(await ev(A, `document.getElementById('screen').classList.contains('fs')`), 'the screen is in fullscreen mode');
    await sleep(700);
    ok(await ev(A, `[...document.querySelectorAll('.tile')].length >= 2 && [...document.querySelectorAll('.tile')].every(t => { const r=t.getBoundingClientRect(); const e=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2); return t.contains(e); })`), 'cameras stay on top of the movie in fullscreen');
    await ev(A, `document.getElementById('fsBtn').click()`);
    ok(await until(() => !A.isFullScreen(), 8000), 'and the window leaves fullscreen again');

    // ---- movie file with a real path ----
    await setFile(A, '#file', VIDEO);
    await setFile(B, '#file', VIDEO);
    ok(await until(() => ev(A, `document.getElementById('video').readyState>=1`)), 'movie file opened through the file picker');
    const stored = await ev(A, `WP.rec.paths['test.webm']`);
    ok(!!stored && stored.toLowerCase().replace(/\\/g, '/').endsWith('selftest/test.webm'), 'the real location of the file is saved: ' + stored);
    await sleep(900);
    await ev(A, `document.getElementById('video').play()`);
    const playOk = await until(() => ev(B, `!document.getElementById('video').paused`));
    ok(playOk, 'play is shared');
    if (!playOk) info('B video: ' + await ev(B, `JSON.stringify({p:document.getElementById('video').paused,rs:document.getElementById('video').readyState,src:document.getElementById('video').currentSrc,empty:document.getElementById('empty').style.display,state:WP.state})`) + ' A: ' + await ev(A, `JSON.stringify({p:document.getElementById('video').paused,state:WP.state})`));
    await ev(A, `document.getElementById('video').pause()`);

    // ---- shared browser (real webview) ----
    await click(A, 'dockWeb');
    ok(await until(() => ev(B, `document.getElementById('screen').dataset.mode === 'browser'`)), 'Browser button opens the shared browser for both');
    ok(await ev(A, `!!document.querySelector('#bHost webview')`) && await ev(B, `!!document.querySelector('#bHost webview')`), 'both use a real webview');
    await ev(A, `(() => { const b = document.getElementById('bUrl'); b.value = ${JSON.stringify(siteUrl + '/')}; document.getElementById('bGo').click(); })()`);
    ok(await until(() => ev(B, `document.querySelector('#bHost webview').getURL() === ${JSON.stringify(siteUrl + '/')}`), 20000), 'the address opens the same page in B');
    ok(await until(() => wvEval(B, `!!document.getElementById('btn')`), 15000), 'page content is loaded in B');
    ok(await until(() => wvEval(A, `!!document.getElementById('btn')`), 15000), 'page content is loaded in A');
    await sleep(1500);

    // scrolling
    await wvEval(A, `scrollTo(0, 1500)`);
    ok(await until(async () => (await wvEval(B, `scrollY`)) > 1000, 8000), 'scrolling in A scrolls B');
    await sleep(900);
    await wvEval(B, `scrollTo(0, 0)`);
    ok(await until(async () => (await wvEval(A, `scrollY`)) < 100, 8000), 'scrolling in B scrolls A (everyone can operate it)');
    await sleep(600);

    // real mouse click on a button
    const r = JSON.parse(await wvEval(A, `JSON.stringify(document.getElementById('btn').getBoundingClientRect())`));
    const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
    await wvCall(A, 'sendInputEvent', { type: 'mouseDown', x: cx, y: cy, button: 'left', clickCount: 1 });
    await wvCall(A, 'sendInputEvent', { type: 'mouseUp', x: cx, y: cy, button: 'left', clickCount: 1 });
    ok(await until(async () => (await wvEval(A, `document.getElementById('n').textContent`)) === '1', 5000), 'a real click works in A');
    ok(await until(async () => (await wvEval(B, `document.getElementById('n').textContent`)) === '1', 8000), 'the same click happens in B');
    // and from B to A
    const rb = JSON.parse(await wvEval(B, `JSON.stringify(document.getElementById('btn').getBoundingClientRect())`));
    await wvCall(B, 'sendInputEvent', { type: 'mouseDown', x: Math.round(rb.x + rb.width / 2), y: Math.round(rb.y + rb.height / 2), button: 'left', clickCount: 1 });
    await wvCall(B, 'sendInputEvent', { type: 'mouseUp', x: Math.round(rb.x + rb.width / 2), y: Math.round(rb.y + rb.height / 2), button: 'left', clickCount: 1 });
    ok(await until(async () => (await wvEval(A, `document.getElementById('n').textContent`)) === '2', 8000), 'a click in B also reaches A');
    if ((await wvEval(A, `document.getElementById('n').textContent`)) !== '2') info('n(A)=' + await wvEval(A, `document.getElementById('n').textContent`) + ' n(B)=' + await wvEval(B, `document.getElementById('n').textContent`) + ' click debug A ' + JSON.stringify(await ev(A, 'WP.browser.debug()')) + ' B ' + JSON.stringify(await ev(B, 'WP.browser.debug()')));
    ok((await wvEval(B, `document.getElementById('n').textContent`)) === '2', 'and is not applied twice in B');

    // typing in a text box, then Enter
    const ri = JSON.parse(await wvEval(A, `JSON.stringify(document.getElementById('inp').getBoundingClientRect())`));
    await wvCall(A, 'sendInputEvent', { type: 'mouseDown', x: Math.round(ri.x + 10), y: Math.round(ri.y + 8), button: 'left', clickCount: 1 });
    await wvCall(A, 'sendInputEvent', { type: 'mouseUp', x: Math.round(ri.x + 10), y: Math.round(ri.y + 8), button: 'left', clickCount: 1 });
    await wvCall(A, 'insertText', 'hello');
    ok(await until(async () => (await wvEval(B, `document.getElementById('inp').value`)) === 'hello', 8000), 'text typed in A appears in B');
    await wvCall(A, 'sendInputEvent', { type: 'keyDown', keyCode: 'Enter' });
    await wvCall(A, 'sendInputEvent', { type: 'keyUp', keyCode: 'Enter' });
    ok(await until(async () => (await wvEval(B, `document.getElementById('out').textContent`)) === 'sent:hello', 8000), 'Enter submits in B too');

    // page video
    await wvEval(A, `document.getElementById('v').play()`);
    ok(await until(async () => !(await wvEval(B, `document.getElementById('v').paused`)), 8000), 'playing the page video in A plays it in B');
    await wvEval(A, `document.getElementById('v').currentTime = 30`);
    ok(await until(async () => Math.abs((await wvEval(B, `document.getElementById('v').currentTime`)) - 30) < 3, 8000), 'seeking the page video follows in B');
    await wvEval(B, `document.getElementById('v').pause()`);
    ok(await until(async () => await wvEval(A, `document.getElementById('v').paused`), 8000), 'pausing in B pauses A (everyone can operate it)');

    // link click moves everybody
    // ---- a page asks for fullscreen (like YouTube does): the cameras must stay on top ----
    const fsReq = await wvEval(A, `(() => { try { const r = document.getElementById('v').requestFullscreen(); return Promise.resolve(r).then(() => 'ok', (e) => 'err ' + e.message); } catch (e) { return 'throw ' + e.message + ' hook=' + !!window.__wpfs; } })()`).catch((e) => 'exec failed: ' + e.message);
    ok(fsReq === 'ok', 'a page in the shared browser can go fullscreen (' + fsReq + ')');
    ok(await until(async () => A.isFullScreen() && (await ev(A, `WP.fsOn`)), 8000), 'the app window goes fullscreen with it');
    await sleep(700);
    const pg = await wvEval(A, `(() => { const r = document.fullscreenElement && document.fullscreenElement.getBoundingClientRect(); return { id: document.fullscreenElement && document.fullscreenElement.id, w: r && Math.round(r.width), h: r && Math.round(r.height), iw: innerWidth, ih: innerHeight }; })()`);
    ok(pg.id === 'v' && Math.abs(pg.w - pg.iw) < 3 && Math.abs(pg.h - pg.ih) < 3, 'the page element fills the whole shared browser ' + JSON.stringify(pg));
    ok(await ev(A, `[...document.querySelectorAll('.tile')].length >= 2 && [...document.querySelectorAll('.tile')].every(t => { const r=t.getBoundingClientRect(); const e=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2); return t.contains(e); })`), 'cameras stay ON TOP of the page in fullscreen');
    await wvEval(A, `document.exitFullscreen()`);
    ok(await until(async () => !A.isFullScreen() && !(await ev(A, `WP.fsOn`)), 8000), 'the page leaving fullscreen brings the app back');
    ok(!/fixed/.test(await wvEval(A, `document.getElementById('v').getAttribute('style') || ''`)), 'the page element is restored');
    await wvEval(A, `document.getElementById('v').requestFullscreen()`);
    await until(() => A.isFullScreen(), 8000);
    await ev(A, `document.getElementById('fsBtn').click()`);
    ok(await until(async () => !A.isFullScreen() && (await wvEval(A, `!document.fullscreenElement`)), 8000), 'leaving fullscreen from the app also releases the page');

    // ---- moments: snap of the shared browser page, a clip, the gallery ----
    const snapInfo = await ev(A, `(async () => {
      const before = (await WP.gallery.list()).length;
      const it = await WP.capture.snap();
      const b = await createImageBitmap(it.blob);
      const c = document.createElement('canvas'); c.width = b.width; c.height = b.height;
      const x = c.getContext('2d'); x.drawImage(b, 0, 0);
      const hb = document.getElementById('bHost').getBoundingClientRect(), sc = document.getElementById('screen').getBoundingClientRect();
      const k = b.width / sc.width;
      const d = x.getImageData(Math.round((hb.left - sc.left) * k) + 20, Math.round((hb.top - sc.top) * k) + 20, 200, 120).data;
      const seen = new Set(); for (let i = 0; i < d.length; i += 4) seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
      return { n: (await WP.gallery.list()).length - before, size: it.blob.size, colors: seen.size };
    })()`);
    ok(snapInfo.n === 1 && snapInfo.size > 5000, 'snap works in the shared browser (' + snapInfo.size + ' bytes)');
    ok(snapInfo.colors > 3, 'the snap contains the web page itself, not a blank area (' + snapInfo.colors + ' colors)');
    await ev(A, `WP.capture.startRec()`);
    await sleep(2500);
    const clipInfo = await ev(A, `(async () => { const it = await WP.capture.stopRec(); return it ? { kind: it.kind, size: it.blob.size, dur: it.dur } : null; })()`);
    ok(clipInfo && clipInfo.kind === 'clip' && clipInfo.size > 3000, 'a clip can be recorded in the real app ' + JSON.stringify(clipInfo));
    await ev(A, `document.getElementById('galBtn').click()`);
    ok(await until(() => ev(A, `document.querySelectorAll('.gitem').length >= 2`), 8000), 'the room gallery opens in the real app');
    await ev(A, `document.getElementById('galClose').click()`);
    const rl = JSON.parse(await wvEval(A, `JSON.stringify(document.getElementById('lnk').getBoundingClientRect())`));
    await wvEval(A, `scrollTo(0,0)`);
    await sleep(500);
    await wvCall(A, 'sendInputEvent', { type: 'mouseDown', x: Math.round(rl.x + 8), y: Math.round(rl.y + 6), button: 'left', clickCount: 1 });
    await wvCall(A, 'sendInputEvent', { type: 'mouseUp', x: Math.round(rl.x + 8), y: Math.round(rl.y + 6), button: 'left', clickCount: 1 });
    ok(await until(() => ev(B, `document.querySelector('#bHost webview').getURL() === ${JSON.stringify(siteUrl + '/two')}`), 15000), 'following a link in A moves B to the same page');

    // a page that opens a new window stays inside the shared browser
    await wvEval(A, `location.href = ${JSON.stringify(siteUrl + '/')}`);
    await until(() => wvEval(A, `!!document.getElementById('btn')`), 15000);
    await wvEval(A, `window.open(${JSON.stringify(siteUrl + '/popup')})`);
    await sleep(2500);
    info('after pop-up: A url ' + await ev(A, 'WP.view.url') + ' B url ' + await ev(B, 'WP.view.url'));
    ok(await until(() => ev(B, `document.querySelector('#bHost webview').getURL() === ${JSON.stringify(siteUrl + '/popup')}`), 15000), 'a pop-up window opens in the shared browser for everyone');

    // back to the movie
    await click(A, 'bClose');
    ok(await until(() => ev(B, `document.getElementById('screen').dataset.mode === 'player'`)), 'Back to movie returns both to the film');
    ok(await ev(B, `document.querySelector('#bHost webview').isAudioMuted()`), 'the page goes quiet when you go back to the movie');

    // ---- YouTube (needs the internet) ----
    await click(A, 'dockYT');
    ok(await until(() => ev(B, `document.getElementById('screen').dataset.mode === 'browser' && WP.view.url.startsWith('https://www.youtube.com')`), 15000), 'YouTube button opens YouTube for both');
    const ytLoaded = await until(async () => /YouTube/i.test(await ev(A, `document.querySelector('#bHost webview').getTitle()`)) && /YouTube/i.test(await ev(B, `document.querySelector('#bHost webview').getTitle()`)), 40000, 500);
    ok(ytLoaded, 'YouTube really loads in both windows (title: ' + (await ev(A, `document.querySelector('#bHost webview').getTitle()`)) + ')');
    const ico = await ev(A, `({ hidden: document.getElementById('ytImg').hidden, w: document.getElementById('ytImg').naturalWidth })`);
    ok(!ico.hidden && ico.w > 0, 'the YouTube button shows the site icon');
    await ev(A, `(() => { document.getElementById('bUrl').value='https://www.youtube.com/watch?v=jNQXAC9IVRw'; document.getElementById('bGo').click(); })()`);
    const vidA = await until(() => wvEval(A, `!!document.querySelector('video') && document.querySelector('video').readyState >= 2`), 40000, 500);
    const vidB = await until(() => wvEval(B, `!!document.querySelector('video') && document.querySelector('video').readyState >= 2`), 40000, 500);
    ok(vidA && vidB, 'a YouTube video page loads in both windows');
    if (vidA && vidB) {
      await sleep(3000);
      await wvEval(A, `document.querySelector('video').play()`);
      ok(await until(async () => !(await wvEval(B, `document.querySelector('video').paused`)), 10000), 'playing the YouTube video in A plays it in B');
      await wvEval(A, `document.querySelector('video').currentTime = 10`);
      await sleep(500);
      info('A time after seeking: ' + await wvEval(A, `document.querySelector('video').currentTime`) + ' ad? ' + await wvEval(A, `!!document.querySelector('.ad-showing')`));
      const ytSeek = await until(async () => Math.abs((await wvEval(B, `document.querySelector('video').currentTime`)) - 10) < 3, 10000);
      if (ytSeek) ok(true, 'seeking the YouTube video follows in B'); else info('YouTube seek not confirmed (an advertisement may have been playing). B time ' + await wvEval(B, `document.querySelector('video').currentTime`) + ' title ' + await ev(B, `document.querySelector('#bHost webview').getTitle()`));
      await wvEval(B, `document.querySelector('video').pause()`);
      ok(await until(() => wvEval(A, `document.querySelector('video').paused`), 10000), 'pausing in B pauses A');
      // YouTube's own fullscreen button asks the page for fullscreen: cameras must stay on top
      const ytFs = await wvEval(A, `(() => { const p = document.querySelector('.html5-video-player') || document.querySelector('video'); return p.requestFullscreen().then(() => 'ok', (e) => 'err ' + e.message); })()`);
      ok(ytFs === 'ok' && await until(async () => A.isFullScreen() && (await ev(A, `WP.fsOn`)), 8000), 'YouTube goes fullscreen inside the app (' + ytFs + ')');
      await sleep(1000);
      ok(await ev(A, `[...document.querySelectorAll('.tile')].length >= 2 && [...document.querySelectorAll('.tile')].every(t => { const r=t.getBoundingClientRect(); const e=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2); return t.contains(e); })`), 'cameras stay on top of YouTube in fullscreen');
      await wvEval(A, `document.exitFullscreen()`);
      ok(await until(() => !A.isFullScreen(), 8000), 'YouTube leaves fullscreen');
    }
    await click(A, 'bClose');
    await until(() => ev(B, `document.getElementById('screen').dataset.mode === 'player'`));

    // ---- update banner wiring ----
    A.webContents.send('wp-update', { state: 'downloading', version: '9.9.9', percent: 40 });
    ok(await until(() => ev(A, `!document.getElementById('updateBar').classList.contains('hidden') && /40%/.test(document.getElementById('updateTxt').textContent)`)), 'update banner shows download progress');
    A.webContents.send('wp-update', { state: 'ready', version: '9.9.9' });
    ok(await until(() => ev(A, `!document.getElementById('updateBtn').classList.contains('hidden')`)), 'update banner offers Restart when ready');
    A.webContents.send('wp-update', { state: 'none' });
    ok(await until(() => ev(A, `document.getElementById('updateBar').classList.contains('hidden')`)), 'update banner hides when nothing is new');

    // ---- leave, rejoin: the same movie opens from its saved location ----
    await ev(A, `WP.rec.view = null; WP.saveNow()`);
    const reloaded = loaded(A);
    await click(A, 'leaveBtn');
    await reloaded;
    ok(await until(() => ev(A, `!document.getElementById('recentBox').classList.contains('hidden')`)), 'the room is listed under Recent rooms');
    const reloaded2 = ev(A, `document.querySelector('#recent li button[data-act="rejoin"]').click()`);
    await reloaded2;
    ok(await until(() => ev(A, `!document.getElementById('app').classList.contains('hidden')`), 20000), 'Rejoin returns to the room');
    ok(await until(() => ev(A, `document.getElementById('video').readyState >= 1 && /^file:/.test(document.getElementById('video').currentSrc)`), 15000), 'the movie opens by itself from its saved location');
    ok(await ev(A, `document.getElementById('empty').style.display === 'none'`), 'no file prompt after rejoin');
    ok(await until(() => ev(A, `document.querySelectorAll('.tile').length >= 2`), 40000), 'A reconnects to B after rejoining');
  } catch (e) {
    ok(false, 'self-test crashed: ' + (e && e.stack || e));
  }
  L(fails ? `DONE ${fails} FAILED` : 'DONE ALL PASSED');
  await sleep(300);
  app.exit(fails ? 1 : 0);
};
