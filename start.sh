#!/usr/bin/env bash
# Lancement en une commande pour macOS / Linux.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js est requis. Installez-le depuis https://nodejs.org puis relancez ce script."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Première installation des dépendances..."
  npm install --omit=dev
fi

node server.js
