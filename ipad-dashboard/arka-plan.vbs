' Sunucuyu pencere acmadan calistirir. Windows Gorev Zamanlayici bunu baslatir (servis.bat ile kurulur).
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
' 0 = pencere gizli, False = bitmesini bekleme
sh.Run """" & dir & "\arka-plan.bat""", 0, False
