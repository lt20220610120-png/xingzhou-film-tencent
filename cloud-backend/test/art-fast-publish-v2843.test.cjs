const test=require('node:test'),assert=require('node:assert/strict');
const {episodeNumber,numberedEpisodes,unitHeaders,appendArtEpisodeSnapshot}=require('../src/collab-episodes.cjs');
test('ordinary English words starting with Act and Part are not structural unit headers',()=>{
 const content='30-1 工会 夜 内\nActivate the Dissolution circle.\nActivity continues.\nParticipants move away.\nActing calmly, he waits.';
 assert.deepEqual(unitHeaders(content),[]);
 assert.equal(episodeNumber({title:'第30集',content}),30);
 const episodes=Array.from({length:40},(_,i)=>({title:`第${i+1}集`,content:i===29?content:`${i+1}-1 城市 日 外\n对白`}));
 assert.equal(numberedEpisodes(episodes).length,40);
});
test('same-episode bilingual labels are evidence of one identity, without weakening distinct unit checks',()=>{
 const entry={title:'第1集 / Episode 1',content:'第1集\nEpisode 1\n1-1 城市 日 外\n对白'};
 assert.equal(episodeNumber(entry),1);
 assert.equal(appendArtEpisodeSnapshot({episodes:[],script:''},{episodeNumber:1,...entry}).episodes.length,1);
 assert.equal(unitHeaders(entry.content).length,2,'publication must still see both structural blocks');
 for(const content of ['第1集\nEpisode 2\n1-1 城市','Act 1\nAct 2\n1-1 城市','Chapter 1\n第1集\n1-1 城市','Episode XIX\n1-1 城市'])assert.equal(episodeNumber({title:'第1集',content}),0,content);
 assert.throws(()=>numberedEpisodes([entry,entry]),/编号/);
});
test('legacy single chapter or act labels retain their existing source identity',()=>{
 for(const title of ['第一章','第一回','第1幕','Chapter 1','Act 1'])assert.equal(episodeNumber({title,content:'1-1 城市 日 外\n对白'}),1,title);
 assert.equal(episodeNumber({title:'第1集',content:'第一章\n1-1 城市 日 外\n对白'}),1);
});
