#!/bin/sh
echo "[Auto-Healer]: Rozpoczynam sprawdzanie środowiska i uprawnień..."

# Diagnostyka i wymuszenie uprawnień (Synology Fix)
echo "[Auto-Healer]: Uruchomiono jako: $(whoami)"
if [ -d "node_modules" ]; then
    echo "[Auto-Healer]: Wymuszam pełne uprawnienia zapisu dla node_modules... 🔐"
    chmod -R 777 node_modules 2>/dev/null
    ls -ld node_modules
else
    echo "[Auto-Healer]: Folder node_modules nie istnieje, zostanie utworzony przy instalacji."
fi

# Sprawdź czy kluczowe biblioteki istnieją
MISSING=0
if [ ! -d "node_modules/pdf-parse" ]; then MISSING=1; fi
if [ ! -d "node_modules/mammoth" ]; then MISSING=1; fi
if [ ! -d "node_modules/xlsx" ]; then MISSING=1; fi

if [ "$MISSING" -eq 1 ]; then
    echo "[Auto-Healer]: Wykryto brakujące biblioteki (PDF/Word/Excel)! Instaluję braki... 🚀"
    # Używamy --prefer-offline, --no-package-lock i --unsafe-perm, aby uniknąć konfliktów na NAS.
    npm install pdf-parse mammoth xlsx --omit=dev --no-package-lock --no-save --prefer-offline --no-fund --no-audit --unsafe-perm
    
    if [ $? -eq 0 ]; then
        echo "[Auto-Healer]: Sukces! Biblioteki zostały zainstalowane pomyślnie. 🔥"
        chmod -R 777 node_modules 2>/dev/null
    else
        echo "[Auto-Healer]: ERROR! Instalacja nie powiodła się. Sprawdź połączenie z internetem na NAS. 🚨"
    fi
else
    echo "[Auto-Healer]: Wszystkie systemy sprawne. Biblioteki są gotowe. ✅"
fi

# Uruchom właściwy proces (npm start / node server.js)
echo "[Auto-Healer]: Przekazuję kontrolę do aplikacji..."
exec "$@"
