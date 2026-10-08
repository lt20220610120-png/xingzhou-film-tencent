import {DatabaseSync} from 'node:sqlite';
import {branchState} from './engine.js';
export class WorldStore{
 constructor(filename){this.db=new DatabaseSync(filename);this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS worlds (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS journal(id INTEGER PRIMARY KEY, world_id TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL);');}
 load(id){const row=this.db.prepare('SELECT revision,body FROM worlds WHERE id=?').get(id);return row?{revision:row.revision,world:JSON.parse(row.body)}:null;}
 save(world,expectedRevision){for(const b of world.branches)branchState(world,b.id);const body=JSON.stringify(world);this.db.exec('BEGIN IMMEDIATE');try{const row=this.load(world.id);if((row?.revision||0)!==expectedRevision)throw new Error('保存版本冲突，不能覆盖已有世界');const revision=expectedRevision+1;this.db.prepare('INSERT INTO worlds VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,body=excluded.body').run(world.id,revision,body);this.db.prepare('INSERT INTO journal(world_id,revision,body) VALUES(?,?,?)').run(world.id,revision,body);this.db.exec('COMMIT');return revision;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 close(){this.db.close();}
}
