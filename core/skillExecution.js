import { buildSkillMessages } from './skillContext.js';

const activeApiProfile = (state) => state?.apiProfiles?.find((profile) => profile.id === state.activeApiId)
  || state?.apiProfiles?.[0];

export const createSkillExecution = async ({
  api, state, skillId, input, assistantRole,
  beforeUserMessages = [], afterUserMessages = [], profile: profileOverride,
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
  const output = await api.aiChat({
    endpoint: profile.endpoint,
    model: profile.model,
    apiKey: profile.apiKey,
    requiresApiKey: profile.requiresApiKey,
    messages,
  });
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
