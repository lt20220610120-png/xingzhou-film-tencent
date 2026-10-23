import React from 'react';
import {Cloud, BadgeCheck} from 'lucide-react';
import {TemporaryReferenceManager} from './TemporaryReferenceManager.jsx';
import './settings-utilities.css';

export function SettingsUtilityCards({api, version}) {
 return <div className="settings-utilities">
  <section className="settings-card settings-utility" aria-label="云端临时素材设置">
   <div className="settings-utility-icon"><Cloud size={23}/></div>
   <div className="settings-utility-copy"><span className="settings-utility-kicker">存储管理</span><h2>云端临时素材</h2></div>
   <div className="settings-utility-action"><TemporaryReferenceManager api={api} className="settings-manage-references"/></div>
  </section>
  <section className="settings-card settings-utility settings-version" aria-label="软件版本信息">
   <div className="settings-utility-icon"><BadgeCheck size={23}/></div>
   <div className="settings-utility-copy"><span className="settings-utility-kicker">行舟影视 · 桌面客户端</span><h2>当前版本</h2></div>
   <div className="settings-version-badge"><span>已安装版本</span><strong>v{version}</strong></div>
  </section>
 </div>;
}
