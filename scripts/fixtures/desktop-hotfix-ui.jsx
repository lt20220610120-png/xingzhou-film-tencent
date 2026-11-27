import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createInitialState} from '../../core/projectStore.js';
import {createAssetDraftStore} from '../../core/collabAssetDrafts.js';
import {generationDraftKey} from '../../core/canvasStore.js';
import {flushEditing} from '../../src/editing.js';
import {AssetsSection} from '../../src/v06/CollabWorkspace.jsx';
import {GenerationWorkspace} from '../../src/v06/GenerationWorkspace.jsx';
import useScenePromptLinks,{notifyBindingSaved} from '../../src/v06/useScenePromptLinks.js';
import '../../src/styles.css';
import '../../src/collab.css';
import '../../src/generation.css';
import '../../src/brand-theme.css';

const image=id=>({id,url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="20"/>')+'#'+id});
const old=image('adopted'),project={id:'isolated-project',name:'隔离项目',episodes:[],analysis_progress:{},storageMode:'local'};
let row={id:'isolated-asset',name:'【隔离角色-便装】',description:'白衬衫',category:'character',episodes:[1],first_episode:1,adoptedImageId:old.id,image_url:old.url,images:[old]};
const imageProfile={id:'fixture-provider',name:'隔离生图',kind:'image',model:'fixture-image',endpoint:'https://fixture.invalid/v1',apiKey:'fixture'};
const voiceLedger={episodes:{}};
const qa=window.desktopHotfix={generated:0,uploaded:0};
const api={
 generationList:async()=>[],promptArtStatus:async()=>({enabled:false}),
 artReviewLoadLocal:async()=>voiceLedger,promptArtLoad:async()=>({revision:4}),
 mediaGenerateImage:async()=>{qa.generated++;return {filePath:'mock-generated.png'};},
 collabListAssets:async()=>[row],
 collabAttachGeneratedAssetImage:async()=>{
  const item=image('generated');row={...row,images:[...row.images,item]};return item;
 },
 collabUploadAssetImage:async()=>{
  const item=image('uploaded');qa.uploaded++;row={...row,images:[...row.images,item]};return item;
 },
};
localStorage.setItem('xz-generation-drafts',JSON.stringify({video:{prompt:'旧版未归属草稿',references:[]}}));
localStorage.setItem(generationDraftKey('account-a'),JSON.stringify({video:{prompt:'甲账号隔离草稿',references:[]}}));
const draftStore=createAssetDraftStore(localStorage,'account-a');
function BindingView({assets}){
 const links=useScenePromptLinks({project,assets,ledger:voiceLedger,api,accountId:'account-a',enabled:true,canEdit:false});
 return <output id="binding-revision">{links.state.saved?.revision||0}</output>;
}
function Fixture(){
 const [state,setState]=useState(()=>({...createInitialState(),mediaProfiles:[imageProfile],activeImageApiId:imageProfile.id}));
 const [assets,setAssets]=useState(()=>[row]),[accountId,setAccountId]=useState('account-a');
 const refresh=async()=>setAssets([row]);
 qa.useAccount=id=>{flushEditing();setAccountId(id);};
 qa.voiceChanged=()=>notifyBindingSaved(project.id,'account-a',null);
 return <><BindingView assets={assets}/><AssetsSection project={project} assets={assets} api={api} state={state} refresh={refresh} canEdit draftStore={draftStore} accountId="account-a"/>
  <GenerationWorkspace key={accountId} state={state} setState={setState} api={api} account={{id:accountId}}/>
 </>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
