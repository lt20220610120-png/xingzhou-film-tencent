// Read existing generated results; write and probe copies only in an isolated QA folder.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {exportMediaFile}=require('../electron/local-media.cjs');
const out=path.resolve('output/review-145/video-export');fs.mkdirSync(out,{recursive:true});
const sources=process.argv.slice(2);if(!sources.length)throw Error('Provide existing source videos to inspect without modifying them');
(async()=>{const checks=[];for(const [i,source] of sources.entries()){
 const dest=path.join(out,'export-'+i+'-'+Date.now());let options;
 const saved=await exportMediaFile({filePath:source,kind:'video',filename:'1-6-1'},{showSaveDialog:async o=>{options=o;return {filePath:dest}},mediaDir:()=>out});
 assert.equal(path.extname(saved),'.mp4');
 const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');assert.equal(hash(saved),hash(source));
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=format_name,duration:stream=codec_type,codec_name','-of','json',saved],{encoding:'utf8',windowsHide:true}));
 assert(probe.streams.some(s=>s.codec_type==='video'));assert(Number(probe.format.duration)>0);
 checks.push({source,saved,sha256:hash(saved),size:fs.statSync(saved).size,options,probe});
 }fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks}));})().catch(e=>{console.error(e);process.exitCode=1});
