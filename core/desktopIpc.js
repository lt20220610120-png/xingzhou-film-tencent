function receive(value) {
  if (value?.__xingzhouIpcFailure !== true) return value;
  const {__xingzhouIpcFailure, message, ...details} = value;
  throw Object.assign(new Error(message), details);
}

export function desktopIpc(bridge) {
  if (!bridge) return bridge;
  return Object.fromEntries(Object.entries(bridge).map(([name, method]) => [name, typeof method !== 'function' ? method : (...args) => {
    const result = method(...args);
    return typeof result?.then === 'function' ? result.then(receive) : receive(result);
  }]));
}
