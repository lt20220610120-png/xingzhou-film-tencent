// Import-only cleanup. Never run this on saved quick-mode edits or on every render.
export function normalizeDirectorImportText(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
    .split('\n').filter(line => line.trim().length > 0).join('\n');
}
