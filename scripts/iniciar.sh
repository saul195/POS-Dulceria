#!/bin/bash
cd "$(dirname "$0")/.."

if ! curl -s -o /dev/null --max-time 2 http://localhost:3000; then
  if [ ! -d node_modules/better-sqlite3 ]; then
    echo "Instalando dependencias (puede tardar)..."
    npm install
  fi
  nohup npm start > /tmp/villa-alegre.log 2>&1 &
  echo "Iniciando Villa Alegre..."
  for i in $(seq 1 15); do
    sleep 1
    if curl -s -o /dev/null --max-time 2 http://localhost:3000; then
      break
    fi
  done
fi

xdg-open http://localhost:3000
