const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runCodexText, buildCodexArgs, formatCodexMessages } = require('./codex-local.cjs');

test('Codex 文本任务使用只读隔离目录与所选模型、推理档位', () => {
  const args = buildCodexArgs({ model: 'gpt-6-sol', reasoningEffort: 'high' }, 'C:/tmp/result.txt', 'C:/tmp/work');
  assert.deepEqual(args.slice(0, 2), ['exec', '-']);
  assert.ok(args.includes('gpt-6-sol'));
  assert.ok(args.includes('model_reasoning_effort="high"'));
  assert.ok(args.includes('read-only'));
  assert.ok(args.includes('--ephemeral'));
  assert.ok(args.includes('--ignore-user-config'));
  assert.ok(!args.includes('--dangerously-bypass-approvals-and-sandbox'));
  assert.throws(() => buildCodexArgs({ model: 'gpt-6-sol; rm -rf', reasoningEffort: 'high' }, 'x', 'y'), /模型/);
});

test('Codex 文本任务保留系统、用户及助手历史', () => {
  const prompt = formatCodexMessages([
    { role: 'system', content: '你是编剧助手' },
    { role: 'user', content: '第一问' },
    { role: 'assistant', content: '第一答' },
    { role: 'user', content: '继续' },
  ]);
  assert.match(prompt, /你是编剧助手/);
  assert.match(prompt, /第一问/);
  assert.match(prompt, /第一答/);
  assert.match(prompt, /继续/);
});

test('本机 Codex 仅接受 ChatGPT 登录并把生成正文返回软件', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-codex-test-'));
  const script = path.join(dir, 'fake-codex.cjs');
  fs.writeFileSync(script, `const fs=require('fs');const args=process.argv.slice(2);if(process.env.OPENAI_API_KEY)process.exit(7);if(args[0]==='login'){(process.env.FAKE_LOGIN_TO_STDERR?process.stderr:process.stdout).write(process.env.FAKE_LOGIN||'Logged in using ChatGPT');process.exit(0)}let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{if(!input.includes('剧本'))process.exit(3);fs.writeFileSync(args[args.indexOf('-o')+1],'处理完成','utf8');process.stdout.write(JSON.stringify({type:'turn.completed'})+'\\n')})`);
  const command = { executable: process.execPath, prefixArgs: [script] };
  try {
    const result = await runCodexText({ model: 'gpt-6-sol', reasoningEffort: 'medium', messages: [{ role: 'user', content: '分析剧本' }] }, { command });
    assert.equal(result, '处理完成');
    const stderrLogin = await runCodexText({ model: 'gpt-6-sol', messages: [{ role: 'user', content: '分析剧本' }] }, { command, env: { ...process.env, OPENAI_API_KEY: 'never-forward-to-codex', FAKE_LOGIN_TO_STDERR: '1' } });
    assert.equal(stderrLogin, '处理完成');
    await assert.rejects(runCodexText({ model: 'gpt-6-sol', messages: [{ role: 'user', content: '剧本' }] }, { command, env: { ...process.env, FAKE_LOGIN: 'Logged in using API key' } }), /ChatGPT.*登录/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('取消文本任务会停止本机 Codex 子进程', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-codex-cancel-test-'));
  const script = path.join(dir, 'slow-codex.cjs');
  fs.writeFileSync(script, `if(process.argv[2]==='login'){process.stderr.write('Logged in using ChatGPT');process.exit(0)}process.stdin.resume();setTimeout(()=>process.exit(0),30000)`);
  const controller = new AbortController();
  try {
    const started = Date.now();
    const request = runCodexText({ model: 'gpt-6-luna', messages: [{ role: 'user', content: '剧本' }] }, {
      command: { executable: process.execPath, prefixArgs: [script] }, signal: controller.signal,
      onProgress: status => { if (status.phase === 'waiting') setTimeout(() => controller.abort(), 50); },
    });
    await assert.rejects(request, { name: 'AbortError' });
    assert.ok(Date.now() - started < 3000);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
