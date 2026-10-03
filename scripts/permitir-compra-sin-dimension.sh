#!/usr/bin/env bash
# Activa `permiteCompraSinDimension` en los artículos, uno por uno, por código de artículo
# (PUT /catalog/items/:codigo { "permiteCompraSinDimension": true }).
#
# Uso:
#   API_URL=https://jade.gensuite.do/api/v1 TENANT=tenant1 EMAIL=admin@x.com PASSWORD=*** \
#     ./scripts/permitir-compra-sin-dimension.sh [--dry-run] [--todos] [--codigos=A,B,C]
#
# Por defecto solo toca artículos con `usaDimensiones: true` (único caso donde el flag tiene efecto).
# --todos: todos los artículos. --codigos=: limita a esos códigos. --dry-run: no modifica nada.
# Requiere curl y jq.

set -uo pipefail

API_URL="${API_URL:-http://localhost:5195/api/v1}"
API_URL="${API_URL%/}"
TENANT="${TENANT:-}"
PAGE_SIZE=100
DRY_RUN=0; TODOS=0; CODIGOS=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --todos) TODOS=1 ;;
    --codigos=*) CODIGOS="${arg#--codigos=}" ;;
    *) echo "Argumento desconocido: $arg" >&2; exit 1 ;;
  esac
done

: "${EMAIL:?Falta EMAIL}"
: "${PASSWORD:?Falta PASSWORD}"
command -v jq >/dev/null || { echo "Requiere jq" >&2; exit 1; }

TENANT_HEADER=()
[ -n "$TENANT" ] && TENANT_HEADER=(-H "X-Tenant: $TENANT")

echo "Iniciando sesión en $API_URL${TENANT:+ (tenant $TENANT)}$([ $DRY_RUN = 1 ] && echo ' — DRY RUN')"
LOGIN_BODY=$(jq -n --arg e "$EMAIL" --arg p "$PASSWORD" --arg t "$TENANT" \
  '{email:$e,password:$p,tenant:(if $t=="" then null else $t end)}')
LOGIN=$(curl -sS -X POST "$API_URL/auth/login" -H 'Content-Type: application/json' "${TENANT_HEADER[@]}" -d "$LOGIN_BODY")
[ "$(jq -r '.data.mfaRequired // false' <<<"$LOGIN")" = "true" ] && { echo "El usuario tiene 2FA; usa una cuenta sin MFA." >&2; exit 1; }
TOKEN=$(jq -r '.data.access_token // empty' <<<"$LOGIN")
[ -z "$TOKEN" ] && { echo "Login fallido: $(jq -r '.error.message // .message // "sin access_token (define TENANT)"' <<<"$LOGIN")" >&2; exit 1; }

# Lista todos los artículos (paginado) → un JSON por línea
ITEMS=""
offset=0
while :; do
  PAGE=$(curl -sS "$API_URL/catalog/items?limit=$PAGE_SIZE&offset=$offset" \
    -H "Authorization: Bearer $TOKEN" "${TENANT_HEADER[@]}")
  COUNT=$(jq '.data | length' <<<"$PAGE" 2>/dev/null) || { echo "Respuesta inválida al listar: $PAGE" >&2; exit 1; }
  ITEMS+=$(jq -c '.data[]' <<<"$PAGE")$'\n'
  [ "$(jq -r '.meta.hasMore // false' <<<"$PAGE")" = "true" ] && [ "$COUNT" -gt 0 ] || break
  offset=$((offset + PAGE_SIZE))
done
echo "$(grep -c . <<<"$ITEMS") artículos en el catálogo"

if [ -n "$CODIGOS" ]; then
  FILTRO='select(.id as $id | ($c | split(",") | map(gsub("^\\s+|\\s+$";"")) | index($id)) != null)'
elif [ $TODOS = 1 ]; then
  FILTRO='.'
else
  FILTRO='select(.usaDimensiones == true)'
fi

ok=0; ya=0; err=0
while IFS=$'\t' read -r codigo activo; do
  [ -z "$codigo" ] && continue
  if [ "$activo" = "true" ]; then ya=$((ya + 1)); continue; fi
  if [ $DRY_RUN = 1 ]; then echo "  [dry-run] $codigo"; ok=$((ok + 1)); continue; fi
  ENC=$(jq -rn --arg c "$codigo" '$c|@uri')
  RESP=$(curl -sS -w '\n%{http_code}' -X PUT "$API_URL/catalog/items/$ENC" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' "${TENANT_HEADER[@]}" \
    -d '{"permiteCompraSinDimension":true}')
  STATUS="${RESP##*$'\n'}"; BODY="${RESP%$'\n'*}"
  if [ "$STATUS" -ge 200 ] && [ "$STATUS" -lt 300 ]; then
    echo "  ✓ $codigo"; ok=$((ok + 1))
  else
    echo "  ✗ $codigo: $(jq -r '.error.message // .message // "HTTP '"$STATUS"'"' <<<"$BODY" 2>/dev/null || echo "HTTP $STATUS")" >&2
    err=$((err + 1))
  fi
done < <(jq -r --arg c "$CODIGOS" "$FILTRO | [.id, (.permiteCompraSinDimension // false)] | @tsv" <<<"$ITEMS")

echo
echo "$([ $DRY_RUN = 1 ] && echo 'Se actualizarían' || echo 'Actualizados'): $ok · ya activos: $ya · errores: $err"
[ $err -eq 0 ]
