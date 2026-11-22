import {isProtectedSkill} from './clientDistribution.js';

export function newDirectorSkillBinding(skills = []) {
  const hasText = value => typeof value === 'string' && value.trim().length > 0;
  const available = skills.filter(skill => skill?.id && (isProtectedSkill(skill) || hasText(skill.content) || Array.isArray(skill.files) && skill.files.some(file => hasText(file?.content))));
  const custom = available.findLast(skill => skill.type !== 'builtin' && !isProtectedSkill(skill));
  const skill = custom || available.at(-1);
  return skill ? {lastUsedSkillId: skill.id, lastUsedSkill: skill.name} : {};
}
