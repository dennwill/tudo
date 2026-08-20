const STATUSES = ['todo', 'doing', 'done'];
const HANDLE_ICON = `<svg viewBox="0 0 20 20" fill="currentColor">
  <circle cx="7" cy="4" r="1.3"></circle>
  <circle cx="13" cy="4" r="1.3"></circle>
  <circle cx="7" cy="10" r="1.3"></circle>
  <circle cx="13" cy="10" r="1.3"></circle>
  <circle cx="7" cy="16" r="1.3"></circle>
  <circle cx="13" cy="16" r="1.3"></circle>
</svg>`;

let state = { todo: [], doing: [], done: [] };
let editingId = null;

const SKIP_DELETE_CONFIRM_KEY = 'tudo-skip-delete-confirm';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatDue(due) {
  if (!due) return '';
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function init() {
  const loaded = await window.tudo.loadTasks();
  state = { todo: [], doing: [], done: [], ...loaded };
  for (const status of STATUSES) {
    if (!Array.isArray(state[status])) state[status] = [];
    for (const task of state[status]) {
      if (!task.importance) task.importance = 'Medium';
    }
  }

  render();
  setupDropZones();
  setupAddZones();
  setupTrashZone();

  document.getElementById('btn-min').addEventListener('click', () => window.tudo.minimize());
  document.getElementById('btn-close').addEventListener('click', () => window.tudo.close());
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

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'card-handle';
  handle.title = 'Drag to move';
  handle.innerHTML = HANDLE_ICON;
  handle.draggable = true;
  li.appendChild(handle);

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = task.text;
  title.addEventListener('click', () => {
    editingId = editingId === task.id ? null : task.id;
    render();
  });
  li.appendChild(title);

  if (editingId === task.id) {
    li.appendChild(renderEditRow(task));
  } else {
    const dueText = formatDue(task.due);
    if (dueText) {
      const due = document.createElement('div');
      due.className = 'card-due';
      due.textContent = dueText;
      li.appendChild(due);
    }

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    const badge = document.createElement('span');
    badge.className = `badge badge-${task.importance.toLowerCase()}`;
    badge.textContent = task.importance;
    meta.appendChild(badge);
    li.appendChild(meta);
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
  });

  return li;
}

function renderEditRow(task) {
  const row = document.createElement('div');
  row.className = 'card-edit-row';

  const dueInput = document.createElement('input');
  dueInput.type = 'datetime-local';
  dueInput.className = 'due-input';
  dueInput.value = task.due || '';
  dueInput.addEventListener('change', () => {
    task.due = dueInput.value || null;
    persistAndRender();
  });

  const importanceSelect = document.createElement('select');
  importanceSelect.className = 'importance-select';
  for (const level of ['Low', 'Medium', 'High']) {
    const opt = document.createElement('option');
    opt.value = level;
    opt.textContent = level;
    if (task.importance === level) opt.selected = true;
    importanceSelect.appendChild(opt);
  }
  importanceSelect.addEventListener('change', () => {
    task.importance = importanceSelect.value;
    persistAndRender();
  });

  row.appendChild(dueInput);
  row.appendChild(importanceSelect);
  return row;
}

function setupDropZones() {
  document.querySelectorAll('.card-stack').forEach((list) => {
    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      list.classList.add('drag-over');
    });
    list.addEventListener('dragleave', () => list.classList.remove('drag-over'));
    list.addEventListener('drop', (e) => {
      e.preventDefault();
      list.classList.remove('drag-over');
      let payload;
      try {
        payload = JSON.parse(e.dataTransfer.getData('text/plain'));
      } catch {
        return;
      }
      const { id, from } = payload;
      const to = list.dataset.status;
      if (!id || !from || from === to) return;
      const idx = state[from].findIndex((t) => t.id === id);
      if (idx === -1) return;
      const [task] = state[from].splice(idx, 1);
      state[to].push(task);
      persistAndRender();
    });
  });
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
    let payload;
    try {
      payload = JSON.parse(e.dataTransfer.getData('text/plain'));
    } catch {
      return;
    }
    const { id, from } = payload;
    if (!id || !from) return;

    const task = state[from].find((t) => t.id === id);
    if (!task) return;

    if (localStorage.getItem(SKIP_DELETE_CONFIRM_KEY) !== '1') {
      const confirmed = await confirmDelete(task.text);
      if (!confirmed) return;
    }

    state[from] = state[from].filter((t) => t.id !== id);
    persistAndRender();
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
        importance: 'Medium',
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

async function persistAndRender() {
  render();
  const result = await window.tudo.saveTasks(state);
  if (!result || !result.ok) {
    showToast("Couldn't save changes");
  }
}

init();
