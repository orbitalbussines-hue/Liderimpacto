# ADR-0018: Fase 1 sem "Em breve": tags, vouchers, feedback, disparos de e-mail, webhooks, tentativas extras e IA no estúdio

- **Status**: Aceito
- **Data**: 2026-10-17
- **Decisores**: Paulo (Bah! Tech)

## Contexto

O menu tinha várias abas "Em breve". A Fase 1 cobre o que **não depende** de gateway de pagamento
nem de provedor de e-mail em massa (`docs/proximas-etapas.md`). O sistema já está em produção: a
migração `0012` é **só aditiva** (tabelas novas + o CHECK de `produtos_matriculas.origem` ampliado
com `VOUCHER`, que só aceita mais valores). As telas vêm depois, em paralelo; esta decisão fixa a
camada de dados (RN-200 a RN-206, `docs/back.md` "Fase 1").

## Decisão

1. **Tags de membros** (`criadores_tags`, `criadores_membros_tags`). Etiqueta livre (nome único por
   criador sem diferença de caixa, cor `#rrggbb`); diferente de grupo, **não libera nada**. Vínculo com
   FK composta `(membro, criador)` e `(tag, criador)`, um vivo por par, soft delete. Excluir a tag tira
   de todos os membros na mesma transação. Filtro `tagId` em `listarMembros`.
2. **Vouchers** (`criadores_vouchers`, `_produtos`, `_resgates`). Código de 6 a 16 símbolos do
   alfabeto **sem 0/O/1/I** (32 símbolos: o gerado tem 8 = 32⁸ combinações), guardado MAIÚSCULO e
   sem hífen — o CHECK do banco garante, então a unicidade por criador já é sem diferença de caixa.
   O código não muda depois de criado (pode ter sido divulgado). Limites total e por pessoa contados
   nos resgates vivos com o **voucher travado (`FOR UPDATE`)**: resgates simultâneos não passam do
   limite (testado). Cada produto passa por `matricular` com origem `VOUCHER` e referência
   `voucher:<resgate>:<produto>` (por resgate, para um 2º resgate permitido reativar a matrícula);
   produto que a pessoa JÁ tem valendo entra sem referência, para não sobrescrever a do gateway.
   Já tem tudo = recusa sem gastar uso. ENCERRADO é final; voucher com resgate não se exclui (encerra).
3. **Feedback de conteúdo** (`produtos_modulos_aulas_feedbacks`): **útil / não útil** + comentário
   opcional de até 500 caracteres (texto puro). Binário, não 1–5: é um clique na aula (mais resposta),
   o meio da escala não diz nada à equipe e a pergunta dela é "que aula não está ajudando?" — a "média"
   da aula é o **% de útil**, com a lista das piores primeiro. Um vivo por (membro, aula), regravado por
   UPSERT no índice parcial; sem trava de colisão de propósito (a linha é da própria pessoa; vale o
   último clique). Só ALUNO avalia (a prévia da equipe não suja a estatística) e só aula que pode
   assistir (`acessoDaAula`).
4. **Disparos de e-mail** (`emails_disparos`, **append-only**, na lista `APPEND_ONLY` do
   `scripts/db-migrar.ts`: o papel `lider_app` perde UPDATE/DELETE). `enviarEmail` grava ENVIADO,
   FALHOU (só o código do erro, ex. `EAUTH`) ou NAO_CONFIGURADO, com tipo, área e assunto, **nunca o
   corpo** (leva link com token). LGPD: a linha não pode ser apagada pela aplicação, então guarda o
   mínimo — a **máscara** (`pa***@gm***.com`) para a tela e o **HMAC-SHA256** do endereço (chave HKDF
   do `BETTER_AUTH_SECRET`) para a busca exata "chegou e-mail para fulano?". Hash puro viraria
   dicionário de e-mails; sem a chave, o HMAC não. O registro é best-effort (teto de 3 s, nunca
   derruba o envio).
5. **Webhooks de saída** (`criadores_webhooks`, `criadores_webhooks_entregas`). Até 10 por criador,
   URL https, eventos `EVENTOS_WEBHOOK`, ATIVO/PAUSADO. **Segredo** `whsec_…` mostrado uma vez e
   guardado **cifrado** (AES-256-GCM, chave HKDF-SHA256 do `BETTER_AUTH_SECRET` com rótulo próprio,
   AAD = id do webhook): tem que ser recuperável para assinar, e hash+cifra seria a mesma coisa com
   uma coluna a mais. Sem variável nova (`WEBHOOKS_CHAVE`): mesmo ciclo de vida da semente do TOTP,
   nada a esquecer nos dois `env.exemplo`; trocar o `BETTER_AUTH_SECRET` exige trocar os segredos
   (já é assim com o TOTP). Assinatura no cabeçalho `X-Lider-Assinatura: t=<unix>,v1=<hex
   HMAC(segredo, "<t>.<corpo>")>` + `X-Lider-Evento` e `X-Lider-Entrega` (deduplicação no receptor).
   Emissão **depois do commit** e sem lançar (`src/lib/webhooks/emitir.ts`), ligada em matrícula
   criada/reativada/cancelada (telas, CSV, voucher), aula e curso concluídos, avaliação aprovada,
   certificado emitido e membro cadastrado. Uma entrega por webhook inscrito, payload fixo (id do
   evento, criador, dados com id/nome/e-mail da pessoa: o receptor é o sistema do próprio criador).
   Fila `webhooks` no **4º Worker** de `worker:certificados`, `jobId` = entrega, 8 tentativas com
   backoff exponencial de 30 s (≈ 1 h), última = FALHOU + `webhooks-dlq`; o worker reenfileira as
   PENDENTES ao subir; "Reenviar" volta FALHOU a PENDENTE com trava. **SSRF**: só https, nome
   `localhost`/`.local`/`.internal` recusado, o host é resolvido e **todos** os endereços precisam ser
   públicos (`net.BlockList`: loopback, RFC 1918, link-local/metadados `169.254.169.254`, CGNAT,
   multicast, documentação, NAT64, 6to4, ULA, IPv4 mapeado); a conexão usa o `lookup` conferido (DNS
   que muda entre conferir e conectar não passa), timeout total de 5 s, **sem seguir redirect** (3xx =
   falha), corpo da resposta descartado. Pausado depois do evento: a entrega é cancelada ao sair da fila.
6. **"Correção" vira "Tentativas extras"** — sem tabela nova. As avaliações são objetivas e corrigidas
   no servidor na hora; questão discursiva com nota manual mudaria o centro do fluxo (tentativa
   "aguardando correção" segura aprovação, liberação de módulo, certificado, pontos e o evento de
   webhook, que hoje acontecem ao finalizar). Isso é uma Fase própria com ADR. O que a equipe decide
   hoje é **quem ganha nova chance**: a aba lista quem esgotou sem aprovar (`esgotaramSemAprovar`) e o
   histórico (`concessoesDoCriador`); conceder usa `concederTentativa`, que já existe. "Progresso" e
   "Avaliações" são consultas sobre tabelas existentes (`src/lib/matriculas/abas.ts`).
7. **Aluno › Continuar** ("Anotações", "Turmas") e **Estúdio › Estatísticas** são só consultas
   (`progresso/continuar.ts`, `video/estatisticas.ts`): visualizações = soma diária do agregado do
   ADR-0006 no período, minutos = segundos ÚNICOS por pessoa somados, retenção = média do % assistido.
8. **IA no estúdio** (`produtos_modulos_aulas_sugestoes`). Reaproveita o `ClienteIA` do assistente
   (mesmo modelo, streaming, esforço `low`, prompt de sistema com cache). A transcrição sai do `.vtt`
   do storage em blocos `[mm:ss]` de ~30 s (sem storage: texto puro e **sem capítulos**, que seriam
   inventados), entra como DADO escapado em `<transcricao>`. A resposta é JSON pedido no prompt (os
   modelos atuais não aceitam prefill) e validado por Zod; fora do formato ou recusa = linha gravada
   **já descartada** (o custo aconteceu e conta) e mensagem. Tokens e modelo por geração; custo
   ESTIMADO por `custoUsd`. Limite de 30 gerações por criador por dia (Brasília), contando as
   descartadas, conferido antes da chamada (ponytail: dois cliques no mesmo segundo passam 1).
   **Nada é aplicado sozinho**: descrição e capítulos sobrescrevem os da aula com a trava da AULA;
   perguntas viram questões UNICA no fim de uma avaliação do MESMO curso; cada parte marca
   `*_aplicad*_em`. Descrição aplicada reindexa a base do assistente.

## Consequências

- Positivas: oito abas deixam de ser "Em breve" com regra e teste no banco real; integrações do
  criador (CRM, automações) sem a plataforma conhecer o destino; registro de e-mail auditável sem dado
  pessoal em claro.
- Negativas / custos: payload de webhook com e-mail fica nas entregas (soft delete; retenção a
  definir); a IA custa por geração (limite diário no banco); rotação do `BETTER_AUTH_SECRET` invalida
  os segredos de webhook e as buscas antigas por e-mail nos disparos.
- Fica para depois: questão discursiva com correção manual; "enviar teste" do webhook; retenção das
  entregas; e-mail marketing (provedor em massa) e gateway (Fase 2).
