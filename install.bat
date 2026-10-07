@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul || (echo Python not found. Install Python 3.10-3.12 from python.org & pause & exit /b 1)
if not exist .venv py -3 -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install nvidia-cublas-cu12 nvidia-cudnn-cu12==9.*
python download_models.py
echo.
echo Installation complete. Run run.bat to start.
pause
