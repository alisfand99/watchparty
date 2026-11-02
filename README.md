# WatchParty

Desktop app (Windows) for watching a movie together in sync, with everyone's camera and microphone.
Everything runs on the participants' own computers, there is no server to manage.

## Install (for friends)
1. Open the **Releases** page of this repository and download `WatchParty-Setup.exe`
   (direct link: `https://github.com/alisfand99/watchparty/releases/latest/download/WatchParty-Setup.exe`).
2. Run it. It installs without asking for administrator rights and starts the app.
3. Updates arrive by themselves: the app checks for a newer version, downloads it, and shows a **Restart** button.
   It also installs when you close the app. You never need to reinstall.

Windows may show a SmartScreen warning because the app is not code signed yet: choose "More info", then "Run anyway".

## Using it
Enter your name and a room code (the same code for everyone) and click Enter room. See **Help** inside the app.

## Develop
    npm install
    npm start            # run the app
    npm run selftest     # real end-to-end test with two windows, real shared browser and YouTube
    npm run dist         # build the installer into dist/
    node server.js       # optional: private relay + static server for browser tests

## Release a new version
1. Change `"version"` in `package.json` (for example 0.2.1) and commit.
2. Tag and push: `git tag v0.2.1 && git push origin main --tags`.
3. The "Release" GitHub Action builds the installer and publishes it. Installed apps update themselves.

The repository must be public for the automatic updates to work without a token.
