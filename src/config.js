const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const config = {
  databaseUrl: process.env.DATABASE_URL || 'postgres://catraca:catraca@localhost:5432/catraca',
  port: num(process.env.PORT, 3000),
  sessionSecret: process.env.SESSION_SECRET || 'catraca-dev-session',
  partnerApiKey: process.env.PARTNER_API_KEY || 'catraca-parceiro-dev',
  gatewayMode: process.env.GATEWAY_MODE || 'simulated',
  gatewayDelayScale: num(process.env.GATEWAY_DELAY_SCALE, 1),
};

if (config.gatewayMode !== 'simulated') {
  throw new Error(`GATEWAY_MODE "${config.gatewayMode}" não suportado: só "simulated" existe neste MVP`);
}
if (!(config.gatewayDelayScale >= 0)) {
  throw new Error('GATEWAY_DELAY_SCALE precisa ser um número >= 0');
}
