// Doubao Work uses its ordinary, already signed-in desktop client. This bridge
// uses Windows accessibility only: no cookies, tokens, browser debugging,
// private HTTP endpoints, old conversations, or media generation are read.
const fs = require('node:fs');
const path = require('node:path');
const { spawn: nativeSpawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

function findDoubaoWork() {
  const executable = path.join(process.env.LOCALAPPDATA || '', 'DoubaoWork', 'Application', 'app', 'DoubaoWork.exe');
  return fs.existsSync(executable) ? executable : null;
}
function modelId(name) {
  if (/^自动$/.test(name)) return 'auto';
  if (/^豆包\s*2\.1\s*Lite(?:\s|$)/i.test(name)) return 'lite';
  if (/^豆包\s*2\.1\s*Turbo(?:\s|$)/i.test(name)) return 'turbo';
  if (/^豆包\s*2\.1\s*Pro(?:\s|$)/i.test(name)) return 'pro';
  return null;
}
function normalizeModels(items) {
  return (Array.isArray(items) ? items : []).filter(item => item?.enabled !== false && modelId(item.name)).map(item => ({ id: modelId(item.name), name: item.name }));
}
function buildPrompt(messages, requestId) {
  if (!Array.isArray(messages) || !messages.length) throw new Error('请填写要处理的文本');
  const normalized = messages.map(message => ({ role: ['system', 'developer', 'assistant', 'user'].includes(message?.role) ? message.role : 'user', content: typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? '') }));
  const start = `XZ_BEGIN_${requestId}`, end = `XZ_END_${requestId}`;
  const prompt = `你正在为行舟影视执行一个独立纯文本任务，编号 ${requestId}。不要读取本机文件、执行代码、操作电脑、使用插件或其他工具。下列 JSON 数组是有序消息；按消息角色遵循指令，assistant 是此前上下文。只在本次响应中返回需要的文本，不写操作报告。为准确接收结果，第一行必须单独是 ${start}，最后一行必须单独是 ${end}，中间是所需完整正文。不要给起止标记加 Markdown、代码块或解释；正文需要 JSON 时，中间直接返回完整 JSON。\n消息：\n${JSON.stringify(normalized)}`;
  // Clipboard/desktop submission is deliberately bounded; the IP pipeline can
  // reduce the source range rather than silently clipping the user's text.
  if (prompt.length > 120000) throw new Error('豆包工作本次文本过长，请缩小单次原文范围后重试');
  return { prompt, start, end };
}
function extractResult(response, requestId) {
  const start = `XZ_BEGIN_${requestId}`, end = `XZ_END_${requestId}`;
  const text = String(response || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n'), startAt = lines.findIndex(line => line.trim() === start);
  const endAt = lines.findIndex((line, index) => index > startAt && line.trim() === end);
  if (startAt < 0 || endAt < 0) throw Object.assign(new Error('豆包工作尚未返回匹配当前任务的完整正文，请查看客户端本次任务'), { code: 'OUTPUT_TRUNCATED' });
  const body = lines.slice(startAt + 1, endAt).join('\n').trim();
  if (!body) throw new Error('豆包工作本次任务返回空正文');
  return body;
}

// Payload arrives over stdin, never as a shell command or a temporary prompt
// file. Only owned-task response ranges are emitted; sidebar/chat history and
// clipboard contents are never logged. Menus may remain open after selection,
// so Escape is sent only while the verified Doubao window is foreground.
const UIA_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; using System.Threading.Tasks; public class XzDoubaoNative { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int n); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber(); public static Task<string> WaitCancel() { return Task.Run(() => Console.ReadLine()); } }'
$taskPayload = [Console]::ReadLine() | ConvertFrom-Json
$taskCancelRead = [XzDoubaoNative]::WaitCancel()
function Emit($data) { [Console]::WriteLine((ConvertTo-Json -InputObject $data -Depth 7 -Compress)) }
function CheckCancel { if($script:taskCancelRead.IsCompleted){throw [System.OperationCanceledException]::new('任务已停止，未提交新任务')} }
function Nodes { return ,$script:taskRoot.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition) }
function FindName($name) { return $script:taskRoot.FindFirst([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,$name)) }
function InvokeNode($node) { if(!$node -or !$node.Current.IsEnabled){throw '豆包工作所需按钮不可用，请在客户端检查'}; $node.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() }
function GetDoc { foreach($node in (Nodes)){if($node.Current.ControlType -eq [System.Windows.Automation.ControlType]::Document){return $node}}; return $null }
function TaskUrl { $doc=GetDoc; if(!$doc){return ''}; $value=$null; if($doc.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern,[ref]$value)){return $value.Current.Value}; return '' }
function TaskHasMarker($marker) { $doc=GetDoc; if(!$doc){return $false}; $pattern=$null; if(!$doc.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern,[ref]$pattern)){return $false}; return $pattern.DocumentRange.GetText(-1).Contains($marker) }
function Editor { foreach($node in (Nodes)){if($node.Current.ClassName -match '^tiptap ProseMirror(?:\s|$)'){return $node}}; return $null }
function ModelButton { foreach($node in (Nodes)){if($node.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $node.Current.Name -match '^(自动|豆包\s*2\.1).*(高|中|低)$'){return $node}}; return $null }
function StopButton { foreach($node in (Nodes)){if($node.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $node.Current.IsEnabled -and $node.Current.Name -match '^(停止生成|停止任务|停止|暂停任务|暂停)$'){return $node}}; return $null }
function Foreground {
  [XzDoubaoNative]::ShowWindow($script:taskHandle,9) | Out-Null
  [XzDoubaoNative]::SetForegroundWindow($script:taskHandle) | Out-Null
  Start-Sleep -Milliseconds 180
  if([XzDoubaoNative]::GetForegroundWindow() -ne $script:taskHandle){throw '请让豆包工作窗口处于前台后重试'}
}
function EscapeMenus {
  if([XzDoubaoNative]::GetForegroundWindow() -ne $script:taskHandle){throw '豆包工作调用期间窗口已切换，请重试'}
  [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
  [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
  Start-Sleep -Milliseconds 120
}
function DiscoverModels {
  CheckCancel
  $button=ModelButton; if(!$button){throw '请先在豆包工作客户端完成登录，打开聊天输入框'}
  Foreground
  InvokeNode $button
  Start-Sleep -Milliseconds 160
  $out=@()
  try{foreach($node in (Nodes)){if($node.Current.ControlType -eq [System.Windows.Automation.ControlType]::MenuItem -and $node.Current.Name -match '^(自动$|豆包\s*2\.1\s*(Lite|Turbo|Pro)(?:\s|$))'){$out+=@{name=$node.Current.Name;enabled=$node.Current.IsEnabled}}}}finally{EscapeMenus}
  if(!$out.Count){throw '当前豆包工作没有返回可用模型，客户端版本可能已变化'}
  return ,$out
}
function SelectModel($modelName,$effort) {
  CheckCancel
  InvokeNode (ModelButton)
  Start-Sleep -Milliseconds 160
  try{InvokeNode (FindName $modelName);Start-Sleep -Milliseconds 450}finally{EscapeMenus}
  InvokeNode (ModelButton)
  Start-Sleep -Milliseconds 160
  try{
    $effortMenu=$null
    foreach($node in (Nodes)){if($node.Current.ControlType -eq [System.Windows.Automation.ControlType]::MenuItem -and $node.Current.Name -match '^推理强度 '){$effortMenu=$node;break}}
    if(!$effortMenu){throw '当前豆包工作没有可验证的推理强度选项'}
    $effortMenu.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Expand()
    Start-Sleep -Milliseconds 160
    InvokeNode (FindName $effort)
    Start-Sleep -Milliseconds 250
  }finally{EscapeMenus}
  $actual=ModelButton
  if(!$actual -or !$actual.Current.Name.EndsWith(' '+$effort)){throw '豆包工作推理强度没有切换成功'}
  $expected=($modelName -replace '\s+0921.*$','')
  if(!$actual.Current.Name.StartsWith($expected)){throw '豆包工作模型没有切换成功'}
}
function OwnedResponse($marker) {
  $doc=GetDoc; if(!$doc){return $null}
  foreach($node in (Nodes)){
    if($node.Current.ControlType -ne [System.Windows.Automation.ControlType]::Text -or !$node.Current.Name.Contains($marker)){continue}
    $ancestor=$node
    for($depth=0;$ancestor -and $depth -lt 9;$depth++){
      # The response grid is different from the user bubble. Never accept the
      # marker echoed in our input as proof of an assistant response.
      if($ancestor.Current.ClassName -match 'grid-cols-\[minmax\(0,1fr\)_auto\]'){
        $range=$doc.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern).RangeFromChild($ancestor)
        $row=[System.Windows.Automation.TreeWalker]::RawViewWalker.GetParent($ancestor)
        $ended=$false
        foreach($child in $row.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)){
          if($child.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $child.Current.Name -match '^消耗\s+[0-9]'){$ended=$true}
        }
        return @{text=$range.GetText(-1);ended=$ended}
      }
      $ancestor=[System.Windows.Automation.TreeWalker]::RawViewWalker.GetParent($ancestor)
    }
  }
  return $null
}
try {
  # MainWindowHandle can point at an auxiliary popup rather than the work
  # window. Match a top-level client window and its actual process identity.
  $taskProcessIds=@(Get-Process -Name DoubaoWork -ErrorAction SilentlyContinue | ForEach-Object {$_.Id})
  $taskWindow=$null
  foreach($candidate in [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)){
    if($taskProcessIds -contains $candidate.Current.ProcessId -and $candidate.Current.Name -match '(^| - )豆包工作$'){$taskWindow=$candidate;break}
  }
  if(!$taskWindow){Emit @{ok=$true;state=@{running=$false;loggedIn=$false;ready=$false;message='请打开豆包工作客户端并完成登录';models=@()}}; exit}
  $script:taskHandle=[IntPtr]$taskWindow.Current.NativeWindowHandle
  $script:taskRoot=$taskWindow
  if($taskPayload.action -eq 'status'){
    $ready=[bool](ModelButton)
    Emit @{ok=$true;state=@{running=$true;loggedIn=$ready;ready=$ready;message=$(if($ready){'已找到登录中的豆包工作客户端'}else{'请在豆包工作客户端完成登录并打开聊天输入框'});models=@()}}; exit
  }
  if($taskPayload.action -eq 'models'){
    if(StopButton){throw '豆包工作当前任务仍在运行，请等任务结束后刷新模型'}
    Emit @{ok=$true;models=(DiscoverModels)}; exit
  }
  if($taskPayload.action -ne 'request'){throw '不支持的豆包工作操作'}
  CheckCancel
  if(StopButton){throw '豆包工作当前任务仍在运行，请等任务结束后再调用'}
  Foreground
  $oldUrl=TaskUrl
  CheckCancel
  InvokeNode (FindName '新工作任务 Ctrl N')
  Start-Sleep -Milliseconds 260
  if((TaskUrl) -notmatch '^chrome://doubaowork-chat/chat/?$'){throw '豆包工作没有打开独立新任务，未发送文本'}
  $models=DiscoverModels
  $chosen=@($models | Where-Object {$_.name -eq $taskPayload.modelName -and $_.enabled})
  if(!$chosen.Count){throw '当前豆包工作模型不可用，请刷新账号模型后重新选择'}
  SelectModel $taskPayload.modelName $taskPayload.effort
  $editor=Editor
  CheckCancel
  if(!$editor){throw '豆包工作输入框不可用，未发送文本'}
  $existing=$editor.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern).DocumentRange.GetText(-1)
  if($existing.Trim() -and $existing.Trim() -ne '发消息或创建任务... / 使用技能 @ 添加资料'){throw '豆包工作新任务中已有草稿，未覆盖或发送任何文本'}
  $clipboard=[System.Windows.Forms.Clipboard]::GetDataObject()
  $clipboardSequence=$null
  try {
    $editor.SetFocus()
    if([XzDoubaoNative]::GetForegroundWindow() -ne $taskHandle){throw '豆包工作窗口已切换，未发送文本'}
    CheckCancel
    [System.Windows.Forms.Clipboard]::SetText($taskPayload.prompt)
    $clipboardSequence=[XzDoubaoNative]::GetClipboardSequenceNumber()
    [System.Windows.Forms.SendKeys]::SendWait('^v')
    Start-Sleep -Milliseconds 200
    $received=$editor.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern).DocumentRange.GetText(-1)
    if($received.Replace([string][char]13,'').Trim() -ne $taskPayload.prompt.Replace([string][char]13,'').Trim()){throw '豆包工作没有完整接收输入，未提交；请检查客户端草稿'}
    if([XzDoubaoNative]::GetForegroundWindow() -ne $taskHandle){throw '豆包工作窗口已切换，未发送文本'}
    CheckCancel
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  } finally {
    if($null -ne $clipboardSequence -and [XzDoubaoNative]::GetClipboardSequenceNumber() -eq $clipboardSequence){
      if($clipboard){[System.Windows.Forms.Clipboard]::SetDataObject($clipboard,$true)}else{[System.Windows.Forms.Clipboard]::Clear()}
    }
  }
  $ownedUrl='';$unverifiedPolls=0;$deadline=[DateTime]::UtcNow.AddMilliseconds($taskPayload.timeout)
  $lastResponse='';$stable=0
  while([DateTime]::UtcNow -lt $deadline){
    Start-Sleep -Milliseconds 400
    $url=TaskUrl
    if(!$ownedUrl -and $url -match '^chrome://doubaowork-chat/chat/\d+$' -and $url -ne $oldUrl){
      if(TaskHasMarker $taskPayload.requestId){$ownedUrl=$url;Emit @{phase='submitted';requestId=$taskPayload.requestId;taskId=($ownedUrl -replace '.*/','')}}
      else{$unverifiedPolls++;if($unverifiedPolls -ge 8){throw '当前豆包工作任务没有本次请求标记，未接收或停止其他任务'}}
    }
    if($ownedUrl -and $url -ne $ownedUrl){throw '豆包工作已切换到其他任务，本次接收已停止；本次生成任务保留在客户端'}
    if($taskCancelRead.IsCompleted){
      $stopped=$false
      if($ownedUrl -and $url -eq $ownedUrl -and (TaskHasMarker $taskPayload.requestId)){$stop=StopButton;if($stop){InvokeNode $stop;$stopped=$true}}
      Emit @{ok=$false;code='ABORTED';message=$(if($stopped){'任务已停止'}else{'已停止等待；豆包工作任务可能仍在运行，请在客户端停止'});stopped=$stopped};exit
    }
    if(!$ownedUrl){continue}
    $response=OwnedResponse $taskPayload.start
    if(!$response){continue}
    Emit @{phase='receiving';receivedBytes=[System.Text.Encoding]::UTF8.GetByteCount($response.text);requestId=$taskPayload.requestId}
    if($response.text -eq $lastResponse){$stable++}else{$stable=0;$lastResponse=$response.text}
    if($response.ended -and $stable -ge 2 -and $response.text.Contains($taskPayload.end) -and !(StopButton)){
      Emit @{ok=$true;text=$response.text;taskId=($ownedUrl -replace '.*/','');requestId=$taskPayload.requestId};exit
    }
    if($response.ended -and $stable -ge 5 -and !$response.text.Contains($taskPayload.end)){Emit @{ok=$false;code='OUTPUT_TRUNCATED';message='豆包工作输出截断，缺少完整结束标记，请缩小输入范围后重试'};exit 1}
  }
  throw '豆包工作处理超时，本次任务仍保留在客户端；请检查任务、额度与网络后重试'
} catch { Emit @{ok=$false;message=$_.Exception.Message;code=$(if($_.Exception -is [System.OperationCanceledException]){'ABORTED'}else{'UIA_FAILED'})}; exit 1 }
`;

function createDoubaoWorkService({ userDataDir, findExecutable = findDoubaoWork, spawn = nativeSpawn, platform = process.platform, runAdapter } = {}) {
  // No account state is copied into userDataDir. It is accepted for the same
  // main-process factory contract as other account providers.
  void userDataDir;
  let closed = false, busy = false, cachedModels = [], activeChild = null, activeDone = null;
  let lastReady = { loggedIn: false, ready: false, running: false };
  const checkPlatform = () => { if (platform !== 'win32') throw new Error('豆包工作本机账号连接目前支持 Windows'); if (closed) throw new Error('豆包工作连接已关闭'); };
  const adapter = runAdapter || ((payload, { signal, onProgress } = {}) => new Promise((resolve, reject) => {
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const script = Buffer.from(UIA_SCRIPT, 'utf16le').toString('base64');
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', script], { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    activeChild = child;
    let resolveDone; activeDone = new Promise(resolve => { resolveDone = resolve; });
    let buffer = '', done = false, finalResult, cancelTimer;
    const finish = (error, value) => { if (done) return; done = true; clearTimeout(timer); clearTimeout(cancelTimer); signal?.removeEventListener('abort', abort); if (activeChild === child) { activeChild = null; activeDone = null; } resolveDone(); if (error) reject(error); else resolve(value); };
    const abort = () => {
      // The UIA worker owns the new task ID and validates it before stopping.
      try { child.stdin.write('{"cancel":true}\n'); } catch { /* worker may already have exited */ }
      cancelTimer = setTimeout(() => { child.kill(); finish(Object.assign(new Error('已停止等待；豆包工作任务可能仍在运行，请在客户端停止'), { name: 'AbortError' })); }, 5000);
    };
    const timer = setTimeout(() => { child.kill(); finish(new Error('豆包工作连接超时，请检查客户端；已提交任务会保留')); }, (payload.timeout || 10000) + 15000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 2000000) { child.kill(); finish(new Error('豆包工作输出超过接收上限，请拆分任务')); return; }
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
        let result; try { result = JSON.parse(line); } catch { continue; }
        if (result.phase) { onProgress?.(result); continue; }
        if (typeof result.ok === 'boolean') finalResult = result;
      }
    });
    // Discard stderr, which can include host errors; surface controlled errors.
    child.stderr.resume();
    // Cancellation can race normal process exit; a late EPIPE must not crash
    // Electron or replace a response that is still draining from stdout.
    child.stdin.on('error', () => {});
    child.once('error', () => finish(new Error('无法启动豆包工作本机连接，请检查 Windows PowerShell')));
    child.once('close', () => {
      if (buffer.trim()) { try { const result = JSON.parse(buffer.trim()); if (typeof result.ok === 'boolean') finalResult = result; } catch { /* controlled error below */ } }
      if (!finalResult) finish(new Error('豆包工作连接意外退出，请检查客户端'));
      else if (!finalResult.ok) finish(Object.assign(new Error(finalResult.message || '豆包工作连接失败'), { ...(finalResult.code === 'ABORTED' ? { name: 'AbortError' } : {}), code: finalResult.code }));
      else finish(null, finalResult);
    });
    signal?.addEventListener('abort', abort, { once: true });
    child.stdin.write(JSON.stringify(payload) + '\n');
    // stdin stays open to carry cancellation, avoiding EOF-as-cancel.
    if (signal?.aborted) abort();
  }));
  async function operate(action, options = {}) {
    checkPlatform();
    if (!findExecutable()) throw new Error('本机未找到豆包工作，请先安装并登录客户端');
    if (busy) throw new Error('豆包工作本机连接正在操作客户端，请等当前操作结束');
    busy = true;
    try { return await adapter({ action }, options); } finally { busy = false; }
  }
  return {
    async status() {
      if (platform !== 'win32') return { installed: false, loggedIn: false, ready: false, models: [], message: '豆包工作本机账号连接目前支持 Windows' };
      if (!findExecutable()) return { installed: false, loggedIn: false, ready: false, models: [], message: '本机未找到豆包工作，请先安装并登录客户端' };
      if (busy) return { installed: true, ...lastReady, busy: true, models: cachedModels, message: '豆包工作本机连接操作中，请等当前操作结束' };
      try { const result = await operate('status'); lastReady = result.state; return { installed: true, ...lastReady, models: cachedModels }; }
      catch (error) { return { installed: true, loggedIn: false, ready: false, models: [], message: error.message }; }
    },
    async openLogin() {
      checkPlatform();
      const executable = findExecutable(); if (!executable) throw new Error('本机未找到豆包工作，请先安装客户端');
      if (busy) throw new Error('豆包工作正在执行任务，请等任务结束后打开客户端');
      const child = spawn(executable, [], { windowsHide: false, shell: false, stdio: 'ignore' });
      child.once('error', () => {}); child.unref?.();
      return { installed: true, running: true, loggedIn: false, ready: false, models: cachedModels, message: '已打开普通豆包工作客户端；完成登录后点击刷新登录与模型，无需每次开机重新登录' };
    },
    async listModels() {
      if (busy) throw new Error('豆包工作当前任务仍在运行，请等任务结束后刷新模型');
      const result = await operate('models');
      cachedModels = normalizeModels(result.models);
      if (!cachedModels.length) throw new Error('当前豆包工作账号没有返回可用模型');
      lastReady = { loggedIn: true, ready: true, running: true };
      return cachedModels;
    },
    async request(config, options = {}) {
      checkPlatform();
      if (busy) throw new Error('豆包工作本机连接一次只能执行一个任务，请等当前任务结束');
      const signal = options.signal || config?.signal;
      if (signal?.aborted) throw Object.assign(new Error('任务已停止'), { name: 'AbortError' });
      const model = String(config?.model || 'auto').trim().toLowerCase();
      const effort = config?.reasoningEffort || 'high';
      if (!['low', 'medium', 'high'].includes(effort)) throw new Error('豆包工作推理强度必须是低、中或高');
      const requestId = randomUUID().replace(/-/g, '');
      const envelope = buildPrompt(config?.messages, requestId);
      const timeout = Number(config?.timeout) > 0 ? Math.min(Number(config.timeout), 1800000) : 600000;
      busy = true;
      try {
        if (!findExecutable()) throw new Error('本机未找到豆包工作，请先安装并登录客户端');
        const discovered = await adapter({ action: 'models' }, { signal });
        checkPlatform();
        if (signal?.aborted) throw Object.assign(new Error('任务已停止，未提交新任务'), { name: 'AbortError' });
        cachedModels = normalizeModels(discovered.models);
        if (cachedModels.length) lastReady = { loggedIn: true, ready: true, running: true };
        const selected = cachedModels.find(item => item.id === model || item.name.toLowerCase() === model);
        if (!selected) throw new Error('当前豆包工作账号没有该模型，请刷新连接后重新选择');
        options.onProgress?.({ phase: 'waiting', receivedBytes: 0 });
        const result = await adapter({ action: 'request', requestId, ...envelope, modelName: selected.name, effort: { low: '低', medium: '中', high: '高' }[effort], timeout }, { signal, onProgress: options.onProgress });
        if (result.requestId !== requestId || !/^\d+$/.test(String(result.taskId || ''))) throw new Error('豆包工作返回任务不匹配，没有采用其他任务内容');
        if (signal?.aborted) throw Object.assign(new Error('任务已停止'), { name: 'AbortError' });
        return extractResult(result.text, requestId);
      } finally { busy = false; }
    },
    async close() {
      closed = true;
      const child = activeChild, completion = activeDone;
      if (!child) return;
      try { child.stdin.write('{"cancel":true}\n'); } catch { /* no live worker */ }
      let timer;
      await Promise.race([completion, new Promise(resolve => { timer = setTimeout(() => { child.kill(); resolve(); }, 5000); })]);
      clearTimeout(timer);
    },
  };
}

module.exports = { createDoubaoWorkService, findDoubaoWork, normalizeModels, buildPrompt, extractResult, UIA_SCRIPT };
