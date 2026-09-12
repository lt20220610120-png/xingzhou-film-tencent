// Package from physical dependency folders, even when the development node_modules is a junction.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const staging = path.join(root, 'release', `staging-${pkg.version}-${Date.now()}`);
const output = path.join(root, 'release', pkg.version);
const installed = new Map();
function copyTree(source,destination,skip=new Set()) {
  fs.mkdirSync(destination,{recursive:true});
  for(const entry of fs.readdirSync(source,{withFileTypes:true})) {
    if(skip.has(entry.name) || /\.test\.(?:js|cjs)$/.test(entry.name)) continue;
    const from=path.join(source,entry.name), to=path.join(destination,entry.name);
    if(entry.isDirectory()) copyTree(from,to,skip);
    else if(entry.isFile()) fs.copyFileSync(from,to);
    else throw new Error(`Unexpected symlink in staged files: ${from}`);
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
  fs.mkdirSync(staging,{recursive:true});
  for (const folder of ['dist','electron','core','canvas-app','build']) copyTree(path.join(root,folder),path.join(staging,folder));
  copyDependency('mammoth',root);
  const runtime = process.env.XINGZHOU_ELECTRON_DIST || path.join(root,'qa/electron-runtime');
  const config = {...pkg.build, electronVersion:require('electron/package.json').version, directories:{output,buildResources:'build'}, npmRebuild:false};
  if (fs.existsSync(path.join(runtime,'electron.exe'))) config.electronDist = runtime;
  const stagePkg = {...pkg, scripts:{}, dependencies:{mammoth:installed.get('mammoth')}, devDependencies:{}, build:config};
  fs.writeFileSync(path.join(staging,'package.json'),JSON.stringify(stagePkg,null,2));
  fs.writeFileSync(path.join(staging,'runtime-dependencies.json'),JSON.stringify(Object.fromEntries(installed),null,2));
  console.log(`Staging ${installed.size} physical runtime packages in ${staging}`);
  await require('electron-builder').build({projectDir:staging,targets:require('electron-builder').Platform.WINDOWS.createTarget(['nsis'],require('electron-builder').Arch.x64),config});
  const exe = path.join(output,'win-unpacked',`${pkg.build.productName}.exe`);
  await require('./verify-packaged-runtime.cjs').verify(exe,pkg.version,Object.fromEntries(installed));
  console.log(`VERIFIED_INSTALLER ${path.join(output,`Xingzhou-Film-Tencent-Setup-${pkg.version}.exe`)}`);
})().catch(error=>{console.error(error);process.exitCode=1;});
