function generatedImageMime(bytes){
 if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR')return 'image/png';
 if(bytes.length>=6&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217)return 'image/jpeg';
 if(bytes.length>=16&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
 if(bytes.length>=14&&/^GIF8[79]a$/.test(bytes.toString('ascii',0,6)))return 'image/gif';
 if(bytes.length>=32&&bytes.toString('ascii',4,8)==='ftyp'&&/avif|avis/.test(bytes.toString('ascii',8,36)))return 'image/avif';
 return '';
}
async function chromiumDecodesImage(bytes,mime){
 const {BrowserWindow}=require('electron');
 const window=new BrowserWindow({show:false,width:1,height:1,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true}});
 let timer;
 try{return await Promise.race([(async()=>{
  await window.loadURL('data:text/html,<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data:">');
  const source=`data:${mime};base64,${bytes.toString('base64')}`;
  return window.webContents.executeJavaScript(`new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image.naturalWidth>0&&image.naturalHeight>0);image.onerror=()=>resolve(false);image.src=${JSON.stringify(source)};})`);
 })(),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),15000);})]);}catch{return false;}finally{clearTimeout(timer);if(!window.isDestroyed())window.destroy();}
}
async function validateGeneratedImage(bytes){
 const mime=generatedImageMime(bytes);let valid=Boolean(mime);
 if(valid&&process.versions.electron){try{valid=['image/png','image/jpeg'].includes(mime)?!require('electron').nativeImage.createFromBuffer(bytes).isEmpty():await chromiumDecodesImage(bytes,mime);}catch{valid=false;}}
 if(!valid)throw Object.assign(Error('结果未返回可显示的有效图片，可能是错误页面、空文件或损坏的图片'),{code:'IMAGE_CONTENT_INVALID'});
 return mime;
}
module.exports={validateGeneratedImage,generatedImageMime};
