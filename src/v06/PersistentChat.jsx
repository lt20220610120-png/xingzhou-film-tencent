import React, { useState, useRef, useEffect } from 'react';
import {
  Bot, Plus, X, MessageSquare, Sparkles, Pin, PinOff,
  Trash2, Paperclip
} from 'lucide-react';
import { cleanupChatSessions, createChatSession, addChatMessage, toggleChatPin, deleteChatSession, setActiveChat } from '../../core/projectStore.js';
import { DeleteConfirm } from './DeleteConfirm.jsx';
import { buildSkillContext } from '../../core/skillContext.js';

// localStorage key for shared API config
const API_STORAGE_KEY = 'xz-api-profiles';
const LAST_USED_SKILL_KEY = 'xz-last-used-skill';

/**
 * SessionRow - 单个会话行
 */
function SessionRow({ item, active, setState, setTarget }) {
  return (
    <div className={`session-row ${active ? 'active' : ''}`}>
      <button className="session-title" onClick={() => setState((s) => setActiveChat(s, item.id))}>
        {item.title}
      </button>
      <button
        title={item.pinned ? '取消置顶' : '置顶'}
        onClick={() => setState((s) => toggleChatPin(s, item.id))}
      >
        {item.pinned ? <PinOff size={14} /> : <Pin size={14} />}
      </button>
      <button title="删除会话" onClick={() => setTarget(item)}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/**
 * PersistentChat - 持久会话聊天组件
 * 
 * 左侧：会话历史列表（置顶 + 最近）+ 新建对话按钮
 * 中间：聊天消息区域 + 紧凑输入框 + Skill 选择器
 * 右侧：用户指令快速导航
 */
export function PersistentChat({ open, onClose, state, setState, api, attachment }) {
  const [input, setInput] = useState('');
  const [skillId, setSkillId] = useState(() => {
    // 默认使用上次使用的 Skill
    try {
      return localStorage.getItem(LAST_USED_SKILL_KEY) || '';
    } catch { return ''; }
  });
  const [sending, setSending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const msgRefs = useRef({});

  // 从 localStorage 读取共享的 API 配置作为后备
  const getSharedApiProfile = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(API_STORAGE_KEY));
      if (stored && stored.endpoint) return stored;
    } catch {}
    return null;
  };

  // 优先使用 state 中的 activeApi，其次使用 localStorage 中的配置
  const activeApiProfile = state.apiProfiles?.find((p) => p.id === state.activeApiId)
    || getSharedApiProfile()
    || state.apiProfiles?.[0];

  const sessions = [...(state.chatSessions || [])].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt) - new Date(a.updatedAt)
  );
  const activeSession = sessions.find((s) => s.id === state.activeChatId) || sessions[0];

  // 自动创建会话
  useEffect(() => {
    if (open && !activeSession) {
      createNewSession();
    }
  }, [open, activeSession?.id]);

  const createNewSession = () => {
    setState((s) => createChatSession(s, '新对话'));
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending || !activeSession) return;

    if (!activeApiProfile) {
      setState((s) => addChatMessage(s, activeSession.id, 'assistant', '请先到左侧"API 接口"或"设置"连接并选择一个语言模型。'));
      return;
    }

    const skill = state.skills?.find((s) => s.id === skillId);
    // 如果有附件
    let attachmentContent = '';
    if (attachment?.content) {
      attachmentContent = `\n\n【附件：${attachment.name}】\n${attachment.content}`;
    } else if (attachment?.episodes) {
      // 多集附件
      attachmentContent = `\n\n【附件：${attachment.name} - 选中${attachment.episodes.length}集】\n${attachment.episodes.map((ep, i) => `【第${i + 1}集 ${ep.title}】\n${ep.content}`).join('\n---\n')}`;
    }

    // 保存上次使用的 Skill
    if (skillId) {
      localStorage.setItem(LAST_USED_SKILL_KEY, skillId);
    }

    // 添加用户消息
    setState((s) => addChatMessage(s, activeSession.id, 'user', text));
    setInput('');
    setSending(true);

    try {
      const messages = [
        ...(activeSession.messages || []),
        { role: 'user', content: text },
      ];

      const systemMessages = [];
      if (skill) {
        systemMessages.push({ role: 'system', content: `你是行舟影视全局 AI 助手。请完整遵循 Skill「${skill.name}」：\n\n${buildSkillContext(skill)}` });
      }

      const apiCfg = activeApiProfile.apiKey !== undefined ? activeApiProfile : { ...activeApiProfile };
      const allMessages = [
        ...systemMessages,
        ...messages.map(({ role, content }) => ({ role, content })),
        ...(attachmentContent ? [{ role: 'user', content: attachmentContent }] : []),
      ];

      const result = await api.aiChat({
        endpoint: apiCfg.endpoint,
        model: apiCfg.model,
        apiKey: apiCfg.apiKey,
        messages: allMessages,
      });

      setState((s) => addMessageToSession(s, activeSession.id, 'assistant', result));
    } catch (e) {
      setState((s) => addMessageToSession(s, activeSession.id, 'assistant', `连接失败：${e.message}`));
    } finally {
      setSending(false);
    }
  };

  const handleDeleteSession = () => {
    if (deleteTarget) {
      setState((s) => {
        const filtered = s.chatSessions.filter((cs) => cs.id !== deleteTarget.id);
        return {
          ...s,
          chatSessions: filtered,
          activeChatId: s.activeChatId === deleteTarget.id ? (filtered[0]?.id || null) : s.activeChatId,
        };
      });
      setDeleteTarget(null);
    }
  };

  const handleRemoveAttachment = () => {
    // 由父组件处理
    if (onClose) {
      // Store state of removal for rendering
    }
  };

  if (!open) return null;

  const userMessages = activeSession?.messages?.filter((m) => m.role === 'user') || [];
  const pinnedSessions = sessions.filter((s) => s.pinned);
  const unpinnedSessions = sessions.filter((s) => !s.pinned);

  return (
    <aside className="global-ai persistent-ai">
      {/* 左侧：会话历史 */}
      <nav className="chat-history">
        <button className="new-chat" onClick={createNewSession}>
          <Plus size={16} /> 开启新对话
        </button>

        {pinnedSessions.length > 0 && (
          <>
            <h4>置顶</h4>
            {pinnedSessions.map((s) => (
              <SessionRow key={s.id} item={s} active={s.id === activeSession?.id} setState={setState} setTarget={setDeleteTarget} />
            ))}
          </>
        )}

        <h4>
          最近会话 <small>7天未使用自动清理</small>
        </h4>
        {unpinnedSessions.map((s) => (
          <SessionRow key={s.id} item={s} active={s.id === activeSession?.id} setState={setState} setTarget={setDeleteTarget} />
        ))}
      </nav>

      {/* 中间：聊天区域 */}
      <section className="chat-main">
        <header>
          <div>
            <Bot size={18} />
            <span>
              <b>{activeSession?.title || '行舟 AI'}</b>
              <small>
                {activeApiProfile ? `${activeApiProfile.name || activeApiProfile.model || '自定义'} · ${activeApiProfile.model || ''}` : '尚未连接模型'}
              </small>
            </span>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </header>

        {/* 附件标签（紧凑显示在输入区上方） */}
        {attachment && (
          <div className="chat-attachment-tag">
            <Paperclip size={13} />
            <span>{attachment.name}</span>
            <button className="remove-attachment" onClick={() => onClose?.()} title="移除附件">
              <X size={13} />
            </button>
          </div>
        )}

        <div className="chat-messages">
          {(!activeSession?.messages || activeSession.messages.length === 0) && (
            <div className="chat-empty">
              <Sparkles size={32} />
              <b>随时开始创作</b>
              <p>可以直接聊天，也可以在总剧本或分集里将内容作为附件带进来。</p>
            </div>
          )}

          {activeSession?.messages?.map((msg) => (
            <div
              key={msg.id}
              id={`msg-${msg.id}`}
              ref={(el) => { if (el) msgRefs.current[msg.id] = el; }}
              className={`chat-bubble ${msg.role}`}
            >
              {msg.content}
            </div>
          ))}
        </div>

        {/* 紧凑输入区域：Skill + 发送按钮同行 */}
        <div className="chat-compose compact">
          <div className="compose-row">
            <select
              value={skillId}
              onChange={(e) => {
                setSkillId(e.target.value);
                if (e.target.value) localStorage.setItem(LAST_USED_SKILL_KEY, e.target.value);
              }}
              className="skill-select-inline"
            >
              <option value="">不使用 Skill</option>
              {state.skills?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入你的问题或创作要求……"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <button className="primary send-btn" onClick={sendMessage} disabled={sending}>
              {sending ? '思考中…' : '发送'}
            </button>
          </div>
        </div>
      </section>

      {/* 右侧：指令导航 */}
      <nav className="message-markers" aria-label="指令导航">
        {userMessages.map((msg, idx) => (
          <button
            key={msg.id}
            title={msg.content}
            onClick={() => msgRefs.current[msg.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            <span>{msg.content.slice(0, 16)}</span>
            <i />
          </button>
        ))}
      </nav>

      {/* 删除确认 */}
      <DeleteConfirm
        open={!!deleteTarget}
        title="删除会话"
        name={deleteTarget?.title}
        detail="该会话的全部消息都会删除。"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteSession}
      />
    </aside>
  );
}

// ========== 辅助函数 ==========

function addMessageToSession(state, sessionId, role, content) {
  const now = new Date().toISOString();
  const msgId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const sessions = state.chatSessions.map((s) => {
    if (s.id !== sessionId) return s;
    const msgs = s.messages || [];
    const userMsgs = [...msgs, { id: msgId, role, content, createdAt: now }].filter((m) => m.role === 'user');
    const title = userMsgs.length === 1 && role === 'user'
      ? content.slice(0, 20) + (content.length > 20 ? '…' : '')
      : s.title;
    return {
      ...s,
      title: title === '新对话' ? title : s.title,
      messages: [...msgs, { id: msgId, role, content, createdAt: now }],
      updatedAt: now,
    };
  });
  return { ...state, chatSessions: sessions };
}

export default PersistentChat;
