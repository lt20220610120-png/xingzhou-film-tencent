import test from 'node:test';
import assert from 'node:assert/strict';
import {formattedTextHTML,formatInline,serializeFormattedDOM} from './formattedText.js';
test('renders headings, emphasis, lists, separators and paragraphs without syntax',()=>{
 const html=formattedTextHTML('# 设定\n**时代**：现代都市\n- 人物甲\n- 人物乙\n---\n结尾');
 assert.match(html,/<h1>设定<\/h1>/);assert.match(html,/<strong>时代<\/strong>/);assert.match(html,/<ul><li>人物甲<\/li><li>人物乙<\/li><\/ul>/);assert.match(html,/<hr>/);assert.ok(!html.includes('**'));
});
test('literal hashes, multiplication, scene direction and escaped symbols survive',()=>{
 const html=formattedTextHTML('C# 与 #话题\n2 * 3 = 6\n△甲：我懂了。\n\\# 非标题\n\\*原样\\*');
 assert.ok(html.includes('C# 与 #话题'));assert.ok(html.includes('2 * 3 = 6'));assert.ok(html.includes('△甲'));assert.ok(html.includes('# 非标题'));assert.ok(html.includes('*原样*'));assert.ok(!html.includes('<h'));
});
test('model HTML and dangerous links cannot execute',()=>{
 const html=formattedTextHTML('<img src=x onerror=alert(1)>\n[危险](javascript:alert)\n[正常](https://example.com/?a=1&b=2)');
 assert.ok(!html.includes('<img'));assert.ok(!html.includes('href="javascript'));assert.ok(html.includes('&lt;img'));assert.ok(html.includes('rel="noreferrer noopener"'));assert.ok(html.includes('&amp;'));
});
test('code preserves literal syntax and incomplete fences',()=>{
 assert.match(formattedTextHTML('```js\n# **literal**\n```'),/<pre><code># \*\*literal\*\*<\/code><\/pre>/);
 assert.match(formattedTextHTML('```\n<hello>'),/&lt;hello&gt;/);
 assert.equal(formatInline('`**literal**`'),'<code>**literal**</code>');
});
test('tables and CRLF render readable rows',()=>{
 const html=formattedTextHTML('| 人物 | 性格 |\r\n| --- | --- |\r\n| 甲 | **勇敢** |');
 assert.match(html,/<th>人物<\/th>/);assert.match(html,/<td><strong>勇敢<\/strong><\/td>/);
});
const text=value=>({nodeType:3,textContent:value});
function element(tag,children=[],attrs={}){return {nodeType:1,tagName:tag.toUpperCase(),childNodes:children,children:children.filter(c=>c.nodeType===1),get textContent(){return children.map(c=>c.textContent).join('');},getAttribute:key=>attrs[key]??null};}
test('edited headings and bold serialize with effects preserved',()=>{
 const root=element('div',[element('h2',[text('时代')]),element('p',[element('strong',[text('现代')]),text('都市')]),element('ul',[element('li',[text('事件1')]),element('li',[text('事件2')])])]);
 assert.equal(serializeFormattedDOM(root),'## 时代\n**现代**都市\n- 事件1\n- 事件2');
});
test('browser inserted paragraphs, blank lines and literal stars serialize safely',()=>{
 const root=element('div',[text('第一行'),element('div',[text('第二行')]),element('div',[element('br')]),element('div',[text('2 * 3')])]);
 assert.equal(serializeFormattedDOM(root),'第一行\n第二行\n\n2 \\* 3');
});
test('browser nested block content and numbered starting point survive editing',()=>{
 const root=element('div',[element('div',[element('p',[text('一')]),element('p',[text('二')])]),element('ol',[element('li',[text('三')])],{start:'3'})]);
 assert.equal(serializeFormattedDOM(root),'一\n二\n3. 三');
});
test('indented and browser nested lists keep their relationship when edited',()=>{
 const root=element('div',[element('ul',[element('li',[text('主事件'),element('ul',[element('li',[text('子事件')])])]),element('li',[text('另一支线')],{'data-indent':'4'})])]);
 assert.equal(serializeFormattedDOM(root),'- 主事件\n  - 子事件\n    - 另一支线');
});
