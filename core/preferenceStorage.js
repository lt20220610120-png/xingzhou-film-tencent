// UI preferences are optional. Project data/checkpoints must still report a
// failed save, rather than silently falling back to memory.
export function isOptionalPreference(key){return /^(?:xz-role$|xz-last-used-skill$|xz-director-(?:last-project$|last-pane$|pane:|mode:|scene:|model:|quick-settings:|batch-settings:)|xz-model:|xz-canvas-last-route$|xz-admin-tab:|xz-collab-last-(?:section|project)$|xz-creator-|xz-rewrite-pane:|xingzhou-film-v1-data-dir$)/.test(String(key));}
export function protectPreferenceStorage(storage,prototype){
 const originalSet=prototype.setItem,originalGet=prototype.getItem,originalRemove=prototype.removeItem,memory=new Map();
 prototype.setItem=function(key,value){try{originalSet.call(this,key,value);if(this===storage)memory.delete(String(key));}catch(error){if(this!==storage||!isOptionalPreference(key)||String(value).length>65536||!['QuotaExceededError','SecurityError'].includes(error.name))throw error;memory.set(String(key),String(value));}};
 prototype.getItem=function(key){return this===storage&&memory.has(String(key))?memory.get(String(key)):originalGet.call(this,key);};
 prototype.removeItem=function(key){if(this===storage)memory.delete(String(key));return originalRemove.call(this,key);};
 return ()=>{prototype.setItem=originalSet;prototype.getItem=originalGet;prototype.removeItem=originalRemove;};
}
