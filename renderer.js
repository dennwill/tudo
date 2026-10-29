const COLUMNS = [
  { id: 'todo', label: 'To-do' },
  { id: 'doing', label: 'Doing' },
  { id: 'onhold', label: 'On Hold' },
  { id: 'done', label: 'Done' },
];
const STATUSES = COLUMNS.map((c) => c.id);
// Events are not a column: they have no workflow status and only appear on the
// calendar. They are a fifth list in the saved data, and ITEM_LISTS is every
// list that holds entries, for the code that treats a task and an event alike.
const EVENTS = 'events';
const ITEM_LISTS = [...STATUSES, EVENTS];
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
const REMIND_MAX_DAYS = 30;
const REMIND_MAX_MINUTES = 60 * 24 * REMIND_MAX_DAYS;

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
const PIN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"></path>
  <circle cx="12" cy="9.5" r="2.5"></circle>
</svg>`;

let state = { todo: [], doing: [], onhold: [], done: [], events: [] };
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
  { id: 'notebook', label: 'Notebook' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'butter', label: 'Butter' },
  { id: 'night-watch', label: 'Night Watch' },
  { id: 'glassmorphism', label: 'Glassmorphism' },
  { id: 'windows-2000', label: 'Windows 2000' },
];
const THEME_KEY = 'tudo-theme';

function applyTheme(id) {
  document.documentElement.dataset.theme = id;
  localStorage.setItem(THEME_KEY, id);
}

// Themes that have been renamed; anyone who had picked one keeps it.
const RENAMED_THEMES = { 'dark-fantasy': 'night-watch', nailong: 'butter' };
const savedTheme = localStorage.getItem(THEME_KEY);
applyTheme(RENAMED_THEMES[savedTheme] || savedTheme || THEMES[0].id);

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

// One tile per theme: a small picture of the app in that theme's own colours,
// with its name underneath. The picture is tagged with the theme's id, and the
// stylesheet does the rest.
function themeTile(theme, checked) {
  const tile = document.createElement('label');
  tile.className = 'theme-tile';
  tile.title = theme.label;

  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'theme';
  input.value = theme.id;
  input.checked = checked;
  input.className = 'theme-radio';
  input.addEventListener('change', () => applyTheme(input.value));
  tile.appendChild(input);

  const preview = document.createElement('span');
  preview.className = 'theme-preview';
  preview.dataset.theme = theme.id;
  preview.setAttribute('aria-hidden', 'true');

  const part = (tag, className, parent) => {
    const el = document.createElement(tag);
    el.className = className;
    parent.appendChild(el);
    return el;
  };

  const bar = part('span', 'tp-bar', preview);
  part('span', 'tp-dot', bar);
  part('span', 'tp-line', bar);

  const body = part('span', 'tp-body', preview);
  // Three columns, with the cards a board would have: two, one, one with a tag.
  const columns = [2, 1, 1];
  columns.forEach((cards, index) => {
    const col = part('span', 'tp-col', body);
    part('span', 'tp-head', col);
    for (let i = 0; i < cards; i++) {
      const card = part('span', 'tp-card', col);
      part('span', 'tp-line', card);
      if (index === 2) part('span', 'tp-pill', card);
      else part('span', 'tp-line short', card);
    }
  });
  tile.appendChild(preview);

  const name = document.createElement('span');
  name.className = 'theme-name';
  name.textContent = theme.label;
  tile.appendChild(name);

  return tile;
}

function setupThemeOptions() {
  const container = document.getElementById('theme-options');
  const current = document.documentElement.dataset.theme;

  for (const theme of THEMES) {
    container.appendChild(themeTile(theme, theme.id === current));
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

// Appearance, columns and sync all live behind the one gear in the titlebar. The
// gear opens a short list of groups; point at one for a moment and its options
// fade in beside the list. Once they are showing, moving to another group swaps
// them at once - the pause is only there so that passing over the list does not
// make the pane flicker open and shut.
function setupSettingsMenu() {
  const btn = document.getElementById('settings-btn');
  const panel = document.getElementById('settings-panel');
  const nav = panel.querySelector('.settings-nav');
  const pane = panel.querySelector('.settings-pages');
  const items = panel.querySelectorAll('.settings-nav-item');
  const pages = panel.querySelectorAll('.settings-page');

  const OPEN_DELAY = 180;
  // Long enough to cross the gap between the list and the pane.
  const CLOSE_DELAY = 300;
  let openTimer = null;
  let closeTimer = null;

  const showPage = (name) => {
    for (const item of items) {
      const active = item.dataset.page === name;
      item.classList.toggle('active', active);
      item.setAttribute('aria-current', String(active));
    }
    for (const page of pages) page.hidden = page.dataset.page !== name;
    pane.scrollTop = 0;
    // The theme previews need more room than the other groups' lists.
    pane.classList.toggle('wide', name === 'appearance');
    pane.classList.add('open');
  };

  const closePane = () => {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    pane.classList.remove('open');
    for (const item of items) {
      item.classList.remove('active');
      item.setAttribute('aria-current', 'false');
    }
  };

  for (const item of items) {
    item.insertAdjacentHTML('beforeend', CHEVRON_ICON);
    const show = () => {
      clearTimeout(openTimer);
      showPage(item.dataset.page);
    };

    item.addEventListener('mouseenter', () => {
      clearTimeout(openTimer);
      if (pane.classList.contains('open')) show();
      else openTimer = setTimeout(show, OPEN_DELAY);
    });
    item.addEventListener('mouseleave', () => clearTimeout(openTimer));
    // The keyboard and a touch screen have no hover, so they do not wait.
    item.addEventListener('focus', show);
    item.addEventListener('click', show);
  }

  // The pane stays while the pointer is on it or the list, and goes once it has
  // been away from both.
  for (const box of [nav, pane]) {
    box.addEventListener('mouseenter', () => clearTimeout(closeTimer));
    box.addEventListener('mouseleave', () => {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(closePane, CLOSE_DELAY);
    });
  }

  const closePanel = () => {
    closePane();
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };

  document.getElementById('changelog-nav').addEventListener('click', () => {
    closePanel();
    openChangelog('all');
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!panel.hidden) {
      closePanel();
      return;
    }
    // Every visit starts from the list alone.
    closePane();
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
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
// The day whose tasks the side panel is showing in place of Upcoming, as a
// dateKey, or null while Upcoming has the panel.
let selectedDay = null;

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
  document.getElementById('columns-nav').hidden = onCalendar;

  btn.innerHTML = onCalendar ? BOARD_ICON : CALENDAR_ICON;
  btn.title = onCalendar ? 'Back to the task board' : 'See due dates on a calendar';
  btn.setAttribute('aria-label', btn.title);

  // Coming back to the calendar starts from Upcoming again.
  if (!onCalendar) selectedDay = null;
  if (onCalendar) {
    fitUpcomingWidth();
    renderCalendar();
  }
}

// The width of the side panel is the user's to set, and is kept between
// restarts. The month grid takes whatever is left.
const UPCOMING_WIDTH_KEY = 'tudo-upcoming-width';
const UPCOMING_WIDTH_DEFAULT = 196;
const UPCOMING_WIDTH_MIN = 150;
// The grid needs room for seven day columns to be readable.
const CAL_GRID_MIN_WIDTH = 320;
// Assigned when the handle is built. The calendar has no width while the board
// is showing, so it is called when the calendar comes back, to fit the saved
// width to the window as it is now.
let fitUpcomingWidth = () => {};

function setupCalendarResizer() {
  const calendar = document.getElementById('calendar');
  const handle = document.getElementById('cal-resizer');
  const panel = document.getElementById('upcoming');

  let width = Number(localStorage.getItem(UPCOMING_WIDTH_KEY));
  if (!Number.isFinite(width) || width < UPCOMING_WIDTH_MIN) width = UPCOMING_WIDTH_DEFAULT;

  // The calendar is hidden while the board is showing, and has no width then.
  const maxWidth = () => {
    const room = calendar.clientWidth;
    if (!room) return Infinity;
    // Less its padding and the gap, which are 10px each.
    return Math.max(UPCOMING_WIDTH_MIN, Math.min(room * 0.6, room - 30 - CAL_GRID_MIN_WIDTH));
  };
  const clamp = (value) => Math.round(Math.min(Math.max(value, UPCOMING_WIDTH_MIN), maxWidth()));

  const apply = () => {
    const shown = clamp(width);
    calendar.style.setProperty('--upcoming-w', `${shown}px`);
    handle.setAttribute('aria-valuenow', String(shown));
    handle.setAttribute('aria-valuemin', String(UPCOMING_WIDTH_MIN));
  };
  const set = (value) => {
    width = clamp(value);
    localStorage.setItem(UPCOMING_WIDTH_KEY, String(width));
    apply();
  };

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panel.getBoundingClientRect().width;
    handle.setPointerCapture(e.pointerId);
    calendar.classList.add('resizing');

    const move = (ev) => set(startWidth + (startX - ev.clientX));
    const end = () => {
      calendar.classList.remove('resizing');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });

  // The handle moves left as the panel grows, so Left is wider.
  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 40 : 10;
    const current = panel.getBoundingClientRect().width;
    if (e.key === 'ArrowLeft') set(current + step);
    else if (e.key === 'ArrowRight') set(current - step);
    else return;
    e.preventDefault();
  });

  handle.addEventListener('dblclick', () => {
    localStorage.removeItem(UPCOMING_WIDTH_KEY);
    width = UPCOMING_WIDTH_DEFAULT;
    apply();
  });

  // A smaller window may no longer have room for the width that was chosen. The
  // choice itself is kept, so a bigger window gets it back.
  window.addEventListener('resize', apply);
  fitUpcomingWidth = apply;
  apply();
}

function setupCalendar() {
  setupCalendarResizer();
  document.getElementById('upcoming-back').addEventListener('click', () => selectDay(null));
  document.getElementById('upcoming-add').addEventListener('click', () => {
    if (selectedDay) openNewTaskDialog(selectedDay, longDayHeading(selectedDay));
  });
  document.getElementById('upcoming-add-event').addEventListener('click', () => {
    if (selectedDay) openEventDialog({ day: selectedDay });
  });
  document.addEventListener('keydown', (e) => {
    // The new-task and event dialogs and the date picker take their own Escape first.
    if (e.key !== 'Escape' || view !== 'calendar' || !selectedDay) return;
    if (!document.getElementById('newtask-overlay').hidden) return;
    if (!document.getElementById('event-overlay').hidden) return;
    selectDay(null);
  });

  document.getElementById('cal-prev').addEventListener('click', () => shiftMonth(-1));
  document.getElementById('cal-next').addEventListener('click', () => shiftMonth(1));
  document.getElementById('cal-today').addEventListener('click', () => {
    calMonth = startOfMonth(new Date());
    renderCalendar();
  });
}

// Clicking the day that is already open closes it again. The cells are marked in
// place rather than redrawn, so a month scrolled down a long way stays put.
function selectDay(key) {
  selectedDay = key === selectedDay ? null : key;

  for (const cell of document.querySelectorAll('#cal-grid .cal-day')) {
    const selected = cell.dataset.key === selectedDay;
    cell.classList.toggle('selected', selected);
    cell.querySelector('.cal-date').setAttribute('aria-pressed', String(selected));
  }

  renderUpcoming();
}

function longDayHeading(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function shiftMonth(delta) {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + delta, 1);
  renderCalendar();
}

// Every dated task and every event, filed under the day it falls on. The stored
// due value is a datetime-local string, so the first ten characters are already
// the day. An event is an entry whose status is EVENTS, and its `task` is the
// event itself - the calendar draws the two kinds differently but files them alike.
// A task has one day; an event has every day from its start to its end.
function tasksByDueDate() {
  const byDate = new Map();

  const file = (key, entry) => {
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(entry);
  };

  for (const status of STATUSES) {
    for (const task of state[status]) {
      if (!task.due || !formatDue(task.due)) continue;
      file(task.due.slice(0, 10), { task, status });
    }
  }

  // An event that runs over several days sits on each of them.
  for (const event of state[EVENTS]) {
    if (!event.due || !formatDue(event.due)) continue;
    for (const key of eventDays(event)) file(key, { task: event, status: EVENTS });
  }

  // Banners, then timed events, then tasks; earliest first within each, so a cell
  // reads down the day like a schedule.
  for (const [key, entries] of byDate) {
    entries.sort((a, b) => dayRank(a, key) - dayRank(b, key) || a.task.due.localeCompare(b.task.due));
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
// still coming. Events stay until they are over, so one that is under way, or an
// all-day one today, is still listed.
function upcomingTasks() {
  const entries = [];

  for (const status of STATUSES) {
    if (status === 'done') continue;
    for (const task of state[status]) {
      if (!task.due || !formatDue(task.due)) continue;
      entries.push({ task, status });
    }
  }

  const now = Date.now();
  for (const event of state[EVENTS]) {
    if (eventEndMs(event) >= now) entries.push({ task: event, status: EVENTS });
  }

  return entries.sort((a, b) => a.task.due.localeCompare(b.task.due));
}

// An event can run over several days, so the calendar files it under each one.
// A mistyped year would otherwise fill the grid for centuries, hence the cap.
const MAX_EVENT_DAYS = 366;

// The last day an event touches. A timed event that ends exactly at midnight
// stops on the day before, instead of leaving a sliver of an empty day behind it.
function eventLastDay(event) {
  const first = event.due.slice(0, 10);
  if (!event.end) return first;
  const last = event.allDay ? event.end.slice(0, 10) : dateKey(new Date(Date.parse(event.end) - 60000));
  return last > first ? last : first;
}

// Every day an event falls on, first to last.
function eventDays(event) {
  const first = event.due.slice(0, 10);
  const last = eventLastDay(event);
  const [year, month, day] = first.split('-').map(Number);
  const days = [first];
  for (let i = 1; i <= MAX_EVENT_DAYS && days[days.length - 1] < last; i++) {
    days.push(dateKey(new Date(year, month - 1, day + i)));
  }
  return days;
}

// When an event is over: its end, or the end of its last day if it lasts all
// day, or its start if it never said when it finishes.
function eventEndMs(event) {
  if (event.allDay) return Date.parse(`${eventLastDay(event)}T23:59:59`);
  return Date.parse(event.end || event.due);
}

// What the event is doing on `dayKey`: "2:00 PM - 3:30 PM" or "All day" for one
// that fits in a day, and for a longer one where it starts, where it finishes,
// or "All day" for the days it simply covers.
function eventTimeRange(event, dayKey = event.due.slice(0, 10)) {
  if (coversWholeDay(event, dayKey)) return 'All day';

  const first = event.due.slice(0, 10);
  const last = eventLastDay(event);
  if (first === last) {
    return event.end ? `${formatTime(event.due)} - ${formatTime(event.end)}` : formatTime(event.due);
  }
  if (dayKey === first) return `From ${formatTime(event.due)}`;
  if (dayKey === last) return `Until ${formatTime(event.end)}`;
  return 'All day';
}

// Does the event take up the whole of `dayKey`? An all-day event does, and so
// does any day strictly between the first and last of a longer one. Those are
// drawn as banners and sit above the events that have a time.
function coversWholeDay(event, dayKey) {
  if (event.allDay) return true;
  return dayKey > event.due.slice(0, 10) && dayKey < eventLastDay(event);
}

// Where an entry sits within a day: events that cover it whole, then events with
// a time, then tasks. A day then reads from what it is, to when things happen in
// it, to what is due - instead of tasks and events interleaved by the clock.
function dayRank({ task, status }, dayKey) {
  if (status !== EVENTS) return 2;
  return coversWholeDay(task, dayKey) ? 0 : 1;
}

// "Thu, Oct 29, 2:00 PM - 3:30 PM": the whole answer to "when", for tooltips and
// notifications that have no heading above them to give the day.
function eventWhen(event) {
  const dayOf = (value) =>
    new Date(value).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  if (eventLastDay(event) === event.due.slice(0, 10)) {
    return `${dayOf(event.due)}, ${eventTimeRange(event)}`;
  }
  if (event.allDay) return `${dayOf(event.due)} - ${dayOf(event.end)}, All day`;
  return `${dayOf(event.due)}, ${formatTime(event.due)} - ${dayOf(event.end)}, ${formatTime(event.end)}`;
}

// Wall-clock arithmetic on "YYYY-MM-DDTHH:MM" strings. It is done as if in UTC so
// that a clock change cannot slip an hour into it: ten o'clock plus an hour is
// eleven, whatever night it falls on.
function wallClockMs(value) {
  return Date.parse(`${value.slice(0, 16)}:00Z`);
}

function addMinutesToDue(value, minutes) {
  return new Date(wallClockMs(value) + minutes * 60000).toISOString().slice(0, 16);
}

function minutesBetweenDues(later, earlier) {
  return (wallClockMs(later) - wallClockMs(earlier)) / 60000;
}

function renderUpcoming() {
  const list = document.getElementById('upcoming-list');
  list.innerHTML = '';

  // Clicking a day lends the panel to that day until it is closed.
  const onDay = selectedDay !== null;
  document.getElementById('calendar').classList.toggle('day-open', onDay);
  document.getElementById('upcoming').classList.toggle('day-mode', onDay);
  document.getElementById('upcoming-back').hidden = !onDay;
  document.getElementById('upcoming-add').hidden = !onDay;
  document.getElementById('upcoming-add-event').hidden = !onDay;
  document.getElementById('upcoming-title').textContent = onDay ? dayHeading(selectedDay) : 'Upcoming';

  if (onDay) {
    renderDayTasks(list);
    return;
  }

  const entries = upcomingTasks();
  document.getElementById('upcoming-count').textContent = entries.length;

  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'upcoming-empty';
    empty.textContent = 'Nothing with a deadline or on the calendar';
    list.appendChild(empty);
    return;
  }

  const now = Date.now();
  // Late work leads, because it is the most urgent thing the panel knows. An
  // event that has started is not late, so it is never counted here.
  const isOverdue = (entry) => entry.status !== EVENTS && Date.parse(entry.task.due) < now;
  const overdue = entries.filter(isOverdue);
  if (overdue.length) list.appendChild(renderUpcomingGroup('Overdue', overdue, true));

  // An event that began on an earlier day and is still going is listed under
  // today, where it now is, not under the day it began.
  const todayKey = dateKey(new Date());
  const byDay = new Map();
  for (const entry of entries) {
    if (isOverdue(entry)) continue;
    const startKey = entry.task.due.slice(0, 10);
    const key = entry.status === EVENTS && startKey < todayKey ? todayKey : startKey;
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
  if (status === EVENTS) return renderUpcomingEvent(task);

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

// Everything due on the selected day, finished work included: the grid shows it
// there too, and this is the list that is meant to be the full picture of a day.
function renderDayTasks(list) {
  const entries = tasksByDueDate().get(selectedDay) || [];
  document.getElementById('upcoming-count').textContent = entries.length;

  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'upcoming-empty';
    empty.textContent = 'Nothing due or scheduled this day';
    list.appendChild(empty);
    return;
  }

  // The entries come sorted with every event ahead of every task. A day with both
  // gets a heading over each, so the split is plain; a day with only one kind
  // doesn't need to be told what it is.
  const hasEvents = entries.some((entry) => entry.status === EVENTS);
  const hasTasks = entries.some((entry) => entry.status !== EVENTS);
  const label = (text) => {
    const heading = document.createElement('div');
    heading.className = 'up-group-label';
    heading.textContent = text;
    list.appendChild(heading);
  };

  let section = null;
  for (const { task, status } of entries) {
    const kind = status === EVENTS ? 'Events' : 'Tasks';
    if (hasEvents && hasTasks && kind !== section) label(kind);
    section = kind;
    list.appendChild(renderDayTask(task, status));
  }
}

// The tasks the panel has folded. Everything starts open, and this is the
// panel's own memory rather than the board's `collapsed` flag: folding a task
// here should not fold its card there, or sync that to other devices.
const foldedDayTasks = new Set();

// A task in full, as the board's card has it: the whole title, the time and the
// column, the countdown, the reminder, the description and the importance. Only
// the title opens the task - the description holds links, which cannot sit
// inside a button and need to stay clickable. The chevron folds away what the
// board's chevron folds: the reminder, description and importance.
function renderDayTask(task, status) {
  if (status === EVENTS) return renderDayEvent(task, selectedDay);

  const done = status === 'done';
  const overdue = !done && Date.parse(task.due) < Date.now();
  const foldable = hasFoldableDetails(task);
  const folded = foldable && foldedDayTasks.has(task.id);

  const card = document.createElement('div');
  card.className =
    'day-task' + (done ? ' done' : '') + (overdue ? ' overdue' : '') + (folded ? ' collapsed' : '');

  const top = document.createElement('div');
  top.className = 'day-task-top';

  if (foldable) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'card-toggle';
    toggle.innerHTML = CHEVRON_ICON;
    const sync = (isFolded) => {
      toggle.title = isFolded ? 'Expand' : 'Collapse';
      toggle.setAttribute('aria-expanded', String(!isFolded));
    };
    sync(folded);
    // Flipped in place rather than redrawn, so the list keeps its scroll.
    toggle.addEventListener('click', () => {
      const nowFolded = card.classList.toggle('collapsed');
      if (nowFolded) foldedDayTasks.add(task.id);
      else foldedDayTasks.delete(task.id);
      sync(nowFolded);
    });
    top.appendChild(toggle);
  }

  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'day-task-head';
  head.title = 'Open on the board';

  const dot = document.createElement('span');
  dot.className = `icon-dot dot-${status}`;
  head.appendChild(dot);

  const title = document.createElement('span');
  title.className = 'day-task-title';
  title.textContent = task.text;
  head.appendChild(title);

  head.addEventListener('click', () => openTaskFromCalendar(task, status));
  top.appendChild(head);
  card.appendChild(top);

  const meta = document.createElement('div');
  meta.className = 'up-meta';
  meta.textContent = `${formatTime(task.due)} - ${COLUMN_LABELS[status]}`;
  card.appendChild(meta);

  // Nothing is counting down to a finished task. The class is the board's, so
  // the one-second tick that keeps the cards current keeps this current too.
  if (!done && task.showCountdown !== false) {
    const countdown = document.createElement('div');
    countdown.className = 'card-countdown';
    countdown.dataset.due = task.due;
    countdown.textContent = formatCountdown(task.due);
    if (countdown.textContent.startsWith('Overdue')) countdown.classList.add('overdue');
    card.appendChild(countdown);
  }

  if (foldable) {
    const details = document.createElement('div');
    details.className = 'day-details';
    appendTaskDetails(details, task);
    card.appendChild(details);
  }
  return card;
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

  // Any day can be opened in the side panel. The whole cell takes the click; the
  // date is a real button so the keyboard and screen readers can reach it too,
  // and its click bubbles up to the cell.
  const heading = longDayHeading(key);
  cell.dataset.key = key;
  cell.title = `See tasks and events on ${heading}`;
  cell.addEventListener('click', () => selectDay(key));
  if (key === selectedDay) cell.classList.add('selected');

  const date = document.createElement('button');
  date.type = 'button';
  date.className = 'cal-date';
  date.textContent = day.getDate();
  date.setAttribute('aria-label', `See tasks and events on ${heading}`);
  date.setAttribute('aria-pressed', String(key === selectedDay));
  cell.appendChild(date);

  for (const { task, status } of byDate.get(key) || []) {
    cell.appendChild(renderCalendarTask(task, status, key));
  }

  return cell;
}

function renderCalendarTask(task, status, dayKey) {
  if (status === EVENTS) return renderCalendarEvent(task, dayKey);

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

  chip.addEventListener('click', (e) => {
    // The chip sits inside a day that opens in the side panel when clicked.
    e.stopPropagation();
    openTaskFromCalendar(task, status);
  });
  return chip;
}

/* ---------------------------------------------------------------- new task */

// A task started from a calendar day. It is only created when Add is pressed, so
// closing the dialog leaves nothing behind.
let newTaskDay = null;
let newTaskOpener = null;
let newTaskTime = null;

function openNewTaskDialog(key, heading) {
  newTaskDay = key;
  newTaskOpener = document.activeElement;
  document.getElementById('newtask-heading').textContent = `New task - ${heading}`;
  document.getElementById('newtask-title').value = '';
  // 9am, a sensible time to land on when only a day has been chosen.
  newTaskTime.setValue(DEFAULT_DUE_TIME);
  document.getElementById('newtask-overlay').hidden = false;
  document.getElementById('newtask-title').focus();
}

function closeNewTaskDialog() {
  newTaskDay = null;
  document.getElementById('newtask-overlay').hidden = true;
  if (newTaskOpener && newTaskOpener.isConnected) newTaskOpener.focus();
  newTaskOpener = null;
}

function setupNewTaskDialog() {
  const overlay = document.getElementById('newtask-overlay');
  const titleInput = document.getElementById('newtask-title');
  titleInput.maxLength = TITLE_MAX_LENGTH;

  newTaskTime = createTimeField({ value: DEFAULT_DUE_TIME });
  document.getElementById('newtask-time').appendChild(newTaskTime.el);

  document.getElementById('newtask-modal').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = titleInput.value.trim();
    if (!text) {
      showToast('A task needs a title');
      titleInput.focus();
      return;
    }

    state.todo.push({
      id: uid(),
      text,
      due: `${newTaskDay}T${newTaskTime.getValue()}`,
      importance: 'Not Set',
      showCountdown: true,
      collapsed: false,
      remind: false,
      remindOffset: 0,
      reminderFired: false,
      additionalDescription: '',
    });
    // The new task lives on the day that was clicked, so there is nothing to
    // navigate to: the calendar redraws with it in place.
    newTaskOpener = null;
    closeNewTaskDialog();
    persistAndRender();
  });

  document.getElementById('newtask-cancel').addEventListener('click', closeNewTaskDialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeNewTaskDialog();
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeNewTaskDialog();
    }
  });
}

/* ------------------------------------------------------------------ events */

// An event is a thing that happens at a time, so unlike a task it has no column,
// no importance and nothing to count down to. It only lives on the calendar, and
// the three renderers below are the calendar's three views of it: a chip in the
// grid, a row in Upcoming, and a card in a day's panel.

function eventTooltip(event) {
  return [event.text, eventWhen(event), event.location].filter(Boolean).join('\n');
}

// An event that is over stays where it was but fades, so a day still reads as a
// record of what happened in it.
function isPastEvent(event) {
  return eventEndMs(event) < Date.now();
}

// What marks an entry as an event: a small calendar, where a task has the dot of
// the column it is in. Shape tells them apart where colour might not.
function eventMark() {
  const mark = document.createElement('span');
  mark.className = 'event-mark';
  mark.innerHTML = CALENDAR_ICON;
  return mark;
}

// "2:00 PM" as "2p" and "2:30 PM" as "2:30p", so a time can sit in front of a
// title on a chip that has little room. A 24-hour clock, or a language whose
// day periods this doesn't recognise, just gets the time as it is.
function formatTimeCompact(due) {
  return formatTime(due)
    .replace(/:00(?=\s?[AP]M)/i, '')
    .replace(/\s?([AP])M/i, (_, period) => period.toLowerCase());
}

function renderCalendarEvent(event, dayKey) {
  const banner = coversWholeDay(event, dayKey);
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className =
    'cal-task event' + (banner ? ' banner' : '') + (isPastEvent(event) ? ' past' : '');
  chip.title = eventTooltip(event);

  chip.appendChild(eventMark());

  // A timed event leads with when it starts - that is what an event is about -
  // on the day it starts. A banner has no time to give, and a longer event's last
  // day only says that it is still going.
  if (!banner && dayKey === event.due.slice(0, 10)) {
    const time = document.createElement('span');
    time.className = 'cal-event-time';
    time.textContent = formatTimeCompact(event.due);
    chip.appendChild(time);
  }

  const text = document.createElement('span');
  text.className = 'cal-task-text';
  text.textContent = event.text;
  chip.appendChild(text);

  chip.addEventListener('click', (e) => {
    // The chip sits inside a day that opens in the side panel when clicked.
    e.stopPropagation();
    openEventDialog({ event });
  });
  return chip;
}

function renderUpcomingEvent(event) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'up-task event';
  row.title = eventTooltip(event);

  row.appendChild(eventMark());

  const text = document.createElement('span');
  text.className = 'up-text';
  text.textContent = event.text;
  row.appendChild(text);

  // Listed under today though it began earlier: say when it ends instead.
  const ongoing = event.due.slice(0, 10) < dateKey(new Date());
  const time = document.createElement('span');
  time.className = 'up-time';
  time.textContent = ongoing
    ? `Until ${formatDayShort(event.end || event.due)}`
    : event.allDay
      ? 'All day'
      : formatTime(event.due);
  row.appendChild(time);

  row.addEventListener('click', () => openEventDialog({ event }));
  return row;
}

function renderDayEvent(event, dayKey) {
  const card = document.createElement('div');
  card.className = 'day-task event' + (isPastEvent(event) ? ' past' : '');

  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'day-task-head';
  head.title = 'Edit event';

  head.appendChild(eventMark());

  const title = document.createElement('span');
  title.className = 'day-task-title';
  title.textContent = event.text;
  head.appendChild(title);

  head.addEventListener('click', () => openEventDialog({ event }));
  card.appendChild(head);

  const when = document.createElement('div');
  when.className = 'up-meta';
  when.textContent = eventTimeRange(event, dayKey);
  card.appendChild(when);

  if (event.location) {
    const where = document.createElement('div');
    where.className = 'event-location';
    where.innerHTML = PIN_ICON;
    const place = document.createElement('span');
    place.textContent = event.location;
    where.appendChild(place);
    card.appendChild(where);
  }

  if (event.remind) {
    const reminder = document.createElement('div');
    reminder.className = 'card-reminder';
    reminder.textContent = `Reminder ${formatOffset(event.remindOffset)}`;
    if (event.reminderFired) reminder.classList.add('fired');
    card.appendChild(reminder);
  }

  if (hasContent(event.additionalDescription)) {
    const desc = document.createElement('div');
    desc.className = 'card-desc';
    desc.innerHTML = event.additionalDescription;
    desc.querySelectorAll('a[href]').forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        window.tudo.openExternal(a.getAttribute('href'));
      });
    });
    card.appendChild(desc);
  }
  return card;
}

/* ------------------------------------------------------- description editor */

// The rich-text box a description is written in - bold, italic, underline and links -
// for a task and for an event alike. `html` is what it starts with, and `onChange`
// is handed the markup after every edit.
function createDescriptionEditor(html, onChange) {
  const descEditor = document.createElement('div');
  descEditor.className = 'desc-editor';

  const toolbar = document.createElement('div');
  toolbar.className = 'desc-toolbar';

  const descBox = document.createElement('div');
  descBox.className = 'desc-box';
  descBox.contentEditable = 'true';
  descBox.dataset.placeholder = 'Additional description...';
  descBox.innerHTML = html || '';
  descBox.addEventListener('input', () => {
    onChange(descBox.innerHTML);
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
    onChange(descBox.innerHTML);
  });
  addToolbarButton('italic', '<i>I</i>', 'Italic', () => {
    descBox.focus();
    document.execCommand('italic', false, null);
    onChange(descBox.innerHTML);
  });
  addToolbarButton('underline', '<u>U</u>', 'Underline', () => {
    descBox.focus();
    document.execCommand('underline', false, null);
    onChange(descBox.innerHTML);
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
      onChange(descBox.innerHTML);
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
  return descEditor;
}

/* ------------------------------------------------------------- event dialog */

// Creates an event or edits one. Nothing is saved until Save is pressed, so
// closing it leaves everything as it was. `draft` holds what the controls are
// bound to and `event` is the event being edited, or null for a new one.
let eventDialog = null;

function openEventDialog({ day, event = null }) {
  const startDay = event ? event.due.slice(0, 10) : day;
  const offset = event ? clampRemindOffset(event.remindOffset) : 0;
  const draft = {
    additionalDescription: event ? event.additionalDescription || '' : '',
    allDay: event ? event.allDay : false,
    due: event ? event.due : `${startDay}T${DEFAULT_DUE_TIME}`,
    remind: event ? event.remind : false,
    remindOffset: offset,
    // Keeps "Custom..." selected for a value that happens to match a preset.
    remindCustom: !isRemindPreset(offset),
  };

  // An all-day event with no end finishes on the day it starts, and a new or
  // open-ended one gets an hour, the usual length for something to start with.
  draft.end =
    event && event.end
      ? event.end
      : draft.allDay
        ? `${startDay}T00:00`
        : addMinutesToDue(draft.due, 60);
  const reminder = createReminderControls(draft);

  eventDialog = {
    event,
    draft,
    reminder,
    opener: document.activeElement,
  };

  document.getElementById('event-heading').textContent = event
    ? 'Edit event'
    : `New event - ${longDayHeading(startDay)}`;
  document.getElementById('event-title').value = event ? event.text : '';
  document.getElementById('event-location').value = event ? event.location : '';
  document.getElementById('event-allday').checked = draft.allDay;
  document.getElementById('event-remind').replaceChildren(reminder.toggle, reminder.select, reminder.customRow);
  document.getElementById('event-description').replaceChildren(
    createDescriptionEditor(draft.additionalDescription, (html) => {
      draft.additionalDescription = html;
    })
  );
  document.getElementById('event-save').textContent = event ? 'Save' : 'Add event';
  document.getElementById('event-delete').hidden = !event;

  mountEventStart();
  mountEventEnd();
  reminder.refresh();
  document.getElementById('event-overlay').hidden = false;
  document.getElementById('event-title').focus();
}

function closeEventDialog() {
  if (!eventDialog) return;
  closeDatePicker();
  const { opener } = eventDialog;
  eventDialog = null;
  document.getElementById('event-overlay').hidden = true;
  if (opener && opener.isConnected) opener.focus();
}

// The start and end fields are rebuilt rather than updated when All day flips,
// because they show a time only for events that have one.
function mountEventStart() {
  const { draft } = eventDialog;
  const field = createDueField({
    value: draft.due,
    dateOnly: draft.allDay,
    onChange: (due) => {
      const before = draft.due;
      draft.due = due;
      // Moving the start moves the end with it, so the event keeps its length
      // instead of being left ending before it begins.
      if (due && before && draft.end) {
        draft.end = addMinutesToDue(draft.end, minutesBetweenDues(due, before));
        mountEventEnd();
      }
      // The reminder counts back from the start, so it follows it.
      eventDialog.reminder.refresh();
    },
  });
  document.getElementById('event-start').replaceChildren(field);
}

function mountEventEnd() {
  const { draft } = eventDialog;
  const field = createDueField({
    value: draft.end,
    dateOnly: draft.allDay,
    onChange: (end) => {
      draft.end = end;
    },
  });
  document.getElementById('event-end').replaceChildren(field);
}

function saveEventDialog() {
  const { event, draft } = eventDialog;
  const titleInput = document.getElementById('event-title');
  const text = titleInput.value.trim();
  if (!text) {
    showToast('An event needs a title');
    titleInput.focus();
    return;
  }
  if (!draft.due) {
    showToast('An event needs a start');
    return;
  }

  // An all-day event is pinned to midnight, and keeps an end only when it runs
  // past its first day: its times are never shown, so they are never kept.
  const day = draft.due.slice(0, 10);
  let due;
  let end;
  if (draft.allDay) {
    due = `${day}T00:00`;
    const endDay = draft.end ? draft.end.slice(0, 10) : day;
    if (endDay < day) {
      showToast('An event must end on or after the day it starts');
      return;
    }
    end = endDay > day ? `${endDay}T00:00` : null;
  } else {
    due = draft.due.slice(0, 16);
    if (!draft.end) {
      showToast('An event needs an end');
      return;
    }
    end = draft.end.slice(0, 16);
    if (end <= due) {
      showToast('An event must end after it starts');
      return;
    }
  }

  const fields = {
    text,
    location: document.getElementById('event-location').value.trim(),
    additionalDescription: draft.additionalDescription,
    allDay: draft.allDay,
    due,
    end,
    remind: draft.remind,
    remindOffset: draft.remindOffset,
  };

  if (event) {
    // Sync may have replaced the object since the dialog opened, or deleted it.
    const target = state[EVENTS].find((e) => e.id === event.id);
    if (!target) {
      showToast('That event was deleted on another device');
      closeEventDialog();
      return;
    }
    // A reminder that has moved - including because the start moved - is a new
    // one, so it is allowed to fire again.
    if (
      target.remind !== fields.remind ||
      target.remindOffset !== fields.remindOffset ||
      target.due !== fields.due ||
      target.allDay !== fields.allDay
    ) {
      target.reminderFired = false;
    }
    Object.assign(target, fields);
  } else {
    state[EVENTS].push({ id: uid(), ...fields, reminderFired: false });
  }

  closeEventDialog();
  persistAndRender();
}

async function deleteEventFromDialog() {
  const { event } = eventDialog;
  if (!event) return;

  if (localStorage.getItem(SKIP_DELETE_CONFIRM_KEY) !== '1') {
    const confirmed = await confirmDelete(event.text);
    if (!confirmed) return;
  }

  state[EVENTS] = state[EVENTS].filter((e) => e.id !== event.id);
  closeEventDialog();
  persistAndRender();
}

function setupEventDialog() {
  const overlay = document.getElementById('event-overlay');
  document.getElementById('event-title').maxLength = TITLE_MAX_LENGTH;
  document.getElementById('event-location').maxLength = 200;

  document.getElementById('event-allday').addEventListener('change', (e) => {
    const { draft } = eventDialog;
    draft.allDay = e.target.checked;
    if (draft.due && draft.end) {
      const endDay = draft.end.slice(0, 10);
      if (draft.allDay) {
        draft.end = `${endDay}T00:00`;
      } else {
        // Midnight is where an all-day event is parked, not a time anyone chose,
        // so turning All day off lands on the usual morning start instead, and
        // ends at the same time of day as it starts, an hour on.
        if (draft.due.endsWith('T00:00')) draft.due = `${draft.due.slice(0, 10)}T${DEFAULT_DUE_TIME}`;
        draft.end = addMinutesToDue(`${endDay}T${draft.due.slice(11, 16)}`, 60);
        if (draft.end <= draft.due) draft.end = addMinutesToDue(draft.due, 60);
      }
    }
    mountEventStart();
    mountEventEnd();
  });

  document.getElementById('event-modal').addEventListener('submit', (e) => {
    e.preventDefault();
    saveEventDialog();
  });
  document.getElementById('event-delete').addEventListener('click', deleteEventFromDialog);
  document.getElementById('event-cancel').addEventListener('click', closeEventDialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeEventDialog();
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeEventDialog();
    }
  });
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
  state = { todo: [], doing: [], onhold: [], done: [], events: [], ...loaded };
  if (!Array.isArray(state[EVENTS])) state[EVENTS] = [];
  state[EVENTS] = state[EVENTS].filter((event) => event && event.text && parseDueValue(event.due));
  for (const event of state[EVENTS]) {
    event.allDay = event.allDay === true;
    event.location = typeof event.location === 'string' ? event.location : '';
    event.additionalDescription = typeof event.additionalDescription === 'string' ? event.additionalDescription : '';
    // An end only means something after the start. An all-day event keeps one
    // only as the day it finishes on, which must come after the day it starts.
    const hasEnd = typeof event.end === 'string' && !!parseDueValue(event.end);
    if (event.allDay) {
      const endDay = hasEnd ? event.end.slice(0, 10) : '';
      event.end = endDay > event.due.slice(0, 10) ? `${endDay}T00:00` : null;
    } else {
      event.end = hasEnd && event.end > event.due ? event.end : null;
    }
    event.remindOffset = clampRemindOffset(event.remindOffset);
    event.remind = event.remind === true;
    event.reminderFired = event.reminderFired === true;
  }
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
  setupNewTaskDialog();
  setupEventDialog();
  setupTaskDetail();
  setupViewToggle();

  document.getElementById('btn-min').addEventListener('click', () => window.tudo.minimize());
  document.getElementById('btn-close').addEventListener('click', () => window.tudo.close());

  setupUpdateCheck();
  window.tudo.onReminderFired(markReminderFired);
  syncReminders();
  setInterval(updateCountdowns, 1000);
  setupSync();
  setupRefresh();
  setupChangelog();
}

function render() {
  // The cards are about to be replaced, and the picker belongs to one of them.
  closeDatePicker();

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
  if (detailDialog) renderTaskDetail();
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

    // The pencil is the way into the editor; anywhere else on the card shows the
    // task in full. The buttons (edit, delete, drag, fold) and the links in a
    // description do their own thing, so a click that lands on one is theirs.
    li.addEventListener('click', (e) => {
      if (e.target.closest('button, a')) return;
      openTaskDetail(task);
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
    // The card around it opens the task's details; this must not do both.
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

/* ------------------------------------------------------------ task details */

// Clicking a card opens it here: the whole task at a size that is easy to read,
// with everything a folded card hides. It only shows - the pencil on the card is
// the one way into the editor. `detailDialog` remembers which task is open (by
// id, so a sync that replaces the object doesn't lose it) and what to refocus.
let detailDialog = null;

function findTask(id) {
  for (const status of STATUSES) {
    const task = state[status].find((t) => t.id === id);
    if (task) return { task, status };
  }
  return null;
}

function openTaskDetail(task) {
  detailDialog = { id: task.id, opener: document.activeElement };
  renderTaskDetail();
  document.getElementById('detail-overlay').hidden = false;
  document.getElementById('detail-close').focus();
}

function closeTaskDetail() {
  if (!detailDialog) return;
  const { opener } = detailDialog;
  detailDialog = null;
  document.getElementById('detail-overlay').hidden = true;
  if (opener && opener.isConnected) opener.focus();
}

// Drawn from the task as it is now, and again whenever the board is redrawn, so
// a change arriving from another device shows up, and a task deleted there closes
// the dialog instead of leaving its ghost on screen.
function renderTaskDetail() {
  const found = findTask(detailDialog.id);
  if (!found) {
    closeTaskDetail();
    return;
  }
  const { task, status } = found;

  document.getElementById('detail-modal').classList.toggle('completed', status === 'done');
  document.getElementById('detail-dot').className = `icon-dot dot-${status}`;
  document.getElementById('detail-status').textContent = COLUMN_LABELS[status];
  document.getElementById('detail-title').textContent = task.text;

  // The card's own pieces, so the two can never describe a task differently. The
  // dialog is never folded: showing what a folded card hides is what it is for.
  const body = document.getElementById('detail-body');
  body.replaceChildren();
  appendDueRow(body, task);
  appendTaskDetails(body, task);
  if (!body.childElementCount) {
    const empty = document.createElement('div');
    empty.className = 'detail-empty';
    empty.textContent = 'No due date, reminder or description';
    body.appendChild(empty);
  }
}

function setupTaskDetail() {
  const overlay = document.getElementById('detail-overlay');
  document.getElementById('detail-close').addEventListener('click', closeTaskDetail);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeTaskDetail();
  });
  // On the document, not the dialog: clicking its text leaves the focus nowhere
  // inside it, and Escape should still close it.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && detailDialog) {
      e.stopPropagation();
      closeTaskDetail();
    }
  });
}

/* ------------------------------------------------------------- date picker */

// The browser's own date and time pickers cannot be themed past light or dark,
// and on a card the date field was squeezed down to nothing but its icon. These
// are built from the same variables as everything else, so they follow whichever
// theme is on. A due value is still the "YYYY-MM-DDTHH:MM" string the native
// field produced, so nothing that reads one has to change.

const DEFAULT_DUE_TIME = '09:00';
// The times people most often mean, one tap away.
const TIME_PRESETS = ['09:00', '12:00', '17:00', '21:00'];
const USE_12H =
  new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 === true;
const DAY_PICKER_ROWS = 6;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseTimeValue(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value || '');
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

function parseDueValue(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '');
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}

// "Oct 6, 5:00 PM" - the year only when it is not this one, so the label still
// fits in a card's width.
function formatDueShort(due) {
  const date = new Date(due);
  if (Number.isNaN(date.getTime())) return '';
  const options = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  return date.toLocaleString(undefined, options);
}

// "Oct 6" - the date of formatDueShort without its time. `full` gives the weekday
// and year too, for a tooltip.
function formatDayShort(due, full = false) {
  const date = new Date(due);
  if (Number.isNaN(date.getTime())) return '';
  const options = { month: 'short', day: 'numeric' };
  if (full) {
    options.weekday = 'long';
    options.year = 'numeric';
  } else if (date.getFullYear() !== new Date().getFullYear()) {
    options.year = 'numeric';
  }
  return date.toLocaleDateString(undefined, options);
}

function formatPresetTime(time) {
  const { hour, minute } = parseTimeValue(time);
  const options = USE_12H
    ? { hour: 'numeric', minute: minute ? '2-digit' : undefined }
    : { hour: '2-digit', minute: '2-digit' };
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, options);
}

function addMonths(date, delta) {
  const target = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

// Hour and minute fields you can type into, step with the arrow keys or the
// wheel, or skip past with a preset. Used on its own in the new-task dialog and
// under the month grid in the date picker.
function createTimeField({ value = DEFAULT_DUE_TIME, onChange = () => {} } = {}) {
  let { hour, minute } = parseTimeValue(value) || parseTimeValue(DEFAULT_DUE_TIME);

  const root = document.createElement('div');
  root.className = 'time-field';

  const box = document.createElement('div');
  box.className = 'time-box';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Time');

  const makePart = (className, label) => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = `time-part ${className}`;
    input.inputMode = 'numeric';
    input.maxLength = 2;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', label);
    input.addEventListener('focus', () => input.select());
    // The click that focuses the field would otherwise drop the selection again.
    input.addEventListener('mouseup', (e) => e.preventDefault());
    return input;
  };

  const hourInput = makePart('time-hour', 'Hour');
  const minuteInput = makePart('time-minute', 'Minute');
  const separator = document.createElement('span');
  separator.className = 'time-sep';
  separator.textContent = ':';

  box.appendChild(hourInput);
  box.appendChild(separator);
  box.appendChild(minuteInput);

  const getValue = () => `${pad2(hour)}:${pad2(minute)}`;
  const ampmButtons = [];
  const presetButtons = [];

  const show = () => {
    hourInput.value = USE_12H ? String(hour % 12 || 12) : pad2(hour);
    minuteInput.value = pad2(minute);
    for (const { button, pm } of ampmButtons) {
      button.setAttribute('aria-pressed', String(pm === hour >= 12));
    }
    for (const { button, time } of presetButtons) {
      button.classList.toggle('is-active', time === getValue());
    }
  };

  // Only a real change is reported, so tabbing through the fields leaves a card
  // with no due date without one.
  const update = (nextHour, nextMinute) => {
    if (nextHour === hour && nextMinute === minute) {
      show();
      return;
    }
    hour = nextHour;
    minute = nextMinute;
    show();
    onChange(getValue());
  };

  const commitHour = () => {
    const n = parseInt(hourInput.value, 10);
    if (Number.isNaN(n) || n < 0 || n > 23) {
      show();
      return;
    }
    // On a 12-hour clock 1-12 keep the current AM or PM, and 13-23 are taken as
    // typed, so "17" lands on 5 PM instead of being refused.
    update(USE_12H && n <= 12 ? (n % 12) + (hour >= 12 ? 12 : 0) : n, minute);
  };

  const commitMinute = () => {
    const n = parseInt(minuteInput.value, 10);
    if (Number.isNaN(n) || n < 0 || n > 59) {
      show();
      return;
    }
    update(hour, n);
  };

  const stepHour = (delta) => update((hour + delta + 24) % 24, minute);
  const stepMinute = (delta) => update(hour, (minute + delta + 60) % 60);

  // A digit that cannot start a valid number is as good as a full one, so the
  // field moves on without waiting for a second keystroke.
  hourInput.addEventListener('input', () => {
    hourInput.value = hourInput.value.replace(/\D/g, '');
    const n = parseInt(hourInput.value, 10);
    if (hourInput.value.length === 2 || n >= (USE_12H ? 2 : 3)) {
      commitHour();
      minuteInput.focus();
    }
  });
  minuteInput.addEventListener('input', () => {
    minuteInput.value = minuteInput.value.replace(/\D/g, '');
    const n = parseInt(minuteInput.value, 10);
    if (minuteInput.value.length === 2 || n >= 6) commitMinute();
  });

  const onPartKeyDown = (input, commit, step) => (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const size = e.shiftKey && input === minuteInput ? 15 : 1;
      step(e.key === 'ArrowUp' ? size : -size);
    } else if (e.key === 'Enter') {
      // Not stopped: inside a form this still submits it, now with the typed value.
      commit();
    } else if (e.key === ':' && input === hourInput) {
      e.preventDefault();
      commitHour();
      minuteInput.focus();
    }
  };
  hourInput.addEventListener('keydown', onPartKeyDown(hourInput, commitHour, stepHour));
  minuteInput.addEventListener('keydown', onPartKeyDown(minuteInput, commitMinute, stepMinute));
  hourInput.addEventListener('blur', commitHour);
  minuteInput.addEventListener('blur', commitMinute);

  // Only while the field has focus, so scrolling past it never changes a time.
  for (const [input, step] of [[hourInput, stepHour], [minuteInput, stepMinute]]) {
    input.addEventListener(
      'wheel',
      (e) => {
        if (document.activeElement !== input) return;
        e.preventDefault();
        step(e.deltaY < 0 ? 1 : -1);
      },
      { passive: false }
    );
  }

  if (USE_12H) {
    const ampm = document.createElement('div');
    ampm.className = 'time-ampm';
    ampm.setAttribute('role', 'group');
    ampm.setAttribute('aria-label', 'AM or PM');
    for (const [label, pm] of [['AM', false], ['PM', true]]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => update((hour % 12) + (pm ? 12 : 0), minute));
      ampm.appendChild(button);
      ampmButtons.push({ button, pm });
    }
    box.appendChild(ampm);
  }

  const presets = document.createElement('div');
  presets.className = 'time-presets';
  for (const time of TIME_PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'time-preset';
    button.textContent = formatPresetTime(time);
    button.addEventListener('click', () => {
      const preset = parseTimeValue(time);
      update(preset.hour, preset.minute);
    });
    presets.appendChild(button);
    presetButtons.push({ button, time });
  }

  root.appendChild(box);
  root.appendChild(presets);
  show();

  return {
    el: root,
    getValue,
    // Shows a value without reporting it, for when the owner is the one setting it.
    setValue(next) {
      const parsed = parseTimeValue(next) || parseTimeValue(DEFAULT_DUE_TIME);
      hour = parsed.hour;
      minute = parsed.minute;
      show();
    },
  };
}

// What sits in the editor in place of the native field: a button showing the due
// date that opens the picker. Removing the date is the picker's Clear button, so
// the field keeps all of a narrow card's width for the date itself.
function createDueField({ value, onChange, dateOnly = false }) {
  let current = value || null;

  const root = document.createElement('div');
  root.className = 'due-field';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'due-trigger';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');

  const icon = document.createElement('span');
  icon.className = 'due-icon';
  icon.innerHTML = CALENDAR_ICON;
  const label = document.createElement('span');
  label.className = 'due-label';
  trigger.appendChild(icon);
  trigger.appendChild(label);

  const sync = () => {
    // `dateOnly` is for an all-day event, whose time is not one anyone chose.
    const text = current ? (dateOnly ? formatDayShort(current) : formatDueShort(current)) : '';
    label.textContent = text || 'Set due date';
    // The short form drops the year, so the full date is a hover away.
    trigger.title = text ? (dateOnly ? formatDayShort(current, true) : formatDue(current)) : 'Choose a due date and time';
    root.classList.toggle('is-empty', !text);
  };

  const set = (next) => {
    current = next;
    sync();
    onChange(next);
  };

  trigger.addEventListener('click', () => {
    if (activePicker && activePicker.trigger === trigger) closeDatePicker();
    else openDatePicker(trigger, () => current, set);
  });

  root.appendChild(trigger);
  sync();
  return root;
}

// One picker at a time, and it belongs to the card it was opened from.
let activePicker = null;

function closeDatePicker(refocus = false) {
  if (!activePicker) return;
  const { pop, trigger, cleanup } = activePicker;
  activePicker = null;
  cleanup();
  pop.remove();
  trigger.setAttribute('aria-expanded', 'false');
  const field = trigger.closest('.due-field');
  if (field) field.classList.remove('is-open');
  if (refocus && trigger.isConnected) trigger.focus();
}

// Fixed to the window rather than the card: the stack a card sits in scrolls and
// clips, which would cut a popover off at the column's edge.
function placeDatePicker(pop, anchor) {
  const margin = 8;
  const gap = 4;
  const viewWidth = document.documentElement.clientWidth;
  const viewHeight = document.documentElement.clientHeight;
  pop.style.maxHeight = `${viewHeight - margin * 2}px`;

  const rect = anchor.getBoundingClientRect();
  const width = pop.offsetWidth;
  const height = pop.offsetHeight;

  // Below the field if it fits, above it if that fits, and failing both beside it,
  // so the date being picked stays in view rather than being covered by the picker.
  let left = Math.min(Math.max(margin, rect.left), viewWidth - width - margin);
  let top = rect.bottom + gap;
  if (top + height > viewHeight - margin) {
    const above = rect.top - gap - height;
    if (above >= margin) {
      top = above;
    } else {
      const toRight = rect.right + gap;
      const toLeft = rect.left - gap - width;
      if (toRight + width <= viewWidth - margin) left = toRight;
      else if (toLeft >= margin) left = toLeft;
      top = Math.max(margin, Math.min(rect.top, viewHeight - margin - height));
    }
  }

  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;
}

function openDatePicker(trigger, getValue, setValue) {
  closeDatePicker();

  const parsed = parseDueValue(getValue());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // The day the keyboard is on, which is not always the day that is chosen.
  let focusDate = parsed ? new Date(parsed.year, parsed.month, parsed.day) : today;
  let viewMonth = startOfMonth(focusDate);

  const selectedKey = () => {
    const value = parseDueValue(getValue());
    return value ? dateKey(new Date(value.year, value.month, value.day)) : null;
  };

  const timeField = createTimeField({
    value: parsed ? `${pad2(parsed.hour)}:${pad2(parsed.minute)}` : DEFAULT_DUE_TIME,
    onChange: (time) => {
      // Setting a time before a day means today.
      setValue(`${selectedKey() || dateKey(today)}T${time}`);
      renderGrid();
    },
  });

  const pop = document.createElement('div');
  pop.className = 'dt-popover';
  pop.tabIndex = -1;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Choose a due date and time');

  const head = document.createElement('div');
  head.className = 'dt-head';
  const makeNav = (text, title, delta) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dt-nav';
    button.textContent = text;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.addEventListener('click', () => {
      focusDate = addMonths(focusDate, delta);
      viewMonth = startOfMonth(focusDate);
      renderGrid();
    });
    return button;
  };
  const title = document.createElement('div');
  title.className = 'dt-month';
  title.setAttribute('aria-live', 'polite');
  head.appendChild(makeNav('‹', 'Previous month', -1));
  head.appendChild(title);
  head.appendChild(makeNav('›', 'Next month', 1));

  const weekdays = document.createElement('div');
  weekdays.className = 'dt-weekdays';
  const weekStart = firstDayOfWeek();
  for (let i = 0; i < 7; i++) {
    // 7 Jan 2024 was a Sunday.
    const label = document.createElement('div');
    label.textContent = new Date(2024, 0, 7 + weekStart + i).toLocaleDateString(undefined, {
      weekday: 'short',
    });
    weekdays.appendChild(label);
  }

  const grid = document.createElement('div');
  grid.className = 'dt-grid';
  grid.setAttribute('role', 'grid');

  const pick = (day) => {
    focusDate = day;
    viewMonth = startOfMonth(day);
    setValue(`${dateKey(day)}T${timeField.getValue()}`);
    renderGrid(true);
  };

  function renderGrid(keepFocus = false) {
    const hadFocus = keepFocus || grid.contains(document.activeElement);
    title.textContent = viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const selected = selectedKey();
    const todayKey = dateKey(today);
    const focusKey = dateKey(focusDate);
    const offset = (viewMonth.getDay() - weekStart + 7) % 7;

    grid.innerHTML = '';
    for (let i = 0; i < DAY_PICKER_ROWS * 7; i++) {
      const day = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1 - offset + i);
      const key = dateKey(day);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dt-day';
      button.textContent = day.getDate();
      button.dataset.key = key;
      button.tabIndex = key === focusKey ? 0 : -1;
      button.setAttribute(
        'aria-label',
        day.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      );
      button.setAttribute('aria-pressed', String(key === selected));
      if (day.getMonth() !== viewMonth.getMonth()) button.classList.add('other-month');
      if (key === todayKey) button.classList.add('today');
      if (key === selected) button.classList.add('selected');
      button.addEventListener('click', () => pick(day));
      grid.appendChild(button);
    }

    if (hadFocus) {
      const target = grid.querySelector(`[data-key="${focusKey}"]`);
      if (target) target.focus({ preventScroll: true });
    }
  }

  // Arrows move by a day or a week, Page Up and Down by a month (a year with
  // Shift), and Enter or Space chooses the day the keyboard is on.
  grid.addEventListener('keydown', (e) => {
    const days = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    let next = null;
    if (days) {
      next = new Date(focusDate.getFullYear(), focusDate.getMonth(), focusDate.getDate() + days);
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      next = addMonths(focusDate, (e.key === 'PageUp' ? -1 : 1) * (e.shiftKey ? 12 : 1));
    }
    if (!next) return;
    e.preventDefault();
    focusDate = next;
    viewMonth = startOfMonth(next);
    renderGrid(true);
  });

  const foot = document.createElement('div');
  foot.className = 'dt-foot';
  const makeFootButton = (text, className, onClick) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `dt-btn ${className}`;
    button.textContent = text;
    button.addEventListener('click', onClick);
    foot.appendChild(button);
    return button;
  };
  makeFootButton('Clear', 'dt-clear', () => {
    setValue(null);
    closeDatePicker(true);
  });
  makeFootButton('Today', 'dt-today', () => pick(today));
  makeFootButton('Done', 'dt-done', () => closeDatePicker(true));

  pop.appendChild(head);
  pop.appendChild(weekdays);
  pop.appendChild(grid);
  pop.appendChild(timeField.el);
  pop.appendChild(foot);

  const onPointerDown = (e) => {
    if (!pop.contains(e.target) && !trigger.contains(e.target)) closeDatePicker();
  };
  // Captured so that Escape closes only the picker: on a card the title field
  // would otherwise take the same keypress as "cancel the whole edit".
  const onKeyDown = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    closeDatePicker(true);
  };
  // It is fixed in place, so it would be left hanging if what it points at moved.
  // Only scrolling that carries the field counts: a text box scrolling its own
  // contents, the picker's, or another column's, leaves it where it was. (The
  // page itself never scrolls - the window is exactly as tall as the board.)
  const onScroll = (e) => {
    const scrolled = e.target;
    if (scrolled.nodeType === 1 && scrolled.contains(trigger)) closeDatePicker();
  };
  // A different width is a different layout, so the picker is closed; a different
  // height is usually just a phone's on-screen keyboard opening for the time
  // fields, so it only moves to stay on screen.
  const openedWidth = window.innerWidth;
  const onResize = () => {
    if (window.innerWidth !== openedWidth) closeDatePicker();
    else placeDatePicker(pop, trigger);
  };
  const onFocusOut = (e) => {
    const next = e.relatedTarget;
    if (next && !pop.contains(next) && !trigger.contains(next)) closeDatePicker();
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);
  pop.addEventListener('focusout', onFocusOut);

  activePicker = {
    pop,
    trigger,
    cleanup() {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    },
  };

  trigger.setAttribute('aria-expanded', 'true');
  const field = trigger.closest('.due-field');
  if (field) field.classList.add('is-open');

  renderGrid();
  document.body.appendChild(pop);
  placeDatePicker(pop, trigger);
  const start = grid.querySelector(`[data-key="${dateKey(focusDate)}"]`);
  if (start) start.focus({ preventScroll: true });
}

// The "Remind me" checkbox, the preset select and the custom hours/minutes row,
// bound to `draft` (remind, remindOffset, remindCustom). Shared by the card
// editor and the event dialog, so a reminder is set the same way in both.
// `hasDate` says whether there is a date to count back from; without one the
// controls grey out. Call `refresh` whenever that answer may have changed.
function createReminderControls(draft, hasDate = () => !!draft.due) {
  const toggle = document.createElement('label');
  toggle.className = 'editor-toggle';

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = draft.remind;

  const select = document.createElement('select');
  select.className = 'importance-select remind-select';
  select.setAttribute('aria-label', 'When to remind me');
  for (const preset of REMIND_PRESETS) {
    const option = document.createElement('option');
    option.value = String(preset.minutes);
    option.textContent = preset.label;
    select.appendChild(option);
  }
  const customOption = document.createElement('option');
  customOption.value = REMIND_CUSTOM;
  customOption.textContent = 'Custom...';
  select.appendChild(customOption);
  select.value = draft.remindCustom ? REMIND_CUSTOM : String(draft.remindOffset);

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

  const daysInput = makeCustomField('d', REMIND_MAX_DAYS, 'Days before the due time');
  const hoursInput = makeCustomField('h', 23, 'Hours before the due time');
  const minutesInput = makeCustomField('m before', 59, 'Minutes before the due time');

  // Shows the offset split into its parts. Used when it is set from outside the
  // fields (a preset, or the saved value) and when a typed one has been tidied.
  const showOffset = () => {
    const { days, hours, minutes } = splitRemindOffset(draft.remindOffset);
    daysInput.value = String(days);
    hoursInput.value = String(hours);
    minutesInput.value = String(minutes);
  };
  showOffset();

  // A field's number held to its own range, so 90 minutes cannot be typed in
  // place of 1 hour 30. Anything that isn't a number counts as 0.
  const fieldValue = (input, max) => Math.min(Math.max(Math.round(Number(input.value)) || 0, 0), max);

  const readCustomFields = () => {
    const days = fieldValue(daysInput, REMIND_MAX_DAYS);
    const hours = fieldValue(hoursInput, 23);
    const mins = fieldValue(minutesInput, 59);
    draft.remindOffset = clampRemindOffset(days * 1440 + hours * 60 + mins);
  };

  for (const input of [daysInput, hoursInput, minutesInput]) {
    // The offset follows every keystroke, so Save always sees what is on screen...
    input.addEventListener('input', readCustomFields);
    // ...and leaving a field corrects what it shows, including 30 days and a bit,
    // which is past the longest reminder and so comes back as exactly 30.
    input.addEventListener('change', () => {
      readCustomFields();
      showOffset();
    });
  }

  select.addEventListener('change', () => {
    if (select.value === REMIND_CUSTOM) {
      draft.remindCustom = true;
    } else {
      draft.remindCustom = false;
      draft.remindOffset = clampRemindOffset(Number(select.value));
      showOffset();
    }
    refresh();
    if (draft.remindCustom) daysInput.focus();
  });

  const refresh = () => {
    const available = hasDate();
    box.disabled = !available;
    toggle.classList.toggle('is-disabled', !available);
    toggle.title = available ? '' : 'Set a due date to add a reminder';

    select.hidden = !available || !draft.remind;
    customRow.hidden = select.hidden || !draft.remindCustom;
  };

  box.addEventListener('change', () => {
    draft.remind = box.checked;
    refresh();
    if (!draft.remind) return;
    select.focus();
  });

  toggle.appendChild(box);
  toggle.appendChild(document.createTextNode('Remind me'));

  return { toggle, select, customRow, refresh };
}

function renderEditRow(task) {
  const draft = editDraft;
  const row = document.createElement('div');
  row.className = 'card-edit-row';

  const topRow = document.createElement('div');
  topRow.className = 'card-edit-top';

  const dueField = createDueField({
    value: draft.due,
    onChange: (due) => {
      draft.due = due;
      syncCountdownToggle();
      // The reminder is measured back from this date, so it follows it.
      syncRemindRow();
    },
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

  topRow.appendChild(dueField);
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
  const reminder = createReminderControls(draft);
  const syncRemindRow = reminder.refresh;


  const descEditor = createDescriptionEditor(draft.additionalDescription, (html) => {
    draft.additionalDescription = html;
  });

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
  row.appendChild(reminder.toggle);
  row.appendChild(reminder.select);
  row.appendChild(reminder.customRow);
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

/* --------------------------------------------------------------- changelog */

// The release notes are CHANGELOG.md, read by the main process and parsed by
// changelog.js. The version last seen is kept here, so the "what's new" window
// comes once per update: see TudoChangelog.decide for who gets it.
const LAST_SEEN_VERSION_KEY = 'tudo-last-seen-version';

let changelog = { entries: [], version: '' };
let changelogOpener = null;

// A note is text with `code` spans in it, built as nodes: it is data, never markup.
function appendInline(parent, text) {
  text.split('`').forEach((part, i) => {
    if (!part) return;
    if (i % 2) {
      const code = document.createElement('code');
      code.textContent = part;
      parent.appendChild(code);
    } else {
      parent.appendChild(document.createTextNode(part));
    }
  });
}

function renderChangelogEntries(entries) {
  const body = document.getElementById('changelog-body');
  body.replaceChildren();

  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'changelog-empty';
    empty.textContent = 'No release notes found';
    body.appendChild(empty);
    return;
  }

  for (const entry of entries) {
    const section = document.createElement('section');
    section.className = 'changelog-entry';

    const heading = document.createElement('h3');
    heading.textContent = `v${entry.version}`;
    if (entry.date) {
      const date = document.createElement('span');
      date.className = 'changelog-date';
      date.textContent = entry.date;
      heading.appendChild(date);
    }
    section.appendChild(heading);

    const list = document.createElement('ul');
    for (const note of entry.notes) {
      const item = document.createElement('li');
      appendInline(item, note);
      list.appendChild(item);
    }
    section.appendChild(list);
    body.appendChild(section);
  }
  body.scrollTop = 0;
}

// 'new': what changed since the last visit, with a way on to the rest. 'all':
// every release, which is what the Settings row opens.
function openChangelog(mode, entries = changelog.entries) {
  if (!changelogOpener) changelogOpener = document.activeElement;
  const isNew = mode === 'new';
  const title = !isNew
    ? 'Changelog'
    : entries.length === 1
      ? `What's new in v${entries[0].version}`
      : "What's new";

  document.getElementById('changelog-title').textContent = title;
  document.getElementById('changelog-all').hidden = !isNew || entries.length >= changelog.entries.length;
  document.getElementById('changelog-done').textContent = isNew ? 'Got it' : 'Close';
  renderChangelogEntries(isNew ? entries : changelog.entries);
  document.getElementById('changelog-overlay').hidden = false;
  document.getElementById('changelog-done').focus();
}

function closeChangelog() {
  document.getElementById('changelog-overlay').hidden = true;
  if (changelogOpener && changelogOpener.isConnected) changelogOpener.focus();
  changelogOpener = null;
}

async function setupChangelog() {
  const overlay = document.getElementById('changelog-overlay');
  document.getElementById('changelog-close').addEventListener('click', closeChangelog);
  document.getElementById('changelog-done').addEventListener('click', closeChangelog);
  document.getElementById('changelog-all').addEventListener('click', () => openChangelog('all'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeChangelog();
  });
  // On the document, not the window: clicking its text leaves the focus nowhere
  // inside it, and Escape should still close it.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) {
      e.stopPropagation();
      closeChangelog();
    }
  });

  let info;
  try {
    info = await window.tudo.loadChangelog();
  } catch {
    return;
  }
  changelog = { entries: TudoChangelog.parse(info.markdown), version: info.version };

  let seen = null;
  try {
    seen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
  } catch {
    // Without storage it cannot be remembered, so it is not shown: better missed than every launch.
    return;
  }

  const { show, record } = TudoChangelog.decide({
    entries: changelog.entries,
    seen,
    current: info.version,
    hadData: info.hadData,
  });
  // Recorded before it is shown, so a window closed unread still counts as seen.
  if (record && record !== seen) localStorage.setItem(LAST_SEEN_VERSION_KEY, record);
  if (show.length) openChangelog('new', show);
}

const UPDATE_RECHECK_MS = 6 * 60 * 60 * 1000;

let updateStatus = 'unknown';

function showUpdateState(state) {
  const label = document.getElementById('version-label');
  const button = document.getElementById('update-btn');
  const progress = document.getElementById('update-progress');
  updateStatus = state.status;

  const asButton = (text, title) => {
    label.hidden = true;
    progress.hidden = true;
    button.hidden = false;
    button.textContent = text;
    button.title = title;
  };
  const asLabel = (text, title) => {
    button.hidden = true;
    progress.hidden = true;
    label.hidden = false;
    label.textContent = text;
    label.title = title;
  };
  // A bar that fills as the update comes down, with the cancel button beside it.
  const asProgress = (percent, title) => {
    label.hidden = true;
    button.hidden = true;
    progress.hidden = false;
    progress.title = title;
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    progress.querySelector('.update-bar-fill').style.width = `${value}%`;
    progress.querySelector('.update-bar-text').textContent = `Downloading ${value}%`;
    progress.querySelector('.update-bar').setAttribute('aria-valuenow', String(value));
    // A fresh download starts with a working cancel, whatever the last one did.
    document.getElementById('update-cancel').disabled = false;
  };

  switch (state.status) {
    case 'update-available':
      button.disabled = false;
      asButton(`Update to v${state.latest}`, `You are on v${state.current}. Click to download v${state.latest}.`);
      break;
    case 'downloading':
      asProgress(state.percent ?? 0, `Downloading v${state.latest}...`);
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

  document.getElementById('update-cancel').addEventListener('click', (e) => {
    // Once is enough: the state that comes back puts the button on screen again.
    e.currentTarget.disabled = true;
    window.tudo.cancelUpdate();
  });

  window.tudo.onUpdateState(showUpdateState);
  runUpdateCheck();
  setInterval(runUpdateCheck, UPDATE_RECHECK_MS);
}

async function persistAndRender() {
  render();
  syncReminders();
  // Every change to the board passes through here, so this is the one place sync
  // needs to hear about it. A no-op while sync is off.
  if (syncClient) syncClient.localChanged();
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

  // "2d 3h 15m before", leaving out whichever parts are zero.
  const { days, hours, minutes: mins } = splitRemindOffset(offset);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  return `${parts.join(' ')} before`;
}

// A number of minutes as the days, hours and minutes the custom fields show.
function splitRemindOffset(minutes) {
  const offset = clampRemindOffset(minutes);
  return { days: Math.floor(offset / 1440), hours: Math.floor((offset % 1440) / 60), minutes: offset % 60 };
}

// The moment the notification is due. NaN whenever there is nothing to hang it
// off, which is every case the scheduler should skip.
function reminderTimeFor(task) {
  if (!task.remind || !task.due) return NaN;
  // An all-day event starts at midnight, which is no hour to be woken at, so its
  // reminder counts back from the morning of the day instead.
  const anchor = task.allDay ? `${task.due.slice(0, 10)}T${DEFAULT_DUE_TIME}` : task.due;
  const due = Date.parse(anchor);
  if (Number.isNaN(due)) return NaN;
  return due - clampRemindOffset(task.remindOffset) * 60000;
}

function syncReminders() {
  const pending = [];

  for (const list of ITEM_LISTS) {
    for (const task of state[list]) {
      if (task.reminderFired) continue;

      const at = reminderTimeFor(task);
      if (Number.isNaN(at)) continue;

      pending.push({
        id: task.id,
        title: task.text,
        body: list === EVENTS ? eventWhen(task) : `Due ${formatDue(task.due)}`,
        at: new Date(at).toISOString(),
      });
    }
  }

  window.tudo.setReminders(pending);
}

// Recorded so a reminder that has gone off stays quiet on the next launch.
function markReminderFired(id) {
  for (const list of ITEM_LISTS) {
    const task = state[list].find((t) => t.id === id);
    if (!task || task.reminderFired) continue;
    task.reminderFired = true;
    persistAndRender();
    return;
  }
}

/* -------------------------------------------------------------------- sync */

/*
 * Real-time sync with the other devices that share this one's key - see
 * sync-core.js for how boards are merged and sync-client.js for the connection.
 * This is only the glue: what to call when the board changes, what to do when
 * the merged board comes back, and the controls in the settings menu.
 */

const SyncCore = window.TudoSyncCore;
const SYNC_DEFAULT_URL = SyncCore.DEFAULT_SERVER_URL;

let syncClient = null;
let syncConfig = { enabled: false, url: SYNC_DEFAULT_URL, key: '' };
let syncKeyShown = false;
let syncLeaveTimer = null;

function newSyncClientId() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return 'desk-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// A board with another device's changes folded in. Goes through the same path as
// any edit, so it is drawn, saved and its reminders re-armed.
function applySyncedBoard(board) {
  for (const list of SyncCore.STATUSES) state[list] = board[list];
  // The card being edited may have just been deleted from the other device.
  if (editingId && !STATUSES.some((s) => state[s].some((t) => t.id === editingId))) {
    closeEditor();
  }
  // Likewise an event being edited in the dialog.
  if (eventDialog && eventDialog.event && !state[EVENTS].some((e) => e.id === eventDialog.event.id)) {
    closeEventDialog();
  }
  persistAndRender();
}

function showSyncStatus(status) {
  const line = document.getElementById('sync-status');
  const dot = document.getElementById('sync-dot');

  const others = status.devices - 1;
  const text = {
    off: syncConfig.key ? 'Sync is paused' : 'Not syncing',
    connecting: 'Connecting...',
    connected:
      others > 0
        ? `Synced with ${others} other device${others === 1 ? '' : 's'}`
        : 'Synced - no other device online',
    offline: status.message ? `Offline: ${status.message}` : 'Offline - retrying',
    error: status.message || 'Sync stopped',
  }[status.state];
  const tone =
    status.state === 'connected'
      ? 'is-connected'
      : status.state === 'connecting' || status.state === 'offline'
        ? 'is-busy'
        : status.state === 'error'
          ? 'is-error'
          : '';

  line.textContent = text;
  line.className = `sync-status ${tone}`.trim();

  // The same state, one glance away, for when the menu is shut.
  dot.hidden = status.state === 'off';
  dot.className = `sync-dot ${tone}`.trim();
  dot.title = text;
}

function renderSyncControls() {
  const hasKey = !!syncConfig.key;
  document.getElementById('sync-setup').hidden = hasKey;
  document.getElementById('sync-active').hidden = !hasKey;

  // The server can be chosen with or without a key.
  const urlInput = document.getElementById('sync-url');
  if (document.activeElement !== urlInput) urlInput.value = syncConfig.url;
  if (!hasKey) return;

  const shown = SyncCore.formatKey(syncConfig.key);
  document.getElementById('sync-key').textContent = syncKeyShown ? shown : shown.replace(/[A-Z0-9]/g, '•');
  document.getElementById('sync-reveal').textContent = syncKeyShown ? 'Hide' : 'Show';
  document.getElementById('sync-enabled').checked = syncConfig.enabled;
}

// Saves the settings and re-aims the connection at them.
async function updateSyncConfig(patch) {
  syncConfig = { ...syncConfig, ...patch };
  renderSyncControls();
  const result = await window.tudo.saveSyncConfig(syncConfig);
  if (!result || !result.ok) showToast("Couldn't save sync settings");
  if (syncClient) syncClient.configure(syncConfig);
}

async function copySyncKey(button) {
  const text = SyncCore.formatKey(syncConfig.key);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Older paths: select something and copy it.
    const box = document.createElement('textarea');
    box.value = text;
    box.style.position = 'fixed';
    box.style.opacity = '0';
    document.body.appendChild(box);
    box.select();
    document.execCommand('copy');
    box.remove();
  }
  button.textContent = 'Copied';
  setTimeout(() => {
    button.textContent = 'Copy';
  }, 1500);
}

function resetSyncLeaveButton() {
  clearTimeout(syncLeaveTimer);
  syncLeaveTimer = null;
  document.getElementById('sync-leave').textContent = 'Stop syncing';
}

async function setupSync() {
  const saved = (await window.tudo.loadSync()) || {};
  const cfg = saved.config || {};
  const key = SyncCore.normalizeKey(cfg.key) || '';
  syncConfig = {
    enabled: cfg.enabled === true && !!key,
    url: SyncCore.normalizeServerUrl(cfg.url) || SYNC_DEFAULT_URL,
    key,
  };

  syncClient = new window.TudoSyncClient.SyncClient({
    WebSocketImpl: WebSocket,
    getBoard: () => state,
    applyBoard: applySyncedBoard,
    loadState: async () => saved.state || null,
    saveState: (s) => window.tudo.saveSyncState(s),
    onStatus: showSyncStatus,
    newClientId: newSyncClientId,
  });

  const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

  document.getElementById('sync-new').addEventListener('click', () => {
    syncKeyShown = true;
    updateSyncConfig({ enabled: true, key: SyncCore.generateKey(randomBytes) });
  });

  const join = () => {
    const input = document.getElementById('sync-join-input');
    const joined = SyncCore.normalizeKey(input.value);
    if (!joined) {
      showToast('That is not a valid sync key');
      return;
    }
    input.value = '';
    syncKeyShown = false;
    updateSyncConfig({ enabled: true, key: joined });
  };
  document.getElementById('sync-join').addEventListener('click', join);
  document.getElementById('sync-join-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      join();
    }
  });

  document.getElementById('sync-reveal').addEventListener('click', () => {
    syncKeyShown = !syncKeyShown;
    renderSyncControls();
  });
  document.getElementById('sync-copy').addEventListener('click', (e) => copySyncKey(e.currentTarget));
  document.getElementById('sync-enabled').addEventListener('change', (e) => {
    updateSyncConfig({ enabled: e.target.checked });
  });

  const urlInput = document.getElementById('sync-url');
  urlInput.addEventListener('change', () => {
    const url = SyncCore.normalizeServerUrl(urlInput.value);
    if (!url) {
      showToast('That is not a valid server address');
      urlInput.value = syncConfig.url;
      return;
    }
    if (SyncCore.isInsecureUrl(url)) showToast('ws:// is not encrypted - use wss:// across the internet');
    updateSyncConfig({ url });
  });
  document.getElementById('sync-url-reset').addEventListener('click', () => {
    updateSyncConfig({ url: SYNC_DEFAULT_URL });
  });

  // Forgetting the key is the one thing here that is awkward to undo, so it
  // takes a second press.
  document.getElementById('sync-leave').addEventListener('click', (e) => {
    if (!syncLeaveTimer) {
      e.currentTarget.textContent = 'Click again to confirm';
      syncLeaveTimer = setTimeout(resetSyncLeaveButton, 4000);
      return;
    }
    resetSyncLeaveButton();
    syncKeyShown = false;
    updateSyncConfig({ enabled: false, key: '' });
  });

  // Coming back to the window, or the network coming back, is the moment to
  // reconnect rather than wait out a retry delay.
  window.addEventListener('online', () => syncClient.nudge());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncClient.nudge();
  });

  renderSyncControls();
  showSyncStatus(syncClient.getStatus());
  syncClient.configure(syncConfig);
}

/* ----------------------------------------------------------------- refresh */

let refreshInFlight = false;

// Bring everything up to date now: sync with the relay if it is switched on,
// re-arm the reminders, and ask whether there is a newer version of the app.
// The arrows turn while it works, and for at least half a second even when it is
// instant, because a button that seems to do nothing gets pressed again.
async function refreshAll() {
  if (refreshInFlight) return;
  refreshInFlight = true;

  const button = document.getElementById('refresh-btn');
  button.classList.add('is-spinning');
  button.disabled = true;
  const minimum = new Promise((resolve) => setTimeout(resolve, 500));

  try {
    syncReminders();
    // Not awaited: it can take a while, and has its own place in the titlebar.
    runUpdateCheck();

    const result = syncClient ? await syncClient.refresh() : 'off';
    if (result === 'offline') showToast("Couldn't reach the sync server");
    else if (result === 'error') showToast('The sync server refused - see Sync in the gear menu');
  } finally {
    await minimum;
    button.classList.remove('is-spinning');
    button.disabled = false;
    refreshInFlight = false;
  }
}

function setupRefresh() {
  document.getElementById('refresh-btn').addEventListener('click', refreshAll);

  // F5 and Ctrl+R reload the page in a browser, which in this app would throw
  // away an edit in progress. Here they refresh, which doesn't.
  document.addEventListener('keydown', (e) => {
    const isRefresh = e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r');
    if (!isRefresh) return;
    e.preventDefault();
    refreshAll();
  });

  // The tray menu's Refresh.
  window.tudo.onRefreshRequested(refreshAll);
}

init();
