const test = require('node:test');
const assert = require('node:assert/strict');
const { analysisRepository } = require('../src/analysis-repository.cjs');

function legacyLocalPool({ cloudRecord = false } = {}) {
  let saved = {
    id: 'legacy-copy',
    owner_id: 'owner',
    genre: '修仙，古装，仙侠，热血',
    director_project_id: '1788850911791-rtie2nc',
    script: '第十九集\n19-1 山门 日 外',
    episodes: [{ id: 'e19', episodeNumber: 19, title: '第十九集', content: '19-1 山门 日 外' }],
  };
  const queries = [];
  const query = async (sql, values = []) => {
    queries.push({ sql, values });
    if (/^select p\.\* from collab_projects p where p\.id=\$1 for update/i.test(sql)) return { rows: [structuredClone(saved)] };
    // The legacy directorProjectId names a local workspace, not a cloud document.
    if (/where \(p\.id::text=\$1 or p\.analysis_output=\$1\)/i.test(sql)) return { rows: [] };
    if (/^select 1 as found from collab_projects/i.test(sql)) return { rows: cloudRecord ? [{ found: 1 }] : [] };
    if (/^update collab_projects set genre=\$2/i.test(sql)) {
      saved = { ...saved, genre: values[1] };
      return { rows: [] };
    }
    if (/^update collab_projects set script=\$2,episodes=\$3/i.test(sql)) {
      saved = { ...saved, script: values[1], episodes: JSON.parse(values[2]) };
      return { rows: [structuredClone(saved)] };
    }
    return { rows: [] };
  };
  return { connect: async () => ({ query, release() {} }), queries };
}

test('legacy local director IDs can append art episodes after safe collaboration promotion', async () => {
  const pool = legacyLocalPool();
  const saved = await analysisRepository(pool).appendArtEpisode('legacy-copy', {
    episodeNumber: 20,
    title: '第20集',
    content: '20-1 山门 日 外',
  }, 'owner');

  assert.ok(saved, 'legacy local-source projects must not be rejected as inaccessible cloud sources');
  assert.match(saved.genre, /\[COLLAB_PROJECT\]/);
  assert.equal(saved.episodes.length, 2);
  assert.equal(saved.episodes[1].episodeNumber, 20);
  assert.equal(pool.queries.at(-1).sql, 'COMMIT');
});

test('legacy local-shaped IDs stay protected when they resolve to an inaccessible cloud record', async () => {
  const pool = legacyLocalPool({ cloudRecord: true });
  const saved = await analysisRepository(pool).appendArtEpisode('legacy-copy', {
    episodeNumber: 20,
    title: '第20集',
    content: '20-1 山门 日 外',
  }, 'owner');

  assert.equal(saved, null);
  assert.equal(pool.queries.some(({ sql }) => /^update collab_projects set (genre|script)=/i.test(sql)), false);
  assert.equal(pool.queries.at(-1).sql, 'ROLLBACK');
});
