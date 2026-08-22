-- 修正历史删除项目的 RECYCLE_UNTIL 时间戳为标准 ISO 格式
update collab_projects
set genre = btrim(
  regexp_replace(coalesce(genre,''), E'\n?\\[RECYCLE_UNTIL:[^]]+\\]', '', 'g')
  || E'\n[RECYCLE_UNTIL:'
  || to_char(purge_after at time zone 'UTC', 'YYYY-MM-DD') || 'T'
  || to_char(purge_after at time zone 'UTC', 'HH24:MI:SS.MS') || 'Z]'
)
where purge_after is not null and purge_after > now();
select name, left(genre, 80) as genre from collab_projects where purge_after is not null;
