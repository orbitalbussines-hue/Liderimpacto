# ADR-0023: Leads nas campanhas e automações (envio para membro OU lead, sem duplicar pessoa)

- **Status**: Aceito
- **Data**: 2026-10-18
- **Decisores**: Paulo (Bah! Tech), dono do produto

## Contexto

O ADR-0022 (item 5) deixou de fora, de propósito, o envio de campanha para os leads das páginas: a fila de
envios da Fase 3 (ADR-0020) era só de MEMBRO (`criadores_emails_envios.membro_id` NOT NULL) e o público
era uma regra única sobre `criadores_membros`. O dono do produto pediu "leads nas campanhas": mandar
campanha para os leads (todos, por página de origem, por funil, por tag), junto ou não com os alunos, e
uma automação para quando alguém se cadastra numa página. A plataforma está em produção.

## Decisão

1. **Destinatário polimórfico, mínimo.** Migração `0017_leads_nas_campanhas`, só aditiva: `lead_id`
   opcional em `criadores_emails_envios` e `criadores_automacoes_execucoes`, com FK composta
   `(lead_id, criador_id)` → `criadores_leads(id, criador_id)` RESTRICT (unique novo em `criadores_leads`);
   `membro_id` passa a anulável; CHECK "exatamente um de `membro_id`/`lead_id`" e, no envio,
   `PRIMEIRO_ACESSO` só de membro (lead não tem conta). Os dados existentes têm `membro_id` preenchido e
   `lead_id` nulo: passam no CHECK sem conversão. O código antigo sempre preenche `membro_id`.
   `processarEnvio`, `processarExecucao`, os destinatários da campanha e o histórico leem membro OU lead
   (`LEFT JOIN` nos dois; `coalesce` do nome/e-mail). Abertura, clique e descadastro já eram por envio e
   por HMAC do e-mail: não mudaram.
2. **Público = membros E/OU leads, numa regra só** (`destinatariosDoPublico` em `publico.ts`), usada na
   contagem e no início da campanha. `PublicoCampanha` ganhou `membros` (padrão `true`) e `leads`
   (`{ paginaIds, funilIds, tagIds }` ou nulo; listas vazias = todos os leads; E entre critérios, OU
   dentro). Campanha antiga sem os campos = só membros (`normalizarPublico`). Ordem e dedupe pelo **HMAC do
   e-mail** (o mesmo da lista de descadastro): (1) membros do segmento; (2) leads do segmento cujo e-mail
   já é ALUNO ativo da área — entram como MEMBRO; (3) os demais leads, desde que o e-mail **não** tenha
   vínculo vivo na área (lead que virou membro conta como membro: se o vínculo não é ALUNO ativo, não
   recebe). Chave do envio do lead: `campanha:<id>:lead:<lead>`. Descadastro: a mesma lista por HMAC,
   conferida no início e de novo no envio. A contagem devolve `membros` e `leads`.
3. **Automação `LEAD_CAPTURADO`** ("alguém se cadastra numa página"): filtro opcional por página e/ou
   funil DA CAPTURA (não da primeira), colunas `pagina_id`/`funil_id` com FK composta e CHECK "só neste
   gatilho". Gancho em `capturarLead`, DEPOIS do commit, nunca lança. Idempotente por (automação, lead):
   índice único parcial `(automacao_id, lead_id, referencia)` com a referência fixa `captura` — a pessoa
   que se cadastra de novo não recebe de novo. Atraso, e-mail e tag como as outras.
4. **Tag na automação de lead vai NO LEAD** (`criadores_leads.tag_id`). Por quê: `criadores_membros_tags`
   exige membro (o lead não tem vínculo e não deve ganhar um, ADR-0022 item 4) e o lead já tem a coluna de
   tag, que é o que o segmento de leads filtra. O lead tem UMA tag: a da automação substitui a anterior
   (a mais recente vale, como a captura já faz), com a anterior na trilha (`dados_anteriores`). Tabela de
   tags múltiplas por lead fica para quando houver pedido.
5. **Exportar leads em CSV**: `GET /admin/paginas/leads/exportar` (route handler; DONO/ADMIN com sessão
   plena, papel do banco; 401/403), gerado sob demanda com os MESMOS filtros da tela e nada guardado. O
   arquivo leva os e-mails (é o propósito); a trilha (`acao = exportar`) leva quem, quantos e o filtro —
   NUNCA os e-mails, e a busca só como "sim/não" (pode ser um e-mail). Célula que começa com `= + - @`
   ganha `'` (`gerarCsv` do Analytics), e o teto é de 50 mil linhas por arquivo.

## Alternativas Consideradas

- **Tabela de envios separada para leads**: duplicaria fila, métricas, rotas de clique/abertura e as
  telas; o envio polimórfico reaproveita tudo com duas colunas e um CHECK.
- **Converter lead em ALUNO para mandar campanha**: rejeitado no ADR-0022 (conta e acesso à área para
  qualquer e-mail digitado por terceiros).
- **Lead que virou membro entrar como lead**: mandaria pela linha do lead mesmo com o membro inativo ou
  bloqueado; contar como membro aplica as regras do vínculo.
- **Tag de membro para o lead que já é membro**: a automação é do lead (o evento é a captura); marcar o
  vínculo misturaria os dois segmentos.

## Consequências

### Positivas
- O criador fala com quem baixou a isca sem criar conta para ninguém, e ninguém recebe a mesma campanha
  duas vezes.
- Nada mudou para os membros: mesma chave, mesmo envio, mesmas métricas (testes antigos passam).

### Negativas / Trade-offs
- Público carregado em memória para o dedupe (ponytail: paginar acima de ~50 mil pessoas).
- O "já é membro" compara `lower(usuarios.email)` com o e-mail do lead a cada contagem (índice em
  `lower(email)` já existe).
- O lead tem uma tag só: a automação sobrescreve a do formulário.

### Fica para depois
- Várias tags por lead; lead editável/excluível pela equipe; importação de leads.
- Exportação em streaming acima de 50 mil.
