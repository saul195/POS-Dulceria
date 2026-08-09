#!/bin/bash
# ============================================================
#  Instalador de Villa Alegre POS para Linux (Ubuntu/Debian)
#  Instala Node.js + dependencias + Chromium y deja el sistema
#  corriendo. Puede crear un servicio para que arranque solo.
#  Uso:  bash instalar-linux.sh
# ============================================================

set -e

REPO_URL="https://github.com/saul195/POS-Dulceria.git"
REPO_DIR="${POS_DIR:-$HOME/POS-Dulceria}"
SERVICE_NAME="villa-alegre"
NODE_MAJOR=20

log() { echo -e "\n\033[1;34m==>\033[0m $*"; }
ok()  { echo -e "\033[1;32mOK\033[0m: $*"; }
err() { echo -e "\033[1;31mERROR\033[0m: $*"; exit 1; }

# ---------- Permisos ----------
if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  SUDO="sudo"
fi
if [ -n "$SUDO" ] && ! $SUDO -n true 2>/dev/null; then
  echo "Voy a pedir tu contraseña para instalar paquetes del sistema."
  $SUDO true || err "Se necesita sudo para instalar."
fi

# ---------- Sistema base ----------
log "Actualizando lista de paquetes..."
$SUDO apt-get update -y

log "Instalando herramientas básicas (curl, git, xdg-utils)..."
$SUDO apt-get install -y curl git xdg-utils ca-certificates apt-transport-https

# ---------- Node.js ----------
if command -v node >/dev/null 2>&1 && [ "$(node -p 'parseInt(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)" -ge 18 ]; then
  ok "Node.js ya está instalado: $(node -v)"
else
  log "Instalando Node.js $NODE_MAJOR LTS..."
  if [ ! -d /etc/apt/keyrings ]; then
    $SUDO mkdir -p /etc/apt/keyrings
  fi
  $SUDO curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | $SUDO tee /etc/apt/keyrings/nodesource.gpg >/dev/null
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | $SUDO tee /etc/apt/sources.list.d/nodesource.list >/dev/null
  $SUDO apt-get update -y
  $SUDO apt-get install -y nodejs
  ok "Node.js $(node -v) · npm $(npm -v)"
fi

# ---------- Chromium (para WhatsApp) ----------
if [ ! -x /usr/bin/chromium ] && [ ! -x /usr/bin/chromium-browser ]; then
  log "Instalando Chromium (lo usa WhatsApp para enviar alertas)..."
  if apt-cache policy chromium >/dev/null 2>&1 && apt-cache show chromium >/dev/null 2>&1; then
    $SUDO apt-get install -y chromium
  else
    $SUDO apt-get install -y chromium-browser || true
  fi
else
  ok "Chromium ya está instalado."
fi

# ---------- Repositorio ----------
if [ -d "$REPO_DIR/.git" ]; then
  log "El proyecto ya existe en $REPO_DIR. Actualizando..."
  cd "$REPO_DIR"
  git fetch origin main 2>/dev/null || true
  git pull --ff-only origin main 2>/dev/null || true
else
  log "Descargando el proyecto en $REPO_DIR..."
  mkdir -p "$(dirname "$REPO_DIR")"
  git clone "$REPO_URL" "$REPO_DIR"
  cd "$REPO_DIR"
fi

# ---------- Dependencias ----------
log "Instalando dependencias de Node (puede tardar)..."
cd "$REPO_DIR"
if [ ! -d node_modules ]; then
  npm install
else
  npm install --no-fund --no-audit || true
fi
ok "Dependencias listas."

# ---------- Servicio (opcional) ----------
if command -v systemctl >/dev/null 2>&1; then
  read -p "¿Crear un servicio para que arranque solo al encender la PC? (s/n): " SRV
  case "$SRV" in
    s|S|y|Y|si|SI|sí)
      UNIT="/etc/systemd/system/$SERVICE_NAME.service"
      log "Creando servicio $SERVICE_NAME..."
      $SUDO tee "$UNIT" >/dev/null <<EOF
[Unit]
Description=Villa Alegre POS
After=network.target

[Service]
WorkingDirectory=$REPO_DIR
ExecStart=/usr/bin/node $REPO_DIR/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
      $SUDO systemctl daemon-reload
      $SUDO systemctl enable "$SERVICE_NAME"
      $SUDO systemctl restart "$SERVICE_NAME"
      sleep 3
      if curl -s -o /dev/null --max-time 3 http://localhost:3000; then
        ok "Servicio iniciado en http://localhost:3000"
      else
        err "El servicio no respondió. Revisa con: journalctl -u $SERVICE_NAME"
      fi
      ;;
    *)
      log "Omitiendo el servicio. Puedes iniciar el sistema con: scripts/iniciar.sh"
      ;;
  esac
fi

# ---------- Primer arranque ----------
if ! curl -s -o /dev/null --max-time 3 http://localhost:3000; then
  log "Arrancando el sistema..."
  nohup npm start > /tmp/villa-alegre.log 2>&1 &
  sleep 4
fi

if curl -s -o /dev/null --max-time 3 http://localhost:3000; then
  ok "Villa Alegre está corriendo en http://localhost:3000"
  xdg-open http://localhost:3000 >/dev/null 2>&1 || true
else
  err "No pude iniciar el servidor. Revisa /tmp/villa-alegre.log"
fi

echo ""
echo "===================================================================="
echo "  LISTO ✓  Ahora configura la impresora en la parte superior y,"
echo "  para WhatsApp, activa la alerta y escanea el QR en el menú WhatsApp."
echo "===================================================================="
