const {spawn:nativeSpawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');

// A normal GUI browser runs on its own Win32 desktop. The user desktop is never
// switched, and no browser identity or website verification property is changed.
const nativeSource=String.raw`
using System;
using System.Runtime.InteropServices;
public class XingzhouBackgroundBrowser {
 public delegate bool EnumProc(IntPtr hwnd,IntPtr param);
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct STARTUPINFO {
  public uint cb; public string lpReserved,lpDesktop,lpTitle; public uint dwX,dwY,dwXSize,dwYSize,dwXCountChars,dwYCountChars,dwFillAttribute,dwFlags; public ushort wShowWindow,cbReserved2; public IntPtr lpReserved2,hStdInput,hStdOutput,hStdError;
 }
 [StructLayout(LayoutKind.Sequential)] public struct PROCESS_INFORMATION {public IntPtr hProcess,hThread; public uint dwProcessId,dwThreadId;}
 [StructLayout(LayoutKind.Sequential)] public struct JOB_BASIC_LIMITS {public long PerProcessUserTimeLimit,PerJobUserTimeLimit;public uint LimitFlags;public UIntPtr MinimumWorkingSetSize,MaximumWorkingSetSize;public uint ActiveProcessLimit;public UIntPtr Affinity;public uint PriorityClass,SchedulingClass;}
 [StructLayout(LayoutKind.Sequential)] public struct IO_COUNTERS {public ulong ReadOperationCount,WriteOperationCount,OtherOperationCount,ReadTransferCount,WriteTransferCount,OtherTransferCount;}
 [StructLayout(LayoutKind.Sequential)] public struct JOB_EXTENDED_LIMITS {public JOB_BASIC_LIMITS Basic;public IO_COUNTERS IO;public UIntPtr ProcessMemoryLimit,JobMemoryLimit,PeakProcessMemoryUsed,PeakJobMemoryUsed;}
 [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern IntPtr CreateDesktop(string name,IntPtr device,IntPtr mode,uint flags,uint access,IntPtr attributes);
 [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr desktop);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool CreateProcess(string application,string command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string directory,ref STARTUPINFO startup,out PROCESS_INFORMATION info);
 [DllImport("kernel32.dll")] public static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
 [DllImport("kernel32.dll")] public static extern bool TerminateProcess(IntPtr process,uint code);
 [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern IntPtr CreateJobObject(IntPtr attributes,string name);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool SetInformationJobObject(IntPtr job,int type,ref JOB_EXTENDED_LIMITS info,uint length);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window,out uint processId);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback,IntPtr param);
 [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr window,int state);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowTextLength(IntPtr window);
 public static int ChangeOwnWindows(uint processId,bool show){int count=0;EnumWindows((w,p)=>{uint pid;GetWindowThreadProcessId(w,out pid);if(pid==processId&&GetWindowTextLength(w)>0){ShowWindowAsync(w,show?9:6);if(show)SetForegroundWindow(w);count++;}return true;},IntPtr.Zero);return count;}
 public static uint ForegroundProcess(){uint pid;GetWindowThreadProcessId(GetForegroundWindow(),out pid);return pid;}
 public static int UserDesktopWindows(uint processId){int count=0;EnumWindows((w,p)=>{uint pid;GetWindowThreadProcessId(w,out pid);if(pid==processId)count++;return true;},IntPtr.Zero);return count;}
 public static int Run(string desktopName,string executable,string command) {
  uint initialForeground=ForegroundProcess();
  bool interactive=String.IsNullOrEmpty(desktopName);
  IntPtr desktop=interactive?IntPtr.Zero:CreateDesktop(desktopName,IntPtr.Zero,IntPtr.Zero,0,0x01ff,IntPtr.Zero);
  if(!interactive&&desktop==IntPtr.Zero)throw new Exception("BACKGROUND_DESKTOP_"+Marshal.GetLastWin32Error());
  PROCESS_INFORMATION info=new PROCESS_INFORMATION();IntPtr job=IntPtr.Zero;
  try {
   job=CreateJobObject(IntPtr.Zero,null);if(job==IntPtr.Zero)throw new Exception("BACKGROUND_JOB_"+Marshal.GetLastWin32Error());
   JOB_EXTENDED_LIMITS limits=new JOB_EXTENDED_LIMITS();limits.Basic.LimitFlags=0x2000;
   if(!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(limits)))throw new Exception("BACKGROUND_JOB_LIMIT_"+Marshal.GetLastWin32Error());
   STARTUPINFO startup=new STARTUPINFO();startup.cb=(uint)Marshal.SizeOf(startup);
   startup.lpDesktop=interactive?null:"winsta0\\"+desktopName;
   if(interactive){startup.dwFlags=1;startup.wShowWindow=7;}
   if(!CreateProcess(executable,command,IntPtr.Zero,IntPtr.Zero,false,0x08000004,IntPtr.Zero,null,ref startup,out info))throw new Exception("BACKGROUND_BROWSER_"+Marshal.GetLastWin32Error());
   if(!AssignProcessToJobObject(job,info.hProcess))throw new Exception("BACKGROUND_JOB_ASSIGN_"+Marshal.GetLastWin32Error());
   if(ResumeThread(info.hThread)==0xffffffff)throw new Exception("BACKGROUND_BROWSER_RESUME_"+Marshal.GetLastWin32Error());
   CloseHandle(info.hThread);info.hThread=IntPtr.Zero;Console.WriteLine("{\"processId\":"+info.dwProcessId+",\"consoleWindow\":"+GetConsoleWindow().ToInt64()+",\"initialForegroundProcess\":"+initialForeground+"}");
   // Console's synchronized TextReader may execute ReadLineAsync synchronously.
   // Keep the pipe read on a worker so browser exit and ownership checks continue.
   var stop=System.Threading.Tasks.Task.Run(()=>Console.In.ReadLine());
   bool verified=false;var startupTime=DateTime.UtcNow;
   while(WaitForSingleObject(info.hProcess,100)==258){
    if(!verified&&(DateTime.UtcNow-startupTime).TotalMilliseconds>=1500){Console.WriteLine("{\"userDesktopWindows\":"+UserDesktopWindows(info.dwProcessId)+",\"foregroundProcess\":"+ForegroundProcess()+",\"browserInForeground\":"+(ForegroundProcess()==info.dwProcessId).ToString().ToLower()+"}");verified=true;}
    if(stop.IsCompleted){
     var request=stop.Result;
     if(interactive&&(request=="show"||request=="minimize")){int count=ChangeOwnWindows(info.dwProcessId,request=="show");Console.WriteLine("{\"windowCommand\":\""+request+"\",\"windows\":"+count+"}");stop=System.Threading.Tasks.Task.Run(()=>Console.In.ReadLine());}
     else {TerminateProcess(info.hProcess,0);break;}
    }
   }
   WaitForSingleObject(info.hProcess,5000);return 0;
  } finally {
   // The Job object owns only the browser started suspended above and its
   // descendants. Closing it reaps leftover renderers on forced shutdown.
   if(info.hProcess!=IntPtr.Zero&&WaitForSingleObject(info.hProcess,0)==258)TerminateProcess(info.hProcess,0);
   if(job!=IntPtr.Zero)CloseHandle(job);
   if(info.hThread!=IntPtr.Zero)CloseHandle(info.hThread);
   if(info.hProcess!=IntPtr.Zero){WaitForSingleObject(info.hProcess,5000);CloseHandle(info.hProcess);}
   if(desktop!=IntPtr.Zero)CloseDesktop(desktop);
  }
 }
}`;
function windowsArgument(value){return '"'+String(value).replace(/(\\*)"/g,'$1$1\\"').replace(/(\\+)$/,'$1$1')+'"';}
function powershellLiteral(value){return "'"+String(value).replace(/'/g,"''")+"'";}
function spawnBackgroundBrowser(executable,args,{spawn=nativeSpawn,platform=process.platform,interactiveDesktop=false}={}){
 if(platform!=='win32')return spawn(executable,[...args,'--headless=new'],{windowsHide:true,shell:false,stdio:'ignore'});
 const desktop=interactiveDesktop?'':`XingzhouOwnedBrowser_${randomUUID().replace(/-/g,'')}`;
 const command=[executable,...args,...(interactiveDesktop?['--start-minimized']:[])].map(windowsArgument).join(' ');
 const script=`$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; try { Add-Type -TypeDefinition ${powershellLiteral(nativeSource)}; [XingzhouBackgroundBrowser]::Run(${powershellLiteral(desktop)},${powershellLiteral(executable)},${powershellLiteral(command)}) | Out-Null } catch { [Console]::Error.WriteLine('XINGZHOU_BACKGROUND_ERROR:'+$_.Exception.GetBaseException().Message); exit 1 }`;
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
 if(interactiveDesktop&&child.stdout){
  let buffer='',pending;
  child.stdout.on('data',chunk=>{buffer+=chunk;let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);try{const result=JSON.parse(line);if(result.windowCommand===pending?.action){const current=pending;pending=null;clearTimeout(current.timer);result.windows?current.resolve():current.reject(new Error('未找到可显示的独立浏览器窗口'));}}catch{}}});
  child.changeWindowState=action=>new Promise((resolve,reject)=>{
   if(!['show','minimize'].includes(action)||pending||!child.stdin?.writable)return reject(new Error('独立浏览器窗口正在处理，请稍后重试'));
   pending={action,resolve,reject,timer:setTimeout(()=>{pending=null;reject(new Error('独立浏览器窗口显示超时，请重试'));},5000)};
   child.stdin.write(action+'\n');
  });
  child.stdin?.on('error',()=>{if(pending){clearTimeout(pending.timer);pending.reject(new Error('独立浏览器连接已关闭，请重新打开登录窗口'));pending=null;}});
  child.once('exit',()=>{if(pending){clearTimeout(pending.timer);pending.reject(new Error('独立浏览器窗口已退出'));pending=null;}});
 }
 child.stderr?.on('data',chunk=>{child.startupError=String((child.startupError||'')+chunk).slice(-4096);});
 const kill=child.kill.bind(child);child.kill=()=>{if(child.stdin?.writable){child.stdin.end('stop\n');return true;}return kill();};
 child.backgroundDesktop=desktop;return child;
}
module.exports={spawnBackgroundBrowser,windowsArgument};
