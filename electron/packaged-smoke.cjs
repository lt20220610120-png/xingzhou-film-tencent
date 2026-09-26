// Activated only by the release verifier. Real profiles and project files are never opened.
const fs = require('node:fs');
const path = require('node:path');
module.exports = function configurePackagedSmoke(app) {
  const root = process.env.XINGZHOU_SMOKE_TEST_ROOT;
  if (!root) return false;
  if (!path.isAbsolute(root)) throw new Error('Smoke test root must be absolute');
  globalThis.fetch = async () => { throw new Error('Network disabled during packaged smoke test'); };
  for (const key of ['appData', 'userData', 'documents', 'temp']) {
    const dir = path.join(root, key); fs.mkdirSync(dir, { recursive: true }); app.setPath(key, dir);
  }
  const report = { version: app.getVersion(), errors: [] };
  const finish = (success) => { clearTimeout(deadline); report.success = success; fs.writeFileSync(path.join(root,'report.json'), JSON.stringify(report,null,2)); app.exit(success ? 0 : 1); };
  const deadline = setTimeout(() => { report.errors.push('Startup timed out'); finish(false); }, 25000);
  process.on('uncaughtException', error => { report.errors.push(error.stack || error.message); finish(false); });
  process.on('unhandledRejection', error => { report.errors.push(String(error)); finish(false); });
  app.whenReady().then(() => {
    const { session } = require('electron');
    session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']}, (_, done) => done({cancel:true}));
  });
  app.on('browser-window-created', (_, win) => {
    win.webContents.on('did-fail-load', (_, code, description) => { report.errors.push(`Load failed ${code} ${description}`); finish(false); });
    win.webContents.once('did-finish-load', async () => {
      try {
        const JSZip = require('jszip');
        const zip = new JSZip();
        zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
        zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
        zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>行舟安装包验证</w:t></w:r></w:p></w:body></w:document>');
        const buffer = await zip.generateAsync({type:'nodebuffer'});
        const result = await require('mammoth').extractRawText({buffer});
        report.docxImport = result.value.trim() === '行舟安装包验证';
        for (let attempt=0;attempt<30;attempt++) {
          await new Promise(resolve => setTimeout(resolve,250));
          report.page = await win.webContents.executeJavaScript('({ title: document.title, text: document.body.innerText.slice(0,1500), bridge: typeof window.xingzhou?.appVersion === "function", roles: document.querySelectorAll(".studio-role").length })');
          if(report.page.roles===2) break;
        }
        const mediaDir=path.join(root,'documents','行舟影视资料','画布素材','整本提示词素材');
        fs.mkdirSync(mediaDir,{recursive:true});
        const files=['图片.png','音频.wav','视频.mp4'].map((name,index)=>{
          const file=path.join(mediaDir,name);
          fs.writeFileSync(file,index===0?Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3ZtqsAAAAASUVORK5CYII=','base64'):Buffer.from([index,1,2,3]));
          return `xzmedia:///${encodeURIComponent(file)}`;
        });
        const {net}=require('electron');
        const results=await Promise.all(files.map(async url=>{try{const response=await net.fetch(url);return {status:response.status,length:(await response.arrayBuffer()).byteLength};}catch(error){return {error:String(error)};}}));
        const image=await win.webContents.executeJavaScript(`new Promise(resolve=>{const img=new Image();img.onload=()=>resolve({loaded:true,width:img.naturalWidth});img.onerror=()=>resolve({loaded:false});img.src=${JSON.stringify(files[0])};})`);
        report.localMedia={results,image};
        finish(report.docxImport && report.page.bridge && report.page.roles === 2 && results.every(item=>item.status===200&&item.length>0) && image.loaded && report.errors.length === 0);
      } catch (error) { report.errors.push(error.stack || error.message); finish(false); }
    });
  });
  return true;
};
