$ErrorActionPreference = 'Stop'
$file = Join-Path $PSScriptRoot 'server.pid'
if (!(Test-Path -LiteralPath $file)) { Write-Output 'No local Qwen service PID recorded.'; exit 0 }
$serviceId = [int]([IO.File]::ReadAllText($file).Trim())
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $serviceId" -ErrorAction SilentlyContinue
$server = Join-Path $PSScriptRoot 'server.py'
if ($process -and $process.CommandLine.Contains($server) -and $process.ExecutablePath -eq [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '.venv/Scripts/python.exe'))) {
    # Let active GPU inference finish; queued requests receive explicit 503 responses.
    $health = Invoke-RestMethod 'http://127.0.0.1:7891/health' -TimeoutSec 3
    if ($health.model -ne 'Qwen3-TTS-12Hz-1.7B-VoiceDesign' -or !$health.concurrency) {
        throw 'Service does not support safe shutdown; inspect before stopping.'
    }
    Invoke-RestMethod -Method Post 'http://127.0.0.1:7891/internal/shutdown' -TimeoutSec 5 | Out-Null
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (!(Get-Process -Id $serviceId -ErrorAction SilentlyContinue)) {
            Remove-Item -LiteralPath $file
            Write-Output 'Qwen3-TTS stopped. GPU memory was released.'
            exit 0
        }
        Start-Sleep -Seconds 1
    }
    Write-Output 'Qwen is finishing active inference and will stop automatically. No process was force-killed.'
} elseif ($process) {
    throw 'Recorded PID belongs to a different process; nothing stopped.'
} else {
    Remove-Item -LiteralPath $file
    Write-Output 'Qwen3-TTS is not running.'
}
