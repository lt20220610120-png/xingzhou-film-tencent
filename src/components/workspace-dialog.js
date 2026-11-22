const queue = [];
let current;
let enabled = true;

function showNext() {
  if (current || !queue.length) return;
  const request = queue.shift();
  const dialog = document.createElement('dialog');
  const title = document.createElement('h2');
  const message = document.createElement('p');
  const actions = document.createElement('div');
  const accept = document.createElement('button');
  const cancel = document.createElement('button');
  dialog.className = 'workspace-dialog';
  dialog.setAttribute('aria-labelledby', 'workspace-dialog-title');
  dialog.setAttribute('aria-describedby', 'workspace-dialog-message');
  title.id = 'workspace-dialog-title';
  title.textContent = request.title;
  message.id = 'workspace-dialog-message';
  message.textContent = request.message;
  actions.className = 'workspace-dialog-actions';
  accept.type = cancel.type = 'button';
  accept.className = request.danger ? 'workspace-dialog-danger' : 'primary';
  accept.textContent = request.acceptLabel;
  cancel.className = 'secondary';
  cancel.textContent = '取消';
  (request.confirm ? cancel : accept).autofocus = true;
  if (request.confirm) actions.append(cancel);
  actions.append(accept);
  dialog.append(title, message, actions);

  const focus = document.activeElement;
  const close = result => {
    if (current?.dialog !== dialog) return;
    dialog.close();
    dialog.remove();
    current = undefined;
    window.removeEventListener('keydown', onKeyDown, true);
    if (focus?.isConnected && !focus.closest('[hidden], [inert]')) focus.focus({ preventScroll: true });
    request.resolve(result);
    showNext();
  };
  const onKeyDown = event => {
    if (!dialog.contains(event.target)) return;
    // Keep shortcuts in the underlying workspace out of the modal.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close(false);
    }
  };
  accept.addEventListener('click', () => close(true));
  cancel.addEventListener('click', () => close(false));
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(false); });
  current = { dialog, close };
  document.body.append(dialog);
  dialog.showModal();
  window.addEventListener('keydown', onKeyDown, true);
}

function enqueue(message, options) {
  if (!enabled) return Promise.resolve(false);
  return new Promise(resolve => {
    queue.push({ ...options, message: String(message ?? ''), resolve });
    showNext();
  });
}

export function confirmAction(message, { danger = false, title = '确认操作', acceptLabel = '确认' } = {}) {
  return enqueue(message, { title, acceptLabel, danger, confirm: true });
}

export function showNotice(message, { title = '提示' } = {}) {
  return enqueue(message, { title, acceptLabel: '知道了' });
}

export function dismissWorkspaceDialogs() {
  for (const request of queue.splice(0)) request.resolve(false);
  current?.close(false);
}

export function setWorkspaceDialogsEnabled(value) {
  enabled = value;
  if (!value) dismissWorkspaceDialogs();
}
