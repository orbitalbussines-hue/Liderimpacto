# Seguranca de Login e Conta — a regua da casa

Vale para **todo** projeto que tem login, independente de stack e de biblioteca de autenticacao.
Nao e opiniao: e o que a gente aceita entregar.

Use este documento como portao: **antes de entregar** um sistema com login, **depois de
trocar** a versao da biblioteca de autenticacao e **a cada trimestre** em producao, percorra
o checklist abaixo e anote a evidencia de cada linha. Se a skill `audit-auth-security`
estiver instalada em `.agents/skills/`, ela executa esta mesma regua de forma automatica
(somente leitura).

---

## Os cinco principios que resumem o resto

1. **O servidor e o controle. A tela nunca e.** Botao escondido, `disabled`, rota "que ninguem
   chama" — nada disso e defesa contra `curl`. Toda regra vive onde a requisicao chega.
2. **Isonomia dos caminhos.** Todo caminho que cria sessao — senha, codigo, TOTP, passkey,
   convite, callback social, magic link — passa pelos **mesmos** portoes e pela **mesma** trilha.
   O caminho esquecido e sempre o que vira brecha.
3. **Uma resposta so para toda recusa de login** — status, codigo, mensagem, **ordem das chaves**
   e **tempo**. "Nao existe", "existe", "existe e esta desativada" respondem **iguais**.
4. **Um controle, uma implementacao.** Segunda copia de leitura de IP, de checagem de origem ou
   de KDF significa que a proxima correcao so chega em uma delas.
5. **O que nao esta travado por teste volta.** Cada correcao de seguranca deixa um teste que **le
   o fonte** e reprova a regressao — inclusive na rota nova que alguem criar amanha.

---

## O portao — sem estas linhas, nao entrega

Marque cada uma com evidencia (`arquivo:linha`, ou requisicao + resposta). Linha sem evidencia
bloqueia igual a linha reprovada.

### Caminhos e guardas
- [ ] **Zero** rotas ou actions de escrita sem guarda de autenticacao, provado por **varredura**
      (inclui Server Actions — `'use server'` nao passa por layout nem por middleware).
- [ ] A **borda** (middleware, proxy, gateway) nao e a unica barreira: pagina, handler e action
      conferem por conta propria. Middleware que so checa a **presenca** do cookie nao e checagem.
- [ ] Autenticacao de **maquina** (webhook, API key, cron) e canal separado do login humano.
- [ ] Segredo de maquina so em **cabecalho**, nunca em query string, comparado em **tempo
      constante** (`timingSafeEqual`), e ausente = ninguem entra (nunca "opcional").

### Senha
- [ ] KDF lento com memoria: **Argon2id** (>= 19 MiB, t=2, p=1). bcrypt so em legado, custo >= 10.
- [ ] Minimo **15** caracteres quando a senha e fator unico; 8 so com segundo fator real. Teto de
      entrada bruto **antes** de normalizar ou hashear.
- [ ] Conferida contra lista de vazadas (HIBP por k-anonimato), **fail-open com aviso**.
- [ ] **Sem** regras de composicao obrigatorias e **sem** expiracao periodica. A norma proibe.
- [ ] Verificada exatamente como recebida — `trim()` e `toLowerCase()` sao defeito.
- [ ] A politica roda em **todo** caminho que grava senha e em **nenhum** que so confere.
- [ ] Troca de senha exige a **senha atual**.

### Login e bloqueio
- [ ] Bloqueio por **CONTA** apos N falhas, atomico (um `UPDATE` condicional, nunca
      ler-decidir-escrever). Contador por IP e segunda linha, nao a primeira.
- [ ] IP lido por **uma** funcao canonica que sabe quantos saltos de proxy confiar. `x-forwarded-for`
      cru e forjavel: quem usa direto nao tem limitador, tem enfeite.
- [ ] KDF roda **tambem** para e-mail inexistente (senao o tempo de resposta e o oraculo).
- [ ] **Sem contas padrao.** Nenhuma senha literal em seed, em `CLAUDE.md` ou em README. O seed
      nao roda sozinho no entrypoint do container.

### Segundo fator
- [ ] Segundo passo **obrigatorio para todo mundo**, ligado no provisionamento.
- [ ] Ao menos uma opcao **resistente a phishing** (passkey), com `userVerified: true` exigido no
      servidor.
- [ ] Codigo por e-mail e **piso de transicao**, escrito como tal — nao e fator pela norma, e o
      reset chega na mesma caixa.
- [ ] OTP: hasheado em repouso, >= 6 digitos CSPRNG, validade <= 10 min, uso unico atomico,
      comparacao em tempo constante, **nunca em log**.
- [ ] Nao existe botao de "desligar segundo fator". Remover autenticador **rotaciona**, mantem o piso.

### Sessao
- [ ] Papel e `is_active` valem na **proxima requisicao** — nunca cacheados no token por 24 h.
- [ ] Desativar conta ou trocar fator **derruba** as sessoes.
- [ ] Teto absoluto de vida (<= 24 h) e expiracao por inatividade (<= 1 h).
- [ ] O usuario **ve e encerra** as proprias sessoes; o token nunca sai do servidor.
- [ ] Token de sessao **nunca** em URL, `localStorage` ou corpo de resposta.

### Tela "Meu perfil › Seguranca"
- [ ] Existe, e alcancavel de toda area autenticada.
- [ ] **Nenhuma** action dela aceita `userId`: o alvo e sempre a sessao corrente.
- [ ] Tem: trocar senha, ver e encerrar sessoes, cadastrar e remover fator.
- [ ] Nao tem: desligar o segundo fator, codigos de resgate a cada carregamento, token de sessao.

### Administracao
- [ ] Privilegio maximo (`OWNER`) e **separado** de `ADMIN`, e nunca concedido por rota de API
      comum, por convite ou por auto-atribuicao.
- [ ] Trilha gravada **antes** do efeito quando o efeito destroi o estado anterior (promocao a
      dono, destravamento, senha definida por admin). Falhou a trilha, **nao concede**.
- [ ] **Nunca zero donos**: sem auto-alvo em rebaixamento; o ultimo dono nao e revogavel.
- [ ] Admin **nunca escolhe a senha definitiva** de outra pessoa: inicia o reset, ou define
      temporaria com expiracao propria + `must_change_password` + revogacao das sessoes do alvo +
      motivo registrado.
- [ ] Acao sobre conta alheia exige **motivo** e registra ator, alvo, antes e depois.
- [ ] O `default` da coluna de papel e o **menor** privilegio. Linha criada fora da rota nao pode
      nascer administradora.

### Trilha
- [ ] Registra login **bem-sucedido** (quem, quando, meio, IP, agente), falha, bloqueio, logout,
      troca de senha, mudanca de fator, concessao e revogacao de papel, **recusa 403** e acao
      administrativa.
- [ ] A trilha nasce no **funil de criacao de sessao**, nao numa lista de rotas — lista sempre
      esquece a proxima.
- [ ] Trilha e **append-only**: a conta que a aplicacao usa no banco nao tem `DELETE` nessa tabela.
      Apagar registro junto com a entidade pai e destruir a prova.
- [ ] **Nunca** na trilha: senha, hash, token, OTP, semente TOTP, codigo de resgate.

### Borda e versao
- [ ] Cabecalhos: HSTS >= 1 ano com `includeSubDomains`, `X-Content-Type-Options`,
      `Referrer-Policy` estrito, `X-Frame-Options`/`frame-ancestors`, `Permissions-Policy`.
- [ ] Respostas autenticadas com `Cache-Control: no-store`.
- [ ] Versoes de framework e de biblioteca de auth **acima** das corrigidas nos advisories —
      conferido na **instalacao** (lockfile), nao no `package.json`.

---

## Armadilhas ja encontradas em auditoria nossa

Cada linha aqui foi achada em codigo de producao. Nao sao hipoteses.

| O que parecia | O que era |
| :--- | :--- |
| "A tela mostra mensagem generica de erro" | O servidor devolvia a mensagem crua na URL. NextAuth v4 poe `error.message` no redirect: tres textos diferentes = enumeracao de conta. |
| "Tem rate limit no login" | A chave era `x-forwarded-for` cru e o armazenamento era um `Map` em memoria. Cabecalho aleatorio a cada tentativa = sem limite; reinicio do container = contador zerado. |
| "Desativei o usuario" | O papel e o `active` moravam no JWT de 24 h. O demitido continuou entrando o dia inteiro. |
| "O middleware protege as rotas" | Ele so conferia se o cookie **existia**. `document.cookie = "...=x"` abria a navegacao inteira. |
| "O seed e so de desenvolvimento" | O `docker-entrypoint.sh` rodava o seed quando o banco estava vazio — em producao — e o seed comecava com `deleteMany()` em todas as tabelas. |
| "As credenciais de dev estao so no CLAUDE.md" | O `CLAUDE.md` e versionado. A senha do admin estava no git. |
| "O webhook tem segredo" | Comparado com `!==`, aceito por `?secret=` (que cai no log do proxy) e **opcional** fora de producao. |
| "A auditoria registra tudo" | Registrava 14 acoes de negocio e **nenhum** evento de login. E duas rotas faziam `auditLog.deleteMany()`. |
| "Tem healthcheck interno" | Sem a variavel de segredo definida, a rota era publica e entregava o **telefone** das instancias de WhatsApp. |

---

## As tres varreduras que ficam no repositorio

Teste que le o fonte, roda no CI e reprova a regressao. Sem elas, a auditoria de hoje e a brecha
de daqui a tres meses.

1. **Guarda**: rota ou action de escrita sem chamada ao portao de autenticacao → reprova.
   Compara **identidade de funcao**, nao nome — apelido de import nao engana.
2. **Soft delete**: `select` sem filtro de `is_deleted`, ou `delete` fisico em qualquer tabela →
   reprova. Qualquer `delete` sobre a tabela de auditoria → reprova sempre.
3. **Recusa unica**: dispara as quatro recusas de login (inexistente, senha errada, desativada,
   limitada) e compara resposta **byte a byte** e percentil de tempo.

---

## Normas

- **NIST SP 800-63B-4** (jul/2025) — comprimento, blocklist, proibicao de composicao e de
  expiracao, e-mail nao e fator, tetos de sessao.
- **OWASP ASVS 5.0.0** (mai/2025) — V6 Autenticacao, V7 Sessao, V8 Autorizacao.
- **OWASP Top 10:2025 A07** — *Authentication Failures*.
