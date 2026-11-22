const MEDIA_KINDS = ['image','audio','video','doc','file'];
const SHARE_ROLES = ['producer','artist','collaborator','artist_collaborator'];
const ART_ROLES = ['producer','artist','artist_collaborator'];
const REFERENCE_ROLES = ['producer','collaborator','artist_collaborator'];

const denied = {status:403,body:{error:'你没有这个项目的操作权限'}};

function projectWriteError(project) {
  const genre = String(project?.genre || '');
  if (!project || genre.includes('[DIRECTOR_PROJECT]') || genre.includes('[LOCAL_SHARE_PENDING:')) return denied;
  if (project.deleted_at || genre.includes('[RECYCLE_UNTIL:')) return {status:410,body:{error:'项目已删除，请先恢复'}};
  if (genre.includes('[PROJECT_LOCKED]')) return {status:423,body:{error:'项目已锁定，暂不可编辑'}};
  return null;
}

function validProjectObject(key, projectId, allowed = MEDIA_KINDS) {
  if (typeof key !== 'string' || key.length > 512) return false;
  const match = /^projects\/([\w-]+)\/([a-z]+)\/([\w.-]+\.[a-z0-9]+)$/i.exec(key);
  return Boolean(match && match[1] === projectId && allowed.includes(match[2]) && !match[3].startsWith('.'));
}

function assetImageObject(key, projectId) {
  return validProjectObject(key,projectId,['image']) && /\.(?:png|jpe?g|webp|gif)$/i.test(key);
}

function objectFromLink(value, signer) {
  if (typeof value !== 'string') return '';
  if (!/^https?:/i.test(value)) return value;
  try {
    const url = new URL(value);
    if (!signer?.host || url.origin !== 'https://'+signer.host || url.username || url.password || url.hash) return '';
    return url.pathname.slice(1);
  } catch {
    return '';
  }
}

async function lockWritableMediaProject(client, pid, uid, roles, full = false) {
  const fields = full ? 'p.*' : 'p.id,p.owner_id,p.genre,p.deleted_at';
  const project = (await client.query('select '+fields+' from collab_projects p where p.id=$1 for update',[pid])).rows[0];
  if (projectWriteError(project)) return null;
  if (project.owner_id === uid) return project;
  const member = (await client.query('select 1 as ok from collab_members where project_id=$1 and user_id=$2 and role=any($3::text[]) for share',[pid,uid,roles])).rows[0];
  return member ? project : null;
}

module.exports = {MEDIA_KINDS,SHARE_ROLES,ART_ROLES,REFERENCE_ROLES,denied,projectWriteError,validProjectObject,assetImageObject,objectFromLink,lockWritableMediaProject};
