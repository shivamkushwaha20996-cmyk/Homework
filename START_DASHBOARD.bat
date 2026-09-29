@echo off
setlocal
cd /d "%~dp0"
set PORT=8765
where py >nul 2>&1
if %errorlevel%==0 goto PYTHON
where python >nul 2>&1
if %errorlevel%==0 goto PYTHON_EXE
echo Python is not installed or not available on PATH.
echo Install Python 3 and enable "Add Python to PATH", then run this file again.
pause
exit /b 1
:PYTHON
start "Mobile R&D Technical Hub" "http://127.0.0.1:%PORT%/"
py -m http.server %PORT%
exit /b
:PYTHON_EXE
start "Mobile R&D Technical Hub" "http://127.0.0.1:%PORT%/"
python -m http.server %PORT%
endlocal
