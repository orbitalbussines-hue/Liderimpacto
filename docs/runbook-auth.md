# Runbook — login e conta

Curto de propósito. Decisões: [ADR-0003](adr/0003-autenticacao-plataforma.md). Régua:
[`seguranca-login.md`](seguranca-login.md). Conexão (nunca cole a senha no chat/ticket):
`psql "$DATABASE_URL"`.

## 1. Rodar o seed (primeiro SUPER_ADMIN e dono do primeiro criador)

Só à mão, nunca no entrypoint. Idempotente; não grava senha.

```bash
SEED_SUPER_ADMIN_EMAIL=voce@exemplo.com SEED_DONO_EMAIL=dono@exemplo.com SEED_DONO_NOME="Nome do Dono" \
DATABASE_URL=... BETTER_AUTH_SECRET=... BETTER_AUTH_URL=https://liderdeimpacto.com.br PLATAFORMA_DOMINIO=liderdeimpacto.com.br \
npm run db:seed
```

Imprime um link de primeiro acesso por conta sem senha (24 h, uso único). Entregue cada um só ao
dono da conta, por canal privado. Rodar de novo gera links novos e invalida os anteriores.

## 2. Gerar link de senha para alguém (primeiro acesso ou esqueceu)

- Pela tela da equipe (próximo passo): action `acaoGerarLinkDeSenha({ usuarioId, motivo })`
  (`src/lib/actions/usuarios-senha.ts`). O link aparece uma vez; ninguém define a senha do outro.
- Quem pode para quem: RN-102 (`docs/regras-negocio.md`). Fora disso, um SUPER_ADMIN gera.
- Com SMTP configurado, a própria pessoa usa "Esqueci a senha" (link de 30 min por e-mail).

## 3. Destravar conta bloqueada

O bloqueio some sozinho em 15 min. Para liberar antes (a pessoa lembrou a senha):

```sql
update usuarios set falhas_login = 0, bloqueado_ate = null where id = '<id>';
update usuarios_totp set falhas_verificacao = 0, bloqueado_ate = null where usuario_id = '<id>';
```

Antes, confira na trilha se é a pessoa errando ou um ataque:

```sql
select acao, detalhes, criador_id, created_at from auditoria
where registro_id = '<id>' and acao in ('login_recusado','conta_bloqueada') order by created_at desc limit 50;
```

## 4. Derrubar as sessões de uma conta

```sql
update usuarios_sessoes set expira_em = now() where usuario_id = '<id>';
```

No código: `expirarSessoesDe` (`src/lib/auth/sessao.ts`).

## 5. SUPER_ADMIN perdeu o celular do autenticador

Entra com um código de recuperação e gera novos em Conta › Segurança. Sem códigos, outro
SUPER_ADMIN registra o motivo na trilha e volta a conta ao cadastro do TOTP:

```sql
update usuarios set two_factor_enabled = false where id = '<id>';
update usuarios_totp set verificado = false where usuario_id = '<id>';
update usuarios_sessoes set expira_em = now() where usuario_id = '<id>';
```

e gera um link de senha novo para a pessoa (seção 2): quem roubou senha + celular não chega antes
dela ao recadastro.

## 6. Rotacionar o `BETTER_AUTH_SECRET`

Ele assina os cookies e cifra a semente do TOTP e os códigos de recuperação. Trocar derruba todas
as sessões. Use `BETTER_AUTH_SECRETS="2:<nova>,1:<atual>"` mantendo `BETTER_AUTH_SECRET` atual até
todos os SUPER_ADMIN recadastrarem o TOTP (a semente antiga só abre pela chave antiga).

## 7. Infra (VPS)

- DNS e certificado **curinga** (`*.liderdeimpacto.com.br`) + o apex.
- nginx: `proxy_set_header Host $host;` (o host decide o criador) e
  `proxy_set_header X-Real-IP $remote_addr;` (o IP dos tetos sai daqui, `src/lib/auth/ip.ts`).
- `BETTER_AUTH_URL=https://liderdeimpacto.com.br`, `PLATAFORMA_DOMINIO=liderdeimpacto.com.br`.

## 8. Dados e sessão de demonstração (SÓ DESENVOLVIMENTO)

Para conferir as telas logadas sem digitar senha. Os dois scripts recusam rodar com
`NODE_ENV=production` ou com `DATABASE_URL` fora do localhost.

```bash
npm run seed:demo                      # criador `demo` (demo.localhost:3011), DONO e ALUNO sem senha, 3 produtos, progresso, favoritos, Top 10
npm run sessao:demo                    # imprime o cookie `li.session_token=...` do aluno e do dono
npm run sessao:demo -- cookies.json    # idem, gravando { host, aluno, dono } (fora do repo)
```

- `seed:demo` é idempotente (procura cada peça pela chave natural). Capas geradas com FFmpeg e
  enviadas ao storage local pela URL assinada.
- `sessao:demo` passa pelo mesmo funil das entradas reais (`ajustesSeAutorizada`: conta ativa,
  área do host, vínculo ativo, teto de 12 h) e grava na trilha "Sessão de DESENVOLVIMENTO ...".
  Ociosa por 1 h, expira: rode de novo. Outro host: `DEMO_HOST=<slug>.localhost:3011`.
- Usar: cookie no navegador (DevTools > Application > Cookies, host `demo.localhost:3011`) ou
  `curl -H "Host: demo.localhost:3011" -H "Cookie: <nome=valor>" http://127.0.0.1:3011/`.

## Pendências da régua (abertas nesta fase)

- 2FA obrigatório para todos e passkey (hoje só SUPER_ADMIN, só TOTP) — desvio autorizado.
- Cabeçalhos de borda (HSTS, CSP/frame-ancestors, Permissions-Policy) e `Cache-Control: no-store`
  nas respostas autenticadas.
- Revogar `UPDATE`/`DELETE` da tabela `auditoria` do usuário de banco da aplicação em produção.
- Encerrar UMA sessão específica pela tela (hoje: "encerrar as outras").
- Aviso ao dono quando a conta é bloqueada (hoje só a trilha registra).
