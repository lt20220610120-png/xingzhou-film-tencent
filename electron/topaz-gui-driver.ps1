param(
 [Parameter(Mandatory=$true)][string]$ProjectPath,
 [Parameter(Mandatory=$true)][string]$ExpectedOutput,
 [string]$TopazPath,
 [int]$ProcessId = 0,
 [int]$TimeoutSeconds = 28800,
 [string]$CancelFile
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class XingzhouTopazWindow {
 [DllImport("user32.dll")] public static extern bool EnableWindow(IntPtr window, bool enable);
 [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr window);
}
'@
$projectFile = (Resolve-Path -LiteralPath $ProjectPath).Path
$project = Get-Content -LiteralPath $projectFile -Raw -Encoding UTF8 | ConvertFrom-Json
$projectName = [string]$project.projectInfo.projectName
if ($projectName -notlike 'xingzhou-topaz-*') { throw 'Topaz项目缺少行舟自动化标识' }
$sourceIds = @($project.mainManagerState.sourceUids)
if ($sourceIds.Count -ne 1) { throw '自动超分项目必须只包含当前片段' }
$source = $project.mainManagerState.videos.([string]$sourceIds[0]).video
$inputPath = [IO.Path]::GetFullPath([string]$source.videoPath)
$outputPath = [IO.Path]::GetFullPath($ExpectedOutput)
if ([IO.Path]::GetDirectoryName($outputPath) -ne [IO.Path]::GetDirectoryName($inputPath)) { throw '超分输出必须位于当前片段工作目录' }
if ([IO.Path]::GetExtension($outputPath) -ne '.mp4' -or (Test-Path -LiteralPath $outputPath)) { throw '超分输出已存在或格式无效，未覆盖原文件' }
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
$script:started = $false
$script:target = $null
$script:startTime = $null
$script:lockedWindow = [IntPtr]::Zero

function Get-Nodes {
 $script:target.Refresh()
 if ($script:target.HasExited -or $script:target.StartTime -ne $script:startTime) { throw 'Topaz窗口已关闭' }
 $handle = $script:target.MainWindowHandle
 if ($handle -eq [IntPtr]::Zero) { return @() }
 $script:window = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
 return @($script:window.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition))
}
function Assert-Project {
 $nodes = Get-Nodes
 if (-not ($nodes | Where-Object { $_.Current.Name.Trim() -eq $projectName } | Select-Object -First 1)) { throw 'Topaz已切换到其他项目，已停止自动操作' }
 return $nodes
}
function Normalize-Name($node) { return (($node.Current.Name -replace '<[^>]*>','').Trim()) }
function Find-Button($nodes,[string[]]$names) {
 return $nodes | Where-Object { $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $_.Current.IsEnabled -and (Normalize-Name $_) -in $names } | Select-Object -First 1
}
function Invoke-Button($node) {
 [void](Assert-Project)
 $node.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
}
function Check-Cancel {
 if ($CancelFile -and (Test-Path -LiteralPath $CancelFile)) { throw 'XINGZHOU_TOPAZ_CANCELLED' }
 if ([DateTime]::UtcNow -ge $deadline) { throw 'Topaz界面超分超时，原片保留' }
}
function Wait-For([scriptblock]$condition) {
 $waitDeadline = [DateTime]::UtcNow.AddSeconds(90)
 while ($true) {
  if ([DateTime]::UtcNow -ge $waitDeadline) { throw 'Topaz窗口初始化或导出对话框超时，原片已保留' }
  Check-Cancel
  $value = & $condition
  if ($value) { return $value }
  Start-Sleep -Milliseconds 350
 }
}
function Lock-ExportWindow {
 [void](Assert-Project)
 $script:lockedWindow = $script:target.MainWindowHandle
 [void][XingzhouTopazWindow]::EnableWindow($script:lockedWindow, $false)
 if ([XingzhouTopazWindow]::IsWindowEnabled($script:lockedWindow)) { throw 'Topaz自动化窗口无法锁定，已停止本次导出' }
}
function Restore-ExportWindow {
 if ($script:lockedWindow -eq [IntPtr]::Zero) { return }
 try {
  $script:target.Refresh()
  if (-not $script:target.HasExited -and $script:target.StartTime -eq $script:startTime) {
   [void][XingzhouTopazWindow]::EnableWindow($script:lockedWindow, $true)
  }
 } catch { }
}
function Close-OwnedProcess {
 if (-not $script:target) { return }
 try {
  & "$env:SystemRoot/System32/taskkill.exe" /PID $script:target.Id /T /F 2>$null | Out-Null
  [void]$script:target.WaitForExit(5000)
 } catch { }
}
function Stop-OwnedExport {
 if (-not $script:target) { return }
 try {
  try {
   $nodes = Assert-Project
   $cancel = Find-Button $nodes @('取消导出','停止导出','Cancel Export','Stop Export','Cancel processing')
   if ($cancel) {
    $cancel.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    Start-Sleep -Milliseconds 300
   }
  } catch { }
  # This process is exclusively attached to a single generated xingzhou project.
  # Cleanup must not depend on a project assertion that may fail after a user switch.
 } finally { Close-OwnedProcess }
}
function Export-Completed {
 try { $saved = Get-Content -LiteralPath $projectFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $false }
 foreach ($property in $saved.mainManagerState.videos.PSObject.Properties) {
  $video = $property.Value.video
  if (-not $video.outputPath) { continue }
  if ([IO.Path]::GetFullPath([string]$video.outputPath) -ne $outputPath) { continue }
  if ($video.processStatus.error) { throw 'Topaz界面导出失败，原片已保留，请查看Topaz导出队列' }
  return $video.processStatus.status -eq 6 -and $video.processStatus.progress -eq 100
 }
 return $false
}

try {
 if ($ProcessId -gt 0) {
  $script:target = Get-Process -Id $ProcessId
 } else {
  if (-not $TopazPath) { throw '请选择Topaz软件路径' }
  $executable = (Resolve-Path -LiteralPath $TopazPath).Path
  $existing = @(Get-Process -Name 'Topaz Video' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $executable })
  if ($existing.Count) { throw 'Topaz窗口已打开。请保存并关闭当前Topaz窗口后继续，行舟将使用独立自动化项目' }
  $script:target = Start-Process -FilePath $executable -ArgumentList ('"' + $projectFile + '"') -WindowStyle Normal -PassThru
 }
 $script:startTime = $script:target.StartTime
 [void](Wait-For {
  $nodes = Get-Nodes
  $nodes | Where-Object { $_.Current.Name.Trim() -eq $projectName } | Select-Object -First 1
 })
 $nodes = Assert-Project
 $export = Find-Button $nodes @('导出视频','Export Video','Export')
 if (-not $export) { throw '当前Topaz版本没有受支持的本地导出按钮' }
 Invoke-Button $export
 $start = Wait-For {
  $nodes = Assert-Project
  Find-Button $nodes @('开始导出','Start Export','Export Video')
 }
 $nodes = Assert-Project
 $filename = $nodes | Where-Object { $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit -and $_.Current.AutomationId -like '*QQuickPopupItem*' } | Select-Object -First 1
 $destination = $nodes | Where-Object { $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::ComboBox -and $_.Current.AutomationId -like '*QQuickPopupItem*' -and (Normalize-Name $_) -in @('原文件夹','Original Folder','Original folder') } | Select-Object -First 1
 if (-not $filename -or -not $destination) { throw 'Topaz导出目录不是原文件夹，未开始导出；请将默认保存位置设为原文件夹' }
 $value = $filename.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
 $basename = [IO.Path]::GetFileNameWithoutExtension($outputPath)
 $value.SetValue($basename)
 if ($value.Current.Value -ne $basename) { throw 'Topaz导出文件名未确认' }
 Check-Cancel
 Invoke-Button $start
 $script:started = $true
 Lock-ExportWindow
 $lastSize = -1L
 $stable = 0
 while ($stable -lt 4) {
  Check-Cancel
  [void](Assert-Project)
  if ((Test-Path -LiteralPath $outputPath) -and (Export-Completed)) {
   $file = Get-Item -LiteralPath $outputPath
   if ($file.Length -gt 0 -and $file.Length -eq $lastSize) { $stable++ } else { $stable = 0 }
   $lastSize = $file.Length
  }
  Start-Sleep -Milliseconds 500
 }
 # The caller must verify codec dimensions, duration and hash before accepting.
 @{status='exported';output=$outputPath;processId=$script:target.Id} | ConvertTo-Json -Compress
 # QML windows in this build ignore WM_CLOSE. The generated project is complete,
 # so close only the process tree started by this driver to release handles.
 Close-OwnedProcess
 exit 0
} catch {
 $message = $_.Exception.Message
 Stop-OwnedExport
 [Console]::Error.WriteLine($message)
 exit 1
}
finally { Restore-ExportWindow }
