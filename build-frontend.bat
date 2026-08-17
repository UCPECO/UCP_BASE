@echo off
REM ============================================
REM  RECOMPILAR FRONTEND - UCP Horas
REM  Usa package.frontend.json (deps de Vite),
REM  compila dist/ y restaura el package.json
REM  de produccion (el que usa Hostinger).
REM ============================================
cd /d "%~dp0"

echo [1/4] Guardando package.json de produccion...
copy /y package.json package.produccion.bak >nul

echo [2/4] Activando dependencias de frontend...
copy /y package.frontend.json package.json >nul
call npm install --no-audit --no-fund
if errorlevel 1 goto error

echo [3/4] Compilando dist/ ...
call npm run build
if errorlevel 1 goto error

echo [4/4] Restaurando package.json de produccion...
copy /y package.produccion.bak package.json >nul
del package.produccion.bak
rmdir /s /q node_modules
del package-lock.json

echo.
echo ============================================
echo  LISTO - dist/ actualizado.
echo  Ahora: git add . ^&^& git commit -m "cambios" ^&^& git push
echo  Hostinger redeploya automaticamente.
echo ============================================
pause
exit /b 0

:error
echo [ERROR] Fallo el build. Restaurando package.json...
copy /y package.produccion.bak package.json >nul
del package.produccion.bak
pause
exit /b 1
