@echo off
chcp 65001 >nul
cd /d "%~dp0"
call .venv\Scripts\activate.bat
pip install -r requirements-diarization.txt
python download_models.py
pause
