# PyInstaller build file:  pyinstaller mechapes.spec
from PyInstaller.utils.hooks import collect_all

datas, binaries, hidden = collect_all("pymupdf")

a = Analysis(["app.py"], datas=datas, binaries=binaries,
             hiddenimports=hidden + ["olefile"],
             excludes=["numpy", "PIL", "matplotlib", "pytest"])
pyz = PYZ(a.pure)

# Folder version (fast start) -> dist/Mechapes/
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="Mechapes",
          console=False, icon="icon.ico", upx=False)
COLLECT(exe, a.binaries, a.datas, name="Mechapes", upx=False)

# Single-file version -> dist/Mechapes-single.exe
EXE(pyz, a.scripts, a.binaries, a.datas, [], name="Mechapes-single",
    console=False, icon="icon.ico", upx=False)
