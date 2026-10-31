$ErrorActionPreference = 'Stop'
$guard = [Threading.Mutex]::new($false, 'Local\XingzhouQwenVoiceDesignStart')
$ownsGuard = $false
try { $ownsGuard = $guard.WaitOne(0) } catch [Threading.AbandonedMutexException] { $ownsGuard = $true }
if (!$ownsGuard) { $guard.Dispose(); Write-Output 'Qwen is already starting.'; exit 0 }
try {
$root = $PSScriptRoot
$python = Join-Path $root '.venv/Scripts/python.exe'
$env:PYTHONUTF8 = '1'
$logs = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
try {
    $health = Invoke-RestMethod 'http://127.0.0.1:7891/health' -TimeoutSec 2
    if ($health.ready -and $health.model -eq 'Qwen3-TTS-12Hz-1.7B-VoiceDesign') {
        Write-Output 'Qwen3-TTS is already running: http://127.0.0.1:7891/v1'
        exit 0
    }
} catch {}
$listener = Get-NetTCPConnection -LocalPort 7891 -State Listen -ErrorAction SilentlyContinue
if ($listener) { throw 'Port 7891 is in use by another service. Inspect before starting.' }
$process = $null
$pidFile = Join-Path $root 'server.pid'
if (Test-Path -LiteralPath $pidFile) {
    $recordedId = [int]([IO.File]::ReadAllText($pidFile).Trim())
    $recorded = Get-CimInstance Win32_Process -Filter "ProcessId = $recordedId" -ErrorAction SilentlyContinue
    if ($recorded -and $recorded.CommandLine.Contains((Join-Path $root 'server.py')) -and $recorded.ExecutablePath -eq [IO.Path]::GetFullPath($python)) { $process = Get-Process -Id $recordedId }
}
if (!$process) { $process = Start-Process -FilePath $python -ArgumentList @('-u', (Join-Path $root 'server.py')) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'server.out.log') -RedirectStandardError (Join-Path $logs 'server.err.log') -PassThru }
[IO.File]::WriteAllText((Join-Path $root 'server.pid'), [string]$process.Id)
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    if ($process.HasExited) { throw 'Qwen failed to start. See logs/server.err.log.' }
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:7891/health' -TimeoutSec 2
        if ($health.ready -and $health.model -eq 'Qwen3-TTS-12Hz-1.7B-VoiceDesign') {
            Write-Output 'Ready: http://127.0.0.1:7891/v1'
            exit 0
        }
    } catch {}
    Start-Sleep -Seconds 2
}
throw 'Startup is taking longer than expected. See logs/server.err.log.'
} finally { if ($ownsGuard) { $guard.ReleaseMutex() }; $guard.Dispose() }
