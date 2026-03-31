#!/bin/sh
echo "[Wired AI]: Rozpoczynam procedurę startową (Standard + Resilience)... 🚀"

# 1. Usuń pliki blokujące, które często powodują błędy na Synology/Docker
if [ -f "package-lock.json" ]; then
    echo "[Wired AI]: Usuwam package-lock.json dla czystej instalacji... 🗑️"
    rm -f package-lock.json
fi

# 2. Wymuś uprawnienia zapisu jeśli to możliwe
chmod -R 777 node_modules 2>/dev/null || true

# 3. Sprawdź i doinstaluj braki TYLKO jeśli ich nie ma (oszczędność czasu i unikanie blokad)
if [ ! -d "node_modules/pdf-parse" ] || [ ! -d "node_modules/xlsx" ]; then
    echo "[Wired AI]: Brakujące organy wykryte! Próbuję bezpiecznej instalacji... 🩺📦"
    npm install pdf-parse mammoth xlsx --omit=dev --no-package-lock --no-save --prefer-offline --no-fund --no-audit --unsafe-perm || echo "[Wired AI]: UWAGA! Instalacja automatyczna zawiodła. Aplikacja ruszy w trybie uproszczonym."
fi

# 4. Uruchom właściwy proces
echo "[Wired AI]: Startuję usługę... 🚀"
exec "$@"
