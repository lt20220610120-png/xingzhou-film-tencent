const fs = require('node:fs');
const path = require('node:path');

const isFile = file => { try { return fs.statSync(file).isFile(); } catch { return false; } };

// Hiding the venv console launcher does not hide the base interpreter it
// creates. Use the GUI launcher for the whole Python process lineage instead.
function windowlessPython(executable, { platform = process.platform, fileExists = isFile, searchPath = process.env.PATH || '' } = {}) {
  if (platform !== 'win32') return executable;
  const name = path.win32.basename(executable);
  if (/^pythonw(?:\.exe)?$/i.test(name)) return executable;
  if (!/^python(?:\.exe)?$/i.test(name)) throw new Error('后台服务需要使用无窗口 Python 运行环境');
  const directory = path.win32.dirname(executable);
  const candidates = directory === '.'
    ? searchPath.split(';').filter(Boolean).map(folder => path.win32.join(folder.replace(/^"|"$/g, ''), 'pythonw.exe'))
    : [path.win32.join(directory, 'pythonw.exe')];
  const found = candidates.find(fileExists);
  if (!found) throw new Error('缺少无窗口 Python 运行环境，请修复控制面板安装后重试');
  return found;
}

function windowlessPythonArgs(args,{platform=process.platform}={}){
 if(platform!=='win32')return args;
 // pythonw has no standard streams by default. Python modules such as pip
 // expect them; initialize harmless sinks before dispatching the original job.
 const bootstrap='import os,sys,runpy; sys.stdout=sys.stdout or open(os.devnull,"w"); sys.stderr=sys.stderr or open(os.devnull,"w"); a=sys.argv[1:]; sys.argv=a[1:] if a[0] in ("-m","-c") else a; exec(a[1]) if a[0]=="-c" else runpy.run_module(a[1],run_name="__main__",alter_sys=True) if a[0]=="-m" else runpy.run_path(a[0],run_name="__main__")';
 return ['-c',bootstrap,...args];
}
module.exports = { windowlessPython,windowlessPythonArgs };
