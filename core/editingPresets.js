export const EDITING_MARKETS = [
  {id: 'domestic', name: '国内剧'},
  {id: 'overseas', name: '海外剧'},
];

export const TAIL_FRAME_MODES = [
  {id: 'default', name: '默认伪帧（最后画面定格 2 秒）'},
  {id: 'custom', name: '使用指定尾帧文件'},
];

export function defaultEditingInstruction(config = {}) {
  const overseas = config.editMarket === 'overseas';
  const subtitle = overseas
    ? '海外剧字幕：按剧本逐句匹配，最多两行，禁止出现第三行；对白开始时出现，说完立即消失，不提前出现或延迟消失。'
    : '国内剧字幕：使用中文，按剧本逐句匹配，一行不超过 8 个字且最多一行；对白开始时出现，说完立即消失，不提前出现或延迟消失。';
  const nameTag = overseas
    ? '海外剧人名条：参考海外横条样式；只在第 1—3 集人物首次出场时添加，之后不重复添加。'
    : '国内剧人名条：沿用海外人名条的文字、配色和层级，将横条改为竖条；只在第 1—3 集人物首次出场时添加，之后不重复添加。';
  const tail = config.tailFrameMode === 'custom'
    ? '尾帧：使用任务中提供的指定尾帧文件；每集最后画面先定格，再在定格后保留 2 秒。'
    : '尾帧：每集最后画面定格，定格后增加 2 秒默认伪帧；没有特殊要求时使用默认伪帧。';
  return [
    '【行舟影视默认剪辑设定】',
    '项目剧本是本次剪辑的最高依据，先完整读取剧本，再按视频标签 1-1-1、1-1-2、1-1-3 的顺序组织内容。',
    '第一步：粗剪。保证叙事逻辑通顺，剪掉闪帧和无效画面，按顺序排列镜头，必要处加入自然转场；先做无配乐、无特效、无精细调色、无字幕包装的毛坯版，只保留核心画面与同期声。',
    '第二步：音效。根据剧本中的惊讶、尴尬、动作和环境提示，在合适位置加入音效；音效不能掩盖人物说话声，音量要服从对白。',
    '第三步：配乐。依据剧本情绪选择背景音乐，每集至少使用两首背景音乐，在情绪或段落转折处自然淡入淡出换曲；只使用任务提供的背景音乐目录，不下载外部收费素材。',
    nameTag,
    tail,
    subtitle,
    '全部剪辑完成后检查对白、音效、配乐、人名条、尾帧和字幕的时间点；字幕必须与剧本文字一致，不擅自改写对白。',
  ].join('\n');
}

export function effectiveEditingInstruction(config = {}) {
  if (config.editPreset === 'custom') return String(config.editInstruction || '').trim();
  return defaultEditingInstruction(config);
}

