export const VIDEO_DURATION_ESTIMATOR_VERSION = '3.0.0';
const supportedEstimateVersions = new Set(['2.0.0', VIDEO_DURATION_ESTIMATOR_VERSION]);
export const RESEGMENT_DURATION_REASON = '需重新划分片段并重新生成提示词';
export const validVideoDurationLimit = value => value === 15 || value === 30;

export function normalizeVideoDurationLimit(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 && seconds <= 15 ? 15 : 30;
}

export function durationCapacity(naturalSeconds, limit) {
  if (naturalSeconds <= limit) return {capacityStatus:'正常',recommendedSeconds:naturalSeconds,needsResegment:false};
  if (naturalSeconds <= (limit===15?18:35)) return {capacityStatus:'略偏紧',recommendedSeconds:limit,needsResegment:false};
  return {capacityStatus:'超载需重分',recommendedSeconds:naturalSeconds,needsResegment:true};
}

const durationCents = value => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 86400) return null;
  const cents = Math.round(value * 100);
  return cents / 100 === value ? cents : null;
};
const singleLine = (value, max) => typeof value === 'string' && value.length <= max && value.trim() && !/[\r\n]/.test(value);

export function pendingDurationEstimate(maxDurationSeconds, code, message) {
  return {version:VIDEO_DURATION_ESTIMATOR_VERSION,status:'pending',maxDurationSeconds,error:{code,message}};
}

export function validatedDurationEstimate(value) {
  if (!value || !supportedEstimateVersions.has(value.version) || !validVideoDurationLimit(value.maxDurationSeconds)
    || !['pending','needs-review','estimated'].includes(value.status)) return null;
  const base={version:value.version,status:value.status,maxDurationSeconds:value.maxDurationSeconds};
  if (value.status === 'pending' || (value.status === 'needs-review' && value.naturalSeconds === undefined)) {
    return singleLine(value.error?.code,64) && singleLine(value.error?.message,600)
      ? {...base,error:{code:value.error.code,message:value.error.message}} : value.status==='needs-review'?base:null;
  }
  const {naturalSeconds,breakdown,reason}=value;
  if (!Number.isInteger(naturalSeconds) || naturalSeconds < 2 || naturalSeconds > 86400 || !singleLine(reason,1200)) return null;
  const speech=durationCents(breakdown?.speechSeconds),action=durationCents(breakdown?.nonparallelActionSeconds),buffer=durationCents(breakdown?.pauseBufferSeconds);
  if (speech===null || action===null || buffer===null || buffer<50 || (speech>0 && naturalSeconds<4)
    || Math.ceil((speech+action+buffer)/100)!==naturalSeconds) return null;
  const capacity=durationCapacity(naturalSeconds,value.maxDurationSeconds);
  if (Object.entries(capacity).some(([key,expected])=>value[key]!==expected)
    || (capacity.needsResegment&&!reason.includes(RESEGMENT_DURATION_REASON))) return null;
  return {...base,naturalSeconds,...capacity,breakdown:{speechSeconds:breakdown.speechSeconds,
    nonparallelActionSeconds:breakdown.nonparallelActionSeconds,pauseBufferSeconds:breakdown.pauseBufferSeconds},reason};
}

export function savedDurationEstimate(value) {
  if (!value || !Object.hasOwn(value,'durationEstimate')) return null;
  return validatedDurationEstimate(value.durationEstimate) || pendingDurationEstimate(
    normalizeVideoDurationLimit(value.durationEstimate?.maxDurationSeconds??value.maxDurationSeconds),
    'INVALID_SAVED_ESTIMATE','已保存的估时资料不完整，请重新估时。');
}

export function durationEstimateIssue(value) {
  const estimate=savedDurationEstimate(value);
  if (!estimate) return '';
  if (estimate.status==='pending') return estimate.error?.message || '待估时';
  if (estimate.status==='needs-review') return '提示词已修改，待复核时长';
  return estimate.needsResegment ? `超载需重分 · 自然 ${estimate.naturalSeconds} 秒` : '';
}
