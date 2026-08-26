const COLUMNS = [
  { id: 'todo', label: 'To-do' },
  { id: 'doing', label: 'Doing' },
  { id: 'onhold', label: 'On Hold' },
  { id: 'done', label: 'Done' },
];
const STATUSES = COLUMNS.map((c) => c.id);
const IMPORTANCE_LEVELS = ['Not Set', 'Low', 'Medium', 'High'];
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

let state = { todo: [], doing: [], onhold: [], done: [] };
let editingId = null;
// Edits are held here until Save; Cancel (or opening another card) drops them.
let editDraft = null;

function openEditor(task) {
  editingId = task.id;
  editDraft = {
    due: task.due || null,
    importance: task.importance || 'Not Set',
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
  } else {
    openEditor(task);
  }
  render();
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

function setupThemeSelector() {
  const select = document.getElementById('theme-select');
  for (const theme of THEMES) {
    const opt = document.createElement('option');
    opt.value = theme.id;
    opt.textContent = theme.label;
    select.appendChild(opt);
  }
  select.value = document.documentElement.dataset.theme;
  select.addEventListener('change', () => applyTheme(select.value));
}

applyTheme(localStorage.getItem(THEME_KEY) || THEMES[0].id);

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

function applyColumnVisibility() {
  const board = document.querySelector('.board');
  for (const status of STATUSES) {
    const col = board.querySelector(`.col[data-status="${status}"]`);
    col.hidden = !visibleColumns.includes(status);
  }
  board.style.setProperty('--col-count', visibleColumns.length);
  localStorage.setItem(VISIBLE_COLUMNS_KEY, JSON.stringify(visibleColumns));
}

function setupColumnsMenu() {
  const btn = document.getElementById('columns-btn');
  const panel = document.getElementById('columns-panel');

  for (const column of COLUMNS) {
    const label = document.createElement('label');
    label.className = 'columns-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = column.id;
    checkbox.checked = visibleColumns.includes(column.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        visibleColumns = STATUSES.filter(
          (id) => id === column.id || visibleColumns.includes(id)
        );
      } else {
        visibleColumns = visibleColumns.filter((id) => id !== column.id);
      }
      applyColumnVisibility();
      syncCheckboxes();
    });

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(column.label));
    panel.appendChild(label);
  }

  // The last visible column can't be unchecked - an empty board is useless.
  const syncCheckboxes = () => {
    panel.querySelectorAll('input[type="checkbox"]').forEach((box) => {
      box.checked = visibleColumns.includes(box.value);
      box.disabled = box.checked && visibleColumns.length === 1;
    });
  };

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

  syncCheckboxes();
  applyColumnVisibility();
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
    }
  }

  render();
  setupDropZones();
  setupAddZones();
  setupTrashZone();
  setupThemeSelector();
  setupColumnsMenu();

  document.getElementById('btn-min').addEventListener('click', () => window.tudo.minimize());
  document.getElementById('btn-close').addEventListener('click', () => window.tudo.close());

  setupUpdateCheck();
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
}

function renderTask(task, status) {
  const li = document.createElement('li');
  li.className = 'card' + (status === 'done' ? ' completed' : '');
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

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = task.text;
  title.addEventListener('click', () => {
    toggleEditor(task);
  });
  li.appendChild(title);

  if (editingId === task.id) {
    li.appendChild(renderEditRow(task));
  } else {
    const dueText = formatDue(task.due);
    if (dueText) {
      const dueRow = document.createElement('div');
      dueRow.className = 'card-due-row';

      const due = document.createElement('div');
      due.className = 'card-due';
      due.textContent = dueText;
      dueRow.appendChild(due);

      const countdown = document.createElement('div');
      countdown.className = 'card-countdown';
      countdown.dataset.due = task.due;
      countdown.textContent = formatCountdown(task.due);
      if (countdown.textContent.startsWith('Overdue')) countdown.classList.add('overdue');
      dueRow.appendChild(countdown);

      li.appendChild(dueRow);
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
  saveBtn.addEventListener('click', () => {
    task.due = draft.due;
    task.importance = draft.importance;
    task.additionalDescription = draft.additionalDescription;
    closeEditor();
    persistAndRender();
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);

  row.appendChild(topRow);
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
  const result = await window.tudo.saveTasks(state);
  if (!result || !result.ok) {
    showToast("Couldn't save changes");
  }
}

init();
