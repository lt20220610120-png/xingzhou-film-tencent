import {knownVideoProvider} from './videoProviderCatalogs.js';
const response={taskId:'jobId|job_id|id|task_id|taskId|data.id|data.task_id',status:'status|state|data.status',url:'videoUrl|video_url|download_url|content_url|content.video_url|data.result_url|data.video_url|data.0.url|outputs.0.url|result.video_url|metadata.url|url',error:'errorMessage|error.message|data.error.message|message|failure_reason|fail_reason'};
const shared={authMode:'bearer',authHeader:'Authorization',authPrefix:'Bearer ',pollSeconds:30,successStatuses:['success','succeeded','completed','done'],failedStatuses:['failed','error','cancelled','canceled'],response};
export const VIDEO_PROTOCOLS={auto:'自动识别已支持上游',autodl:'AutoDL ComfyUI 工作流',maxforai:'MaxForAI 视频 / v1/videos',niney:'9Y 视频 / v1/videos',feituo:'飞拓标准 / video/generate',ark:'火山方舟 / contents/generations/tasks','videos-json':'Videos 兼容（JSON）','videos-multipart':'Videos 兼容（表单/首帧文件）',custom:'自定义 HTTP 字段映射'};
export function effectiveVideoProtocol(profile){if(profile.videoProtocol&&profile.videoProtocol!=='auto')return profile.videoProtocol;const known=knownVideoProvider(profile.endpoint);if(known)return known;try{if(new URL(profile.endpoint).hostname==='feituokuajing.com')return 'feituo';}catch{}return 'ark';}
export function videoAdapterPreset(protocol='ark'){
 if(protocol==='autodl')return {...shared,authMode:'header',authHeader:'Authorization',authPrefix:'',pollSeconds:5,submitPath:'comfyui_workflow/{{model}}',queryPath:'comfyui_workflow/result/{{taskId}}',bodyType:'json',requestTemplate:{},referenceMode:'public-urls',resultKind:'video',response:{taskId:'data.task_id',status:'data.status',url:'',error:'data.error.message|data.error|data.message|msg|message'}};
 if(protocol==='feituo')return {...shared,submitPath:'video/generate',queryPath:'video/status?jobId={{taskId}}',bodyType:'json',requestTemplate:{model:'{{model}}',prompt:'{{prompt}}',ratio:'{{ratio}}',duration:'{{duration}}',resolution:'{{resolution}}',imageUrls:'{{imageUrls}}',videoUrls:'{{videoUrls}}',audioUrls:'{{audioUrls}}'},referenceMode:'urls'};
 if(protocol==='maxforai')return {...shared,pollSeconds:10,submitPath:'videos',queryPath:'videos/{{taskId}}',contentPath:'videos/{{taskId}}/content',bodyType:'json',requestTemplate:{model:'{{model}}',prompt:'{{prompt}}',duration:'{{duration}}',ratio:'{{ratio}}',resolution:'{{resolution}}',images:'{{imageUrls}}',videos:'{{videoUrls}}',audios:'{{audioUrls}}'},referenceMode:'provider-upload',preferContentPath:true,idempotencyHeader:'Idempotency-Key'};
 if(protocol==='niney')return {...shared,pollSeconds:12,submitPath:'videos',queryPath:'videos/{{taskId}}',contentPath:'videos/{{taskId}}/content',bodyType:'json',requestTemplate:{model:'{{model}}',prompt:'{{prompt}}',seconds:'{{duration}}',resolution:'{{resolution}}',aspect_ratio:'{{ratio}}',reference_images:'{{imageReferences}}',reference_videos:'{{videoReferences}}',reference_audios:'{{audioReferences}}'},referenceMode:'public-urls',preferContentPath:true};
 if(protocol==='videos-json'||protocol==='videos-multipart')return {...shared,submitPath:'videos',queryPath:'videos/{{taskId}}',contentPath:'videos/{{taskId}}/content',bodyType:protocol==='videos-multipart'?'multipart':'json',requestTemplate:{model:'{{model}}',prompt:'{{prompt}}',seconds:'{{seconds}}',size:'{{size}}',...(protocol==='videos-json'?{input_reference:'{{firstImage}}'}:{})},referenceMode:protocol==='videos-multipart'?'multipart':'data-url',fileFields:{image:'input_reference'}};
 return {...shared,submitPath:'contents/generations/tasks',queryPath:'contents/generations/tasks/{{taskId}}',bodyType:'json',requestTemplate:{model:'{{model}}',content:'{{content}}',ratio:'{{ratio}}',duration:'{{duration}}',resolution:'{{resolution}}'},referenceMode:'data-url'};
}
export function validateVideoAdapter(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('自定义视频协议必须是 JSON 对象');
 if(!raw.submitPath||typeof raw.submitPath!=='string')throw new Error('请填写提交路径 submitPath');
 if(!['json','multipart'].includes(raw.bodyType||'json'))throw new Error('bodyType 请选择 json 或 multipart');
 if(!raw.requestTemplate||typeof raw.requestTemplate!=='object'||Array.isArray(raw.requestTemplate))throw new Error('requestTemplate 必须是请求对象');
 if(JSON.stringify(raw).length>65536)throw new Error('视频协议模板过大');
 for(const k of ['successStatuses','failedStatuses'])if(raw[k]!==undefined&&(!Array.isArray(raw[k])||raw[k].some(v=>typeof v!=='string')))throw new Error(k+' 应为状态名称数组');
 for(const k of ['queryPath','contentPath'])if(raw[k]!==undefined&&typeof raw[k]!=='string')throw new Error(k+' 应为路径文字');
 if(raw.authMode&&!['none','bearer','header','query','body'].includes(raw.authMode))throw new Error('authMode 请选择 bearer、header、query、body 或 none');
 if(raw.referenceMode&&!['urls','data-url','multipart','provider-upload','public-urls'].includes(raw.referenceMode))throw new Error('referenceMode 请选择 urls、data-url、multipart、provider-upload 或 public-urls');
 for(const k of ['submitMethod','queryMethod'])if(raw[k]!==undefined&&!['GET','POST','PUT'].includes(raw[k]))throw new Error(k+' 应为 GET、POST 或 PUT');
 if(raw.response!==undefined&&(!raw.response||typeof raw.response!=='object'||Array.isArray(raw.response)||Object.values(raw.response).some(v=>typeof v!=='string')))throw new Error('response 必须是字段路径映射');
 return raw;
}
