/**
 * Ambiente dos testes de integracao: roda ANTES de qualquer import do app (o `db` le a URL
 * ao carregar). Exige o banco de TESTE e recusa o de dev — o teste cria e desativa contas.
 */
const url = process.env.DATABASE_URL_TESTE;
if (!url) {
  throw new Error(
    "DATABASE_URL_TESTE ausente. Suba o Postgres (npm run db:up), aplique as migracoes no banco de teste e defina, por ex.: DATABASE_URL_TESTE=postgres://dev:dev@localhost:5442/lider_impacto_teste",
  );
}
if (!/teste/.test(new URL(url).pathname)) throw new Error("DATABASE_URL_TESTE precisa apontar para um banco *_teste.");

process.env.DATABASE_URL = url;
// Valores SO de teste (nada real): o segredo assina cookies e cifra a semente do TOTP do teste.
process.env.BETTER_AUTH_SECRET = "segredo-somente-de-teste-com-mais-de-32-caracteres";
process.env.BETTER_AUTH_URL = "http://localhost:3011";
process.env.PLATAFORMA_DOMINIO = "localhost";
// Sem SMTP no teste: nenhum e-mail sai.
delete process.env.SMTP_HOST;
// Video: segredos SO de teste e fila com prefixo proprio (um worker de dev no mesmo Redis nunca
// pega o job do teste).
process.env.VIDEO_CHAVE_MESTRA = Buffer.alloc(32, 7).toString("base64");
process.env.VIDEO_SEGREDO_TOKEN = "segredo-de-token-de-video-somente-de-teste";
process.env.VIDEO_FILA_PREFIXO = "li-teste";
delete process.env.VIDEO_LIMITE_SESSOES;
// Assistente (ADR-0014): o teste NUNCA chama a API real (o .env local pode ter a chave). Quem precisa
// de modelo injeta o ClienteFalso; sem chave, a rota responde "IA não configurada".
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ASSISTENTE_TETO_DIARIO_CRIADOR;
// Stripe (ADR-0019): o teste NUNCA chama a API real (o .env local pode ter a chave). Quem precisa usa o
// StripeFalso; o segredo do webhook é SÓ de teste (assina os eventos que o próprio teste monta).
delete process.env.STRIPE_SECRET_KEY;
process.env.STRIPE_WEBHOOK_SECRET = "whsec_somente_de_teste_nao_e_real";
