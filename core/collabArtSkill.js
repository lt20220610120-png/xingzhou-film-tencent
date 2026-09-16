// ============================================================
// collabArtSkill.js — 内置锁死的「剧本美术清单」Skill
// 项目协作·信息读取 专用。不可在界面中更换，仅可通过更新软件版本升级。
// ============================================================

export const COLLAB_ART_SKILL_NAME = '剧本美术清单 v5（内置）';

import skillV5 from './artAssetSkillV5.json' with { type: 'json' };
export const COLLAB_ART_SKILL_VERSION = skillV5.version;
export const COLLAB_ART_SKILL = Object.entries(skillV5.files).map(([name,content])=>`【内置文件：${name}】\n${content}`).join('\n\n') + `
【行舟影视输出适配】
第一级：集（### 第N集）；第二级：人物：/ 场景：/ 道具：；第三级：- 【资产名】。
复用免描：只列同一资产名与复用集数。人物服装的【内层】【中层】【外层】【下装】【足饰】属于描述字段，不另立资产条目。
群演默认6人静态群像（剧本有明确数量时沿用），同图多人个体有差异，纯白背景、全身完整、无表情无动作。
仅声音/仅提及/不生成形象资产记录不放进可生成的人物清单；手机等物件归道具，可见系统面板不属于人物。审计留内部，完整模式可置于三大总览之后。不要用代码围栏包裹清单。
本次是文本分析调用，没有联网或外部文件读取工具；上述引用文件已完整内置，不声称已检索外网。需考据且无法核实时标注【待确认】。
`;

// 组装发给大模型的完整消息（题材/画风前置 → Skill → 剧本）
export const buildCollabAnalysisMessages = ({ genre, script }) => [
  {
    role: 'system',
    content: `你是行舟影视的美术统筹 AI。请先读取题材信息，再完整遵循下方 Skill 的流程与输出结构，最后通读剧本并输出美术清单。只描述人物面貌、发型、服装、首饰、身材，场景与道具等客观美术特征，不加入AI真人、3D动漫或2D动漫画风前置。\n\n【题材与时代 · 请先读取】\n${genre || '未指定'}\n\n【Skill · 剧本美术清单】\n${COLLAB_ART_SKILL}`,
  },
  { role: 'user', content: `以下是完整剧本，请严格按 Skill 输出按集美术清单与三大总览：\n\n${script}` },
];

// One authoritative contract for full, episode and incremental analysis.
export const ART_RUNTIME_SKILL = COLLAB_ART_SKILL;

export const buildEpisodeAnalysisMessages = ({ genre, episodeNumber, title, content, previousSummaries = [] }) => [
  {
    role: 'system',
    content: `你是行舟影视的美术统筹 AI。直接输出最终清单，不输出推理过程。只写客观美术特征，不加入画风或生图前置。既有资产摘要、锚点与账本只用于检索、复用和差异，不作为本次待分析剧本。当前输出只包含第${episodeNumber}集，不输出其他集或全剧总览。第二套及以后只写服装妆造差异，以已有人物基准作为参考；场景只来自场次头，同地点时间变化只改光线。\n\n题材与时代：${genre || '未指定'}\n\n【完整 Skill · v5】\n${ART_RUNTIME_SKILL}`,
  },
  ...previousSummaries.map((summary) => ({ role: 'assistant', content: summary })),
  {
    role: 'user',
    content: `现在分析第${episodeNumber}集《${title || `第${episodeNumber}集`}》。必须输出且只输出以下结构：\n### 第${episodeNumber}集\n人物：\n- 【资产名】描述\n场景：\n- 【资产名】描述\n道具：\n- 【资产名】描述\n即使某类没有内容，也保留类别标题。不要漏掉本集。\n\n【当前剧本片段】\n${content || '（本集内容为空）'}`,
  },
];

export const buildEpisodeBatchAnalysisMessages = ({ genre, episodes, previousSummaries = [] }) => [
  { role: 'system', content: `你是行舟影视的美术统筹 AI。请严格遵循下方完整 Skill，一次分析下面最多三集；每集独立输出，不能串集，不要输出总览。既有摘要与锚点只用于检索复用，不是当前剧本。不加入画风或生图前置。\n\n题材与时代：${genre || '未指定'}\n\n【完整 Skill · v5】\n${COLLAB_ART_SKILL}` },
  ...previousSummaries.map((summary) => ({ role: 'assistant', content: summary })),
  { role: 'user', content: episodes.map(({ episodeNumber, title, content }) => `现在分析第${episodeNumber}集《${title || `第${episodeNumber}集`}》。必须输出且只输出以下结构：\n### 第${episodeNumber}集\n人物：\n- 【资产名】描述\n场景：\n- 【资产名】描述\n道具：\n- 【资产名】描述\n即使某类没有内容，也保留类别标题。\n\n【当前剧本片段】\n${content || '（本集内容为空）'}`).join('\n\n') },
];
