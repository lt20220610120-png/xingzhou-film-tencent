import React from 'react';
import {Film,Layers,Sparkles,ArrowUpRight} from 'lucide-react';
import companyLogo from '../assets/company-logo.png';
export function AccessLayout({version,children,updatePanel,activation=false}){
 return <main className={`access-screen ${activation?'access-activation':''}`}>
  <header className="access-topbar"><div className="access-brand"><img src={companyLogo} alt="行舟影视"/><span><strong>行舟影视</strong><small>XINGZHOU FILM</small></span></div><span className="access-version">桌面创作空间 <i/> v{version||'…'}</span></header>
  <div className="access-layout"><section className="access-story" aria-label="行舟影视创作空间"><span className="access-eyebrow"><i/>为故事而生，为创作而来</span><h1>让好故事，<br/><em>走向银幕。</em></h1><p>从第一行文字，到最后一个镜头。<br/>在行舟，让灵感成为看得见的作品。</p>
   <div className="access-storyboard" aria-hidden="true"><div className="access-frame access-frame-back"><span>SCENE 01</span><div className="access-script-lines"><i/><i/><i/><i/></div></div><div className="access-frame access-frame-front"><span>行舟 · 创作进行时 <ArrowUpRight size={16}/></span><div className="access-landscape"><div/><i/></div><small>每一个故事，都值得被看见。</small></div></div>
   <div className="access-workflow"><span><Film size={17}/>剧本创作</span><i/><span><Sparkles size={17}/>AI 影像</span><i/><span><Layers size={17}/>团队协作</span></div>
  </section><div className="access-form-column">{children}{updatePanel}</div></div>
  <footer className="access-footer"><span>故事的每一步，都在同一个工作台。</span><span>行舟影视 · 让创作自由发生</span></footer>
 </main>;
}
