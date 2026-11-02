# Plan: the room (table, tools, tool bar, invite)

Goal: a room is a place where friends see each other and do things together. Tools are things you put on the table.

## 1. Fixes done first (0.4.0)
1. Gallery viewer: now a fixed overlay (96 percent of the window), picture up to the window height, buttons always visible.
2. Enlarged camera: a click only toggles (no drag while enlarged, 30 px tolerance), grows around its own centre inside the free area, always shrinks back. Before, a shaky click turned the layout into custom and left it big.
3. Pointer: hold the mouse on the picture, a glowing dot with your name shows for everyone (and for you), a 400 ms heartbeat keeps it alive while held still, release removes it everywhere. Never saved as a drawing. Own button (target icon) next to Draw.
4. Bottom bar: two zones. Left = the tool (movie: play, skip, time, volume, speed, subtitles, More). Right = the same in every tool (mic, camera | pointer, draw | moments, layout, fullscreen). Choose file, link, subtitles and resync moved to the movie "More" menu and to the empty movie screen. Snap, reaction, record and gallery are one Moments menu. Settings, Help, Leave, Chat, Invite are in a slim top bar.

## 2. Structure
- Scene = `screen.dataset.mode`: `lobby` (the table), `player` (movie), `browser` (YouTube or web). Shared by everyone (existing `view` message), saved per room.
- Tool registry (`WP.tools` in js/room.js): id, title, icon, hint, `open()`, flags `rail` (shown on the bar), `card` (shown on the table), `soon`. Adding a tool = one entry plus its scene.
- A tool owns: its scene element, its own controls zone (left zone of the bar), its own commands. Everything else (cameras, bar, chat, moments, drawing) is shared and stays.

## 3. The table (lobby)
- Cards for Movie, YouTube, Browser, Books (soon), Games (soon) on an oval table in the middle.
- Faces sit around the table (`table` preset in tiles.js): seat 0 (you) at the bottom, the others spread on an ellipse, 2 to 6 seats. Faces cannot be dragged here.
- Empty seat with a plus: opens the invite box (link, code, copy). Hidden when the room has 6 people.
- Chat stays in the right panel (can be hidden with the Chat button).

## 4. Inside a tool
- Main tool fills the screen. Cameras use the saved layout (right column by default, any preset, custom, hidden with name tags). Fullscreen keeps all of it.
- Tool bar (js/room.js): Table, Movie, YouTube, Browser (more later). Collapsible (arrow), movable to left, top, right or bottom (button), remembered on this computer, hides with the controls when the mouse rests in fullscreen. Cameras keep clear of it.
- Back to table: bar button, or "Back to table" in the browser bar.

## 5. Invite and people
- Create a new room: random code like `k7m2-x9qd-4tbw`. Anyone can paste a code or a link.
- Invite link: `https://alisfand99.github.io/watchparty/#<code>` (page in /docs on GitHub Pages: opens `watchparty://join/<code>`, shows the code and the download button).
- The installed app registers `watchparty://`, keeps a single window and joins by the link (name remembered, else it waits for the name).
- 6 people at most: a member who already has 5 peers answers `full`; the newcomer sees "This room is full".

## 6. Later
- Books: epub and pdf reader with shared page, scroll and highlights.
- Games: card and board games on the table.
- Per tool control zones (reader: page, zoom, search; games: turn, score).
- Optional per-room names for tool history on the table (what we watched last time).

## Build order and tests
Fixes, scene + registry, table + seats, controls zones, rail, invite + protocol, 6 cap, help text. Tests in `test_v4.js` (table, invite, pointer, enlarge, bar, gallery viewer, cap) plus the earlier moments test.
