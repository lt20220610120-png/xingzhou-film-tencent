const {randomUUID}=require('node:crypto');
const {createLocalMediaHandler}=require('./local-media.cjs');

async function createJianyingMediaProbe({BrowserWindow,dataDir}){
  let selectedFile;
  const window=new BrowserWindow({show:false,webPreferences:{
    partition:'jianying-probe-'+randomUUID(),sandbox:true,contextIsolation:true,
    nodeIntegration:false,backgroundThrottling:false,
  }});
  const contents=window.webContents;
  contents.session.protocol.handle('xzmedia',createLocalMediaHandler(()=>dataDir,file=>file===selectedFile));
  const page='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; media-src xzmedia:">';
  try{await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(page));}
  catch(error){if(!window.isDestroyed())window.destroy();throw error;}
  return {
    async read(file,kind){
      selectedFile=file;
      const url='xzmedia://local/'+encodeURIComponent(file);
      const code=`new Promise(resolve=>{
        const media=document.createElement(${JSON.stringify(kind==='audio'?'audio':'video')});
        let timer=setTimeout(()=>finish(null),5000);
        function finish(result){
          clearTimeout(timer);
          media.onloadedmetadata=media.onerror=null;
          media.removeAttribute('src');media.load();
          resolve(result);
        }
        media.preload='metadata';
        media.onloadedmetadata=()=>finish(Number.isFinite(media.duration)?{
          duration:Math.round(media.duration*1000000),width:media.videoWidth||0,height:media.videoHeight||0
        }:null);
        media.onerror=()=>finish(null);
        media.src=${JSON.stringify(url)};
      })`;
      try{return await contents.executeJavaScript(code);}
      finally{selectedFile=undefined;}
    },
    close(){if(!window.isDestroyed())window.destroy();},
  };
}
module.exports={createJianyingMediaProbe};
