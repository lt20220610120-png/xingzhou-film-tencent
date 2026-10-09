import{CHARACTER_PROMPT_PREFIXES,defaultAssetPromptPrefix,readAssetPrompt,serializeAssetPrompt,buildImagePrompt}from'./collabStore.js';

export const DEFAULT_CHARACTER_COMPOSITION='portrait-four';
export const CHARACTER_COMPOSITIONS={
 'portrait-four':{label:'四格 · 胸像＋全身三视图',prefix:'白色背景，4格统一排版，左侧1格为胸像大头特写，右侧3格为全身照三视图，所有画面中的主体完全一致，面部特征完全统一、发型完全同一、服装、完全统一，身材比例完全统一。'},
 'portrait-five':{label:'五格 · 三全身＋双脸颈（16:9）',prefix:'白色背景。画布结构：横向 16:9；左侧占画面 2/3，由三等分竖向全身面板组成；右侧占画面 1/3，由上下两等分脸颈面板组成；面板之间使用细冷灰分隔线。左侧第 1 格（正面全身）：无头正面躯干，从锁骨上方自然截断至鞋底。头部、下巴和脖子不得出现；截断处只保留完整衣领开口与背景。左侧第 2 格（90° 侧面全身）：无头严格 90 度左侧躯干，从锁骨上方自然截断至鞋底。头部、下巴和脖子不得出现。左侧第 3 格（背面全身）：严格背面全身，从完整头部、头发至鞋底；保留完整服装后背、下装与鞋。右侧上格（正脸特写）：正脸与脖子特写。右侧下格（45° 侧脸特写）：45 度左侧脸与脖子特写。所有面板保持同一人物、同一套服装、发型、面部特征和身材比例一致；截断处为服装展示裁切，不表现伤口、血液或断肢。'},
};
const bindingValues=new Set(['project','custom',...Object.keys(CHARACTER_COMPOSITIONS)]);
export const projectCharacterComposition=project=>Object.hasOwn(CHARACTER_COMPOSITIONS,project?.image_composition)?project.image_composition:DEFAULT_CHARACTER_COMPOSITION;
export function defaultComposedAssetPromptPrefix(asset,style,mode,composition=DEFAULT_CHARACTER_COMPOSITION){
 const prefix=defaultAssetPromptPrefix(asset,style,mode);
 if(mode!=='single')return prefix;
 const selected=CHARACTER_COMPOSITIONS[composition]||CHARACTER_COMPOSITIONS[DEFAULT_CHARACTER_COMPOSITION];
 return prefix.replace(CHARACTER_COMPOSITIONS['portrait-four'].prefix,selected.prefix);
}
function decodeAsset(asset){
 const raw=String(asset.description||'').replace(/\r\n/g,'\n');
 const match=raw.match(/^(【生图前置 · (?:单人多视图|多人群像|自由构图|场景|道具)】\n)【构图绑定 · (project|custom|portrait-four|portrait-five)】\n/);
 return match?{asset:{...asset,description:match[1]+raw.slice(match[0].length)},binding:match[2]}:{asset,binding:null};
}
export function readComposedAssetPrompt(asset,style,projectComposition=DEFAULT_CHARACTER_COMPOSITION){
 const decoded=decodeAsset(asset),settings=readAssetPrompt(decoded.asset,style);
 const factoryPrefix=settings.mode==='single'&&Object.values(CHARACTER_PROMPT_PREFIXES).includes(settings.prefix);
 const composition=decoded.binding||(!settings.customized||factoryPrefix?'project':'custom');
 const target=composition==='project'?projectComposition:composition;
 const prefix=composition==='custom'?settings.prefix:defaultComposedAssetPromptPrefix({...asset,description:settings.content},style,settings.mode,target);
 return{...settings,prefix,composition};
}
export function serializeComposedAssetPrompt({composition,...settings}){
 if(!bindingValues.has(composition))return serializeAssetPrompt(settings);
 return serializeAssetPrompt({...settings,prefix:`【构图绑定 · ${composition}】\n${settings.prefix||''}`});
}
export function buildComposedImagePrompt(asset,refAsset,style,projectComposition=DEFAULT_CHARACTER_COMPOSITION){
 const settings=readComposedAssetPrompt(asset,style,projectComposition);
 return buildImagePrompt(asset,refAsset,style,{prefix:settings.prefix});
}
