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
