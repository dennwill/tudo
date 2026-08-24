# <img src="assets/icon.png" width="32" height="32" alt=""> tudo

A tiny always-on-top desktop widget for tracking tasks. It stays on top of your other windows and shows three columns: To-do, Doing, and Done.

## Features

- Always-on-top window that stays visible while you work
- Three columns: To-do, Doing, Done
- Drag and drop tasks between columns
- Set a due date and an importance level (Low, Medium, High) for each task
- Drag a task to the trash zone to delete it, with an optional confirmation step
- Choose from four themes: Dark Minimalist, Light Minimalist, Neo-Brutalism, and Windows 2000
- Tray icon to show, hide, or quit the app
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

## Project structure

- `main.js` - Electron main process: window setup, tray icon, and saving/loading tasks
- `preload.js` - bridges the main process and the renderer
- `renderer.js` - app logic: rendering tasks, drag and drop, editing
- `index.html` - app layout
- `style.css` - app styling
- `assets/` - icons

## License

MIT
