import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseArtAnalysis,
  buildAssetRows,
  normalizeArtAssets,
  groupCharacterAssets,
  assetsForEpisode,
  CHARACTER_PROMPT_PREFIXES,
  readAssetPrompt,
  serializeAssetPrompt,
  buildImagePrompt,
  resolveAssetReference,
} from './collabStore.js';

const analysis = (body) => parseArtAnalysis(`### 第1集\n${body}`);

test('仅声音、画外音与机械 VO 留在审计中但不生成形象', () => {
  const parsed = analysis(`人物：
- 【系统机械VO】（仅声音/画外，首次）系统机械女声播报，不存在可见实体。
- 【苏橙橙】（实际出镜，首次）资产身份：青年女性；脸型与五官：圆脸；服装：白衬衫。
场景：
- 无（本集未识别到该类资产）
道具：
- 无（本集未识别到该类资产）`);

  assert.equal(parsed.episodes[0].character.length, 2);
  assert.equal(parsed.episodes[0].character[0].generatable, false);
  assert.deepEqual(buildAssetRows(parsed).map((row) => row.name), ['【苏橙橙】']);
});

test('人物区的视觉物件迁到道具，显式拟人角色不按名称误杀', () => {
  const parsed = analysis(`人物：
- 【苏橙橙手机】（首次）外观：黑色直板手机；材质：玻璃与金属；屏幕显示来电界面。
- 【手机】（拟人角色，实际出镜，首次）资产身份：手机精灵；脸型与五官：圆润童颜；具有人形四肢；服装：银色连体衣。
- 【系统】（实体出镜，首次）资产身份：中控机器人；脸型与五官：方形显示面板；身材比例：高挑人形。
场景：
- 无（本集未识别到该类资产）
道具：
- 无（本集未识别到该类资产）`);

  assert.deepEqual(parsed.episodes[0].character.map((entry) => entry.name), ['【手机】', '【系统】']);
  assert.deepEqual(parsed.episodes[0].prop.map((entry) => entry.name), ['【苏橙橙手机】']);
  assert.deepEqual(buildAssetRows(parsed).map(({ category, name }) => [category, name]), [
    ['character', '【手机】'],
    ['character', '【系统】'],
    ['prop', '【苏橙橙手机】'],
  ]);
});

test('无实际出镜证据的待确认记录不生成，完整人物结构兼容旧清单', () => {
  const parsed = analysis(`人物：
- 【远房表哥】（无法确认，首次）出场记录：仅在台词中出现姓名，未见出镜。
- 【空记录】（首次）
- 【旧格式角色】（首次）
脸型与五官：长脸；发型发色：黑色短发；身材体态：中等身材；服装：深色夹克。
场景：
- 无（本集未识别到该类资产）
道具：
- 无（本集未识别到该类资产）`);

  assert.deepEqual(parsed.episodes[0].character.map(({ name, generatable }) => [name, generatable]), [
    ['【远房表哥】', false],
    ['【空记录】', false],
    ['【旧格式角色】', undefined],
  ]);
  assert.deepEqual(buildAssetRows(parsed).map((row) => row.name), ['【旧格式角色】']);
});

test('normalizeArtAssets 规范化旧云端资产但保留标识、图片、集数和原描述', () => {
  const voice = {
    id: 'voice', category: 'character', name: '【系统】',
    description: '仅声音/画外：系统机械女声播报，不存在可见实体。',
    images: [{ id: 'voice-image', url: 'voice.png' }], first_episode: 1, episodes: [1, 2],
  };
  const phone = {
    id: 'phone', category: 'character', name: '【苏橙橙手机】',
    description: '外观：黑色直板手机；材质：玻璃与金属；屏幕：来电界面。',
    images: [{ id: 'phone-image', url: 'phone.png' }], first_episode: 2, episodes: [2, 3],
  };
  const anthropomorphic = {
    id: 'actor', category: 'character', name: '【手机】',
    description: '拟人角色，实际出镜。脸型与五官：圆脸；发型发色：银发；服装：连体衣。',
    images: [], first_episode: 1, episodes: [1],
  };

  const normalized = normalizeArtAssets([voice, phone, anthropomorphic]);
  assert.deepEqual(normalized.map(({ id, category }) => [id, category]), [['phone', 'prop'], ['actor', 'character']]);
  assert.deepEqual(normalized[0], { ...phone, category: 'prop' });
  assert.equal(phone.category, 'character');
  assert.equal(voice.images[0].id, 'voice-image');
});

test('人物分组和按集列表统一使用旧资产规范化视图', () => {
  const assets = [
    { id: 'voice', category: 'character', name: '【系统机械VO】', description: '仅声音/画外，机械播报，无可见实体。', first_episode: 1, episodes: [1] },
    { id: 'phone', category: 'character', name: '【苏橙橙手机】', description: '外观：黑色手机；材质：玻璃；屏幕：来电。', first_episode: 1, episodes: [1] },
    { id: 'actor', category: 'character', name: '【苏橙橙-常服】', description: '实际出镜；脸型与五官：圆脸；服装：白衬衫。', first_episode: 1, episodes: [1] },
  ];

  assert.deepEqual(groupCharacterAssets(assets).map((group) => group.base), ['苏橙橙']);
  assert.deepEqual(assetsForEpisode(assets, 1, 'character').map((asset) => asset.id), ['actor']);
  assert.deepEqual(assetsForEpisode(assets, 1, 'prop').map((asset) => asset.id), ['phone']);
});

test('同名人物与道具按 category + name 分别建行', () => {
  const rows = buildAssetRows({ episodes: [{
    episode: 1,
    character: [{ name: '【小白】', category: 'character', episode: 1, description: '实际出镜；脸型：圆脸；服装：白衣。' }],
    scene: [],
    prop: [{ name: '【小白】', category: 'prop', episode: 1, description: '外观：白色药瓶；材质：瓷。' }],
  }] });

  assert.deepEqual(rows.map(({ category, name }) => [category, name]), [
    ['character', '【小白】'],
    ['prop', '【小白】'],
  ]);
});

test('只有三类区块中的列表项可建资产，描述内层标签只续写当前资产', () => {
  const parsed = analysis(`人物：
- 【林夏-常服】（实际出镜，首次）资产身份：青年女性；脸型与五官：鹅蛋脸。
【内层】：白色棉衬衫。
【审美识别点】：克制的蓝白配色。
场景：
- 【林夏公寓-日-内】（首次）布局：一室一厅。
【固定陈设】：靠墙书架。
道具：
- 【钥匙】（首次）外观：银色钥匙；材质：金属。`);

  const episode = parsed.episodes[0];
  assert.deepEqual(episode.character.map((entry) => entry.name), ['【林夏-常服】']);
  assert.match(episode.character[0].description, /【内层】：白色棉衬衫/);
  assert.match(episode.character[0].description, /【审美识别点】：克制的蓝白配色/);
  assert.deepEqual(episode.scene.map((entry) => entry.name), ['【林夏公寓-日-内】']);
  assert.match(episode.scene[0].description, /【固定陈设】：靠墙书架/);
  assert.deepEqual(episode.prop.map((entry) => entry.name), ['【钥匙】']);
});

test('normalizeArtAssets 覆盖旧云端手机、系统面板、真人状态与无实体电子音', () => {
  const assets = [
    { id: 'han-phone', category: 'character', name: '【韩川手机-到账信息】', description: '屏幕为六点七英寸黑色边框，玻璃面板显示到账信息，深色金属机身。', images: [], first_episode: 1, episodes: [1] },
    { id: 'lu-phone', category: 'character', name: '【陆苒薇手机-出租屋】', description: '资产身份：智能手机；脸型与五官：不适用；发型发色：不适用；身材比例：六点七英寸矩形机身；肤色肤质：不适用；屏幕显示来电界面。', images: [], first_episode: 1, episodes: [1] },
    { id: 'panel', category: 'character', name: '【系统面板-警告态】', description: '半透明矩形科技界面，蓝色发光边框，中央UI面板显示警告图标。', images: [], first_episode: 1, episodes: [1] },
    { id: 'system-ui', category: 'character', name: '【系统-蓝色提示界面态】', description: '明确不输出人物资产条目；蓝色半透明提示界面，矩形UI面板。', images: [], first_episode: 1, episodes: [1] },
    { id: 'han-actor', category: 'character', name: '【韩川-住建面谈商务装（电梯内手机状态）】', description: '实际出镜；脸型与五官：窄长脸、直鼻；发型发色：黑色短发；身材比例：高挑；肤色肤质：自然；服装：深色商务西装。', images: [{ id: 'keep', url: 'keep.png' }], first_episode: 2, episodes: [2] },
    { id: 'voice-system', category: 'character', name: '【系统】', description: '无实体形象，以电子音形式存在，只在脑海中响起，无画面。', images: [], first_episode: 1, episodes: [1] },
    { id: 'personified', category: 'character', name: '【系统】', description: '用户自定义拟人角色，实体出镜，穿蓝色制服的人形管理员。', images: [{ id: 'custom', url: 'custom.png' }], first_episode: 3, episodes: [3] },
  ];

  const normalized = normalizeArtAssets(assets);
  assert.deepEqual(normalized.map(({ id, category }) => [id, category]), [
    ['han-phone', 'prop'],
    ['lu-phone', 'prop'],
    ['panel', 'prop'],
    ['system-ui', 'prop'],
    ['han-actor', 'character'],
    ['personified', 'character'],
  ]);
  assert.equal(normalized.find((asset) => asset.id === 'han-actor').images[0].id, 'keep');
});

test('三种人物默认前置使用精确的新版四格三视图布局', () => {
  const layout = '白色背景，4格统一排版，左侧1格为胸像大头特写，右侧3格为全身照三视图，所有画面中的主体完全一致，面部特征完全统一、发型完全同一、服装、完全统一，身材比例完全统一。';
  for (const prefix of Object.values(CHARACTER_PROMPT_PREFIXES)) {
    assert.ok(prefix.endsWith(layout));
    assert.doesNotMatch(prefix, /纯白色背景|严格按顺序排列|展示穿搭|脚 \/ 腿/);
  }
});

test('旧默认四格前置自动迁移，序列化的其他自定义前置保持原文', () => {
  const currentLayout = '白色背景，4格统一排版，左侧1格为胸像大头特写，右侧3格为全身照三视图，所有画面中的主体完全一致，面部特征完全统一、发型完全同一、服装、完全统一，身材比例完全统一。';
  const legacyLayout = '纯白色背景，4格统一排版，左侧1格为胸像大头特写，右侧3格为全身照，严格按顺序排列：正面全身照、正面（展示穿搭 + 脚 / 腿细节）、侧面（展示身形 + 脚 / 腿侧姿）、背面（展示背影 + 脚 / 腿后侧），所有画面中的主体完全一致，面部特征完全统一、发型完全同一、服装、完全统一，身材比例完全统一。';
  const legacyDefault = CHARACTER_PROMPT_PREFIXES['AI真人'].replace(currentLayout, legacyLayout);
  const content = '圆脸，黑色短发，灰色西装。';

  assert.equal(readAssetPrompt({ category: 'character', description: `${legacyDefault}\n${content}` }).content, content);

  const serializedDefault = serializeAssetPrompt({ mode: 'single', prefix: legacyDefault, content });
  assert.deepEqual(readAssetPrompt({ category: 'character', description: serializedDefault }), {
    mode: 'single', prefix: CHARACTER_PROMPT_PREFIXES['AI真人'], content, customized: true,
  });

  const customPrefix = `${legacyDefault}\n自定义：只生成半身。`;
  const serializedCustom = serializeAssetPrompt({ mode: 'single', prefix: customPrefix, content });
  assert.equal(readAssetPrompt({ category: 'character', description: serializedCustom }).prefix, `${CHARACTER_PROMPT_PREFIXES['AI真人']}\n自定义：只生成半身。`);

  const groupCustom = serializeAssetPrompt({ mode: 'group', prefix: `${legacyDefault}\n自定义：8人同框。`, content: '8个人，面貌不同。' });
  const groupPrefix = readAssetPrompt({ category: 'character', description: groupCustom }).prefix;
  assert.match(groupPrefix, /自定义：8人同框/);
  assert.doesNotMatch(groupPrefix, /4格统一排版|胸像大头特写|全身照三视图/);
});

test('同地点场景引用只发送时间光线差异并沿用最早布局', () => {
  const reference = {
    category: 'scene', name: '【韩川出租屋-凌晨-内】',
    description: '布局：狭长一室户，入口正对窗；陈设：旧沙发与木桌；时间光线：凌晨蓝灰暗光。',
  };
  const morning = {
    category: 'scene', name: '【韩川出租屋-清晨-内】',
    description: '布局：错误重复的一室一厅；陈设：错误新增屏风；时间光线：清晨冷白晨光从窗外进入；色温：偏冷。',
  };

  const prompt = buildImagePrompt(morning, reference, 'AI真人');
  assert.match(prompt, /参考场景.*保持同一地点的空间布局/);
  assert.match(prompt, /狭长一室户/);
  assert.match(prompt, /本次时间\/光线差异/);
  assert.match(prompt, /清晨冷白晨光/);
  assert.match(prompt, /色温：偏冷/);
  assert.doesNotMatch(prompt, /错误重复|错误新增|画风与服装设定/);
});

test('后续人物套装只保留服装妆造状态差异，首次基准完整保留', () => {
  const parsed = parseArtAnalysis(`### 第1集
人物：
- 【林夏-基准造型】（实际出镜，首次）资产身份：青年女性；脸型与五官：鹅蛋脸、柳叶眉、杏眼、直鼻、薄唇；发型发色：黑色长发；身材比例：修长；肤色肤质：白皙细腻；服装：白衬衫与黑长裤；妆造：淡妆。
场景：
- 无（本集未识别到该类资产）
道具：
- 无（本集未识别到该类资产）
### 第2集
人物：
- 【林夏-晚宴礼服】（实际出镜，首次，换装）资产身份：青年女性；脸型与五官：鹅蛋脸、柳叶眉、杏眼、直鼻、薄唇；发型发色：黑色长发；身材比例：修长；肤色肤质：白皙细腻；服装总轮廓：深蓝色曳地礼服；【外层】：丝绒披肩；【足饰】：银色高跟鞋；妆造：红唇晚宴妆；配饰：珍珠耳钉。
场景：
- 无（本集未识别到该类资产）
道具：
- 无（本集未识别到该类资产）`);

  const rows = buildAssetRows(parsed);
  const baseline = rows.find((row) => row.name === '【林夏-基准造型】');
  const evening = rows.find((row) => row.name === '【林夏-晚宴礼服】');
  assert.match(baseline.description, /柳叶眉.*直鼻.*肤色肤质/);
  assert.match(evening.description, /服装总轮廓：深蓝色曳地礼服/);
  assert.match(evening.description, /【外层】：丝绒披肩/);
  assert.match(evening.description, /妆造：红唇晚宴妆/);
  assert.doesNotMatch(evening.description, /资产身份|脸型|柳叶眉|杏眼|直鼻|薄唇|身材比例|肤色肤质/);
});

test('normalizeArtAssets 以 generationDescription 提供差异裁剪且不改手动 description', () => {
  const baseline = { id: 'base', category: 'character', name: '【林夏-基准造型】', first_episode: 1, episodes: [1], description: '脸型与五官：鹅蛋脸；发型发色：黑色长发；身材比例：修长；肤色肤质：自然；服装：白衬衫。' };
  const repeated = { id: 'evening', category: 'character', name: '【林夏-晚宴礼服】', first_episode: 2, episodes: [2], description: '脸型与五官：错误方脸；发型发色：黑色长发；身材比例：修长；肤色肤质：自然；服装：深蓝礼服；妆造：红唇晚宴妆。', images: [{ id: 'history', url: 'history.png' }] };
  const manual = { id: 'manual', category: 'character', name: '【林夏-用户自定义】', first_episode: 3, episodes: [3], description: '用户手写：保留原文，不自动改写这一段。' };

  const normalized = normalizeArtAssets([baseline, repeated, manual]);
  const evening = normalized.find((asset) => asset.id === 'evening');
  assert.equal(evening.description, repeated.description);
  assert.match(evening.generationDescription, /服装：深蓝礼服/);
  assert.match(evening.generationDescription, /妆造：红唇晚宴妆/);
  assert.doesNotMatch(evening.generationDescription, /脸型|发型发色|身材比例|肤色肤质/);
  assert.equal(evening.images[0].id, 'history');
  const prompt = buildImagePrompt(evening, normalized.find((asset) => asset.id === 'base'), 'AI真人');
  assert.match(prompt, /鹅蛋脸/);
  assert.doesNotMatch(prompt, /错误方脸/);
  assert.equal(normalized.find((asset) => asset.id === 'manual').generationDescription, undefined);
});

test('V5 换装参考 metadata 随差异描述进入资产行', () => {
  const rows = buildAssetRows(parseArtAnalysis(`### 第1集
人物：
- 【林夏-基准造型】（实际出镜，首次）脸型与五官：鹅蛋脸；发型发色：黑色长发；身材比例：修长；肤色肤质：自然；服装：白衬衫。
场景：
- 无（本集未识别到该类资产）
道具：
- 无（本集未识别到该类资产）
### 第2集
人物：
- 【林夏-晚宴礼服】（首次，换装；参考【林夏-基准造型】）服装差异：深蓝色曳地礼服；妆造差异：红唇晚宴妆。
场景：
- 无（本集未识别到该类资产）
道具：
- 无（本集未识别到该类资产）`));

  const variant = rows.find((row) => row.name === '【林夏-晚宴礼服】');
  assert.match(variant.description, /参考【林夏-基准造型】/);
  assert.match(variant.description, /服装差异：深蓝色曳地礼服/);
  assert.match(variant.description, /妆造差异：红唇晚宴妆/);
});

test('同地点时间卡裁成光线差异，不模糊合并出租屋与出租屋客厅', () => {
  const rows = buildAssetRows(parseArtAnalysis(`### 第1集
人物：
- 无（本集未识别到该类资产）
场景：
- 【韩川出租屋-内】（场次头1-1，首次）布局：狭长一室户；陈设：旧沙发；时间光线：凌晨蓝灰暗光。
- 【韩川出租屋客厅-内】（场次头1-2，首次）布局：方正客厅；陈设：布艺沙发；时间光线：凌晨暖光。
道具：
- 无（本集未识别到该类资产）
### 第2集
人物：
- 无（本集未识别到该类资产）
场景：
- 【韩川出租屋-清晨-内】（场次头2-1，首次；参考【韩川出租屋-内】）布局：错误重复一室户；陈设：错误新增屏风；时间光线：清晨冷白晨光。
- 【韩川出租屋客厅-清晨-内】（场次头2-2，首次；参考【韩川出租屋客厅-内】）布局：错误重复客厅；时间光线：清晨暖光。
道具：
- 无（本集未识别到该类资产）`));

  const apartment = rows.find((row) => row.name === '【韩川出租屋-清晨-内】');
  const livingRoom = rows.find((row) => row.name === '【韩川出租屋客厅-清晨-内】');
  assert.match(apartment.description, /参考【韩川出租屋-内】/);
  assert.match(apartment.description, /时间光线：清晨冷白晨光/);
  assert.doesNotMatch(apartment.description, /错误重复|错误新增|布局|陈设/);
  assert.match(livingRoom.description, /参考【韩川出租屋客厅-内】/);
  assert.match(livingRoom.description, /时间光线：清晨暖光/);
  assert.notEqual(apartment.description, livingRoom.description);
});

test('normalizeArtAssets 为旧场景时间变体派生 generationDescription 而不改原描述', () => {
  const baseline = { id: 'base-scene', category: 'scene', name: '【韩川出租屋-内】', first_episode: 1, episodes: [1], description: '布局：狭长一室户；陈设：旧沙发；时间光线：凌晨暗光。' };
  const morning = { id: 'morning-scene', category: 'scene', name: '【韩川出租屋-清晨-内】', first_episode: 2, episodes: [2], description: '参考【韩川出租屋-内】；布局：重复布局；陈设：重复陈设；时间/光线差异：清晨冷白晨光。' };
  const livingRoom = { id: 'room-scene', category: 'scene', name: '【韩川出租屋客厅-内】', first_episode: 1, episodes: [1], description: '布局：方正客厅；陈设：布艺沙发。' };

  const normalized = normalizeArtAssets([baseline, morning, livingRoom]);
  const variant = normalized.find((asset) => asset.id === 'morning-scene');
  assert.equal(variant.description, morning.description);
  assert.equal(variant.generationDescription, '参考【韩川出租屋-内】；时间/光线差异：清晨冷白晨光。');
  assert.equal(normalized.find((asset) => asset.id === 'room-scene').generationDescription, undefined);
});

test('V4 句号字段边界完整保留新衣，不重复脸骨眉眼鼻唇身形肤质', () => {
  const baseline = { id: 'base-v4', category: 'character', name: '【韩川-灰睡衣】', first_episode: 1, episodes: [1], description: '身份与依据：青年男性。脸型骨相：窄长脸。眉眼：平直眉。鼻唇与耳部：直鼻薄唇。肤质与辨识点：自然肤质。发型与发饰：黑色短发。身形比例：高挑。服装总体：灰色睡衣。服装层次：单层棉布。妆造：自然。' };
  const suit = { id: 'suit-v4', category: 'character', name: '【韩川-商务装】', first_episode: 2, episodes: [2], description: '身份与依据：青年男性。脸型骨相：窄长脸。眉眼：平直眉。鼻唇与耳部：直鼻薄唇。肤质与辨识点：自然肤质。发型与发饰：黑色短发。身形比例：高挑。服装总体：深灰修身西装。服装层次：白衬衫、深灰西装外套。分层服装细节：羊毛面料、窄驳领。妆造差异：商务淡妆。配饰与随身物：银色腕表。' };

  const variant = normalizeArtAssets([baseline, suit]).find((asset) => asset.id === 'suit-v4');
  assert.match(variant.generationDescription, /服装总体：深灰修身西装/);
  assert.match(variant.generationDescription, /服装层次：白衬衫、深灰西装外套/);
  assert.match(variant.generationDescription, /分层服装细节：羊毛面料、窄驳领/);
  assert.match(variant.generationDescription, /妆造差异：商务淡妆/);
  assert.match(variant.generationDescription, /配饰与随身物：银色腕表/);
  assert.doesNotMatch(variant.generationDescription, /身份与依据|脸型骨相|眉眼|鼻唇与耳部|肤质与辨识点|发型与发饰|身形比例/);
});

test('有真实参考图时提示词只保留引用指令，不回灌旧人物与场景长描述', () => {
  const characterRef = { id: 'char-base', category: 'character', name: '【林夏-基准造型】', description: '旧脸型细节；旧白衬衫。', images: [{ id: 'char-image', url: 'char.png' }] };
  const character = { id: 'char-next', category: 'character', name: '【林夏-晚宴礼服】', description: '脸型与五官：错误方脸；服装差异：深蓝礼服；妆造差异：红唇。' };
  const characterPrompt = buildImagePrompt(character, characterRef, 'AI真人');
  assert.match(characterPrompt, /参考角色图片.*char-base.*保持.*同一人物/);
  assert.match(characterPrompt, /服装差异：深蓝礼服/);
  assert.doesNotMatch(characterPrompt, /旧脸型细节|旧白衬衫|错误方脸/);

  const sceneRef = { id: 'scene-base', category: 'scene', name: '【韩川出租屋-内】', description: '旧布局长描述；旧沙发与木桌。', images: [{ id: 'scene-image', url: 'scene.png' }] };
  const scene = { id: 'scene-next', category: 'scene', name: '【韩川出租屋-清晨-内】', description: '布局：错误重复布局；时间/光线差异：清晨冷白晨光。' };
  const scenePrompt = buildImagePrompt(scene, sceneRef, 'AI真人');
  assert.match(scenePrompt, /参考场景图片.*scene-base.*保持同一地点的空间布局/);
  assert.match(scenePrompt, /本次时间\/光线差异：清晨冷白晨光/);
  assert.doesNotMatch(scenePrompt, /旧布局长描述|旧沙发与木桌|错误重复布局/);
});

test('多行人物条目完成后再把手机 NA 字段迁到 prop 而非丢弃', () => {
  const parsed = parseArtAnalysis(`### 第1集
人物：
- 【陆苒薇手机-出租屋】（首次）
资产身份：智能手机。
脸型与五官：不适用。
发型发色：不适用。
身材比例：六点七英寸矩形机身。
肤色肤质：不适用。
屏幕：黑色边框来电界面。
场景：
- 无（本集未识别到该类资产）
道具：
- 无（本集未识别到该类资产）`);

  assert.deepEqual(parsed.episodes[0].character, []);
  assert.deepEqual(parsed.episodes[0].prop.map((entry) => entry.name), ['【陆苒薇手机-出租屋】']);
  const row = buildAssetRows(parsed)[0];
  assert.equal(row.category, 'prop');
  assert.match(row.description, /六点七英寸矩形机身/);
});

test('normalizeArtAssets 分类前剥离旧人物默认前置，误道具改用 prop 前置且保留真自定义', () => {
  const content = '屏幕为六点七英寸黑色边框，玻璃面板显示到账信息，深色金属机身。';
  const raw = { id: 'raw-phone', category: 'character', name: '【韩川手机-到账信息】', description: `${CHARACTER_PROMPT_PREFIXES['AI真人']}\n${content}` };
  const savedDefault = { id: 'saved-phone', category: 'character', name: '【韩川手机-余额】', description: serializeAssetPrompt({ mode: 'single', prefix: CHARACTER_PROMPT_PREFIXES['AI真人'], content }) };
  const customPrefix = '自定义科技界面构图，不使用白底。';
  const savedCustom = { id: 'custom-phone', category: 'character', name: '【韩川手机-自定义】', description: serializeAssetPrompt({ mode: 'single', prefix: customPrefix, content }) };
  const savedAppended = { id: 'appended-phone', category: 'character', name: '【韩川手机-追加前置】', description: serializeAssetPrompt({ mode: 'single', prefix: `${CHARACTER_PROMPT_PREFIXES['AI真人']}\n自定义：保留俯拍构图。`, content }) };

  const normalized = normalizeArtAssets([raw, savedDefault, savedCustom, savedAppended]);
  assert.deepEqual(normalized.map(({ category }) => category), ['prop', 'prop', 'prop', 'prop']);
  assert.equal(normalized[0].description, raw.description);
  assert.match(buildImagePrompt(normalized[0]), /^纯白色背景。/);
  assert.doesNotMatch(buildImagePrompt(normalized[0]), /真人拍摄|4格统一排版/);
  assert.match(buildImagePrompt(normalized[1]), /^纯白色背景。/);
  assert.doesNotMatch(buildImagePrompt(normalized[1]), /真人拍摄|4格统一排版/);
  assert.match(buildImagePrompt(normalized[2]), /^自定义科技界面构图，不使用白底。/);
  assert.match(buildImagePrompt(normalized[3]), /^纯白色背景。/);
  assert.match(buildImagePrompt(normalized[3]), /自定义：保留俯拍构图/);
  assert.doesNotMatch(buildImagePrompt(normalized[3]), /真人拍摄|4格统一排版/);
});

test('V5 同角色参考加服装差异可证明人物变体，无需重复五官或换装字样', () => {
  const parsed = parseArtAnalysis(`### 第2集
人物：
- 【林夏-晚宴礼服】（首次；参考【林夏-基准造型】）服装差异：深蓝色曳地礼服。
场景：
- 无（本集未识别到该类资产）
道具：
- 无（本集未识别到该类资产）`);

  assert.equal(parsed.episodes[0].character[0].generatable, undefined);
  assert.deepEqual(buildAssetRows(parsed).map((row) => row.name), ['【林夏-晚宴礼服】']);
});

test('中文集号、EP 集号和带标题的普通集头均可解析且不混淆类别标题', () => {
  const parsed = parseArtAnalysis(`第一集
人物：
- 【甲】（实际出镜，首次）脸型与五官：圆脸；服装：白衣。
场景：
- 无（本集未识别到该类资产）
道具：
- 无（本集未识别到该类资产）
EP02
人物：
- 【乙】（实际出镜，首次）脸型与五官：长脸；服装：黑衣。
场景：
- 无（本集未识别到该类资产）
道具：
- 无（本集未识别到该类资产）
第3集 雨夜
人物：
- 【丙】（实际出镜，首次）脸型与五官：方脸；服装：灰衣。
场景：
- 无（本集未识别到该类资产）
道具：
- 无（本集未识别到该类资产）`);

  assert.deepEqual(parsed.episodes.map((episode) => episode.episode), [1, 2, 3]);
  assert.deepEqual(parsed.episodes.map((episode) => episode.character[0].name), ['【甲】', '【乙】', '【丙】']);
});

test('编辑后的 description 使旧 generationDescription projection 失效并用于实际提示词', () => {
  const baseline = { id: 'base-edit', category: 'character', name: '【林夏-基准造型】', first_episode: 1, episodes: [1], description: '脸型与五官：鹅蛋脸；发型发色：黑发；身材比例：修长；肤色肤质：自然；服装：白衬衫。', images: [{ id: 'base-image', url: 'base.png' }] };
  const oldVariant = { id: 'variant-edit', category: 'character', name: '【林夏-外套】', first_episode: 2, episodes: [2], description: '脸型与五官：错误方脸；发型发色：黑发；身材比例：修长；肤色肤质：自然；服装：旧蓝外套。' };
  const [normalizedBaseline, normalizedVariant] = normalizeArtAssets([baseline, oldVariant]);
  assert.equal(normalizedVariant.generationDescriptionSource, oldVariant.description);
  assert.match(normalizedVariant.generationDescription, /旧蓝外套/);

  const edited = { ...normalizedVariant, description: '服装差异：用户改成红外套。' };
  const prompt = buildImagePrompt(edited, normalizedBaseline, 'AI真人');
  assert.match(prompt, /用户改成红外套/);
  assert.doesNotMatch(prompt, /旧蓝外套|错误方脸/);

  const manual = { ...edited, description: serializeAssetPrompt({ mode: 'single', prefix: '用户自定义前置。', content: '用户完整手写：红外套与特定构图。' }) };
  const manualPrompt = buildImagePrompt(manual, normalizedBaseline, 'AI真人');
  assert.match(manualPrompt, /用户完整手写：红外套与特定构图/);
});

test('无依据自动换装和仅轻微擦伤不膨胀，已有图与手动自定义仍保留', () => {
  const parsed = parseArtAnalysis(`### 第1集
人物：
- 【林夏-基准造型】（实际出镜，首次）脸型与五官：鹅蛋脸；服装：白衬衫。
- 【路人甲-基准造型】（实际出镜，首次）脸型与五官：方脸；服装：灰夹克。
场景：
- 无（本集未识别到该类资产）
道具：
- 无（本集未识别到该类资产）
### 第2集
人物：
- 【林夏-自动换装】（实际出镜，首次，换装）无原文依据，自动设计换装；服装差异：红色礼服。
- 【路人甲-轻微擦伤】（实际出镜，首次）状态差异：脸颊一处轻微擦伤。
场景：
- 无（本集未识别到该类资产）
道具：
- 无（本集未识别到该类资产）`);
  assert.deepEqual(buildAssetRows(parsed).filter((row) => row.category === 'character').map((row) => row.name), [
    '【林夏-基准造型】', '【路人甲-基准造型】',
  ]);
  const incrementalMinor = parseArtAnalysis(`### 第3集\n人物：\n- 【路人甲-轻微擦伤】（实际出镜，首次）状态差异：脸颊一处轻微擦伤。\n场景：\n- 无（本集未识别到该类资产）\n道具：\n- 无（本集未识别到该类资产）`);
  assert.deepEqual(buildAssetRows(incrementalMinor), []);

  const existing = [
    { id: 'base', category: 'character', name: '【路人甲-基准造型】', first_episode: 1, description: '脸型与五官：方脸；服装：灰夹克。' },
    { id: 'keep-image', category: 'character', name: '【路人甲-轻微擦伤】', first_episode: 2, description: '状态差异：脸颊一处轻微擦伤。', images: [{ id: 'history', url: 'history.png' }] },
    { id: 'drop-empty', category: 'character', name: '【路人甲-轻微红肿】', first_episode: 3, description: '状态差异：额角轻微红肿。', images: [] },
    { id: 'manual', category: 'character', name: '【路人甲-用户状态】', first_episode: 4, description: serializeAssetPrompt({ mode: 'single', prefix: '用户自定义。', content: '状态差异：轻微擦伤但用户明确保留。' }) },
  ];
  assert.deepEqual(normalizeArtAssets(existing).map((asset) => asset.id), ['base', 'keep-image', 'manual']);
});

test('真实旧清单的简短手机描述也迁到道具，不依赖模型给它添人物五官',()=>{
 const asset={id:'phone-original',category:'character',name:'【苏橙橙手机】',description:'黑色直板智能手机，用于拼单外卖界面。配饰随身物属性，非人物资产。',first_episode:2,episodes:[2,6],images:[]};
 const original=structuredClone(asset);
 const normalized=normalizeArtAssets([asset]);
 assert.equal(normalized[0].category,'prop');
 assert.deepEqual(normalized[0],{...original,category:'prop'});
 assert.deepEqual(asset,original);
});

test('否定的严重伤情词不能让过场小角色轻擦伤膨胀为新造型',()=>{
 const rows=buildAssetRows(parseArtAnalysis(`### 第1集\n人物：\n- 【店员-制服】（实际出镜，首次）脸型：圆脸；发型：黑发；服装：蓝色制服。\n- 【店员-轻微擦伤】（换装；参考【店员-制服】）状态差异：手掌轻微擦伤。无明显伤口、无血污、未湿透。\n场景：\n- 无（本集未出现）\n道具：\n- 无（本集未出现）`));
 assert.deepEqual(rows.map(row=>row.name),['【店员-制服】']);
});

test('白日与日属于同一场景光线变化，不成为两个物理地点',()=>{
 const baseline={id:'desert',category:'scene',name:'【月银沙漠-日-外】',first_episode:1,description:'布局：旧沙丘；时间光线：日。',images:[{url:'reference.png'}]};
 const daylight={id:'daylight',category:'scene',name:'【月银沙漠-白日-外】',first_episode:2,description:'时间光线：白日自然光。',images:[]};
 const reference=resolveAssetReference(daylight,[baseline,daylight]);
 assert.equal(reference?.id,'desert');
 assert.match(buildImagePrompt(daylight,reference),/白日自然光/);
 assert.doesNotMatch(buildImagePrompt(daylight,reference),/旧沙丘/);
});
