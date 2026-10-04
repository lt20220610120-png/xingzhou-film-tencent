import { ipBodyCount } from './ipWorkspace.js';

export function creatorExportStatus(project,kind,side) {
 const mode=project.creator.mode;
 const completedImport=mode==='ip'&&project.creator.ip?.completedImport;
 const episodes=(project.episodes||[]).filter(e=>!(completedImport&&e.type==='settings'&&!e.scriptText?.trim()&&!e.rawText?.trim()));
 const field=kind==='fruit'?(side==='input'?'rawText':'scriptText'):(side==='input'?'content':'result');
 return {
  missing:episodes.filter(e=>!String(e[field]||'').trim()),
  unconfirmed:['framework','ip'].includes(mode)?episodes.filter(e=>!e.finalConfirmed||e.stale):[],
  shortIP:mode==='ip'&&!completedImport&&ipBodyCount(project)<(project.creator.ip.duration===120?70000:40000)
 };
}
