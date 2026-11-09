import {projectVoiceRoster} from './characterVoices.js';

// Selecting a known identity opens its existing profile; it never creates a
// second manual identity or freezes scene associations into an override.
export function existingVoiceSelection(project,ledger,key,defaultProfileId=''){
 const character=projectVoiceRoster(project,ledger).characters.find(c=>c.key===key&&!c.manual);
 if(!character)throw Error('人物资料已变化，请重新选择人物');
 const current=ledger.voiceProfiles?.[key]||{};
 return {character,profile:{...current,draft:{profileId:defaultProfileId,language:character.language||'Chinese',...current.draft}}};
}
