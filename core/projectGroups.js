export const normalizeProjectGroupName = (value) => {
  const name = String(value ?? '').trim();
  if (!name) throw new Error('分组名称不能为空');
  return name;
};

export const defaultProjectGroupName = (groups = []) => {
  const names = new Set(groups.map((group) => group.name));
  let index = 1;
  while (names.has(`分组 ${index}`)) index += 1;
  return `分组 ${index}`;
};
