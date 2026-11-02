// The room: a table with tools on it, a bar to switch tools, and invite links.
// Tool registry: every shared activity is one entry here. New tools (books, games) are added to this list.
(() => {
  const { $ } = WP;
  const screen = $('screen');
  const YT = 'https://www.youtube.com/';
  const isYT = (u) => /youtube\.com|youtu\.be/.test(u || '');
  const INVITE_BASE = 'https://alisfand99.github.io/watchparty/#';
  const ls = {
    get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };

  // ---------- tool registry ----------
  const TOOLS = [
    { id: 'lobby', title: 'Table', icon: 'table', hint: 'Back to the table', rail: true, open: () => WP.setMode('lobby') },
    { id: 'player', title: 'Movie', icon: 'film', hint: 'Watch a movie file or link together', rail: true, card: true, open: () => WP.setMode('player') },
    { id: 'yt', title: 'YouTube', icon: 'yt', hint: 'Watch YouTube together', rail: true, card: true, open: () => WP.browser.open(YT) },
    { id: 'web', title: 'Browser', icon: 'globe', hint: 'Browse any site together', rail: true, card: true, open: () => WP.browser.open(WP.browser.HOME) },
    { id: 'books', title: 'Books', icon: 'book', hint: 'Read epub and pdf together', card: true, soon: true },
    { id: 'games', title: 'Games', icon: 'game', hint: 'Play something together', card: true, soon: true },
  ];
  WP.tools = TOOLS;
  WP.activeTool = () => {
    const m = WP.view.mode;
    if (m === 'lobby') return 'lobby';
    if (m === 'player') return 'player';
    return isYT(WP.view.url) ? 'yt' : 'web';
  };
  const activate = (t) => {
    if (t.soon || !t.open) return;
    if (WP.activeTool() === t.id) return;
    t.open();
  };

  // ---------- the table (cards for every tool) ----------
  const cards = $('cards');
  for (const t of TOOLS.filter((x) => x.card)) {
    const b = document.createElement('button');
    b.className = 'card-tool' + (t.soon ? ' soon' : '');
    b.dataset.tool = t.id;
    b.title = t.hint;
    b.innerHTML = `<span class="ci">${WP.icon(t.icon)}</span><b>${t.title}</b><small>${t.soon ? 'Coming soon' : t.hint}</small>`;
    b.onclick = () => activate(t);
    cards.appendChild(b);
  }

  // ---------- the tool bar (collapsible, can sit on any side) ----------
  const SIDES = ['left', 'top', 'right', 'bottom'];
  WP.rail = { side: SIDES.includes(ls.get('wp-rail-side')) ? ls.get('wp-rail-side') : 'left', open: ls.get('wp-rail-open') !== '0', size: 52 };
  const rail = document.createElement('nav');
  rail.id = 'rail';
  rail.className = 'rail';
  rail.innerHTML = '<button id="railToggle" class="rt" title="Show or hide the tool bar"></button><div id="railTools" class="rtools"></div><button id="railSide" class="rs" title="Move the tool bar to another side"></button>';
  screen.appendChild(rail);
  const railTools = $('railTools');
  for (const t of TOOLS.filter((x) => x.rail)) {
    const b = document.createElement('button');
    b.dataset.tool = t.id;
    b.title = t.title + ': ' + t.hint;
    b.innerHTML = WP.icon(t.icon) + '<small>' + t.title + '</small>';
    b.onclick = () => activate(t);
    railTools.appendChild(b);
  }
  $('railSide').innerHTML = WP.icon('swap');
  function paintRail() {
    const r = WP.rail;
    rail.dataset.side = r.side;
    screen.dataset.rail = r.open ? r.side : 'closed';
    rail.classList.toggle('collapsed', !r.open);
    // when open the arrow points to the edge the bar hides into; when hidden a small tools icon remains
    $('railToggle').innerHTML = r.open ? WP.icon(r.side === 'left' || r.side === 'top' ? 'back' : 'fwd') : WP.icon('layout');
    $('railToggle').style.transform = r.open && (r.side === 'top' || r.side === 'bottom') ? 'rotate(90deg)' : '';
  }
  function refreshRail() {
    const a = WP.activeTool();
    railTools.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tool === a));
    cards.querySelectorAll('.card-tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === a));
  }
  $('railToggle').onclick = () => { WP.rail.open = !WP.rail.open; ls.set('wp-rail-open', WP.rail.open ? '1' : '0'); paintRail(); WP.emit('rail-change'); };
  $('railSide').onclick = () => { WP.rail.side = SIDES[(SIDES.indexOf(WP.rail.side) + 1) % SIDES.length]; ls.set('wp-rail-side', WP.rail.side); paintRail(); WP.emit('rail-change'); };
  WP.on('view-change', refreshRail);
  WP.on('tool-refresh', refreshRail);
  paintRail();
  refreshRail();

  // ---------- invite ----------
  const link = () => INVITE_BASE + encodeURIComponent(WP.roomCode);
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }
  function openInvite() {
    if (!WP.roomCode) return;
    $('inviteLink').value = link();
    $('inviteCode').value = WP.roomCode;
    $('inviteCopy').textContent = 'Copy link';
    $('invite').classList.remove('hidden');
    $('inviteLink').select();
  }
  WP.on('invite-open', openInvite);
  $('inviteTop').onclick = openInvite;
  $('inviteCopy').onclick = async () => {
    const ok = await copyText($('inviteLink').value);
    $('inviteCopy').textContent = ok ? 'Copied' : 'Press Ctrl+C to copy';
    if (!ok) $('inviteLink').select();
  };
  $('inviteClose').onclick = () => $('invite').classList.add('hidden');
  $('invite').onclick = (e) => { if (e.target === $('invite')) $('invite').classList.add('hidden'); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('invite').classList.add('hidden'); });
  WP.inviteLink = link;
})();
