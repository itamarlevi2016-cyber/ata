@echo off
setlocal
set "ENGLISH_QUEST_SOURCE=%~dp0app"
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; try { $dest=Join-Path $env:LOCALAPPDATA 'EnglishQuest'; New-Item -ItemType Directory -Force -Path $dest | Out-Null; Copy-Item -LiteralPath $env:ENGLISH_QUEST_SOURCE -Destination $dest -Recurse -Force; $page=Join-Path $dest 'app\index.html'; $desktop=[Environment]::GetFolderPath('Desktop'); $ws=New-Object -ComObject WScript.Shell; $link=$ws.CreateShortcut((Join-Path $desktop 'English Quest.lnk')); $link.TargetPath=$page; $link.WorkingDirectory=(Join-Path $dest 'app'); $link.Description='English Quest - Offline English learning'; $link.Save(); Write-Host 'Installed. Use English Quest on your Desktop.'; Start-Process -FilePath $page; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 (
 echo Installation did not complete. You can use Start.cmd instead.
 pause
 exit /b 1
)
echo Installation complete. No administrator access or Internet connection required.
pause
