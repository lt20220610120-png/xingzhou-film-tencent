// Shared by the main workbench and the independent canvas window.
const dropdown = 'select:not([multiple], [size]:not([size="1"]))';
const prepared = new WeakMap();

function syncTitle(select, state) {
  if (select.title !== state.lastTitle) state.note = select.title;
  const option = select.selectedOptions[0];
  state.lastTitle = [option?.label, state.note === option?.label ? '' : state.note].filter(Boolean).join('\n');
  if (select.title === state.lastTitle) return;
  if (state.lastTitle) select.title = state.lastTitle;
  else select.removeAttribute('title');
}

function prepare(select) {
  const state = prepared.get(select);
  if (!select.matches(dropdown)) {
    if (state) {
      state.button.remove();
      if (select.title === state.lastTitle) {
        if (state.note) select.title = state.note;
        else select.removeAttribute('title');
      }
      prepared.delete(select);
    }
    return;
  }
  if (state) {
    if (state.button.parentNode !== select) select.prepend(state.button);
    syncTitle(select, state);
    return;
  }
  if (select.firstElementChild?.matches('button')) return;

  // Chromium owns the selected value and picker interaction. The fallback
  // trigger text lives in UA shadow DOM and cannot be styled for ellipsis.
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'workspace-select-value';
  button.append(document.createElement('selectedcontent'));
  const next = {button, note:select.title, lastTitle:select.title};
  prepared.set(select, next);
  select.prepend(button);
  syncTitle(select, next);
}

if (globalThis.HTMLSelectedContentElement && CSS.supports('appearance', 'base-select')) {
  const observer = new MutationObserver(records => {
    const selects = new Set();
    for (const {target, addedNodes} of records) {
      const owner = (target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement)?.closest('select');
      if (owner) {
        selects.add(owner);
        continue;
      }
      for (const node of addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches('select')) selects.add(node);
        for (const select of node.querySelectorAll('select')) selects.add(select);
      }
    }
    for (const select of selects) if (select.isConnected) prepare(select);
  });
  observer.observe(document.documentElement, {
    childList:true, subtree:true, characterData:true, attributes:true,
    attributeFilter:['label', 'selected', 'multiple', 'size'],
  });
  document.querySelectorAll(dropdown).forEach(prepare);

  for (const type of ['pointerover', 'focusin', 'change']) {
    document.addEventListener(type, event => {
      const select = event.target.closest?.(dropdown);
      if (select && prepared.has(select)) syncTitle(select, prepared.get(select));
    }, true);
  }
}
