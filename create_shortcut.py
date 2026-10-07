"""יוצר קיצורי דרך לתוכנה בשולחן העבודה ובתפריט התחל (Windows בלבד)."""

import base64
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NAME = "תמלול עברית"


def main() -> None:
    if sys.platform != "win32":
        print("קיצורי דרך נוצרים רק ב-Windows. להפעלה: python desktop.py")
        return
    pythonw = ROOT / ".venv" / "Scripts" / "pythonw.exe"
    if not pythonw.exists():
        pythonw = Path(sys.executable).with_name("pythonw.exe")
    icon = ROOT / "app" / "static" / "icon.ico"
    start_menu = Path(os.environ["APPDATA"]) / "Microsoft" / "Windows" / "Start Menu" / "Programs"

    # PowerShell עם פקודה מקודדת — כך השם בעברית עובר בלי בעיות קידוד
    script = f"""
$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
foreach ($dir in @($desktop, '{start_menu}')) {{
  $lnk = $shell.CreateShortcut((Join-Path $dir '{NAME}.lnk'))
  $lnk.TargetPath = '{pythonw}'
  $lnk.Arguments = '"{ROOT / "desktop.py"}"'
  $lnk.WorkingDirectory = '{ROOT}'
  $lnk.IconLocation = '{icon}'
  $lnk.Description = 'תמלול מקומי ואמין של הקלטות בעברית'
  $lnk.Save()
}}
"""
    encoded = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], check=True)
    print("נוצר קיצור דרך בשולחן העבודה ובתפריט התחל.")


if __name__ == "__main__":
    main()
