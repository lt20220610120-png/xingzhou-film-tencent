export const isRetiredTextProfile = profile => profile?.provider === 'doubaoWork';

export function mergeRetiredApiProfiles(current = [], incoming = []) {
  const profiles = new Map();
  for (const item of [...current, ...incoming]) {
    if (!isRetiredTextProfile(item)) continue;
    const key = item.id || JSON.stringify(item);
    if (!profiles.has(key)) profiles.set(key, item);
  }
  return [...profiles.values()];
}

export function retireTextApiProfiles(state) {
  const retired = state.apiProfiles.filter(isRetiredTextProfile);
  if (!retired.length) return state;
  return {
    ...state,
    apiProfiles: state.apiProfiles.filter(profile => !isRetiredTextProfile(profile)),
    retiredApiProfiles: mergeRetiredApiProfiles(Array.isArray(state.retiredApiProfiles) ? state.retiredApiProfiles : [], retired),
    activeApiId: retired.some(profile => profile.id === state.activeApiId) ? null : state.activeApiId,
  };
}
