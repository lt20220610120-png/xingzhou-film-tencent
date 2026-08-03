// ============================================================
// appServices.js — 版本比较与更新工具
// ============================================================

/**
 * compareVersions(a, b)
 * 比较两个语义化版本号。
 * 返回: 1 (a > b), -1 (a < b), 0 (相等)
 */
export const compareVersions = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
};

/**
 * resolveUpdateState(current, latest)
 * 判断当前更新状态
 * 返回: 'up-to-date' | 'update-available' | 'download-progress' | 'ready-to-install'
 */
export const resolveUpdateState = (current, latest, downloadPct = 0) => {
  if (!latest) return 'up-to-date';
  if (compareVersions(current, latest) >= 0) return 'up-to-date';
  if (downloadPct > 0 && downloadPct < 100) return 'download-progress';
  if (downloadPct >= 100) return 'ready-to-install';
  return 'update-available';
};

/** Validate and normalize an update response before rendering it. */
export const interpretUpdateResult = ({ manifest, currentVersion } = {}) => {
  if (!manifest?.version) throw new Error('更新清单缺少版本号');
  if (!manifest?.installerUrl) throw new Error('更新清单缺少安装包地址');
  const available = resolveUpdateState(currentVersion, manifest.version) === 'update-available';
  return {
    ...manifest,
    notes: manifest.notes || '',
    currentVersion,
    available,
    status: available ? `发现新版本 ${manifest.version}` : `当前已是最新版本：${currentVersion}`,
  };
};

/**
 * calculateDownloadProgress(downloaded, total)
 * 返回 0-100 整数百分比
 */
export const calculateDownloadProgress = (downloaded, total) => {
  if (!total || total <= 0) return 0;
  const pct = Math.round((downloaded / total) * 100);
  return Math.min(100, Math.max(0, pct));
};
