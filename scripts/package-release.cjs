// Package from physical dependency folders, even when the development node_modules is a junction.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
if(pkg.version.includes('-private')&&process.env.XINGZHOU_PRIVATE_TRIAL!=='1')throw new Error('Private trial packaging requires XINGZHOU_PRIVATE_TRIAL=1');
if(!pkg.version.includes('-private')&&process.env.XINGZHOU_PRIVATE_TRIAL==='1')throw new Error('Public releases must not enable XINGZHOU_PRIVATE_TRIAL');
const releaseRoot = path.join(root, 'release');
let staging;
const output = path.join(root, 'release', pkg.version);
const installed = new Map();
const developmentFolders = new Set(['coverage','test','tests','__tests__','fixtures','__fixtures__','.nyc_output','.playwright-mcp','.claude','.codex','.cursor','.github']);
const developmentFile = /\.(?:test|spec|fixtures)\.(?:js|cjs|mjs|ts|tsx|json)$|\.(?:map|pdb|log)$/i;
const localOverride = /^(?:\.(?:env|git)|(?:local|private)[-.].*override)|\.local\.(?:js|cjs|mjs|json)$/i;
function copyTree(source,destination,skip=new Set()) {
  fs.mkdirSync(destination,{recursive:true});
  for(const entry of fs.readdirSync(source,{withFileTypes:true})) {
    if(skip.has(entry.name) || (entry.isDirectory() && developmentFolders.has(entry.name))
      || developmentFile.test(entry.name) || localOverride.test(entry.name)) continue;
    const from=path.join(source,entry.name), to=path.join(destination,entry.name);
    if(entry.isDirectory()) copyTree(from,to,skip);
    else if(entry.isFile()) fs.copyFileSync(from,to);
    else throw new Error(`Unexpected symlink in staged files: ${from}`);
  }
}
const runtimeSourceFolders = ['electron','core','world-simulation','canvas-app','browser-extension','build','cloud-backend/shared'];
function copyRuntimeSources() {
  const entries=execFileSync('git',['ls-files','-z','--',...runtimeSourceFolders],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
  const developmentOnly=new Set(['world-simulation/README.md','world-simulation/RESEARCH.md','canvas-app/UPSTREAM.md']);
  for(const relative of entries){
    const parts=relative.split('/'),name=parts.pop();
    if(parts.some(part=>developmentFolders.has(part))||developmentFile.test(name)||
       relative.startsWith('core/builtin-skills/')||developmentOnly.has(relative)||
       ['access-service.cjs','accessControl.cjs'].includes(name)||
       localOverride.test(name))continue;
    const source=path.join(root,relative),destination=path.join(staging,relative);
    if(!fs.lstatSync(source).isFile())throw Error(`Invalid runtime source: ${relative}`);
    fs.mkdirSync(path.dirname(destination),{recursive:true});
    fs.copyFileSync(source,destination);
  }
}
function packageRoot(name, from) {
  const resolver = createRequire(path.join(from, 'package.json'));
  try { return path.dirname(resolver.resolve(`${name}/package.json`)); } catch {
    let dir = path.dirname(resolver.resolve(name));
    while (dir !== path.dirname(dir)) {
      const manifest = path.join(dir,'package.json');
      if (fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest,'utf8')).name === name) return dir;
      dir = path.dirname(dir);
    }
    throw new Error(`Cannot locate runtime dependency: ${name}`);
  }
}
function copyDependency(name, from) {
  const source = fs.realpathSync(packageRoot(name,from));
  const manifest = JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
  if (installed.has(name)) {
    if (installed.get(name) !== manifest.version) throw new Error(`Conflicting runtime versions for ${name}`);
    return;
  }
  installed.set(name,manifest.version);
  const destination = path.join(staging,'node_modules',...name.split('/'));
  copyTree(source,destination,new Set(['node_modules','.git']));
  for (const dependency of Object.keys(manifest.dependencies || {})) copyDependency(dependency,source);
}
(async()=>{
  if (!fs.existsSync(path.join(root,'dist/index.html'))) throw new Error('Run npm run build before packaging');
  fs.mkdirSync(releaseRoot,{recursive:true});
  staging = fs.mkdtempSync(path.join(releaseRoot, `staging-${pkg.version}-`));
  copyTree(path.join(root,'dist'),path.join(staging,'dist'));
  copyRuntimeSources();
  const localProjectModules = ['storyboard-merge','storyboard-settings','storyboard-identity','prompt-duration','collab-episodes','project-media-policy','director-source','episode-identity-repair','image-composition','reference-upload-delete','art-review-repository','analysis-publication','prompt-binding'];
  fs.mkdirSync(path.join(staging,'cloud-backend/src'),{recursive:true});
  for (const name of localProjectModules) fs.copyFileSync(path.join(root,'cloud-backend/src',name+'.cjs'),path.join(staging,'cloud-backend/src',name+'.cjs'));
  const desktopDependencies=['mammoth','yjs','p-queue','jszip'];
  for(const name of desktopDependencies) {
    copyDependency(name,root);
    if(pkg.dependencies[name]!==installed.get(name)) throw Error(`Runtime dependency does not match the pinned version: ${name}`);
  }
  const runtime = process.env.XINGZHOU_ELECTRON_DIST || path.join(root,'qa/electron-runtime');
  const config = {...pkg.build, electronVersion:require('electron/package.json').version, directories:{output,buildResources:'build'}, npmRebuild:false};
  if (fs.existsSync(path.join(runtime,'electron.exe'))) config.electronDist = runtime;
  const stagePkg = {...pkg, xingzhouPrivateTrial:process.env.XINGZHOU_PRIVATE_TRIAL==='1', scripts:{}, dependencies:Object.fromEntries(desktopDependencies.map(name=>[name,installed.get(name)])), devDependencies:{}, build:config};
  fs.writeFileSync(path.join(staging,'package.json'),JSON.stringify(stagePkg,null,2));
  fs.writeFileSync(path.join(staging,'runtime-dependencies.json'),JSON.stringify(Object.fromEntries(installed),null,2));
  console.log(`Staging ${installed.size} physical runtime packages in ${staging}`);
  await require('electron-builder').build({projectDir:staging,targets:require('electron-builder').Platform.WINDOWS.createTarget(['nsis'],require('electron-builder').Arch.x64),config});
  const exe = path.join(output,'win-unpacked',`${pkg.build.productName}.exe`);
  await require('./verify-packaged-runtime.cjs').verify(exe,pkg.version,Object.fromEntries(installed));
  // Retain the installer. The expanded copy belongs to this successful run.
  if (path.dirname(fs.realpathSync(staging)) === fs.realpathSync(releaseRoot)) {
    fs.rmSync(staging, {recursive:true, force:true, maxRetries:3});
  }
  const expanded=path.dirname(exe);
  if (process.env.XINGZHOU_KEEP_VERIFIED_UNPACKED!=='1' && fs.realpathSync(expanded)===expanded
    && path.dirname(fs.realpathSync(output))===fs.realpathSync(releaseRoot)) {
    fs.rmSync(expanded,{recursive:true,force:true,maxRetries:3});
  }
  if(!pkg.version.includes('-private')) {
    console.log(JSON.stringify(require('./release-retention.cjs').pruneReleaseInstallers(releaseRoot)));
  }
  console.log(`VERIFIED_INSTALLER ${path.join(output,`Xingzhou-Film-Tencent-Setup-${pkg.version}.exe`)}`);
})().catch(error=>{console.error(error);process.exit(1);});
