import { buildSkillMessages } from './skillContext.js';

const activeApiProfile = (state) => state?.apiProfiles?.find((profile) => profile.id === state.activeApiId)
  || state?.apiProfiles?.[0];

export const executeSkillWithAi = async ({ api, state, skillId, input, assistantRole }) => {
  const skill = state?.skills?.find((item) => item.id === skillId);
  if (!skill) throw new Error('所选 Skill 不存在，请重新选择');
  const profile = activeApiProfile(state);
  if (!profile) throw new Error('请先在“API 接口”中添加并启用一个模型');
  if (typeof api?.aiChat !== 'function') throw new Error('当前环境无法连接 API 接口');
  const output = await api.aiChat({
    endpoint: profile.endpoint,
    model: profile.model,
    apiKey: profile.apiKey,
    messages: buildSkillMessages(skill, input, assistantRole),
  });
  return {
    output: String(output ?? ''),
    meta: { skillId, model: profile.model },
  };
};
