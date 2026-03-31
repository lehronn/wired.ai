#!/bin/sh
echo "[Auto-Healer]: Rozpoczynam sprawdzanie środowiska..."

# Diagnostyka uprawnień (pomocne przy debugowaniu Synology)
echo "[Auto-Healer]: Uruchomiono jako: $(whoami)"
echo "[Auto-Healer]: Uprawnienia node_modules: $(ls -ld node_modules 2>/dev/null || echo 'brak folderu')"

# Sprawdź czy kluczowe biblioteki istnieją w node_modules
MISSING=0
if [ ! -d "node_modules/pdf-parse" ]; then MISSING=1; fi
if [ ! -d "node_modules/mammoth" ]; then MISSING=1; fi
if [ ! -d "node_modules/xlsx" ]; then MISSING=1; fi

if [ "$MISSING" -eq 1 ]; then
    echo "[Auto-Healer]: Wykryto brakujące biblioteki (PDF/Word/Excel)! Instaluję braki... (wymuszam instalację)"
    # Używamy --prefer-offline i --no-package-lock, aby uniknąć konfliktów z hostem (Mac/NAS)
    npm install pdf-parse mammoth xlsx --omit=dev --no-package-lock --no-save --prefer-offline
    
    if [ $? -eq 0 ]; then
        echo "[Auto-Healer]: Sukces! Biblioteki zostały zainstalowane pomyślnie. 🔥"
    else
        echo "[Auto-Healer]: ERROR! Instalacja nie powiodła się. Próbuję ostatniej szansy: prosta instalacja..."
        npm install pdf-parse mammoth xlsx
    fi
else
    echo "[Auto-Healer]: Wszystkie systemy sprawne. Biblioteki są gotowe. ✅"
fi

# Uruchom właściwy proces (npm start / node server.js)
echo "[Auto-Healer]: Przekazuję kontrolę do aplikacji..."
exec "$@"
