const COLUMNS = [
  { id: 'todo', label: 'To-do' },
  { id: 'doing', label: 'Doing' },
  { id: 'onhold', label: 'On Hold' },
  { id: 'done', label: 'Done' },
];
const STATUSES = COLUMNS.map((c) => c.id);
const COLUMN_LABELS = Object.fromEntries(COLUMNS.map((c) => [c.id, c.label]));
const IMPORTANCE_LEVELS = ['Not Set', 'Low', 'Medium', 'High'];
// Reminders hang off the due date rather than sitting at a fixed time, so the
// whole set moves whenever the deadline moves.
const REMIND_PRESETS = [
  { minutes: 0, label: 'At the due time' },
  { minutes: 5, label: '5 minutes before' },
  { minutes: 15, label: '15 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 1440, label: '1 day before' },
];
const REMIND_CUSTOM = 'custom';
// A month out is already further ahead than the presets go; past that the
// custom fields are almost certainly a typo.
const REMIND_MAX_MINUTES = 60 * 24 * 30;

// Mirrors the maxlength on the "Add issue" fields in index.html.
const TITLE_MAX_LENGTH = 200;
const HANDLE_ICON = `<svg viewBox="0 0 20 20" fill="currentColor">
  <circle cx="7" cy="4" r="1.3"></circle>
  <circle cx="13" cy="4" r="1.3"></circle>
  <circle cx="7" cy="10" r="1.3"></circle>
  <circle cx="13" cy="10" r="1.3"></circle>
  <circle cx="7" cy="16" r="1.3"></circle>
  <circle cx="13" cy="16" r="1.3"></circle>
</svg>`;
const LINK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
</svg>`;
const EDIT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
</svg>`;
const TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="3 6 5 6 21 6"></polyline>
  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
  <path d="M10 11v6"></path>
  <path d="M14 11v6"></path>
  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
</svg>`;
const CHEVRON_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="6 9 12 15 18 9"></polyline>
</svg>`;
const BOARD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="4" width="5" height="16" rx="1"></rect>
  <rect x="10" y="4" width="5" height="11" rx="1"></rect>
  <rect x="17" y="4" width="4" height="7" rx="1"></rect>
</svg>`;
const CALENDAR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="5" width="18" height="16" rx="2"></rect>
  <path d="M3 10h18"></path>
  <path d="M8 3v4"></path>
  <path d="M16 3v4"></path>
</svg>`;

let state = { todo: [], doing: [], onhold: [], done: [] };
let editingId = null;
// Edits are held here until Save; Cancel (or opening another card) drops them.
let editDraft = null;

// The title turns into this field for as long as the card is being edited. Its
// value lives in the draft alongside the other fields, so Cancel drops a retitle
// exactly the way it drops a changed due date.
function renderTitleInput(task) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'card-title-input';
  input.maxLength = TITLE_MAX_LENGTH;
  input.value = editDraft.text;
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('input', () => {
    editDraft.text = input.value;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEditor(task);
    } else if (e.key === 'Escape') {
      // Cancels the edit; stopped here so no ancestor handler acts on it too.
      e.preventDefault();
      e.stopPropagation();
      closeEditor();
      render();
    }
  });
  return input;
}

// Rendering replaces the card, so the field can only be focused once it is back
// in the document. The caret goes to the end rather than selecting the whole
// title, so the first keystroke cannot wipe it by accident.
function focusTitleInput(id) {
  const input = focusEditorField(id, '.card-title-input');
  if (input) input.setSelectionRange(input.value.length, input.value.length);
}

function focusEditorField(id, selector) {
  const input = document.querySelector(`.card[data-id="${id}"] ${selector}`);
  if (input) input.focus();
  return input;
}

// Shared by the Save button and by Enter in the title field.
function saveEditor(task) {
  const text = editDraft.text.trim();
  if (!text) {
    // A card with no title has nothing to identify it by, so the editor stays
    // open rather than silently keeping the old one.
    showToast('A task needs a title');
    focusTitleInput(task.id);
    return;
  }

  // A reminder needs a deadline to count back from; the toggle is disabled
  // without one, so this only catches a date cleared after ticking the box.
  const remind = editDraft.remind && !!editDraft.due;

  // A reminder that has moved - including because its due date moved - is a new
  // one, so it is allowed to fire again.
  if (
    task.remind !== remind ||
    task.remindOffset !== editDraft.remindOffset ||
    task.due !== editDraft.due
  ) {
    task.reminderFired = false;
  }

  task.text = text;
  task.due = editDraft.due;
  task.importance = editDraft.importance;
  task.showCountdown = editDraft.showCountdown;
  task.remind = remind;
  task.remindOffset = editDraft.remindOffset;
  task.additionalDescription = editDraft.additionalDescription;
  closeEditor();
  persistAndRender();
}

function openEditor(task) {
  editingId = task.id;
  editDraft = {
    text: task.text,
    due: task.due || null,
    importance: task.importance || 'Not Set',
    showCountdown: task.showCountdown !== false,
    remind: task.remind === true,
    remindOffset: clampRemindOffset(task.remindOffset),
    // Keeps "Custom..." selected for a value that happens to match a preset.
    remindCustom: !isRemindPreset(clampRemindOffset(task.remindOffset)),
    additionalDescription: task.additionalDescription || '',
  };
}

function closeEditor() {
  editingId = null;
  editDraft = null;
}

function toggleEditor(task) {
  if (editingId === task.id) {
    closeEditor();
    render();
    return;
  }

  openEditor(task);
  render();
  focusTitleInput(task.id);
}

const SKIP_DELETE_CONFIRM_KEY = 'tudo-skip-delete-confirm';

const THEMES = [
  { id: 'dark-minimalist', label: 'Dark Minimalist' },
  { id: 'light-minimalist', label: 'Light Minimalist' },
  { id: 'neo-brutalism', label: 'Neo-Brutalism' },
  { id: 'glassmorphism', label: 'Glassmorphism' },
  { id: 'windows-2000', label: 'Windows 2000' },
];
const THEME_KEY = 'tudo-theme';

function applyTheme(id) {
  document.documentElement.dataset.theme = id;
  localStorage.setItem(THEME_KEY, id);
}

applyTheme(localStorage.getItem(THEME_KEY) || THEMES[0].id);

// Every row in the settings panel is the same shape: a tickbox or a radio with
// its label beside it.
function settingsOption({ type, name, value, label, checked, onChange }) {
  const row = document.createElement('label');
  row.className = 'settings-option';

  const input = document.createElement('input');
  input.type = type;
  if (name) input.name = name;
  input.value = value;
  input.checked = checked;
  input.addEventListener('change', () => onChange(input));

  row.appendChild(input);
  row.appendChild(document.createTextNode(label));
  return { row, input };
}

function setupThemeOptions() {
  const container = document.getElementById('theme-options');
  const current = document.documentElement.dataset.theme;

  for (const theme of THEMES) {
    const { row } = settingsOption({
      type: 'radio',
      name: 'theme',
      value: theme.id,
      label: theme.label,
      checked: theme.id === current,
      onChange: (input) => applyTheme(input.value),
    });
    container.appendChild(row);
  }
}

// The body font is the reader's choice rather than part of a theme, so it is
// kept here and applied over whatever the theme asks for. The monospace face
// stays with the theme.
const FONTS = [
  { id: 'plus-jakarta-sans', label: 'Plus Jakarta Sans', stack: "'Plus Jakarta Sans'" },
  { id: 'poppins', label: 'Poppins', stack: "'Poppins'" },
  { id: 'inter', label: 'Inter', stack: "'Inter'" },
  { id: 'roboto', label: 'Roboto', stack: "'Roboto'" },
  { id: 'montserrat', label: 'Montserrat', stack: "'Montserrat'" },
];
const FONT_KEY = 'tudo-font';
// Kept in step with the --font-body fallback in style.css, for the moment
// before the webfont has arrived.
const FONT_FALLBACK = 'system-ui, -apple-system, sans-serif';

function fontStack(font) {
  return `${font.stack}, ${FONT_FALLBACK}`;
}

function applyFont(id) {
  const font = FONTS.find((f) => f.id === id) || FONTS[0];
  document.documentElement.style.setProperty('--font-body', fontStack(font));
  localStorage.setItem(FONT_KEY, font.id);
  return font.id;
}

const currentFont = applyFont(localStorage.getItem(FONT_KEY));

function setupFontOptions() {
  const container = document.getElementById('font-options');

  for (const font of FONTS) {
    const { row } = settingsOption({
      type: 'radio',
      name: 'font',
      value: font.id,
      label: font.label,
      checked: font.id === currentFont,
      onChange: (input) => applyFont(input.value),
    });
    // Each name is set in the face it names, so the list is its own preview.
    row.style.fontFamily = fontStack(font);
    container.appendChild(row);
  }
}

const VISIBLE_COLUMNS_KEY = 'tudo-visible-columns';

function loadVisibleColumns() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(VISIBLE_COLUMNS_KEY));
  } catch {
    saved = null;
  }
  if (!Array.isArray(saved)) return STATUSES.slice();
  const visible = saved.filter((id) => STATUSES.includes(id));
  return visible.length ? visible : STATUSES.slice();
}

let visibleColumns = loadVisibleColumns();
// Assigned when the Columns menu is built. The calendar calls it after bringing
// a hidden column back, so the menu's tickboxes keep up.
let syncColumnsPanel = () => {};

function applyColumnVisibility() {
  const board = document.querySelector('.board');
  for (const status of STATUSES) {
    const col = board.querySelector(`.col[data-status="${status}"]`);
    col.hidden = !visibleColumns.includes(status);
  }
  board.style.setProperty('--col-count', visibleColumns.length);
  localStorage.setItem(VISIBLE_COLUMNS_KEY, JSON.stringify(visibleColumns));
}

function setupColumnsOptions() {
  const container = document.getElementById('columns-options');

  for (const column of COLUMNS) {
    const { row } = settingsOption({
      type: 'checkbox',
      value: column.id,
      label: column.label,
      checked: visibleColumns.includes(column.id),
      onChange: (checkbox) => {
        if (checkbox.checked) {
          visibleColumns = STATUSES.filter(
            (id) => id === column.id || visibleColumns.includes(id)
          );
        } else {
          visibleColumns = visibleColumns.filter((id) => id !== column.id);
        }
        applyColumnVisibility();
        syncColumnsPanel();
      },
    });
    container.appendChild(row);
  }

  // The last visible column can't be unchecked - an empty board is useless.
  syncColumnsPanel = () => {
    container.querySelectorAll('input[type="checkbox"]').forEach((box) => {
      box.checked = visibleColumns.includes(box.value);
      box.disabled = box.checked && visibleColumns.length === 1;
    });
  };

  syncColumnsPanel();
  applyColumnVisibility();
}

// Theme, columns and font all live behind the one gear in the titlebar.
function setupSettingsMenu() {
  const btn = document.getElementById('settings-btn');
  const panel = document.getElementById('settings-panel');

  const closePanel = () => {
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    btn.setAttribute('aria-expanded', String(!panel.hidden));
  });

  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target)) closePanel();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
  });
}

/* ---------------------------------------------------------------- calendar */

// The board and the calendar are two views of the same tasks: the board is
// where work gets moved along, the calendar is where the deadlines line up.
const VIEW_KEY = 'tudo-view';

let view = localStorage.getItem(VIEW_KEY) === 'calendar' ? 'calendar' : 'board';
let calMonth = startOfMonth(new Date());

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// Local, not UTC: a due date is a wall-clock time, and toISOString() would
// shunt anything near midnight onto the wrong day.
function dateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// 0 for Sunday, matching Date.getDay(). Intl counts from Monday as 1, and not
// every build has the week data, so Monday is the fallback.
function firstDayOfWeek() {
  try {
    const locale = new Intl.Locale(navigator.language);
    const info = typeof locale.getWeekInfo === 'function' ? locale.getWeekInfo() : locale.weekInfo;
    if (info && Number.isInteger(info.firstDay)) return info.firstDay % 7;
  } catch {
    // Fall through to Monday.
  }
  return 1;
}

function setupViewToggle() {
  document.getElementById('view-btn').addEventListener('click', () => {
    setView(view === 'board' ? 'calendar' : 'board');
  });
  applyView();
}

function setView(next) {
  view = next;
  localStorage.setItem(VIEW_KEY, view);
  applyView();
}

// The button shows where it takes you, not where you are.
function applyView() {
  const onCalendar = view === 'calendar';
  const btn = document.getElementById('view-btn');

  document.querySelector('.board').hidden = onCalendar;
  document.getElementById('calendar').hidden = !onCalendar;
  // The Columns tickboxes have nothing to say about the calendar.
  document.getElementById('columns-group').hidden = onCalendar;

  btn.innerHTML = onCalendar ? BOARD_ICON : CALENDAR_ICON;
  btn.title = onCalendar ? 'Back to the task board' : 'See due dates on a calendar';
  btn.setAttribute('aria-label', btn.title);

  if (onCalendar) renderCalendar();
}

function setupCalendar() {
  document.getElementById('cal-prev').addEventListener('click', () => shiftMonth(-1));
  document.getElementById('cal-next').addEventListener('click', () => shiftMonth(1));
  document.getElementById('cal-today').addEventListener('click', () => {
    calMonth = startOfMonth(new Date());
    renderCalendar();
  });
}

function shiftMonth(delta) {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + delta, 1);
  renderCalendar();
}

// Every dated task, filed under the day it falls on. The stored due value is a
// datetime-local string, so the first ten characters are already the day.
function tasksByDueDate() {
  const byDate = new Map();

  for (const status of STATUSES) {
    for (const task of state[status]) {
      if (!task.due || !formatDue(task.due)) continue;
      const key = task.due.slice(0, 10);
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push({ task, status });
    }
  }

  // Earliest first within a day, so a cell reads down the day like a schedule.
  for (const entries of byDate.values()) {
    entries.sort((a, b) => a.task.due.localeCompare(b.task.due));
  }

  return byDate;
}

function countUndatedTasks() {
  let count = 0;
  for (const status of STATUSES) {
    count += state[status].filter((task) => !task.due || !formatDue(task.due)).length;
  }
  return count;
}

function renderCalendar() {
  document.getElementById('cal-month').textContent =
    calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  renderWeekdays();

  const byDate = tasksByDueDate();
  const todayKey = dateKey(new Date());
  const offset = (calMonth.getDay() - firstDayOfWeek() + 7) % 7;
  const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  // Whole weeks, and only as many as the month actually reaches into.
  const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7;

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';
  for (let i = 0; i < cellCount; i++) {
    const day = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1 - offset + i);
    grid.appendChild(renderCalendarDay(day, byDate, todayKey));
  }

  // Tasks with no deadline cannot sit on a day, so they are counted instead of
  // being silently dropped from the only view that claims to show everything.
  const undated = countUndatedTasks();
  const note = document.getElementById('cal-undated');
  note.hidden = undated === 0;
  note.textContent =
    undated === 1 ? '1 task has no due date' : `${undated} tasks have no due date`;

  renderUpcoming();
}

/* ---------------------------------------------------------------- upcoming */

// The panel beside the grid. The grid is for browsing a month; this is for the
// one question the board cannot answer at a glance - what is next, in order,
// whatever month it falls in. Finished tasks are left out: nothing in Done is
// still coming.
function upcomingTasks() {
  const entries = [];

  for (const status of STATUSES) {
    if (status === 'done') continue;
    for (const task of state[status]) {
      if (!task.due || !formatDue(task.due)) continue;
      entries.push({ task, status });
    }
  }

  return entries.sort((a, b) => a.task.due.localeCompare(b.task.due));
}

function renderUpcoming() {
  const list = document.getElementById('upcoming-list');
  list.innerHTML = '';

  const entries = upcomingTasks();
  document.getElementById('upcoming-count').textContent = entries.length;

  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'upcoming-empty';
    empty.textContent = 'Nothing with a deadline';
    list.appendChild(empty);
    return;
  }

  const now = Date.now();
  // Late work leads, because it is the most urgent thing the panel knows.
  const overdue = entries.filter((entry) => Date.parse(entry.task.due) < now);
  if (overdue.length) list.appendChild(renderUpcomingGroup('Overdue', overdue, true));

  const byDay = new Map();
  for (const entry of entries) {
    if (Date.parse(entry.task.due) < now) continue;
    const key = entry.task.due.slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(entry);
  }

  // The entries were sorted before grouping, so the days come out in order too.
  for (const [key, items] of byDay) {
    list.appendChild(renderUpcomingGroup(dayHeading(key), items, false));
  }
}

function renderUpcomingGroup(label, entries, overdue) {
  const group = document.createElement('div');
  group.className = 'up-group' + (overdue ? ' overdue' : '');

  const heading = document.createElement('div');
  heading.className = 'up-group-label';
  heading.textContent = label;
  group.appendChild(heading);

  for (const { task, status } of entries) {
    group.appendChild(renderUpcomingTask(task, status, overdue));
  }

  return group;
}

function renderUpcomingTask(task, status, overdue) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'up-task' + (overdue ? ' overdue' : '');
  row.title = `${task.text}\n${formatDue(task.due)} - ${COLUMN_LABELS[status]}`;

  const dot = document.createElement('span');
  dot.className = `icon-dot dot-${status}`;
  row.appendChild(dot);

  const text = document.createElement('span');
  text.className = 'up-text';
  text.textContent = task.text;
  row.appendChild(text);

  // The heading above already gives the day, so the row only needs the time.
  const time = document.createElement('span');
  time.className = 'up-time';
  time.textContent = formatTime(task.due);
  row.appendChild(time);

  row.addEventListener('click', () => openTaskFromCalendar(task, status));
  return row;
}

// "Today" and "Tomorrow" are what you would say out loud; anything further off
// gets its date.
function dayHeading(key) {
  const now = new Date();
  if (key === dateKey(now)) return 'Today';

  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (key === dateKey(tomorrow)) return 'Tomorrow';

  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(due) {
  const date = new Date(due);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// The names follow the user's locale, and the order follows their week.
function renderWeekdays() {
  const row = document.getElementById('cal-weekdays');
  if (row.childElementCount) return;

  const weekStart = firstDayOfWeek();
  // An arbitrary Sunday to count forward from.
  const sunday = new Date(2024, 0, 7);
  for (let i = 0; i < 7; i++) {
    const day = new Date(2024, 0, sunday.getDate() + weekStart + i);
    const label = document.createElement('div');
    label.className = 'cal-weekday';
    label.textContent = day.toLocaleDateString(undefined, { weekday: 'short' });
    row.appendChild(label);
  }
}

function renderCalendarDay(day, byDate, todayKey) {
  const key = dateKey(day);

  const cell = document.createElement('div');
  cell.className = 'cal-day';
  if (day.getMonth() !== calMonth.getMonth()) cell.classList.add('other-month');
  if (key === todayKey) cell.classList.add('today');

  const date = document.createElement('div');
  date.className = 'cal-date';
  date.textContent = day.getDate();
  cell.appendChild(date);

  for (const { task, status } of byDate.get(key) || []) {
    cell.appendChild(renderCalendarTask(task, status));
  }

  return cell;
}

function renderCalendarTask(task, status) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'cal-task';
  if (status === 'done') {
    chip.classList.add('done');
  } else if (Date.parse(task.due) < Date.now()) {
    chip.classList.add('overdue');
  }
  // The cell gives the day; the tooltip gives the time and the column.
  chip.title = `${task.text}\n${formatDue(task.due)} - ${COLUMN_LABELS[status]}`;

  const dot = document.createElement('span');
  dot.className = `icon-dot dot-${status}`;
  chip.appendChild(dot);

  const text = document.createElement('span');
  text.className = 'cal-task-text';
  text.textContent = task.text;
  chip.appendChild(text);

  chip.addEventListener('click', () => openTaskFromCalendar(task, status));
  return chip;
}

// A deadline is usually the reason to go looking for a task, so the calendar
// hands you the card itself rather than just telling you it exists.
function openTaskFromCalendar(task, status) {
  // Its card cannot be reached while its column is hidden, so opening one
  // brings that column back.
  if (!visibleColumns.includes(status)) {
    visibleColumns = STATUSES.filter((id) => id === status || visibleColumns.includes(id));
    applyColumnVisibility();
    syncColumnsPanel();
  }

  setView('board');
  openEditor(task);
  render();
  focusTitleInput(task.id);

  const card = document.querySelector(`.card[data-id="${task.id}"]`);
  if (card) card.scrollIntoView({ block: 'nearest' });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatDue(due) {
  if (!due) return '';
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCountdown(due) {
  if (!due) return '';
  const target = new Date(due).getTime();
  if (Number.isNaN(target)) return '';

  const diffMs = target - Date.now();
  const overdue = diffMs <= 0;
  const totalSeconds = Math.floor(Math.abs(diffMs) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let text;
  if (days >= 1) {
    text = `${days}d ${hours}h`;
  } else if (hours >= 1) {
    text = `${hours}h ${minutes}m`;
  } else {
    text = `${minutes}m ${seconds}s`;
  }

  return overdue ? `Overdue by ${text}` : `${text} left`;
}

function updateCountdowns() {
  document.querySelectorAll('.card-countdown').forEach((el) => {
    const text = formatCountdown(el.dataset.due);
    el.textContent = text;
    el.classList.toggle('overdue', text.startsWith('Overdue'));
  });
}

function hasContent(html) {
  if (!html) return false;
  const text = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  return text.length > 0;
}

async function init() {
  const loaded = await window.tudo.loadTasks();
  state = { todo: [], doing: [], onhold: [], done: [], ...loaded };
  for (const status of STATUSES) {
    if (!Array.isArray(state[status])) state[status] = [];
    for (const task of state[status]) {
      if (!task.importance) task.importance = 'Not Set';
      if (!task.additionalDescription) task.additionalDescription = '';
      // Anything saved before this field existed keeps showing its countdown.
      if (task.showCountdown === undefined) task.showCountdown = true;
      // Cards start out open, including everything saved before they could fold.
      task.collapsed = task.collapsed === true;
      // A reminder counts back from the due date, so without one there is none.
      task.remindOffset = clampRemindOffset(task.remindOffset);
      task.remind = task.remind === true && !!task.due;
      task.reminderFired = task.reminderFired === true;
    }
  }

  render();
  setupDropZones();
  setupAddZones();
  setupTrashZone();
  setupThemeOptions();
  setupColumnsOptions();
  setupFontOptions();
  setupSettingsMenu();
  setupCalendar();
  setupViewToggle();

  document.getElementById('btn-min').addEventListener('click', () => window.tudo.minimize());
  document.getElementById('btn-close').addEventListener('click', () => window.tudo.close());

  setupUpdateCheck();
  window.tudo.onReminderFired(markReminderFired);
  syncReminders();
  setInterval(updateCountdowns, 1000);
}

function render() {
  for (const status of STATUSES) {
    const list = document.getElementById(`list-${status}`);
    list.innerHTML = '';
    for (const task of state[status]) {
      list.appendChild(renderTask(task, status));
    }
    document.getElementById(`count-${status}`).textContent = state[status].length;
  }

  // Both views draw from state, so whichever is on show is redrawn with it.
  if (view === 'calendar') renderCalendar();
}

function renderTask(task, status) {
  const editing = editingId === task.id;
  // A card with nothing under its title but its deadline has nothing to fold
  // away, so it gets no chevron rather than one that does nothing.
  const collapsible = hasFoldableDetails(task);
  const collapsed = collapsible && task.collapsed === true;

  const li = document.createElement('li');
  li.className =
    'card' + (status === 'done' ? ' completed' : '') + (editing ? ' editing' : '') +
    (collapsed ? ' collapsed' : '');
  li.draggable = false;
  li.dataset.id = task.id;

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'card-action card-action-edit';
  editBtn.title = 'Edit';
  editBtn.innerHTML = EDIT_ICON;
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleEditor(task);
  });
  actions.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'card-action card-action-delete';
  deleteBtn.title = 'Delete';
  deleteBtn.innerHTML = TRASH_ICON;
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteTask(task.id, status);
  });
  actions.appendChild(deleteBtn);

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'card-action card-handle';
  handle.title = 'Drag to move';
  handle.innerHTML = HANDLE_ICON;
  handle.draggable = true;
  actions.appendChild(handle);

  li.appendChild(actions);

  if (editing) {
    li.appendChild(renderTitleInput(task));
    li.appendChild(renderEditRow(task));
  } else {
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = task.text;
    title.addEventListener('click', () => {
      toggleEditor(task);
    });

    if (collapsible) {
      const titleRow = document.createElement('div');
      titleRow.className = 'card-title-row';
      titleRow.appendChild(renderCollapseToggle(task, collapsed));
      titleRow.appendChild(title);
      li.appendChild(titleRow);
    } else {
      li.appendChild(title);
    }

    appendDueRow(li, task);
    if (!collapsed) appendTaskDetails(li, task);
  }

  handle.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: task.id, from: status }));
    e.dataTransfer.effectAllowed = 'move';
    const liRect = li.getBoundingClientRect();
    const handleRect = handle.getBoundingClientRect();
    const offsetX = (handleRect.left - liRect.left) + e.offsetX;
    const offsetY = (handleRect.top - liRect.top) + e.offsetY;
    e.dataTransfer.setDragImage(li, offsetX, offsetY);
    document.body.classList.add('dragging-card');
    requestAnimationFrame(() => li.classList.add('dragging'));
  });
  handle.addEventListener('dragend', () => {
    li.classList.remove('dragging');
    document.body.classList.remove('dragging-card');
    clearDropIndicator();
  });

  return li;
}

// What a collapsed card folds away: the reminder note, the description and the
// importance badge. The deadline is not in the list - it stays on show - so a
// card whose only detail is a due date has nothing to fold and gets no chevron.
function hasFoldableDetails(task) {
  return Boolean(
    (task.remind && task.due) ||
    hasContent(task.additionalDescription) ||
    (task.importance && task.importance !== 'Not Set')
  );
}

// The chevron sits to the left of the title, clear of the buttons over the
// top-right corner, so folding a card never means aiming at a hover-only icon.
function renderCollapseToggle(task, collapsed) {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'card-toggle';
  toggle.title = collapsed ? 'Expand' : 'Collapse';
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.innerHTML = CHEVRON_ICON;
  toggle.addEventListener('click', (e) => {
    // The title beside it opens the editor; this must not do both.
    e.stopPropagation();
    task.collapsed = !collapsed;
    persistAndRender();
  });
  return toggle;
}

// The deadline is the whole point of a card being on the board, so it survives
// folding - as does its countdown, which is the half that keeps changing and
// turns red once the task is late. The per-task "Show countdown" toggle still
// decides whether that half is there at all.
function appendDueRow(li, task) {
  const dueText = formatDue(task.due);
  if (!dueText) return;

  const dueRow = document.createElement('div');
  dueRow.className = 'card-due-row';

  const due = document.createElement('div');
  due.className = 'card-due';
  due.textContent = dueText;
  dueRow.appendChild(due);

  if (task.showCountdown !== false) {
    const countdown = document.createElement('div');
    countdown.className = 'card-countdown';
    countdown.dataset.due = task.due;
    countdown.textContent = formatCountdown(task.due);
    if (countdown.textContent.startsWith('Overdue')) countdown.classList.add('overdue');
    dueRow.appendChild(countdown);
  }

  li.appendChild(dueRow);
}

function appendTaskDetails(li, task) {
  // Without this the reminder is invisible until the card is opened again.
  if (task.remind && task.due) {
    const reminder = document.createElement('div');
    reminder.className = 'card-reminder';
    reminder.textContent = `Reminder ${formatOffset(task.remindOffset)}`;
    if (task.reminderFired) reminder.classList.add('fired');
    li.appendChild(reminder);
  }

  if (hasContent(task.additionalDescription)) {
    const desc = document.createElement('div');
    desc.className = 'card-desc';
    desc.innerHTML = task.additionalDescription;
    desc.querySelectorAll('a[href]').forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        window.tudo.openExternal(a.getAttribute('href'));
      });
    });
    li.appendChild(desc);
  }

  if (task.importance && task.importance !== 'Not Set') {
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    const badge = document.createElement('span');
    badge.className = `badge badge-${task.importance.toLowerCase().replace(/\s+/g, '-')}`;
    badge.textContent = task.importance;
    meta.appendChild(badge);
    li.appendChild(meta);
  }
}

function renderEditRow(task) {
  const draft = editDraft;
  const row = document.createElement('div');
  row.className = 'card-edit-row';

  const topRow = document.createElement('div');
  topRow.className = 'card-edit-top';

  const dueInput = document.createElement('input');
  dueInput.type = 'datetime-local';
  dueInput.className = 'due-input';
  dueInput.value = draft.due || '';
  dueInput.addEventListener('change', () => {
    draft.due = dueInput.value || null;
    syncCountdownToggle();
    // The reminder is measured back from this date, so it follows it.
    syncRemindRow();
  });

  const importanceSelect = document.createElement('select');
  importanceSelect.className = 'importance-select';
  for (const level of IMPORTANCE_LEVELS) {
    const opt = document.createElement('option');
    opt.value = level;
    opt.textContent = level;
    if (draft.importance === level) opt.selected = true;
    importanceSelect.appendChild(opt);
  }
  importanceSelect.addEventListener('change', () => {
    draft.importance = importanceSelect.value;
  });

  topRow.appendChild(dueInput);
  topRow.appendChild(importanceSelect);

  // Sits under the date because that is what it qualifies: with it off the card
  // shows the due date on its own, without the live countdown beside it.
  const countdownToggle = document.createElement('label');
  countdownToggle.className = 'editor-toggle';

  const countdownBox = document.createElement('input');
  countdownBox.type = 'checkbox';
  countdownBox.checked = draft.showCountdown;
  countdownBox.addEventListener('change', () => {
    draft.showCountdown = countdownBox.checked;
  });

  countdownToggle.appendChild(countdownBox);
  countdownToggle.appendChild(document.createTextNode('Show countdown'));

  // There is nothing to count down to until a due date is set, so the toggle
  // greys out while the date field is empty and comes back once one is picked.
  const syncCountdownToggle = () => {
    const hasDue = !!draft.due;
    countdownBox.disabled = !hasDue;
    countdownToggle.classList.toggle('is-disabled', !hasDue);
    countdownToggle.title = hasDue ? '' : 'Set a due date to show a countdown';
  };

  syncCountdownToggle();

  // Ticking the box reveals how far ahead of the due date to fire. There is
  // nothing to count back from without a due date, so both controls follow the
  // date field the way the countdown toggle does.
  const remindToggle = document.createElement('label');
  remindToggle.className = 'editor-toggle';

  const remindBox = document.createElement('input');
  remindBox.type = 'checkbox';
  remindBox.checked = draft.remind;

  const remindSelect = document.createElement('select');
  remindSelect.className = 'importance-select remind-select';
  remindSelect.setAttribute('aria-label', 'When to remind me');
  for (const preset of REMIND_PRESETS) {
    const option = document.createElement('option');
    option.value = String(preset.minutes);
    option.textContent = preset.label;
    remindSelect.appendChild(option);
  }
  const customOption = document.createElement('option');
  customOption.value = REMIND_CUSTOM;
  customOption.textContent = 'Custom...';
  remindSelect.appendChild(customOption);
  remindSelect.value = draft.remindCustom ? REMIND_CUSTOM : String(draft.remindOffset);

  // Shown only for "Custom...": hours and minutes counted back from the due date.
  const customRow = document.createElement('div');
  customRow.className = 'remind-custom';

  const makeCustomField = (label, max, ariaLabel) => {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'remind-number';
    input.min = '0';
    input.max = String(max);
    input.setAttribute('aria-label', ariaLabel);
    const unit = document.createElement('span');
    unit.className = 'remind-unit';
    unit.textContent = label;
    customRow.appendChild(input);
    customRow.appendChild(unit);
    return input;
  };

  const hoursInput = makeCustomField('h', Math.floor(REMIND_MAX_MINUTES / 60), 'Hours before the due time');
  const minutesInput = makeCustomField('m before', 59, 'Minutes before the due time');
  hoursInput.value = String(Math.floor(draft.remindOffset / 60));
  minutesInput.value = String(draft.remindOffset % 60);

  const readCustomFields = () => {
    const hours = Number(hoursInput.value) || 0;
    const mins = Number(minutesInput.value) || 0;
    draft.remindOffset = clampRemindOffset(hours * 60 + mins);
  };

  hoursInput.addEventListener('input', readCustomFields);
  minutesInput.addEventListener('input', readCustomFields);

  remindSelect.addEventListener('change', () => {
    if (remindSelect.value === REMIND_CUSTOM) {
      draft.remindCustom = true;
    } else {
      draft.remindCustom = false;
      draft.remindOffset = clampRemindOffset(Number(remindSelect.value));
      hoursInput.value = String(Math.floor(draft.remindOffset / 60));
      minutesInput.value = String(draft.remindOffset % 60);
    }
    syncRemindRow();
    if (draft.remindCustom) hoursInput.focus();
  });

  const syncRemindRow = () => {
    const hasDue = !!draft.due;
    remindBox.disabled = !hasDue;
    remindToggle.classList.toggle('is-disabled', !hasDue);
    remindToggle.title = hasDue ? '' : 'Set a due date to add a reminder';

    remindSelect.hidden = !hasDue || !draft.remind;
    customRow.hidden = remindSelect.hidden || !draft.remindCustom;
  };

  remindBox.addEventListener('change', () => {
    draft.remind = remindBox.checked;
    syncRemindRow();
    if (!draft.remind) return;
    remindSelect.focus();
  });

  remindToggle.appendChild(remindBox);
  remindToggle.appendChild(document.createTextNode('Remind me'));


  const descEditor = document.createElement('div');
  descEditor.className = 'desc-editor';

  const toolbar = document.createElement('div');
  toolbar.className = 'desc-toolbar';

  const descBox = document.createElement('div');
  descBox.className = 'desc-box';
  descBox.contentEditable = 'true';
  descBox.dataset.placeholder = 'Additional description...';
  descBox.innerHTML = draft.additionalDescription || '';
  descBox.addEventListener('input', () => {
    draft.additionalDescription = descBox.innerHTML;
  });

  const addToolbarButton = (cmd, label, title, onClick) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `desc-btn desc-btn-${cmd}`;
    btn.title = title;
    btn.innerHTML = label;
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', onClick);
    toolbar.appendChild(btn);
    return btn;
  };

  addToolbarButton('bold', '<b>B</b>', 'Bold', () => {
    descBox.focus();
    document.execCommand('bold', false, null);
    draft.additionalDescription = descBox.innerHTML;
  });
  addToolbarButton('italic', '<i>I</i>', 'Italic', () => {
    descBox.focus();
    document.execCommand('italic', false, null);
    draft.additionalDescription = descBox.innerHTML;
  });
  addToolbarButton('underline', '<u>U</u>', 'Underline', () => {
    descBox.focus();
    document.execCommand('underline', false, null);
    draft.additionalDescription = descBox.innerHTML;
  });

  // Electron's renderer does not implement window.prompt() (it returns
  // immediately with no dialog), so the link URL is collected with an
  // inline form instead of a native prompt.
  const linkForm = document.createElement('div');
  linkForm.className = 'desc-link-form';
  linkForm.hidden = true;

  const linkInput = document.createElement('input');
  linkInput.type = 'text';
  linkInput.className = 'desc-link-input';
  linkInput.placeholder = 'https://example.com';

  const linkConfirm = document.createElement('button');
  linkConfirm.type = 'button';
  linkConfirm.className = 'desc-link-confirm';
  linkConfirm.textContent = 'Add';

  let savedLinkRange = null;

  const cancelLinkForm = () => {
    linkForm.hidden = true;
    toolbar.hidden = false;
    descBox.focus();
  };

  const confirmLinkForm = () => {
    let url = linkInput.value.trim();
    linkForm.hidden = true;
    toolbar.hidden = false;
    descBox.focus();
    if (url) {
      if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) {
        url = `https://${url}`;
      }
      if (savedLinkRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedLinkRange);
      }
      document.execCommand('createLink', false, url);
      draft.additionalDescription = descBox.innerHTML;
    }
  };

  linkConfirm.addEventListener('mousedown', (e) => e.preventDefault());
  linkConfirm.addEventListener('click', confirmLinkForm);
  linkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmLinkForm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelLinkForm();
    }
  });
  linkInput.addEventListener('blur', () => {
    if (!linkForm.hidden) cancelLinkForm();
  });

  linkForm.appendChild(linkInput);
  linkForm.appendChild(linkConfirm);

  addToolbarButton('createLink', LINK_ICON, 'Link', () => {
    const sel = window.getSelection();
    savedLinkRange = sel && sel.rangeCount > 0 && descBox.contains(sel.anchorNode)
      ? sel.getRangeAt(0).cloneRange()
      : null;
    toolbar.hidden = true;
    linkForm.hidden = false;
    linkInput.value = '';
    linkInput.focus();
  });

  descEditor.appendChild(toolbar);
  descEditor.appendChild(linkForm);
  descEditor.appendChild(descBox);

  const actions = document.createElement('div');
  actions.className = 'card-edit-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'card-edit-btn card-edit-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('mousedown', (e) => e.preventDefault());
  cancelBtn.addEventListener('click', () => {
    closeEditor();
    render();
  });

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'card-edit-btn card-edit-save';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('mousedown', (e) => e.preventDefault());
  saveBtn.addEventListener('click', () => saveEditor(task));

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);

  syncRemindRow();

  row.appendChild(topRow);
  row.appendChild(countdownToggle);
  row.appendChild(remindToggle);
  row.appendChild(remindSelect);
  row.appendChild(customRow);
  row.appendChild(descEditor);
  row.appendChild(actions);
  return row;
}

// The dragged card is excluded so the index lines up with state[] *after* the
// card has been spliced out, which is what the drop handler works with.
function getDropIndex(list, clientY) {
  const cards = Array.from(list.querySelectorAll('.card:not(.dragging)'));
  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return i;
  }
  return cards.length;
}

function showDropIndicator(list, index) {
  document.querySelectorAll('.drop-indicator').forEach((el) => {
    if (el.parentElement !== list) el.remove();
  });

  let indicator = list.querySelector('.drop-indicator');
  if (!indicator) {
    indicator = document.createElement('li');
    indicator.className = 'drop-indicator';
  }

  const cards = Array.from(list.querySelectorAll('.card:not(.dragging)'));
  const before = cards[index] || null;
  if (indicator.parentElement !== list || indicator.nextElementSibling !== before) {
    list.insertBefore(indicator, before);
  }
}

function clearDropIndicator() {
  document.querySelectorAll('.drop-indicator').forEach((el) => el.remove());
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
}

function setupDropZones() {
  document.querySelectorAll('.card-stack').forEach((list) => {
    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      list.classList.add('drag-over');
      showDropIndicator(list, getDropIndex(list, e.clientY));
    });
    list.addEventListener('dragleave', (e) => {
      if (list.contains(e.relatedTarget)) return;
      list.classList.remove('drag-over');
      list.querySelectorAll('.drop-indicator').forEach((el) => el.remove());
    });
    list.addEventListener('drop', (e) => {
      e.preventDefault();
      const to = list.dataset.status;
      const insertAt = getDropIndex(list, e.clientY);
      clearDropIndicator();
      let payload;
      try {
        payload = JSON.parse(e.dataTransfer.getData('text/plain'));
      } catch {
        return;
      }
      const { id, from } = payload;
      if (!id || !from) return;
      const idx = state[from].findIndex((t) => t.id === id);
      if (idx === -1) return;
      const [task] = state[from].splice(idx, 1);
      state[to].splice(insertAt, 0, task);
      persistAndRender();
    });
  });
}

async function deleteTask(id, status) {
  const task = state[status].find((t) => t.id === id);
  if (!task) return;

  if (localStorage.getItem(SKIP_DELETE_CONFIRM_KEY) !== '1') {
    const confirmed = await confirmDelete(task.text);
    if (!confirmed) return;
  }

  state[status] = state[status].filter((t) => t.id !== id);
  persistAndRender();
}

function setupTrashZone() {
  const zone = document.getElementById('trash-zone');
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    clearDropIndicator();
    let payload;
    try {
      payload = JSON.parse(e.dataTransfer.getData('text/plain'));
    } catch {
      return;
    }
    const { id, from } = payload;
    if (!id || !from) return;

    await deleteTask(id, from);
  });
}

function confirmDelete(taskText) {
  const overlay = document.getElementById('confirm-overlay');
  const message = document.getElementById('confirm-message');
  const skipCheckbox = document.getElementById('confirm-skip');
  const cancelBtn = document.getElementById('confirm-cancel');
  const deleteBtn = document.getElementById('confirm-delete');

  message.textContent = `Delete "${taskText}"?`;
  skipCheckbox.checked = false;
  overlay.hidden = false;

  return new Promise((resolve) => {
    const cleanup = (result) => {
      overlay.hidden = true;
      cancelBtn.removeEventListener('click', onCancel);
      deleteBtn.removeEventListener('click', onDelete);
      overlay.removeEventListener('click', onOverlayClick);
      resolve(result);
    };
    const onCancel = () => cleanup(false);
    const onDelete = () => {
      if (skipCheckbox.checked) {
        localStorage.setItem(SKIP_DELETE_CONFIRM_KEY, '1');
      }
      cleanup(true);
    };
    const onOverlayClick = (e) => {
      if (e.target === overlay) cleanup(false);
    };

    cancelBtn.addEventListener('click', onCancel);
    deleteBtn.addEventListener('click', onDelete);
    overlay.addEventListener('click', onOverlayClick);
  });
}

let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3000);
}

function setupAddZones() {
  document.querySelectorAll('.add-issue-zone').forEach((zone) => {
    const status = zone.dataset.status;
    const btn = zone.querySelector('.new-btn');
    const form = zone.querySelector('.add-form');
    const titleInput = form.querySelector('.add-title');

    const openForm = () => {
      btn.hidden = true;
      form.hidden = false;
      titleInput.focus();
    };
    const closeForm = () => {
      form.hidden = true;
      btn.hidden = false;
      titleInput.value = '';
    };

    btn.addEventListener('click', openForm);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = titleInput.value.trim();
      if (!text) return;
      state[status].push({
        id: uid(),
        text,
        due: null,
        importance: 'Not Set',
        showCountdown: true,
        collapsed: false,
        remind: false,
        remindOffset: 0,
        reminderFired: false,
        additionalDescription: '',
      });
      closeForm();
      persistAndRender();
    });

    titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeForm();
    });

    titleInput.addEventListener('blur', () => {
      if (!titleInput.value.trim()) closeForm();
    });
  });
}

const UPDATE_RECHECK_MS = 6 * 60 * 60 * 1000;

let updateStatus = 'unknown';

function showUpdateState(state) {
  const label = document.getElementById('version-label');
  const button = document.getElementById('update-btn');
  updateStatus = state.status;

  const asButton = (text, title) => {
    label.hidden = true;
    button.hidden = false;
    button.textContent = text;
    button.title = title;
  };
  const asLabel = (text, title) => {
    button.hidden = true;
    label.hidden = false;
    label.textContent = text;
    label.title = title;
  };

  switch (state.status) {
    case 'update-available':
      button.disabled = false;
      asButton(`Update to v${state.latest}`, `You are on v${state.current}. Click to download v${state.latest}.`);
      break;
    case 'downloading':
      button.disabled = true;
      asButton(`Downloading ${state.percent ?? 0}%`, `Downloading v${state.latest}...`);
      break;
    case 'ready':
      button.disabled = false;
      asButton('Restart to update', `v${state.latest} is ready. Click to restart and install.`);
      break;
    case 'latest':
      asLabel('Latest version', `v${state.current} is up to date`);
      break;
    case 'checking':
      asLabel('Checking...', 'Checking for updates');
      break;
    default:
      // Offline, rate limited, or running unpackaged: state the version without
      // claiming anything about whether it is current.
      asLabel(`v${state.current}`, "Couldn't check for updates");
  }
}

async function runUpdateCheck() {
  // A download in flight or an install waiting to run must not be reset.
  if (updateStatus === 'downloading' || updateStatus === 'ready') return;
  try {
    const state = await window.tudo.checkUpdate();
    if (state) showUpdateState(state);
  } catch {
    // Leave whatever the titlebar is already showing.
  }
}

function setupUpdateCheck() {
  document.getElementById('update-btn').addEventListener('click', () => {
    if (updateStatus === 'update-available') {
      window.tudo.downloadUpdate();
    } else if (updateStatus === 'ready') {
      window.tudo.installUpdate();
    }
  });

  window.tudo.onUpdateState(showUpdateState);
  runUpdateCheck();
  setInterval(runUpdateCheck, UPDATE_RECHECK_MS);
}

async function persistAndRender() {
  render();
  syncReminders();
  const result = await window.tudo.saveTasks(state);
  if (!result || !result.ok) {
    showToast("Couldn't save changes");
  }
}

/* --------------------------------------------------------------- reminders */

// The main process does the waiting and the notifying - see main.js. All this
// side has to do is keep it told about what is still pending.
function isRemindPreset(minutes) {
  return REMIND_PRESETS.some((preset) => preset.minutes === minutes);
}

function clampRemindOffset(minutes) {
  if (!Number.isFinite(minutes)) return 0;
  return Math.min(Math.max(Math.round(minutes), 0), REMIND_MAX_MINUTES);
}

// "1 hour before", "1h 30m before", "at the due time".
function formatOffset(minutes) {
  const offset = clampRemindOffset(minutes);
  if (offset === 0) return 'at the due time';

  const preset = REMIND_PRESETS.find((p) => p.minutes === offset);
  if (preset) return preset.label.toLowerCase();

  const hours = Math.floor(offset / 60);
  const mins = offset % 60;
  if (!hours) return `${mins}m before`;
  if (!mins) return `${hours}h before`;
  return `${hours}h ${mins}m before`;
}

// The moment the notification is due. NaN whenever there is nothing to hang it
// off, which is every case the scheduler should skip.
function reminderTimeFor(task) {
  if (!task.remind || !task.due) return NaN;
  const due = Date.parse(task.due);
  if (Number.isNaN(due)) return NaN;
  return due - clampRemindOffset(task.remindOffset) * 60000;
}

function syncReminders() {
  const pending = [];

  for (const status of STATUSES) {
    for (const task of state[status]) {
      if (task.reminderFired) continue;

      const at = reminderTimeFor(task);
      if (Number.isNaN(at)) continue;

      pending.push({
        id: task.id,
        title: task.text,
        body: `Due ${formatDue(task.due)}`,
        at: new Date(at).toISOString(),
      });
    }
  }

  window.tudo.setReminders(pending);
}

// Recorded so a reminder that has gone off stays quiet on the next launch.
function markReminderFired(id) {
  for (const status of STATUSES) {
    const task = state[status].find((t) => t.id === id);
    if (!task || task.reminderFired) continue;
    task.reminderFired = true;
    persistAndRender();
    return;
  }
}

init();
