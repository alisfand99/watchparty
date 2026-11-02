// Camera, microphone and speaker: choosing devices, live switching, mic/camera buttons.
(() => {
  const { $ } = WP;
  const gUM = (c) => navigator.mediaDevices.getUserMedia(c);
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('wp-devices')) || {}; } catch { return {}; } })();
  const savePrefs = () => { try { localStorage.setItem('wp-devices', JSON.stringify(prefs)); } catch {} };
  const videoConstraint = () => (prefs.cam ? { deviceId: { exact: prefs.cam }, width: 640, height: 480 } : { width: 640, height: 480 });
  const audioConstraint = () => ({ echoCancellation: true, noiseSuppression: true, ...(prefs.mic ? { deviceId: { exact: prefs.mic } } : {}) });
  WP.localStream = null;

  WP.getMedia = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { WP.say('Camera and microphone are not available.', 'sys'); return; }
    const attempts = [
      { video: videoConstraint(), audio: audioConstraint() },
      { video: { width: 640, height: 480 }, audio: { echoCancellation: true, noiseSuppression: true } }, // saved device missing
      { audio: true },
    ];
    for (let i = 0; i < attempts.length; i++) {
      try {
        WP.localStream = await gUM(attempts[i]);
        if (i === 2) WP.say('Camera unavailable. Microphone only.', 'sys');
        return;
      } catch (e) { /* try next */ }
    }
    WP.say('Camera and microphone access was denied.', 'sys');
  };

  // ---------- mic / cam toggles ----------
  function toggle(kind, btn) {
    const s = WP.localStream;
    if (!s) return;
    const tracks = kind === 'audio' ? s.getAudioTracks() : s.getVideoTracks();
    if (!tracks.length) return;
    const on = !tracks[0].enabled;
    tracks.forEach((t) => (t.enabled = on));
    btn.classList.toggle('off', !on);
    btn.title = (kind === 'audio' ? 'Microphone ' : 'Camera ') + (on ? 'on' : 'off');
    btn.setAttribute('aria-pressed', String(!on));
  }
  $('micBtn').onclick = () => toggle('audio', $('micBtn'));
  $('camBtn').onclick = () => toggle('video', $('camBtn'));

  // ---------- speaker ----------
  WP.applySink = (v) => { if (v && v.setSinkId) v.setSinkId(prefs.spk || 'default').catch(() => {}); };
  const applySinkAll = () => document.querySelectorAll('video').forEach(WP.applySink);
  WP.on('tile-video', WP.applySink);

  // ---------- settings ----------
  let prevStream = null, audioCtx = null, rafId = 0;
  async function listDevices() {
    let devs = await navigator.mediaDevices.enumerateDevices();
    if (devs.some((d) => d.kind !== 'audiooutput' && !d.label)) {
      // device names stay hidden until access was granted once
      try { (await gUM({ audio: true, video: true })).getTracks().forEach((t) => t.stop()); }
      catch { try { (await gUM({ audio: true })).getTracks().forEach((t) => t.stop()); } catch {} }
      devs = await navigator.mediaDevices.enumerateDevices();
    }
    return devs;
  }
  function fillSelect(sel, devs, kind, current, label) {
    sel.innerHTML = '';
    sel.add(new Option('Default', ''));
    devs.filter((d) => d.kind === kind && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .forEach((d, i) => sel.add(new Option(d.label || `${label} ${i + 1}`, d.deviceId)));
    sel.value = current || '';
    if (sel.value !== (current || '')) sel.value = '';
  }
  function stopPreview() {
    cancelAnimationFrame(rafId);
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
    if (prevStream) { prevStream.getTracks().forEach((t) => t.stop()); prevStream = null; }
    $('prevVideo').srcObject = null;
    $('meterFill').style.width = '0';
  }
  async function startPreview() {
    stopPreview();
    try { prevStream = await gUM({ video: videoConstraint(), audio: audioConstraint() }); }
    catch { try { prevStream = await gUM({ audio: audioConstraint() }); } catch { prevStream = null; } }
    if (!prevStream) return;
    $('prevVideo').srcObject = prevStream;
    if (prevStream.getAudioTracks().length) {
      audioCtx = new AudioContext();
      const an = audioCtx.createAnalyser();
      an.fftSize = 512;
      audioCtx.createMediaStreamSource(prevStream).connect(an); // not routed to speakers
      const data = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        $('meterFill').style.width = Math.min(100, (peak / 128) * 140) + '%';
        rafId = requestAnimationFrame(tick);
      };
      tick();
    }
  }
  async function openSettings() {
    $('settings').classList.remove('hidden');
    if (!navigator.mediaDevices) return;
    try {
      const devs = await listDevices();
      fillSelect($('camSel'), devs, 'videoinput', prefs.cam, 'Camera');
      fillSelect($('micSel'), devs, 'audioinput', prefs.mic, 'Microphone');
      fillSelect($('spkSel'), devs, 'audiooutput', prefs.spk, 'Speaker');
    } catch (e) { /* no devices */ }
    $('spkSel').disabled = !('setSinkId' in HTMLMediaElement.prototype);
    startPreview();
  }
  function closeSettings() { stopPreview(); $('settings').classList.add('hidden'); }

  // Swap the live camera or microphone without leaving the room.
  async function applyLive(kind) {
    const s = WP.localStream;
    if (!s) return;
    let ns;
    try { ns = await gUM(kind === 'video' ? { video: videoConstraint() } : { audio: audioConstraint() }); }
    catch { WP.setStatus('Could not switch device.'); return; }
    const nt = ns.getTracks()[0];
    const old = (kind === 'video' ? s.getVideoTracks() : s.getAudioTracks())[0];
    nt.enabled = old ? old.enabled : true;
    if (old) { s.removeTrack(old); old.stop(); }
    s.addTrack(nt);
    for (const { pc } of WP.peers.values()) {
      const sender = pc.getSenders().find((x) => x.track && x.track.kind === kind);
      if (sender) sender.replaceTrack(nt).catch(() => {});
    }
    WP.emit('local-stream');
  }

  $('camSel').onchange = async () => { prefs.cam = $('camSel').value; savePrefs(); await applyLive('video'); startPreview(); };
  $('micSel').onchange = async () => { prefs.mic = $('micSel').value; savePrefs(); await applyLive('audio'); startPreview(); };
  $('spkSel').onchange = () => { prefs.spk = $('spkSel').value; savePrefs(); applySinkAll(); };
  $('settingsBtn').onclick = openSettings;
  $('settingsBtn2').onclick = openSettings;
  $('settingsClose').onclick = closeSettings;
  $('settings').onclick = (e) => { if (e.target === $('settings')) closeSettings(); };
  WP.applySink($('video'));
})();
