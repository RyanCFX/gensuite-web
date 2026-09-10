#!/bin/bash

set -e

echo "🚀 Instalando Node.js, NPM y NVM en macOS..."

# 1. Instalar Homebrew si no existe
if ! command -v brew >/dev/null 2>&1; then
    echo "📦 Instalando Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Configurar Homebrew para Apple Silicon
    if [ -x "/opt/homebrew/bin/brew" ]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
else
    echo "✅ Homebrew ya está instalado."
fi

# 2. Instalar NVM
if [ ! -d "$HOME/.nvm" ]; then
    echo "📦 Instalando NVM..."
    mkdir -p "$HOME/.nvm"

    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
else
    echo "✅ NVM ya está instalado."
fi

# 3. Cargar NVM en esta sesión
export NVM_DIR="$HOME/.nvm"

if [ -s "$NVM_DIR/nvm.sh" ]; then
    source "$NVM_DIR/nvm.sh"
fi

# 4. Instalar Node LTS
echo "📦 Instalando Node.js LTS..."
nvm install --lts
nvm use --lts
nvm alias default 'lts/*'

# 5. Verificar
echo ""
echo "================================"
echo "✅ Instalación completada"
echo "================================"
echo "Node: $(node --version)"
echo "NPM:  $(npm --version)"
echo "NVM:  $(nvm --version)"
echo ""
echo "Node LTS configurado como versión predeterminada."
