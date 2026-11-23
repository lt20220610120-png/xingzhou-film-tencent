const image = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%222%22 height=%222%22%3E%3C/svg%3E';
const oneScene = (episode, scene) => Array.from({length:4}, (_, index) => {
  const label = [episode, scene, index + 1].join('-');
  const references = Array.from({length:8}, (_, i) => ({id:label+'-ref-'+i, name:'隔离图片'+i, kind:'image', url:image+'#'+i}));
  return {id:'scroll-'+label, label, content:label+'\n'+('隔离提示词 @image1 @image2。\n').repeat(50), generationConfig:{references}};
});
export const episodes = [1,2].map(episode => {
  const content = [1,2].map(scene => episode+'-'+scene+' 客厅 日 内\n'+('角色：隔离剧本正文。\n').repeat(80)).join('\n');
  return {id:'scroll-ep-'+episode, title:'第'+episode+'集', number:episode, episodeNumber:episode, content, storyboardPrompts:[...oneScene(episode,1),...oneScene(episode,2)]};
});
export const media = [{id:'scene-upload', episode:1, scene:'1-1', kind:'image', filename:'隔离上传', url:image+'#upload'}];
