export const episodeAllowed=(run,number)=>!run.executionScope?.episodes?.length||run.executionScope.episodes.includes(Number(number));
export function validateExecutionScope(value){if(!value||!Array.isArray(value.episodes)||!value.episodes.length||value.episodes.length>500||value.episodes.some(n=>!Number.isSafeInteger(n)||n<1)||!['archive','upscale','edit'].includes(value.until))throw Error('执行范围无效');return {episodes:[...new Set(value.episodes)].sort((a,b)=>a-b),until:value.until,pauseAfter:true};}
export function readExecutionDirective(text){
 // Only explicit episode restrictions become controls. Other instructions use
 // the connected Agent's structured result, never a reply pretending to act.
 if(!/(?:只|先|仅|限定|不要.*后面)/.test(text))return null;
 if(new Set([...text.matchAll(/第\s*([\d一二三四五六七八九十百两]+)\s*集/g)].map(m=>m[1])).size!==1||/(?:不要|不做|跳过).{0,4}第/.test(text))return null;
 const m=/(?:第\s*([\d一二三四五六七八九十百两]+)\s*集)/.exec(text);if(!m)return null;
 const digits={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};const raw=m[1];let n=Number(raw);if(!Number.isInteger(n)){if(raw==='十')n=10;else if(raw.includes('十')){const [a,b]=raw.split('十');n=(digits[a]||1)*10+(digits[b]||0);}else n=digits[raw];}if(!n)return null;
 return validateExecutionScope({episodes:[n],until:/剪辑|交付|成片/.test(text)?'edit':/超分/.test(text)?'upscale':'archive'});
}
export const executionScopeDone=run=>Boolean(run.executionScope?.episodes?.length&&run.executionScope.episodes.every(n=>run.episodes.some(e=>e.number===n&&e.stage==='done')));
