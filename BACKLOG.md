# WatchParty product backlog

## Next
- **File transfer to all participants**: the host picks a movie, the app sends it to everyone
  (WebRTC data channel, chunked, with progress and resume), and when every guest has it,
  playback starts in sync. Removes the "everyone must already have the same file" limit.
- **TURN relay** for networks where direct connections fail (some mobile data, offices).
- **Code signing** so Windows SmartScreen does not warn.

## Later
- Play more formats (mkv, avi, multiple audio tracks) by embedding mpv or libVLC.
- SFU for rooms larger than about 6 people.
- Screen sharing, per-person volume.
- Shared browser: mirror keyboard shortcuts and text selection, per-site rules.
- Optional own relay for the introductions (today a public one is used, messages are encrypted with the room code).

## Done
- Installer and automatic updates (electron-updater from GitHub Releases).
- Drawing tools, draggable camera layout, shared browser with YouTube, saved rooms and history.
