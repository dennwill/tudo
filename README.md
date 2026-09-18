# <img src="assets/icon.png" width="32" height="32" alt=""> tudo

A tiny always-on-top desktop widget for tracking tasks. It stays on top of your other windows and shows four columns: To-do, Doing, On Hold, and Done.

## Features

- Always-on-top window that stays visible while you work
- Four columns: To-do, Doing, On Hold, Done
- One settings menu in the titlebar, behind the gear, holding the theme, the columns, and the font - each choice remembered between restarts
- Show or hide any column from the Columns section of the settings menu
- Switch between the board and a calendar with the view button in the titlebar, which shows the icon of the view it takes you to, to see every due date in one view. The calendar has two panels: a month grid on the left, where each task sits on its day with a dot for the column it is in, and an Upcoming list on the right, reading from the most overdue task down through today, tomorrow and the days after, whatever month they fall in. Overdue tasks are red and clicking any task in either panel takes you back to the board with its editor open. Move through the months with the arrows, come back with Today, and the view you were last in is remembered between restarts
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
- Tasks are saved automatically to a local file, so they persist between restarts

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
- `renderer.js` - app logic: rendering tasks, drag and drop, editing
- `index.html` - app layout
- `style.css` - app styling
- `assets/` - icons
- `docs/index.html` - the project landing page
- `CHANGELOG.md` - version history, mirrored on the landing page

## License

MIT
