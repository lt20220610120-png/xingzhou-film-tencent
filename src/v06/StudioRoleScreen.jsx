import React from 'react';
import { ArrowUpRight, BookOpen, Film, LockKeyhole, LogOut, UserRound } from 'lucide-react';
import { BrandLogo } from './GlobalTools.jsx';

function StoryPreview() {
  return <div className="studio-role-preview studio-story-preview" aria-hidden="true">
    <div className="studio-preview-topline"><span>STORY DEVELOPMENT</span><span>01 / 03</span></div>
    <div className="studio-script-paper">
      <div className="studio-script-slug"><span>第一场</span><strong>外景 · 江边 · 黎明</strong></div>
      <p>渡船缓缓靠岸。她合上手中的信，<br />望向晨雾里渐渐清晰的城市。</p>
      <div className="studio-script-dialogue"><b>她</b><span>「故事，就从这里开始。」</span></div>
      <div className="studio-script-lines"><i /><i /></div>
    </div>
    <span className="studio-script-note">一个想法，无限种展开。</span>
  </div>;
}

function ShotArtwork({ shot }) {
  return <svg viewBox="0 0 200 128" fill="none" aria-hidden="true">
    <rect width="200" height="128" fill={shot === 2 ? '#b6bdd2' : '#b9c4e3'} />
    <circle cx={shot === 2 ? '135' : '152'} cy="32" r="16" fill="#f4d7aa" />
    <path d="M0 70L39 52L66 67L109 32L144 67L173 49L200 68V128H0Z" fill="#616c8f" />
    <path d="M0 96L76 64L149 96L200 78V128H0Z" fill="#616c8f" />
    <path d="M0 112L200 93V128H0Z" fill="#2b3552" />
    {shot === 1 ? <><path d="M0 15H15V113H0M185 15H200V113H185" fill="#20263a" /><path d="M17 90L160 79M24 102L168 91" stroke="#f1e6cb" strokeWidth="1.5" /><circle cx="118" cy="69" r="6" fill="#232a3f" /><path d="M109 96L112 77Q119 72 124 78L127 96Z" fill="#232a3f" /></> : shot === 2 ? <><path d="M70 128L78 82Q104 60 128 82L140 128Z" fill="#252d47" /><path d="M84 73Q69 26 105 28Q137 32 122 77L108 91Z" fill="#d8bc99" /><path d="M83 57Q71 18 108 23Q139 33 122 66L115 39Q93 39 83 57Z" fill="#283047" /><path d="M103 62L112 63" stroke="#414b69" strokeWidth="2" /></> : <><path d="M28 101L148 81M35 113L159 93" stroke="#e5ddc2" strokeWidth="1.5" /><circle cx="80" cy="66" r="7" fill="#21283f" /><path d="M70 94L73 77Q80 72 87 78L93 96Z" fill="#e6cca7" /><path d="M75 95L73 117M87 95L92 118" stroke="#21283f" strokeWidth="5" /></>}
    <path d="M8 20V8H22M178 8H192V20M192 108V120H178M22 120H8V108" stroke="#f5f0df" strokeOpacity=".6" />
  </svg>;
}

function DirectorPreview() {
  return <div className="studio-role-preview studio-director-preview" aria-hidden="true">
    <div className="studio-preview-topline"><span>VISUAL DEVELOPMENT</span><span>SCENE 01</span></div>
    <div className="studio-shot-strip">{['远景 · 空间', '中景 · 行动', '近景 · 情绪'].map((label, index) => <div className="studio-shot" key={label}><ShotArtwork shot={index} /><span><b>0{index + 1}</b>{label}</span></div>)}</div>
    <div className="studio-preview-timeline"><span>镜头序列</span><i /><i /><i /><span>00:12</span></div>
  </div>;
}

export function StudioRoleScreen({ account, onSelect, onLogout, children }) {
  return <div className="studio-entry">
    <header className="studio-entry-header">
      <BrandLogo />
      {account ? <div className="studio-entry-account"><span><UserRound size={16} />{account.displayName || account.username}</span><button type="button" onClick={onLogout}><LogOut size={15} />退出登录</button></div> : <span className="studio-entry-edition">创作与影像制作工作台</span>}
    </header>
    <main className="studio-entry-main">
      <div className="studio-entry-intro"><div><span className="studio-kicker"><i />XINGZHOU / CREATIVE STUDIO</span><h1>好故事，从你开始。</h1><p>选择今天的工作身份，让想法走向银幕。</p></div><div className="studio-entry-index"><span>剧本</span><i /><span>视觉</span><i /><span>成片</span></div></div>
      <div className="studio-entry-roles">
        {[
          { id: 'creator', number: '01', title: '内容创作者', english: 'THE STORYTELLER', description: '把灵感写成故事，让每个角色有话可说。', tools: ['剧本创作', '内容资产', 'AI 辅助'], Icon: BookOpen, Preview: StoryPreview, action: '进入创作空间' },
          { id: 'director', number: '02', title: '导演', english: 'THE DIRECTOR', description: '从文字到镜头，掌控每一帧的表达。', tools: ['剧本拆解', '美术协作', '分镜规划'], Icon: Film, Preview: DirectorPreview, action: '进入导演工作台' },
        ].map(({ id, number, title, english, description, tools, Icon, Preview, action }) => {
          const locked = account && !account.roles.includes(id);
          return <button type="button" className={`studio-role studio-role-${id}`} key={id} onClick={() => onSelect(id)}>
            <Preview />
            <div className="studio-role-body">
              <div className="studio-role-eyebrow"><span><Icon size={15} />{english}</span><span>{number}</span></div>
              <h2>{title}</h2><p>{description}</p>
              <div className="studio-role-tools">{tools.map(tool => <span key={tool}>{tool}</span>)}</div>
              <div className="studio-role-action"><span>{locked ? <><LockKeyhole size={15} />输入解锁码</> : action}</span><ArrowUpRight size={19} /></div>
            </div>
          </button>;
        })}
      </div>
      <footer className="studio-entry-footer"><span>故事的每一步，都在同一个工作台。</span><span>身份可随时切换 <span aria-hidden="true">↗</span></span></footer>
    </main>
    {children}
  </div>;
}
