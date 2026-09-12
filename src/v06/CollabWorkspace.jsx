// ============================================================
// CollabWorkspace.jsx — 项目协作（云端实时协同）
// 身份：制片(producer) / 美术(artist) / 协作者(collaborator)
// 功能区：信息读取 / 美术 / 资产 / 分镜 / 邀请协作 / 数据 / 项目群
// ============================================================
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Plus, X, Users, FileText, Palette, Box, Clapperboard,
  UserPlus, BarChart3, MessagesSquare, Sparkles, RefreshCw, Send,
  Image as ImageIcon, Upload, Trash2, Check, Film, AtSign, Loader2, PencilLine, Save,
} from 'lucide-react';
import {
  COLLAB_ROLES, COLLAB_SECTIONS, COLLAB_STYLES, ASSET_CATEGORIES,
  sectionsForRole, parseAssetName, findBaseMates, groupCharacterAssets, parseArtAnalysis,
  buildAssetRows, assetsForEpisode, episodeNumbersFromAssets,
  buildImagePrompt, summarizeActivity, ensureArtEpisodeCoverage, withAssetPrefix, buildAssetRevisionMessages, buildAssetGenerationJobs,
  ASSET_PROMPT_MODES, readAssetPrompt, serializeAssetPrompt, defaultAssetPromptPrefix,
} from '../../core/collabStore.js';
import { COLLAB_ART_SKILL_NAME, buildEpisodeAnalysisMessages, buildCollabAnalysisMessages } from '../../core/collabArtSkill.js';
import { IMAGE_FORMATS, activeMediaProfile, videoModelCapabilities } from '../../core/canvasStore.js';
import { createAssetDraftStore, readableCloudError } from '../../core/collabAssetDrafts.js';
import { DeleteConfirm } from './DeleteConfirm.jsx';
import { parseDirectorScenes, inferDirectorEpisodeNumber } from '../../core/scriptImport.js';
import '../art-workbench.css';

const SECTION_ICONS = { info: FileText, art: Palette, assets: Box, storyboard: Clapperboard, invite: UserPlus, stats: BarChart3, group: MessagesSquare };
const collabAnalysisJobs = new Map();
const fmtTime = (v) => { try { return new Date(v).toLocaleString('zh-CN', { hour12: false }); } catch { return v || '—'; } };

function ImageLightbox({ image, alt, onClose }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    setScale(1);
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [image, onClose]);
  if (!image) return null;
  return createPortal(
    <div className="collab-image-lightbox" role="dialog" aria-modal="true" aria-label={`${alt || '资产图片'}大图预览`} onClick={onClose}
      onWheel={(event) => { event.preventDefault(); setScale((current) => Math.min(6, Math.max(0.25, current * (event.deltaY < 0 ? 1.12 : 0.89)))); }}>
      <button type="button" className="collab-image-lightbox-close" onClick={onClose} aria-label="关闭预览"><X size={22} /></button>
      <div className="collab-image-lightbox-stage" onClick={(event) => event.stopPropagation()}>
        <img src={image} alt={alt || '资产图片'} draggable={false} style={{ transform: `scale(${scale})` }} />
      </div>
      <span className="collab-image-lightbox-scale">滚轮缩放 · {Math.round(scale * 100)}%</span>
    </div>,
    document.body,
  );
}

/* ================================================================
 * 信息读取：剧本 + 画风/题材 + 分析模型 + 内置Skill分析
 * ================================================================ */
function InfoSection({ project, refresh, api, state, canEdit }) {
  const [script, setScript] = useState(project.script || '');
  const [genre, setGenre] = useState(project.genre || '');
  const [selectedStyle, setSelectedStyle] = useState(project.style || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [, setJobVersion] = useState(0);
  const apiProfiles = state.apiProfiles || [];
  const [modelId, setModelId] = useState(state.activeApiId || apiProfiles[0]?.id || '');
  const profile = apiProfiles.find((p) => p.id === modelId);
  useEffect(() => {
    const nextId = state.activeApiId || apiProfiles[0]?.id || '';
    if (!apiProfiles.some((item) => item.id === modelId)) setModelId(nextId);
  }, [state.activeApiId, apiProfiles, modelId]);

  useEffect(() => { setScript(project.script || ''); }, [project.id]);
  useEffect(() => { setGenre(project.genre || ''); }, [project.id]);
  useEffect(() => { setSelectedStyle(project.style || ''); }, [project.id, project.style]);
  useEffect(() => {
    const syncJob = () => {
      const job = collabAnalysisJobs.get(project.id);
      if (job) { setError(job.error || ''); setNotice(job.notice || ''); }
      setJobVersion((value) => value + 1);
    };
    syncJob(); const timer = setInterval(syncJob, 500); return () => clearInterval(timer);
  }, [project.id]);
  const analysisJob = collabAnalysisJobs.get(project.id);
  const analyzing = analysisJob?.status === 'running';

  const saveInfo = async (updates) => {
    setSaving(true); setError('');
    try { await api.collabUpdateProject({ projectId: project.id, updates }); await refresh(); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const runAnalysis = async () => {
    if (collabAnalysisJobs.get(project.id)?.status === 'running') return;
    if (!profile) { setError('请先在「API 接口」中添加并启用一个大语言模型'); return; }
    if (!profile.model?.trim()) { setError('当前模型配置缺少模型名称，请到「API 接口」编辑后保存模型名称'); return; }
    if (!script.trim()) { setError('剧本内容为空，请先填写或在导演工作台上传剧本'); return; }
    if (!selectedStyle) { setError('请先选择画风（AI真人 / 3D动漫 / 2D动漫）'); return; }
    if (!genre.trim()) { setError('请先填写题材与时代设定（如：现代都市 / 古代玄幻 / 民国谍战）'); return; }
    const job = { status: 'running', error: '', notice: '大语言模型正在读取前置信息与 Skill，通读剧本分析中，请耐心等待…', cancelled: false, taskId: '' };
    collabAnalysisJobs.set(project.id, job); setError(''); setNotice(job.notice); setJobVersion((value) => value + 1);
    try {
      if (genre !== (project.genre || '')) await api.collabUpdateProject({ projectId: project.id, updates: { genre } });
      const analysisEpisodes = (project.episodes || []).filter((episode) => episode.kind !== 'setting' && episode.title !== '设定和小传');
      if (!analysisEpisodes.length) throw new Error('没有识别到可分析的剧本分集，请先同步导演项目');
      const outputs = [];
      const conversationHistory = [];
      for (const [index, episode] of analysisEpisodes.entries()) {
        if (job.cancelled) throw new Error('任务已停止');
        const episodeNumber = index + 1;
        job.notice = `正在逐集稳定分析：第 ${episodeNumber}/${analysisEpisodes.length} 集…`;
        job.taskId = `collab-analysis-${project.id}-${episodeNumber}`;
        const messages = buildEpisodeAnalysisMessages({ genre, episodeNumber, title: episode.title, content: episode.content || '', previousSummaries: conversationHistory.slice(-2) });
        const output = await api.aiChat({ protocol: profile.protocol, provider: profile.provider, endpoint: profile.endpoint, apiKey: profile.apiKey, model: profile.model, requiresApiKey: profile.requiresApiKey, messages, timeout: 10 * 60 * 1000, taskId: job.taskId });
        if (job.cancelled) throw new Error('任务已停止');
        const normalized = String(output || '');
        outputs.push(normalized);
        conversationHistory.push(`第${episodeNumber}集已完成，已使用的资产命名如下，请后续保持一致：\n${normalized.slice(0, 5000)}`);
      }
      const combinedOutput = outputs.join('\n\n');
      const parsed = ensureArtEpisodeCoverage(parseArtAnalysis(combinedOutput), analysisEpisodes.length);
      const rows = buildAssetRows(parsed);
      if (!rows.length) throw new Error('模型输出中没有识别到按集美术清单，请检查模型能力或重试');
      await api.collabUpdateProject({ projectId: project.id, updates: { analysis_output: combinedOutput } });
      await api.collabReplaceAssets({ projectId: project.id, assets: rows });
      job.status = 'completed'; job.notice = `分析完成：逐集读取 ${analysisEpisodes.length} 集，识别出 ${rows.length} 个美术资产。`; job.taskId = '';
      await refresh();
    } catch (e) {
      job.taskId = '';
      if (job.cancelled || String(e.message || '').includes('任务已停止')) { job.status = 'stopped'; job.error = ''; job.notice = '分析已停止，未完成的结果不会覆盖原有内容。'; }
      else { job.status = 'failed'; job.error = `分析失败：${e.message}`; job.notice = ''; }
    }
  };

  const stopAnalysis = async () => {
    const job = collabAnalysisJobs.get(project.id);
    if (!job || job.status !== 'running') return;
    job.cancelled = true; job.status = 'stopping'; job.notice = '正在停止分析…';
    if (job.taskId) await api.cancelAiTask?.({ taskId: job.taskId });
    job.status = 'stopped'; job.notice = '分析已停止，未完成的结果不会覆盖原有内容。'; setJobVersion((value) => value + 1);
  };

  return (
    <div className="collab-info">
      <aside className="collab-info-side">
        <div className="collab-panel-title"><Palette size={15} /> 画风</div>
        <div className="collab-style-chips">
          {COLLAB_STYLES.map((s) => (
            <button key={s} disabled={!canEdit} className={`style-chip ${selectedStyle === s ? 'active' : ''}`}
              onClick={() => { const next = selectedStyle === s ? '' : s; setSelectedStyle(next); saveInfo({ style: next }); }}>{s}</button>
          ))}
        </div>
        <div className="collab-panel-title"><FileText size={15} /> 题材</div>
        <textarea className="collab-genre-input" value={genre} disabled={!canEdit}
          onChange={(e) => setGenre(e.target.value)} onBlur={() => canEdit && genre !== (project.genre || '') && saveInfo({ genre })}
          placeholder={'手动填写整个剧本的题材与时代设定。\n例如：现代都市职场复仇 / 西方狼人吸血鬼 / 古代宫斗 / 民国谍战……'} />
        <div className="collab-panel-title"><Sparkles size={15} /> 分析模型</div>
        <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={!canEdit}>
          {!apiProfiles.length && <option value="">请先在 API 接口中添加模型</option>}
          {apiProfiles.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}
        </select>
        <div className="collab-panel-title"><Check size={15} /> Skill</div>
        <div className="collab-locked-skill">
          <b>{COLLAB_ART_SKILL_NAME}</b>
          <small>内置锁定 · 按集输出人物/场景/道具美术清单，软件自动分框识别</small>
        </div>
        <div className="collab-analysis-actions">
          <button className="primary collab-analyze-btn" onClick={runAnalysis} disabled={!canEdit || analyzing}>
            {analyzing ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />} {analyzing ? '分析中…' : '分析'}
          </button>
          {analyzing && <button className="danger" onClick={stopAnalysis}><X size={16} /> 停止分析</button>}
        </div>
        {error && <div className="collab-error">{error}</div>}
        {notice && <div className="collab-notice">{notice}</div>}
      </aside>
      <section className="collab-info-script">
        <div className="collab-panel-title">
          <FileText size={15} /> 完整剧本（可修改）
          <button className="ghost collab-save-script" disabled={!canEdit || saving || script === (project.script || '')} onClick={() => saveInfo({ script })}>
            <Save size={14} /> {saving ? '保存中…' : '保存剧本'}
          </button>
        </div>
        <textarea value={script} readOnly={!canEdit} onChange={(e) => setScript(e.target.value)} placeholder="这里展示项目的完整剧本，可直接修改后保存。" />
      </section>
    </div>
  );
}

/* ================================================================
 * 生图框（美术/资产共用）：模型 + 画幅 + @参考 + 生成/上传
 * ================================================================ */
function AssetImageBox({ project, asset, assets, api, state, refresh, canEdit, generating = false, onGenerateImage, beforeGenerate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedImageId, setSelectedImageId] = useState('');
  const [previewImage, setPreviewImage] = useState('');
  const [localImages, setLocalImages] = useState([]);
  const [showPrompt, setShowPrompt] = useState(false);
  useEffect(() => { setSelectedImageId(''); setPreviewImage(''); setLocalImages([]); setRefId(''); }, [asset.id]);
  const imageProfiles = (state.mediaProfiles || []).filter((p) => p.kind === 'image');
  const defaultProfile = activeMediaProfile(state, 'image');
  const [profileId, setProfileId] = useState(defaultProfile?.id || imageProfiles[0]?.id || '');
  const [size, setSize] = useState(IMAGE_FORMATS[0].size);
  const [refId, setRefId] = useState('');
  const profile = imageProfiles.find((p) => p.id === profileId) || defaultProfile;
  const mates = useMemo(() => findBaseMates(assets, asset.name).filter((m) => m.category === asset.category && (m.image_url || m.images?.length)), [assets, asset.name]);
  const refAsset = mates.find((m) => m.id === refId) || null;
  useEffect(() => { setLocalImages((current) => current.filter((local) => !(asset.images || []).some((remote) => remote.id === local.id))); }, [asset.images]);
  const images = [...(asset.images?.length ? asset.images : (asset.image_url ? [{ id: 'legacy', url: asset.image_url, filename: `${asset.name}.png` }] : [])), ...localImages];
  const selectedImage = images.find((image) => image.id === selectedImageId) || images[images.length - 1] || null;

  const generate = async () => {
    if (generating || busy || !canEdit) return;
    if (!profile) { setError('请先在画布或 API 配置中添加图片生成接口'); return; }
    setError(''); setBusy(true);
    try {
      if (beforeGenerate) await beforeGenerate();
      const prompt = buildImagePrompt(asset, refAsset, project.style);
      if (onGenerateImage) {
        const attached = await onGenerateImage({ asset, profile, prompt, size });
        if (attached?.url) { setLocalImages((current) => [...current.filter((item) => item.id !== attached.id), attached]); setSelectedImageId(attached.id); }
      }
      else {
        const generated = await api.mediaGenerateImage({ protocol: profile.protocol, provider: profile.provider, endpoint: profile.endpoint, apiKey: profile.apiKey, model: profile.model, prompt, size });
        const attached = generated?.filePath ? await api.collabAttachGeneratedAssetImage({ projectId: project.id, assetId: asset.id, episode: asset.first_episode || 0, filePath: generated.filePath }) : null;
        await refresh();
        return attached;
      }
    } catch (e) { setError(readableCloudError(e)); }
    finally { setBusy(false); }
  };

  const uploadLocal = async () => {
    if (busy || !canEdit) return;
    setBusy(true); setError('');
    try { const r = await api.collabUploadAssetImage({ projectId: project.id, assetId: asset.id, episode: asset.first_episode || 0 }); if (r?.url) { setLocalImages((current) => [...current.filter((item) => item.id !== r.id), r]); setSelectedImageId(r.id); } if (r) await refresh(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const deleteImage = async () => { if (!selectedImage || selectedImage.id === 'legacy') return; await api.collabDeleteAssetImage({ projectId: project.id, imageId: selectedImage.id }); setSelectedImageId(''); await refresh(); };
  const downloadImage = async () => { if (!selectedImage) return; setError(''); try { await api.collabExportImages({ archive: false, filename: asset.name, images: [{ ...selectedImage, assetName: asset.name }] }); } catch (e) { setError(`下载失败：${e.message}`); } };

  return (
    <div className="collab-image-box">
      <div className="collab-panel-title"><ImageIcon size={15} /> 图片生成 <span className="collab-ep-badge">{images.length} 张</span></div>
      <div className="collab-image-preview">
        {selectedImage ? <button type="button" className="collab-asset-image-button" onClick={() => setPreviewImage(selectedImage.url)} title="点击放大查看"><img className="collab-asset-image" src={selectedImage.url} alt={asset.name} loading="lazy" /></button> : <div className="collab-asset-image empty"><ImageIcon size={23} /><span>等待第一张定稿</span></div>}
        {images.length > 1 && <div className="collab-image-thumbs" aria-label={`${asset.name} 图片历史`}>{images.map((image, index) => <button key={image.id || index} className={selectedImage?.id === image.id ? 'active' : ''} onClick={() => setSelectedImageId(image.id)} aria-label={`查看第 ${index + 1} 张图片`}><img src={image.url} alt={`${asset.name}-${index + 1}`} loading="lazy" /></button>)}</div>}
      </div>
      {selectedImage && <div className="collab-image-item-actions"><button className="ghost" onClick={downloadImage}>单独下载</button>{selectedImage.id !== 'legacy' && <button className="danger" onClick={deleteImage} disabled={!canEdit}>删除图片</button>}</div>}
      <div className="collab-image-controls">
        <select aria-label={`${asset.name} 生图接口`} value={profileId} onChange={(e) => setProfileId(e.target.value)}><option value="">{imageProfiles.length ? '选择生图接口' : '未配置生图接口'}</option>{imageProfiles.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}</select>
        <select aria-label="图片画幅" value={size} onChange={(e) => setSize(e.target.value)}>{IMAGE_FORMATS.map((format) => <option key={format.value} value={format.size}>{format.label}</option>)}</select>
        {mates.length > 0 && <label className="collab-ref-picker"><AtSign size={13} /><select value={refId} onChange={(e) => setRefId(e.target.value)}><option value="">不引用参考</option>{mates.map((m) => <option key={m.id} value={m.id}>参考 {m.name}</option>)}</select></label>}
        <div className="collab-image-actions"><button className="primary" onClick={generate} disabled={generating || busy || !canEdit}>{generating || busy ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} {generating || busy ? '处理中…' : '生成图片'}</button><button className="secondary" onClick={uploadLocal} disabled={busy || !canEdit}><Upload size={14} /> 上传</button></div>
        {refAsset && <small className="collab-ref-hint">将参考 {refAsset.name} 的样貌，仅替换服饰/状态</small>}
        {error && <div className="collab-error">{error}</div>}
        <button type="button" className="ghost art-final-prompt-button" onClick={() => setShowPrompt(true)}>查看实际生图提示词</button>
      </div>
      {showPrompt && createPortal(<div className="veil" onMouseDown={event => event.target === event.currentTarget && setShowPrompt(false)}><div className="modal art-final-prompt-modal" role="dialog" aria-modal="true" aria-label="实际生图提示词"><header><h2>实际生图提示词</h2><button className="ghost" onClick={() => setShowPrompt(false)} aria-label="关闭提示词预览"><X size={18} /></button></header><p>包含本资产的前置、画风、描述和当前参考设置。</p><textarea readOnly value={buildImagePrompt(asset, refAsset, project.style)} aria-label="最终发送的提示词" /><div className="modal-actions"><button className="primary" onClick={() => setShowPrompt(false)}>完成</button></div></div></div>, document.body)}
      <ImageLightbox image={previewImage} alt={asset.name} onClose={() => setPreviewImage('')} />
    </div>
  );
}

/* ================================================================
 * 每行资产工作区：身份信息 → 描述编辑 → 生图框
 * ================================================================ */
function AssetDetail({ project, asset, assets, api, state, refresh, canEdit, generating = false, onGenerateImage, draftStore }) {
  const prefixed = asset.description ?? '';
  const [draft, setDraft] = useState(() => draftStore.read(project.id, asset.id)?.content ?? prefixed);
  const draftRef = useRef(draft);
  const savedRef = useRef(prefixed);
  const [saveError, setSaveError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [modifying, setModifying] = useState(false);
  const [modifyError, setModifyError] = useState('');
  const promptSettings = readAssetPrompt({ ...asset, description: draft }, project.style);
  useEffect(() => {
    draftStore.reconcile(project.id, asset);
    const pending = draftStore.read(project.id, asset.id);
    const next = pending?.content ?? prefixed;
    savedRef.current = prefixed;
    draftRef.current = next;
    setDraft(next);
  }, [asset.id, asset.description, project.style]);

  const edit = (content) => {
    draftRef.current = content;
    setDraft(content);
    draftStore.write(project.id, asset.id, content);
    setSaveError(''); setSaveNotice('草稿已保留；离开编辑框或点击生成时保存到云端');
  };

  const editContent = (content) => {
    const current = readAssetPrompt({ ...asset, description: draftRef.current }, project.style);
    edit(current.customized ? serializeAssetPrompt({ ...current, content }) : content);
  };
  const editSettings = (updates) => {
    const current = readAssetPrompt({ ...asset, description: draftRef.current }, project.style);
    edit(serializeAssetPrompt({ ...current, ...updates }));
  };
  const changePromptMode = (mode) => {
    const current = readAssetPrompt({ ...asset, description: draftRef.current }, project.style);
    editSettings({ mode, prefix: defaultAssetPromptPrefix({ ...asset, description: current.content }, project.style, mode) });
  };

  const save = async () => {
    const content = draftRef.current;
    if (!canEdit || content === savedRef.current && !draftStore.read(project.id, asset.id)) return;
    setSaving(true); setSaveError('');
    try {
      await draftStore.save(api, project.id, asset.id, content);
      savedRef.current = content;
      if (draftRef.current === content) { setSaveError(''); setSaveNotice('提示词已保存到云端'); }
      await refresh();
    } catch (error) {
      setSaveNotice(''); setSaveError(`${readableCloudError(error)}。修改内容已保留，可重试保存。`);
      throw error;
    }
    finally { setSaving(false); }
  };

  const modifyPrompt = async () => {
    if (!canEdit || !instruction.trim() || modifying) return;
    const profile = (state.apiProfiles || []).find((item) => item.id === state.activeApiId) || (state.apiProfiles || [])[0];
    if (!profile) { setModifyError('请先在「API 接口」中添加并启用一个大语言模型'); return; }
    setModifying(true); setModifyError('');
    try {
      const messages = buildAssetRevisionMessages({ instruction, originalContent: promptSettings.content, category: asset.category });
      const output = await api.aiChat({ protocol: profile.protocol, provider: profile.provider, endpoint: profile.endpoint, apiKey: profile.apiKey, model: profile.model, messages, timeout: 10 * 60 * 1000 });
      const nextDescription = String(output || '').trim();
      if (!nextDescription) throw new Error('模型没有返回新的提示词');
      editContent(nextDescription); setModifyOpen(false); setInstruction('');
      await save();
    } catch (error) { setModifyError(readableCloudError(error)); }
    finally { setModifying(false); }
  };

  return (
    <div className="collab-asset-detail">
      <section className="collab-asset-desc">
        <div className="collab-panel-title">
          <PencilLine size={15} /><strong>{asset.name} 提示词</strong>
          <span className="collab-ep-badge">出现于：{(asset.episodes || []).map((e) => `第${e}集`).join('、') || '—'}</span>
        </div>
        <textarea aria-label="资产提示词" value={promptSettings.content} readOnly={!canEdit || modifying} onChange={(e) => editContent(e.target.value)} onBlur={() => save().catch(() => {})} placeholder="可直接修改；生成图片会使用这里的最新提示词。" />
        <div className="art-prompt-settings">
          <div className="art-prompt-mode"><b>生图前置</b>{asset.category === 'character' ? <select aria-label="人物构图模式" value={promptSettings.mode} disabled={!canEdit || modifying} onChange={event => changePromptMode(event.target.value)} onBlur={() => save().catch(() => {})}>{['single', 'group', 'free'].map(mode => <option key={mode} value={mode}>{ASSET_PROMPT_MODES[mode]}</option>)}</select> : <span>{ASSET_PROMPT_MODES[promptSettings.mode]}</span>}<small>{promptSettings.customized ? '已自定义' : '自动识别 · 可修改'}</small></div>
          <details className="art-prefix-editor"><summary>编辑前置 <span>{promptSettings.mode === 'group' ? '同图多人，各有不同' : promptSettings.prefix ? '查看并调整构图与画风要求' : '无额外前置'}</span></summary><textarea aria-label="生图前置" value={promptSettings.prefix} readOnly={!canEdit || modifying} onChange={event => editSettings({ prefix: event.target.value })} onBlur={() => save().catch(() => {})} placeholder="可自由填写，也可清空。不会再自动追加隐藏前置。" /><button type="button" className="ghost" disabled={!canEdit || modifying} onClick={() => changePromptMode(promptSettings.mode)}>恢复当前画风默认前置</button></details>
        </div>
        <div className="collab-asset-actions">
          <button className="primary" onClick={() => save().catch(() => {})} disabled={!canEdit || saving || modifying}><Save size={14} /> {saving ? '保存中…' : '保存提示词'}</button>
          <button className="secondary" onClick={() => { setModifyError(''); setModifyOpen(true); }} disabled={!canEdit || modifying}>AI 修改提示词</button>
        </div>
        <small className="collab-draft-status" role="status">{saveNotice || '可直接手动编辑；单张和批量生成均使用最新提示词。'}</small>
        {saveError && <div className="collab-error" role="alert">{saveError}</div>}
      </section>
      <AssetImageBox project={project} asset={{ ...asset, description: draft }} assets={assets} api={api} state={state} refresh={refresh} canEdit={canEdit && !modifying} generating={generating} onGenerateImage={onGenerateImage} beforeGenerate={save} />
      {modifyOpen && createPortal(<div className="veil" onMouseDown={(event) => !modifying && event.target === event.currentTarget && setModifyOpen(false)}>
        <div className="modal collab-modify-prompt-modal" role="dialog" aria-modal="true" aria-label="AI 修改提示词">
          <h2>AI 修改提示词</h2>
          <label>当前提示词</label>
          <textarea className="modify-original-content" value={promptSettings.content} readOnly />
          <label>修改意见</label>
          <textarea aria-label="修改意见" value={instruction} disabled={modifying} onChange={(event) => setInstruction(event.target.value)} placeholder="描述你希望 AI 调整的内容，例如建筑年代、人物服装或构图。" autoFocus />
          {modifyError && <div className="collab-error">{modifyError}</div>}
          <div className="modal-actions"><button className="ghost" disabled={modifying} onClick={() => setModifyOpen(false)}>取消</button><button className="primary" onClick={modifyPrompt} disabled={!instruction.trim() || modifying}>{modifying ? '正在修改…' : '应用 AI 修改'}</button></div>
        </div>
      </div>, document.body)}
    </div>
  );
}

function ManualAssetDialog({ project, api, refresh, onClose, initialName = '', initialCategory = 'character', initialEpisode = null }) {
  const [name, setName] = useState(initialName); const [description, setDescription] = useState(''); const [category, setCategory] = useState(initialCategory); const [episodes, setEpisodes] = useState(initialEpisode ? [initialEpisode] : []); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);
  const projectEpisodes = (project.episodes || []).filter((item) => item.kind !== 'setting' && item.title !== '设定和小传').map((_, i) => i + 1);
  useEffect(() => {
    const previousFocus = document.activeElement;
    dialogRef.current?.querySelector('input')?.focus();
    return () => previousFocus?.focus?.();
  }, []);
  const handleDialogKeyDown = (event) => {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); }
    if (event.key !== 'Tab') return;
    const controls = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') || [])];
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const toggleEpisode = (ep) => setEpisodes((xs) => xs.includes(ep) ? xs.filter((x) => x !== ep) : [...xs, ep].sort((a, b) => a - b));
  const submit = async () => { if (!name.trim() || !episodes.length) { setError('请填写资产名称并选择至少一集'); return; } setBusy(true); try { await api.collabCreateAsset({ projectId: project.id, name: `【${name.trim().replace(/^【|】$/g, '')}】`, category, episodes, description }); await refresh(); onClose(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return createPortal(
    <div className="veil collab-manual-asset-veil" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="modal collab-manual-asset-modal" role="dialog" aria-modal="true" aria-labelledby="manual-asset-title" onKeyDown={handleDialogKeyDown}>
        <header className="manual-asset-header"><div><span className="eyebrow">ASSET LIBRARY</span><h2 id="manual-asset-title">手动添加资产</h2></div><button type="button" className="ghost" onClick={onClose} disabled={busy} aria-label="关闭添加资产"><X size={19} /></button></header>
        <div className="manual-asset-body">
          <div className="manual-asset-fields"><label>资产名称<input value={name} disabled={busy} onChange={(e) => setName(e.target.value)} placeholder="例如：姜蓝-白衣常服" /></label><label>资产类型<select value={category} disabled={busy} onChange={(e) => setCategory(e.target.value)}>{Object.entries(ASSET_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
          <label className="manual-description-field">资产描绘<textarea value={description} disabled={busy} onChange={(e) => setDescription(e.target.value)} placeholder="描述形象、服装或场景细节，可在创建后继续编辑。" /></label>
          <div className="manual-episode-heading"><b>同步到集数</b><span>已选 {episodes.length} 集</span><button type="button" className="ghost" disabled={busy || !projectEpisodes.length} onClick={() => setEpisodes(episodes.length === projectEpisodes.length ? [] : projectEpisodes)}>{episodes.length === projectEpisodes.length && projectEpisodes.length ? '清空选择' : '选择全部'}</button></div>
          <div className="manual-episode-picks">{projectEpisodes.map((ep) => <label key={ep} className={episodes.includes(ep) ? 'selected' : ''}><input type="checkbox" disabled={busy} checked={episodes.includes(ep)} onChange={() => toggleEpisode(ep)} /><span>第 {ep} 集</span></label>)}</div>
          {!projectEpisodes.length && <p className="collab-hint">请先在项目中添加剧本分集，再将资产关联到集数。</p>}
        </div>
        <footer className="manual-asset-footer">{error && <div className="collab-error" role="alert">{error}</div>}<div className="modal-actions"><small>已选 {episodes.length} 集</small><button className="ghost" onClick={onClose} disabled={busy}>取消</button><button className="primary" onClick={submit} disabled={busy}>{busy ? '保存中…' : '添加资产'}</button></div></footer>
      </div>
    </div>, document.body,
  );
}

function AssetIdentity({ asset, index, checked, onToggle, generating, children }) {
  const imageCount = asset.images?.length || (asset.image_url ? 1 : 0);
  const parsed = parseAssetName(asset.name);
  return <aside className="art-row-identity">
    <div className="art-row-index"><span>{String(index + 1).padStart(2, '0')}</span>{onToggle && <input type="checkbox" aria-label={`选择 ${asset.name} 批量生成`} checked={checked} onChange={onToggle} />}</div>
    <strong>{parsed.base || asset.name}</strong>
    {parsed.variant && <span className="art-row-variant">{parsed.variant}</span>}
    <small>{asset.reused ? `复用自第 ${asset.first_episode} 集` : asset.first_episode ? `首现 · 第 ${asset.first_episode} 集` : ASSET_CATEGORIES[asset.category]}</small>
    <span className={`art-row-state ${generating ? 'generating' : imageCount ? 'ready' : ''}`}>{generating ? <Loader2 size={11} className="spin" /> : <span />}{generating ? '生成中' : imageCount ? `${imageCount} 张图片` : '待生成'}</span>
    {children}
  </aside>;
}

// Keep anchor offsets in sync when the toolbar wraps at smaller window sizes.
function useAssetLocator(scope) {
  const root = useRef(null);
  const targets = useRef(new Map());
  const [active, setActive] = useState('');
  useEffect(() => {
    setActive('');
    const node = root.current;
    if (!node) return;
    const head = node.querySelector('.collab-art-head');
    const subhead = node.querySelector('.art-workbench-subhead');
    const measure = () => {
      const headHeight = head?.offsetHeight || 0;
      node.style.setProperty('--art-head-height', `${headHeight}px`);
      node.style.setProperty('--art-anchor-offset', `${headHeight + (subhead?.offsetHeight || 0) + 24}px`);
    };
    const observer = new ResizeObserver(measure);
    if (head) observer.observe(head);
    if (subhead) observer.observe(subhead);
    measure();
    return () => observer.disconnect();
  }, [scope]);
  const register = (key) => (node) => { if (node) targets.current.set(key, node); else targets.current.delete(key); };
  const locate = (key) => {
    const target = targets.current.get(key);
    if (!target) return;
    setActive(key);
    target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
  };
  return { root, active, register, locate };
}

function assetLocations(rows, category) {
  if (category === 'character') return groupCharacterAssets(rows).map((group) => ({
    id: group.variants[0].id, name: group.base, count: `${group.variants.length} 套妆造`,
    images: group.variants.reduce((total, item) => total + (item.images?.length || (item.image_url ? 1 : 0)), 0),
  }));
  return rows.map((asset) => ({ id: asset.id, name: asset.name.replace(/^【|】$/g, ''), count: ASSET_CATEGORIES[category], images: asset.images?.length || (asset.image_url ? 1 : 0) }));
}

function AssetQuickNav({ entries, locator, rail = false }) {
  return <nav className={rail ? 'asset-locator-rail' : 'art-quick-nav'} aria-label={rail ? '全剧资产快速定位' : '本集资产快速定位'}>
    {rail && <div className="asset-locator-heading"><b>快速定位</b><span>{entries.length} 项</span></div>}
    <div className="asset-locator-items">{entries.map((entry, index) => <button type="button" key={entry.id} className={locator.active === entry.id ? 'active' : ''} aria-current={locator.active === entry.id ? 'location' : undefined} onClick={() => locator.locate(entry.id)} title={`${entry.name} · ${entry.count}`}>
      {rail && <span className="asset-locator-number">{String(index + 1).padStart(2, '0')}</span>}
      <span className="asset-locator-copy"><b>{entry.name}</b><small>{entry.count}{rail ? ` · ${entry.images} 张图片` : ''}</small></span>
    </button>)}</div>
    {!entries.length && <small className="asset-locator-empty">暂无匹配资产</small>}
  </nav>;
}

/* ================================================================
 * 美术：按集分框 → 人物/场景/道具 → 资产列表+描述+生图
 * ================================================================ */
function ArtSection({ project, assets, api, state, refresh, canEdit, draftStore }) {
  const [episode, setEpisode] = useState(null);
  const [category, setCategory] = useState('character');
  const [search, setSearch] = useState('');
  const locator = useAssetLocator(`${project.id}:${episode}:${category}`);
  const [manualOpen, setManualOpen] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchSize, setBatchSize] = useState(IMAGE_FORMATS[0].size);
  const [exportError, setExportError] = useState('');
  const [generatingAssetIds, setGeneratingAssetIds] = useState(() => new Set());
  const generatingAssetIdsRef = useRef(new Set());
  const scriptEpisodeCount = (project.episodes || []).filter((item) => item.kind !== 'setting' && item.title !== '设定和小传').length;
  const episodes = [...new Set([...Array.from({ length: scriptEpisodeCount }, (_, index) => index + 1), ...episodeNumbersFromAssets(assets)])].sort((a, b) => a - b);
  const imagesForAssets = (rows) => rows.flatMap((item) => (item.images || []).map((image) => ({ ...image, assetName: item.name })));
  const projectImages = imagesForAssets(assets);
  const exportImages = async (images, folderName) => { setExportError(''); try { await api.collabExportImages({ archive: true, folderName, images }); } catch (e) { setExportError(`导出失败：${e.message}`); } };
  useEffect(() => {
    if (episode !== null) setBatchSelectedIds(buildAssetGenerationJobs(assets, episode).map((asset) => asset.id));
  }, [episode]);
  const onGenerateImage = useCallback(async ({ asset, profile, prompt, size }) => {
    if (generatingAssetIdsRef.current.has(asset.id)) return;
    generatingAssetIdsRef.current.add(asset.id);
    setGeneratingAssetIds((current) => new Set(current).add(asset.id));
    try {
      const generated = await api.mediaGenerateImage({ protocol: profile.protocol, provider: profile.provider, endpoint: profile.endpoint, apiKey: profile.apiKey, model: profile.model, prompt, size });
      const attached = generated?.filePath ? await api.collabAttachGeneratedAssetImage({ projectId: project.id, assetId: asset.id, episode: asset.first_episode || 0, filePath: generated.filePath }) : null;
      await refresh();
      return attached;
    } finally {
      generatingAssetIdsRef.current.delete(asset.id);
      setGeneratingAssetIds((current) => { const next = new Set(current); next.delete(asset.id); return next; });
    }
  }, [api, project.id, refresh]);
  const generateBatch = async () => {
    const profile = activeMediaProfile(state, 'image');
    const jobs = buildAssetGenerationJobs(assets, episode, ['character', 'scene', 'prop']).filter((asset) => batchSelectedIds.includes(asset.id) && !generatingAssetIdsRef.current.has(asset.id));
    if (!profile || !jobs.length || batchBusy || !canEdit) return;
    setBatchBusy(true);
    jobs.forEach((asset) => generatingAssetIdsRef.current.add(asset.id));
    setGeneratingAssetIds((current) => new Set([...current, ...jobs.map((asset) => asset.id)]));
    try {
      const results = await Promise.allSettled(jobs.map(async (asset) => {
        const draft = draftStore.read(project.id, asset.id);
        if (draft) {
          await draftStore.save(api, project.id, asset.id, draft.content);
          asset = { ...asset, description: draft.content };
        }
        const generated = await api.mediaGenerateImage({ protocol: profile.protocol, provider: profile.provider, endpoint: profile.endpoint, apiKey: profile.apiKey, model: profile.model, prompt: buildImagePrompt(asset, null, project.style), size: batchSize });
        if (generated?.filePath) await api.collabAttachGeneratedAssetImage({ projectId: project.id, assetId: asset.id, episode, filePath: generated.filePath });
      }));
      const failed = results.flatMap((result, index) => result.status === 'rejected' ? [`${jobs[index].name}：${result.reason?.message || '生成失败'}`] : []);
      setExportError(failed.length ? `${failed.length} 项未完成：${failed.join('；')}` : '');
      await refresh();
    } finally {
      jobs.forEach((asset) => generatingAssetIdsRef.current.delete(asset.id));
      setGeneratingAssetIds((current) => { const next = new Set(current); jobs.forEach((asset) => next.delete(asset.id)); return next; });
      setBatchBusy(false);
    }
  };

  if (!assets.length) {
    return <div className="collab-empty"><Palette size={30} /><p>还没有美术清单。请先在「信息读取」中确定画风与题材，然后点击「分析」。</p><button className="secondary manual-add-button" onClick={() => setManualOpen(true)} disabled={!canEdit}><Plus size={14} /> 手动添加资产</button>{manualOpen && <ManualAssetDialog project={project} api={api} refresh={refresh} onClose={() => setManualOpen(false)} />}</div>;
  }

  if (episode === null) {
    return (
      <div className="collab-art-overview">
        <div className="collab-art-exportbar"><b>全剧已生成 {projectImages.length} 张图片</b><button className="secondary" onClick={() => exportImages(projectImages, `${project.name}-全部美术图片`)} disabled={!projectImages.length}>导出整部剧图片</button>{project.myRole === 'producer' && <button className="danger" onClick={async () => { if (!window.confirm('确定清除整个项目的全部图片缓存？请先确认已下载到本地。')) return; await api.collabClearAssetImages({ projectId: project.id }); await refresh(); }}>清除图片缓存</button>}</div>
        <div className="collab-episode-grid">
        {episodes.map((ep) => {
          const chars = assetsForEpisode(assets, ep, 'character').length;
          const scenes = assetsForEpisode(assets, ep, 'scene').length;
          const props = assetsForEpisode(assets, ep, 'prop').length;
          const imageCount = imagesForAssets(assets.filter((asset) => (asset.episodes || []).includes(ep))).length;
          return (
            <button key={ep} className="collab-episode-card" onClick={() => { setEpisode(ep); setCategory('character'); setSearch(''); }}>
              <b>第 {ep} 集</b>
              <small>人物 {chars} · 场景 {scenes} · 道具 {props} · 已生成 {imageCount} 张图片</small>
            </button>
          );
        })}
        </div>
      </div>
    );
  }

  const categoryAssets = assetsForEpisode(assets, episode, category);
  const filtered = categoryAssets.filter((asset) => asset.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const list = category === 'character' ? groupCharacterAssets(filtered).flatMap((group) => group.variants) : filtered;
  const locations = assetLocations(list, category);
  const episodeImages = imagesForAssets(assets.filter((asset) => (asset.episodes || []).includes(episode)));
  const episodeJobs = buildAssetGenerationJobs(assets, episode);

  return (
    <div ref={locator.root} className="collab-art art-workbench">
      <div className="collab-art-head">
        <div className="collab-art-head-left"><button className="ghost" onClick={() => setEpisode(null)}><ArrowLeft size={15} /> 全部集数</button><b>第 {episode} 集</b><button className="secondary manual-add-button" onClick={() => setManualOpen(true)} disabled={!canEdit}><Plus size={14} /> 添加资产</button><div className="collab-cat-tabs">
          {Object.entries(ASSET_CATEGORIES).map(([key, label]) => (
            <button key={key} className={category === key ? 'active' : ''} onClick={() => { setCategory(key); setSearch(''); }}>{label}</button>
          ))}
        </div></div>
        <div className="collab-art-head-right"><select className="batch-size-picker" aria-label="批量生成画幅" value={batchSize} onChange={event => setBatchSize(event.target.value)}>{IMAGE_FORMATS.map(format => <option key={format.value} value={format.size}>{format.label}</option>)}</select><button className="secondary" onClick={() => exportImages(episodeImages, `第${episode}集`)} disabled={!episodeImages.length}>导出本集图片（{episodeImages.length}）</button><button className="secondary" onClick={() => setBatchSelectedIds(batchSelectedIds.length === episodeJobs.length ? [] : episodeJobs.map((asset) => asset.id))}>{batchSelectedIds.length === episodeJobs.length ? '取消全选' : '全选本集'}</button><button className="primary" onClick={generateBatch} disabled={!batchSelectedIds.length || batchBusy || !canEdit}>{batchBusy ? '批量生成中…' : `一键生成（${batchSelectedIds.length}）`}</button></div>
      </div>
      {exportError && <div className="collab-error">{exportError}</div>}
      <div className="art-workbench-subhead"><span>{ASSET_CATEGORIES[category]} · {categoryAssets.length} 项</span><AssetQuickNav entries={locations} locator={locator} /><input type="search" aria-label="搜索本集资产" placeholder="搜索资产名称" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <div className="collab-art-body art-workbench-rows">
        {list.map((selected, index) => <article ref={locator.register(selected.id)} tabIndex={-1} key={selected.id} className={`art-workbench-row ${batchSelectedIds.includes(selected.id) ? 'is-selected' : ''}`} aria-label={selected.name}>
          <AssetIdentity asset={selected} index={index} checked={batchSelectedIds.includes(selected.id)} onToggle={() => setBatchSelectedIds((current) => current.includes(selected.id) ? current.filter((id) => id !== selected.id) : [...current, selected.id])} generating={generatingAssetIds.has(selected.id)} />
          <AssetDetail key={selected.id} project={project} asset={selected} assets={assets} api={api} state={state} refresh={refresh} canEdit={canEdit} generating={generatingAssetIds.has(selected.id)} onGenerateImage={onGenerateImage} draftStore={draftStore} />
        </article>)}
        {!list.length && <div className="collab-empty small">{search ? '没有找到匹配的资产' : `本集没有${ASSET_CATEGORIES[category]}资产`}</div>}
      </div>
      {manualOpen && <ManualAssetDialog project={project} api={api} refresh={refresh} initialCategory={category} initialEpisode={episode} onClose={() => setManualOpen(false)} />}
    </div>
  );
}
function AssetsSection({ project, assets, api, state, refresh, canEdit, draftStore }) {
  const [category, setCategory] = useState('character');
  const [search, setSearch] = useState('');
  const [outfits, setOutfits] = useState({});
  const locator = useAssetLocator(`${project.id}:${category}`);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [generatingAssetIds, setGeneratingAssetIds] = useState(() => new Set());
  const generatingAssetIdsRef = useRef(new Set());
  const categoryAssets = assets.filter((a) => a.category === category);
  const list = categoryAssets.filter((asset) => asset.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const characterGroups = category === 'character' ? groupCharacterAssets(categoryAssets).filter((group) => group.variants.some((asset) => list.some((item) => item.id === asset.id))) : [];
  const locations = assetLocations(category === 'character' ? characterGroups.flatMap((group) => group.variants) : list, category);
  const onGenerateImage = useCallback(async ({ asset, profile, prompt, size }) => {
    if (generatingAssetIdsRef.current.has(asset.id)) return;
    generatingAssetIdsRef.current.add(asset.id);
    setGeneratingAssetIds((current) => new Set(current).add(asset.id));
    try {
      const generated = await api.mediaGenerateImage({ protocol: profile.protocol, provider: profile.provider, endpoint: profile.endpoint, apiKey: profile.apiKey, model: profile.model, prompt, size });
      const attached = generated?.filePath ? await api.collabAttachGeneratedAssetImage({ projectId: project.id, assetId: asset.id, episode: asset.first_episode || 0, filePath: generated.filePath }) : null;
      await refresh();
      return attached;
    } finally {
      generatingAssetIdsRef.current.delete(asset.id);
      setGeneratingAssetIds((current) => { const next = new Set(current); next.delete(asset.id); return next; });
    }
  }, [api, project.id, refresh]);

  if (!assets.length) {
    return <div className="collab-empty"><Box size={30} /><p>资产总览为空。完成「信息读取」的分析后，全剧资产会汇总在这里。</p><button className="secondary manual-add-button" onClick={() => setManualOpen(true)} disabled={!canEdit}><Plus size={14} /> 手动添加资产</button>{manualOpen && <ManualAssetDialog project={project} api={api} refresh={refresh} onClose={() => setManualOpen(false)} />}</div>;
  }

  return (
    <div ref={locator.root} className="collab-art art-workbench asset-library-workbench">
      <div className="collab-art-head">
        <b><Box size={16} /> 资产总览</b>
        <button className="secondary manual-add-button" onClick={() => { setManualName(''); setManualOpen(true); }} disabled={!canEdit}><Plus size={14} /> 添加资产</button>
        <div className="collab-cat-tabs">
          {Object.entries(ASSET_CATEGORIES).map(([key, label]) => (
            <button key={key} className={category === key ? 'active' : ''} onClick={() => { setCategory(key); setSearch(''); }}>{key === 'character' ? '角色' : label}</button>
          ))}
        </div>
      </div>
      <div className="art-workbench-subhead"><span>全剧{ASSET_CATEGORIES[category]} · {categoryAssets.length} 项<span className="art-workbench-caption">{category === 'character' ? '按人物定位，框内切换妆造' : '提示词与生成结果一一对应'}</span></span><input type="search" aria-label="搜索全剧资产" placeholder="搜索角色、妆造或资产" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <div className="asset-library-layout"><AssetQuickNav entries={locations} locator={locator} rail /><div className="collab-art-body art-workbench-rows">
        {category === 'character' ? characterGroups.map((group, groupIndex) => {
          const selected = group.variants.find((item) => item.id === outfits[group.base]) || group.variants[0];
          return <section ref={locator.register(group.variants[0].id)} tabIndex={-1} className="character-asset-workspace art-character-group" key={group.base} aria-label={`${group.base} 角色主档案`}>
            <header className="art-character-header"><div><span className="art-group-label">角色主档案</span><h3>{group.base}</h3><span>{group.variants.length} 套妆造 · {group.variants.reduce((count, item) => count + (item.images?.length || (item.image_url ? 1 : 0)), 0)} 张图片</span></div><button className="ghost" onClick={() => { setManualName(`${group.base}-`); setManualOpen(true); }} disabled={!canEdit}><Plus size={13} /> 添加妆造</button></header>
            <article className="art-workbench-row" aria-label={selected.name}>
              <AssetIdentity asset={selected} index={groupIndex} generating={generatingAssetIds.has(selected.id)}>
                <nav className="character-outfit-picker" aria-label={`${group.base} 服装选择`}>{group.variants.map((variant, index) => <button type="button" key={variant.id} aria-pressed={selected.id === variant.id} onClick={() => setOutfits((current) => ({ ...current, [group.base]: variant.id }))}><span>{String(index + 1).padStart(2, '0')}</span><b>{variant.variant || '基础形象'}</b>{generatingAssetIds.has(variant.id) && <Loader2 size={12} className="spin" />}</button>)}</nav>
              </AssetIdentity>
              <AssetDetail key={selected.id} project={project} asset={selected} assets={assets} api={api} state={state} refresh={refresh} canEdit={canEdit} generating={generatingAssetIds.has(selected.id)} onGenerateImage={onGenerateImage} draftStore={draftStore} />
            </article>
          </section>;
        }) : list.map((selected, index) => <article ref={locator.register(selected.id)} tabIndex={-1} key={selected.id} className="art-workbench-row" aria-label={selected.name}>
          <AssetIdentity asset={selected} index={index} generating={generatingAssetIds.has(selected.id)} />
          <AssetDetail key={selected.id} project={project} asset={selected} assets={assets} api={api} state={state} refresh={refresh} canEdit={canEdit} generating={generatingAssetIds.has(selected.id)} onGenerateImage={onGenerateImage} draftStore={draftStore} />
        </article>)}
        {!list.length && <div className="collab-empty small">{search ? '没有找到匹配的资产' : `暂无${ASSET_CATEGORIES[category]}资产`}</div>}
      </div>
      </div>
      {manualOpen && <ManualAssetDialog project={project} api={api} refresh={refresh} initialName={manualName} initialCategory={category} onClose={() => setManualOpen(false)} />}
    </div>
  );
}

/* ================================================================
 * 分镜：按集 → 场景切换 + 提示词(读导演工作台) + 本集美术 + 上传素材 + 视频生成
 * ================================================================ */
function DirectorProjectPicker({ projects, onClose, onSelect }) {
  const [selectedId, setSelectedId] = useState('');
  const selected = projects.find((project) => (project.analysis_output || project.id) === selectedId);
  return <div className="veil"><div className="modal director-project-picker"><header><div><span className="eyebrow">只读关联</span><h2>重新关联导演项目</h2></div><button className="ghost" onClick={onClose}><X size={16}/></button></header><p>选择正确的导演工作台项目。这里只读取剧本和提示词，不会创建、复制或修改导演项目。</p><div className="director-project-picker-grid">{projects.map((project) => { const id = project.analysis_output || project.id; const episodeCount = (project.episodes || []).filter((episode) => episode.kind !== 'setting').length; const promptCount = (project.episodes || []).reduce((sum, episode) => sum + (episode.prompts?.length || 0), 0); return <button key={id} className={selectedId === id ? 'active' : ''} onClick={() => setSelectedId(id)}><b>{project.name}</b><small>{episodeCount} 集 · {promptCount} 条提示词</small><span>{project.analysis_output ? '云端导演项目' : '本机导演项目'}</span></button>;})}{!projects.length && <div className="collab-empty small"><p>当前没有可读取的导演项目。请先在导演工作台导入剧本。</p></div>}</div><div className="modal-actions"><button className="ghost" onClick={onClose}>取消</button><button className="primary" disabled={!selected} onClick={() => onSelect(selected)}>选择并同步</button></div></div></div>;
}

function StoryboardSection({ project, assets, api, state, refresh, canEdit, isProducer }) {
  const episodes = Array.isArray(project.episodes) ? project.episodes : [];
  const [epIndex, setEpIndex] = useState(null);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [media, setMedia] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState('');
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [directorChoices, setDirectorChoices] = useState([]);
  const [promptDrafts, setPromptDrafts] = useState({});
  const videoProfiles = (state.mediaProfiles || []).filter((p) => p.kind === 'video');
  const [profileId, setProfileId] = useState(activeMediaProfile(state, 'video')?.id || videoProfiles[0]?.id || '');
  const [ratio, setRatio] = useState('9:16');
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState('720p');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoPrompt, setVideoPrompt] = useState('');
  const [selectedUploadedRefId, setSelectedUploadedRefId] = useState('');
  const profile = videoProfiles.find((p) => p.id === profileId);
  const capabilities = videoModelCapabilities(profile?.model);
  useEffect(() => {
    setDuration((current) => capabilities.durations.includes(current) ? current : capabilities.durations[0]);
    setResolution((current) => capabilities.resolutions.includes(current) ? current : capabilities.resolutions[0]);
    setRatio((current) => capabilities.ratios.includes(current) ? current : capabilities.ratios[0]);
  }, [profile?.model]);

  const episode = epIndex !== null ? episodes[epIndex] : null;
  const episodeFallbackNumber = epIndex === null ? 0 : episodes.slice(0, epIndex + 1).filter((item) => item.kind !== 'setting' && item.title !== '设定和小传').length;
  const epNumber = episode ? inferDirectorEpisodeNumber(episode, Math.max(1, episodeFallbackNumber)) : 0;
  const cloudProjectId = project.id;
  const availableDirectorProjects = async () => {
    const local = (state.directorProjects || []).filter((item) => item.sourceType !== 'cloud');
    let cloud = [];
    try { cloud = await api.directorCollabListProjects?.() || []; } catch { cloud = []; }
    // 云端导演文档在前：同一项目本地副本可能滞后，同步必须以云端为准
    const merged = [...cloud, ...local];
    return merged.filter((item, index) => merged.findIndex((candidate) => (candidate.analysis_output || candidate.id) === (item.analysis_output || item.id)) === index);
  };
  const applyDirectorPrompts = async (sourceProject, persistLink = false) => {
    const directorId = sourceProject.analysis_output || sourceProject.id;
    if (persistLink) await api.collabLinkDirector({ projectId: cloudProjectId, directorProjectId: directorId });
    // 云端导演文档：再拉一次完整详情，确保拿到最新提示词（列表行可能滞后或裁剪）
    let source = sourceProject;
    if (sourceProject.analysis_output || sourceProject.script !== undefined) {
      try { source = { ...sourceProject, ...(await api.directorCollabGetProject({ projectId: sourceProject.id })) }; } catch { source = sourceProject; }
    }
    const nextEpisodes = (source.episodes || []).map((sourceEpisode) => ({
      id: sourceEpisode.id,
      title: sourceEpisode.title,
      content: sourceEpisode.content || '',
      kind: sourceEpisode.kind || 'episode',
      status: sourceEpisode.status || '',
      prompts: (sourceEpisode.prompts || []).map((prompt) => ({ ...prompt })),
    }));
    const count = nextEpisodes.reduce((n, ep) => n + (ep.prompts?.length || 0), 0);
    const sourceScript = source.masterScript || source.script || nextEpisodes.map((episode) => `${episode.title || ''}\n${episode.content || ''}`).join('\n\n');
    await api.collabUpdateProject({ projectId: cloudProjectId, scope: 'director-sync', updates: { script: sourceScript, episodes: nextEpisodes } });
    await refresh(); setSyncNotice(`已重新读取《${source.name}》完整项目：同步 ${nextEpisodes.length} 集、${count} 条导演提示词；原有美术和资产保持不变`);
  };
  const syncDirectorPrompts = async () => {
    setSyncing(true); setError(''); setSyncNotice('');
    try {
      const directorId = project.director_project_id || '';
      const choices = await availableDirectorProjects();
      const exact = choices.filter((p) => p.id === directorId || p.analysis_output === directorId);
      const byName = choices.filter((p) => p.name === project.name);
      const sourceProject = exact.length >= 1 ? exact[0] : (byName.length === 1 ? byName[0] : null);
      if (!sourceProject) { setDirectorChoices(choices); setLinkPickerOpen(true); return; }
      await applyDirectorPrompts(sourceProject, !directorId);
    } catch (err) {
      setError(`同步失败：${err?.message || '网络连接异常'}`);
      try { const choices = await availableDirectorProjects(); setDirectorChoices(choices); setLinkPickerOpen(true); } catch { /* noop */ }
    } finally { setSyncing(false); }
  };

  const loadMedia = useCallback(async () => {
    if (!episode) return;
    try { setMedia(await api.collabListMedia({ projectId: project.id, episode: epNumber }) || []); } catch { /* noop */ }
  }, [project.id, epNumber, episode]);
  useEffect(() => { loadMedia(); const timer = setInterval(loadMedia, 8000); return () => clearInterval(timer); }, [loadMedia]);

  if (epIndex === null) {
    if (!episodes.length) return <div className="collab-empty"><Clapperboard size={30} /><p>该项目还没有分集数据。开启项目时会从导演工作台同步分集与提示词。</p></div>;
    return (
      <>{isProducer && <div className="collab-storyboard-syncbar"><button className="secondary" onClick={syncDirectorPrompts} disabled={syncing}><RefreshCw size={14}/>{syncing ? '正在同步…' : '同步导演提示词'}</button></div>}{syncNotice && <div className="collab-notice">{syncNotice}</div>}{error && <div className="collab-error">{error}</div>}<div className="collab-episode-grid">
        {episodes.map((ep, i) => (
          <button key={i} className="collab-episode-card" onClick={() => { setEpIndex(i); setSceneIdx(0); setVideoPrompt(''); }}>
            <b>{ep.title || `第 ${i + 1} 集`}</b>
            <small>{(ep.content || '').replace(/\s+/g, ' ').slice(0, 46) || '（无剧本内容）'}…</small>
            <span className="collab-ep-badge">{(ep.prompts || []).length} 条提示词</span>
          </button>
        ))}
      </div>{linkPickerOpen && <DirectorProjectPicker projects={directorChoices} onClose={() => setLinkPickerOpen(false)} onSelect={async (sourceProject) => { setLinkPickerOpen(false); setSyncing(true); try { await applyDirectorPrompts(sourceProject, true); } finally { setSyncing(false); } }}/>}</>
    );
  }

  // 场景划分：按提示词 label 前缀（如 1-1、1-2）分组；没有提示词时按整集
  const prompts = episode.prompts || [];
  const parsedScenes = parseDirectorScenes(episode.content || '', epNumber);
  const sceneLabels = parsedScenes.map((scene) => scene.label);
  if (!sceneLabels.length) sceneLabels.push(`${epNumber}-1`);
  const currentScene = sceneLabels[Math.min(sceneIdx, sceneLabels.length - 1)];
  const scenePrompts = prompts.filter((p) => String(p.label || '').match(new RegExp(`^${currentScene.replace('-', '\\-')}(?:-|$)`)));
  const sceneScript = parsedScenes.find((s) => s.label === currentScene)?.content || episode.content || '';
  const epAssets = assets.filter((a) => (a.episodes || []).includes(epNumber) && a.image_url);

  const generateVideo = async () => {
    if (busy || !canEdit) return;
    if (!profile) { setError('请先在画布中配置视频生成 API'); return; }
    const prompt = videoPrompt.trim() || scenePrompts.map((p) => p.content).join('\n\n');
    if (!prompt) { setError('请填写视频描述，或先在导演工作台生成该场景的提示词'); return; }
    setBusy(true); setError('');
    try {
      if (!window.confirm(`确定使用 ${profile.name || profile.model} 生成 ${duration} 秒、${resolution} 的视频吗？`)) return;
      const firstFrameUrl = media.find((item) => item.kind === 'image' && (!item.scene || item.scene === currentScene))?.url || '';
      const generated = await api.mediaGenerateVideo({ protocol: profile.protocol, provider: profile.provider, endpoint: profile.endpoint, apiKey: profile.apiKey, model: profile.model, prompt, ratio, duration, resolution, audioEnabled, firstFrameUrl });
      await api.collabRecordGeneratedMedia({ projectId: project.id, episode: epNumber, scene: currentScene, kind: 'video', filePath: generated.filePath, note: currentScene });
      await loadMedia();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const uploadAssetFor = async (note = '') => {
    if (busy || !canEdit) return;
    setBusy(true); setError('');
    try { const r = await api.collabUploadMedia({ projectId: project.id, episode: epNumber, scene: currentScene, note }); if (r) await loadMedia(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const uploadAsset = () => uploadAssetFor(currentScene);

  const sceneMedia = media.filter((m) => !m.scene || m.scene === currentScene);
  const saveStoryboardPrompt = async (prompt) => {
    const content = String(promptDrafts[prompt.id] ?? prompt.content ?? '').trim();
    if (!content || !canEdit) return;
    const nextEpisodes = episodes.map((item, index) => index !== epIndex ? item : {
      ...item,
      prompts: (item.prompts || []).map((candidate) => candidate.id === prompt.id ? { ...candidate, content, edited_at: new Date().toISOString() } : candidate),
    });
    await api.collabUpdateProject({ projectId: project.id, scope: 'storyboard', updates: { episodes: nextEpisodes } });
    setPromptDrafts((current) => { const next = { ...current }; delete next[prompt.id]; return next; });
    await refresh();
  };

  return (
    <div className="collab-storyboard">
      <aside className="collab-sb-left">
        <div className="collab-sb-ep-switch">
          <select value={epIndex} onChange={(e) => { setEpIndex(Number(e.target.value)); setSceneIdx(0); setVideoPrompt(''); }}>
            {episodes.map((ep, i) => <option key={i} value={i}>{ep.title || `第 ${i + 1} 集`}</option>)}
          </select>
          <select value={sceneIdx} onChange={(e) => setSceneIdx(Number(e.target.value))}>
            {sceneLabels.map((label, i) => <option key={label} value={i}>{label}</option>)}
          </select>
          <button className="ghost" onClick={() => setEpIndex(null)}><ArrowLeft size={14} /> 返回</button>
        </div>
        <textarea className="collab-sb-script" readOnly value={sceneScript} placeholder="当前场景剧本内容" />
      </aside>
      <section className="collab-sb-mid collab-sb-prompt-stack">
        <div className="collab-panel-title"><Sparkles size={15} /> 场景 {currentScene} · 导演工作台提示词</div>
        {scenePrompts.length ? scenePrompts.map((p) => {
          const linked = epAssets.filter((a) => a.image_url && String(p.content || '').includes(`@${a.name}`));
          const uploadedImages = sceneMedia.filter((m) => m.kind === 'image' && m.note === p.label);
          const refs = linked.length ? linked : epAssets;
          const videos = sceneMedia.filter((m) => m.kind === 'video' && (!m.note || m.note === p.label));

          const run = async () => {
            if (busy || !canEdit || !profile) return;
            const prompt = p.content || '';
            if (!window.confirm(`确定生成提示词 ${p.label}？\n模型：${profile.name || profile.model}\n${duration} 秒 · ${resolution}\n参考素材：${refs.map((a) => a.name).join('、') || '无'}`)) return;
            setBusy(true); setError('');
            try { const selectedUploaded = uploadedImages.find((item) => item.id === selectedUploadedRefId) || uploadedImages[0]; const generated = await api.mediaGenerateVideo({ protocol: profile.protocol, provider: profile.provider, endpoint: profile.endpoint, apiKey: profile.apiKey, model: profile.model, prompt, ratio, duration, resolution, audioEnabled, firstFrameUrl: selectedUploaded?.url || '' }); await api.collabRecordGeneratedMedia({ projectId: project.id, episode: epNumber, scene: currentScene, kind: 'video', filePath: generated.filePath, note: p.label }); await loadMedia(); }
            catch (e) { setError(e.message); } finally { setBusy(false); }
          };
          return <article className="collab-shot-card" key={p.id}>
            <header><b className="collab-shot-badge">{p.label}</b><span>提示词与参考素材</span></header>
            <div className="collab-shot-controls">
              <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>{!videoProfiles.length && <option value="">未配置视频接口</option>}{videoProfiles.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.model}</option>)}</select>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>{capabilities.durations.map((x) => <option key={x} value={x}>{x} 秒</option>)}</select>
              <select value={resolution} onChange={(e) => setResolution(e.target.value)}>{capabilities.resolutions.map((x) => <option key={x} value={x}>{x}</option>)}</select>
              <select value={ratio} onChange={(e) => setRatio(e.target.value)}>{capabilities.ratios.map((x) => <option key={x} value={x}>{x}</option>)}</select>
              <label><input type="checkbox" checked={audioEnabled} disabled={!capabilities.audio} onChange={(e) => setAudioEnabled(e.target.checked)} /> 音画同出</label>
              <button className="primary" onClick={run} disabled={busy || !canEdit}><Film size={14} /> {busy ? '生成中…' : '生成视频'}</button>
            </div>
            <div className="collab-shot-main"><div className="collab-shot-prompt"><textarea value={promptDrafts[p.id] ?? p.content} onChange={(event) => setPromptDrafts((current) => ({ ...current, [p.id]: event.target.value }))} disabled={!canEdit}/>{canEdit && <button className="secondary collab-prompt-save" onClick={() => saveStoryboardPrompt(p)} disabled={(promptDrafts[p.id] ?? p.content).trim() === String(p.content || '').trim()}><Save size={14}/>保存提示词</button>}</div><aside className="collab-shot-video"><div className="collab-shot-video-head"><b><Film size={14} /> 视频结果（{videos.length}）</b><button className="ghost" onClick={() => uploadAssetFor(p.label)} disabled={!canEdit || busy}><Plus size={14} /> 选择视频</button></div>{videos.length ? videos.map((m) => <div key={m.id} className="collab-video-result"><video src={m.url} controls preload="metadata" /><button className="danger" onClick={async () => await api.collabDeleteMedia({ projectId: project.id, mediaId: m.id }).then(loadMedia).catch((err) => setError(err.message))}><Trash2 size={13} /> 删除</button></div>) : <div className="collab-video-empty"><Film size={26} /><span>暂无视频</span></div>}</aside></div>
            <div className="collab-shot-assets"><b><ImageIcon size={14} /> 参考素材（@ 标记会自动关联）</b>{refs.map((a) => <figure key={a.id}><img src={a.image_url} alt={a.name} /><figcaption>{a.name}</figcaption></figure>)}{uploadedImages.map((m) => <figure key={m.id}><img src={m.url} alt="已上传参考图" /><figcaption>{m.note || '场景参考图'} <button className="asset-delete-mini" onClick={() => api.collabDeleteMedia({ projectId: project.id, mediaId: m.id }).then(loadMedia).catch((err) => setError(err.message))}><Trash2 size={11} /></button></figcaption></figure>)}{uploadedImages.length > 0 && <label className="uploaded-reference-picker">本次首帧<select value={selectedUploadedRefId || uploadedImages[0].id} onChange={(event) => setSelectedUploadedRefId(event.target.value)}>{uploadedImages.map((item) => <option key={item.id} value={item.id}>{item.note || '上传参考图'}</option>)}</select></label>}<button className="collab-add-ref" onClick={uploadAsset} disabled={!canEdit || busy}><Plus size={22} /></button>{!refs.length && !uploadedImages.length && <small>请先上传参考图片，上传完成后才可选择并作为首帧使用</small>}</div>
          </article>;
        }) : <div className="collab-empty small"><p>该场景还没有提示词，请先在导演工作台快速模式按场景生成。</p></div>}
        {error && <div className="collab-error">{error}</div>}
      </section>
    </div>
  );
}

/* ================================================================
 * 邀请协作：协作者管理 + 任务分配
 * ================================================================ */
function InviteSection({ project, api, refresh }) {
  const [tab, setTab] = useState('members');
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('artist');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [assignEp, setAssignEp] = useState('');
  const [assignTo, setAssignTo] = useState('');
  const [removeTarget, setRemoveTarget] = useState(null);
  const episodes = Array.isArray(project.episodes) ? project.episodes : [];

  const load = useCallback(async () => {
    try {
      const [m, t] = await Promise.all([api.collabListMembers({ projectId: project.id }), api.collabListTasks({ projectId: project.id })]);
      setMembers(m || []); setTasks(t || []); setError('');
    } catch (e) { setError(`成员读取失败：${e.message || '网络连接异常'}`); }
  }, [project.id]);
  useEffect(() => { load(); const timer = setInterval(load, 10000); return () => clearInterval(timer); }, [load]);

  const invite = async () => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const added = await api.collabAddMember({ projectId: project.id, username, role });
      if (added?.id) setMembers((current) => [...current.filter((member) => member.id !== added.id && member.user_id !== added.user_id), added]);
      setUsername(''); await load();
      setNotice(`已邀请 ${username}，对方的「项目协作」里会立即出现这个项目。`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const assign = async () => {
    if (busy || assignEp === '' || !assignTo) return;
    const member = members.find((m) => m.id === assignTo);
    setBusy(true); setError('');
    try {
      const epNum = Number(assignEp) + 1;
      await api.collabAssignTask({ projectId: project.id, episode: epNum, title: episodes[assignEp]?.title || `第 ${epNum} 集`, memberUserId: member.user_id, memberName: member.display_name || member.username });
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="collab-invite">
      <div className="collab-cat-tabs top">
        <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>协作者</button>
        <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>任务</button>
      </div>
      {error && <div className="collab-error">{error}</div>}
      {notice && <div className="collab-notice">{notice}</div>}
      {tab === 'members' && (
        <>
          <div className="collab-invite-maker">
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="输入对方注册的账号名（唯一）" />
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="artist">美术（信息读取 / 美术 / 资产 / 项目群）</option>
              <option value="collaborator">协作者（分镜 / 项目群）</option>
              <option value="artist_collaborator">美术 + 协作者（美术全流程 / 分镜 / 项目群）</option>
            </select>
            <button className="primary" onClick={invite} disabled={busy || !username.trim()}><UserPlus size={15} /> 邀请进入项目</button>
          </div>
          <div className="admin-table collab-members-table">
            <div className="admin-row head"><span>成员</span><span>账号</span><span>身份</span><span>加入时间</span><span>操作</span></div>
            {members.map((m) => (
              <div className="admin-row" key={m.id}>
                <span>{m.display_name || m.username}</span>
                <span className="mono">{m.username}</span>
                <span>
                  {m.role === 'producer' ? '制片（负责人）' : (
                    <select value={m.role} onChange={(e) => api.collabUpdateMemberRole({ projectId: project.id, memberId: m.id, role: e.target.value }).then(load).catch((err) => setError(err.message))}>
                      <option value="artist">美术</option>
                      <option value="collaborator">协作者</option>
                      <option value="artist_collaborator">美术 + 协作者</option>
                    </select>
                  )}
                </span>
                <span>{fmtTime(m.created_at)}</span>
                <span className="row-actions">{m.role !== 'producer' && <button className="danger" title="移出项目" onClick={() => setRemoveTarget(m)}><Trash2 size={14} /></button>}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {tab === 'tasks' && (
        <>
          <div className="collab-invite-maker">
            <select value={assignEp} onChange={(e) => setAssignEp(e.target.value)}>
              <option value="">选择集数</option>
              {episodes.map((ep, i) => <option key={i} value={i}>{ep.title || `第 ${i + 1} 集`}</option>)}
            </select>
            <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
              <option value="">分配给…</option>
              {members.filter((m) => m.role !== 'producer').map((m) => <option key={m.id} value={m.id}>{m.display_name || m.username}（{COLLAB_ROLES[m.role]}）</option>)}
            </select>
            <button className="primary" onClick={assign} disabled={busy || assignEp === '' || !assignTo}><Check size={15} /> 分配任务</button>
          </div>
          <div className="admin-table collab-tasks-table">
            <div className="admin-row head"><span>任务</span><span>分配给</span><span>分配时间</span><span>完成状态</span><span>完成时间</span></div>
            {tasks.map((task) => (
              <div className="admin-row" key={task.id}>
                <span>【{task.episode}】{task.title}</span>
                <span>{task.assignee_name}</span>
                <span>{fmtTime(task.assigned_at)}</span>
                <span>
                  <button className={`collab-task-status ${task.status === '已完成' ? 'done' : ''}`}
                    onClick={() => api.collabUpdateTask({ projectId: project.id, taskId: task.id, updates: { status: task.status === '已完成' ? '进行中' : '已完成' } }).then(load).catch((err) => setError(err.message))}>
                    {task.status}
                  </button>
                </span>
                <span>{task.done_at ? fmtTime(task.done_at) : '—'}</span>
              </div>
            ))}
            {!tasks.length && <div className="admin-empty">还没有分配任务。选择集数与协作者，点「分配任务」。</div>}
          </div>
        </>
      )}
      {removeTarget && (
        <DeleteConfirm open title="移出协作成员" name={removeTarget.display_name || removeTarget.username}
          detail="移出后对方将立即看不到这个项目，已生成的内容会保留。"
          onCancel={() => setRemoveTarget(null)}
          onConfirm={() => { api.collabRemoveMember({ projectId: project.id, memberId: removeTarget.id }).then(load).catch((err) => setError(err.message)); setRemoveTarget(null); }} />
      )}
    </div>
  );
}

/* ================================================================
 * 数据：制片专属，按成员统计操作
 * ================================================================ */
function StatsSection({ project, api }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setStats(await api.collabGetStats({ projectId: project.id })); setError(''); }
    catch (e) { setError(e.message); }
  }, [project.id]);
  useEffect(() => { load(); const timer = setInterval(load, 15000); return () => clearInterval(timer); }, [load]);

  if (error) return <div className="collab-error">{error}</div>;
  if (!stats) return <div className="collab-empty"><Loader2 size={22} className="spin" /><p>正在读取云端数据…</p></div>;
  const rows = summarizeActivity(stats.activity, stats.members);

  return (
    <div className="collab-stats">
      <div className="admin-table collab-stats-table">
        <div className="admin-row head"><span>成员</span><span>身份</span><span>生成图片</span><span>生成视频</span><span>发送消息</span><span>其他操作</span><span>最近活跃</span></div>
        {rows.map((row) => (
          <div className="admin-row" key={row.userId}>
            <span>{row.username}</span>
            <span>{COLLAB_ROLES[row.role] || row.role || '—'}</span>
            <span>{row.images}</span>
            <span>{row.videos}</span>
            <span>{row.messages}</span>
            <span>{row.edits}</span>
            <span>{row.lastActive ? fmtTime(row.lastActive) : '—'}</span>
          </div>
        ))}
      </div>
      <div className="collab-panel-title" style={{ marginTop: 18 }}><BarChart3 size={15} /> 最近操作记录</div>
      <div className="collab-activity-list">
        {stats.activity.slice(0, 60).map((row) => (
          <div key={row.id} className="collab-activity-item">
            <b>{row.username}</b>
            <span>{{ 'generate-image': '生成了图片', 'generate-video': '生成了视频', 'upload-media': '上传了素材', 'message': '发送了消息', 'analyze-script': '运行了剧本分析', 'assign-task': '分配了任务', 'add-member': '邀请了成员', 'create-project': '开启了项目' }[row.action] || '更新了内容'}{row.detail ? ` · ${row.detail}` : ''}</span>
            <small>{fmtTime(row.created_at)}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================
 * 项目群：实时消息 + 图片
 * ================================================================ */
function GroupSection({ project, api, account }) {
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const lastIdRef = useRef(0);

  const load = useCallback(async (initial = false) => {
    try {
      const rows = await api.collabListMessages({ projectId: project.id, afterId: initial ? 0 : lastIdRef.current });
      if (rows?.length) {
        lastIdRef.current = rows[rows.length - 1].id;
        setMessages((prev) => initial ? rows : [...prev, ...rows]);
        setTimeout(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, 60);
      }
      if (initial) setMembers(await api.collabListMembers({ projectId: project.id }) || []);
    } catch { /* noop */ }
  }, [project.id]);

  useEffect(() => {
    lastIdRef.current = 0; setMessages([]);
    load(true);
    const timer = setInterval(() => load(false), 4000);
    return () => clearInterval(timer);
  }, [load]);

  const send = async () => {
    if (busy || !draft.trim()) return;
    setBusy(true); setError('');
    try { await api.collabSendMessage({ projectId: project.id, content: draft }); setDraft(''); await load(false); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const sendImage = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { const r = await api.collabSendImage({ projectId: project.id }); if (r) await load(false); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="collab-group">
      <aside className="collab-group-members">
        <div className="collab-panel-title"><Users size={15} /> 群成员（{members.length}）</div>
        {members.map((m) => (
          <div key={m.id} className="collab-member-chip">
            <b>{m.display_name || m.username}</b>
            <small>{COLLAB_ROLES[m.role]}</small>
          </div>
        ))}
      </aside>
      <section className="collab-group-chat">
        <div className="collab-panel-title"><MessagesSquare size={15} /> 项目群聊 · 实时同步</div>
        <div className="collab-chat-list" ref={listRef}>
          {messages.map((msg) => (
            <div key={msg.id} className={`collab-chat-item ${msg.user_id === account?.id ? 'mine' : ''}`}>
              <div className="collab-chat-meta"><b>{msg.username}</b><small>{fmtTime(msg.created_at)}</small></div>
              {msg.content && <div className="collab-chat-bubble">{msg.content}</div>}
              {msg.image_url && <img className="collab-chat-image" src={msg.image_url} alt="图片消息" />}
            </div>
          ))}
          {!messages.length && <div className="collab-empty small"><p>群里还没有消息，说点什么吧。</p></div>}
        </div>
        {error && <div className="collab-error">{error}</div>}
        <div className="collab-chat-compose">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="请输入消息，回车发送（Shift+回车换行）" />
          <button className="secondary" onClick={sendImage} disabled={busy}><ImageIcon size={15} /> 发送图片</button>
          <button className="primary" onClick={send} disabled={busy || !draft.trim()}><Send size={15} /> 发送</button>
        </div>
      </section>
    </div>
  );
}

/* ================================================================
 * 开启项目对话框：制片从导演工作台项目中选择
 * ================================================================ */
function DeletedProjects({ projects, api, onChanged }) {
  const deleted = projects.filter((p) => p.deleted_at);
  if (!deleted.length) return null;
  return <section className="collab-deleted-projects"><h3>最近删除（3天内可恢复）</h3>{deleted.map((p) => <div key={p.id} className="collab-deleted-row"><span><b>{p.name}</b><small>恢复截止：{fmtTime(p.purge_after)}</small></span><button className="secondary" onClick={async () => { await api.collabRestoreProject({ projectId: p.id }); onChanged(); }}>恢复项目</button></div>)}</section>;
}

function StartProjectDialog({ directorProjects, onClose, onCreate, busy, error }) {
  const [selectedId, setSelectedId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProjects = directorProjects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="veil">
      <div className="modal collab-start-modal">
        <h2>开启协作项目</h2>
        <p>从导演工作台选择一部剧本项目，剧本、分集与已生成的提示词会同步到云端，与团队一起制作。</p>
        {directorProjects.length > 0 && (
          <input
            type="text"
            className="collab-start-search"
            placeholder="搜索项目名称..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        )}
        <div className="collab-start-list">
          {filteredProjects.map((p) => (
            <button key={p.id} className={selectedId === p.id ? 'active' : ''} onClick={() => setSelectedId(p.id)}>
              <b>{p.name}</b>
              <small>{p.episodes?.length || 0} 集 · {(p.episodes || []).reduce((n, ep) => n + (ep.prompts?.length || 0), 0)} 条提示词</small>
            </button>
          ))}
          {!directorProjects.length && <div className="collab-empty small"><p>导演工作台还没有项目，请先在导演工作台上传或导入剧本。</p></div>}
          {directorProjects.length > 0 && filteredProjects.length === 0 && (
            <div className="collab-empty small"><p>没有找到匹配的项目</p></div>
          )}
        </div>
        {error && <div className="collab-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>取消</button>
          <button className="primary" disabled={!selectedId || busy} onClick={() => onCreate(selectedId)}>
            {busy ? '正在开启…' : '开启项目协作'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
 * CollabWorkspace 主组件
 * ================================================================ */
export function CollabWorkspace({ state, api, account }) {
  const draftStore = useMemo(() => createAssetDraftStore(localStorage, account?.id || 'local'), [account?.id]);
  // 缓存优先：先展示上次的云端数据，网络请求返回后再刷新（解决“2G 般的显现慢”）
  const cacheKey = (suffix) => `xz-collab-cache-${suffix}`;
  const readCache = (suffix) => { try { return JSON.parse(localStorage.getItem(cacheKey(suffix))) || null; } catch { return null; } };
  const writeCache = (suffix, value) => { try { localStorage.setItem(cacheKey(suffix), JSON.stringify(value)); } catch { /* 缓存失败不影响功能 */ } };
  const [projects, setProjects] = useState(() => readCache('projects') || []);
  const [loading, setLoading] = useState(true);
  const [isProducer, setIsProducer] = useState(false);
  const [project, setProject] = useState(null);
  const [assets, setAssets] = useState([]);
  const [section, setSection] = useState('group');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [listError, setListError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const restoredRef = useRef(false);
  const refreshRequestRef = useRef(0);

  const loadProjects = useCallback(async () => {
    try { const rows = await api.collabListProjects() || []; setProjects(rows); writeCache('projects', rows); setListError(''); }
    catch (e) { setListError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadProjects();
    api.collabIsProducer?.().then(setIsProducer).catch(() => setIsProducer(false));
  }, [loadProjects]);

  // 记忆功能：切走再回来直接恢复上次操作的项目（缓存先显 + 后台刷新）
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const requestId = ++refreshRequestRef.current;
    const lastId = localStorage.getItem('xz-collab-last-project') || '';
    if (!lastId) return;
    const cachedProject = readCache(`project-${lastId}`);
    const cachedAssets = readCache(`assets-${lastId}`);
    if (cachedProject) {
      setProject(cachedProject); setAssets(cachedAssets || []);
      const lastSection = localStorage.getItem('xz-collab-last-section');
      setSection(lastSection && sectionsForRole(cachedProject.myRole).includes(lastSection) ? lastSection : sectionsForRole(cachedProject.myRole)[0]);
    }
    // 后台校验项目仍可访问并拉取最新数据
    Promise.all([
      api.collabGetProject({ projectId: lastId }),
      api.collabListAssets({ projectId: lastId }),
    ]).then(([p, a]) => {
      if (requestId !== refreshRequestRef.current) return;
      setProject(p); setAssets(a || []);
      writeCache(`project-${lastId}`, p); writeCache(`assets-${lastId}`, a || []);
      if (!cachedProject) setSection(sectionsForRole(p.myRole)[0]);
    }).catch(() => {
      if (!cachedProject) localStorage.removeItem('xz-collab-last-project');
    });
  }, []);

  useEffect(() => {
    if (project) return undefined;
    const timer = setInterval(loadProjects, 12000);
    return () => clearInterval(timer);
  }, [project, loadProjects]);

  useEffect(() => { try { if (section) localStorage.setItem('xz-collab-last-section', section); } catch { /* noop */ } }, [section]);

  const refreshProject = useCallback(async () => {
    if (!project?.id) return;
    const projectId = project.id;
    const requestId = ++refreshRequestRef.current;
    try {
      const [p, a] = await Promise.all([
        api.collabGetProject({ projectId }),
        api.collabListAssets({ projectId }),
      ]);
      if (requestId !== refreshRequestRef.current) return;
      setProject(p); setAssets(a || []);
      writeCache(`project-${projectId}`, p); writeCache(`assets-${projectId}`, a || []);
    } catch (error) {
      if (requestId !== refreshRequestRef.current) return;
      if (String(error?.message || '').includes('project_access_denied')) {
        setProject(null);
        setAssets([]);
        localStorage.removeItem('xz-collab-last-project');
        await loadProjects();
      }
    }
  }, [project?.id, loadProjects]);

  // 实时刷新：进入项目后轮询云端
  useEffect(() => {
    if (!project?.id) return;
    const timer = setInterval(refreshProject, 12000);
    return () => clearInterval(timer);
  }, [project?.id, refreshProject]);

  const openProject = async (id) => {
    const requestId = ++refreshRequestRef.current;
    // 有缓存先立即显示，再后台拉取最新
    const cachedProject = readCache(`project-${id}`);
    if (cachedProject) {
      setProject(cachedProject); setAssets(readCache(`assets-${id}`) || []);
      setSection(sectionsForRole(cachedProject.myRole)[0]);
      localStorage.setItem('xz-collab-last-project', id);
    } else {
      setLoading(true);
    }
    try {
      const [p, a] = await Promise.all([
        api.collabGetProject({ projectId: id }),
        api.collabListAssets({ projectId: id }),
      ]);
      if (requestId !== refreshRequestRef.current) return;
      setProject(p); setAssets(a || []);
      writeCache(`project-${id}`, p); writeCache(`assets-${id}`, a || []);
      if (!cachedProject) setSection(sectionsForRole(p.myRole)[0]);
      localStorage.setItem('xz-collab-last-project', id);
    } catch (e) { if (requestId === refreshRequestRef.current && !cachedProject) setListError(e.message); }
    finally { if (requestId === refreshRequestRef.current) setLoading(false); }
  };

  const createProject = async (directorProjectId) => {
    const dp = (state.directorProjects || []).find((p) => p.id === directorProjectId);
    if (!dp) return;
    setCreating(true); setCreateError('');
    try {
      const episodes = (dp.episodes || []).map((ep) => ({ title: ep.title, content: ep.content || '', prompts: (ep.prompts || []).map((p) => ({ id: p.id, label: p.label, content: p.content })) }));
      const created = await api.collabCreateProject({ name: dp.name, directorProjectId: dp.id, script: dp.masterScript || '', episodes });
      setDialogOpen(false);
      await loadProjects();
      await openProject(created.id);
    } catch (e) { setCreateError(e.message); }
    finally { setCreating(false); }
  };

  // ---------- 项目列表页 ----------
  if (!project) {
    return (
      <div className="collab-hub">
        <header>
          <span className="eyebrow">项目协作 · 云端实时同步</span>
          <h1>项目协作</h1>
        </header>
        {listError && <div className="collab-error">{listError}</div>}
        <div className="resource-grid collab-project-grid">
          {isProducer && (
            <button className="resource-card resource-add" onClick={() => { setCreateError(''); setDialogOpen(true); }}>
              <div className="resource-icon"><Plus /></div>
              <h3>开启项目</h3>
              <p>从导演工作台选择剧本项目</p>
            </button>
          )}
          {projects.filter((p) => !p.deleted_at).map((p) => (
            <article key={p.id} className="resource-card collab-project-card" onClick={() => openProject(p.id)}>
              <h3>{p.name}</h3>
              <p>负责人：{p.owner_name} · 我的身份：{COLLAB_ROLES[p.myRole]}</p>
              <p className="api-endpoint">最近更新 {fmtTime(p.updated_at)}</p>
              {p.deleted_at ? <button className="secondary" onClick={async (e) => { e.stopPropagation(); try { await api.collabRestoreProject({ projectId: p.id }); await loadProjects(); } catch (err) { setListError(`恢复失败：${err.message}`); } }}>恢复项目</button> : isProducer && <button className="danger-link" onClick={(e) => { e.stopPropagation(); setDeleteError(''); setDeleteTarget(p); }}>删除</button>}
            </article>
          ))}
          {!projects.length && !loading && !isProducer && (
            <div className="collab-empty"><Users size={30} /><p>还没有加入任何协作项目。等待制片邀请你，或联系管理员获取制片身份来开启项目。</p></div>
          )}
        </div>
        {dialogOpen && (
          <StartProjectDialog directorProjects={state.directorProjects || []} busy={creating} error={createError}
            onClose={() => setDialogOpen(false)} onCreate={createProject} />
        )}
        <DeletedProjects projects={projects.filter((p) => p.deleted_at)} api={api} onChanged={loadProjects} />
        {deleteError && <div className="collab-error">删除失败：{deleteError}</div>}
        <DeleteConfirm open={Boolean(deleteTarget)} title="删除协作项目" name={deleteTarget?.name} detail="项目会进入云端三天恢复期。三天内可恢复；到期后项目及其云端素材将自动清理，是否确定要删除此次项目？" onCancel={() => setDeleteTarget(null)} onConfirm={async () => { if (!deleteTarget) return; try { await api.collabDeleteProject({ projectId: deleteTarget.id }); setDeleteTarget(null); await loadProjects(); } catch (err) { setDeleteError(err.message || '云端删除请求失败'); } }} />
      </div>
    );
  }

  // ---------- 项目工作区 ----------
  const myRole = project.myRole;
  const visibleSections = COLLAB_SECTIONS.filter(([key]) => sectionsForRole(myRole).includes(key));
  const canEditArt = myRole === 'producer' || myRole === 'artist' || myRole === 'artist_collaborator';
  const canEditBoard = myRole === 'producer' || myRole === 'collaborator' || myRole === 'artist_collaborator';

  return (
    <div className="collab-shell">
      <aside className="collab-rail">
        <button className="collab-back" onClick={() => { refreshRequestRef.current += 1; setProject(null); setAssets([]); localStorage.removeItem('xz-collab-last-project'); loadProjects(); }}>
          <ArrowLeft size={15} /> 所有协作项目
        </button>
        <h2>{project.name}</h2>
        <div className="collab-role-badge">{COLLAB_ROLES[myRole]}{myRole === 'producer' ? ' · 负责人' : ''}</div>
        {visibleSections.map(([key, label]) => {
          const Icon = SECTION_ICONS[key];
          return (
            <button key={key} className={section === key ? 'active' : ''} onClick={() => setSection(key)}>
              <Icon size={17} /><span>{label}</span>
            </button>
          );
        })}
        <button className="collab-refresh" onClick={refreshProject}><RefreshCw size={14} /> 刷新云端数据</button>
      </aside>
      <main className="collab-stage">
        {section === 'info' && <InfoSection project={project} refresh={refreshProject} api={api} state={state} canEdit={canEditArt} />}
        {section === 'art' && <ArtSection project={project} assets={assets} api={api} state={state} refresh={refreshProject} canEdit={canEditArt} draftStore={draftStore} />}
        {section === 'assets' && <AssetsSection project={project} assets={assets} api={api} state={state} refresh={refreshProject} canEdit={canEditArt} draftStore={draftStore} />}
        {section === 'storyboard' && <StoryboardSection project={project} assets={assets} api={api} state={state} refresh={refreshProject} canEdit={canEditBoard} isProducer={myRole === 'producer'} />}
        {section === 'invite' && myRole === 'producer' && <InviteSection project={project} api={api} refresh={refreshProject} />}
        {section === 'stats' && myRole === 'producer' && <StatsSection project={project} api={api} />}
        {section === 'group' && <GroupSection project={project} api={api} account={account} />}
      </main>
    </div>
  );
}

export default CollabWorkspace;
