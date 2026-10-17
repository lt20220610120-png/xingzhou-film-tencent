param([string]$Page = 'https://winai.xingzhoufilm.cn/')
$ErrorActionPreference = 'Stop'
if ($Page -notmatch '^https://winai\.xingzhoufilm\.cn(/|$)') { throw 'Unexpected site URL' }
$chrome = Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'
if (-not (Test-Path -LiteralPath $chrome)) { throw 'Please install Google Chrome to use the local access helper.' }
$port = 18319
$listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    $owner = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $listener.OwningProcess)
    if ($owner.Name -ne 'ssh.exe' -or $owner.CommandLine -notmatch '18319' -or $owner.CommandLine -notmatch 'ubuntu@106\.55\.41\.128') {
        throw 'The Win AI access-helper port is occupied by another process.'
    }
} else {
    $key = Join-Path $env:USERPROFILE '.ssh\xingzhou_tencent_test'
    $known = Join-Path $env:USERPROFILE '.ssh\known_hosts_xingzhou'
    $arguments = @('-N','-D','127.0.0.1:18319','-i',('"' + $key + '"'),'-o','BatchMode=yes','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=30','-o','ServerAliveCountMax=3','-o','StrictHostKeyChecking=yes','-o',('"UserKnownHostsFile=' + $known + '"'),'ubuntu@106.55.41.128')
    $tunnel = Start-Process -FilePath 'ssh.exe' -ArgumentList $arguments -WindowStyle Hidden -PassThru
    $connected = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if ($tunnel.HasExited) { throw 'Win AI SSH access helper could not connect.' }
        if (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { $connected = $true; break }
        Start-Sleep -Milliseconds 200
    }
    if (-not $connected) { throw 'Win AI SSH access helper did not become ready.' }
}
$winAiBrowserProfile = Join-Path $env:LOCALAPPDATA 'WinAI\browser-profile'
Start-Process -FilePath $chrome -ArgumentList @(('"--user-data-dir=' + $winAiBrowserProfile + '"'),'--proxy-server=socks5://127.0.0.1:18319',$Page)
