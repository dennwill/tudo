# <img src="assets/icon.png" width="32" height="32" alt=""> tudo

A tiny always-on-top desktop widget for tracking tasks. It stays on top of your other windows and shows four columns: To-do, Doing, On Hold, and Done.

## Features

- Always-on-top window that stays visible while you work
- Four columns: To-do, Doing, On Hold, Done
- Show or hide any column from the Columns dropdown, with the choice remembered between restarts
- Drag and drop tasks between columns, and drag them up or down to reorder within a column
- Set a due date and an importance level (Low, Medium, High) for each task
- Drag a task to the trash zone to delete it, with an optional confirmation step
- Choose from five themes: Dark Minimalist, Light Minimalist, Neo-Brutalism, Glassmorphism, and Windows 2000
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
