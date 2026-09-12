// Git Data API fallback for environments whose Git distribution omits HTTPS helpers.
// Publishes only the current clean, single-parent commit as a fast-forward to main.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const repo = 'lt20220610120-png/xingzhou-film-tencent';
const publish = process.argv.includes('--publish');
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr.toString()}`);
  return result.stdout;
}
const git = (...args) => run('git', args).toString('utf8').trim();
function api(endpoint, payload, method = 'POST') {
  const args = ['api', `repos/${repo}/${endpoint}`];
  const file = path.join(root, 'qa', 'github-commit-payload.json');
  if (payload) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(payload));
    args.push('-X', method, '--input', file);
  }
  return JSON.parse(run('gh', args).toString('utf8'));
}
function identity(line) {
  const match = line.match(/^(.+) <([^>]+)> (\d+) \+0000$/);
  if (!match) throw new Error('Use UTC author and committer dates so the remote commit can be verified byte for byte');
  return { name: match[1], email: match[2], date: new Date(Number(match[3]) * 1000).toISOString() };
}
try {
  if (git('status', '--porcelain')) throw new Error('Commit reviewed changes first; working tree must be clean');
  const sha = git('rev-parse', 'HEAD');
  const raw = run('git', ['cat-file', 'commit', sha]).toString('utf8');
  const split = raw.indexOf('\n\n');
  const headers = raw.slice(0, split).split('\n');
  if (headers.some(line => line.startsWith('gpgsig '))) throw new Error('This fallback does not republish signed commits');
  const parents = headers.filter(line => line.startsWith('parent ')).map(line => line.slice(7));
  if (parents.length !== 1) throw new Error('Only a single-parent fast-forward commit is supported');
  const remote = api('git/ref/heads/main').object.sha;
  if (remote === sha) { console.log(`Already published ${sha}`); process.exit(0); }
  if (remote !== parents[0]) throw new Error(`Main advanced: expected ${parents[0]}, found ${remote}. Reconcile before publishing.`);
  const base = api(`git/commits/${remote}`).tree.sha;
  const treeSha = headers.find(line => line.startsWith('tree ')).slice(5);
  const paths = run('git', ['diff', '--name-only', '-z', remote, sha]).toString('utf8').split('\0').filter(Boolean);
  const entries = paths.map(file => {
    const item = git('ls-tree', sha, '--', file).match(/^(\d+) blob ([a-f0-9]+)\t/);
    if (!item) return { path: file, mode: '100644', type: 'blob', sha: null };
    const bytes = run('git', ['cat-file', 'blob', item[2]]);
    const content = bytes.toString('utf8');
    if (!Buffer.from(content, 'utf8').equals(bytes)) throw new Error(`Binary change requires a normal Git push: ${file}`);
    return { path: file, mode: item[1], type: 'blob', content };
  });
  console.log(JSON.stringify({ repo, branch: 'main', sha, parent: remote, files: paths, publish }, null, 2));
  if (!publish) process.exit(0);
  const tree = api('git/trees', { base_tree: base, tree: entries });
  if (tree.sha !== treeSha) throw new Error(`Remote tree mismatch: ${tree.sha} != ${treeSha}`);
  const commit = api('git/commits', {
    message: raw.slice(split + 2), tree: tree.sha, parents,
    author: identity(headers.find(line => line.startsWith('author ')).slice(7)),
    committer: identity(headers.find(line => line.startsWith('committer ')).slice(10)),
  });
  if (commit.sha !== sha) throw new Error(`Remote commit mismatch: ${commit.sha} != ${sha}; main was not changed`);
  api('git/refs/heads/main', { sha, force: false }, 'PATCH');
  if (api('git/ref/heads/main').object.sha !== sha) throw new Error('Main verification failed');
  console.log(`PUBLISHED_COMMIT ${sha}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
