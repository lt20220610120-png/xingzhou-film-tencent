// ============================================================
// collabArtSkill.js — 内置锁死的「剧本美术清单」Skill
// 项目协作·信息读取 专用。不可在界面中更换，仅可通过更新软件版本升级。
// ============================================================

export const COLLAB_ART_SKILL_NAME = '剧本美术清单 v4（内置）';

import skillV4 from './artAssetSkillV4.json' with { type: 'json' };
export const COLLAB_ART_SKILL_VERSION = skillV4.version;
export const COLLAB_ART_SKILL = Object.entries(skillV4.files).map(([name,content])=>`【内置文件：${name}】\n${content}`).join('\n\n') + `
【行舟影视输出适配】
第一级：集（### 第N集）；第二级：人物：/ 场景：/ 道具：；第三级：- 【资产名】。
复用免描：只列同一资产名与复用集数。人物服装的【内层】【中层】【外层】【下装】【足饰】属于描述字段，不另立资产条目。
群演默认6人静态群像（剧本有明确数量时沿用），同图多人个体有差异，纯白背景、全身完整、无表情无动作。
仅提及/不生成形象资产条目保留在分析记录，软件不建立生成资产。不要用代码围栏包裹清单。
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

// Runtime edition: keep the v4 design rules; omit examples, repeated templates,
// research URLs and offline instructions from each paid episode request.
export const ART_RUNTIME_SKILL = `剧本美术清单 v4 · 分段执行版
仅分析本次给出的原文片段，不复述剧情，不扩写其他集。软件已完整保存原始 Skill 和九份参考文档。
从角色表、小传、场次头、对白说话人、动作提及、别名、回忆、群体逐项盘点人物；实际出镜、画外音、仅提及分清。仅提及不生成形象资产，仍列出并标注。别名有依据才合并。多人群体保留不同个体，默认六人，明确人数沿用原文。
稳定命名：人物【角色名-服装或状态】，场景【地点-时间-内外】，道具【名称-必要状态】。同地点因人物不同不拆场景，时间/内外不同要区分。换装、受伤等有明确可见差异才另立状态。名称在全剧保持一致；已列名称复用免描，但首次描述未完成时补充必要信息。
人物首次用精确、紧凑的十二段顺序写：1资产身份/视觉年龄/职业/时代地域；2脸型五官结构比例；3发型发色冠帽；4身材静态比例；5剧本明确的肤色肤质特征；6服装廓形与层次；7内层→中层→外层→下装→足饰，各写颜色、剪裁、面料、垂坠、反光、做旧及穿着关系；8静态妆造；9配饰随身物材质位置比例；10一至两个稳定审美识别点；11完整穿戴全身、中性背景均匀光线；12一致性与本资产必要负面约束。
人物只写静态面貌与服化道，不写表情、姿势、动作、视线、对白、剧情行为。不凭空改变年龄、肤色、身体特征或剧情缺陷。不写品牌Logo/明星脸，不用空泛美貌词替代具体结构。群演有个体差异。服装层次是描述字段，不能拆成独立人物资产。
服化道依据剧本时代、地域、身份、阶层、场合和连续性设计；无依据不添换装事件。内中外层穿着逻辑正确，无散件/平铺；妆发配件与时代身份匹配。明确伤痕、病损、贫困或劳作痕迹如实保留。
场景写空间布局、建筑结构、材质、陈设、光照时间与内外；道具只列实际需要的可移动物、可读物、关键物或角色随身物，写现实功能、结构尺度、材质做旧，避免无依据装饰和功能冲突。相同道具复用，关键状态另立。
只根据原文锁定题材时代；不联网、不声称查证资料。无法核实的设定标【待确认】，合理设计推断标【推断】。不输出研究过程、索引账本、全剧总览或整段模板。输出完整三类标题；无内容写“无（本段未出现）”。每个资产避免重复句，首次人物约300至500字，场景道具约80至160字，复用只写来源。仅本段内容，不遗漏可见资产。`;

export const buildEpisodeAnalysisMessages = ({ genre, episodeNumber, title, content, previousSummaries = [] }) => [
  {
    role: 'system',
    content: `你是行舟影视的美术统筹 AI。本次处理指定一集的一个片段，直接输出最终清单，不输出推理过程。只写客观美术特征，不加入AI真人、3D动漫或2D动漫画风前置。\n\n题材与时代：${genre || '未指定'}\n\n【Skill】\n${ART_RUNTIME_SKILL}`,
  },
  ...previousSummaries.map((summary) => ({ role: 'assistant', content: summary })),
  {
    role: 'user',
    content: `现在分析第${episodeNumber}集《${title || `第${episodeNumber}集`}》。必须输出且只输出以下结构：\n### 第${episodeNumber}集\n人物：\n- 【资产名】描述\n场景：\n- 【资产名】描述\n道具：\n- 【资产名】描述\n即使某类没有内容，也保留类别标题。不要漏掉本集。\n\n【本集完整剧本】\n${content || '（本集内容为空）'}`,
  },
];

export const buildEpisodeBatchAnalysisMessages = ({ style, genre, episodes, previousSummaries = [] }) => [
  { role: 'system', content: `你是行舟影视的美术统筹 AI。请严格遵循下方 Skill，一次分析下面最多三集；每集独立输出，不能串集，不要输出总览。\n\n画风：${style || '未指定'}\n题材与时代：${genre || '未指定'}\n\n【Skill】\n${COLLAB_ART_SKILL}` },
  ...previousSummaries.map((summary) => ({ role: 'assistant', content: summary })),
  { role: 'user', content: episodes.map(({ episodeNumber, title, content }) => `现在分析第${episodeNumber}集《${title || `第${episodeNumber}集`}》。必须输出且只输出以下结构：\n### 第${episodeNumber}集\n人物：\n- 【资产名】描述\n场景：\n- 【资产名】描述\n道具：\n- 【资产名】描述\n即使某类没有内容，也保留类别标题。\n\n【本集完整剧本】\n${content || '（本集内容为空）'}`).join('\n\n') },
];
