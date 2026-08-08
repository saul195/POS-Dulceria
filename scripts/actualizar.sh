#!/bin/bash
# Actualizador del POS Villa Alegre
# Pide contraseña, revisa si hay cambios en el repositorio y los descarga con confirmación.

PASSWORD="dev195"
REPO_DIR="/home/gress/Desktop/POS-Dulceria"
BRANCH="main"

cd "$REPO_DIR" || { echo "ERROR: No se encontró la carpeta del proyecto en $REPO_DIR"; read -p "Presiona Enter para salir..."; exit 1; }

echo "=== Actualizar Villa Alegre ==="
echo ""

# 1. Contraseña
read -s -p "Contraseña: " INTENTO
echo ""
if [ "$INTENTO" != "$PASSWORD" ]; then
  echo "Contraseña incorrecta."
  read -p "Presiona Enter para salir..."
  exit 1
fi
echo "Contraseña correcta."
echo ""

# 2. Revisar si hay cambios en el repositorio remoto
echo "Revisando si hay actualizaciones en GitHub..."
if ! git fetch origin "$BRANCH" 2>/dev/null; then
  echo "ERROR: No se pudo contactar con GitHub. Revisa tu conexión a internet."
  read -p "Presiona Enter para salir..."
  exit 1
fi

LOCAL=$(git rev-parse HEAD 2>/dev/null)
REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "No hay cambios disponibles. Ya tienes la versión más reciente."
  read -p "Presiona Enter para salir..."
  exit 0
fi

echo "¡Hay cambios disponibles!"
echo ""
echo "Cambios a descargar:"
git log --oneline "HEAD..origin/$BRANCH"

# 3. Confirmación
echo ""
read -p "¿Deseas descargarlos ahora? (s/n): " CONFIRMA
case "$CONFIRMA" in
  s|S|y|Y|si|SI|sí)
    echo ""
    echo "Descargando cambios..."
    if git pull origin "$BRANCH"; then
      echo "Cambios descargados correctamente."
      echo "Actualizando dependencias (si hace falta)..."
      npm install
      echo ""
      echo "Actualización completada."
    else
      echo ""
      echo "ERROR: No se pudo completar la actualización."
      echo "Si tienes cambios locales sin guardar, descártalos con:"
      echo "  git checkout ."
      echo "  git pull origin $BRANCH"
    fi
    ;;
  *)
    echo "Descarga cancelada. No se realizaron cambios."
    ;;
esac

read -p "Presiona Enter para salir..."
