export const referenceName = name => String(name || '').replace(/^[【\[]|[】\]]$/g, '');
export function numberedReferences(references) {
  const counts = {};
  return references.map(r => ({ ...r, alias: `@${r.kind}${counts[r.kind] = (counts[r.kind] || 0) + 1}` }));
}
export function bindReferencePrompt(prompt, references) {
  let result = String(prompt || '');
  const numbered = numberedReferences(references);
  const names = [...new Set(numbered.map(r => referenceName(r.name)).filter(Boolean))].sort((a,b) => b.length-a.length);
  for (const name of names) {
    const matches=numbered.filter(r=>referenceName(r.name)===name);
    if (matches.length !== 1) {
      if (result.includes(`@${name}`) || result.includes(`@【${name}】`)) throw new Error(`“${name}”有多张参考图，请选择一张或改用素材编号`);
      continue;
    }
    result=result.split(`@【${name}】`).join(matches[0].alias).split(`@[${name}]`).join(matches[0].alias);
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    result=result.replace(new RegExp(`@${escaped}(?![\\w\\u4e00-\\u9fff])`,'g'),matches[0].alias);
  }
  return result;
}
export function autoReferences(prompt, assets) {
  return assets.filter(a => {
    const name=referenceName(a.name);
    return name && (prompt.includes(`@${name}`)||prompt.includes(`@【${name}】`));
  }).flatMap(a => {
    const image=(a.images || []).find(i=>i.url) || (/^https?:/.test(a.image_url || '') ? {url:a.image_url,id:a.id} : null);
    return image ? [{id:image.id || a.id,assetId:a.id,name:a.name,kind:'image',url:image.url}] : [];
  });
}
export const mediaSource = item => item.filePath ? `xzmedia://${encodeURIComponent(item.filePath).replace(/%5C/g,'/').replace(/%3A/g,':')}` : item.url || '';
