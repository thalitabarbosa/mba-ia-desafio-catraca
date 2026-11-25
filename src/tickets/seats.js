// R05 — vagas ocupadas = pendentes + confirmados. Sem dependências de outras features
// para poder ser usado tanto por events/ (edição de lotação) quanto por tickets/ (compra).
export async function occupiedSeats(client, eventId) {
  const { rows } = await client.query(
    `SELECT count(*) AS n FROM tickets WHERE event_id = $1 AND status IN ('pending', 'confirmed')`,
    [eventId],
  );
  return rows[0].n;
}
