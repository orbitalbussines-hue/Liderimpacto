# ADR-0009: Comunidade em texto puro, limite de frequência no banco e notificações por polling

- **Status**: Aceito
- **Data**: 2026-10-14
- **Decisores**: Paulo (Bah! Tech)

## Contexto

O passo 8 (SISTEMA.md §3 item 10, §4 Channel/Post/Comment/Like/Notification) traz a comunidade
(canais, posts, comentários, curtidas, fixados, moderação) e as notificações in-app (sino com
contador). O cliente não definiu as regras: RN-130 a RN-134 registram padrões. ARQUITETURA.md §7
pede sanitização de HTML na comunidade, rate limit em comentários e upload validado. Membro só pode
ver o que o canal libera, e nada pode vazar entre criadores.

## Decisão

1. **Texto PURO, não HTML sanitizado.** Post e comentário guardam texto (normalizado: sem controles,
   bidi override ou largura zero). A tela renderiza com o escape do React e é PROIBIDO
   `dangerouslySetInnerHTML`; links http(s) viram `<a rel="noopener noreferrer nofollow"
   target="_blank">` pela função pura `segmentosDeTexto` (javascript:, data: e host sem ponto ficam
   texto). Sem sanitizador, sem lista de tags, sem dependência nova.
2. **Visibilidade numa condição SQL só** (`veCanalSql`, `src/lib/comunidade/sql.ts`): equipe vê
   todos; aluno vê TODOS, GRUPO (está no grupo vivo), PRODUTO (matrícula valendo agora), nunca EQUIPE.
   Feed, post, comentário, curtida, voto, denúncia, anexo e o envio de notificação em massa usam a
   mesma. Comentário de aula usa `acessoDaAula` (quem pode assistir). FK composta com `criador_id`
   em todas as tabelas.
3. **Contadores desnormalizados** (`curtidas`, `comentarios`) atualizados na mesma transação, sem
   tocar `updated_at` (campo de sistema). Permitem o feed "Mais curtidos" por índice e cursor.
   Curtida = UMA linha por (membro, alvo) para sempre; descurtir = soft delete; curtir de novo reativa.
4. **Limite de frequência por consulta no banco** (5 posts e 20 comentários por 10 min por membro;
   12 envios de anexo): conta TODAS as linhas na janela (apagar não devolve a cota), dentro de
   `pg_advisory_xact_lock` por membro — dois cliques simultâneos não passam juntos. Sem Redis: a
   contagem usa o índice (autor, created_at), é exata e sobrevive a restart e a várias instâncias.
5. **Notificações: tabela por membro + polling.** O sino chama `GET /api/notificacoes/contagem` a
   cada ~60 s (só com a aba visível): uma contagem no índice PARCIAL das não lidas, limitada a 100.
   Geração SEMPRE depois do commit da ação e sem derrubá-la (erro vai para o log); `chave` única por
   membro dá idempotência e a agregação de curtidas (uma por post por dia, `atores` sem repetir).
   Retenção de 90 dias por `evento_em`: as leituras já ignoram as antigas e `arquivarNotificacoesAntigas`
   marca `arquivada_em` (nunca delete físico).

## Alternativas Consideradas

- **HTML/Markdown com sanitizador (DOMPurify)**: dependência nova e superfície de XSS para um feed
  que não precisa de formatação. Markdown entra depois se o cliente pedir, renderizado sem HTML.
- **Rate limit em Redis**: some com o Redis/flush e exige outra peça no caminho de escrita; o volume
  (dezenas de posts por minuto) não pede.
- **SSE/WebSocket para o sino**: conexões abertas por aluno na VPS, reconexão e fan-out entre
  instâncias. 60 s de atraso é aceitável para um sino; tempo real vira ADR quando houver chat ao vivo.
- **Contar curtidas por `COUNT(*)` a cada feed**: simples, mas "Mais curtidos" não teria índice nem cursor.
- **Uma notificação por curtida**: enche a lista ("30 pessoas curtiram" vira 30 linhas).

## Consequências

### Positivas
- XSS armazenado não tem caminho (não existe HTML para sanitizar); teste prova que `<script>` volta literal.
- A regra de acesso do canal muda em um lugar e vale para tudo, inclusive para quem recebe aviso.
- Ação principal nunca falha por causa da notificação.

### Negativas / Trade-offs
- Envio em massa (aviso, fixado, aula nova) é `INSERT ... SELECT` na requisição — `ponytail:` vira
  job na fila quando um criador passar de ~10 mil membros.
- No "Mais curtidos" uma curtida entre duas páginas pode repetir ou pular um post.
- Comentários sem paginação (até 500 por alvo) — `ponytail:` paginar quando um post passar disso.
- O polling lê a sessão sem renovar o uso (`sessaoDosCabecalhos(h, { renovar: false })`): aba
  esquecida aberta expira por inatividade normalmente; a tela ainda só faz polling com a aba visível.
- Arquivamento sem agendador ainda (a leitura já respeita a retenção).

### Neutras
- Marcar notificação como lida não vai para a trilha (é a caixa de entrada da própria pessoa); toda
  escrita da comunidade e da moderação vai.
- "Próximo encontro ao vivo" devolve `null` até existir a entidade de eventos; pontos dos membros
  ativos ficam 0 até a gamificação.
