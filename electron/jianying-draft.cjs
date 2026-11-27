const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {verifiedDataFile}=require('./workspace-file.cjs');
const contentTemplate=require('./jianying-format/draft_content_template.json');
const metaTemplate=require('./jianying-format/draft_meta_info.json');

const id=()=>randomUUID().toUpperCase();
const compare=new Intl.Collator('zh-CN',{numeric:true}).compare;
const extent=(start,duration)=>({start,duration});
const baseSegment=(material,start,duration)=>({
  id:id(),material_id:material.id,target_timerange:extent(start,duration),
  common_keyframes:[],keyframe_refs:[],visible:true,reverse:false,track_attribute:0,
});
const transform={alpha:1,flip:{horizontal:false,vertical:false},rotation:0,scale:{x:1,y:1},transform:{x:0,y:0}};
const chooseExisting=async (value,dataDir)=>{
  if(!value)return null;
  try{return await verifiedDataFile(value,dataDir);}
  catch{return null;}
};
const shotTag=row=>row.shotId||String(row.note||'').match(/\[shot:([^\]]+)\]/)?.[1];
const mediaKinds={video:/\.(mp4|mov|webm|m4v)$/i,audio:/\.(wav|mp3|m4a|aac|ogg|flac|opus|mp4)$/i};

function indexShots(project){
  const shots=new Map(),aliases=new Map();
  for(const episode of project.episodes||[]){
    for(const shot of episode.storyboardPrompts||episode.prompts||[]){
      const label=String(shot.label||'');
      if(!shot.id||!/^\d+-\d+-\d+$/.test(label))continue;
      const row={...shot,label,episode:Number(label.split('-')[0])};
      shots.set(shot.id,row);
      if(shot.sourcePromptId)aliases.set(shot.sourcePromptId,shot.id);
    }
  }
  return {shots,normalize:key=>shots.has(key)?key:aliases.get(key)};
}

function draftSelections(project,jobs,media,{ids,episode,shotId,scopeShotIds}){
  if(ids&&(!Array.isArray(ids)||ids.length>2000))throw Error('请选择有效的镜头范围');
  if(scopeShotIds&&(!Array.isArray(scopeShotIds)||scopeShotIds.length>2000||scopeShotIds.some(id=>typeof id!=='string')))throw Error('请选择有效的镜头范围');
  const {shots,normalize}=indexShots(project);
  const jobIndex=new Map(jobs.filter(j=>j.projectId===project.id&&j.kind==='video'&&j.status==='success'&&!j.projectVideoDeleted).map(j=>[j.id,j]));
  const mediaIndex=new Map(media.filter(m=>m.kind==='video').map(m=>[m.id,m]));
  const selected=ids?ids.map(item=>jobIndex.get(item?.jobId)||mediaIndex.get(item?.mediaId)).filter(Boolean):[...jobIndex.values(),...mediaIndex.values()];
  const results=new Map();
  for(const row of selected){
    const target=normalize(shotTag(row));
    if(!target)continue;
    (results.get(target)||results.set(target,[]).get(target)).push(row);
  }
  const requested=shotId?[normalize(shotId)]:scopeShotIds?scopeShotIds.map(normalize):ids?[...results.keys()]:[...shots.keys()];
  const scope=[...new Set(requested)].map(key=>shots.get(key)).filter(row=>row&&(!episode||row.episode===Number(episode)));
  return scope.sort((a,b)=>compare(a.label,b.label)).map(shot=>({
    shot,
    // Prefer a downloaded local result. An explicit selection cannot pick up
    // an unrelated alternative, even when it has a matching display label.
    videos:(results.get(shot.id)||[]).sort((a,b)=>Number(Boolean(b.filePath))-Number(Boolean(a.filePath))||
      String(b.completedAt||b.created_at||b.createdAt||'').localeCompare(String(a.completedAt||a.created_at||a.createdAt||''))),
    dubbing:media.filter(m=>m.kind==='audio'&&normalize(shotTag(m))===shot.id),
  }));
}

function track(type,segments,index){
  return {attribute:0,flag:0,id:id(),is_default_name:true,name:'',type,segments:segments.map(s=>({...s,render_index:index}))};
}

function draftContent(rows,name){
  const doc=structuredClone(contentTemplate);
  doc.id=id();doc.name=name;
  const first=rows[0].video;
  doc.canvas_config={height:first.height,width:first.width,ratio:'original'};
  const video=[],audio=[],text=[];
  let cursor=0;
  for(const {shot,video:clip,dubbing} of rows){
    const material={...clip,id:id(),type:'video',category_name:'local',check_flag:63487,
      material_name:path.basename(clip.path),crop_ratio:'free',crop_scale:1,media_path:''};
    material.local_material_id=material.material_id=material.id;
    doc.materials.videos.push(material);
    const segment={...baseSegment(material,cursor,clip.duration),clip:structuredClone(transform),uniform_scale:{on:true,value:1},
      speed:1,volume:1,source_timerange:extent(0,clip.duration),extra_material_refs:[]};
    video.push(segment);
    for(const voice of dubbing){
      const audioMaterial={id:id(),type:'extract_music',path:voice.path,duration:voice.duration,name:path.basename(voice.path),
        category_name:'local',check_flag:3,source_platform:0,wave_points:[]};
      audioMaterial.local_material_id=audioMaterial.music_id=audioMaterial.id;
      doc.materials.audios.push(audioMaterial);
      const duration=Math.min(voice.duration,clip.duration-voice.offset);
      audio.push({...baseSegment(audioMaterial,cursor+voice.offset,duration),speed:1,volume:1,
        source_timerange:extent(0,duration),extra_material_refs:[]});
    }
    const caption=shot.subtitle||shot.caption||shot.label;
    const label={id:id(),type:'subtitle',alignment:1,line_feed:1,line_max_width:0.8,global_alpha:1,check_flag:7,
      content:JSON.stringify({text:caption,styles:[{range:[0,caption.length],size:8,fill:{content:{solid:{color:[1,1,1],alpha:1}}},strokes:[]}]})};
    doc.materials.texts.push(label);
    const textTransform=structuredClone(transform);
    textTransform.transform.y=-0.75;
    text.push({...baseSegment(label,cursor,shot.subtitle||shot.caption?clip.duration:Math.min(2000000,clip.duration)),
      clip:textTransform,uniform_scale:{on:true,value:1},extra_material_refs:[]});
    cursor+=clip.duration;
  }
  doc.duration=cursor;
  doc.tracks.push(track('video',video,0));
  // Overlapping voices need separate editor tracks. Non-overlapping clips
  // share a track while retaining each shot-relative start time.
  const lanes=[];
  for(const segment of audio.sort((a,b)=>a.target_timerange.start-b.target_timerange.start)){
    const range=segment.target_timerange;
    let lane=lanes.find(item=>item.end<=range.start);
    if(!lane){lane={segments:[],end:0};lanes.push(lane);}
    lane.segments.push(segment);lane.end=range.start+range.duration;
  }
  for(const [index,lane] of lanes.entries())doc.tracks.push(track('audio',lane.segments,index+1));
  doc.tracks.push(track('text',text,14000));
  return doc;
}

async function exportJianyingDraft({project,jobs,media,selection,folder,dataDir,probe,guard,beforePublish=guard}){
  const scope=draftSelections(project,jobs,media,selection);
  if(!scope.length)throw Error('所选范围没有分镜');
  const skipped=[],voiceNotes=[],rows=[];
  for(const {shot,videos,dubbing} of scope){
    await guard();
    let selected;
    for(const video of videos){
      const local=await chooseExisting(video.filePath,dataDir);
      if(!local||!mediaKinds.video.test(local))continue;
      const metadata=await probe(local,'video').catch(()=>null);
      if(metadata?.duration>0&&metadata.width>0&&metadata.height>0){selected={...metadata,path:local};break;}
    }
    if(!selected){
      skipped.push(shot.label+(videos.some(r=>r.filePath)?' 素材缺失或无法读取':videos.length?' 请先下载视频':' 视频尚未生成'));
      continue;
    }
    const voices=[];
    for(const audio of dubbing){
      const local=await chooseExisting(audio.filePath,dataDir);
      const metadata=local&&mediaKinds.audio.test(local)?await probe(local,'audio').catch(()=>null):null;
      const offset=Math.round(Number(audio.offsetSeconds||0)*1000000);
      if(!(metadata?.duration>0)||!Number.isSafeInteger(offset)||offset<0||offset>=selected.duration){
        voiceNotes.push(shot.label+' 有配音尚未下载、不可读或超出镜头范围');
        continue;
      }
      if(metadata.duration+offset>selected.duration)voiceNotes.push(shot.label+' 配音超出镜头，已按镜头长度截取');
      voices.push({...metadata,path:local,offset});
    }
    rows.push({shot,video:selected,dubbing:voices});
  }
  if(!rows.length)return {shots:0,voices:0,skipped,voiceNotes};
  const root=await fs.realpath(folder);
  const title=String(project.name||'行舟草稿').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,65)||'行舟草稿';
  const name=`${title} · ${rows[0].shot.label} · ${randomUUID().slice(0,8)}`;
  const destination=path.join(root,name),staging=await fs.mkdtemp(path.join(root,'.xz-draft-')),copied=[];
  const assets=path.join(staging,'assets');
  let published=false;
  try{
    // Resolve every source before copying and keep all outputs inside the
    // new draft. Source files and the editor's existing drafts stay untouched.
    await fs.mkdir(assets);
    const copies=new Map();
    for(const row of rows){
      for(const source of [row.video,...row.dubbing]){
        await guard();
        const original=await verifiedDataFile(source.path,dataDir);
        let relative=copies.get(original);
        if(!relative){
          relative=path.join('assets',String(copies.size+1)+path.extname(original).toLowerCase());
          const target=path.join(staging,relative);
          copied.push(target);await fs.copyFile(original,target,constants.COPYFILE_EXCL);
          copies.set(original,relative);
        }
        source.path=path.join(destination,relative).split(path.sep).join('/');
      }
    }
    const doc=draftContent(rows,name),meta={...structuredClone(metaTemplate),draft_id:doc.id,draft_name:name,
      draft_fold_path:destination.split(path.sep).join('/'),draft_root_path:root.split(path.sep).join('/'),
      tm_draft_create:Date.now()*1000,tm_draft_modified:Date.now()*1000,tm_duration:doc.duration};
    for(const [file,data] of [['draft_content.json',doc],['draft_meta_info.json',meta]]){
      const target=path.join(staging,file);copied.push(target);await fs.writeFile(target,JSON.stringify(data),{flag:'wx'});
    }
    await beforePublish();
    await fs.rename(staging,destination);published=true;
    return {folder:destination,shots:rows.length,voices:rows.reduce((sum,row)=>sum+row.dubbing.length,0),skipped,voiceNotes};
  }finally{
    if(!published){
      for(const file of copied)await fs.unlink(file).catch(()=>{});
      await fs.rmdir(assets).catch(()=>{});
      await fs.rmdir(staging).catch(()=>{});
    }
  }
}

module.exports={draftSelections,draftContent,exportJianyingDraft};
