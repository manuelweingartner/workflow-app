' Silent wrapper — invokes autopull.ps1 with zero UI (no flashing console)
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""C:\CLAUDE\workflow-app\.claude\autopull.ps1""", 0, False
