// Presentation only: saved source text is never rewritten merely by viewing it.
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function formatInline(text) {
 const pattern = /\\([\\`*_[\]#>~])|`([^`\n]+)`|\*\*([^\n]+?)\*\*|__([^\n]+?)__|(?<!\w)\*([^*\n]+?)\*(?!\w)|(?<!\w)_([^_\n]+?)_(?!\w)|~~([^\n]+?)~~|\[([^\]\n]+)\]\(([^\s)]+)\)/g;
 let result='',last=0;
 for(const match of String(text).matchAll(pattern)) {
  result+=escape(text.slice(last,match.index));last=match.index+match[0].length;
  const [,literal,code,bold,boldAlt,italic,italicAlt,strike,label,url]=match;
  if(literal)result+=escape(literal);
  else if(code)result+=`<code>${escape(code)}</code>`;
  else if(bold||boldAlt)result+=`<strong>${formatInline(bold||boldAlt)}</strong>`;
  else if(italic||italicAlt)result+=`<em>${formatInline(italic||italicAlt)}</em>`;
  else if(strike)result+=`<s>${formatInline(strike)}</s>`;
  else result+=/^(https?:\/\/|mailto:)/i.test(url)?`<a href="${escape(url)}" rel="noreferrer noopener" target="_blank">${formatInline(label)}</a>`:escape(label);
 }
 return result+escape(String(text).slice(last));
}
export function formattedTextHTML(value) {
 const lines=String(value||'').replace(/\r\n?/g,'\n').split('\n');let html='',list=null,code=null;
 const closeList=()=>{if(list){html+=`</${list}>`;list=null;}};
 for(let i=0;i<lines.length;i++) {
  const line=lines[i],fence=line.match(/^\s*(```+|~~~+)\s*(\S*)/);
  if(code!==null){if(fence&&fence[1][0]===code.fence){html+=`<pre><code>${escape(code.lines.join('\n'))}</code></pre>`;code=null;}else code.lines.push(line);continue;}
  if(fence){closeList();code={fence:fence[1][0],lines:[]};continue;}
  const heading=line.match(/^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/),item=line.match(/^(\s*)(?:([-+*])\s+|(\d+)[.)]\s+)(.+)$/);
  if(item){const type=item[3]?'ol':'ul';if(list!==type){closeList();html+=`<${type}${item[3]?` start="${Number(item[3])}"`:''}>`;list=type;}html+=`<li${item[1]?` data-indent="${item[1].length}" style="margin-left:${Math.min(item[1].length,16)*.5}em"`:''}>${formatInline(item[4])}</li>`;continue;}
  closeList();
  if(heading)html+=`<h${heading[1].length}>${formatInline(heading[2])}</h${heading[1].length}>`;
  else if(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line))html+='<hr>';
  else if(/^ {0,3}>\s?/.test(line))html+=`<blockquote>${formatInline(line.replace(/^ {0,3}>\s?/,''))}</blockquote>`;
  else if(line.includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1]||'')){
   const cells=row=>row.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(c=>c.trim());
   html+=`<table><thead><tr>${cells(line).map(c=>`<th>${formatInline(c)}</th>`).join('')}</tr></thead><tbody>`;i++;
   while((lines[i+1]||'').includes('|'))html+=`<tr>${cells(lines[++i]).map(c=>`<td>${formatInline(c)}</td>`).join('')}</tr>`;
   html+='</tbody></table>';
  }else html+=`<p>${line?formatInline(line):'<br>'}</p>`;
 }
 closeList();if(code!==null)html+=`<pre><code>${escape(code.lines.join('\n'))}</code></pre>`;return html;
}

// Serialize only after an actual edit. Untouched content (including CRLF and
// unusual Markdown) stays byte-for-byte identical in project history.
export function serializeFormattedDOM(root) {
 const inline=node=>{
  if(node.nodeType===3)return node.textContent.replace(/([\\*_`])/g,'\\$1');
  if(node.nodeType!==1)return '';
  const tag=node.tagName.toLowerCase(),text=Array.from(node.childNodes).map(inline).join('');
  if(tag==='br')return '\n';if(tag==='strong'||tag==='b')return `**${text}**`;if(tag==='em'||tag==='i')return `*${text}*`;if(tag==='s'||tag==='strike')return `~~${text}~~`;
  if(tag==='code')return '`'+node.textContent+'`';
  if(tag==='a'&&/^(https?:\/\/|mailto:)/i.test(node.getAttribute('href')||''))return `[${text}](${node.getAttribute('href')})`;
  return text;
 };
 const block=node=>{
  const tag=node.tagName?.toLowerCase();
  if(tag==='pre')return '```\n'+node.textContent+'\n```';if(tag==='hr')return '---';
  if(tag==='ul'||tag==='ol')return Array.from(node.children).map((n,i)=>{
   const children=Array.from(n.childNodes),nested=children.filter(c=>/^(UL|OL)$/.test(c.tagName));
   const content=children.filter(c=>!nested.includes(c)).map(inline).join('').replace(/\n$/,'');
   const indent=' '.repeat(Math.min(Number(n.getAttribute('data-indent')||0),32));
   return indent+(tag==='ol'?`${Number(node.getAttribute('start')||1)+i}. `:'- ')+content+nested.map(c=>'\n'+block(c).split('\n').map(line=>'  '+line).join('\n')).join('');
  }).join('\n');
  if(tag==='table'){const rows=Array.from(node.querySelectorAll('tr')).map(r=>'| '+Array.from(r.children).map(inline).join(' | ')+' |');if(rows.length)rows.splice(1,0,'| '+Array.from(node.querySelector('tr').children).map(()=>'---').join(' | ')+' |');return rows.join('\n');}
  if(tag==='div'&&Array.from(node.children).some(n=>/^(DIV|P|H[1-6]|UL|OL)$/.test(n.tagName)))return Array.from(node.childNodes).map(block).join('\n');
  let text=inline(node).replace(/\n$/,'');
  if(/^h[1-6]$/.test(tag))text='#'.repeat(Number(tag[1]))+' '+text;
  if(tag==='blockquote')text='> '+text;
  return text;
 };
 return Array.from(root.childNodes).map(block).join('\n');
}
