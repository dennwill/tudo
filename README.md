# <img src="assets/icon.png" width="32" height="32" alt=""> tudo

A tiny always-on-top desktop widget for tracking tasks. It stays on top of your other windows and shows four columns: To-do, Doing, On Hold, and Done.

## Features

- Always-on-top window that stays visible while you work
- Four columns: To-do, Doing, On Hold, Done
- One settings menu in the titlebar, behind the gear, holding the theme, the columns, and the font - each choice remembered between restarts
- Show or hide any column from the Columns section of the settings menu
- Switch between the board and a calendar with the view button in the titlebar, which shows the icon of the view it takes you to, to see every due date in one view. The calendar has two panels: a month grid on the left, where each task sits on its day with a dot for the column it is in, and an Upcoming list on the right, reading from the most overdue task down through today, tomorrow and the days after, whatever month they fall in. Overdue tasks are red and clicking any task in either panel takes you back to the board with its editor open. Clicking an empty part of a day (or its date number) starts a new task due on that day: give it a title and a time and it is added to To-do. Move through the months with the arrows, come back with Today, and the view you were last in is remembered between restarts
- Drag and drop tasks between columns, and drag them up or down to reorder within a column
- Fold any card down to its title with the arrow beside it, and click the arrow again to open it back up - the due date and its countdown stay on show while folded, the reminder, description and importance badge are what gets hidden, the state is saved with the task, and a card with nothing to hide has no arrow
- Click the edit button (or the card) to rename a task and set a due date and an importance level (Low, Medium, High) - Enter saves, Escape and Cancel drop the whole edit
- Tick "Remind me" in the editor and choose how far ahead of the due date to be told - at the due time, 5/15/30 minutes, 1 or 2 hours, a day, or a custom number of hours and minutes - for a desktop notification about that task; move the due date and the reminder moves with it. The main process does the waiting, so reminders still arrive with the window hidden or in the tray, and anything whose time passed while the app was shut fires once on the next launch
- Live countdown to the due date, which turns red once a task is overdue - the "Show countdown" toggle under the date in the editor hides it per task, leaving just the date
- Drag a task to the trash zone to delete it, with an optional confirmation step
- Choose from five themes: Dark Minimalist, Light Minimalist, Neo-Brutalism, Glassmorphism, and Windows 2000
- Choose from five fonts: Plus Jakarta Sans, Poppins, Inter, Roboto, and Montserrat - the font is a setting of its own rather than part of a theme, so it stays put as you change themes
- Tray icon to show, hide, or quit the app
- Checks GitHub releases on launch: the titlebar reads "Latest version" when up to date, or shows an Update button that downloads and installs the new version in place
- A **Refresh** button in the titlebar (also **F5** or **Ctrl+R**, and **Refresh** in the tray menu): syncs with the relay now, re-arms reminders and checks for a newer version, with the arrows turning while it works
- Real-time sync with the Android app and any other device, through your own relay server - see [Sync](#sync)
- Tasks are saved automatically to a local file, so they persist between restarts

## Sync

Changes made here show up on your other devices within a fraction of a second, and theirs show up here: a new task, an edit, a move, a reorder, a delete. It works with the [Android app](../tudo-mobile) and any other device that has the key, through the relay in [tudo-web](../tudo-web) (`server.js`, on `/sync`).

**Setting it up.** Open the gear menu → Sync and choose **Create a sync key**. It looks like `K7M2P-9XQ4T-HW3NB-6CDVR`; **Show** and **Copy** are beside it. On each other device, join with the same key. The first time a device joins, its tasks are merged with the others', so nothing is replaced. A small dot beside the app name shows where it stands: green is connected, amber is connecting or offline, red is a problem the menu will explain.

**What to expect.**

- Two devices changing different tasks at the same moment both win. Changing the *same* task at the same moment, the later change wins, and every device agrees which that was.
- A device that is offline (or has sync switched off) keeps working, and catches up on everything when it reconnects, deletes included. Edits keep the time they were made, not the time the device got back online.
- Whether a card is folded down is each device's own choice and isn't synced. Everything else about a task is.
- If both devices have a reminder set, both will notify you. A reminder that has already gone off on one is marked as fired on the other.
- Syncing carries on while the window is hidden in the tray, but not once the app is quit.

**Who can see your tasks.** The key never leaves your devices: the relay only ever sees a hash of it, which names a "room" nobody can guess (20 characters, about 100 bits). Anyone who has the key can read and change the board, so treat it like a password. Connections to a `wss://` server are encrypted in transit. The relay holds the board in memory and it is *not* end-to-end encrypted, so whoever runs the relay could read it - fine for your own server, worth knowing. **Stop syncing** forgets the key on this device.

**The relay.** Gear menu → Sync → Server holds the relay's address, which starts as `wss://tudo-denn.freeddns.org/sync`. Change it to point at your own; it can be changed before a key exists, so nothing is sent to the default first. The relay has to be running a version of `tudo-web` that includes `/sync`.

**Refresh.** Syncing is live, so Refresh is for when you want to be sure, or something went wrong. It drops the connection and makes a new one, which starts with a full exchange of everything both sides have - so it also gets you out of a long reconnect delay at once, and brings in anything missed while the connection was down. If the relay can't be reached it says so, and if sync is off it just re-checks reminders and updates. **F5** and **Ctrl+R** do the same thing (they would reload the page in a browser, which here would throw away an edit in progress), and the tray menu has a **Refresh** for when the window is hidden.

Sync keeps its own file, `tudo-sync.json`, next to `tudo-data.json` in the app's data folder. The tasks file is unchanged, so it still opens in an older version or on the phone.

## Requirements

- [Node.js](https://nodejs.org/) and npm

## Getting started

Install dependencies:

```
npm install
```

Run the app:

```
npm start
```

## Building

To build a Windows installer:

```
npm run dist
```

The output is placed in the `dist` folder.

## Releasing

Updates are handled by [electron-updater](https://www.electron.build/auto-update),
pointed at the GitHub releases of this repository (`build.publish` in
`package.json`). To ship an update:

1. Bump `version` in `package.json`.
2. Set a `GH_TOKEN` with `repo` scope in your environment.
3. Run `npm run release` - it builds the installer and uploads it, plus the
   `latest.yml` manifest electron-updater reads, to a draft GitHub release.
4. Publish the draft release on GitHub.

Running apps check on launch and every six hours. When a newer version is found
the titlebar shows an Update button: clicking it downloads the installer in the
background, and the button then offers a restart that installs it. `npm run dist`
still builds an installer locally without publishing anything.

Update checks are skipped when the app is unpackaged (`npm start`), since
electron-updater needs the `app-update.yml` written at build time - in
development the titlebar just shows the version number.

The installer is always named `tudo-Setup.exe` (`nsis.artifactName` in
`package.json` drops the version from the filename), so the landing page's
Download button can link straight to it via
`github.com/dennwill/tudo/releases/latest/download/tudo-Setup.exe` - GitHub
resolves that to the newest release's asset, so the link never needs updating.

## Landing page

`docs/index.html` is a self-contained landing page (no build step, no external
assets besides Google Fonts) with a live theme demo and the changelog below. To
host it on GitHub Pages: repo Settings → Pages → Deploy from a branch → `main`,
folder `/docs`. It lives outside `build.files`, so it isn't bundled into the app.

## Project structure

- `main.js` - Electron main process: window setup, tray icon, and saving/loading tasks
- `preload.js` - bridges the main process and the renderer
- `renderer.js` - app logic: rendering tasks, drag and drop, editing, and the sync controls
- `sync-core.js`, `sync-client.js` - real-time sync: the merge rules and the connection. They are shared **byte for byte** with the Android app (where the originals live, in `tudo-mobile/src/sync`) and, the core only, the relay - edit them there and run `npm run check:sync -- --fix` in `tudo-mobile`
- `index.html` - app layout
- `style.css` - app styling
- `assets/` - icons
- `docs/index.html` - the project landing page
- `CHANGELOG.md` - version history, mirrored on the landing page

## License

MIT
