param([switch]$SaveOnly)
$ErrorActionPreference = 'Stop'
$credentialPath = Join-Path $env:LOCALAPPDATA 'WinAI\admin.dpapi.xml'
if (-not (Test-Path -LiteralPath $credentialPath)) {
    $keyPath = Join-Path $env:USERPROFILE '.ssh\xingzhou_tencent_test'
    $knownPath = Join-Path $env:USERPROFILE '.ssh\known_hosts_xingzhou'
    $raw = & ssh -i $keyPath -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$knownPath" ubuntu@106.55.41.128 'sudo cat /etc/win-ai/admin.json'
    if ($LASTEXITCODE -ne 0) { throw '读取管理员凭据失败，请检查本机 SSH 授权。' }
    $data = ($raw -join "`n") | ConvertFrom-Json
    $secure = ConvertTo-SecureString $data.password -AsPlainText -Force
    $credential = [System.Management.Automation.PSCredential]::new($data.username, $secure)
    New-Item -ItemType Directory -Force -Path (Split-Path $credentialPath) | Out-Null
    $credential | Export-Clixml -LiteralPath $credentialPath
    $raw = $null
    $data = $null
} else {
    $credential = Import-Clixml -LiteralPath $credentialPath
}
if ($SaveOnly) { Write-Host 'Win AI 管理员凭据已通过 Windows DPAPI 加密保存。'; exit 0 }
Set-Clipboard -Value $credential.GetNetworkCredential().Password
Write-Host ('管理员账号：' + $credential.UserName)
Write-Host '密码已复制到剪贴板，请在打开的登录页粘贴。'
Write-Host '凭据已通过 Windows DPAPI 加密，仅当前 Windows 账户能够解密。修改站点密码后，请删除本机旧凭据缓存后重新保存。'
& (Join-Path $PSScriptRoot 'open-site.ps1') -Page 'https://winai.xingzhoufilm.cn/sign-in'
