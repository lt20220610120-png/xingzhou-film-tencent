// Unlike the director's display parser this editor must preserve every byte
// outside the edited scene, including the episode title and CRLF separators.
const lineEnding = text => text.match(/\r\n|\n|\r/)?.[0] || '\n';
const normalizeLineEndings = (text, ending) => text.replace(/\r\n|\n|\r/g, ending);

// Only ATX heading prefixes are presentation syntax. Dialogue hashtags and
// language names such as C# remain literal script content.
export function formatIPScriptText(text) {
 return String(text || '').replace(/^([ \t]*)#{1,6}[ \t]+(?=\S)/gm, '$1');
}

const displayOffsets = source => {
 const prefixes = new Map([...source.matchAll(/^([ \t]*)#{1,6}[ \t]+(?=\S)/gm)]
  .map(match => [match.index + match[1].length, match.index + match[0].length]));
 let display = '';
 const before = [0], after = [0];
 for (let index = 0; index < source.length;) {
  const prefixEnd = prefixes.get(index);
  if (prefixEnd !== undefined) { after[display.length] = prefixEnd; index = prefixEnd; continue; }
  const character = source[index];
  if (character === '\r') { display += '\n'; index += source[index + 1] === '\n' ? 2 : 1; }
  else { display += character; index++; }
  before[display.length] = index;
  after[display.length] = index;
 }
 return { display, before, after };
};

export function applyIPDisplayEdit(source, editedDisplay) {
 const original = String(source || ''), next = normalizeLineEndings(formatIPScriptText(editedDisplay), '\n');
 const { display, before, after } = displayOffsets(original);
 if (display === next) return original;
 let start = 0, end = display.length, nextEnd = next.length;
 while (start < end && start < nextEnd && display[start] === next[start]) start++;
 while (end > start && nextEnd > start && display[end - 1] === next[nextEnd - 1]) { end--; nextEnd--; }
 const removed = display.slice(start, end), inserted = next.slice(start, nextEnd);
 let rawStart = after[start];
 const atLineStart = start === 0 || display[start - 1] === '\n';
 // Keep hidden markers with a renamed title, but remove them with a deleted
 // complete line; an inserted complete line goes before the existing title.
 if (atLineStart && ((removed && (removed.includes('\n') || end === display.length || (display[end] === '\n' && !inserted))) || (!removed && inserted.includes('\n')))) rawStart = before[start];
 const rawEnd = Math.max(rawStart, before[end]);
 const replacement = normalizeLineEndings(inserted, lineEnding(original.slice(rawStart) || original));
 const candidate = original.slice(0, rawStart) + replacement + original.slice(rawEnd);
 const displaysAs = text => normalizeLineEndings(formatIPScriptText(text), '\n') === next;
 if (displaysAs(candidate)) return candidate;
 // Joining a line or moving its first character can turn a hidden heading
 // marker into visible text. Remove presentation markers at that boundary;
 // keep the original line endings and leave other scene buffers untouched.
 const plainCandidate = formatIPScriptText(original.slice(0, before[start])) + replacement + formatIPScriptText(original.slice(after[end]));
 return displaysAs(plainCandidate) ? plainCandidate : normalizeLineEndings(next, lineEnding(original));
}

export function splitIPScenes(text) {
 const source=String(text||'');
 const matches=[...source.matchAll(/^[ \t]*(?:#{1,6}[ \t]*)?(?:[【\[]?[ \t]*场景[ \t]*)?(\d+)[ \t]*[-—－][ \t]*(\d+)(?=[ \t:：.【\]】]|$)[^\r\n]*/gm)];
 return matches.map((m,i)=>({id:`${m[1]}-${m[2]}:${i}`,label:`${m[1]}-${m[2]}`,title:m[0].replace(/^[ \t]*#{1,6}[ \t]*/,''),start:m.index,end:matches[i+1]?.index??source.length,content:source.slice(m.index,matches[i+1]?.index??source.length)}));
}
export function replaceIPScene(text,sceneId,content,{preserveLineEndings=false}={}) {
 const source=String(text||''),scene=splitIPScenes(source).find(s=>s.id===sceneId);
 if(!scene)throw new Error('场景已变化，请重新选择');
 if(content===scene.content)return source;
 const replacement=preserveLineEndings?String(content||''):normalizeLineEndings(String(content||''),lineEnding(scene.content||source));
 const boundary=scene.end<source.length&&!/[\r\n]$/.test(replacement)?(scene.content.match(/(?:\r\n|\n|\r)+$/)?.[0]||lineEnding(source)):'';
 return source.slice(0,scene.start)+replacement+boundary+source.slice(scene.end);
}
