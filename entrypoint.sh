#!/bin/sh
echo "[Auto-Healer]: TRYB RATUNKOWY (RESCUE MODE) STARTUJĘ..."

# Sprawdź czy node_modules w ogóle istnieje
if [ ! -d "node_modules" ]; then
    echo "[Auto-Healer]: OSTRZEŻENIE! Brak folderu node_modules."
fi

# Uruchom właściwy proces bezpośrednio, bez zbędnych blokad
echo "[Auto-Healer]: Uruchamiam aplikację..."
exec "$@"
