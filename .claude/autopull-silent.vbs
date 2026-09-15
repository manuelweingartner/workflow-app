' Silent wrapper — invokes autopull.ps1 with zero UI (no flashing console)
Dim fso, shell, ps1
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
ps1 = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "autopull.ps1")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & ps1 & """", 0, False
