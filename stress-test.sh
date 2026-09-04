#!/usr/bin/env bash
#
# stress-test.sh — prueba de estrés contra el BFF (login + endpoint protegido).
#
# Pide interactivamente: URL base, tenant, usuario, contraseña, endpoint a
# probar, concurrencia (usuarios simultáneos) y duración de la corrida.
# No pide requests/segundo: la tasa real la determina la concurrencia elegida
# y la latencia del servidor, igual que tráfico real.
#
# Requiere una de estas herramientas de carga (se detecta en ese orden):
#   hey   -> https://github.com/rakyll/hey
#   wrk   -> https://github.com/wg/wrk
# Si ninguna está instalada, cae a un fallback en bash puro con curl.

set -euo pipefail

# ---------- helpers ----------

prompt() {
  local __var="$1" __label="$2" __default="${3:-}" __value
  if [[ -n "$__default" ]]; then
    read -r -p "${__label} [${__default}]: " __value
    __value="${__value:-$__default}"
  else
    read -r -p "${__label}: " __value
  fi
  printf -v "$__var" '%s' "$__value"
}

prompt_secret() {
  local __var="$1" __label="$2" __value
  read -r -s -p "${__label}: " __value
  echo
  printf -v "$__var" '%s' "$__value"
}

require_number() {
  local __value="$1" __label="$2"
  if ! [[ "$__value" =~ ^[0-9]+$ ]] || [[ "$__value" -le 0 ]]; then
    echo "Error: '${__label}' debe ser un entero positivo (recibido: '${__value}')." >&2
    exit 1
  fi
}

# ---------- inputs ----------

echo "=== Prueba de estrés — premiumsoft_lite BFF ==="
echo

prompt BASE_URL "URL base de la API (ej: https://gensapi.ryancfx.click)"
BASE_URL="${BASE_URL%/}"

prompt TENANT "Tenant (header X-Tenant, ej: tenant1)"
prompt USUARIO "Usuario / email de login" "Administrator"
prompt_secret PASSWORD "Contraseña"

prompt ENDPOINT "Endpoint a probar bajo /api/v1 (ej: /catalog/items)" "/catalog/items"
[[ "$ENDPOINT" == /* ]] || ENDPOINT="/$ENDPOINT"

prompt METHOD "Método HTTP (GET/POST/PUT/DELETE)" "GET"
METHOD="$(echo "$METHOD" | tr '[:lower:]' '[:upper:]')"

BODY_FILE=""
if [[ "$METHOD" != "GET" && "$METHOD" != "DELETE" ]]; then
  prompt BODY_PATH "Ruta a archivo JSON con el body a enviar (vacío = {})" ""
  if [[ -n "$BODY_PATH" ]]; then
    if [[ ! -f "$BODY_PATH" ]]; then
      echo "Error: no existe el archivo '$BODY_PATH'." >&2
      exit 1
    fi
    BODY_FILE="$BODY_PATH"
  fi
fi

prompt CONCURRENCY "Usuarios concurrentes (conexiones simultáneas)" "10"
require_number "$CONCURRENCY" "usuarios concurrentes"

prompt DURATION "Duración de la prueba en segundos" "30"
require_number "$DURATION" "duración"

echo
echo "Resumen:"
echo "  URL:          ${BASE_URL}${ENDPOINT}"
echo "  Tenant:       ${TENANT}"
echo "  Usuario:      ${USUARIO}"
echo "  Método:       ${METHOD}"
echo "  Concurrencia: ${CONCURRENCY}"
echo "  Duración:     ${DURATION}s"
echo
read -r -p "¿Continuar? (s/N): " CONFIRM
[[ "$CONFIRM" =~ ^[sSyY]$ ]] || { echo "Cancelado."; exit 0; }

# ---------- login ----------

echo
echo "Iniciando sesión para obtener JWT..."

LOGIN_PAYLOAD=$(printf '{"email":"%s","password":"%s","tenant":"%s"}' \
  "$USUARIO" "$PASSWORD" "$TENANT")

LOGIN_RESPONSE=$(curl -sS -X POST "${BASE_URL}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "$LOGIN_PAYLOAD") || {
  echo "Error: falló la petición de login." >&2
  exit 1
}

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"access_token":"[^"]*"' | head -1 | cut -d'"' -f4)

if [[ -z "$TOKEN" ]]; then
  echo "Error: no se pudo extraer access_token. Respuesta del login:" >&2
  echo "$LOGIN_RESPONSE" >&2
  exit 1
fi

echo "Login OK, token obtenido."

TARGET_URL="${BASE_URL}/api/v1${ENDPOINT}"

# ---------- run ----------

echo
echo "Ejecutando prueba contra: ${TARGET_URL}"
echo

if command -v hey >/dev/null 2>&1; then
  echo "Usando 'hey' (concurrencia=${CONCURRENCY}, duración=${DURATION}s)..."
  HEY_ARGS=(-z "${DURATION}s" -c "$CONCURRENCY" -m "$METHOD"
    -H "Authorization: Bearer ${TOKEN}" -H "X-Tenant: ${TENANT}")
  if [[ -n "$BODY_FILE" ]]; then
    HEY_ARGS+=(-H "Content-Type: application/json" -D "$BODY_FILE")
  fi
  hey "${HEY_ARGS[@]}" "$TARGET_URL"

elif command -v wrk >/dev/null 2>&1; then
  echo "Usando 'wrk' (concurrencia=${CONCURRENCY}, duración=${DURATION}s)..."
  LUA_SCRIPT=$(mktemp /tmp/stress-test-wrk-XXXXXX.lua)
  trap 'rm -f "$LUA_SCRIPT"' EXIT
  {
    echo "wrk.method = \"${METHOD}\""
    echo "wrk.headers[\"Authorization\"] = \"Bearer ${TOKEN}\""
    echo "wrk.headers[\"X-Tenant\"] = \"${TENANT}\""
    if [[ -n "$BODY_FILE" ]]; then
      echo "wrk.headers[\"Content-Type\"] = \"application/json\""
      printf 'wrk.body = [==[\n%s\n]==]\n' "$(cat "$BODY_FILE")"
    fi
  } > "$LUA_SCRIPT"
  wrk -t "$(( CONCURRENCY < 4 ? CONCURRENCY : 4 ))" -c "$CONCURRENCY" \
    -d "${DURATION}s" -s "$LUA_SCRIPT" "$TARGET_URL"

else
  echo "Ni 'hey' ni 'wrk' están instalados — usando fallback en bash con curl."
  echo "(Instala 'hey' para métricas más precisas: https://github.com/rakyll/hey)"
  echo

  RESULTS_DIR=$(mktemp -d /tmp/stress-test-XXXXXX)
  trap 'rm -rf "$RESULTS_DIR"' EXIT
  END_TS=$(( $(date +%s) + DURATION ))

  worker() {
    local id="$1" count=0 errors=0
    local out="${RESULTS_DIR}/worker_${id}.count"
    while [[ "$(date +%s)" -lt "$END_TS" ]]; do
      local curl_args=(-sS -o /dev/null -w "%{http_code}\n" -X "$METHOD"
        -H "Authorization: Bearer ${TOKEN}" -H "X-Tenant: ${TENANT}")
      if [[ -n "$BODY_FILE" ]]; then
        curl_args+=(-H "Content-Type: application/json" --data-binary "@${BODY_FILE}")
      fi
      local code
      code=$(curl "${curl_args[@]}" "$TARGET_URL" || echo "000")
      count=$((count + 1))
      [[ "$code" =~ ^2 ]] || errors=$((errors + 1))
    done
    echo "${count} ${errors}" > "$out"
  }

  for ((i = 1; i <= CONCURRENCY; i++)); do
    worker "$i" &
  done
  wait

  TOTAL=0
  TOTAL_ERR=0
  for f in "${RESULTS_DIR}"/worker_*.count; do
    read -r c e < "$f"
    TOTAL=$((TOTAL + c))
    TOTAL_ERR=$((TOTAL_ERR + e))
  done

  echo
  echo "=== Resultado ==="
  echo "Requests totales:   ${TOTAL}"
  echo "Requests con error: ${TOTAL_ERR}"
  echo "Duración:           ${DURATION}s"
  echo "Throughput promedio: $(( TOTAL / DURATION )) req/s"
fi

echo
echo "Prueba finalizada."
