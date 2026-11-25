#!/usr/bin/env bash
# Automatiza os passos 2–16 do "Fluxo do avaliador" do brief contra um produto já no ar.
# Com --harness, também verifica os passos 1 e 17 (gates, derrubar, subir de novo).
#
# Uso:  npm run flow            (produto precisa estar no ar: npm run up)
#       npm run flow -- --harness
# Leva ~3 minutos por causa dos cartões lentos (30–40 s). Sai com código != 0 se algo falhar.

set -u
cd "$(dirname "$0")/.."
source scripts/lib/flow.sh

RUN=$(date +%s)
HARNESS=0
[ "${1:-}" = "--harness" ] && HARNESS=1

step() { echo; echo "== $1"; }

step "1. Produto no ar"
http "$WEB/health"
expect_eq "GET /health" "$CODE" "200"
if [ "$CODE" != "200" ]; then echo "Produto fora do ar. Rode: npm run up"; exit 1; fi

# ---------------------------------------------------------------- 2
step "2. Rascunho fora da vitrine e da API (R02)"
expect_eq "login organizador A" "$(web_login A "$ORG_A_EMAIL" "$SEED_PASS")" "303"
E1_NAME="E1 Jazz $RUN"
E1=$(org_create A "$E1_NAME" "$(future_local 30)" "Porão" 2 "100,00")
case "$E1" in ERR:*) bad "criar E1" "$E1"; summary; exit 1 ;; *) ok "criar E1 ($E1)";; esac
web_get - /
expect_not_contains "vitrine deslogada não mostra E1" "$BODY" "data-event-id=\"$E1\""
expect_eq "API não lista E1" "$(api_list | listing_field "$E1" id)" "ABSENT"

# ---------------------------------------------------------------- 3
step "3. Data no passado rejeitada (R01)"
R=$(org_create A "Ontem $RUN" "$(future_local -1)" "Bar" 10 "10,00")
expect_eq "criar evento com data de ontem" "$R" "ERR:422"

# ---------------------------------------------------------------- 4
step "4. Publicar E1 (R02)"
expect_eq "publicar E1" "$(org_publish A "$E1")" "303"
web_get - /
expect_contains "vitrine mostra E1" "$BODY" "data-event-id=\"$E1\""
LIST=$(api_list)
expect_eq "API availableSeats E1" "$(printf '%s' "$LIST" | listing_field "$E1" availableSeats)" "2"
expect_eq "API priceCents E1" "$(printf '%s' "$LIST" | listing_field "$E1" priceCents)" "10000"

# ---------------------------------------------------------------- 5
step "5. Compra na vitrine (R06, R08, R09)"
P_EMAIL="participante.$RUN@example.com"
expect_eq "cadastro de participante" "$(web_signup P "Pessoa $RUN" "$P_EMAIL" "senha12345")" "303"
web_buy P "$E1" 4000000000000001
expect_eq "compra na vitrine redireciona" "$CODE" "303"
FIRST=$(my_tickets P | head -n1)
C1=${FIRST%% *}
expect_eq "Meus ingressos: nasce pendente" "${FIRST##* }" "pending"
web_get P /my-tickets
expect_contains "Meus ingressos mostra o evento" "$BODY" "$E1_NAME"
expect_contains "Meus ingressos mostra o código" "$BODY" "$C1"
c1_confirmed() { my_tickets P | grep -q "^$C1 confirmed$"; }
if wait_until 5 c1_confirmed; then ok "C1 confirmado em até 5 s"; else bad "C1 confirmado em até 5 s"; fi

# ---------------------------------------------------------------- 6
step "6. Compra pela API com cartão lento recusado"
T6_START=$(now_s)
api_buy "$E1" t2@example.com 4000000000000004
expect_eq "POST compra (0004) status" "$CODE" "202"
expect_eq "POST compra (0004) pending" "$(printf '%s' "$BODY" | json status)" "pending"
T2=$(printf '%s' "$BODY" | json ticketId); C2=$(printf '%s' "$BODY" | json code)
expect_eq "availableSeats E1 após T2" "$(seats "$E1")" "0"

# ---------------------------------------------------------------- 7
step "7. Esgotado enquanto T2 está pendente (R05, R07)"
api_buy "$E1" t-extra@example.com 4000000000000001
expect_eq "API sem vaga -> 409" "$CODE" "409"
expect_eq "API sem vaga -> sold_out" "$(printf '%s' "$BODY" | json error)" "sold_out"
web_get P "/events/$E1"
expect_contains "vitrine exibe Ingressos esgotados" "$BODY" "Ingressos esgotados"
[ $(( $(now_s) - T6_START )) -lt 30 ] && ok "passo 7 feito antes de 30 s" || bad "passo 7 feito antes de 30 s"

# ---------------------------------------------------------------- 8
step "8. Recusa libera a vaga (R08) — aguardando 45 s do passo 6"
while [ $(( $(now_s) - T6_START )) -lt 45 ]; do sleep 1; done
expect_eq "T2 declined" "$(ticket_status "$T2")" "declined"
expect_eq "availableSeats E1 volta a 1" "$(seats "$E1")" "1"
api_buy "$E1" t3@example.com 4000000000000001
expect_eq "compra T3" "$CODE" "202"
T3=$(printf '%s' "$BODY" | json ticketId)
if wait_until 5 ticket_is "$T3" confirmed; then ok "T3 confirmed em até 5 s"; else bad "T3 confirmed em até 5 s"; fi

# ---------------------------------------------------------------- 9
step "9. Lotação, preço e painel (R03, R12)"
E1_DATE=$(future_local 30)
expect_eq "reduzir lotação para 1 é rejeitado" "$(org_edit A "$E1" "$E1_NAME" "$E1_DATE" "Porão" 1 "100,00")" "422"
expect_eq "preço 150 e lotação 3 aceito" "$(org_edit A "$E1" "$E1_NAME" "$E1_DATE" "Porão" 3 "150,00")" "303"
api_buy "$E1" t4@example.com 4000000000000001
T4=$(printf '%s' "$BODY" | json ticketId)
if wait_until 6 ticket_is "$T4" confirmed; then ok "T4 confirmed"; else bad "T4 confirmed"; fi
expect_eq "painel Confirmados" "$(panel A "$E1" confirmed)" "3"
expect_eq "painel Pendentes" "$(panel A "$E1" pending)" "0"
expect_eq "painel Check-ins" "$(panel A "$E1" checkins)" "0"
expect_eq "painel Vagas disponíveis" "$(panel A "$E1" available)" "0"
expect_eq "painel Receita" "$(panel A "$E1" revenue)" "R\$ 350,00"
expect_eq "painel Estornados" "$(panel A "$E1" refunded)" "0"

# ---------------------------------------------------------------- 10
step "10. Check-in (R10)"
expect_eq "C1" "$(org_checkin A "$E1" "$C1")" "Entrada liberada"
expect_eq "C1 de novo" "$(org_checkin A "$E1" "$C1")" "Ingresso já utilizado"
expect_eq "C2" "$(org_checkin A "$E1" "$C2")" "Ingresso não confirmado"
expect_eq "ZZZZZZZZ" "$(org_checkin A "$E1" ZZZZZZZZ)" "Ingresso inválido para este evento"
expect_eq "painel Check-ins" "$(panel A "$E1" checkins)" "1"

# ---------------------------------------------------------------- 11
step "11. Isolamento entre organizadores e papéis (R13)"
expect_eq "login organizador B" "$(web_login B "$ORG_B_EMAIL" "$SEED_PASS")" "303"
web_get B /organizer
expect_not_contains "lista de B não mostra E1" "$BODY" "$E1"
web_get B "/organizer/events/$E1"
expect_not_contains "B no endereço de E1: sem nome" "$BODY" "$E1_NAME"
expect_not_contains "B no endereço de E1: sem painel" "$BODY" "data-metric="
E2=$(org_create B "E2 B $RUN" "$(future_local 30)" "Bar do B" 1 "20,00")
expect_eq "B publica E2" "$(org_publish B "$E2")" "303"
expect_eq "E2 na API" "$(api_list | listing_field "$E2" id)" "$E2"
api_buy "$E2" c3@example.com 4000000000000001
C3=$(printf '%s' "$BODY" | json code)
expect_eq "login participante da seed" "$(web_login S "$PART_EMAIL" "$SEED_PASS")" "303"
web_get S "/organizer/events/$E1"
expect_not_contains "participante no endereço de E1: sem nome" "$BODY" "$E1_NAME"
web_get - "/organizer/events/$E1"
expect_not_contains "visitante no endereço de E1: sem nome" "$BODY" "$E1_NAME"
expect_eq "C3 (de E2) no check-in de E1" "$(org_checkin A "$E1" "$C3")" "Ingresso inválido para este evento"

# ---------------------------------------------------------------- 12
step "12. Cancelamento com pendente e confirmado"
E3=$(org_create A "E3 $RUN" "$(future_local 30)" "Clube" 5 "50,00")
expect_eq "publicar E3" "$(org_publish A "$E3")" "303"
T5_START=$(now_s)
api_buy "$E3" t5@example.com 4000000000000003; T5=$(printf '%s' "$BODY" | json ticketId)
api_buy "$E3" t6@example.com 4000000000000001; T6=$(printf '%s' "$BODY" | json ticketId); C6=$(printf '%s' "$BODY" | json code)
if wait_until 6 ticket_is "$T6" confirmed; then ok "T6 confirmed"; else bad "T6 confirmed"; fi
[ $(( $(now_s) - T5_START )) -lt 30 ] && ok "cancelando antes de 30 s de T5" || bad "cancelando antes de 30 s de T5"
expect_eq "cancelar E3" "$(org_cancel A "$E3")" "303"

# ---------------------------------------------------------------- 13
step "13. Efeitos do cancelamento (R11)"
web_get - /
expect_not_contains "E3 fora da vitrine" "$BODY" "data-event-id=\"$E3\""
expect_eq "E3 fora da API" "$(api_list | listing_field "$E3" id)" "ABSENT"
api_buy "$E3" t7@example.com 4000000000000001
expect_eq "compra em E3 -> 404" "$CODE" "404"
expect_eq "compra em E3 -> event_not_available" "$(printf '%s' "$BODY" | json error)" "event_not_available"
if wait_until 10 ticket_is "$T6" refunded; then ok "T6 refunded em até 10 s"; else bad "T6 refunded em até 10 s"; fi
if wait_until 10 ticket_is "$T5" cancelled; then ok "T5 cancelled em até 10 s"; else bad "T5 cancelled em até 10 s"; fi
web_get A "/organizer/events/$E3"
expect_not_contains "página de E3 sem formulário de edição" "$BODY" 'id="edit-form"'
R=$(org_edit A "$E3" "E3 editado" "$(future_local 30)" "Clube" 9 "50,00")
[ "$R" != "303" ] && ok "editar E3 cancelado é rejeitado ($R)" || bad "editar E3 cancelado é rejeitado" "obtido 303"

# ---------------------------------------------------------------- 14
step "14. Resposta tardia do gateway não muda nada — aguardando 45 s de T5"
while [ $(( $(now_s) - T5_START )) -lt 45 ]; do sleep 1; done
expect_eq "T5 continua cancelled" "$(ticket_status "$T5")" "cancelled"
expect_eq "check-in C6 em E3" "$(org_checkin A "$E3" "$C6")" "Evento cancelado"
expect_eq "painel E3 Confirmados" "$(panel A "$E3" confirmed)" "0"
expect_eq "painel E3 Pendentes" "$(panel A "$E3" pending)" "0"
expect_eq "painel E3 Check-ins" "$(panel A "$E3" checkins)" "0"
expect_eq "painel E3 Vagas" "$(panel A "$E3" available)" "0"
expect_eq "painel E3 Receita" "$(panel A "$E3" revenue)" "R\$ 0,00"
expect_eq "painel E3 Estornados" "$(panel A "$E3" refunded)" "1"

# ---------------------------------------------------------------- 15
step "15. 30 compras simultâneas, duas rodadas (R07)"
for N in 4 5; do
  EV=$(org_create A "E$N carga $RUN" "$(future_local 30)" "Galpão" 5 "10,00")
  org_publish A "$EV" >/dev/null
  expect_eq "E$N: 202 e 409" "$(burst "$EV")" "5 25"
  p5() { [ "$(panel A "$EV" confirmed)" = "5" ]; }
  if wait_until 10 p5; then ok "E$N painel Confirmados 5"; else bad "E$N painel Confirmados 5"; fi
  expect_eq "E$N painel Vagas" "$(panel A "$EV" available)" "0"
done

# ---------------------------------------------------------------- 16
step "16. Erros da API"
for R in "GET /api/partner/events" "POST /api/partner/events/$E1/purchases" "GET /api/partner/tickets/$T3"; do
  M=${R%% *}; P=${R#* }
  http -X "$M" "$API$P" -H "Content-Type: application/json" -d '{}'
  expect_eq "$M $P sem chave" "$CODE $(printf '%s' "$BODY" | json error)" "401 unauthorized"
  http -X "$M" "$API$P" -H "X-Api-Key: errada" -H "Content-Type: application/json" -d '{}'
  expect_eq "$M $P chave errada" "$CODE $(printf '%s' "$BODY" | json error)" "401 unauthorized"
done
api_buy "$E1" x@example.com 123
expect_eq "cardNumber 123" "$CODE $(printf '%s' "$BODY" | json error)" "422 invalid_request"
http -H "X-Api-Key: $KEY" "$API/api/partner/tickets/tkt_naoexiste"
expect_eq "ticket inexistente" "$CODE $(printf '%s' "$BODY" | json error)" "404 ticket_not_found"

# ---------------------------------------------------------------- 17
if [ "$HARNESS" = 1 ]; then
  step "17. Gates, derrubar e subir de novo"
  if npm run --silent gates >/tmp/catraca-gates.log 2>&1; then ok "npm run gates"; else bad "npm run gates" "veja /tmp/catraca-gates.log"; fi
  npm run --silent down >/dev/null 2>&1
  curl -s -m 3 "$WEB/health" >/dev/null && bad "porta 3000 fechada após down" || ok "porta 3000 fechada após down"
  expect_eq "nenhum container do projeto" "$(docker ps -q --filter label=com.docker.compose.project=catraca | wc -l | tr -d ' ')" "0"
  if npm run --silent up >/tmp/catraca-up.log 2>&1; then ok "subir de novo"; else bad "subir de novo" "veja /tmp/catraca-up.log"; fi
  expect_eq "credencial da seed após re-subida" "$(web_login A "$ORG_A_EMAIL" "$SEED_PASS")" "303"
fi

summary
