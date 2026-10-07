@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul || (echo Python not found. Install Python 3.10-3.12 from python.org & pause & exit /b 1)
if not exist .venv py -3 -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
REM CUDA libraries are needed only with an NVIDIA graphics card
where nvidia-smi >nul 2>nul && pip install nvidia-cublas-cu12 nvidia-cudnn-cu12==9.*
python download_models.py
python create_shortcut.py
echo.
echo Installation complete. Open the app from the desktop shortcut.
pause
