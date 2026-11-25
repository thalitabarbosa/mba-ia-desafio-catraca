#!/usr/bin/env bash
# Funções compartilhadas pelo evaluator-flow.sh e pelos contratos das features.
# Uso: source scripts/lib/flow.sh
# Depende só de bash, curl e node (o que a máquina do avaliador tem).

WEB=${WEB:-http://localhost:3000}
API=${API:-http://localhost:3000}
KEY=${KEY:-catraca-parceiro-dev}
JARS=${JARS:-$(mktemp -d)}
PASS_COUNT=0
FAIL_COUNT=0

# ---------- utilitários ----------

# http <curl args...>  -> define CODE e BODY (não chame dentro de $(...))
http() {
  local out
  out=$(curl -s -w $'\n%{http_code}' "$@")
  CODE=${out##*$'\n'}
  BODY=${out%$'\n'*}
}

jar() { echo "$JARS/$1.txt"; }

now_s() { date +%s; }

# future_local DIAS -> "YYYY-MM-DDT21:00" no horário de São Paulo (DIAS pode ser negativo)
future_local() {
  node -e '
    const d = new Date(Date.now() + Number(process.argv[1]) * 864e5 - 3 * 3600e3);
    const p = n => String(n).padStart(2, "0");
    console.log(`${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T21:00`);
  ' -- "$1"
}

# json CAMPO  (lê JSON do stdin e imprime o campo de topo)
json() {
  node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      try { const v = JSON.parse(s)[process.argv[1]]; console.log(v === undefined ? "" : v); }
      catch { console.log(""); }
    });' "$1"
}

# listing_field EVENT_ID CAMPO  (lê a listagem da API do stdin)
listing_field() {
  node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      try { const e = JSON.parse(s).find(x => x.id === process.argv[1]); console.log(e ? e[process.argv[2]] : "ABSENT"); }
      catch { console.log("INVALID_JSON"); }
    });' "$1" "$2"
}

# html_attr_text HTML_FILE_CONTENT MARCADOR -> texto do primeiro elemento com o marcador
metric_from() { sed -n "s/.*data-metric=\"$1\"[^>]*>[[:space:]]*\([^<]*\)<.*/\1/p" | head -n1 | sed 's/[[:space:]]*$//'; }

# ---------- verificações ----------

ok()   { PASS_COUNT=$((PASS_COUNT + 1)); printf '  \033[32mPASS\033[0m %s\n' "$1"; }
bad()  { FAIL_COUNT=$((FAIL_COUNT + 1)); printf '  \033[31mFAIL\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '       %s\n' "$2"; }

expect_eq() { # expect_eq DESCRIÇÃO OBTIDO ESPERADO
  if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1" "esperado: [$3]  obtido: [$2]"; fi
}
expect_contains() { # expect_contains DESCRIÇÃO TEXTO TRECHO
  if printf '%s' "$2" | grep -qF -- "$3"; then ok "$1"; else bad "$1" "não encontrei: [$3]"; fi
}
expect_not_contains() {
  if printf '%s' "$2" | grep -qF -- "$3"; then bad "$1" "encontrei o que não devia: [$3]"; else ok "$1"; fi
}

# wait_until SEGUNDOS comando...  -> 0 se o comando passar dentro do prazo
wait_until() {
  local limit=$1; shift
  local start; start=$(now_s)
  while true; do
    if "$@"; then return 0; fi
    [ $(( $(now_s) - start )) -ge "$limit" ] && return 1
    sleep 0.5
  done
}

summary() {
  echo
  echo "Resultado: $PASS_COUNT PASS, $FAIL_COUNT FAIL"
  [ "$FAIL_COUNT" -eq 0 ]
}

# ---------- web ----------

web_login() { # web_login PERFIL EMAIL SENHA -> imprime http code
  rm -f "$(jar "$1")"
  curl -s -o /dev/null -w '%{http_code}' -c "$(jar "$1")" -b "$(jar "$1")" \
    -X POST "$WEB/login" --data-urlencode "email=$2" --data-urlencode "password=$3"
}

web_signup() { # web_signup PERFIL NOME EMAIL SENHA -> http code
  rm -f "$(jar "$1")"
  curl -s -o /dev/null -w '%{http_code}' -c "$(jar "$1")" -b "$(jar "$1")" \
    -X POST "$WEB/signup" --data-urlencode "name=$2" --data-urlencode "email=$3" --data-urlencode "password=$4"
}

web_get() { # web_get PERFIL CAMINHO -> define CODE/BODY (PERFIL "-" = deslogado)
  if [ "$1" = "-" ]; then http "$WEB$2"; else http -b "$(jar "$1")" -c "$(jar "$1")" "$WEB$2"; fi
}

# org_create PERFIL NOME STARTS_AT LOCAL LOTAÇÃO PREÇO -> imprime o id do evento ou ERR:<code>
org_create() {
  local out
  out=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -b "$(jar "$1")" -c "$(jar "$1")" \
    -X POST "$WEB/organizer/events" \
    --data-urlencode "name=$2" --data-urlencode "startsAt=$3" --data-urlencode "venue=$4" \
    --data-urlencode "capacity=$5" --data-urlencode "price=$6")
  case "$out" in
    303\ *|302\ *) echo "${out##*/organizer/events/}" ;;
    *) echo "ERR:${out%% *}" ;;
  esac
}

org_edit() { # org_edit PERFIL ID NOME STARTS_AT LOCAL LOTAÇÃO PREÇO -> http code
  curl -s -o /dev/null -w '%{http_code}' -b "$(jar "$1")" -c "$(jar "$1")" \
    -X POST "$WEB/organizer/events/$2" \
    --data-urlencode "name=$3" --data-urlencode "startsAt=$4" --data-urlencode "venue=$5" \
    --data-urlencode "capacity=$6" --data-urlencode "price=$7"
}

org_publish() { curl -s -o /dev/null -w '%{http_code}' -b "$(jar "$1")" -X POST "$WEB/organizer/events/$2/publish"; }
org_cancel()  { curl -s -o /dev/null -w '%{http_code}' -b "$(jar "$1")" -X POST "$WEB/organizer/events/$2/cancel"; }

org_checkin() { # org_checkin PERFIL ID CODIGO -> mensagem exibida
  local page
  page=$(curl -s -b "$(jar "$1")" -X POST "$WEB/organizer/events/$2/checkin" --data-urlencode "code=$3")
  local msg
  msg=$(printf '%s' "$page" | sed -n 's/.*<p id="checkin-result"[^>]*>[[:space:]]*\([^<]*\)<.*/\1/p' | head -n1 | sed 's/[[:space:]]*$//')
  if [ -z "$msg" ] && printf '%s' "$page" | grep -qF 'Evento cancelado'; then msg="Evento cancelado"; fi
  echo "$msg"
}

panel() { # panel PERFIL ID MÉTRICA -> valor
  curl -s -b "$(jar "$1")" "$WEB/organizer/events/$2" | metric_from "$3"
}

web_buy() { # web_buy PERFIL ID CARTÃO -> define CODE/BODY
  http -b "$(jar "$1")" -c "$(jar "$1")" -X POST "$WEB/events/$2/purchase" --data-urlencode "cardNumber=$3"
}

my_tickets() { # my_tickets PERFIL -> linhas "CODIGO STATUS"
  curl -s -b "$(jar "$1")" "$WEB/my-tickets" \
    | grep -o 'data-ticket-code="[^"]*"[^>]*data-status="[^"]*"' \
    | sed 's/data-ticket-code="\([^"]*\)".*data-status="\([^"]*\)"/\1 \2/'
}

# ---------- API ----------

api_list()   { curl -s -H "X-Api-Key: ${1:-$KEY}" "$API/api/partner/events"; }
api_buy()    { # api_buy EVENT EMAIL CARTÃO [CHAVE] -> CODE/BODY
  http -X POST "$API/api/partner/events/$1/purchases" -H "X-Api-Key: ${4:-$KEY}" \
    -H "Content-Type: application/json" -d "{\"buyerEmail\":\"$2\",\"cardNumber\":\"$3\"}"
}
api_ticket() { curl -s -H "X-Api-Key: $KEY" "$API/api/partner/tickets/$1"; }
ticket_status() { api_ticket "$1" | json status; }
ticket_is() { [ "$(ticket_status "$1")" = "$2" ]; }
seats() { api_list | listing_field "$1" availableSeats; }

# burst EVENT -> imprime "N202 N409" para 30 compras simultâneas (comando do brief)
burst() {
  local out
  out=$(seq 30 | xargs -P 30 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST "$API/api/partner/events/$1/purchases" \
    -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
    -d '{"buyerEmail":"carga{}@example.com","cardNumber":"4000000000000001"}' | sort | uniq -c)
  local c202 c409
  c202=$(printf '%s\n' "$out" | awk '$2=="202"{print $1}'); c409=$(printf '%s\n' "$out" | awk '$2=="409"{print $1}')
  echo "${c202:-0} ${c409:-0}"
}

# ---------- credenciais da seed ----------
ORG_A_EMAIL=${ORG_A_EMAIL:-organizador.a@catraca.dev}
ORG_B_EMAIL=${ORG_B_EMAIL:-organizador.b@catraca.dev}
PART_EMAIL=${PART_EMAIL:-participante@catraca.dev}
SEED_PASS=${SEED_PASS:-catraca123}
