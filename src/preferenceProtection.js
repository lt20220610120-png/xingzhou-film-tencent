import {protectPreferenceStorage} from '../core/preferenceStorage.js';
if(typeof window!=='undefined'){try{protectPreferenceStorage(window.localStorage,Storage.prototype);}catch{/* Browsers can prohibit storage entirely; optional helpers already catch it. */}}
