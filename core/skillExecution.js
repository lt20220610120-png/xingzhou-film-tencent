import { buildSkillMessages } from './skillContext.js';

const activeApiProfile = (state) => state?.apiProfiles?.find((profile) => profile.id === state.activeApiId)
  || state?.apiProfiles?.[0];

export const assertMessageCapacity = (messages, profile = {}, requestOptions = {}) => {
  const contextLimit = Number(profile.contextWindowTokens || profile.contextWindow || profile.maxContextTokens);
  if (!(contextLimit > 0)) return;
  // A conservative estimate is only used for an explicitly declared budget. Never trim source or Skill files.
  const estimatedInputTokens = messages.reduce((sum, message) => sum + Math.ceil(new TextEncoder().encode(String(message.content || '')).length / 3) + 8, 0);
  const requestedOutput = Number(requestOptions.maxOutputTokens) || 0;
  if (estimatedInputTokens + requestedOutput > contextLimit) throw new Error(`完整 Skill、场景和输出额度超过当前模型声明的上下文容量（约 ${estimatedInputTokens + requestedOutput} / ${contextLimit} token）。请使用更大上下文的模型；原文和 Skill 未被截短。`);
};

const allowedRequestOptions = requestOptions => {
  const result = {};
  for (const key of ['taskId', 'maxOutputTokens', 'resultEnvelope', 'timeout', 'analysisMode']) {
    const value = requestOptions?.[key];
    if (value === undefined) continue;
    if (key === 'taskId' && (typeof value !== 'string' || !value.trim())) throw new Error('模型任务 taskId 必须是非空文本');
    if (key === 'resultEnvelope' && typeof value !== 'boolean') throw new Error('resultEnvelope 必须是布尔值');
    if (key === 'analysisMode' && typeof value !== 'boolean') throw new Error('analysisMode 必须是布尔值');
    if (['maxOutputTokens', 'timeout'].includes(key) && (!Number.isInteger(value) || value <= 0)) throw new Error(`${key} 必须是正整数`);
    result[key] = value;
  }
  return result;
};

export const createSkillExecution = async ({
  api, state, skillId, input, assistantRole,
  beforeUserMessages = [], afterUserMessages = [], profile: profileOverride, requestOptions = {},
}) => {
  const skill = state?.skills?.find((item) => item.id === skillId);
  if (!skill) throw new Error('所选 Skill 不存在，请重新选择');
  if (skill.importMethod === 'skill-folder' && !String(skill.content || '').trim()) {
    throw new Error('所选完整 Skill 的 SKILL.md 内容为空，请重新导入完整 Skill 目录');
  }
  const profile = profileOverride || activeApiProfile(state);
  if (!profile) throw new Error('请先在“API 接口”中添加并启用一个模型');
  if (typeof api?.aiChat !== 'function') throw new Error('当前环境无法连接 API 接口');
  const baseMessages = buildSkillMessages(skill, input, assistantRole);
  const userMessage = baseMessages.at(-1);
  const messages = [
    ...baseMessages.slice(0, -1),
    ...beforeUserMessages,
    userMessage,
    ...afterUserMessages,
  ];
  const options = allowedRequestOptions(requestOptions);
  assertMessageCapacity(messages, profile, options);
  const response = await api.aiChat({
    profileId:profile.id,protocol: profile.protocol, provider: profile.provider, endpoint: profile.endpoint,
    model: profile.model,
    reasoningEffort: profile.reasoningEffort,
    apiKey: profile.apiKey,
    requiresApiKey: profile.requiresApiKey,
    messages,
    ...options,
  });
  if (response && typeof response === 'object' && response.ok === false) throw Object.assign(new Error(String(response.error || '模型请求失败')), { partialText: String(response.partialText || '') });
  const output = response && typeof response === 'object' && response.ok === true ? response.output : response;
  if (output !== null && output !== undefined && typeof output !== 'string') throw Object.assign(new Error('模型返回格式异常，未收到完整正文'), { partialText: String(response?.partialText || '') });
  return {
    output: String(output ?? ''),
    meta: {
      skillId,
      skillName: skill.name,
      model: profile.model,
      totalSkillFiles: 1 + (skill.files?.length || 0),
    },
  };
};

export const executeSkillWithAi = createSkillExecution;
