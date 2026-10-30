@echo off
setlocal
title Stemify - Instalar IA
cd /d "%~dp0"

echo.
echo  ==============================================
echo   Stemify - Instalar motores de IA (Demucs + RoFormer)
echo  ==============================================
echo.

rem ---- 1. Entorno de Python del proyecto (carpeta venv) ----
set "PY=%~dp0venv\Scripts\python.exe"
if not exist "%PY%" (
  echo [1/4] Creando entorno de Python en la carpeta venv ...
  py -3 -m venv venv 2>nul || python -m venv venv
)
if not exist "%PY%" (
  echo  ERROR: no se encontro Python. Instalalo desde https://www.python.org/downloads/
  echo         y marca "Add python.exe to PATH" durante la instalacion.
  pause
  exit /b 1
)
echo [1/4] Python del proyecto:
"%PY%" --version
"%PY%" -m pip install --upgrade pip --quiet

rem ---- 2. PyTorch: con CUDA si hay una tarjeta NVIDIA ----
echo.
where nvidia-smi >nul 2>nul
if errorlevel 1 (
  echo [2/4] No se detecto una tarjeta NVIDIA: se usara la CPU, mas lento.
  goto :torch_cpu
)

echo [2/4] Tarjeta NVIDIA detectada:
nvidia-smi --query-gpu=name,driver_version --format=csv,noheader
"%PY%" -c "import torch, sys; sys.exit(0 if torch.cuda.is_available() else 1)" >nul 2>nul
if not errorlevel 1 (
  echo        PyTorch ya usa la GPU. No hace falta reinstalarlo.
  goto :torch_done
)
echo        Instalando PyTorch con soporte para GPU (descarga de ~3 GB, paciencia)...
rem pip no cambia una version CPU por una CUDA del mismo numero: hay que desinstalar antes.
"%PY%" -m pip uninstall -y torch torchaudio >nul 2>nul
for %%C in (cu130 cu128 cu126) do (
  "%PY%" -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/%%C && goto :torch_done
)
echo  AVISO: no se pudo instalar PyTorch con CUDA. Se instala la version para CPU.
echo         Actualiza el driver de NVIDIA y vuelve a ejecutar este archivo.

:torch_cpu
"%PY%" -m pip install torch torchaudio

:torch_done

rem ---- 3. Motores de separacion ----
echo.
echo [3/4] Instalando Demucs y RoFormer (audio-separator)...
"%PY%" -m pip install --upgrade "demucs>=4.0.1" soundfile "audio-separator[cpu]"
if errorlevel 1 (
  echo  ERROR instalando los motores. Revisa el mensaje de arriba.
  pause
  exit /b 1
)

rem ---- 4. Comprobacion ----
echo.
echo [4/4] Comprobando...
"%PY%" -c "import torch, demucs, audio_separator; g = torch.cuda.get_device_name(0) if torch.cuda.is_available() else None; print('   PyTorch', torch.__version__); print('   Aceleracion:', ('GPU ' + g) if g else 'CPU (sin GPU)')"

echo.
echo  Listo. Abre start.bat para usar Stemify.
echo  La primera separacion con RoFormer descarga el modelo (~640 MB) en la carpeta models.
echo.
pause
