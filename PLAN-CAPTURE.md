# Plan: Moments (capture, clips, gallery, meme and card editor)

Goal: turn "watching together" into something people keep. A reaction becomes a snap, a snap becomes a meme or a card, the card lives in the room gallery and can be signed by everyone.

## A. Fullscreen and cameras (done in 0.3.0)
- Fullscreen is the app's own: the screen fills the window, the window fills the display. Cameras, drawings and controls stay on top of the movie AND of the shared browser (YouTube fullscreen is redirected into it).
- Each camera has a small hide button. A hidden camera leaves a name tag (initial + name). Click the tag to bring it back. Audio keeps playing. Saved per room and per name.

## B. Capture
1. Snap (camera button): composes the screen (movie or browser page + all camera tiles + drawings) into one image. Works in fullscreen too.
2. Reaction snap: starts a 3, 2, 1 countdown on EVERY screen, flash at zero, and the picture is taken then so everyone's face is in the same moment. Anyone can start it.
3. Clip recorder: records the composed screen plus movie sound plus everyone's voices (mixed) for up to 60 seconds. Stop button and timer. Saved as a webm clip.
4. Every capture stores: who took it, time in the movie, movie name, date.

## C. Room gallery (saved locally, per room)
- Stored in IndexedDB on this computer, grouped by room code. Survives restarts and rejoining.
- Grid with filters: All, Snaps, Clips, Cards, Mine.
- Open an item: preview, edit, download, share to the room, delete, emoji reactions (votes).
- Share sends the item directly to everyone in the room over the encrypted peer connection (no server). Receivers get it in their own gallery.
- "Best of the night": the item with most reactions is marked with a crown.

## D. Editor (meme and card maker)
- Opens on any snap or card. Objects can be dragged, resized and removed.
- Meme tools: top and bottom classic caption, free text, emoji stickers, freehand pen, filters (black and white, deep fry, vignette, VHS).
- Signature: every person adds their signed name, in handwriting font, to the item. A signed card shows "Signed by Ali, Sara".
- Card frames: Polaroid, Movie ticket (movie, room, date, time in film), Film strip, Plain. The card is saved as a new gallery item and can be shared. Anyone who receives it can open it, sign it, and share it again, so a card collects signatures.
- Undo, reset, export as PNG or JPG.

## E. Later (backlog)
- Instant replay: keep the last 15 seconds and save a clip with one click.
- Laugh detector: when the room gets loud, suggest "save this moment?".
- GIF export, sound memes, night recap video, gallery sync for people who join late.
- Meme template packs shared in the room, sticker upload.

## Build order
1. Fullscreen and hide tiles. 2. Snap + countdown. 3. Recorder. 4. Gallery + sharing + reactions. 5. Editor + cards + signatures. 6. Tests, release 0.3.0.
