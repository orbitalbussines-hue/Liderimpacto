# ADR-0003: Autenticação da plataforma multi-criador (Better Auth, cookie por host, 2FA só do SUPER_ADMIN)

- **Status**: Aceito
- **Data**: 2026-10-13
- **Decisores**: Paulo (Bah! Tech)

## Contexto

A plataforma (ADR-0002) tem vários criadores, cada um no seu subdomínio
(`<slug>.lideresdeimpacto.com.br`), com identidade global ("um login para tudo") e papel por
criador. A régua da casa (`docs/seguranca-login.md`) vale inteira. O Espaço 7 já tem um login
auditado em produção com Better Auth + Drizzle (`ADR-0003..0006` de lá); ele foi **portado e
adaptado**, não copiado: lá é mono-cliente, sem `cacheComponents` e com passkey.

## Decisão

1. **Better Auth 1.7.7 + Drizzle, sem rota HTTP.** Não existe `src/app/api/auth`. Login, código,
   definir senha, troca de senha, cadastro do TOTP e sessões são Server Actions chamando
   `auth.api.*` no servidor (`src/lib/auth/`). `disabledPaths` repete os caminhos sensíveis.
   Versões conferidas no lockfile contra os advisories em 13/10/2026 (better-auth 1.7.7 sem
   advisory aberto; next 16.4.0 acima de 16.3.8; nodemailer 10.1.0 acima de 10.0.9).
2. **Cookie POR HOST, não SSO.** Sem `crossSubDomainCookies`: o cookie nasce sem `Domain` e só
   volta ao host que o criou. "Um login para tudo" = a mesma conta e senha valem em qualquer
   criador; cada área tem a sua sessão. A sessão grava `criador_id` (nulo = apex) e o servidor
   recusa sessão usada em outro host (`sessao.ts`). Isto **revê** a nota do ADR-0002 que previa
   cookie no domínio da plataforma: com cookie compartilhado, um XSS ou um admin malicioso num
   criador alcançaria a sessão dos outros.
3. **Funil único de sessão** (`databaseHooks.session.create`, `funil-sessao.ts`): todo caminho
   que cria sessão passa por ele. A sessão só nasce se a conta pode entrar **neste host**: no
   criador, vínculo `ATIVO` (ou SUPER_ADMIN, registrado como "acesso de suporte"); no apex, só
   SUPER_ADMIN. Recusa de login tem **uma** mensagem para tudo (senha errada, sem conta,
   inativa, bloqueada, sem vínculo neste criador), com o mesmo custo de tempo.
4. **Papel, `ativo`, vínculo e status do criador lidos do banco a cada requisição**
   (`sessaoDosCabecalhos`). Nada de cache no cookie (`cookieCache` desligado).
5. **Desvio autorizado da régua: 2FA obrigatório só para SUPER_ADMIN nesta fase.** TOTP +
   10 códigos de recuperação (cifrados, uso único, mostrados uma vez). Sem TOTP confirmado a
   sessão do SUPER_ADMIN é **provisória** (só abre Conta › Segurança). A política é a função pura
   `exige2FA` (`politica-fatores.ts`): estender a DONO/ADMIN muda só ela. Anti-replay do TOTP no
   banco; bloqueio do segundo fator por conta (5 erros / 15 min).
6. **Sem passkey por enquanto (YAGNI).** Consequência: trocar o aplicativo autenticador não é
   self-service (sem passkey, a troca deixaria a conta aberta só com a senha no meio do
   caminho); quem perde o celular entra com um código de recuperação, e a troca é pelo runbook.
7. **Senha mínima de 8** — decisão do Paulo em 13/10/2026, igual ao handoff. **Desvio da
   régua**, que pede 15 quando a senha é o único fator (aluno/dono/admin nesta fase). Mitigação:
   HIBP, bloqueio por conta e teto por IP. Rever (voltar a 15 ou 2FA para todos) antes de escalar.
   Política do Espaço 7 inteira: teto 128, termos da pessoa e da marca, sequências, histórico
   das 5 últimas, HIBP por k-anonimato (fail-open). KDF scrypt N=2^17 (128 MiB).
8. **Link de senha na tela** (ADR-0006 do Espaço 7). A equipe gera o link de primeiro acesso /
   redefinição e ele volta para a tela, para entregar por canal privado; quem recebe escolhe a
   senha. Token de uso único no **fragmento** (`/primeiro-acesso#token=…`, nunca no log/Referer),
   link novo invalida o anterior, validade de 24 h (link da equipe) e 30 min (pedido por e-mail).
   Como a identidade é global, a equipe de um criador só gera link para membro **deste** criador,
   com papel abaixo do seu, que não participe de outro criador nem seja SUPER_ADMIN
   (`link-de-senha-regra.ts`); o resto é com o SUPER_ADMIN.
9. **E-mail opcional**: SMTP da Hostinger via `nodemailer`, só por env. Sem configuração, nada
   sai e o "esqueci a senha" orienta a pedir o link à equipe.
10. **Borda** (`src/proxy.ts`): só para o HTTP sair certo antes do streaming (404 para host que
    não é área, 307 para `/login` sem cookie). Não é fronteira: cada página, layout e action
    confere por conta própria.

## Alternativas Consideradas

- **Cookie no domínio da plataforma (SSO entre criadores)**: mais cômodo, mas um criador
  comprometido alcança a sessão de todos. Rejeitado.
- **Conta separada por criador**: duplica senha e cadastro (ADR-0002).
- **2FA para todos já**: é a régua, mas o Paulo adiou para alunos/equipe nesta fase.
- **Rota HTTP do Better Auth aberta**: superfície maior sem necessidade (sem passkey nada exige o
  navegador falando direto com a biblioteca).

## Consequencias

### Positivas
- Isolamento entre criadores no cookie, no funil, na leitura de sessão e no banco (FK composta
  em `criadores_grupos_membros`), travado por `tests/integracao/sessao-isolamento.test.ts`.
- Mesmo código auditado do Espaço 7 nos pontos sensíveis (KDF, bloqueio, anti-replay, recusa única).

### Negativas / Trade-offs
- Quem estuda com dois criadores entra duas vezes (uma por host).
- Pendências da régua listadas em `docs/runbook-auth.md` (2FA para todos, passkey, cabeçalhos de
  borda, revogação de DELETE na trilha).

### Neutras
- Domínio próprio do criador: só a coluna `criadores.dominio_proprio`; o host responde 404 até ser ligado.

## Onde mora

- Tabelas: `usuarios` (identidade global), `usuarios_contas` (hash da senha), `usuarios_sessoes`
  (com `criador_id`), `usuarios_verificacoes` (token de senha e desafio do 2FA),
  `usuarios_limites` (tetos), `usuarios_totp`, `usuarios_senhas_anteriores`, `criadores`,
  `criadores_membros`, `criadores_grupos`, `criadores_grupos_membros`; `auditoria.criador_id`.
- Actions: `entrar`, `verificarCodigo`, `sair`, `pedirLinkDeSenha`, `definirNovaSenha`
  (`src/lib/actions/auth.ts`); `acaoIniciarTotp`, `acaoConfirmarTotp`, `acaoNovosCodigos`,
  `acaoTrocarSenha`, `acaoEncerrarOutrasSessoes` (`seguranca.ts`); `acaoGerarLinkDeSenha`
  (`usuarios-senha.ts`).
- Telas: `/login`, `/login/verificar`, `/primeiro-acesso`, `/recuperar-senha`, `/conta/seguranca`,
  `/plataforma`.
