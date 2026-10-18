# ADR-0020: Fase 3 — campanhas e automações de e-mail (provedor trocável, teto de envio, descadastro LGPD)

- **Status**: Aceito
- **Data**: 2026-10-18
- **Decisores**: Paulo (Bah! Tech), dono do produto

## Contexto

A plataforma está em produção e o criador Valmer importou ~140 alunos que precisam receber o acesso por
e-mail. O menu já prevê Campanhas e Automações ("Em breve"). O dono do produto decidiu: o provedor de
e-mail em massa **ainda não foi escolhido** (Brevo, SES e Resend são candidatos); hoje o envio sai pelo
**SMTP da Hostinger** já configurado (`enviarEmail`), que tem cota por caixa e é a MESMA caixa dos
e-mails de senha. Esta decisão fixa a camada de dados e o back-end (as telas vêm depois, a partir de
`docs/back.md` "Fase 3"). Migração `0014_fase3_campanhas_automacoes`, **só aditiva** (6 tabelas, um
índice em `emails_disparos.created_at` e o CHECK de `emails_disparos.tipo` com `CAMPANHA`/`AUTOMACAO`).

## Decisão

1. **Provedor atrás de uma interface pequena** (`ProvedorEmail` em `src/lib/marketing/provedor.ts`:
   `configurado()` e `enviar(email)`), como o `GatewayStripe` e o `ClienteIA`. Implementação atual =
   `provedorSmtp` (o `enviarEmail`, que já registra o disparo); testes usam o `ProvedorFalso` e nunca
   enviam nada. Trocar de provedor = outra implementação + `usarProvedorEmail` na subida do worker; tela,
   campanha e automação não mudam. `enviarEmail` ganhou `cabecalhos` (só os do sistema, sem quebra de linha).
2. **Uma fila de envios, um destinatário por linha.** `criadores_emails_envios` guarda campanha,
   execução de automação e reenvio do primeiro acesso, com `chave` única por criador
   (`campanha:<id>:<membro>`, `automacao:<execução>`, `primeiro-acesso:<lote>:<membro>`): reprocessar não
   duplica, e a baixa do envio é condicional (`situacao = 'PENDENTE'`). Fila BullMQ `emails` (6º Worker de
   `worker:certificados`, `jobId` = envio, concorrência 1). Fila `marketing` (7º Worker) para iniciar
   campanha agendada, executar automação (job atrasado) e a varredura diária.
3. **Teto de envio da plataforma** (`EMAIL_LIMITE_HORA`, padrão **100**; `EMAIL_LIMITE_DIA`, padrão
   **1000**). Janela DESLIZANTE de 1 h e 24 h contada em `emails_disparos` (todo e-mail que saiu ou
   tentou sair pela caixa — inclusive os transacionais, que gastam a mesma cota). Teto cheio = o worker
   chama `rateLimit(espera)` e o job volta a esperar **sem gastar tentativa**: nada é descartado, só sai
   na janela seguinte. Por que 100/1000: a Hostinger limita o envio por caixa e por dia conforme o plano
   (confira no hPanel o do plano contratado); ficar **abaixo** do limite deixa folga para os e-mails de
   senha (que nunca esperam o teto) e reduz o risco de a caixa ser bloqueada por volume. Com 138 alunos,
   o reenvio do acesso termina em ~1h30. Provedor de massa contratado = subir o teto pela variável.
   Concorrência 1 = leitura e gasto do teto em sequência (ponytail: com réplicas do worker, contador
   atômico no Redis).
4. **Conteúdo em TEXTO, nunca HTML do criador.** `ConteudoMarketing` = assunto, prévia, título, corpo
   (cada linha um parágrafo; URLs viram link) e botão opcional. O HTML sai do mesmo `montarEmail` dos
   transacionais (marca da área), com tudo escapado; o modelo ganhou `linkar`, `descadastro` e `pixel`.
   O validador só aceita links `https://` (http só em localhost) — no corpo (até 20) e no botão.
5. **Métricas**: abertura por pixel (`/api/email/abertura?e=&s=`) e clique por redirect
   (`/api/email/clique?e=&u=&s=`). A assinatura é HMAC-SHA256 com chave derivada (HKDF) do
   `BETTER_AUTH_SECRET`, uma por uso; o clique assina **(envio, URL)** e o sistema só assina as URLs que
   estavam no conteúdo — URL trocada, envio de outra área ou assinatura de outro envio = 404 (nada de
   redirect aberto). Contadores gravados pelo sistema sem mexer em `updated_at`; aberturas/cliques da tela
   são PESSOAS únicas; clique também conta como abertura (cliente que bloqueia imagem).
6. **Descadastro (LGPD)** em todo e-mail de marketing: link no rodapé + `List-Unsubscribe` e
   `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058). Rota pública
   `/api/email/descadastro?t=` no host da área: GET só mostra a confirmação (robô de antivírus abre
   link), POST efetiva (o formulário ou o cliente de e-mail). Token = `<HMAC do e-mail>.<assinatura(criador,
   HMAC)>`, sem validade e amarrado à área. A tabela `criadores_emails_descadastros` guarda **o HMAC do
   endereço** (o mesmo de `emails_disparos`) e a máscara, **não o e-mail**: o único uso é a pergunta "este
   endereço saiu da lista desta área?", que o HMAC responde por igualdade; sem a chave o HMAC não vira
   lista de e-mails. Custo aceito: trocar o `BETTER_AUTH_SECRET` invalida os HMACs (os disparos já têm o
   mesmo custo) — quem troca o segredo refaz a lista. Campanha e automação consultam antes de cada envio
   (descadastrado = IGNORADO); transacional (senha, primeiro acesso, avisos) não consulta. Por criador:
   sair da lista da área A não tira da área B.
7. **Público por regra única** (`condicaoDoPublico`): ALUNO com vínculo ATIVO e conta ativa; E entre os
   critérios (grupos, tags, cursos com matrícula valendo, nunca acessou), OU dentro de cada lista; vazio =
   todos os alunos. Ids de outro criador = "não encontrado". Contagem antes de enviar
   (`contarPublico`: total, descadastrados, receberão). O público é lido no INÍCIO do envio (agendada
   para amanhã inclui quem entrar até lá).
8. **Automações** com gatilho fixo (membro cadastrado, matrícula criada, aula concluída, curso
   concluído, certificado emitido, voucher resgatado, inatividade de N dias, nunca acessou após N dias),
   filtro de curso opcional (gatilhos de curso), atraso de 0 a 30 dias, ação = e-mail e/ou tag. Nascem
   PAUSADAS. Os ganchos ficam nos MESMOS pontos dos webhooks de saída (`webhooks/emitir.ts`; voucher em
   `actions/vouchers.ts`), DEPOIS do commit, e **nunca lançam**. Idempotência pelo índice único
   **(automação, membro, referência)**: `matricula:<id>`, `aula:<id>`, `curso:<id>`, `certificado:<id>`,
   `voucher:<resgate>`, `cadastro`, `inativo:<ISO do último acesso>` (um disparo por episódio de
   inatividade) e `nunca-acessou`. Varredura diária por job repetido (`upsertJobScheduler`, 09:00 de
   Brasília). Reativar uma matrícula cancelada não repete a automação (mesma referência). A execução
   aplica a tag (trilha como evento do sistema) e cria o envio; o histórico é a própria tabela.
9. **Reenvio do primeiro acesso em massa** (urgente para os 138 importados): action para um público
   (ex.: grupo + nunca acessou) que cria um LOTE de envios `PRIMEIRO_ACESSO`. Quem pode receber é a regra
   EXISTENTE do link (`motivoParaNaoGerarLink`, RN-102), conferida na contagem, no lote e de novo no
   envio. O link nasce **no worker, na hora do envio** (`gerarLinkDeSenha`: invalida os anteriores e grava
   a trilha antes) — assim o teto que adia o envio não consome as 24 h de validade. É transacional:
   ignora o descadastro, respeita o teto.
10. **Nenhuma tabela nova é append-only**: envios e execuções mudam de situação; descadastro admite
    soft delete (reinscrição futura). O registro imutável continua sendo `emails_disparos`.

## Alternativas Consideradas

- **Contratar Brevo/SES agora**: decisão do dono adiada; a interface deixa a troca para depois.
- **Limitador nativo do BullMQ (`limiter`)**: um só limite e não conta os transacionais; o teto por
  `emails_disparos` cobre hora e dia e enxerga a caixa inteira.
- **E-mail em claro na lista de descadastro**: mais simples de exibir, mas guarda dado pessoal sem
  necessidade numa lista que existe justamente para quem não quer mais contato.
- **Redirect por índice da URL no conteúdo**: quebraria se a automação fosse editada depois do envio; a
  URL assinada no link é estável e continua restrita ao que o sistema assinou.
- **Gerar o link de primeiro acesso na action**: com o teto adiando o envio, o link poderia vencer antes
  de chegar.

## Consequências

### Positivas
- O Valmer manda o acesso dos 138 com um filtro e vê a contagem antes.
- Reprocessar qualquer job é seguro (chave única, baixa condicional, referência da automação).
- O e-mail de senha nunca fica preso atrás de uma campanha.

### Negativas / Trade-offs
- Abertura por pixel é estimativa (Apple Mail pré-carrega imagens; outros bloqueiam).
- Um envio pode sair duas vezes se o worker morrer entre o SMTP aceitar e a baixa no banco (raro).
- Máscara do descadastro depende de achar a conta pelo HMAC (varre os membros da área).
- Teto global: uma campanha grande de uma área atrasa a de outra (FIFO na mesma caixa).

### Fica para depois
- Telas (Campanhas, Modelos, Automações + Histórico, Descadastros, reenvio do acesso em Membros).
- Provedor de massa com webhook de bounce/reclamação (supressão automática), domínio com SPF/DKIM/DMARC.
- Editor de blocos, variáveis no texto (`{nome}`), teste A/B, reinscrição pelo próprio aluno.
