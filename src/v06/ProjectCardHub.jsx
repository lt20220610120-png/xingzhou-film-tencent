import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, BookOpen, Upload, Trash2, PenLine, FolderPlus, FolderCog, Users } from 'lucide-react';
import { DeleteConfirm } from './DeleteConfirm.jsx';
import { defaultProjectGroupName } from '../../core/projectGroups.js';

export function ProjectCardHub({
  title, subtitle, projects, onCreate, onOpen, onDelete, kind = 'project',
  onImportLibrary, onUpload, library, headerExtra,
  groups = [], onRename, onMoveToGroup, onCreateGroup, onRenameGroup, onDeleteGroup,
  onManageCollab, canManageCollab = () => false, canDeleteProject = () => true,
}) {
  const isDirector = !!onUpload && !!library;
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const groupMemoryKey = `xz-cardhub-group-${kind}`;
  const [filterGroup, setFilterGroupState] = useState(() => {
    try {
      const saved = localStorage.getItem(groupMemoryKey);
      if (saved && (saved === 'all' || saved === 'ungrouped' || groups.some((group) => group.id === saved))) return saved;
    } catch { /* localStorage 不可用时回退默认组 */ }
    return isDirector ? 'director-workbench' : 'all';
  });
  const setFilterGroup = (next) => {
    setFilterGroupState(next);
    try { localStorage.setItem(groupMemoryKey, next); } catch { /* 忽略存储失败 */ }
  };
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [groupDialog, setGroupDialog] = useState(null);
  const [groupName, setGroupName] = useState('');
  const isFruit = kind === 'fruit';
  const isScript = kind === 'script';
  const canOrganize = !!onRename && !!onMoveToGroup && !!onCreateGroup;
  
  // 先按分组过滤，再按搜索过滤
  let visibleProjects = filterGroup === 'all'
    ? projects
    : projects.filter(project =>filterGroup === 'ungrouped' ? !project.groupId : project.groupId === filterGroup);
  
  // 应用搜索过滤
  if (searchQuery.trim()) {
    visibleProjects = visibleProjects.filter(project =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }
  
  const fixedDirectorGroups = groups.filter((group) => group.fixed);
  const customGroups = groups.filter((group) => !group.fixed);

  const saveRename = (project) => {
    const name = renameValue.trim();
    if (name && name !== project.name) onRename?.(project.id, name);
    setRenamingId(null);
  };
  const createGroup = () => {
    setGroupName(defaultProjectGroupName(groups));
    setGroupDialog({ mode: 'create' });
  };
  const editGroup = () => {
    const group = groups.find(item => item.id === filterGroup);
    if (!group) return;
    setGroupName(group.name);
    setGroupDialog({ mode: 'rename', group });
  };
  const submitGroup = (event) => {
    event.preventDefault();
    const name = groupName.trim();
    if (!name) return;
    if (groupDialog?.mode === 'rename') onRenameGroup?.(groupDialog.group.id, name);
    else onCreateGroup?.(name);
    setGroupDialog(null);
  };
  const removeGroup = () => {
    const group = groups.find(item => item.id === filterGroup);
    if (!group || !window.confirm(`删除分组“${group.name}”？组内项目会移回未分组。`)) return;
    onDeleteGroup?.(group.id);
    setFilterGroup(isDirector ? 'director-workbench' : 'all');
  };

  return (
    <main className="card-page">
      <header>
        <span>{isFruit ? '市场果子' : isScript ? '内容创作' : isDirector ? '导演工作台' : '项目'}</span>
        <h1>{title}</h1>{headerExtra}
      </header>

      {canOrganize && (
        <div className="director-group-toolbar">
          <div className="group-tabs">
            {!isDirector && <button className={filterGroup === 'all' ? 'active' : ''} onClick={() => setFilterGroup('all')}>全部项目</button>}
            {!isDirector && <button className={filterGroup === 'ungrouped' ? 'active' : ''} onClick={() => setFilterGroup('ungrouped')}>未分组</button>}
            {(isDirector ? [...fixedDirectorGroups, ...customGroups] : groups).map(group => <button key={group.id} className={filterGroup === group.id ? 'active' : ''} onClick={() => setFilterGroup(group.id)}>{group.name}</button>)}
          </div>
          <div className="group-actions">
            <button onClick={createGroup}><FolderPlus size={15}/>新建分组</button>
            {customGroups.some(group => group.id === filterGroup) && <button onClick={editGroup}><FolderCog size={15}/>重命名组</button>}
            {customGroups.some(group => group.id === filterGroup) && <button className="danger-link" onClick={removeGroup}>删除组</button>}
          </div>
        </div>
      )}
      
      {isDirector && projects.length > 0 && (
        <div className="director-search-bar">
          <input
            type="text" 
            placeholder="搜索项目名称..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="director-search-input"
          />
        </div>
      )}

      <div className="project-grid">
        {!isDirector && <button className="project-card add" onClick={onCreate}><div><Plus /></div><h3>新建项目</h3><p>创建一个新的{isFruit ? '果子' : '剧本'}项目</p></button>}
        {isDirector && filterGroup === 'director-workbench' && <button className="project-card add" onClick={onUpload}><div><Upload /></div><h3>上传剧本</h3><p>自动识别总剧本与分集</p></button>}
        {isDirector && filterGroup === 'director-library' && library?.map(item => <article key={item.id} className="project-card library-source"><div className="card-cover"><BookOpen /></div><small>内容创作者 · 剧本库</small><h3>{item.name}</h3><p>导入导演工作台后可逐集处理</p><button className="primary" onClick={() => onImportLibrary(item)}>选择剧本</button></article>)}
        {visibleProjects.map(project =>{
          const group = groups.find(item => item.id === project.groupId);
          return <article key={project.id} className="project-card">
            <div className="card-cover"><span>{project.name.slice(0, 1)}</span></div>
            <div className="project-kind-row"><small>{isFruit ? '市场验证剧本' : isScript ? (project.mode === 'rewrite' ? '洗稿创作' : '原创创作') : '导演项目'}</small><span className="project-badges">{isDirector && project.cloudRole === 'collaborator' && <span className="cloud-collab-badge">协作</span>}{canOrganize && <span className="group-badge">{group?.name || '未分组'}</span>}</span></div>
            {renamingId === project.id ? <input className="project-name-input" autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={() => saveRename(project)} onKeyDown={e => { if (e.key === 'Enter') saveRename(project); if (e.key === 'Escape') setRenamingId(null); }}/> : <h3>{project.name}</h3>}
            <p>{project.episodes.length} 集{isFruit && <> · {'★'.repeat(project.rating) || '未评级'}</>}{isDirector && <> · {project.episodes.reduce((sum, ep) => sum + (ep.prompts?.length || 0), 0)} 条提示词</>}</p>
            {canOrganize && <div className="project-organize-row"><button onClick={() => { setRenamingId(project.id); setRenameValue(project.name); }}><PenLine size={14}/>修改名称</button><select value={project.groupId || 'director-workbench'} disabled={isDirector && project.groupId === 'director-cloud'} onChange={e => onMoveToGroup?.(project.id, e.target.value)}>{(isDirector ? [groups.find(group => group.id === 'director-workbench'), ...customGroups].filter(Boolean) : groups).map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div>}
            <div className="project-card-actions"><button className="primary" onClick={() => onOpen(project.id)}>{isDirector ? '继续导演' : '继续创作'}</button>{isDirector && onManageCollab && canManageCollab(project) && <button className="secondary director-collab-button" onClick={() => onManageCollab(project)}><Users size={14}/>{project.cloudProjectId ? '管理协作' : '开启协作'}</button>}{onDelete && canDeleteProject(project) && <button className="card-delete" title="删除项目" onClick={e => { e.stopPropagation(); setDeleteTarget(project); }}><Trash2 />删除</button>}</div>
          </article>;
        })}
      </div>
      <DeleteConfirm open={!!deleteTarget} title="删除项目" name={deleteTarget?.name} detail="项目及其中所有分集内容都会删除，此操作无法恢复。" onCancel={() => setDeleteTarget(null)} onConfirm={() => { onDelete?.(deleteTarget.id); setDeleteTarget(null); }}/>
      {groupDialog && createPortal(<div className="veil group-dialog-veil" onMouseDown={event => { if (event.target === event.currentTarget) setGroupDialog(null); }}>
          <form className="modal group-dialog" onSubmit={submitGroup}>
            <h2>{groupDialog.mode === 'rename' ? '重命名分组' : '新建分组'}</h2>
            <p>输入一个容易识别的分组名称，之后可以继续修改。</p>
            <input autoFocus value={groupName} onChange={event => setGroupName(event.target.value)} aria-label="分组名称" />
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setGroupDialog(null)}>取消</button>
              <button type="submit" className="primary" disabled={!groupName.trim()}>{groupDialog.mode === 'rename' ? '保存' : '创建分组'}</button>
            </div>
          </form>
        </div>, document.body)}
    </main>
  );
}
export default ProjectCardHub;
