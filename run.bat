@echo off
cd /d "%~dp0"
REM Starts the app in its own window, without a console
start "" ".venv\Scripts\pythonw.exe" desktop.py
