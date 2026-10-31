$ErrorActionPreference = 'Stop'
$file = Join-Path $PSScriptRoot 'server.pid'
if (!(Test-Path -LiteralPath $file)) { Write-Output 'No local Qwen service PID recorded.'; exit 0 }
$serviceId = [int]([IO.File]::ReadAllText($file).Trim())
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $serviceId" -ErrorAction SilentlyContinue
$server = Join-Path $PSScriptRoot 'server.py'
if ($process -and $process.CommandLine.Contains($server) -and $process.ExecutablePath -eq [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '.venv/Scripts/python.exe'))) {
    # Windows venv Python may launch the base interpreter as a child.
    & taskkill.exe /PID $serviceId /T /F | Out-Null
    Remove-Item -LiteralPath $file
    Write-Output 'Qwen3-TTS stopped. GPU memory will be released.'
} elseif ($process) {
    throw 'Recorded PID belongs to a different process; nothing stopped.'
} else {
    Remove-Item -LiteralPath $file
    Write-Output 'Qwen3-TTS is not running.'
}
