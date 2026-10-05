const key=({accountId='',projectId,section})=>`xz-collab-navigation:${encodeURIComponent(accountId)}:${encodeURIComponent(projectId)}:${section}`;
export function readCollabNavigation(scope,storage=globalThis.localStorage){
 try {const value=JSON.parse(storage?.getItem(key(scope))||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}
}
export function rememberCollabNavigation(scope,patch,storage=globalThis.localStorage){
 const value={...readCollabNavigation(scope,storage),...patch};
 try{storage?.setItem(key(scope),JSON.stringify(value));}catch{/* Browsing still works when storage is unavailable. */}
 return value;
}
export const restoredCollabEpisode=(saved,episodes,fallback=episodes[0]?.episodeNumber)=>episodes.some(e=>e.episodeNumber===saved)?saved:fallback;
