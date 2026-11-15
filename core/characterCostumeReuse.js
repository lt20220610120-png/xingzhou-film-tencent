// Collapse only proven same-outfit action states. Unknown looks and actual
// wardrobe/age/species/injury changes remain independent; there is no quota.
const clean = name => String(name || '').replace(/^【|】$/g, '').trim();
const significant = /受伤|战损|破烂|撕裂|撕破|撕开|破洞|血污|血迹|血痕|出血|擦伤|划伤|淤青|瘀青|红肿|肿胀|拳伤|血泪|包扎|绷带|骨折|脱臼|烧伤|刀伤|枪伤|伤口|冻疮|冻伤|溃烂|毁容|断肢|截肢|疤痕|伤疤|兽化|变身|变形|衰老/;
const identityChange = /幼年|童年|少年|青年|成年|中年|老年|年老|衰老|兽化|人形|兽形|变身|变形|魔化|觉醒|灵体|魂体|尸体|变装|换装/;
const transient = /疲惫|疲倦|疲劳|劳累|累了|困倦|守夜|惊醒|踹门|掀桌|背母|拆箱|会谈|应战|家宴|请缨|对峙|献花|抱婴|持奶瓶|湿透|淋雨|奔跑|哭泣|愤怒|争吵|等候|赶路|惊恐|门口闯入/;
const wardrobe = /围裙|睡衣|病号服|礼服|婚纱|制服|校服|家居服|暖绒服|常服|便服|西装|西服|外套|风衣|大衣|夹克|棉服|毛衣|衬衫|裙|袍|汉服|古装|警服|军装|工作服|运动服|长衫|旗袍|套装|伪装|背心/;
const positiveState = value => String(value || '')
  .replace(/(?:无|没有|未见|未|不见)(?:新增|明显|任何)?(?:受伤|伤口|血污|血迹|撕裂|破洞|烧伤|大量出血)/g, '');
const protectedAsset = asset => asset.manual || asset.reviewedCategory || asset.image_url
  || asset.images?.some(image => image.url) || asset.description?.startsWith('【生图前置 ·');

export function transientCostumeReference(asset, available) {
  if (asset.category !== 'character') return null;
  const name = clean(asset.name), description = String(asset.description || '');
  // Prefer the nearest named outfit, never a same-actor guess. A reference to
  // the actor's face alone does not prove that two differently named outfits match.
  const candidates = available.filter(other => other.category === 'character' && other.name !== asset.name)
    .filter(other => name.startsWith(clean(other.name) + '·') || name.startsWith(clean(other.name) + '-')
      || (description.includes(`参考${other.name}`) && /本集不另立造型|同装/.test(name)
        && name.startsWith(clean(other.name).split('-')[0] + '（')))
    .sort((a, b) => clean(b.name).length - clean(a.name).length);
  for (const target of candidates) {
    const suffix = name.startsWith(clean(target.name)) ? name.slice(clean(target.name).length).replace(/^[·-]/, '') : name;
    const namedState=transient.test(suffix);
    if (!namedState || identityChange.test(suffix) || wardrobe.test(suffix) || significant.test(positiveState(suffix))) continue;
    if (significant.test(positiveState(description))) continue;
    // Explicit newly designed clothing wins over an action label. Ordinary
    // wrinkles, loosened buttons and sweat are not a new costume.
    if (/(?:换上|换成|改穿|新换|新增服装|服装差异[：:])/.test(description)) continue;
    return target;
  }
  return null;
}

export function reuseCharacterCostumes(rows, { available = [], preserve = protectedAsset } = {}) {
  const pool = [...rows, ...available], aliases = new Map(), targets = new Map(), result = new Map();
  for (const row of rows) {
    let target = row;
    const visited = new Set([row.name]);
    while (!preserve(row) && !available.some(existing => existing.category === row.category
      && existing.name === row.name && preserve(existing))) {
      const next = transientCostumeReference(target, pool);
      if (!next || visited.has(next.name)) break;
      visited.add(next.name); target = next;
    }
    if (target !== row) { aliases.set(row.name, target.name); targets.set(row, target); }
  }
  if (!aliases.size) return { assets: rows, aliases };
  for (const row of rows) {
    const target = targets.get(row) || row;
    const key = `${target.category}\0${target.name}`, old = result.get(key);
    const next = old || { ...target };
    if (row.episodes || next.episodes) next.episodes = [...new Set([...(next.episodes || []), ...(row.episodes || [])])].sort((a, b) => a - b);
    if (row.sceneIds) next.sceneIds = [...new Set([...(next.sceneIds || []), ...row.sceneIds])];
    if (target !== row) next.nameAliases = [...new Set([...(next.nameAliases || []), row.name, ...(row.nameAliases || [])])];
    result.set(key, next);
  }
  return { assets: [...result.values()], aliases };
}
