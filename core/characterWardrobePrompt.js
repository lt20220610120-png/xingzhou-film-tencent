// Older cards mix makeup, skin, hair and accessories in a single field.
// Filter individual clauses so a makeup note cannot take an adjacent garment with it.
const SKIN = /肤色|肤质|肤白|白皙|皮肤|肌肤|肤感|肤面|毛孔|晒斑|雀斑|雀点|祛斑|痘印|脸部绒毛|面部细碎绒毛|原生的珠光光泽|美颜|磨皮|美白|痣|脸[颊部]?色|面色|气色|惨白|泛红|苍白|\b(?:skin|complexion|freckles?|pores?)\b/i;
const MAKEUP = /唇形|[红粉裸朱绛薄厚]唇|唇[色妆彩釉膏]|润唇|口红|妆容|妆面|妆感|化妆|淡妆|浓妆|素颜|裸妆|底妆|眼妆|唇妆|卸妆|补妆|烟熏妆|晚宴妆|职业妆|日常妆|妆效|粉底|遮瑕|修容|腮红|眼影|眼线|睫毛|眉笔|眉粉|高光提亮|\b(?:make[ -]?up|lipstick|blush|foundation|eyeliner|eye[ -]?shadow|mascara)\b/i;
const IDENTITY = /脸(?:上|型|形|部|比|变|更)|圆脸|方脸|长脸|鹅蛋脸|五官|骨相|面容|眉形|眉型|眉毛|眉眼|鼻梁|鼻型|鼻翼|瞳孔|眼睛|眼形|眼型|[单双]眼皮|嘴角|头(?:部)?(?:缩小|放大|变[大小])|头身比|身材|身形|体型|胡须|鬓须|发色|染发|\b(?:face shape|facial features|hair colou?r)\b/i;
const SURFACE_STATE = /伤痕|疤痕|划痕|擦伤|淤青|瘀青|红肿|伤口|纹身/;
const HAIR = /发型|发式|发髻|马尾|盘发|束发|辫|刘海|分缝|挽发|披发|扎发|编发|头发/;
const ACCESSORY = /发饰|发夹|发簪|发箍|发带|发绳|蝴蝶结|耳钉|耳坠|耳环|耳饰|项链|吊坠|颈链|手链|手串|手镯|手环|红绳|戒指|腕表|首饰|配饰|饰品|眼镜|帽|头纱|腰带|丝巾|纱布|绷带|胶带|敷贴/;
const CLOTHING = /服装|服饰|礼服|西装|套装|制服|校服|婚纱|家居服|病号服|衣|裙|裤|鞋|袜|靴|袍|披肩|衫|袖|战损|破洞|血污|湿透|\b(?:clothes|dress|suit|shirt|shoes?|jewelry)\b/i;
const LAYOUT = /构图|背景|半身|全身|光线|取景/;
const MAKEUP_FIELD = /^(?:妆造与固定配饰|妆造(?:差异)?|妆发(?:差异)?)[：:]\s*/;
const APPEARANCE_FIELD = /^(?:身份与依据|资产身份|身高|年龄|脸型骨相(?:与五官)?|脸型(?:与)?五官|脸型|五官(?:外貌)?|面部|外貌|眉眼|鼻唇(?:与耳部)?|鼻型|鼻梁|唇形|肤色(?:肤质)?|肤质(?:与辨识点)?|皮肤(?:状态)?|发型与发饰|发型(?:发色)?|发色|身形(?:与肤质|比例)?|身材(?:比例|体态)?|稳定气质|化妆|妆容(?:差异)?|妆面(?:差异)?|底妆|唇色|眼妆)[：:]\s*/;
const SURFACE_FIELD = /^(?:伤情|伤口)[：:]/;
const UNCHANGED_HAIR_FIELD = /^(?:发型(?:与发饰|发色)?|发色)[：:]/;
const PLACEMENT_NOTE = /^此(?:造型|套装)用于\d/;
const GARMENT_COLOR = /肤色(?=(?:的)?(?:丝袜|连裤袜|短袜|打底裤|打底衫|衣|裙|裤|鞋|皮鞋|高跟鞋))/g;
const CLAUSE_BOUNDARY = /([。！？；;\n]+)/;
export const CHARACTER_REFERENCE_LEAD = /^\s*参考\s*【[^】]+】\s*[；;，,。]?\s*/;

function filterClause(clause, { keepSurfaceState, prefix }) {
  const text = clause.trim();
  if (!text || (!prefix && PLACEMENT_NOTE.test(text))) return '';
  const inheritedField = text.match(MAKEUP_FIELD) || text.match(APPEARANCE_FIELD)
    || (!keepSurfaceState && text.match(SURFACE_FIELD));
  const body = inheritedField ? text.slice(inheritedField[0].length) : text;
  const isWardrobe = piece => ACCESSORY.test(piece) || CLOTHING.test(piece)
    || (!UNCHANGED_HAIR_FIELD.test(text) && HAIR.test(piece)) || (prefix && LAYOUT.test(piece));
  const identifiesAppearance = piece => {
    // Layouts may require the same face and proportions across panels.
    const value = (prefix ? piece.replace(/(?:身材比例|面部特征)(?:完全)?(?:统一|一致)/g, '') : piece).replace(GARMENT_COLOR, '');
    return SKIN.test(value) || MAKEUP.test(value) || IDENTITY.test(value) || (!keepSurfaceState && !prefix && SURFACE_STATE.test(value));
  };
  const clean = body.replace(/[（(]([^()（）]*)[）)]/g, (part, inside) => identifiesAppearance(inside) ? '' : part);
  const allowed = clean.split(/([，,、])/).reduce((result, piece, index, pieces) => {
    if (index % 2 || !piece.trim()) return result;
    let value = piece.trim();
    if (identifiesAppearance(value)) {
      value = value.split(/(?:并且?|同时|以及|搭配|与|和)/)
        .filter(part => !identifiesAppearance(part) && isWardrobe(part))
        .join('、');
    }
    if (value && (!inheritedField || isWardrobe(value))) {
      result.push({ value, delimiter: pieces[index + 1] || '，' });
    }
    return result;
  }, []);
  return allowed.map(({ value, delimiter }, index) => value + (index < allowed.length - 1 ? delimiter : '')).join('');
}

export function filterReferencedWardrobe(value, { keepSurfaceState = false, prefix = false } = {}) {
  const text = String(value || '').trim();
  const reference = prefix ? '' : text.match(CHARACTER_REFERENCE_LEAD)?.[0];
  const parts = (reference ? text.slice(reference.length) : text).split(CLAUSE_BOUNDARY);
  const content = parts.map((part, index) => {
    if (index % 2) return '';
    const allowed = filterClause(part, { keepSurfaceState, prefix });
    return allowed ? allowed + (parts[index + 1] || '') : '';
  }).join('').trim();
  return reference ? [`参考${reference.match(/【[^】]+】/)[0]}`, content].filter(Boolean).join('；') : content;
}

// The clean editor projection hides old injury notes. Retain those facts in the
// asset record when someone edits its clothing, without sending them to the model.
export function retainCostumeContinuity(content, previous) {
  const retained = filterReferencedWardrobe(previous, { keepSurfaceState: true }).replace(CHARACTER_REFERENCE_LEAD, '').split(CLAUSE_BOUNDARY)
    .flatMap(part => part.split(/[，,、]/))
    .filter(part => SURFACE_STATE.test(part) && !content.includes(part));
  return [content, ...new Set(retained)].filter(Boolean).join('\n');
}
