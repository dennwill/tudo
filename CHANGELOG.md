# Changelog

## 1.5.0 - 2026-10-05

- Clicking any day on the calendar now starts a new task due on it: a small dialog asks for a title and a time (9:00 by default) and adds the task to To-do. Closing it with Cancel or Escape adds nothing
- Added real-time sync with the Android app and other devices, through your own relay server: make a sync key in the gear menu, join with it elsewhere, and tasks, edits, moves and deletes follow within a fraction of a second. Offline devices catch up when they reconnect
- Sync settings live under Sync in the gear menu, with a small status dot beside the app name. The relay's address can be chosen before a key is created
- Added a Refresh button to the titlebar (F5 and Ctrl+R too, and in the tray menu): it syncs with the relay now, re-arms reminders and checks for updates, and says so if the relay can't be reached

## 1.4.0 - 2026-09-18

- Added a calendar view: a month grid with each task on its due date, and an Upcoming panel reading from the most overdue task down through today and the days after - clicking a task in either panel goes back to the board with its editor open
- Cards can now be folded down to their title, with the due date and countdown left on show; the state is saved with the task
- The titlebar is now the app icon, a view button, and one settings menu - the theme picker and the Columns dropdown moved inside it, alongside a new Font list
- Added a font setting with five faces: Plus Jakarta Sans, Poppins, Inter, Roboto, and Montserrat - it is a setting of its own rather than part of a theme, so it stays put as you switch themes
- Fixed the overdue red and the reminder and link text in the Glassmorphism theme, which were too dark to read against its gradient

## 1.3.0 - 2026-09-14

- Added reminders: tick "Remind me" in the editor and pick how far ahead of the due date to be notified - at the due time, 5, 15 or 30 minutes, 1 or 2 hours, a day, or a custom number of hours and minutes
- Reminders follow the due date when it moves, still arrive while the window is hidden or in the tray, and any missed while the app was closed fire on the next launch
- Tasks can now be renamed from the editor; Enter saves, Escape cancels
- Added a "Show countdown" toggle to hide the live countdown on a task and show just its due date

## 1.2.1 - 2026-08-26

- Fixed dragging cards between columns and reordering within a column, which silently did nothing
- Fixed dragging a card to the trash zone, which was broken by the same fault
- The blue insertion line now shows where a dragged card will land

## 1.2.0 - 2026-08-26

- Added an "On Hold" column between Doing and Done
- Added a Columns dropdown to show or hide any column, remembered between restarts
- Cards can now be dragged up and down to reorder within a column, not just between columns
- Editing a card now has explicit Cancel and Save buttons instead of saving on every change
- Added a Glassmorphism theme
- Lightened the base grey in the Windows 2000 theme
- The app checks GitHub releases on launch and shows an Update button that downloads and installs new versions in place

## 1.1.0 - 2026-08-24

- Added three more themes: Light Minimalist, Neo-Brutalism, and Windows 2000
- Added an optional rich-text "additional description" field to tasks, with bold, italic, underline, and link formatting

## 1.0.0 - 2026-08-20

- Initial release
- Three columns: To-do, Doing, Done
- Drag and drop tasks between columns
- Due date and importance level (Low, Medium, High) per task
- Drag a task to the trash zone to delete it, with an optional confirmation step
- Always-on-top window with a tray icon to show, hide, or quit
- Tasks saved automatically to a local file
