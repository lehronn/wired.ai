#!/bin/sh
echo "[Auto-Healer]: Rozpoczynam sprawdzanie środowiska..."

# Sprawdź czy kluczowe biblioteki istnieją w node_modules
MISSING=0
if [ ! -d "node_modules/pdf-parse" ]; then MISSING=1; fi
if [ ! -d "node_modules/mammoth" ]; then MISSING=1; fi
if [ ! -d "node_modules/xlsx" ]; then MISSING=1; fi

if [ "$MISSING" -eq 1 ]; then
    echo "[Auto-Healer]: Wykryto brakujące biblioteki (PDF/Word/Excel)! Instaluję braki... (To może potrwać ok. 30s)"
    npm install pdf-parse mammoth xlsx --omit=dev --no-package-lock --no-save
    
    if [ $? -eq 0 ]; then
        echo "[Auto-Healer]: Sukces! Biblioteki zostały zainstalowane pomyślnie. 🔥"
    else
        echo "[Auto-Healer]: ERROR! Instalacja bibliotek nie powiodła się. Sprawdź połączenie z internetem na NAS. 🚨"
    fi
else
    echo "[Auto-Healer]: Wszystkie systemy sprawne. Biblioteki są gotowe. ✅"
fi

# Uruchom właściwy proces (npm start / node server.js)
echo "[Auto-Healer]: Przekazuję kontrolę do aplikacji..."
exec "$@"
