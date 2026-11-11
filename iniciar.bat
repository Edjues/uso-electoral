@echo off
cd /d "%~dp0"
if not exist ".env" (
  echo Falta el archivo .env con la conexion a Supabase. Copie .env.example como .env y completelo.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo Instalando dependencias por primera vez...
  call npm install
)
call npm start
pause
