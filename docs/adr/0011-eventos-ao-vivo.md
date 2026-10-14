# ADR-0011: Eventos ao vivo com link revelado só na janela, público por regra única e lembrete por job atrasado

- **Status**: Aceito
- **Data**: 2026-10-14
- **Decisores**: Paulo (Bah! Tech)

## Contexto

O criador faz encontros ao vivo (aula ao vivo, mentoria em grupo, live) numa sala externa (Zoom,
Meet, YouTube...). A comunidade (ADR-0009) já reserva o cartão "Próximo encontro ao vivo". O link
da sala é o que se quer proteger: quem não é do público não pode recebê-lo, e mesmo quem é não deve
tê-lo dias antes (circula em grupo de WhatsApp). O aluno confirma presença e quer um aviso antes de
começar. O cliente ainda não definiu as regras: RN-142 e RN-143 registram padrões.

## Decisão

1. **Tabelas** (migração `0009_eventos_gamificacao`): `criadores_eventos` (título, descrição em texto
   puro, `inicio_em` timestamptz, `duracao_min` 5–720, `link_acesso`, situação RASCUNHO | PUBLICADO |
   CANCELADO, público TODOS | PRODUTO | GRUPOS, `produto_id` e `gravacao_aula_id` opcionais com FK
   composta, `criado_por`, `publicado_em`, `cancelado_em`), `criadores_eventos_grupos` (junção do
   público GRUPOS) e `criadores_eventos_inscricoes` (uma viva por evento × membro; desconfirmar = soft
   delete, confirmar de novo = linha nova). `criador_id` + FKs compostas em todas: o banco recusa
   misturar criadores.
2. **Link https validado duas vezes**: `linkDeEventoValido` (puro, `URL` + rótulos do host) na action e
   CHECK com a mesma regex no banco (`REGEX_LINK_EVENTO_SQL`). Nulo só em RASCUNHO (CHECK).
3. **Link só na janela, decidido no servidor**: `momentoDoEvento` (EM_BREVE / ABERTO / ENCERRADO) com
   ABERTO = de 15 min antes do início até o fim (início + duração). As consultas do aluno
   (`src/lib/eventos/consultas.ts`) devolvem `link` nulo fora da janela e em evento cancelado; a
   gravação só depois do fim (o player ainda confere o acesso à aula). A tela mostra contagem
   regressiva/"encerrado" e recarrega o evento ao abrir a janela.
4. **Quem vê numa condição só** (`vePublicoSql`, `src/lib/eventos/sql.ts`, a mesma dos desafios):
   equipe vê tudo; aluno vê TODOS, PRODUTO com matrícula valendo agora, GRUPOS estando num grupo vivo.
   Lista, inscrição e avisos usam a mesma. Rascunho nunca aparece na área do aluno.
5. **Avisos = notificações in-app** (ADR-0009), três tipos novos no CHECK: `EVENTO_PUBLICADO` (alunos do
   público, chave `evento:<id>`), `EVENTO_CANCELADO` (inscritos, `evento-cancelado:<id>`) e
   `EVENTO_LEMBRETE` (inscritos com a preferência "Lembretes" ligada, chave
   `evento-lembrete:<id>:<início em ms>`). Funções em `src/lib/notificacoes/gerar.ts`.
6. **Lembrete por job ATRASADO numa fila nova `eventos`** (BullMQ, mesmo Redis/prefixo: chaves
   `li:eventos:*`), consumida por um segundo `Worker` DENTRO do processo `npm run worker:certificados`:
   - ao PUBLICAR e ao MUDAR O HORÁRIO de um evento publicado, depois do commit, a action enfileira
     `{ criadorId, eventoId, inicioEm }` com `jobId = idDoJobLembrete(eventoId, inicioEm)`
     (`lembrete-<id>-<ms>`) e `delay = momentoDoLembrete(inicioEm) − agora` (mínimo 0);
   - o job chama `notificarLembreteEvento(criadorId, eventoId, inicioEm)`, que só avisa se o evento
     continua PUBLICADO, com o MESMO início e ainda não terminou — cancelar ou reagendar não precisa
     remover job (o velho vira no-op); 3 tentativas, DLQ `eventos-dlq`;
   - idempotente duas vezes: `jobId` (enfileirar de novo não duplica) e a chave única por membro da
     notificação (rodar de novo não avisa duas vezes);
   - ao subir, o worker reenfileira os lembretes de todos os eventos PUBLICADOS que ainda não
     começaram (índice `ix_criadores_eventos_agenda`): Redis perdido ou fila fora do ar no publish
     não perdem lembrete.
7. **Presença** (`src/lib/eventos/presenca.ts`): `confirmarPresenca`/`cancelarPresenca` com
   `ON CONFLICT DO NOTHING` no índice parcial, só em evento PUBLICADO, visível e não terminado;
   escrita + trilha na mesma transação.

## Alternativas Consideradas

- **Job por inscrito** (um delayed job por membro): milhares de jobs por evento e todos teriam de ser
  removidos ao reagendar/cancelar. Um job por (evento, início) faz um `INSERT ... SELECT`.
- **Varredura periódica (repeatable a cada minuto)** procurando eventos que começam em 1 h: mais uma
  peça agendada rodando à toa o dia todo e uma janela de "já avisei?" a manter.
- **Worker próprio para eventos**: mais um container para jobs de milissegundos; o de certificados já
  é o "worker de jobs leves" (o de vídeo fica com o FFmpeg). Fila separada mantém DLQ e opções próprias
  e um PDF atrasado não segura o lembrete (cada `Worker` tem a sua concorrência).
- **Esconder o link só na tela**: o link iria no HTML/JSON da página — qualquer um copia. Sai do
  servidor só na janela.
- **E-mail/WhatsApp no lembrete**: fica para quando o cliente pedir (o sino já existe; RN-134).

## Consequências

### Positivas
- O link não circula antes da hora nem fora do público; a regra de público é uma só para tudo.
- Reagendar e cancelar não exigem limpar a fila; perder o Redis não perde lembrete.

### Negativas / Trade-offs
- Quem confirma presença na última hora (depois do job) não recebe lembrete; evento publicado com
  menos de 1 h de antecedência também não (o job roda na hora, ainda sem inscritos).
- Depois de 15 min antes do início o link vai para o navegador de quem é do público — dali em
  diante ele pode repassar (limite de qualquer sala externa).
- Envio em massa do "publicado" é `INSERT ... SELECT` na requisição (`ponytail:` de ADR-0009).

### Neutras
- Evento cancelado continua visível ("cancelado"), sem link; a gravação é uma aula do catálogo (o
  acesso segue `motivoDoBloqueio`, ADR-0006/0008).
