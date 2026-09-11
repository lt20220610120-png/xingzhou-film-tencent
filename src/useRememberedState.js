import { useState } from 'react';

export function readRemembered(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

// Write in the input handler, so immediate navigation also retains the choice.
export function useRememberedState(key, fallback) {
  const [value, setValue] = useState(() => readRemembered(key, fallback));
  const change = (next) => {
    try { if (next == null) localStorage.removeItem(key); else localStorage.setItem(key, next); } catch {}
    setValue(next);
  };
  return [value, change];
}
