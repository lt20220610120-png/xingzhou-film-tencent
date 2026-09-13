const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const mediaFilters = {
  image: { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
  audio: { name: '音频文件', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg'] },
  video: { name: '视频文件', extensions: ['mp4', 'mov', 'webm'] },
};

async function importMediaFiles({ dialog, destDir, kind = 'image', multiple = false }) {
  const filter = mediaFilters[kind];
  if (!filter) throw new Error('不支持的素材类型');
  const result = await dialog.showOpenDialog({
    title: `导入${filter.name.slice(0, 2)}${multiple ? '（可多选）' : ''}`,
    properties: ['openFile', ...(multiple ? ['multiSelections'] : [])],
    filters: [filter],
  });
  if (result.canceled || !result.filePaths?.length) return [];
  const sources = multiple ? result.filePaths : result.filePaths.slice(0, 1);
  // Validate the whole selection before making copies or changing the editor.
  for (const source of sources) {
    if (!filter.extensions.includes(path.extname(source).slice(1).toLowerCase()) || !fs.statSync(source).isFile()) {
      throw new Error(`无法导入${filter.name.slice(0, 2)}：${path.basename(source)}`);
    }
  }
  fs.mkdirSync(destDir, { recursive: true });
  return sources.map(source => {
    const name = path.basename(source);
    const filePath = path.join(destDir, `${randomUUID()}_${name}`);
    fs.copyFileSync(source, filePath);
    return { filePath, name, kind };
  });
}

module.exports = { importMediaFiles };
