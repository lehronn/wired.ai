#!/bin/sh
echo "[Auto-Healer]: Sprawdzanie bibliotek..."

# Sprawdź czy kluczowe biblioteki istnieją w node_modules
if [ ! -d "node_modules/pdf-parse" ] || [ ! -d "node_modules/mammoth" ]; then
    echo "[Auto-Healer]: Wykryto brakujące biblioteki! Uruchamiam npm install..."
    npm install --omit=dev
else
    echo "[Auto-Healer]: Wszystkie biblioteki są obecne."
fi

# Uruchom właściwy proces (npm start / node server.js)
exec "$@"
