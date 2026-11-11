const {createLocalShareRepository}=require('../cloud-backend/src/local-project-share.cjs');
const target={id:'34ef24fd-89ca-4a74-b9c9-5f27580a20c3',username:'collaborator',display_name:'协作者',roles:['creator']};
function database(project = null, {rejectMedia = false} = {}) {
  let state = {project, assets: [], media: [], members: []};
  const writes = [];
  const client = {
    release() {},
    async query(sql, values = []) {
      const rows = result => ({rows: structuredClone(result)});
      if (/^begin/i.test(sql)) { this.before = structuredClone(state); return rows([]); }
      if (/^rollback$/i.test(sql)) {state = this.before; return rows([]);}
      if (/^commit$|^set local/i.test(sql)) return rows([]);
      if (/^select .* from app_users/.test(sql)) return rows(values[0] === target.username ? [target] : []);
      if(sql.startsWith('select p.* from collab_projects'))return rows([]);
      if(sql.startsWith('select 1 as found from collab_projects'))return rows([]);
      if (/^select .* from collab_projects/.test(sql)) return rows(state.project ? [state.project] : []);
      for (const [table, name] of [['collab_assets','assets'],['collab_media','media'],['collab_members','members']]) {
        if (sql.startsWith('select * from ' + table)) return rows(state[name]);
      }
      writes.push(sql);
      if(sql.startsWith('delete from collab_media')) {state.media=state.media.filter(row=>row.project_id!==values[0]||!values[1].includes(row.id));return rows([]);}
      if (sql.startsWith('insert into collab_projects')) {
        state.project = {id: values[0], name: values[1], owner_id: values[2], owner_name: values[3], genre: values[4], episodes: [], updated_at: new Date(0)};
        return rows([state.project]);
      }
      if (sql.startsWith('insert into collab_assets')) {
        const [id, project_id, category, name, description, first_episode, episodes, image_url] = values;
        const entry = {id,project_id,category,name,description,first_episode,episodes,image_url};
        state.assets = [...state.assets.filter(a => a.id !== id), entry];
        return rows([entry]);
      }
      if (sql.startsWith('insert into collab_media')) {
        if (rejectMedia) return rows([]);
        const [id, project_id, asset_id, episode, scene, kind, object_path, filename, mime, note, user_id, username] = values;
        const entry = {id,project_id,asset_id,episode,scene,kind,object_path,filename,mime,note,user_id,username};
        state.media = [...state.media.filter(m => m.id !== id), entry];
        return rows([entry]);
      }
      if (sql.startsWith('insert into collab_members')) {
        const [project_id,user_id,username,display_name,role] = values;
        const entry = {project_id,user_id,username,display_name,role};
        state.members.push(entry);
        return rows([entry]);
      }
      if (sql.startsWith('update collab_projects set name=')) {
        const [,name,style,genre,script,episodes,analysis_output,analysis_progress,image_composition,director_project_id] = values;
        Object.assign(state.project, {name,style,genre,script,episodes:JSON.parse(episodes),analysis_output,analysis_progress:JSON.parse(analysis_progress),image_composition,director_project_id,updated_at:new Date(1)});
        return rows([state.project]);
      }
      if (sql.startsWith('update collab_projects set genre=')) {
        state.project.genre = values[1];
        return rows([state.project]);
      }
      throw Error('unexpected SQL in fixture: ' + sql);
    },
  };
  return {repo:createLocalShareRepository({connect:async()=>client}), get state(){return state;}, writes};
}

module.exports={database,target};
