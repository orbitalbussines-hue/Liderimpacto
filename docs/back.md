# Backend

O backend e o proprio Next.js: Server Components leem, Server Actions escrevem.
Rota de API (`app/api/**/route.ts`) so para quem nao e a tela: webhook, integracao, cron.

## Camadas

```
src/lib/
  db/
    index.ts              # unica conexao (db, Transacao)
    soft-delete.ts        # vivos(), travaDeColisao(), marcaDeExclusao()
    schema/
      _compartilhado.ts   # instante(), dinheiro(), colunasAuditoria
      _enums.ts           # listas de enum (text + CHECK)
      index.ts            # reexporta as tabelas
      <tabela>.ts
    migrations/           # geradas por drizzle-kit — revisar antes de aplicar
  validators/<entidade>.ts  # Zod
  actions/<entidade>.ts     # Server Actions: a regra de negocio mora aqui
  audit/registrar.ts        # trilha, dentro da transacao
  auth/sessao.ts            # obterSessao / obterSessaoDeSeguranca (Better Auth, ADR-0003)
  auth/autorizacao.ts       # exigirSessao / exigirMembro / exigirSuperAdmin (actions)
  auth/guarda.ts            # sessaoDaPagina / membroDaPagina / superAdminDaPagina
  criador/                  # criadorDoHost, criadorAtual (o criador vem do host)
  acao.ts                   # executar() / ErroDeNegocio / Resultado
```

## O caminho de uma escrita

```
tela -> action(dados, updatedAtOriginal)
          executar(async () => {
            exigirMembro(papeis)           # sessao + criador do host + papel (docs/rbac.md)
            schema.parse(...)              # Zod em TODO parametro
            db.transaction(tx =>
              tx.update(...).where(travaDeColisao(...))   # 0 linhas = colisao
              registrarAuditoria(tx, ...)                 # mesma transacao
            )
            revalidatePath(rota)
          })  -> { ok: true, dados } | { ok: false, erro }
```

A implementacao de referencia e `templates/server-action.ts`. Nao copie trechos daqui:
copie o template.

## Actions de membros, grupos, aparencia e criadores (passo 2)

| Action | Arquivo | Quem | Regra |
|--------|---------|------|-------|
| `acaoCadastrarMembro`, `acaoImportarMembros` | `src/lib/actions/membros.ts` | DONO, ADMIN (ADMIN so ALUNO) | RN-104, RN-106 |
| `acaoMudarPapel` | `src/lib/actions/membros-gestao.ts` | DONO | RN-104 |
| `acaoAlterarSituacaoMembro`, `acaoRemoverMembro`, `acaoDefinirGruposDoMembro` | `src/lib/actions/membros-gestao.ts` | DONO, ADMIN (ADMIN so ALUNO) | RN-104 |
| `acaoCriarGrupo`, `acaoRenomearGrupo`, `acaoRemoverGrupo` | `src/lib/actions/grupos.ts` | DONO, ADMIN | RN-105 |
| `acaoSalvarCorDaMarca` | `src/lib/actions/aparencia.ts` | DONO | RN-107 |
| `acaoCriarCriador`, `acaoAlterarSituacaoCriador` | `src/lib/actions/criadores.ts` | SUPER_ADMIN no apex | RN-108 |

Escrita compartilhada (vinculo, grupos, ultimo DONO com trava de linha) em `src/lib/membros/vinculos.ts`;
regra pura em `src/lib/membros/regras.ts`; leitura das telas em `src/lib/membros/consultas.ts`.

## Catálogo e arquivos (passo 3)

| Action | Arquivo | Quem | Audita | Regra |
|--------|---------|------|--------|-------|
| `acaoCriarProduto`, `acaoSalvarProduto`, `acaoAlterarSituacaoProduto`, `acaoDefinirCapaProduto`, `acaoRemoverProduto` | `src/lib/actions/produtos.ts` | DONO, ADMIN | criar / atualizar (campo a campo) / `publicar` / excluir | RN-109, RN-110 |
| `acaoCriarModulo`, `acaoEditarModulo`, `acaoRemoverModulo`, `acaoReordenarModulos`, `acaoCriarAula`, `acaoRemoverAula`, `acaoReordenarAulas` | `src/lib/actions/produtos-estrutura.ts` | DONO, ADMIN | criar / atualizar / excluir / `reordenar` (ordem antes → depois) | RN-111 |
| `acaoSalvarAula`, `acaoDefinirThumbAula`, `acaoAdicionarMaterial`, `acaoRenomearMaterial`, `acaoRemoverMaterial` | `src/lib/actions/aulas.ts` | DONO, ADMIN | criar / atualizar / excluir | RN-111, RN-112 |
| `acaoLinkDoMaterial` | `src/lib/actions/aulas.ts` | DONO, ADMIN | — (leitura: URL de 5 min) | RN-112 |
| `acaoIniciarEnvio`, `acaoConfirmarEnvio` | `src/lib/actions/arquivos.ts` | DONO, ADMIN | criar / atualizar (ou excluir, se o HEAD não bate) | RN-112 |

Tabelas (`src/lib/db/schema/produtos.ts` e `arquivos.ts`): `produtos` → `produtos_modulos` →
`produtos_modulos_aulas` → `produtos_modulos_aulas_materiais`, e `arquivos`. Todas com `criador_id`
e FK composta para o pai do mesmo criador; ordem única por pai entre os vivos. O vínculo aula ×
vídeo NÃO está aqui: o pipeline de vídeo (passo 3b) cria a tabela dele e a coluna na aula.

Leituras das telas em `src/lib/catalogo/consultas.ts`; regra pura (publicação, rótulos) em
`src/lib/catalogo/regras.ts`; invariante "publicado continua publicável" em
`src/lib/catalogo/publicacao.ts`; ordem 1..n em duas fases em `src/lib/catalogo/ordem.ts`
(trava o pai antes; ordem das travas produto → módulo → aula). Decisões no ADR-0004.

### Armazenamento (`src/lib/armazenamento/`)

- `regras.ts` (puro, tela e servidor): `ALLOWLIST`, `validarEnvio(finalidade, {nome, mime, tamanho})`,
  `chaveDoCriador(criadorId, ...segmentos)`, `chavePertenceAoCriador(chave, criadorId)`,
  `chaveDeArquivo(...)`, `mimeDaExtensao`, `atributoAccept`, `formatarTamanho`.
- `cliente.ts` (server-only): `urlDeEnvio` (PUT com tipo e tamanho na assinatura),
  `iniciarEnvioMultipart` / `assinarPartesMultipart` / `concluirEnvioMultipart` /
  `abortarEnvioMultipart`, `urlDeLeitura` (5 min), `urlDeImagem` (janela de 1 h, para o
  `next/image`), `urlDeImagemOuNula`, `cabecalhoDoObjeto` (HEAD), `apagarObjeto`, `prepararBucket`.
  Toda função recebe `{ bucket, criadorId, chave }` e recusa chave fora de `criadores/<criadorId>/`.
- `arquivos.ts` (server-only, dentro da transação de quem chama): `arquivoParaUsar` (deste
  criador, DISPONIVEL, finalidade certa, sem outro uso), `descartarArquivo` (soft delete + trilha,
  devolve a chave) e `apagarObjetosDescartados` (depois do commit, best-effort).
- Buckets criados por `npm run armazenamento:preparar` (idempotente, aplica o CORS).

## Matrículas (passo 4)

Tabela `produtos_matriculas` (`src/lib/db/schema/matriculas.ts`): `criador_id` + FKs compostas
(membro, criador) e (produto, criador); origem `MANUAL|IMPORTACAO|COMPRA`, status
`ATIVA|PENDENTE|CANCELADA` (Expirada = ATIVA com `expira_em` passado, sem job), `iniciada_em`,
`concluida_em` (passo 5: preenchida ao concluir todas as aulas publicadas), `expira_em`, `referencia_externa` (unica por criador quando presente),
`motivo_cancelamento` (CHECK: obrigatorio quando CANCELADA). Uma linha viva por (membro, produto).
Regras RN-116 e RN-117. Nenhuma variavel de ambiente nova.

### Ponto de entrada do gateway

O webhook de compra (gateway ainda nao escolhido) NAO existe ainda. Quando existir, ele resolve o
criador pela conta do gateway, cria/acha a pessoa com `vincularPessoa` (`src/lib/membros/vinculos.ts`)
e chama, numa transacao, a MESMA funcao que as telas usam:

```ts
// src/lib/matriculas/servico.ts
matricular(tx: Transacao, {
  criadorId: string;            // do host / da conta do gateway, nunca do corpo
  membroId: string;             // criadores_membros.id DESTE criador
  produtoId: string;            // produtos.id DESTE criador
  origem: "MANUAL" | "IMPORTACAO" | "COMPRA";
  expiraEm?: Date | null;       // nula = sem expiracao; passada = recusa
  referenciaExterna?: string | null; // "gateway:eventoId" (^[a-z0-9-]{2,30}:\S{1,200}$)
  autor: string | null;         // usuario da sessao; null = sistema (webhook)
  versao?: Date;                // trava otimista (so a tela usa)
  agora?: Date;
}): Promise<{ matriculaId: string; resultado: "criada" | "reativada" | "ja-existia" }>
```

- Idempotente: a mesma `referenciaExterna` devolve a mesma matricula ("ja-existia") sem mudar nada;
  a referencia ja usada em OUTRO par e recusada. Serializa por par com `pg_advisory_xact_lock`.
- Par com matricula valendo: fica como esta. Cancelada, pendente ou expirada: reativa a MESMA linha.
- `autor: null`: a linha fica com `modified_by` = a pessoa matriculada e a trilha com `user_id` nulo.
- Limite conhecido (`ponytail:` no codigo): uma referencia por linha (a mais recente). Renovacao com
  varios eventos pede uma tabela de eventos do gateway, que entra junto com o webhook.

Outras funcoes do servico: `cancelarMatricula`, `alterarExpiracao` (trava pela versao),
`matricularGrupo`, `membrosDoGrupo`. Leituras em `src/lib/matriculas/consultas.ts`
(`matriculaAtiva(criadorId, membroId, produtoId, agora)`, `valeAgora`, lista/contadores da tela,
`matriculasPorMembro`, `alunosPorProduto`, `cursosDoAluno`); regra pura em `regras.ts`
(`situacaoDaMatricula`, `fimDoDiaEmBrasilia`); CSV em `csv.ts` (mesmo `lerCsv` dos membros).

| Action | Arquivo | Quem | Audita | Regra |
|--------|---------|------|--------|-------|
| `acaoMatricular` (pessoas OU grupo × produtos, expiracao opcional, numa transacao) | `src/lib/actions/matriculas.ts` | DONO, ADMIN | criar / atualizar (reativar) por matricula | RN-116 |
| `acaoCancelarMatricula`, `acaoAlterarExpiracao`, `acaoReativarMatricula` | `src/lib/actions/matriculas.ts` | DONO, ADMIN | atualizar (antes → depois, motivo) | RN-116 |
| `acaoBuscarMembros` | `src/lib/actions/matriculas.ts` | DONO, ADMIN | — (leitura) | RN-116 |
| `acaoImportarMatriculas` | `src/lib/actions/matriculas-importacao.ts` | DONO, ADMIN | conta/vinculo/grupo/matricula + resumo da importacao | RN-117 |

## Experiência do aluno (passo 5)

ADR-0006, RN-118 a RN-121. Migração `0004_experiencia_aluno`. Nenhuma variável de ambiente nova.

| Tabela | Para quê |
|--------|----------|
| `produtos_modulos_aulas_progressos` | progresso por (membro, aula), único entre os vivos: `segundos_bitmap` (1 bit/s), `segundos_assistidos`, `max_posicao_seg`, `ultima_posicao_seg`, `percentual`, `concluida`/`concluida_em`/`concluida_por` (`ASSISTIU` ou `MANUAL`), `ultima_visualizacao_dia`, `visualizacao_nova`, `segundos_novos` (sistema: segundos únicos que a ÚLTIMA batida acrescentou, migração 0009); `updated_at` = última batida aceita. Índices: único (membro, aula), (membro, updated_at desc), (criador, concluida_em) e (criador, aula) — o último para o Analytics |
| `produtos_modulos_aulas_visualizacoes` | agregado do Top 10: visualizações por (aula, dia de Brasília); índice (criador, dia) |
| `produtos_modulos_aulas_anotacoes` | anotação (membro, aula, `tempo_seg`, `texto` 1–2000) com trava |
| `criadores_membros_favoritos` | "Minha lista": `produto_id` OU `aula_id` (CHECK), um vivo por alvo |
| `usuarios.reproducao_automatica`, `usuarios.lembretes`, `usuarios.aparecer_no_ranking` | preferências da pessoa (padrão `true`; a última é da gamificação, RN-146) |
| `produtos.publicado_em` | 1ª saída de rascunho (NOVIDADES); preenchida por `acaoAlterarSituacaoProduto` |

Todas com `criador_id` + FKs compostas (membro, criador) e (aula ou produto, criador).

### Escrita (`src/lib/progresso/`)

```ts
// registrar.ts — quem chama JÁ conferiu sessão e acessoDaAula
registrarProgresso(e: {
  criadorId: string; membroId: string; usuarioId: string; aulaId: string;
  intervalos: readonly [number, number][]; // o que TOCOU desde a última batida (s do vídeo)
  posicao: number; duracaoSeg: number;
}): Promise<ProgressoGravado | null>          // null = ignorada (teto, aula sem duração)
concluirManualmente(e: { criadorId; membroId; usuarioId; aulaId }): Promise<ProgressoGravado | null>
type ProgressoGravado = { percentual: number; concluida: boolean; concluidaPor: "ASSISTIU" | "MANUAL" | null;
  concluiuAgora: boolean; ultimaPosicaoSeg: number; segundosAssistidos: number };

// batida.ts — porta única da action e do beacon
receberBatida(quem: { criadorId; membroId: string | null; usuarioId; papel; sessaoId }, entrada: unknown)
  : Promise<{ situacao: "registrada"; progresso: ProgressoGravado } | { situacao: "ignorada" }
           | { situacao: "recusada"; motivo: "sem-acesso" | "nao-encontrada" }>  // corpo inválido: lança ZodError

// regras.ts (puro): esquemaBatida, mesclarIntervalos, prepararBatida, retomarEm(ultima, duracao),
// podeConcluirManual({ id }) (hoje sempre true; o passo 9 lê o construtor aqui), constantes.
```

A batida soma no dia de atividade (`criadores_membros_atividades.segundos`) os segundos ÚNICOS
NOVOS: `segundos_novos = bit_count(OR) − segundos_assistidos` da versão TRAVADA da linha, na mesma
instrução (ADR-0012 item 9). Medido: 5,5–5,7 ms → 6,0–6,5 ms por batida (1.000 sequenciais, local).

### `POST /api/progresso` (beacon)

- **Quando o cliente chama**: `navigator.sendBeacon("/api/progresso", JSON.stringify(corpo))` em
  `pause`, `seeked`, `ended`, `visibilitychange` (hidden) e `pagehide`/`beforeunload`. O heartbeat
  de 10 s durante a reprodução usa a action `acaoRegistrarProgresso` (mesmo corpo), não o beacon.
- **Corpo** (JSON até 4 KB; `text/plain` ou `application/json`; campo a mais = 400):
  `{ aulaId: uuid, intervalos: [[ini, fim], ...], posicao: number, duracaoSeg: number }`.
  `intervalos`: até 20 trechos que REALMENTE tocaram desde a batida anterior, cada um com
  `0 <= ini < fim <= duracaoSeg + 1` e `fim - ini <= 30` (o cliente fecha o trecho a cada batida e
  a cada seek; parado = `[]`). `posicao` = `currentTime`. Depois de enviar, o cliente zera os trechos.
- **Respostas** (sem corpo, `no-store`): `204` registrada OU ignorada (1 batida/3 s por sessão e
  aula; teto 2x o tempo real + 15 s; aula sem vídeo processado), `400` JSON ou corpo inválido,
  `401` sem sessão plena DESTE host, `403` Origin de outro site ou sem acesso à aula
  (matrícula, liberação, pré-requisito), `404` aula não existe neste criador, `413` corpo > 4 KB.
- Recusa não vai para a trilha (o player repete a cada 10 s).

### Leituras para as telas (`src/lib/progresso/consultas.ts`)

Todas recebem `q: QuemPede` = o retorno de `membroDaPagina(TODOS_OS_MEMBROS)` (passe inteiro) e
`agora = new Date()` opcional. Filtram criador do host + vivos + matrícula valendo (ALUNO).
Imagens saem como `imagemChave`; `comImagens(criadorId, itens)` assina e devolve `imagemUrl`
(formato do `ItemFileira`). `ItemCartao = { id, tipo: "AULA" | "PRODUTO", titulo, subtitulo
("Módulo X · Aula Y" ou o tipo do curso), imagemChave, href ("/aula/<id>" ou "/cursos/<slug>") }`.

| Função | Retorno |
|--------|---------|
| `continuarAssistindo(q, limite = 10)` | `(ItemCartao & { progresso: 0–100; produtoTitulo })[]`, 1–94%, recentes primeiro |
| `top10(criadorId, limite = 10)` (`top10.ts`, `"use cache"` 1 h); `top10Agora(criadorId, limite, agora)` sem cache | `(ItemCartao & { posicao: 1..N; visualizacoes })[]`; imagem = capa 3:4 (pôster) |
| `novidades(q, limite = 10)` | `(ItemCartao & { publicadoEm: Date })[]` |
| `minhaLista(q)`; `estaNaLista(q, { produtoId } ou { aulaId })` | `(ItemCartao & { favoritadoEm: Date })[]`; `boolean` |
| `mentorias(q, limite = 10)` | `(ItemCartao & { matriculado: boolean })[]` |
| `progressoDosCursos(q, produtoIds)`; `progressoDoCurso(q, produtoId)` | `Map<produtoId, { concluidas, total, percentual }>`; o objeto |
| `numerosDoPerfil(q)` | `{ aulasConcluidas, segundosAssistidos, cursosConcluidos, certificados /* passo 7: emitidos */, pontos /* soma do razão da gamificação */ }` |
| `preferenciasDoAluno(usuarioId)` | `{ reproducaoAutomatica, lembretes }` |
| `cursoDoAluno(q, slug)` | `null` (404) ou o objeto abaixo |
| `aulaParaPlayer(q, aulaId)` | `null` (404) ou o objeto abaixo |

```ts
cursoDoAluno → {
  produto: { id, titulo, slug, descricao, tipo, status, corMarca, capa3x4Chave, capa16x9Chave },
  professor: { nome, imagem } | null, matriculado: boolean, favorito: boolean,
  modulos: ModuloDoCurso[],   // aluno: só PUBLICADOS; equipe: todos, tudo liberado (prévia)
  progresso: { concluidas, total, percentual },
  proxima: { aulaId, numero: "2.3", titulo, href, rotulo: "Continuar · Aula 2.3" | "Começar · Aula 1.1", retomarEm } | null,
  totais: { aulas, duracaoSeg, materiais },
}
ModuloDoCurso = { id, numero: "01", titulo, totalAulas, duracaoSeg, estado: "concluido" | "andamento" | "bloqueado", aulas: AulaDoCurso[] }
AulaDoCurso = { id, numero: "1.2", titulo, duracaoSeg, thumbChave, href,
  estado: "bloqueada" | "concluida" | "atual" | "pendente", concluida, percentual,
  motivoBloqueio: null | "INDISPONIVEL" | "MATRICULA" | "LIBERACAO" | "AVALIACAO" | "PRE_REQUISITO", // AVALIACAO: passo 7
  liberaEm: Date | null, preRequisito: { id, numero, titulo } | null }

aulaParaPlayer → {
  aula: { id, numero, titulo, descricao, duracaoSeg, capitulos: { inicioSeg, titulo }[], thumbChave },
  modulo: { id, numero, titulo }, produto: { id, titulo, slug, tipo },
  pode: boolean, motivoBloqueio,
  video: { id, situacao: "ENVIANDO" | "PROCESSANDO" | "PRONTO" | "FALHOU" } | null, // PRONTO + pode: acaoIniciarReproducao({ aulaId })
  materiais: { id, nome, tipo: "PDF" | "DOC" | "LINK", url: string | null, tamanhoBytes }[], // [] sem acesso; arquivo: acaoLinkDoMaterial({ materialId })
  anotacoes: { id, tempoSeg, texto, versao }[],     // só as do membro
  progresso: { percentual, concluida, concluidaPor, ultimaPosicaoSeg, segundosAssistidos },
  retomarEm: number,                                 // 0 se parou a menos de 10 s do fim
  anterior, proxima: { id, numero, titulo, href } | null, // vizinhas LIBERADAS na ordem do curso
  playlist: ModuloDoCurso[], progressoDoCurso, favorito: boolean,
  concluirManual: boolean,                           // mostra o botão "Concluir e avançar"
  flags: { abas: { descricao, materiais, comentarios, anotacoes }, playlist, autoplay /* construtor E preferência */,
           contagemAutoplaySeg: 5, velocidade, marcadores, aulasParaCertificado: number | null }, // passo 9: `player` publicado
// aulaParaPlayer(q, aulaId, agora?, player = PLAYER_PADRAO): a página passa `(await configPublicada(criadorId))?.player`.
// aulasParaCertificado = aulas que faltam, só com o aviso ligado, ALUNO matriculado e falta > 0.
}
```

| Action | Arquivo | Quem | Audita | Regra |
|--------|---------|------|--------|-------|
| `acaoRegistrarProgresso(corpo do beacon)`: `{ situacao, progresso? }` | `src/lib/actions/progresso.ts` | quem `podeAssistir` | não (dado quente) | RN-118 |
| `acaoConcluirAula({ aulaId })`: `ProgressoGravado` | `src/lib/actions/progresso.ts` | quem `podeAssistir` (com vínculo) | atualizar (1ª vez) | RN-118 |
| `acaoFavoritar`, `acaoDesfavoritar({ produtoId } ou { aulaId })`: `{ favorito }` | `src/lib/actions/favoritos.ts` | membro com vínculo | criar, atualizar, excluir | RN-119 |
| `acaoCriarAnotacao({ aulaId, tempoSeg, texto })`: `{ id, versao }`; `acaoEditarAnotacao({ anotacaoId, versao, texto, tempoSeg? })`: `{ versao }`; `acaoRemoverAnotacao({ anotacaoId, versao })` | `src/lib/actions/anotacoes.ts` | o próprio membro (criar: quem `podeAssistir`) | criar, atualizar, excluir | RN-120 |
| `acaoSalvarPreferencias({ reproducaoAutomatica?, lembretes? })`: as duas | `src/lib/actions/preferencias.ts` | a própria sessão | atualizar (antes e depois) | RN-121 |
| `acaoSalvarPerfil({ nome, whatsapp, empresaCargo, versao })`: dados pessoais de "Meu perfil" (WhatsApp BR por regex; vazio vira nulo; e-mail não muda aqui) | `src/lib/actions/perfil.ts` | a própria sessão (nenhum id no corpo) | atualizar (antes e depois), trava pelo `updated_at` | RN-121 |
| `acaoLinkDoMaterial({ materialId })`: `{ url }` (5 min) | `src/lib/actions/aulas.ts` | equipe; ALUNO se `podeAssistir` a aula | não (leitura) | RN-114 |

## Construtor da vitrine (passo 9)

RN-135 a RN-138, ADR-0010. Tabelas `criadores_vitrines` (1 rascunho vivo por criador, `rascunho`
jsonb; `updated_at` = trava do autosave) e `criadores_vitrines_versoes` (número 1..n único, `config`
jsonb imutável, `publicada_por` FK usuário, `publicada_em`). Migração `0008_vitrine_construtor.sql`
(só aditiva).

### Config (`src/lib/vitrine/config.ts`, puro: servidor e tela)

```ts
ConfigVitrine = {
  destaque: { imagemArquivoId: uuid | null /* null = capa 16:9 do curso */, selo: string | null /* null = "N AULAS" */,
              titulo, descricao, botaoPrincipal: Botao, botaoSecundario: Botao | null, mostrarAvisos },
  fileiras: { id /* estável */, titulo /* {nome} */, tipo: CONTINUAR|TOP10|NOVIDADES|TRILHAS|MENTORIAS|LISTA|MANUAL,
              quantidade: 3|5|7|10, ordenacao: MANUAL|RECENTES|MAIS_ASSISTIDOS /* ORDENACOES_DO_TIPO */,
              grupos: uuid[] /* [] = todos */, visivel, itensManuais: { tipo: PRODUTO|AULA, id }[] /* ≤ 10, só MANUAL */ }[] /* ≤ 20 */,
  player: { abas: { descricao, materiais, comentarios, anotacoes }, playlist, autoplay, velocidade, marcadores, avisoCertificado },
}
Botao = { texto, acao: CURSO|AULA|CONTINUAR|LINK, alvo /* CURSO/CONTINUAR: produto (CONTINUAR null = onde parou); AULA: aula; LINK: "/..." */ }
```

`configVitrineSchema` (strictObject em tudo), `configPadrao(curso)`, `FILEIRAS_PADRAO`, `PLAYER_PADRAO`,
`mesmaConfig`, `resumoDaMudanca`, `fileiraParaQuem`, `referenciasDaConfig`, `tituloComNome`.

### Leituras

| Função | Arquivo | Retorno |
|--------|---------|---------|
| `configPublicada(criadorId)` | `vitrine/cache.ts` (`"use cache"`, etiqueta `vitrine:<criador>`, `max`) | `ConfigVitrine \| null` |
| `publicadaAgora`, `rascunhoAtual`, `rascunhoEfetivo`, `versoesDaVitrine`, `dadosDoConstrutor`, `rascunhoPadrao`, `cursoPrincipal`, `rotulosDasReferencias`, `opcoesDoConstrutor`, `buscarConteudos` | `vitrine/dados.ts` (sem cache) | tela do construtor |
| `vitrineDoAluno(q)` / `previaDaVitrine(q, rascunho)` (só equipe; aluno = erro) | `vitrine/resolver.ts` | `{ destaque: DestaqueConfig \| null, fileiras: { id, titulo, variante, tag?, itens: ItemFileira[] }[] }` (só as com itens) |
| `fileirasVisiveis(q, config)`, `resolverFileira(q, f)`, `resolverDestaque(q, d \| null)`, `gruposDoMembro(q)` | `vitrine/resolver.ts` | peças usadas por `/` e `/previa-vitrine` (`VitrineMontada`) |
| `cartoesEscolhidos(q, itens)`, `visualizacoesPorProduto(criadorId, dias)` | `progresso/consultas.ts` | fileira MANUAL (só o que a pessoa abre) e "mais assistidos" |

### Actions (`src/lib/actions/vitrine.ts`; `executar()` → `Resultado`; `exigirMembro(EQUIPE)`; criador do HOST)

| Action | Retorno | Audita | Regra |
|--------|---------|--------|-------|
| `acaoSalvarRascunhoVitrine({ versao: iso \| null, config })` | `{ versao }` | criar/atualizar com o resumo do que mudou | trava (null = nunca salvo); refs deste criador |
| `acaoPublicarVitrine({ versao })` | `{ numero, publicadaEm, versao }` | publicar (config inteira) + `updateTag` | versão n+1; sem rascunho publica o padrão |
| `acaoReverterVitrine({ versao, numero })` | `{ versao, config }` | atualizar | versão → rascunho (não publica) |
| `acaoDescartarRascunhoVitrine({ versao })` | `{ versao, config }` | atualizar | rascunho ← publicada (ou padrão) |
| `acaoBuscarConteudoVitrine({ termo })` | `{ tipo, id, titulo, detalhe }[]` | não | cursos e aulas do criador |
| `acaoPrepararImagemDestaque({ arquivoId })` | `{ url }` | não | IMAGEM DISPONIVEL deste criador |

Página `/previa-vitrine` (grupo `(aluno)`, só equipe): a vitrine com o rascunho; `?v=` força recarregar,
`?sel=` marca o bloco; ponte `postMessage` (`vitrine:selecionar` / `vitrine:clique` / `vitrine:altura`)
com origem conferida.

## Painel do admin (passo 6)

ADR-0007, RN-122. Migração `0005_painel_atividades`. Nenhuma variável de ambiente nova.

| Tabela / índice | Para quê |
|--------|----------|
| `criadores_membros_atividades` | um dia de atividade de aula por (membro, dia de Brasília), único entre os vivos; índice (criador, dia). Escrito pelo upsert do progresso (`registrar.ts`, CTE `ativ`: cria na 1ª batida do dia e soma `segundos` — segundos únicos novos do dia, migração 0009 — a cada batida com segundo novo) e pela conclusão pelo botão (segundos 0); carga inicial pelo progresso existente |
| `ix_produtos_modulos_aulas_progressos_concluidas` | (criador, `concluida_em` desc) onde concluída e viva: "Aulas concluídas" e "Acontecendo agora" |

Período (`src/lib/painel/periodo.ts`, puro e testado; o mesmo do Analytics e dos Logs):
`?de=AAAA-MM-DD&ate=AAAA-MM-DD`, dias de Brasília, ambos inclusivos. `lerIntervalo(searchParams, hoje)` (com `hoje` de
`hojeEmBrasilia()` injetado) aceita só formato válido + data que existe + `de ≤ ate ≤ hoje` + no máximo 366 dias; senão
cai no legado `?periodo=7|30|90` (últimos N dias) e, sem nada, nos **últimos 30 dias**. Devolve `{ de, ate, dias }`.
**Período anterior** (`periodoAnterior`) = os mesmos N dias imediatamente antes de `de`. Nas consultas, `limites(periodo)`
monta a CTE `t` com `ini`/`fim`/`ini_ant` (dias) e `t_ini`/`t_ini_ant`/`t_fim` = meia-noite de Brasília convertida
(`t_fim` = meia-noite do dia SEGUINTE a `ate`, exclusivo): dia entra se `between ini and fim`, instante se
`>= t_ini and < t_fim`. **Nada depois de `ate` conta** (um intervalo no passado não vê atividade posterior). Comparar
instante com a meia-noite convertida usa o índice; nada de `::date` em UTC. Atalhos do seletor (`intervaloDoAtalho`):
hoje, ontem, últimos 7/30/90 dias, este mês, mês passado, últimos 3/6/12 meses (do dia seguinte ao mesmo dia N meses
atrás até hoje). Métricas de aluno contam só vínculos vivos com papel ALUNO.

| Função (`src/lib/painel/`) | Retorno / definição | Cache |
|--------|----------|----------|
| `kpisDoPainel(criadorId, periodo)` | `{ ativos, ativosAnt, novos, novosAnt, matriculas, matriculasAnt, validas, validasConcluidas, aulas, aulasAnt }`. Ativos = alunos distintos com dia em `criadores_membros_atividades`; novos = `criadores_membros.created_at`; matrículas = `produtos_matriculas.iniciada_em` (criação e reativação gravam o início); válidas = ATIVA e não expirada agora (taxa = `validasConcluidas / validas`, `concluida_em` preenchida); aulas = `concluida_em` do progresso | `kpisCacheados` |
| `acessosPorDia(criadorId)` | `{ dia: "AAAA-MM-DD", alunos }[]`, sempre 14 (hoje por último), zeros por `generate_series` | `acessosCacheados` |
| `maisAssistidas(criadorId, periodo, limite = 5)` | `{ aulaId, titulo, curso, visualizacoes }[]`: soma de `produtos_modulos_aulas_visualizacoes` no período (aula, módulo e produto vivos) | `maisAssistidasCacheadas` |
| `saudeDosProdutos(criadorId)` | `{ publicados, taxaMedia: 0..1 \| null, alunosComMatricula }`: média por produto PUBLICADO das taxas de conclusão das matrículas válidas | `saudeCacheada` |
| `acontecendoAgora(criadorId, limite = 8)` | `EventoPainel[]` (`matricula`, `reativacao`, `membro`, `publicacao`, `video`, `conclusao`), mais recentes primeiro. Trilha: `produtos_matriculas` criar/atualizar com `iniciada_em`, `criadores_membros` criar, `produtos` publicar → PUBLICADO, `produtos_modulos_aulas_videos` → PRONTO; progresso: `concluida_em` de ALUNO. Só ids da trilha + nome/título por JOIN; `detalhes` (pode ter e-mail) nunca é lido. Número "3.2" = posição entre módulos publicados e aulas vivas | nenhum |

Regras puras em `regras.ts` (testadas): `variacao` (base zero = "novo", os dois zero = "sem-dados"),
`textoDaVariacao` (seta + sinal + versão por extenso), `tempoRelativo` ("há 5 min", "21/09 · 14:44"
em Brasília), `fraseDoEvento`. Cache (`cache.ts`): `"use cache"` + `cacheLife("minutes")` +
`cacheTag("painel:<criador>")` (a chave inclui o período `de`/`ate`), chamado só DEPOIS de `membroDaPagina(EQUIPE)` em cada bloco.
Tela: `src/app/admin/page.tsx` + `_components/` (um `<Suspense>` com esqueleto por bloco).

## Analytics do admin (`/admin/analytics`)

RN-139. Sem tabela nova nem variável nova (a migração 0009 acrescentou `criadores_membros_atividades.segundos`
e os índices (criador, aula) do progresso e (criador, `finalizada_em`) das tentativas — ADR-0012): lê as tabelas do progresso (ADR-0006), do
painel (ADR-0007), das matrículas e das avaliações. Filtros na URL: `?aba=visao-geral|conteudo|retencao|avaliacoes`,
`?de=&ate=` (o `lerIntervalo` e os limites `limites()` do painel — ver "Período" no Painel; legado `?periodo=`), `?curso=<produto>` (uuid; de outro criador = "todos") e `?ordem=estrutura` no Conteúdo.
Em todas: criador do HOST, vivos em cada tabela (produto, módulo, aula, avaliação, questão, vínculo) e só vínculos
vivos com papel ALUNO.

| Métrica | Definição exata | Fonte | Período / curso |
|---------|-----------------|-------|-----------------|
| Alunos ativos | alunos distintos com dia em `criadores_membros_atividades` | atividades | período e anterior. Com curso: alunos com progresso no curso e `updated_at` (última batida) no período; anterior = nulo ("indisponível por curso": a batida nova apaga a anterior). Por isso, com curso e intervalo no passado, quem voltou a assistir depois de `ate` não conta |
| Horas assistidas | sem curso: soma de `criadores_membros_atividades.segundos` (segundos ÚNICOS NOVOS do dia; rever não soma; dias antes de 14/10/2026 = 0). Com curso: soma de `segundos_assistidos` (bitmap) nas aulas do curso | atividades / progresso | sem curso: período e anterior (`recorte: "periodo"`). Com curso: **acumulado** desde sempre, sem comparação (`recorte: "acumulado"`: o dia não guarda a aula) |
| Aulas concluídas | progressos com `concluida_em` no período | progresso | período e anterior; filtra curso |
| Conclusão de cursos | matrículas valendo (ATIVA, não expirada) com `concluida_em` ÷ matrículas valendo, hoje; e matrículas com `concluida_em` no período | matrículas | taxa = hoje; contagem = período e anterior; filtra curso |
| Aprovação em avaliações | pares (aluno, avaliação) com ≥ 1 tentativa aprovada ÷ pares com tentativa finalizada (`finalizada_em`) | tentativas | período e anterior (variação em p.p.); filtra curso |
| Série "Alunos ativos por dia" | alunos distintos por dia, um ponto por dia com zeros; acima de 92 dias, um ponto por SEMANA (segunda a domingo, recortada no período; alunos distintos na semana) e a tela diz "por semana" | atividades | período; **não** separa por curso (dito na tela) |
| Série "Visualizações de aula por dia" | soma de `produtos_modulos_aulas_visualizacoes` (1 por aluno, aula e dia); acima de 92 dias, soma por semana | agregado do Top 10 | período; filtra curso |
| Conteúdo por aula | começaram = progresso com segundo assistido ou concluído; concluíram; **abandono = começaram e não concluídos (abaixo de 90%) ÷ começaram**; tempo médio = média dos segundos únicos de quem começou; maior queda = maior abandono (empate: mais gente parada) | progresso | situação de hoje (sem período); aulas vivas de módulos PUBLICADOS; filtra curso |
| Conteúdo por curso | alunos distintos que começaram alguma aula (módulo publicado); matrículas de aluno com o curso concluído; segundos do curso ÷ quem começou | progresso, matrículas | hoje; filtra curso |
| Retenção (coortes) | aluno entra na semana (segunda a domingo, Brasília) da PRIMEIRA matrícula viva; célula k = % da coorte com dia de atividade de aula k semanas depois; 8 semanas, a atual inclusive; < 5 alunos = amostra pequena | matrículas, atividades | fixas 8 semanas; com curso, a coorte é a 1ª matrícula NAQUELE curso, mas a atividade vale em qualquer aula |
| Avaliações | por avaliação viva (publicada, ou com tentativa no período): tentativas, alunos distintos, alunos com ≥ 1 aprovada, nota média das tentativas; top 3 questões por erros (`correcao` congelada; empate pela taxa); questão removida aparece como "removida" | tentativas, questões | período; filtra curso |

| Função (`src/lib/analytics/`) | Retorno | Cache (`cache.ts`) |
|--------|---------|-------|
| `cursosDoCriador(criadorId)` | `{ id, titulo }[]` (produtos vivos) | `cursosCacheados` |
| `kpisAnalytics(criadorId, periodo, curso)` | `{ ativos, ativosAnt \| null, aulas, aulasAnt, validas, validasConcluidas, cursosConcluidos, cursosConcluidosAnt, avaliados, aprovados, avaliadosAnt, aprovadosAnt }`, UMA instrução | `visaoGeralCacheada` |
| `horasAssistidas(criadorId, periodo, curso)` | sem curso `{ segundos, segundosAnt, recorte: "periodo" }`; com curso `{ segundos, segundosAnt: null, recorte: "acumulado" }` | idem |
| `serieDiaria(criadorId, periodo, curso)` | `{ dia, alunos, visualizacoes }[]` de `de` a `ate`; por semana acima de 92 dias (`agrupamentoDaSerie`; `dia` = 1º dia da semana dentro do período) | idem |
| `conteudo(criadorId, curso)` | `{ cursos: CursoConteudo[], aulas: AulaAnalytics[] }` (duas instruções em paralelo) | `conteudoCacheado` |
| `coortes(criadorId, curso)` | `LinhaCoorte[]` (8, a mais antiga primeiro) | `coortesCacheadas` |
| `avaliacoesAnalytics(criadorId, periodo, curso)` (`consultas-avaliacoes.ts`) | `AvaliacaoAnalytics[]` com `questoes` (top 3), duas instruções | `avaliacoesCacheadas` |

Cache: `"use cache"` + `cacheLife("minutes")` + `cacheTag("analytics:<criador>")` (chave com criador, `de`/`ate` e curso), chamado só DEPOIS de
`membroDaPagina(EQUIPE)` (`src/app/admin/analytics/_components/contexto.ts`). Regras puras em `regras.ts` (testadas):
`lerAba`, `lerCurso`, `lerOrdem`, `consulta`, `taxa` (base zero = nula), `variacaoEmPontos`, `formatarHoras`,
`formatarDuracao`, `abandono`, `maiorQueda`, `ordenarAulas`, `montarCoortes`, `faixaDeCalor`, `gerarCsv`.

### `GET /admin/analytics/exportar?aba=&de=&ate=&curso=&ordem=` (CSV)

- Route handler `src/app/admin/analytics/exportar/route.ts` → `atenderExportacao(req)` (`src/lib/analytics/exportar.ts`).
- Sessão PLENA do host (cookie de outro host não vale) + papel DONO/ADMIN lido do banco (`avaliarMembro`, recusa na
  trilha): `401` sem sessão, `403` ALUNO ou apex, `200` `text/csv; charset=utf-8` com `Content-Disposition: attachment`
  (`analytics-<aba>-<de>-a-<ate>.csv` nas abas com período; `analytics-<aba>-<hoje>.csv` em Conteúdo e Retenção) e
  `Cache-Control: no-store`. Lê SEM cache (sai fresco). Período com a MESMA leitura da tela (`lerIntervalo`, legado
  `periodo=` aceito); série por semana acima de 92 dias (1ª coluna `semana_inicio`).
- **Decisão: só agregados.** Nenhuma linha por aluno, nenhum nome, e-mail ou id de pessoa; ids só de curso, aula e
  avaliação (para cruzar planilhas). Formato para o Excel PT-BR: `;`, vírgula decimal, BOM, CRLF; taxas em fração 0..1;
  texto que começa com `= + - @` ganha `'` (não vira fórmula). Colunas em `src/lib/analytics/csv.ts`.

Tela: `src/app/admin/analytics/page.tsx` + `_components/` (filtros = abas em link, curso por form GET, período pelo
`SeletorDatas` só nas abas que o usam, preservando `aba`/`curso`/`ordem`; uma aba por `<Suspense>`; `GraficoBarrasDia` = barras CSS de um eixo no estilo do `GraficoAcessos`).

## Avaliações, certificados e trilhas (passo 7)

ADR-0008, RN-123 a RN-129 (padrões aguardando o cliente). Migração `0006_avaliacoes_certificados_trilhas`.
Nenhuma variável de ambiente nova (o worker usa `DATABASE_URL`, `S3_*`, `REDIS_URL`,
`VIDEO_FILA_PREFIXO` e `PLATAFORMA_DOMINIO`). Pacotes novos: `pdf-lib`, `@pdf-lib/fontkit`,
`@fontsource/newsreader`, `@fontsource/plus-jakarta-sans` (fontes OFL, WOFF lido pelo worker).

| Tabela | Para quê |
|--------|----------|
| `produtos_avaliacoes` | avaliação do produto (módulo opcional, FK composta (módulo, produto, criador)): tipo QUIZ/PROVA/SIMULADO, `nota_minima` (70), `tentativas_max` (3; 0 = ilimitado), `tempo_limite_min`, `obrigatoria_para_certificado`, `libera_proximo_modulo` (CHECK: só com módulo), `embaralhar`, `exige_aulas_concluidas` (true), status RASCUNHO/PUBLICADA, `publicada_em` |
| `produtos_avaliacoes_questoes` | ordem 1..n (único entre vivos), tipo UNICA/MULTIPLA/VERDADEIRO_FALSO, `enunciado`, `opcoes` jsonb `{ id: "a".."h", texto }[]` (2–8), **`gabarito` jsonb (ids) separado**, `peso` 1–100, `explicacao` |
| `produtos_avaliacoes_tentativas` | `numero`, `iniciada_em`, `prazo_em`, `finalizada_em`/`finalizada_por` (ALUNO/TEMPO), `ordem` (sorteio congelado), `respostas` jsonb `{ questaoId: ids[] }`, `nota` numeric(4,1), `aprovada`, `correcao` congelada. Único parcial: UMA aberta por (membro, avaliação) |
| `produtos_avaliacoes_concessoes` | tentativas extras (1–10) com motivo |
| `criadores_certificados_modelos` | modelo padrão (`produto_id` nulo, um vivo por criador) ou do curso (um vivo por produto): título, texto com variáveis, assinatura, cor |
| `produtos_certificados` | um vivo por (membro, produto) — idempotência; `codigo` único em todas as linhas (CHECK do alfabeto), `matricula_id`, situação EMITIDO/REVOGADO (+ `revogado_em`, `motivo_revogacao`) |
| `produtos_certificados_versoes` | v1, v2… (única por certificado), situação PENDENTE/PRONTA/FALHOU, `dados` congelados (`DadosCertificado`), `arquivo_id` (PDF em `arquivos`, finalidade CERTIFICADO), `gerada_em`, `erro` legível |
| `criadores_trilhas` | título, descrição, tag, capa (`arquivos`), status RASCUNHO/PUBLICADA, `publicada_em` |
| `criadores_trilhas_itens` | ordem 1..n, tipo PRODUTO/AVALIACAO (CHECK com o alvo), `exige_anterior` (true); o mesmo alvo uma vez por trilha |

Também: `arquivos.finalidade` aceita `CERTIFICADO` (só o worker grava; o envio do navegador
continua IMAGEM/MATERIAL), `produtos_modulos` ganhou UNIQUE (id, produto_id, criador_id) e a capa de
trilha conta como uso em `arquivoParaUsar`. `motivoDoBloqueio` ganhou `AVALIACAO` (RN-125).

### Serviços (`src/lib/avaliacoes/`, `src/lib/certificados/`, `src/lib/trilhas/`)

```ts
// avaliacoes/situacao.ts — base de tudo (uma ida ao banco por lista)
type QuemAvalia = { criadorId: string; membroId: string | null; papel: PapelCriador | null };
situacoesDoMembro(quem, { avaliacaoIds?, somentePublicadas?, condicao? }, agora?, exec?): Promise<SituacaoAvaliacao[]>
disponibilidade(quem, avaliacaoId, agora?): Promise<SituacaoAvaliacao | null>      // null = não existe neste criador
SituacaoAvaliacao = { id, titulo, tipo, status, instrucoes, notaMinima, tentativasMax, tempoLimiteMin, embaralhar,
  exigeAulasConcluidas, obrigatoriaParaCertificado, liberaProximoModulo,
  produto: { id, titulo, slug, status }, modulo: { id, titulo, ordem, status } | null, questoes,
  matriculaValendo, moduloTravado, aulasPendentes, finalizadas, extras, aberta: { id, prazoEm } | null,
  aprovada, melhorNota: number | null, restantes: number | null /* null = ilimitado ou equipe */,
  motivo: null | "INDISPONIVEL" | "MATRICULA" | "MODULO_BLOQUEADO" | "AULAS_PENDENTES" | "TENTATIVAS_ESGOTADAS" }

// avaliacoes/tentativas.ts — QuemFaz = QuemAvalia & { membroId: string; usuarioId: string }
iniciarTentativa(quem, avaliacaoId, agora?): Promise<{ tentativaId; retomada: boolean }>   // retoma a aberta
responder(quem, { tentativaId, questaoId, opcoes: string[] }, agora?): Promise<{ situacao: "salva" } | { situacao: "encerrada"; tentativaId }>
finalizarTentativa(quem, tentativaId, "ALUNO" | "TEMPO", agora?): Promise<{ tentativaId; nota; aprovada; finalizadaPor }>  // idempotente; aprovou -> verificarEmissao
finalizarVencidas(quem, agora?, avaliacaoIds?): Promise<number>
concederTentativa({ criadorId, autorId, avaliacaoId, membroId, quantidade, motivo }): Promise<{ concessaoId }>

// avaliacoes/regras.ts (puro, testado): corrigir, questaoCorreta, notaComUmaCasa, aprovou, montarOrdem,
// tentativasRestantes, revelaGabarito(tipo, aprovado, restantes), motivoDaAvaliacao, TEXTO_MOTIVO_AVALIACAO,
// cardDaAvaliacao, metaDaAvaliacao, formatarNota, segundosRestantes, ROTULO_TIPO_AVALIACAO, ROTULO_TIPO_QUESTAO
// avaliacoes/sql.ts: aprovadoSql, avaliacaoPendenteSql (usado por acessoDaAula)
// avaliacoes/estrutura.ts: avaliacoesDoProduto(criadorId, produtoId, membroId), avaliacaoQueTrava(lista, moduloOrdem)

// certificados/emissao.ts
elegivel(criadorId, membroId, produtoId, exec?): Promise<{ matriculaId; concluidaEm } | null>
emitir(criadorId, membroId, produtoId, autorId?): Promise<{ certificadoId; novo } | null>        // idempotente; v1 na fila
verificarEmissao(criadorId, membroId, produtoId): Promise<{ certificadoId; novo } | null>       // nunca lança
gerarNovaVersao(criadorId, certificadoId, autorId): Promise<{ versaoId; versao; enfileirado }>
revogar({ criadorId, certificadoId, versao: Date, motivo, autorId }): Promise<{ versao: string }>
dadosDaVersao(tx, criadorId, { produtoId, membroId, codigo, concluidaEm }): Promise<DadosCertificado>
// certificados/regras.ts (puro): gerarCodigo, normalizarCodigo, codigoLegivel, RE_CODIGO, MODELO_PADRAO,
// preencherTexto, cargaHorariaTexto, dataPorExtenso, urlDeVerificacao, corDoCertificado, nomeDoPdf
// certificados/pdf.ts (SÓ worker/testes/seed — nunca importar numa tela): gerarPdfCertificado(dados): Promise<Uint8Array>
// certificados/worker.ts: processarVersao(versaoId): "pronta" | "ja-pronta" | "ignorada"; marcarFalhaDaVersao; versoesPendentes
// certificados/fila.ts: fila "certificados" (prefixo VIDEO_FILA_PREFIXO), { versaoId }, jobId = versaoId, 3 tentativas, DLQ "certificados-dlq"
```

### Leituras para as telas

Todas recebem `q: QuemPede` (o `membroDaPagina(...)` inteiro) e `agora` opcional; criador do HOST.

| Função | Retorno |
|--------|---------|
| `avaliacoesDoAluno(q)` (`avaliacoes/consultas.ts`) — tela 6 | `CardAvaliacao[]`: `{ id, titulo, tipo, tipoRotulo, curso: { id, titulo, slug }, modulo: { id, titulo } \| null, meta: "10 questões · 15 min · nota mínima 70%", questoes, tempoLimiteMin, notaMinima, situacao: "CONCLUIDA" \| "EM_ANDAMENTO" \| "DISPONIVEL" \| "BLOQUEADA", rotulo: "Concluída · 92%" \| "Em andamento" \| "Disponível" \| "Disponível · melhor nota 40%" \| "Bloqueada · <motivo>", cta: "Ver resultado" \| "Continuar" \| "Iniciar" \| "Tentar de novo" \| null, motivo, aprovada, melhorNota, tentativasRestantes, tentativaAbertaId, obrigatoriaParaCertificado, href: "/avaliacoes/<id>" }`. Aluno: só cursos com matrícula valendo; equipe: todas as publicadas |
| `avaliacaoDoAluno(q, avaliacaoId)` — entrada da avaliação | `null` (404: rascunho, curso em rascunho, módulo oculto, outro criador) ou `CardAvaliacao & { instrucoes, embaralhar, aulasPendentes, tentativas: { id, numero, iniciadaEm, finalizadaEm, finalizadaPor, nota, aprovada }[] }` (sem matrícula: aparece com `motivo: "MATRICULA"`) |
| `tentativaParaResponder(q, tentativaId)` — responder | `null` (não é do membro) \| `{ situacao: "encerrada", tentativaId }` (prazo/finalizada: ir ao resultado) \| `{ situacao: "aberta", avaliacao: { id, titulo, tipo, instrucoes, notaMinima, tempoLimiteMin }, tentativa: { id, numero, iniciadaEm, prazoEm, segundosRestantes: number \| null }, questoes: { id, numero, tipo, enunciado, peso, opcoes: { id, texto }[] /* ordem sorteada, SEM gabarito */, resposta: string[] }[] }` |
| `resultadoDaTentativa(q, tentativaId)` — resultado | `null` ou `{ avaliacao: { id, titulo, tipo, notaMinima, curso: { titulo, slug } }, tentativa: { id, numero, nota, aprovada, finalizadaPor, iniciadaEm, finalizadaEm, duracaoSeg, acertos, total }, melhorNota, aprovadaAlgumaVez, tentativasRestantes, revelaGabarito, podeTentarDeNovo, questoes: { id, numero, tipo, enunciado, peso, correta, opcoes: { id, texto, marcada, correta: boolean \| null }, explicacao: string \| null }[] }`. `correta` por opção e `explicacao` = `null` quando `revelaGabarito` é falso |
| `cursoDoAluno` / `aulaParaPlayer` (passo 5, atualizadas) | `AulaDoCurso.motivoBloqueio` pode ser `"AVALIACAO"` com `avaliacaoPendente: { id, titulo } \| null`; `ModuloDoCurso.avaliacoes: AvaliacaoNoCurso[]` (`{ id, titulo, tipo, aprovada, melhorNota, liberaProximoModulo, obrigatoriaParaCertificado, href }`); `cursoDoAluno().avaliacoesDoCurso` (as sem módulo) |
| `avaliacoesDoAdmin(criadorId, { busca?, produtoId?, status? })` (`avaliacoes/admin.ts`) | `{ resumo: { total, publicadas, tentativas, aprovacaoMedia: 0..1 \| null }, linhas: { id, titulo, tipo, tipoRotulo, status, notaMinima, obrigatoriaParaCertificado, liberaProximoModulo, versao, produto: { id, titulo }, modulo, questoes, tentativas, alunos, aprovados, taxaAprovacao: 0..1 \| null, notaMedia /* média da melhor nota de cada aluno */ }[] }` — só ALUNO conta |
| `avaliacaoParaEditar(criadorId, avaliacaoId)` | `null` ou `{ avaliacao: { id, versao, produto, moduloId, status, publicadaEm, campos /* = camposAvaliacaoSchema */ }, modulos: { id, titulo, ordem, status }[], questoes: { id, ordem, versao, questao /* = questaoSchema: opções com correta */ }[] }` |
| `alunosDaAvaliacao(criadorId, avaliacaoId)` | `null` ou `{ membroId, nome, email, imagem, finalizadas, emAndamento, melhorNota, aprovada, ultimaEm, extras, tentativasRestantes, podeConceder }[]` |
| `certificadosDoAluno(q)` (`certificados/consultas.ts`) — tela 9 | `{ emitidos: { id, codigo, codigoLegivel, curso: { id, titulo, slug }, situacao, emitidoEm, revogadoEm, nome, titulo, texto, cargaHoraria: "9 horas", urlVerificacao, pdf: { versao, situacao } \| null }[], bloqueados: { curso, percentual, aulasRestantes, avaliacoesPendentes: { id, titulo, href }[] }[] }` (emite antes quem já está elegível) |
| `numerosDoPerfil(q)` (passo 5) | `certificados` = emitidos não revogados |
| `urlDoPdf(criadorId, certificadoId)` / `urlDoPdfPorCodigo(criadorId, codigo)` | `{ url /* 5 min, attachment */, versao }` da última PRONTA, ou `null` (revogado, sem PDF pronto, outro criador) |
| `verificarPublico(criadorId, codigo)` — página `/certificado/[codigo]` (sem sessão) | `null` (404) ou `{ situacao: "VALIDO" \| "REVOGADO", codigo, codigoLegivel, nome, curso, cargaHoraria, concluidoEm, emitidoEm, revogadoEm, criador, temPdf }` — nada além disso |
| `certificadosDoAdmin(criadorId, { busca? /* nome, e-mail ou código */, produtoId?, situacao?, pagina, porPagina })` | `{ resumo: { emitidos, revogados, ultimos30, pdfPendentes }, total, linhas: { id, codigo, codigoLegivel, situacao, emitidoEm, revogadoEm, motivoRevogacao, versao /* trava da revogação */, aluno: { nome, email, imagem }, curso: { id, titulo }, pdf }[] }` |
| `versoesDoCertificado(criadorId, certificadoId)` | `{ versao, situacao, geradaEm, erro, pedidaEm, tamanhoBytes }[]` (mais nova primeiro) |
| `modeloDeCertificado(criadorId, produtoId \| null)`; `produtosComModelo(criadorId, ids)` | `{ produtoId, versao /* null = criar */, origem: "PROPRIO" \| "PADRAO_DO_CRIADOR" \| "EMBUTIDO", titulo, texto, assinaturaNome, assinaturaCargo, cor }`; `Set<produtoId>` |
| `trilhasDoAluno(q)`, `trilhaDoAluno(q, id)` (`trilhas/consultas.ts`) — tela 7 | `TrilhaDoAluno = { id, titulo, descricao, tag, capaChave, etapas, concluidas, percentual, textoEtapas: "3 de 5 etapas", duracaoSeg, cta: "Iniciar" \| "Continuar" \| "Rever", proximoPasso: { itemId, titulo, href, estado, textoMotivo } \| null, itens: { id, numero, tipo, titulo, subtitulo, href, exigeAnterior, estado: "concluido" \| "andamento" \| "disponivel" \| "bloqueado", motivo, textoMotivo: "Conclua a etapa anterior" \| "Matricule-se" \| ..., percentual, duracaoSeg }[] }` |
| `trilhasParaVitrine(q, limite = 10)` | `(ItemCartao & { progresso })[]` com `tipo: "TRILHA"`, `href: "/trilhas/<id>"`, imagem = capa (use `comImagens`) |
| `trilhasDoAdmin(criadorId)`; `trilhaParaEditar(criadorId, id)` | `{ id, titulo, tag, status, publicadaEm, versao, capaChave, itens }[]`; `null` ou `{ trilha: { id, versao, status, publicadaEm, capaChave, campos }, itens: { id, ordem, tipo, exigeAnterior, versao, produtoId, avaliacaoId, titulo, statusAlvo }[], opcoes: { produtos, avaliacoes } }` |

### Actions (todas `executar()` → `Resultado`; criador do HOST; Zod `strictObject` em `src/lib/validators/avaliacoes.ts`)

| Action | Arquivo | Quem | Entrada → `dados` | Audita |
|--------|---------|------|-------------------|--------|
| `acaoCriarAvaliacao` | `actions/avaliacoes.ts` | DONO, ADMIN | `{ produtoId, campos }` → `{ id, versao }` | criar |
| `acaoSalvarAvaliacao` | idem | DONO, ADMIN | `{ avaliacaoId, versao, campos }` → `{ versao }` | atualizar (só o que mudou) |
| `acaoAlterarSituacaoAvaliacao` | idem | DONO, ADMIN | `{ avaliacaoId, versao, status }` → `{ versao }` (publicar exige ≥ 1 questão) | publicar |
| `acaoRemoverAvaliacao` | idem | DONO, ADMIN | `{ avaliacaoId, versao }` → `null` (recusa se está numa trilha; modal block) | excluir |
| `acaoCriarQuestao` / `acaoSalvarQuestao` | idem | DONO, ADMIN | `{ avaliacaoId, questao }` → `{ id, versao }` / `{ questaoId, versao, questao }` → `{ versao }` | criar / atualizar |
| `acaoRemoverQuestao` / `acaoReordenarQuestoes` | idem | DONO, ADMIN | `{ questaoId, versao }` → `null` / `{ avaliacaoId, itens: { id, versao }[] }` → `{ versao }` | excluir / reordenar |
| `acaoConcederTentativa` | idem | DONO, ADMIN | `{ avaliacaoId, membroId, quantidade = 1, motivo }` → `{ concessaoId }` | criar |
| `acaoIniciarTentativa` | `actions/avaliacoes-aluno.ts` | membro com vínculo (a própria) | `{ avaliacaoId }` → `{ tentativaId, retomada }` | criar |
| `acaoResponder` | idem | idem | `{ tentativaId, questaoId, opcoes: ("a".."h")[] }` → `{ situacao: "salva" } \| { situacao: "encerrada", tentativaId }` | não (autosave) |
| `acaoFinalizarTentativa` | idem | idem | `{ tentativaId }` → `{ tentativaId, nota, aprovada, finalizadaPor }` | atualizar |
| `acaoSalvarModeloCertificado` | `actions/certificados.ts` | DONO, ADMIN | `{ produtoId \| null, versao \| null, titulo, texto, assinaturaNome, assinaturaCargo?, cor? }` → `{ versao }` | criar / atualizar |
| `acaoGerarNovaVersaoCertificado` | idem | DONO, ADMIN | `{ certificadoId }` → `{ versaoId, versao, enfileirado }` | criar |
| `acaoRevogarCertificado` | idem | DONO, ADMIN | `{ certificadoId, versao, motivo }` → `{ versao }` (modal block) | atualizar |
| `acaoBaixarCertificado` | idem | ALUNO (o próprio), DONO, ADMIN | `{ certificadoId }` → `{ url, versao }` | não (leitura) |
| `acaoCriarTrilha` / `acaoSalvarTrilha` | `actions/trilhas.ts` | DONO, ADMIN | `{ titulo, descricao?, tag? }` → `{ id, versao }` / `{ trilhaId, versao, campos }` → `{ versao }` | criar / atualizar |
| `acaoDefinirCapaTrilha` | idem | DONO, ADMIN | `{ trilhaId, versao, arquivoId \| null }` → `{ versao }` (arquivo IMAGEM já confirmado) | atualizar |
| `acaoAlterarSituacaoTrilha` / `acaoRemoverTrilha` | idem | DONO, ADMIN | `{ trilhaId, versao, status }` / `{ trilhaId, versao }` | publicar / excluir |
| `acaoAdicionarItemTrilha` | idem | DONO, ADMIN | `{ trilhaId, tipo: "PRODUTO", produtoId, exigeAnterior? }` ou `{ trilhaId, tipo: "AVALIACAO", avaliacaoId, exigeAnterior? }` → `{ id, versao }` | criar |
| `acaoSalvarItemTrilha` / `acaoRemoverItemTrilha` / `acaoReordenarItensTrilha` | idem | DONO, ADMIN | `{ itemId, versao, exigeAnterior }` / `{ itemId, versao }` / `{ trilhaId, itens }` | atualizar / excluir / reordenar |

Rota pública `GET /certificado/[codigo]/pdf` (botão "Baixar PDF" da verificação, sem sessão): criador do
HOST + `urlDoPdfPorCodigo` → 302 para o link assinado de 5 min; revogado, sem PDF pronto ou de outro
criador = 404. `no-store` e `X-Robots-Tag: noindex`.

### Worker dos certificados

```bash
npm run worker:certificados   # outro terminal/container; reenfileira as versões PENDENTES ao subir
```

`emitir`/`gerarNovaVersao` enfileiram `{ versaoId }` DEPOIS do commit (`enfileirado: false` = fila fora
do ar: a versão fica PENDENTE até o worker subir). Sem worker rodando, os PDFs ficam "Gerando…".
O mesmo processo consome a fila `eventos` (lembrete 1 h antes; ver "Eventos ao vivo") e, ao subir,
reenfileira os lembretes dos eventos publicados que ainda não começaram.

## Comunidade e notificações (passo 8)

ADR-0009, RN-130 a RN-134 (padrões aguardando o cliente). Migração `0007_comunidade_notificacoes`
(cria o canal "Geral" de todo criador que já existia). Nenhuma variável de ambiente nem pacote novo.

| Tabela | Para quê |
|--------|----------|
| `criadores_canais` | nome (único entre os vivos, sem caixa), descrição, ordem, `acesso` TODOS/GRUPO/PRODUTO/EQUIPE (+ `grupo_id`/`produto_id`, CHECK), `quem_posta` TODOS/EQUIPE (avisos), `padrao` (o "Geral": um por criador, sempre TODOS, não sai) |
| `criadores_canais_posts` | canal, autor (membro), `aula_id` opcional ("em <aula>"), `texto` PURO 1–5000, enquete (`enquete_pergunta`, `enquete_opcoes` jsonb 2–6, `enquete_encerra_em`), `fixado_em`, `oculto_em` + `motivo_ocultacao`, `editado_em`, contadores `curtidas`/`comentarios` (sistema: não tocam `updated_at`) |
| `criadores_canais_posts_anexos` | arquivo (`arquivos`, finalidade COMUNIDADE_IMAGEM/COMUNIDADE_PDF) do post, ordem; um arquivo, um uso |
| `criadores_canais_posts_votos` | voto único por (post, membro); trocar = UPDATE |
| `criadores_comentarios` | em post OU aula (CHECK), `pai_id` (1 nível), texto PURO 1–2000, oculto/motivo, `editado_em`, `curtidas` |
| `criadores_curtidas` | post OU comentário; UMA linha por (membro, alvo) para sempre (toggle = soft delete/reativa) |
| `criadores_denuncias` | denunciante, post OU comentário, motivo, situação ABERTA/RESOLVIDA/DESCARTADA, `resolvida_em`, `decisao`; uma viva por pessoa e alvo |
| `criadores_membros_silenciamentos` | membro silenciado até `ate`, motivo; uma linha viva por membro |
| `criadores_membros_notificacoes` | destinatário (membro), `tipo`, `dados` jsonb (só ids e rótulos curtos), `chave` (idempotência/agregação, única por membro), `atores`/`total` (curtidas agregadas), `evento_em` (ordena e conta a retenção), `lida_em`, `arquivada_em`. Índice PARCIAL das não lidas para o contador |

Também: `arquivos.finalidade` aceita COMUNIDADE_IMAGEM (JPG/PNG/WebP até 5 MB) e COMUNIDADE_PDF (até
20 MB) — `ALLOWLIST` em `src/lib/armazenamento/regras.ts`; o envio do catálogo (`acaoIniciarEnvio`)
segue só IMAGEM/MATERIAL. O fluxo de envio de 3 tempos mora em `src/lib/armazenamento/envio.ts`
(`iniciarEnvio`, `confirmarEnvio`), usado pelo catálogo e pela comunidade. Criador novo
(`acaoCriarCriador`) nasce com o "Geral" (`garantirCanalGeral`).

### Regras puras (`src/lib/comunidade/regras.ts`, `src/lib/notificacoes/regras.ts` — servem à tela)

```ts
segmentosDeTexto(texto): ({ tipo: "texto"; valor } | { tipo: "link"; valor; href })[]
// A TELA renderiza texto com o escape do React e link como
// <a href={href} rel="noopener noreferrer nofollow" target="_blank">{valor}</a>. NUNCA dangerouslySetInnerHTML.
normalizarTexto(texto)  // o validador já aplica (sem controles, bidi, largura zero)
iniciais(nome) /* "AP" */, primeiroNome(nome), resumo(texto, max = 80)
ACCEPT_ANEXOS /* accept do <input type="file"> */, MAX_IMAGENS_POST = 4, MAX_PDFS_POST = 2, problemaDosAnexos(finalidades)
TEXTO_POST_MAX = 5000, TEXTO_COMENTARIO_MAX = 2000, ENQUETE_OPCOES_MIN/MAX = 2/6, enqueteAberta(encerraEm, agora)
LIMITE_POSTS_JANELA = 5, LIMITE_COMENTARIOS_JANELA = 20, LIMITE_ENVIOS_JANELA = 12, JANELA_LIMITE_MIN = 10
// notificacoes/regras.ts
textoDaNotificacao({ tipo, dados, total }), linkDaNotificacao({ tipo, dados }), rotuloDoContador(n) /* "99+" */
INTERVALO_POLLING_MS = 60_000, RETENCAO_DIAS = 90, TETO_CONTADOR = 99
```

### Leituras para as telas

`q: QuemPede` = o `membroDaPagina(TODOS_OS_MEMBROS)` inteiro (criador do HOST). Datas como `Date`.

| Função | Retorno |
|--------|---------|
| `canaisDoMembro(q)` (`comunidade/canais.ts`) | `{ id, nome, descricao, acesso, quemPosta, padrao, podePublicar }[]` — só os que `q` vê, por ordem e nome |
| `feedDaComunidade(q, { canalId?, ordem?: "RECENTES" \| "CURTIDOS", cursor?, limite = 20 })` (`comunidade/consultas.ts`) | `null` (canal que `q` não vê/de outro criador: 404) ou `{ itens: PostDoFeed[], proximoCursor: string \| null }`. Sem `canalId` = todos os canais visíveis |
| `PostDoFeed` | `{ id, canal: { id, nome }, autor: { membroId, nome, iniciais, imagem, equipe }, aula: { id, titulo } \| null, texto, criadoEm, editadoEm, fixado, oculto: { motivo } \| null, curtidas, comentarios, curtiu, anexos: { id, tipo: "IMAGEM" \| "PDF", nome, tamanho, url /* imagem: assinada 1–2 h; PDF: null, use acaoLinkDoAnexo */ }[], enquete: { pergunta, opcoes: { indice, texto, votos }[], totalVotos, meuVoto, encerraEm, aberta } \| null, podeEditar, podeRemover, podeModerar, versao }` |
| `totalDePublicacoes(q, canalId?)` | `number` ("32 publicações") |
| `postDaComunidade(q, postId)` | `null` ou `{ post: PostDoFeed, comentarios: ComentarioDaArvore[] }` |
| `comentariosDaAula(q, aulaId)` — aba "Comentários" do player | `null` (quem pede não pode assistir) ou `ComentarioDaArvore[]` |
| `ComentarioDaArvore` | `{ id, autor, texto, criadoEm, editadoEm, oculto: { motivo } \| null, curtidas, curtiu, podeEditar, podeRemover, podeModerar, versao, respostas: ComentarioDaArvore[] /* 1 nível */ }` (ordem de criação; até 500) |
| `lateralDaComunidade(q)` | `{ proximoEncontro: null /* não há eventos ainda */, fixados: { id, canalId, canalNome, titulo }[] /* 5 */, membrosAtivos: (AutorPublico & { pontos: number | null /* saldo; nulo = desligada, equipe ou fora do ranking */, interacoes })[] /* 5, posts + comentários em 30 dias */ }` |
| `aulasParaRelacionar(q, limite = 30)` — "em <aula>" do compositor | `{ id, titulo, produtoTitulo }[]`. ALUNO: aulas com progresso dele (inclusive concluídas), mais recentes primeiro, só as que ainda pode assistir agora (regra de `motivoDoBloqueio`); equipe: aulas visíveis mais recentes do criador. `acaoPublicar` recusa (`"Aula não encontrada."`) aula que o autor não pode assistir |
| `situacaoNaComunidade(q)` | `{ podeParticipar /* tem vínculo */, equipe, silenciadoAte: Date \| null }` — compositor |
| `canaisParaEditar(criadorId)` (equipe) | `{ id, nome, descricao, ordem, acesso, grupo: { id, nome } \| null, produto: { id, titulo } \| null, quemPosta, padrao, publicacoes, versao }[]` |
| `filaDeDenuncias(criadorId, situacao = "ABERTA")` (`comunidade/moderacao.ts`, equipe) | `{ id, situacao, motivo, decisao, criadaEm, denunciante: { membroId, nome }, alvo: { tipo: "POST" \| "COMENTARIO", id, postId, aulaId, autor: { membroId, nome, equipe /* DONO/ADMIN: sem "Silenciar" */ }, trecho, oculto, removido, versao /* trava do POST/COMENTÁRIO para acaoOcultar */ }, versao /* trava da denúncia */ }[]` (100) |
| `membrosSilenciados(criadorId)` (equipe) | `{ membroId, nome, ate, motivo }[]` |
| `notificacoesDoMembro(criadorId, membroId, { cursor?, limite = 20 })` (`notificacoes/consultas.ts`) | `{ itens: { id, tipo, texto, href, lida, em }[], proximoCursor }` — membro da SESSÃO (`q.membro.id`; nulo = sem notificações) |
| `contarNaoLidas(criadorId, membroId)` | `number` (até 100 = "99+") |

### Serviços de escrita (`src/lib/comunidade/`, chamados pelas actions e pelo seed)

`Participante = { criadorId, usuarioId, membroId, papel, nome }` (precisa de vínculo);
`Moderador = { criadorId, usuarioId, membroId | null, nome }`.

```ts
publicacoes.ts: publicar(p, { canalId, texto, aulaId, anexoIds, enquete }) → { id, versao }
  editarPublicacao(p, postId, versao, texto) → { versao }; removerPublicacao({ criadorId, usuarioId, membroId, equipe }, postId, versao)
  votarNaEnquete(p, postId, opcao) → { opcao }; alternarCurtida(p, { postId } | { comentarioId }) → { curtiu, curtidas }
comentarios.ts: comentar(p, { postId } | { aulaId }, texto, paiId) → { id, versao }; editarComentario; removerComentario (leva as respostas)
moderacao.ts: fixarPublicacao(m, postId, versao, fixar); ocultar(m, alvo, versao, { ocultar: true, motivo } | { ocultar: false });
  denunciar(p, alvo, motivo) → { id }; resolverDenuncia(m, id, versao, "RESOLVIDA" | "DESCARTADA", decisao);
  silenciar(m, membroId, dias, motivo) → { ate }; dessilenciar(m, membroId)
canais.ts: garantirCanalGeral(exec, criadorId, autorId); criarCanal; salvarCanal; removerCanal
anexos.ts: iniciarEnvioDeAnexo(p, { nome, mime, tamanho }); confirmarEnvioDeAnexo(p, arquivoId); linkDoAnexo(q, anexoId)
notificacoes/gerar.ts (depois do commit; NUNCA lançam): notificarComentario, notificarCurtidaNoPost, notificarCanal (AVISO/POST_FIXADO),
  notificarAulaNova, notificarCertificado, notificarMatriculas, notificarDenuncia, arquivarNotificacoesAntigas(agora?, dias = 90)
```

Eventos que já existiam e agora notificam (depois do commit): vídeo da aula PRONTO pela primeira vez
(`aplicarEvento` em `src/lib/video/registro.ts`: AULA_NOVA para os matriculados, se a aula já é
visível), certificado emitido (`emitir`), matrícula criada/reativada (`acaoMatricular`,
`acaoReativarMatricula`, importação CSV; `matricularGrupo(tx, p, novas?)` devolve os ids no 3º
parâmetro). Tentativa corrigida NÃO notifica: o resultado aparece na hora da finalização.

### Actions (todas `executar()` → `Resultado`; criador do HOST; sessão antes do Zod `strictObject` de `src/lib/validators/comunidade.ts`)

| Action | Arquivo | Quem | Entrada → `dados` | Audita |
|--------|---------|------|-------------------|--------|
| `acaoPublicar` | `actions/comunidade.ts` | membro com vínculo (avisos: só equipe; silenciado não) | `{ canalId, texto, aulaId?, anexoIds? (até 6), enquete?: { pergunta, opcoes: string[2..6], encerraEm?: ISO } }` → `{ id, versao }` | criar |
| `acaoEditarPublicacao` | idem | só o autor (não silenciado) | `{ postId, versao, texto }` → `{ versao }` | atualizar |
| `acaoRemoverPublicacao` | idem | autor ou DONO/ADMIN (modal block) | `{ postId, versao }` → `null` | excluir |
| `acaoVotarEnquete` | idem | membro que vê o post | `{ postId, opcao /* índice */ }` → `{ opcao }` | atualizar |
| `acaoCurtir` | idem | membro que vê o alvo | `{ postId }` ou `{ comentarioId }` → `{ curtiu, curtidas }` | criar / excluir |
| `acaoComentar` | idem | quem vê o post / pode assistir a aula (não silenciado) | `{ postId \| aulaId, texto, paiId? }` → `{ id, versao }` | criar |
| `acaoEditarComentario` / `acaoRemoverComentario` | idem | autor / autor ou DONO/ADMIN | `{ comentarioId, versao, texto }` → `{ versao }` / `{ comentarioId, versao }` → `null` | atualizar / excluir |
| `acaoDenunciar` | idem | membro que vê o alvo (não o próprio) | `{ postId \| comentarioId, motivo }` → `{ id }` | criar |
| `acaoIniciarEnvioAnexo` / `acaoConfirmarEnvioAnexo` | idem | membro com vínculo | `{ nome, mime, tamanho }` → `{ arquivoId, envio: UrlDeEnvio }` / `{ arquivoId }` → `{ arquivoId, nome, tamanho, tipo: "IMAGEM" \| "PDF" }` | criar / atualizar |
| `acaoLinkDoAnexo` | idem | quem vê o post | `{ anexoId }` → `{ url /* 5 min */ }` | não (leitura) |
| `acaoMaisPublicacoes` | idem | qualquer membro | `{ canalId?, ordem?, cursor? }` → `{ itens, proximoCursor }` | não (leitura) |
| `acaoFixarPublicacao` | `actions/comunidade-moderacao.ts` | DONO, ADMIN | `{ postId, versao, fixar }` → `{ versao }` | atualizar |
| `acaoOcultar` | idem | DONO, ADMIN | `{ postId \| comentarioId, versao, ocultar: true, motivo }` ou `{ ..., ocultar: false }` → `{ versao }` | atualizar |
| `acaoResolverDenuncia` | idem | DONO, ADMIN | `{ denunciaId, versao, situacao: "RESOLVIDA" \| "DESCARTADA", decisao? }` → `{ versao }` | atualizar |
| `acaoSilenciarMembro` / `acaoDessilenciarMembro` | idem | DONO, ADMIN (só ALUNO é silenciado) | `{ membroId, dias (1–365), motivo }` → `{ ate }` / `{ membroId }` → `null` | criar / excluir |
| `acaoCriarCanal` / `acaoSalvarCanal` / `acaoRemoverCanal` | idem | DONO, ADMIN | `{ nome, descricao?, ordem?, acesso, grupoId?, produtoId?, quemPosta? }` → `{ id, versao }` / `{ canalId, versao, dados }` → `{ versao }` / `{ canalId, versao }` → `null` | criar / atualizar / excluir |
| `acaoMarcarNotificacoesLidas` | `actions/notificacoes.ts` | a própria pessoa | `{ ids: uuid[1..100] }` ou `{ todas: true }` → `{ marcadas }` | não (caixa da própria pessoa) |
| `acaoMaisNotificacoes` | idem | a própria pessoa | `{ cursor? }` → `{ itens, proximoCursor }` | não (leitura) |

### `GET /api/notificacoes/contagem` (sino)

Route handler fino que chama `atenderContagem(req)` (`src/lib/notificacoes/rota.ts`). Sessão PLENA do
host (cookie de outro host = 401), resposta `{ "naoLidas": n }` com `Cache-Control: no-store`; sem
sessão = 401 sem corpo; SUPER_ADMIN sem vínculo = `{ "naoLidas": 0 }`. A tela faz polling a cada
`INTERVALO_POLLING_MS` SÓ com a aba visível (`document.visibilityState`). A rota lê a sessão com
`sessaoDosCabecalhos(h, { renovar: false })`: o polling NÃO conta como uso (aba esquecida expira em 1 h).

## Eventos ao vivo

ADR-0011, RN-142 e RN-143. Migração `0009_eventos_gamificacao`. Nenhuma variável de ambiente nova
(a fila usa `REDIS_URL`/`VIDEO_FILA_PREFIXO` como as outras).

| Tabela | Para quê |
|--------|----------|
| `criadores_eventos` | título (3–120), `descricao` (texto puro ≤ 2000), `inicio_em`, `duracao_min` (5–720), `link_acesso` (https, CHECK = `REGEX_LINK_EVENTO_SQL`; nulo só em RASCUNHO), `situacao` RASCUNHO/PUBLICADO/CANCELADO (`publicado_em`, `cancelado_em` coerentes por CHECK), `publico` TODOS/PRODUTO/GRUPOS (`produto_id` ⇔ PRODUTO), `gravacao_aula_id`, `criado_por`. FKs compostas (produto, aula). Índice (criador, `inicio_em`) |
| `criadores_eventos_grupos` | grupos do público GRUPOS (único vivo por evento × grupo) |
| `criadores_eventos_inscricoes` | presença: única VIVA por evento × membro; desconfirmar = soft delete; índice (membro) |

```ts
// regras.ts (puro): ROTA_EVENTOS = "/eventos", LINK_ABRE_ANTES_MIN = 15, LEMBRETE_ANTES_MIN = 60,
// fimDoEvento(agenda), momentoDoEvento(agenda, agora): "EM_BREVE" | "ABERTO" | "ENCERRADO",
// momentoDoLembrete(inicio), idDoJobLembrete(eventoId, inicio) = "lembrete-<id>-<ms>",
// chaveDoLembrete(eventoId, inicio), linkDeEventoValido(texto), quandoDoEvento(inicio) = "21/10 às 19:30"
// sql.ts: vePublicoSql({ tipo: "evento" | "desafio", id, publico, produtoId? }, membroId, papel, agora),
//         veEventoSql(membroId, papel, agora, alias = "e"), veDesafioSql(membroId, papel, agora, alias = "d")
// consultas.ts (área do aluno; q = membroDaPagina(TODOS_OS_MEMBROS); rascunho nunca):
eventosProximos(q, agora, limite = 50): Promise<EventoDoMembro[]>   // não terminados, mais cedo primeiro
eventosPassados(q, agora, limite = 50): Promise<EventoDoMembro[]>   // terminados, mais recente primeiro
eventoDoMembro(q, eventoId, agora): Promise<EventoDoMembro | null>
proximoEventoDoMembro(q, agora): Promise<EventoDoMembro | null>     // "Próximo encontro" (comunidade/vitrine)
type EventoDoMembro = { id, titulo, descricao, inicioEm, fimEm, duracaoMin, situacao: "PUBLICADO" | "CANCELADO",
  momento, link: string | null /* SÓ ABERTO e PUBLICADO */, gravacaoAulaId: string | null /* só ENCERRADO */,
  inscrito: boolean, inscritos: number }
// presenca.ts (a action faz exigirMembro + Zod do id; escrita + trilha na transação):
confirmarPresenca(q, eventoId, agora): Promise<boolean>  // false = já estava; ErroDeNegocio(MSG_EVENTO_INDISPONIVEL)
cancelarPresenca(q, eventoId, agora): Promise<boolean>   // false = não estava (ou já terminou)
// notificacoes/gerar.ts (depois do commit):
notificarEventoPublicado(criadorId, eventoId, ator, agora?)   // alunos do público; nunca lança
notificarEventoCancelado(criadorId, eventoId, ator)           // inscritos; nunca lança
notificarLembreteEvento(criadorId, eventoId, inicioEsperado, agora?): Promise<number> // LANÇA (o job tenta de novo)
```

### Telas, leituras da equipe e textos

| Rota | Quem | O quê |
|------|------|-------|
| `/admin/eventos` (`?aba=proximos\|passados\|rascunhos\|cancelados`, `?q=`) | DONO, ADMIN | lista: evento + quando, público, confirmados, situação, menu ⋮ (editar, confirmados, publicar, cancelar, excluir rascunho) |
| `/admin/eventos/novo`, `/admin/eventos/[id]` | DONO, ADMIN | formulário (cria em RASCUNHO), painel Situação (publicar/cancelar/excluir pelo `ModalConfirmacaoBlock`), lista "Confirmados" (`#confirmados`); cancelado = só leitura |
| `/eventos`, `/eventos/[id]` | membro do público | próximo em destaque (contagem, "Ao vivo agora"), demais, anteriores com "Assistir gravação" (`/aula/<id>`); detalhe com presença, agenda e "Entrar no encontro" SÓ quando o servidor manda o link. `ContagemEvento` (client) recarrega a página ao abrir a janela e no fim |
| `GET /eventos/[id]/agenda.ics` | membro do público | `atenderAgendaIcs(req, id)` (`rota-agenda.ts`): sessão PLENA do host (sem = 401), `avaliarMembro(TODOS_OS_MEMBROS)` (403), `eventoDoMembro` (fora do público, rascunho, outro criador, id ruim = 404). `text/calendar`, `no-store`, `noindex`. O `.ics` (`agenda-ics.ts`, RFC 5545, UID `evento-<id>@<host>`, CANCELLED quando cancelado) leva o endereço da página, NUNCA o link da sala |

```ts
// admin.ts (equipe; criador do HOST): lerAbaEventos(v), eventosDoAdmin(criadorId, aba, agora, busca?),
// contagemDosEventos(criadorId, agora), eventoParaEditar(criadorId, id), inscritosDoEvento(criadorId, id),
// opcoesDoEvento(criadorId) → { cursos, grupos, aulas (com o curso, para o <optgroup>) }
// tela.ts (puro): textoDaContagem, quandoPorExtenso, diaEMes, horaDoEvento, duracaoTexto, textoConfirmados, aberturaDoLink
// validators/eventos.ts: camposEventoSchema (inicio = "AAAA-MM-DDTHH:MM" de Brasília → instanteDeBrasilia),
// camposDoFormulario(FormData), campoDeBrasilia(Date), salvarEventoSchema, eventoComVersaoSchema, presencaSchema
```

### Actions (`src/lib/actions/eventos.ts`; `executar()` → `Resultado`; criador do HOST; trava por `updated_at`; trilha na transação)

| Action | Papel | Entrada → saída | Regras |
|--------|-------|-----------------|--------|
| `acaoCriarEvento` | DONO, ADMIN | campos → `{ id, versao }` | nasce RASCUNHO (link opcional); curso, aula e grupos conferidos no criador |
| `acaoSalvarEvento` | DONO, ADMIN | `{ eventoId, versao, campos }` → `{ versao, lembreteEnfileirado }` | cancelado não edita; publicado não perde o link; publicado e não terminado: mudou o início = reenfileira o lembrete, e `notificarEventoPublicado` avisa quem PASSOU a ser do público (a chave `evento:<id>` não repete) |
| `acaoPublicarEvento` | DONO, ADMIN | `{ eventoId, versao }` → `{ versao, lembreteEnfileirado }` | só RASCUNHO, com link, não terminado; depois do commit: aviso ao público + lembrete |
| `acaoCancelarEvento` | DONO, ADMIN | `{ eventoId, versao }` → `{ versao }` | só PUBLICADO não terminado; depois do commit: aviso aos inscritos (o job do lembrete vira no-op) |
| `acaoExcluirEvento` | DONO, ADMIN | `{ eventoId, versao }` → `null` | só RASCUNHO; soft delete do evento e dos grupos |
| `acaoConfirmarPresenca` / `acaoCancelarPresenca` | membro | `{ eventoId }` → `{ confirmou }` / `{ cancelou }` | a PRÓPRIA presença (`presenca.ts`) |

A trilha guarda antes/depois sem o link (só "(definido)").

### Lembrete (fila `eventos`, ADR-0011 item 6)

`src/lib/eventos/fila.ts`: fila `eventos` (DLQ `eventos-dlq`, chaves `li:eventos:*`), payload
`{ criadorId, eventoId, inicioEm }` (ISO), `opcoesDoJobLembrete` = 3 tentativas com backoff, `jobId =
idDoJobLembrete(...)` (sem ":"), `delay = max(0, momentoDoLembrete(inicio) − agora)`.
`enfileirarLembreteComPrazo` (5 s; fila fora do ar = `false`, a action segue) é chamado DEPOIS do commit
ao publicar e ao mudar o horário de evento publicado. Consumo: 2º `Worker` (concorrência 2) dentro de
`npm run worker:certificados`, que chama `processarLembrete` (`lembrete.ts` → `notificarLembreteEvento`;
lança = nova tentativa; falha de vez = cópia na `eventos-dlq`). Ao subir, o worker reenfileira
`lembretesPendentes()` (todo PUBLICADO com `inicio_em > now()`; o `jobId` não duplica).

## Gamificação

ADR-0012, RN-144 a RN-147. Migração `0009_eventos_gamificacao`. Comando:
`npm run gamificacao:recalcular -- <slug>` (idempotente).

| Tabela | Para quê |
|--------|----------|
| `criadores_gamificacao` | 1 viva por criador (sem linha = desligada com os padrões): `ligada`, `pontos_aula_concluida` 10, `pontos_curso_concluido` 100, `pontos_avaliacao_aprovada` 30, `pontos_publicacao_comunidade` 2 (0–10000), `niveis` jsonb `{ nome, minimo }[]` |
| `criadores_membros_pontos` | RAZÃO append-only (`compliance:append-only`): `motivo`, `pontos` (negativo só AJUSTE_MANUAL), `referencia`, `ocorrido_em` (data do fato), `justificativa` (obrigatória no ajuste), `modified_by` = quem lançou. Único (membro, motivo, referência) em TODAS as linhas; índice (criador, `ocorrido_em`, membro, pontos) para o ranking |
| `criadores_desafios` | janela `inicio_em`..`fim_em`, meta (`meta_tipo` + `meta_quantidade` / `meta_produto_id` / `meta_avaliacao_id`, CHECK de coerência), `pontos_bonus`, `recompensa`, situação RASCUNHO/PUBLICADO/ENCERRADO, público TODOS/GRUPOS, `criado_por` |
| `criadores_desafios_grupos` | grupos do público GRUPOS |
| `criadores_desafios_participacoes` | opt-in (único vivo por desafio × membro), `concluido_em` (sistema), `recompensa_entregue_em/por` (equipe, com trava) |
| `usuarios.aparecer_no_ranking` | preferência da pessoa (padrão `true`), em `acaoSalvarPreferencias`/`preferenciasDoAluno` |

```ts
// regras.ts (puro): NIVEIS_PADRAO, PONTOS_PADRAO (de padroes.ts), COLUNA_DO_MOTIVO, ROTULO_DO_MOTIVO,
// esquemaNiveis (Zod), nivelDoMembro(pontos, niveis) → { atual, proximo, faltam, progresso 0..1 },
// momentoDoDesafio({ inicioEm, fimEm, situacao }, agora): "EM_BREVE" | "ATIVO" | "ENCERRADO",
// PERIODOS_RANKING = ["semana", "mes", "total"], lerPeriodoRanking(v)
// pontos.ts
type Conquista = { motivo: "AULA_CONCLUIDA"; aulaId } | { motivo: "CURSO_CONCLUIDO"; produtoId }
  | { motivo: "AVALIACAO_APROVADA"; avaliacaoId } | { motivo: "PUBLICACAO_COMUNIDADE" } // ref = dia de Brasília
concederPontos(exec, { criadorId, membroId, conquista, ocorridoEm? }): Promise<number> // 0 = nada novo
registrarConquista({ criadorId, membroId, conquista, ocorridoEm? }, agora?): Promise<void> // concede + conclui desafios; NUNCA lança; chamar DEPOIS do commit
ajustarPontos(tx, { criadorId, membroId, pontos, justificativa, autorUsuarioId }): Promise<string> // só ALUNO; trilha na tx
configDaGamificacao(criadorId, exec?): Promise<{ id | null, updatedAt | null, ligada, pontos: {...}, niveis }>
// ranking.ts
rankingDoCriador(criadorId, periodo, agora, limite = 50): Promise<{ posicao, membroId, nome, imagem, pontos }[]>
resumoDoMembro(criadorId, membroId, agora): Promise<{ total, semana, mes, nivel, posicao: { semana, mes, total } (null = fora), aparecerNoRanking }>
extratoDoMembro(criadorId, membroId, limite = 50): Promise<{ id, motivo, pontos, referencia, ocorridoEm, justificativa }[]>
// desafios.ts
desafiosDoMembro(q, agora, desafioId?): Promise<DesafioDoMembro[]> // PUBLICADO/ENCERRADO do público, com atual/meta/participando/concluidoEm
participarDoDesafio(q, desafioId, agora): Promise<boolean>       // false = já participava; ErroDeNegocio(MSG_DESAFIO_INDISPONIVEL)
concluirDesafiosCumpridos(exec, criadorId, membroId | null, agora): Promise<number>
progressoDoDesafioSql(membroSql) // expressão para a linha `criadores_desafios d` (telas do admin)
// recalcular.ts
recalcularPontos(criadorId, agora?): Promise<{ AULA_CONCLUIDA, CURSO_CONCLUIDO, AVALIACAO_APROVADA, PUBLICACAO_COMUNIDADE, DESAFIO_CONCLUIDO, desafiosConcluidos }>
```

**Ganchos ligados** (`registrarConquista` depois do commit, nunca lança): `registrarProgresso` e
`concluirManualmente` só quando `concluiuAgora` (`depoisDeConcluir`: AULA_CONCLUIDA; o heartbeat comum não
toca a gamificação); `concluirMatriculaSeCompleta` (CURSO_CONCLUIDO, antes do certificado);
`finalizarTentativa` nova e aprovada (AVALIACAO_APROVADA, `ocorridoEm` = fim da tentativa); `publicar` da
comunidade (PUBLICACAO_COMUNIDADE). Ao LIGAR a gamificação (`acaoSalvarConfigGamificacao`): `recalcularPontos`.

### Telas e actions da gamificação

| Função / action | Quem | O quê |
|-----------------|------|-------|
| `acaoSalvarConfigGamificacao({ ligada, pontos, niveis, versao })` (`src/lib/actions/gamificacao.ts`) | só DONO | cria (versão nula; o índice único recusa a 2ª) ou atualiza com trava; trilha "Gamificação ligada/desligada"; ligar devolve `recalculo` |
| `acaoSalvarDesafio({ desafioId, versao, campos })` | DONO, ADMIN | cria RASCUNHO ou salva (ENCERRADO não edita); curso/avaliação/grupos vivos DESTE criador; grupos trocados por soft delete |
| `acaoPublicarDesafio`, `acaoEncerrarDesafio`, `acaoExcluirDesafio({ desafioId, versao })` | DONO, ADMIN | RASCUNHO → PUBLICADO (fim no futuro) → ENCERRADO; excluir só rascunho (soft delete, com os grupos) |
| `acaoMarcarRecompensaEntregue({ participacaoId, versao })` | DONO, ADMIN | só participação concluída de desafio com recompensa; uma vez (trava), trilha |
| `acaoAjustarPontos({ membroId, pontos, justificativa })` | DONO, ADMIN | `ajustarPontos` na transação (só ALUNO do criador) |
| `acaoParticiparDoDesafio({ desafioId })` | membro | a PRÓPRIA sessão; gamificação desligada = recusa |
| `desafiosDoAdmin`, `desafioParaEditar`, `opcoesDeMeta`, `recompensasDoAdmin`, `alunosComPontos` (`src/lib/gamificacao/admin.ts`) | telas da equipe | lista com participantes/concluídos, editor com participantes e progresso calculado, recompensas (pendentes primeiro), saldo e nível por aluno |
| `conquistasDoMembro(q, periodo, agora)` (`src/lib/gamificacao/conquistas.ts`) | `/conquistas` | `null` = desligada (404); resumo, desafios (em andamento/disponíveis/concluídos), top 10 + a própria linha fora do top, extrato (10) |
| `saldosDosMembros(criadorId, ids)` (`ranking.ts`) | listas do ranking | saldo total → nível de cada linha |

Rotas: `/admin/desafios` (abas Desafios, `/ranking`, `/recompensas`), `/admin/desafios/novo`, `/admin/desafios/[id]`,
`/admin/configuracoes/gamificacao` (só DONO), `/admin/membros/gamificacao`, `/conquistas` (aluno). O layout do aluno lê
`configDaGamificacao` (link "Conquistas" no menu do desktop; no celular, pelo Perfil). Perfil: `numerosDoPerfil().pontos`
= soma do razão e "Aparecer no ranking" (só com a gamificação ligada). Comunidade: `membrosAtivos[].pontos` = saldo (nulo
desligada, para a equipe e para quem saiu do ranking).

## Telas restantes do admin: estúdio, área de membros e configurações

### Estúdio de vídeo (`src/lib/video/estudio.ts`, DONO e ADMIN)

| Função | Devolve |
|--------|---------|
| `listarVideos(criadorId, { busca?, situacao?, produtoId?, pagina, porPagina })` | `{ total, linhas }`: vídeo vivo + aula, módulo e produto VIVOS do mesmo criador (vídeo de aula removida some), mais novo primeiro. Busca no título da aula ou no nome do arquivo |
| `totaisDoEstudio(criadorId)` | `{ videos, segundosProntos, bytesOriginais, processando, falhos }` — armazenamento ESTIMADO pelo tamanho dos originais (o HLS não tem tamanho gravado) |
| `produtosComVideo(criadorId)` | opções do filtro "Curso" |
| `estadoDaFila(criadorId, filas?)` | `{ disponivel: true, aguardando, processando, falhos }` ou `{ disponivel: false }`. Lê até 500 jobs por estado da fila e da DLQ (`getJobs`) e conta SÓ os jobs cujo `videoId` é do criador (a fila é da plataforma). Redis fora, sem `REDIS_URL` ou mais de 2,5 s: indisponível, nunca lança. Filas de leitura próprias (`criarFilasDoEstudio`) com ouvinte de `error` |

Reprocessar na tela = `acaoReprocessarVideo` (só FALHOU/PROCESSANDO: `podeReprocessar` em `src/lib/video/regras.ts`), com `ModalConfirmacaoBlock`. Trocar vídeo = editor da aula.

### Área e configurações

| Função / action | Quem | O quê |
|-----------------|------|-------|
| `dadosDaArea(criadorId)` (`src/lib/criador/consultas.ts`) | páginas Geral/Domínios | nome, slug, `dominioProprio`, versão (trava) |
| `resumoDaArea(criadorId)` | hub Área de membros | `{ membros, alunos, cursos }`: vínculos ATIVOS, alunos ativos, produtos PUBLICADOS |
| `enderecoDaArea(slug)` (`src/lib/criador/area.ts`) | telas | `{ host: "<slug>.<PLATAFORMA_DOMINIO>", url }` |
| `acaoRenomearArea({ nome, versao })` (`src/lib/actions/configuracoes.ts`) | só DONO | nome 2–80, trava pelo `updated_at` do criador, trilha `"antigo" → "novo"` na transação — RN-141 |
| `listarMembros(criadorId, { papeis: ["DONO","ADMIN"], ... })` | Equipe e acesso | filtro novo `papeis`; convidar = `acaoCadastrarMembro` com papel ADMIN |
| `listarTrilha(criadorId, { pessoa?, acao?, tabela?, periodo?: { de, ate }, somenteExclusoes?, cursor?, limite })` (`src/lib/audit/consultas.ts`) | Logs (só DONO) | período = `?de=&ate=` (`lerIntervaloExplicito`; sem ele = desde o início), `created_at` entre a meia-noite de Brasília de `de` e a do dia seguinte a `ate` (exclusivo); keyset `(created_at, id) desc`, devolve `proximo` (`"<ms>_<uuid>"`). Sai só `detalhes` passado por `detalheSeguro` (`src/lib/audit/regras.ts`) + `titulo` (primeiro trecho entre aspas); `dados_*` nunca são selecionados — RN-140 |
| `entidadesDaTrilha(criadorId)` | Logs | tabelas que já aparecem na trilha do criador, com rótulo |

## E-mails do sistema (`src/lib/email/`)

| Arquivo | O quê |
|---------|-------|
| `enviar.ts` | `enviarEmail({ para, tipo, criadorId, remetente, assunto, html, texto })`: SMTP da Hostinger só por env; sempre multipart (html + texto). `from` = `"<nome da área>" <endereço do EMAIL_REMETENTE>` (nome sem quebra de linha, aspas nem `<>`). Nunca loga o corpo (leva token). Todo caso vira uma linha em `emails_disparos` (`ENVIADO`, `FALHOU` com o código do erro, `NAO_CONFIGURADO`), sem o corpo — RN-203 |
| `disparos.ts` | `registrarDisparo` (best-effort, nunca lança), `mascararEmail`, `hashDoDestinatario` (HMAC), `listarDisparos`, `resumoDisparos` — ver "Fase 1" abaixo |
| `modelo.ts` (puro) | `montarEmail(conteudo)` → `{ html, texto }`; `marcaDaArea(criador \| null, URL_PLATAFORMA)`; `urlSegura` (só `https://`, ou `http://` em `localhost`/`*.localhost`; sem credencial na URL; o resto lança); `escaparHtml` em todo texto dinâmico; `coresDoBotao(cor)` |
| `mensagens.ts` (puro) | `emailDefinirSenha` (validade em minutos), `emailPrimeiroAcesso` (válido até, horário de Brasília), `emailAvisoSeguranca` (o que mudou + quando, botão para `/conta/seguranca` da área), `emailMarketing(marca, conteudo, nome, { descadastro, linkar?, pixel? })` (Fase 3) |

Quem envia: `solicitarRedefinicao` (`auth/recuperacao.ts`, marca do host do pedido),
`enviarPrimeiroAcesso` (`membros/primeiro-acesso.ts`, recebe o `CriadorDaRequisicao` da action) e
`avisarDono` (`auth/aviso.ts`, lê o host com `alvoAtual()` ANTES de adiar o envio; fora de requisição
= plataforma). Saudação pelo primeiro nome de `usuarios.nome`. O token segue só no fragmento
`#token=`. Prévia em `/componentes/emails` (só dev). Testes: `src/lib/email/modelo.test.ts`.

## Variáveis de ambiente (passo 3)

| Variável | Dev (docker-compose) | Produção | Para quê |
|----------|----------------------|----------|----------|
| `S3_ENDPOINT` | `http://localhost:8342` | endpoint S3 do R2 (`https://<conta>.r2.cloudflarestorage.com`) ou do SeaweedFS da VPS | API S3; o NAVEGADOR também acessa (envio direto) |
| `S3_REGIAO` | `us-east-1` | `auto` (R2) | região da assinatura |
| `S3_CHAVE` / `S3_SEGREDO` | credencial de DEV de `config/seaweedfs/s3.json` | token S3 do R2 com acesso só aos 3 buckets (segredo do provedor, nunca no repo) | credencial do app |
| `S3_FORCAR_CAMINHO` | `true` | `true` (R2 aceita) | `endpoint/bucket/chave` em vez de subdomínio por bucket |
| `S3_BUCKET_ARQUIVOS` | `lider-arquivos` | idem | capas, thumbs, materiais |
| `S3_BUCKET_VIDEOS_ORIGINAIS` | `lider-videos-originais` | idem | vídeo original enviado (passo 3b) |
| `S3_BUCKET_HLS` | `lider-hls` | idem | saída HLS do FFmpeg (passo 3b) |
| `S3_CORS_ORIGENS` | (opcional) | (opcional) | origens do CORS em `armazenamento:preparar`; sem ela: `BETTER_AUTH_URL` e `*.` do mesmo host |
| `REDIS_URL` | `redis://localhost:6382` | Redis da VPS backend | fila BullMQ do vídeo (passo 3b) |
| `REDIS_PORT` / `S3_PORT` | `6382` / `8342` | — | portas do host no `docker-compose` |
| `STRIPE_SECRET_KEY` | (opcional; vazio = pagamentos desligados) | `sk_live_…` da conta da PLATAFORMA (app e `li-worker-certificados`) | API do Stripe Connect (ADR-0019); testes nunca usam |
| `STRIPE_WEBHOOK_SECRET` | (opcional) | `whsec_…` do endpoint Connect `/api/stripe/webhook` (só app) | assinatura do webhook |
| `EMAIL_LIMITE_HORA` / `EMAIL_LIMITE_DIA` | (opcional; padrão 100 / 1000) | idem no `li-worker-certificados` (quem envia) | teto de envio da fila `emails` (ADR-0020); inválido = padrão |

`next.config.ts` lê `S3_ENDPOINT` e `S3_BUCKET_ARQUIVOS` no build/arranque para o
`images.remotePatterns`: mudou o storage, reinicie o `next dev` / refaça o build.

## Regras

1. Acesso ao banco SO pelo `db` de `src/lib/db/index.ts`. Componente nunca importa `db`.
2. Leitura SEMPRE com `vivos(tabela)`. Consulta relacional (`db.query.x.findMany`) com
   `where` que inclua `is_deleted = false`.
3. Escrita SEMPRE com `modified_by: sessao.userId` e, em edicao/exclusao,
   `updated_at: new Date()` + `travaDeColisao`.
4. Erro esperado → `throw new ErroDeNegocio("mensagem para a tela")`. O resto e erro
   inesperado: vai para o log, a tela recebe mensagem generica.
5. Job demorado (PDF, e-mail, sincronizacao) vai para fila FIFO (BullMQ + Redis), e so e
   enfileirado DEPOIS do commit da transacao. Job idempotente, com DLQ e registro na trilha.
6. Documento gerado (PDF, relatorio) tem versao incremental (v1, v2...) e historico.

## Trilha de auditoria

Tabela `auditoria` (append-only): `user_id`, `acao`, `tabela`, `registro_id`, `detalhes`,
`dados_anteriores`, `dados_novos`, `created_at`. Em producao, o usuario de banco da
aplicacao NAO tem `UPDATE` nem `DELETE` nela:

```sql
REVOKE UPDATE, DELETE ON auditoria FROM app_usuario;
```

Nunca grave senha, hash, token ou codigo OTP em `dados_*`. O visualizador do DONO
(Configurações > Logs) mostra só `detalhes` mascarado — RN-140.

## Comandos

```bash
npm run db:up         # Postgres local
npm run db:generate   # migracao a partir do schema
npm run db:migrate    # aplica
npm run db:studio     # visualizar o banco
```

## Backup (antes de todo deploy em PRD)

```bash
pg_dump "$DATABASE_URL" --no-owner --no-acl --clean --if-exists   --file="backup_$(date +%d_%m_%Y_%H_%M).sql"
```

Backup fica FORA do servidor do banco (Cloudflare R2, bucket `li-backups-prd`) e o restore e testado
(`backup restaurar-teste`, todo dia 1o). Sem HML (ADR-0017), o backup antes do deploy e feito DENTRO da
VPS: o servico `li-ferramentas` roda `deploy/easypanel/ferramentas.sh` = `backup pre-deploy` (o
pg_dump acima, gzip, conferido, em `banco/pre-deploy/`) -> migracao -> buckets. Backup falhou = nao
migra e a versao nova nao e liberada. Banco vazio (1o deploy) = nada a salvar.

O servico `li-backup` (`deploy/easypanel/backup.sh`, `BACKUP_BANCO=1`) faz todo dia o dump em
`banco/diario/` (domingo tambem `banco/semanal/`) e copia `lider-arquivos` e `lider-videos-originais`
para `storage/` (incremental, nunca apaga no destino). Retencao pelo ciclo de vida do bucket (diario
30 d, semanal 90 d, pre-deploy 90 d). `backup restaurar-teste [prefixo]` restaura o ultimo dump num
Postgres descartavel e compara contagens; `backup restaurar <caminho> <banco>` restaura de verdade
(confere o nome, guarda o estado atual, uma transacao). Passo a passo em `docs/deploy-easypanel.md`.
Na alternativa de VPS dedicada (ADR-0015): `deploy/hml/backup.sh` e `deploy/hml/restaurar-teste.sh`.

## Deploy da PRODUCAO (ADR-0017 sobre o desenho do ADR-0016; alternativa ADR-0015)

Sem homologacao: a `develop` roda so o CI; push/merge na `master` faz o deploy de PRD no **Easypanel**
da VPS KVM 8, projeto `lideranca` (servicos com prefixo `li-`, ficha em `deploy/easypanel/servicos.md`,
variaveis em `deploy/easypanel/env.exemplo`). Imagens construidas no CI e publicadas no GHCR (tag do
SHA + tag movel `prd`, `VERSAO_IMAGEM` = SHA dentro delas); o job `deploy-prd` chama a Deployment
Trigger URL de cada servico (`deploy/easypanel/disparar-deploy.sh`) so depois do CI verde e com a
variavel `PRD_ATIVO=true`; o job `voltar-prd` repoe a tag `prd` num SHA anterior. Sem job de
pre-deploy: o `li-ferramentas` faz o backup, migra com trava e grava a marca da versao; app e workers
novos esperam o schema em dia E a marca da versao deles.

**Alternativa (VPS dedicada, ADR-0015)**: Docker Compose (`deploy/hml/docker-compose.yml`) com Caddy
(DNS-01 Cloudflare, curinga `*.hml`), as mesmas imagens e `deploy/hml/implantar.sh <sha>` (migra
ANTES de trocar a versao). Fora do CI; referencia para uma HML futura (`docs/deploy-hml.md`).

| Peca | O que faz |
|------|-----------|
| `GET /api/saude` (`src/app/api/saude/route.ts`) | `{ ok }` 200/503, `no-store`, sem detalhe; fora do matcher do `proxy.ts`. 200 = banco responde E tem todas as migracoes do codigo E (com `VERSAO_IMAGEM`) a marca desta versao no banco (`src/lib/db/migracoes.ts`). Healthcheck do app (`HEALTHCHECK` da imagem, `start-period` 15 min) e conferencia do deploy |
| `src/lib/db/migracoes.ts` | `esquemaEmDia()` compara o `when` da ultima migracao do journal com `max(created_at)` de `drizzle.__drizzle_migrations` (`>=`: a versao anterior segue saudavel) e, com `VERSAO_IMAGEM`, exige `implantacao:<sha>` no `COMMENT` do banco (`implantacaoLiberada`; liberado uma vez, o processo segue liberado); `aguardarEsquema()` segura os workers ate la |
| `scripts/db-migrar.ts` | Migrator do drizzle-orm (sem drizzle-kit) como dono do banco, sob `pg_advisory_lock` (dois conteineres ao mesmo tempo: o segundo espera); com `DB_APP_USUARIO`, reaplica os GRANTs da app (inclusive SELECT na tabela de controle) e revoga UPDATE/DELETE/TRUNCATE de `auditoria`, `criadores_membros_pontos` e `emails_disparos` (lista `APPEND_ONLY`); com `VERSAO_IMAGEM`, grava a marca da versao no `COMMENT` do banco; com `SAUDE_ARQUIVO`, grava o arquivo no fim |
| `scripts/worker-saude.mjs` | Healthcheck da imagem worker: PING no Redis do `REDIS_URL`, ou (com `SAUDE_ARQUIVO`, servico `ferramentas`) o arquivo da migracao existir |
| `deploy/easypanel/ferramentas.sh` | Comando do `li-ferramentas`: `backup pre-deploy` -> `db-migrar.ts` -> `armazenamento:preparar` -> parado; falhou = espera 5 min e sai (sem martelar o banco no reinicio) |
| `deploy/easypanel/banco-bootstrap.sql` | Uma vez, no psql do Easypanel: papeis `lider_migracao` (dono, cria o `unaccent`) e `lider_app` (so DML). Na VPS dedicada: `deploy/hml/postgres-init.sh` |

Os cabecalhos de seguranca (HSTS em producao, `nosniff`, `Referrer-Policy`, `X-Frame-Options:
SAMEORIGIN`, `Permissions-Policy`) saem do proprio app (`next.config.ts`, `headers()`), valendo atras
do Traefik do Easypanel ou do Caddy.

Variaveis da PRD: `deploy/easypanel/env.exemplo` (Easypanel, por servico; `deploy/hml/env.exemplo` na
VPS dedicada), com como gerar cada segredo. Os valores reais moram so no Easypanel. Producao nunca
recebe dado de demonstracao: `seed:demo`, `seed:demo:*` e `sessao:demo` recusam `NODE_ENV=production`
e banco fora do localhost.
`SEED_SUPER_ADMIN_EMAIL`, `SEED_DONO_EMAIL` e `SEED_DONO_NOME` sao passadas so no `npm run db:seed`
manual (Shell do servico `ferramentas`).

## Video (pipeline HLS self-host)

Decisao em ADR-0005; especificacao em `docs/ARQUITETURA_VPS.md`; numeros em `docs/video-benchmark.md`;
regras RN-113 a RN-115.

```
admin (navegador) --multipart pre-assinado (16 MB/parte)--> bucket videosOriginais
  acaoIniciarEnvioVideo -> acaoAssinarPartesVideo (lotes) -> PUT das partes -> acaoConcluirEnvioVideo
  (HEAD confere o tamanho -> PROCESSANDO -> commit -> fila { videoId })
worker (npm run worker:video, outro processo) -> baixa o original -> FFmpeg HLS AES-128 + thumb
  -> sobe em hls/criadores/<criador>/videos/<id>/ -> evento video.pronto (duracao vai para a aula)
player -> acaoIniciarReproducao (sessao de reproducao + token 10 min) -> /api/video/<id>/hls/... e /chave
  renovacao a cada 4 min (acaoRenovarReproducao)
```

| Tabela | O que guarda |
|--------|--------------|
| `produtos_modulos_aulas_videos` | Um video vivo por aula: situacao (ENVIANDO/PROCESSANDO/PRONTO/FALHOU), original, multipart, prefixo HLS, chave cifrada, duracao, resolucoes, thumb, erro legivel |
| `produtos_modulos_aulas_videos_processamentos` | Cada tentativa do worker: situacao, tempos, CPU, cauda do log |
| `produtos_modulos_aulas_videos_sessoes` | Sessoes de reproducao (limite de telas, RN-115) |

| Action (`src/lib/actions/videos.ts`) | Quem | O que faz |
|--------|------|-----------|
| `acaoIniciarEnvioVideo` | DONO, ADMIN | Allowlist (MP4/MOV/MKV/WebM ate 10 GB), registro ENVIANDO, multipart aberto; `substituir: true` troca o video (antigo: soft delete + objetos apagados depois do commit) |
| `acaoAssinarPartesVideo` | DONO, ADMIN | URLs das partes (ate 50 por pedido, 1 h) |
| `acaoConcluirEnvioVideo` | DONO, ADMIN | Fecha o multipart, HEAD, PROCESSANDO, enfileira depois do commit (`enfileirado: false` = fila fora do ar) |
| `acaoCancelarEnvioVideo` | DONO, ADMIN | Aborta o multipart e exclui o registro |
| `acaoReprocessarVideo` | DONO, ADMIN | PROCESSANDO + fila (mesmo jobId: nunca duplica) |
| `acaoIniciarReproducao`, `acaoRenovarReproducao` | quem passa em `podeAssistir` | Abre/renova a sessao de reproducao e devolve o token |

| Rota | Conferencia | Resposta |
|------|-------------|----------|
| `GET /api/video/[id]/hls/[...caminho]` | playlist: token + sessao + video do host + `podeAssistir` + sessao de reproducao; segmento: token valido + host | playlist reescrita (`no-store`); segmento: 302 para URL assinada de 60 s |
| `GET /api/video/[id]/chave` | igual a playlist; recusa na trilha | 16 bytes, `no-store` |
| `GET /api/video/[id]/situacao` | sessao + DONO/ADMIN do host | JSON do estado (polling do editor) |

| Arquivo | O que faz |
|---------|-----------|
| `src/lib/video/provedor.ts` / `provedor-proprio.ts` | Interface `ProvedorVideo` e a implementacao self-host (envio, fila, token, eventos, situacao) |
| `src/lib/video/registro.ts` | Leitura do video e eventos do worker (idempotentes: so valem em PROCESSANDO) |
| `src/lib/video/entrega.ts` | Playlist, chave e segmento protegidos (os route handlers so repassam) |
| `src/lib/video/acesso.ts` / `acesso-aula.ts` | `podeAssistir` (RN-114, puro) e `acessoDaAula` (aula/modulo/produto + matricula valendo, para o token e a entrega) |
| `src/lib/video/sessoes.ts` / `reproducao.ts` | Limite de telas (puro) e sessoes de reproducao no banco |
| `src/lib/video/regras.ts` | Allowlist, partes do multipart, caminhos HLS aceitos (tela e servidor) |
| `src/lib/video/worker.ts` | Um job: baixa, processa, sobe, evento; erro legivel para a tela |
| `src/lib/video/ffmpeg.ts`, `processar.ts`, `segmento.ts` | Argumentos do FFmpeg, execucao (`spawn` sem shell, prioridade baixa, prazo), conferencia da cifra |
| `src/lib/video/chaves.ts`, `token.ts`, `playlist.ts` | Chave cifrada (AES-256-GCM, `v1:`), token HMAC, reescrita da playlist |
| `src/lib/video/fila.ts` | Fila BullMQ (payload `{ videoId }`, jobId = videoId, 3 tentativas, backoff, DLQ, prefixo) |
| `src/components/video/player-hls.tsx` | Player minimo (hls.js + `xhrSetup` com o token atual; HLS nativo sem MediaSource; marca d'agua) |
| `scripts/worker-video.ts` | Processo do worker (nunca dentro do Next), concorrencia 1 |

Variaveis de ambiente (documentar tambem no `.env.example`):

| Variavel | Quem usa | Formato |
|----------|----------|---------|
| `VIDEO_CHAVE_MESTRA` | app e worker | 32 bytes em base64 (`openssl rand -base64 32`). Sem ela o worker nao sobe. Trocar = rotacao (`v2:`), nunca sobrescrever |
| `VIDEO_SEGREDO_TOKEN` | app (e a borda que validar o token) | >= 32 caracteres aleatorios (`openssl rand -base64 32`) |
| `REDIS_URL` | app (enfileira) e worker (consome) | `redis://host:porta` |
| `VIDEO_FILA_PREFIXO` | app e worker | Prefixo das chaves da fila no Redis (padrao `li`; o teste usa `li-teste`) |
| `VIDEO_LIMITE_SESSOES` | app | Telas simultaneas por pessoa, 1 a 10 (padrao 2) |

Comandos:

```bash
npm run worker:video                                              # worker (outro terminal/container)
npx tsx scripts/video-gerar-teste.ts <pasta-fora-do-repo>          # videos sinteticos de teste
npx tsx scripts/video-benchmark.ts <pasta-fora-do-repo> [rotulo]   # mede e confere a saida
# Ponta a ponta REAL (FFmpeg + SeaweedFS + Redis + worker em processo separado), fora do npm test:
VIDEO_TESTE_REAL=1 npx vitest run --config config/vitest.config.mts --project integracao tests/integracao/video-pipeline.test.ts
VIDEO_TESTE_REAL=1 npx vitest run --config config/vitest.config.mts tests/video   # so o FFmpeg em disco local
```

`tests/integracao/video.test.ts` roda no `npm test` (precisa do storage no ar; sem ele, pula com aviso).

## Legendas e transcrição (RN-180, ADR-0013)

```
admin (navegador) --URL assinada (finalidade LEGENDA, .vtt/.srt até 2 MB)--> bucket arquivos (legendas-envios/)
  acaoIniciarEnvio -> PUT -> acaoConfirmarEnvio (HEAD) -> acaoEnviarLegenda
  (servidor lê o bruto com teto -> processarLegenda: decodifica, valida, converte, sanitiza
   -> grava criadores/<criador>/legendas/<id>.vtt -> transação: linha + bruto descartado + trilha)
player -> <track src="/api/legendas/<id>"> (modo hidden; o player desenha) e a aba Transcrição (mesmo .vtt)
```

| Tabela | O que guarda |
|--------|--------------|
| `produtos_modulos_aulas_legendas` | Uma viva por (aula, idioma): idioma (BCP-47 simples, CHECK), rótulo, nome do arquivo enviado, chave do `.vtt` normalizado (CHECK `legendas/`), `texto` puro sem tempos, trechos, duração coberta, `enviado_por`. Trocar = soft delete da anterior + linha nova (o `.vtt` antigo fica no storage) |

| Action (`src/lib/actions/legendas.ts`, Zod em `src/lib/validators/legendas.ts`) | Quem | O que faz |
|--------|------|-----------|
| `acaoEnviarLegenda({ aulaId, arquivoId, idioma, rotulo, substituir: { legendaId, versao } \| null })` | DONO, ADMIN | Lê o bruto (`LEGENDA`, DISPONIVEL, deste criador), `gravarLegenda`. Mesmo idioma sem `substituir` = recusa ("Use Trocar"); com `substituir`, trava pela versão e herda o idioma da anterior. Duração conferida contra o vídeo vivo (ou a aula) + 10 s. Trilha com metadados, sem o texto |
| `acaoRemoverLegenda({ legendaId, versao })` | DONO, ADMIN | Soft delete com trava e trilha (a tela confirma com o modal de 3 s) |

| Rota | Conferência | Resposta |
|------|-------------|----------|
| `GET /api/legendas/[id]` | sessão do HOST (401) + legenda viva deste criador (404) + `acessoDaAula` (403, na trilha) | `text/vtt; charset=utf-8`, `Cache-Control: private, max-age=300`, `nosniff` |

| Arquivo | O que faz |
|---------|-----------|
| `src/lib/legendas/regras.ts` | PURO (tela e servidor): `decodificarLegenda` (UTF-8/BOM, UTF-16 com BOM, Windows-1252), `lerLegenda` (VTT/SRT, erros com a linha; até 20.000 trechos e 1.000 caracteres por trecho), `sanitizarTexto` (texto puro), `gerarVtt`, `textoPuro`, `processarLegenda`, `RE_IDIOMA`; aba Transcrição: `buscarTrechos`, `partesComDestaque`, `trechoAtual` |
| `src/lib/legendas/servico.ts` | `lerArquivoBruto`, `lerObjetoLimitado`, `gravarLegenda` (também usado por `scripts/seed-demo-legendas.ts`), `removerLegenda` |
| `src/lib/legendas/consultas.ts` | `legendasDaAula` (editor e `aulaParaPlayer`, só com `pode`), `urlDaLegenda` |
| `src/lib/legendas/entrega.ts` | `servirLegenda` (o route handler só repassa) |

`listarVideos` (Estúdio) devolve `legendas` = idiomas vivos da aula ("pt-BR · en") ou nulo.
Demonstração: `npx tsx --conditions=react-server scripts/seed-demo-legendas.ts` (depois do `seed-demo-video.ts`).
`tests/integracao/legendas.test.ts` roda no `npm test` (precisa do storage no ar; sem ele, pula com aviso).

## Base de conhecimento e assistente do professor (RN-190 a RN-197, ADR-0014)

```
legenda/aula/curso salvos --(depois do commit)--> fila `conhecimento` (worker:certificados, 3º Worker)
  -> sincronizarAula/sincronizarProduto: relê a fonte (+ .vtt no storage para os tempos) -> trechos (assinatura)
texto da equipe -> acaoCriarTexto/acaoSalvarTexto -> trechos NA MESMA transação
aluno -> POST /api/assistente {pergunta, conversaId?, aulaId?}
  -> sessão do HOST + CSRF -> assistente ligado -> acessoDaAula (se aulaId)
  -> recuperarTrechos (SQL: matrícula valendo, publicado; JS: motivoDoBloqueio) -> limite diário (lock)
  -> sem trecho: resposta fixa (sem API) | com trecho: Claude (stream) -> NDJSON -> grava resposta + tokens
```

| Tabela (migração 0011) | O que guarda |
|--------|--------------|
| `criadores_conhecimento_documentos` | Uma fonte: `fonte` (AULA_TRANSCRICAO, AULA_DESCRICAO, PRODUTO_DESCRICAO, TEXTO; CHECK de coerência com `aula_id`/`produto_id`), título, texto, `incluir`, `assinatura` (sha256 dos trechos), `trechos`, `indexado_em`. FKs compostas para aula e curso; uma derivada viva por (fonte, aula) e por (fonte, curso) |
| `criadores_conhecimento_documentos_trechos` | Trecho de ~800–1200 caracteres, `ordem`, `inicio_seg` (só transcrição), `busca` = `tsvector` GERADO (`to_tsvector('portuguese', li_sem_acento(texto))`, índice GIN parcial). A migração cria `unaccent` e o invólucro IMMUTABLE `li_sem_acento` |
| `criadores_assistentes` | 1:1 com o criador: `ligado`, `nome`, `instrucoes` (≤ 800), `limite_diario` (1–200, padrão 20), `todos_os_cursos` |
| `criadores_assistentes_produtos` | Cursos em que aparece quando `todos_os_cursos = false` (FK composta) |
| `criadores_assistentes_conversas` | Do membro (FK composta), `aula_id` onde começou, `titulo`, `teste` (playground da equipe) |
| `criadores_assistentes_conversas_mensagens` | `papel` USUARIO/ASSISTENTE, texto, `fontes` jsonb (só as citadas), tokens de entrada/saída/cache, `modelo`, `sem_resposta`, `interrompida`; `membro_id` repetido para o limite diário (índices por membro e por criador/dia) |

| Action | Quem | O que faz |
|--------|------|-----------|
| `acaoCriarTexto({ titulo, texto, produtoId \| null })` (`src/lib/actions/conhecimento.ts`, Zod em `src/lib/validators/ia.ts`) | DONO, ADMIN | Texto puro (invisíveis fora), curso opcional deste criador; trechos na transação; trilha sem o texto |
| `acaoSalvarTexto({ documentoId, versao, titulo, texto, produtoId })` / `acaoExcluirTexto({ documentoId, versao })` | DONO, ADMIN | Trava por `updated_at`; excluir = lógico do documento e dos trechos (modal de 3 s na tela) |
| `acaoIncluirDocumento({ documentoId, versao, incluir })` | DONO, ADMIN | Liga/desliga qualquer fonte, com trava e trilha |
| `acaoTestarBusca({ pergunta })` | DONO, ADMIN | Os trechos que o assistente receberia (cursos do assistente, acesso de equipe). Sem API, sem cota |
| `acaoSalvarConfigAssistente({ versao, ligado, nome, instrucoes, limiteDiario, todosOsCursos, produtos })` (`src/lib/actions/assistente.ts`) | DONO, ADMIN | Cria/atualiza com trava; cursos vivos deste criador; trilha com antes/depois |
| `acaoApagarConversa({ conversaId, versao })` | o PRÓPRIO membro | Lógico da conversa e das mensagens, trilha sem o conteúdo; a cota do dia não volta |

| Rota | Conferência | Resposta |
|------|-------------|----------|
| `POST /api/assistente` `{ pergunta (2–1000), conversaId?, aulaId?, teste? }` | `Content-Type: application/json` e Origin do próprio host (403); sessão do HOST (401); vínculo (403); `teste` só equipe (403, na trilha); Zod (400); desligado/aula sem acesso (400); limite (429); sem chave (503) | `application/x-ndjson`: `inicio {conversaId, fontes, restantes}`, `texto`, `substituir` (recusa do modelo), `fim {mensagemId, semResposta, citadas, versao}`, `erro`. Cliente desconectou = aborta o modelo e grava `interrompida` |

| Arquivo | O que faz |
|---------|-----------|
| `src/lib/conhecimento/regras.ts` | PURO: `dividirEmTrechos`, `dividirTranscricao`, `consultaDaPergunta` (OU, só letras/dígitos), `ROTULO_FONTE` |
| `src/lib/conhecimento/indexar.ts` | `sincronizarAula`, `sincronizarProduto`, `indexarTexto`, `sincronizar`, `reindexarCriador` (idempotentes) |
| `src/lib/conhecimento/fila.ts`, `pedir.ts` | Fila `conhecimento` (DLQ `conhecimento-dlq`) e `pedirReindexacao` (fila; fora do ar = na hora; nunca derruba a ação) |
| `src/lib/conhecimento/busca.ts` | `recuperarTrechos(criadorId, { papel, membroId }, pergunta, { produtos, limite, porDocumento })` — o filtro de acesso |
| `src/lib/conhecimento/consultas.ts` | Tela da equipe: `fontesDoCriador`, `totaisDaBase`, `textoParaEditar`, `cursosDoCriador` |
| `src/lib/assistente/regras.ts`, `texto.ts` | PUROS: prompt (`montarSistema`, `montarMensagem`, escape), `citacoesDoTexto`, `custoUsd`/`PRECOS`, `recusaDoLimite`, `tetoDoCriador`, `hrefDaFonte`; renderizador mínimo `blocosDoTexto` |
| `src/lib/assistente/cliente.ts`, `cliente-falso.ts` | `ClienteIA` + implementação `@anthropic-ai/sdk` (`messages.stream`, `cache_control` no sistema, esforço `low`, `max_tokens` 1500); `ClienteFalso` para testes e seed |
| `src/lib/assistente/responder.ts`, `rota.ts`, `conversas.ts`, `config.ts`, `tela.ts`, `admin.ts` | Fluxo da pergunta, route handler, conversas e limite (lock por criador), configuração, dados das telas do aluno, perguntas recentes e consumo |

| Variável | Para quê |
|----------|----------|
| `ANTHROPIC_API_KEY` | Chave da Anthropic, SÓ no servidor (nunca no cliente, log ou trilha). Ausente = "IA não configurada" |
| `ANTHROPIC_MODELO` | Modelo (padrão `claude-sonnet-5-5`) |
| `ANTHROPIC_WORKSPACE_ID` | Opcional: com chave de organização (não ligada a um workspace), vai no cabeçalho `anthropic-workspace-id` de toda chamada (`defaultHeaders`). Sem ela e com essa chave, a API responde 400; a equipe vê "Chave da IA sem workspace: configure ANTHROPIC_WORKSPACE_ID ou use uma chave de workspace", o aluno só a mensagem genérica. O cliente é criado uma vez por processo: mudou a variável, reinicie o app |
| `ASSISTENTE_TETO_DIARIO_CRIADOR` | Teto de perguntas por criador por dia (padrão 500) |

Comandos: `npm run conhecimento:reindexar -- <slug>` (idempotente) e, só em dev,
`npm run seed:demo:assistente` (textos de exemplo, reindexação e 3 conversas pelo fluxo real com o
cliente falso). Teste REAL mínimo (pessoa roda; 2 chamadas, `max_tokens` 300, nada gravado): `npx tsx --env-file=.env --conditions=react-server scripts/assistente-teste-real.ts [slug]`. `tests/integracao/assistente.test.ts` usa só o `ClienteFalso` (o `_ambiente.ts` apaga a chave).

## Fase 1: tags, vouchers, feedback, disparos, webhooks, abas e IA no estúdio (ADR-0018, RN-200 a RN-206)

Migração `0012_fase1_tags_vouchers_webhooks` (só aditiva; o CHECK de `produtos_matriculas.origem`
ganhou `VOUCHER`). Convenção de todas as actions abaixo: `"use server"`, `executar()` → `Resultado`,
criador do HOST, Zod `strictObject` de `src/lib/validators/<entidade>.ts` (as telas importam os
MESMOS schemas), `versao` = `updated_at` ISO devolvido para a próxima edição, trilha na transação.
Serviços recebem `tx` + `criadorId` + `autor` (id do usuário da sessão), nunca de input.

### Tags de membros (RN-200) — DONO e ADMIN

| Tabela | Colunas |
|--------|---------|
| `criadores_tags` | `nome` (1–40, único por criador em `lower`), `cor` `#rrggbb`; `uq (id, criador_id)` |
| `criadores_membros_tags` | `membro_id`, `tag_id` (FKs compostas com `criador_id`); um vivo por (membro, tag) |

| Função | Assinatura / o quê |
|--------|-------------------|
| `acaoCriarTag` | `{ nome, cor }` → `{ id, versao }` (nome repetido = "Já existe uma tag com este nome.") |
| `acaoSalvarTag` | `{ tagId, versao, nome, cor }` → `{ versao }` |
| `acaoExcluirTag` | `{ tagId, versao }` → `{ desmarcados }` (ModalConfirmacaoBlock; tira de todos) |
| `acaoAplicarTag` / `acaoRemoverTag` | `{ tagId, membroIds[1..500] }` → `{ aplicadas, jaTinham }` / `{ removidas }` (idempotentes) |
| `listarTags(criadorId)` (`membros/consultas.ts`) | `[{ id, nome, cor, criadoEm, versao, membros }]` |
| `tagsDosMembros(criadorId, membroIds)` | `Map<membroId, { id, nome, cor }[]>` |
| `listarMembros(criadorId, { ..., tagId })` | filtro novo `tagId`; cada linha traz `tags` |
| Serviço `src/lib/tags/servico.ts` | `criarTag`, `salvarTag`, `excluirTag`, `aplicarTag`, `removerTag` (todos `(tx, p)`) |

### Vouchers (RN-201) — gerenciar: DONO e ADMIN; resgatar: qualquer membro com vínculo

| Tabela | Colunas |
|--------|---------|
| `criadores_vouchers` | `codigo` (CHECK `^[A-HJ-NP-Z2-9]{6,16}$`, único por criador entre os vivos), `descricao` ≤ 200, `situacao` ATIVO/PAUSADO/ENCERRADO, `valido_ate?`, `limite_usos?`, `limite_por_pessoa` (1–100), `dias_acesso?` (1–3650) |
| `criadores_vouchers_produtos` | `voucher_id`, `produto_id` (FKs compostas) |
| `criadores_vouchers_resgates` | `voucher_id`, `membro_id`, `matriculas` jsonb `[{ produtoId, matriculaId, resultado }]`; `created_at` = quando |

| Função | Assinatura / o quê |
|--------|-------------------|
| `acaoCriarVoucher` | `{ codigo?: string \| null, descricao?, validoAte?: ISO \| null, limiteUsos?, limitePorPessoa?, diasAcesso?, produtoIds[1..50] }` → `{ id, codigo, versao }` (`codigo` nulo = gerado, 8 símbolos) |
| `acaoSalvarVoucher` | `{ voucherId, versao, ...os mesmos campos menos codigo }` → `{ versao }` (encerrado não edita) |
| `acaoMudarSituacaoVoucher` | `{ voucherId, versao, situacao }` → `{ versao }` (ENCERRADO é final) |
| `acaoExcluirVoucher` | `{ voucherId, versao }` (só sem resgates) |
| `acaoResgatarVoucher` (aluno) | `{ codigo }` (aceita minúsculas, espaço, hífen) → `{ resgateId, matriculas }`; notifica e emite `MATRICULA_CRIADA` depois do commit |
| `listarVouchers(criadorId, { busca?, situacao? })` (`vouchers/consultas.ts`) | `[{ id, codigo, descricao, situacao, validoAte, limiteUsos, limitePorPessoa, diasAcesso, criadoEm, versao, usos, expirado, produtos: [{ id, titulo }] }]` |
| `resgatesDoVoucher(criadorId, voucherId)` | `[{ id, membroId, nome, email, resgatadoEm, matriculas }]` ou `null` |
| `src/lib/vouchers/regras.ts` (puro, tela e servidor) | `gerarCodigoVoucher`, `normalizarCodigoVoucher`, `formatarCodigoVoucher` (`ABCD-EFGH`), `motivoRecusaResgate`, `TEXTO_RECUSA_RESGATE`, `transicaoVoucherValida`, `expiracaoDoResgate` |
| Serviço `vouchers/servico.ts` | `criarVoucher`, `salvarVoucher`, `mudarSituacaoVoucher`, `excluirVoucher`, `resgatarVoucher(tx, { criadorId, membroId, usuarioId, codigo })` (voucher `FOR UPDATE`; `matricular` origem VOUCHER, referência `voucher:<resgate>:<produto>`) |

### Feedback de conteúdo (RN-202)

Tabela `produtos_modulos_aulas_feedbacks`: `aula_id`, `membro_id` (FKs compostas), `util` boolean,
`comentario?` (1–500, texto puro); um vivo por (membro, aula).

| Função | Quem | Assinatura / o quê |
|--------|------|-------------------|
| `acaoDarFeedback` | ALUNO com acesso à aula | `{ aulaId, util, comentario? }` → `{ id, versao }` (UPSERT; equipe recebe "Só alunos avaliam as aulas.") |
| `acaoRemoverFeedback` | o próprio aluno | `{ aulaId }` → `{ removido }` |
| `meuFeedback(criadorId, membroId, aulaId)` | tela da aula | `{ util, comentario, versao } \| null` |
| `feedbacksDoCriador(criadorId, { produtoId?, aulaId?, util?, soComComentario?, pagina, porPagina })` | DONO e ADMIN | `{ total, linhas: [{ id, util, comentario, quando, aulaId, aula, produtoId, produto, membroId, nome, email }] }` |
| `resumoFeedbackPorAula(criadorId, produtoId?)` | DONO e ADMIN | `[{ aulaId, aula, produtoId, produto, avaliacoes, uteis, percentualUtil, comentarios }]`, piores primeiro |

### Disparos de e-mails (RN-203) — só DONO

Tabela `emails_disparos` (**append-only**, sem `updated_at`/`is_deleted`/`modified_by`): `criador_id?`
(nulo = plataforma), `tipo` (`TIPOS_EMAIL`), `destinatario_mascarado`, `destinatario_hash` (HMAC hex),
`assunto`, `situacao` (`SITUACOES_EMAIL`), `erro?` (código), `created_at`.

| Função | Assinatura / o quê |
|--------|-------------------|
| `listarDisparos(criadorId, { tipo?, situacao?, email?, pagina, porPagina })` | `{ total, linhas: [{ id, tipo, destinatario, assunto, situacao, erro, quando }] }`; `email` = busca EXATA pelo HMAC |
| `resumoDisparos(criadorId, dias = 30)` | `{ ENVIADO, FALHOU, NAO_CONFIGURADO }` |
| `registrarDisparo(d)` | chamado só por `enviarEmail` |

### Integrações e webhooks (RN-204) — só DONO

| Tabela | Colunas |
|--------|---------|
| `criadores_webhooks` | `nome` (2–60), `url` (https, ≤ 500), `eventos` text[] (`EVENTOS_WEBHOOK`, ≥ 1), `situacao` ATIVO/PAUSADO, `segredo_cifrado` (`v1:` AES-256-GCM), `segredo_final` (4) |
| `criadores_webhooks_entregas` | `webhook_id` (FK composta), `evento`, `payload` jsonb (`PayloadWebhook`: `id` do evento, `evento`, `ocorridoEm`, `criador {id, slug}`, `dados`), `situacao` PENDENTE/ENTREGUE/FALHOU, `tentativas`, `status_http?`, `erro?` (≤ 300), `proxima_tentativa_em?`, `entregue_em?` |

| Função | Assinatura / o quê |
|--------|-------------------|
| `acaoCriarWebhook` | `{ nome, url, eventos[] }` → `{ id, segredo, versao }` (segredo em claro SÓ aqui; até 10 por área) |
| `acaoSalvarWebhook` | `{ webhookId, versao, nome, url, eventos }` → `{ versao }` |
| `acaoMudarSituacaoWebhook` | `{ webhookId, versao, situacao }` → `{ versao }` |
| `acaoRotacionarSegredoWebhook` | `{ webhookId, versao }` → `{ segredo, versao }` (ModalConfirmacaoBlock) |
| `acaoExcluirWebhook` | `{ webhookId, versao }` (ModalConfirmacaoBlock) |
| `acaoReenviarEntrega` | `{ entregaId, versao }` → `{ versao }` (só FALHOU, webhook ATIVO) |
| `listarWebhooks(criadorId)` (`webhooks/consultas.ts`) | `[{ id, nome, url, eventos, situacao, segredoFinal, criadoEm, versao }]` (nunca a cifra) |
| `entregasDoWebhook(criadorId, webhookId, { situacao?, limite? = 50 })` | `[{ id, evento, payload, situacao, tentativas, statusHttp, erro, proximaTentativaEm, entregueEm, criadoEm, versao }]` ou `null` |
| `src/lib/webhooks/regras.ts` (puro, tela) | `ROTULO_EVENTO_WEBHOOK`, `problemaNaUrlWebhook`, cabeçalhos `X-Lider-Assinatura`/`X-Lider-Evento`/`X-Lider-Entrega`, `TENTATIVAS_WEBHOOK` (8), `atrasoDaProxima`, `MAX_WEBHOOKS_POR_CRIADOR` |
| `emitir.ts` (depois do commit, nunca lança) | `webhookMatriculas(criadorId, ids, "MATRICULA_CRIADA" \| "MATRICULA_CANCELADA", autorId)`, `webhookMembrosCadastrados`, `webhookAulaConcluida`, `webhookCursoConcluido`, `webhookAvaliacaoAprovada`, `webhookCertificadoEmitido` — ligados em `actions/matriculas.ts`, `matriculas-importacao.ts`, `membros.ts`, `vouchers.ts`, `progresso/registrar.ts`, `avaliacoes/tentativas.ts`, `certificados/emissao.ts` |
| `rede.ts` | `ipBloqueado`, `resolverPublico`, `postarWebhook` (SSRF, `lookup` fixado, 5 s, sem redirect) |
| `segredo.ts` | `gerarSegredoWebhook`, `cifrarSegredo`/`decifrarSegredo` (HKDF do `BETTER_AUTH_SECRET`, AAD = id), `assinarCorpo` |
| `entrega.ts` + `fila.ts` | `processarEntrega(entregaId, tentativa, max, postar?)` (4º Worker de `worker:certificados`), `entregasPendentes()`; fila `webhooks`, DLQ `webhooks-dlq`, `jobId` = entrega, backoff exponencial 30 s |

Receptor confere: `HMAC_SHA256(segredo, "<t>.<corpo cru>") == v1` e `|agora - t|` pequeno; deduplica
por `X-Lider-Entrega` (ou `payload.id`, o mesmo em todo webhook do evento).

### Abas de acompanhamento (RN-205) — só consultas

| Função | Onde / quem | Devolve |
|--------|-------------|---------|
| `progressoDasMatriculas(criadorId, { produtoId?, busca?, soEmAndamento?, pagina, porPagina })` | `matriculas/abas.ts`, Matrículas › Progresso (DONO, ADMIN) | `{ total, linhas: [{ matriculaId, membroId, nome, email, produtoId, produto, iniciadaEm, concluidaEm, expiraEm, totalAulas, concluidas, percentual, ultimaAtividade }] }` |
| `tentativasDoCriador(criadorId, { produtoId?, avaliacaoId?, aprovada?, busca?, pagina, porPagina })` | Matrículas › Avaliações | `{ total, linhas: [{ tentativaId, numero, iniciadaEm, finalizadaEm, finalizadaPor, nota, aprovada, emAndamento, avaliacaoId, avaliacao, notaMinima, produtoId, produto, membroId, nome, email }] }` (só ALUNOS) |
| `esgotaramSemAprovar(criadorId)` | Matrículas › Tentativas extras (fila) | `[{ membroId, nome, email, avaliacaoId, avaliacao, produto, finalizadas, extras, melhorNota, ultimaEm }]`; conceder = `acaoConcederTentativa` (já existe) |
| `concessoesDoCriador(criadorId, { avaliacaoId?, pagina, porPagina })` | Matrículas › Tentativas extras (histórico) | `{ total, linhas: [{ id, quantidade, motivo, quando, avaliacaoId, avaliacao, membroId, nome, email, concedidaPor }] }` |
| `anotacoesDoAluno(q: QuemPede, { produtoId?, limite? })` | `progresso/continuar.ts`, Continuar › Anotações (o próprio) | `[{ id, texto, tempoSeg, criadaEm, versao, aulaId, aula, produtoId, produto, produtoSlug }]`; editar/remover = actions de anotação existentes |
| `turmasDoAluno(q: QuemPede)` | Continuar › Turmas (o próprio) | `[{ id, nome, tipo, entrouEm, membros }]` |
| `estatisticasDosVideos(criadorId, { produtoId?, dias? = 30 })` | `video/estatisticas.ts`, Estúdio › Estatísticas (DONO, ADMIN) | `[{ videoId, aulaId, aula, produtoId, produto, duracaoSeg, visualizacoes, espectadores, minutosAssistidos, retencaoMedia, conclusoes }]`, mais vistos primeiro |

### IA no Estúdio (RN-206) — DONO e ADMIN

Tabela `produtos_modulos_aulas_sugestoes`: `aula_id` (FK composta), `descricao`, `capitulos` jsonb
(`Capitulo[]`), `perguntas` jsonb (`PerguntaSugerida[]`: `enunciado`, `opcoes[]`, `correta` índice,
`explicacao`), `modelo`, `tokens_*`, `descricao_aplicada_em?`, `capitulos_aplicados_em?`,
`perguntas_aplicadas_em?`. Descartar = soft delete (conta no limite diário).

| Função | Assinatura / o quê |
|--------|-------------------|
| `acaoGerarSugestao` | `{ aulaId }` → `{ id, versao }` (segundos; recusas: "IA não configurada", sem legenda, limite de 30/dia, formato inesperado) |
| `acaoAplicarSugestao` | `{ parte: "DESCRICAO" \| "CAPITULOS", sugestaoId, versao, aulaVersao }` ou `{ parte: "PERGUNTAS", sugestaoId, versao, avaliacaoId, indices? }` → `{ versao, aulaVersao, questoes }` (descrição reindexa a base do assistente) |
| `acaoDescartarSugestao` | `{ sugestaoId, versao }` |
| `sugestoesDaAula(criadorId, aulaId)` (`estudio-ia/servico.ts`) | últimas 20 vivas com `custoUsd` estimado e o que já foi aplicado |
| `geracoesDeHoje(criadorId)` | contador do limite (mostrar "x de 30 hoje") |
| `src/lib/estudio-ia/regras.ts` (puro) | `LIMITES_ESTUDIO_IA`, `SISTEMA_ESTUDIO_IA`, `transcricaoComTempos`, `montarPedidoEstudio`, `lerSugestao` |

Testes: `tests/integracao/fase1-tags-vouchers.test.ts`, `fase1-feedback-disparos.test.ts`,
`fase1-webhooks.test.ts`, `fase1-estudio-ia.test.ts` (Postgres real; IA só com o `ClienteFalso`; o POST
do webhook é injetado) e os puros `src/lib/vouchers/regras.test.ts`, `src/lib/webhooks/regras.test.ts`
(SSRF, cifra, assinatura), `src/lib/estudio-ia/regras.test.ts`, `src/lib/email/modelo.test.ts`.

## Fase 2: pagamentos por Stripe Connect (ADR-0019, RN-210 a RN-217)

Migração `0013_fase2_pagamentos_stripe` (só aditiva: 7 tabelas novas, `stripe_eventos` append-only e a
coluna `criadores.taxa_plataforma_bps` default 800). **Dinheiro em centavos inteiros** (`number` inteiro na
tela; `formatarCentavos` para exibir); taxa e comissão em **bps** (800 = 8%). Mesma convenção da Fase 1:
`executar()` → `Resultado`, criador do HOST, Zod `strictObject` de `src/lib/validators/pagamentos.ts` (as
telas importam os mesmos schemas), `versao` = `updated_at` ISO, trilha na transação. Ação crítica
(excluir, reembolsar) com `ModalConfirmacaoBlock`. Sem `STRIPE_SECRET_KEY`: as actions que falam com o
Stripe devolvem "Pagamentos não configurados nesta plataforma." (as de oferta/cupom/afiliado funcionam).

| Tabela | Colunas |
|--------|---------|
| `criadores.taxa_plataforma_bps` | 0–5000, default 800 (só SUPER_ADMIN muda) |
| `criadores_stripe_contas` | `conta_id` (`acct_…`, único), `cobrancas_ativas`, `repasses_ativos`, `dados_enviados`, `status_em`; uma viva por criador |
| `criadores_ofertas` | `nome` (2–80), `tipo` AVULSO/ASSINATURA (fixo), `preco_centavos` (100–100.000.000), `moeda` BRL, `intervalo` MES/ANO (só assinatura), `dias_acesso?` (só avulso, 1–3650), `situacao` ATIVA/PAUSADA |
| `criadores_ofertas_produtos` | `oferta_id`, `produto_id` (FKs compostas) |
| `criadores_cupons` | `codigo` (`^[A-Z0-9]{3,20}$`, único vivo), `tipo` PERCENTUAL (`percentual_bps` 1–10000) ou VALOR (`valor_centavos`), `oferta_id?`, `valido_ate?`, `limite_usos?`, `situacao` ATIVO/PAUSADO |
| `criadores_afiliados` | `nome`, `email`, `codigo` (`^[A-Z0-9]{4,20}$`, único vivo), `comissao_bps` (0–9000), `situacao` |
| `criadores_vendas` | `oferta_id`, `tipo`, `membro_id?`, `comprador_email?`, `afiliado_id?`, `cupom_id?`, `assinatura_id?`, `checkout_sessao_id?`/`fatura_id?` (um dos dois; únicos), `payment_intent_id?` (único), `situacao` (`SITUACOES_VENDA`), `valor_centavos` (cobrado), `desconto_centavos`, `taxa_bps`, `taxa_centavos`, `comissao_centavos`, `reembolsado_centavos`, `taxa_devolvida_centavos`, `pago_em?`, `matriculas` jsonb |
| `criadores_assinaturas` | `oferta_id`, `membro_id`, `stripe_assinatura_id` (`sub_…`, único), `situacao` (`SITUACOES_ASSINATURA`), `taxa_bps`, `periodo_fim?`, `cancelar_no_fim`, `encerrada_em?`, `evento_em?` |
| `stripe_eventos` (**append-only**) | `evento_id` (único), `tipo`, `conta_id?`, `criador_id?`, `objeto_id?`, `livemode`, `ocorrido_em`, `created_at` — sem payload |

### Actions (`src/lib/actions/pagamentos.ts` e `ofertas.ts`)

| Action | Quem | Entrada → saída |
|--------|------|-----------------|
| `acaoConectarStripe()` | DONO | → `{ url }` (Account Link de uso único: redirecione na hora). Retorno em `/admin/configuracoes/pagamentos?stripe=retorno`; link vencido volta em `?stripe=renovar` (chame de novo) |
| `acaoAtualizarContaStripe()` | DONO, ADMIN | → `{ cobrancasAtivas, repassesAtivos, dadosEnviados }` (relê na API; use no `?stripe=retorno`) |
| `acaoReembolsarVenda` | DONO | `{ vendaId, versao }` → `{ matriculasCanceladas }` (total; assinatura também é cancelada no Stripe) |
| `acaoMudarTaxaCriador` | SUPER_ADMIN no apex | `{ criadorId, versao (do criador), taxaBps }` → `{ versao }` |
| `acaoCriarOferta` | DONO, ADMIN | `{ tipo, nome, precoCentavos, intervalo?, diasAcesso?, produtoIds[1..50] }` → `{ id, versao }` |
| `acaoSalvarOferta` | DONO, ADMIN | `{ ofertaId, versao, nome, precoCentavos, intervalo?, diasAcesso?, produtoIds }` → `{ versao }` |
| `acaoMudarSituacaoOferta` / `acaoExcluirOferta` | DONO, ADMIN | `{ ofertaId, versao, situacao }` → `{ versao }` / `{ ofertaId, versao }` |
| `acaoCriarCupom` | DONO, ADMIN | `{ codigo, tipo, percentualBps?, valorCentavos?, ofertaId?, validoAte?: ISO, limiteUsos? }` → `{ id, versao }` |
| `acaoSalvarCupom` / `acaoMudarSituacaoCupom` / `acaoExcluirCupom` | DONO, ADMIN | `{ cupomId, versao, ...campos }` / `{ cupomId, versao, situacao }` / `{ cupomId, versao }` |
| `acaoCriarAfiliado` | DONO, ADMIN | `{ codigo?: string \| null, nome, email, comissaoBps }` → `{ id, codigo, versao }` (código nulo = gerado) |
| `acaoSalvarAfiliado` / `acaoMudarSituacaoAfiliado` / `acaoExcluirAfiliado` | DONO, ADMIN | `{ afiliadoId, versao, nome, email, comissaoBps }` / `{ afiliadoId, versao, situacao }` / `{ afiliadoId, versao }` |

### Leituras para as telas (`src/lib/pagamentos/consultas.ts`)

| Função | Devolve |
|--------|---------|
| `contaStripe(criadorId)` | `{ conectada, contaId, cobrancasAtivas, repassesAtivos, dadosEnviados, taxaBps }` |
| `pagamentosDosCriadores()` (/plataforma) | `[{ criadorId, slug, nome, taxaBps, versao, contaId, cobrancasAtivas }]` |
| `listarOfertas(criadorId, slug)` | `[{ id, nome, tipo, precoCentavos, intervalo, diasAcesso, situacao, link, criadoEm, versao, produtos: [{ id, titulo }] }]` |
| `listarCupons(criadorId)` | `[{ id, codigo, tipo, percentualBps, valorCentavos, ofertaId, validoAte, limiteUsos, situacao, criadoEm, versao, usos }]` |
| `listarAfiliados(criadorId)` | `[{ id, nome, email, codigo, comissaoBps, situacao, criadoEm, versao, vendas, vendidoCentavos, comissaoCentavos }]` |
| `listarVendas(criadorId, { situacao?, ofertaId?, afiliadoId?, busca? (e-mail), de?, ate?, pagina, porPagina })` | `{ total, linhas: [{ id, situacao, tipo, ofertaId, oferta, email, nome, membroId, afiliadoId, afiliado, cupom, renovacao, valorCentavos, descontoCentavos, taxaCentavos, comissaoCentavos, reembolsadoCentavos, liquidoEstimadoCentavos, criadaEm, pagoEm, versao }] }` |
| `resumoFinanceiro(criadorId, { de?, ate? })` | `{ vendas, brutoCentavos, descontosCentavos, reembolsadoCentavos, taxaPlataformaCentavos, comissoesCentavos, liquidoEstimadoCentavos }` (PAGA + REEMBOLSADA; líquido = bruto − reembolsos − taxa efetiva; taxas do Stripe fora) |
| `listarAssinaturas(criadorId, { situacao?, pagina, porPagina })` | `{ total, linhas: [{ id, situacao, ofertaId, oferta, intervalo, membroId, nome, email, periodoFim, cancelarNoFim, encerradaEm, criadaEm, pagoCentavos }] }` |
| `linkDeCompra(slug, ofertaId, afiliadoCodigo?)` (`checkout.ts`) | link público da oferta (com `afiliado=` = link do afiliado) |
| `src/lib/pagamentos/regras.ts` (puro, tela) | `formatarCentavos`, `calcularTaxa`, `calcularComissao`, `descontoDoCupom`, `TEXTO_CUPOM_INVALIDO`, `normalizarCodigo`, `TAXA_PADRAO_BPS`, `PRECO_MINIMO_CENTAVOS` |

Filtros validados pela tela com `filtrosVendasSchema` / `filtrosAssinaturasSchema`.

### Rotas

- `GET /api/stripe/checkout?oferta=<id>[&afiliado=<código>][&cupom=<código>]` (host do criador,
  `rota-compra.ts`): 303 para o Checkout; 400 com o texto do motivo (cupom, oferta indisponível, vendas
  fechadas), 404 área/oferta inválida, 429 teto (20/IP/10 min), 503 sem chave. Logado nesta área = compra
  dele. Retorno do Stripe: `/?compra=sucesso` e `/?compra=cancelada` na área.
- `POST /api/stripe/webhook` (apex, endpoint **Connect**): `Stripe-Signature` sobre o corpo cru com
  `STRIPE_WEBHOOK_SECRET` (400 inválida, 503 sem segredo), recibo em `stripe_eventos`, criador por
  `event.account`, fila `pagamentos` (500 se a fila falhar: o Stripe reenvia). Eventos: `EVENTOS_TRATADOS`
  em `webhook.ts` (`checkout.session.completed`, `.async_payment_succeeded`, `.async_payment_failed`,
  `.expired`, `charge.refunded`, `invoice.paid`, `customer.subscription.updated`, `.deleted`, `account.updated`).

### Serviços (`src/lib/pagamentos/`)

| Arquivo | Funções |
|---------|---------|
| `stripe.ts` | `GatewayStripe` (interface), `gatewayStripe()` (null sem chave), `usarGatewayStripe` (só testes), `verificarEvento`, `MSG_PAGAMENTOS_DESLIGADOS`; `stripe-falso.ts` = `StripeFalso` (testes) |
| `conta.ts` | `conectarStripe(gateway, { criador, autor })`, `atualizarStatusConta`, `aplicarStatusConta(tx, …)`, `mudarTaxaDoCriador(tx, …)`, `contaDoCriador` |
| `ofertas.ts`, `cupons.ts`, `afiliados.ts` | `criar*`, `salvar*`, `mudarSituacao*`, `excluir*` — todos `(tx, p)` com trava e trilha |
| `checkout.ts` | `criarCheckout(gateway, { criador, ofertaId, afiliadoCodigo, cupomCodigo, comprador })` → `{ vendaId, url }` |
| `vendas.ts` | `confirmarVenda`, `marcarVenda`, `registrarReembolso`, `renovarAssinatura`, `aplicarAssinatura` (worker), `reembolsarVenda(gateway, …)` |
| `acesso.ts` | `concederAcesso` (via `matricular`, origem COMPRA), `encerrarAcesso` (por prefixo da referência) |
| `webhook.ts` + `fila.ts` + `processar.ts` | `receberEventoStripe(corpo, assinatura, enfileirar?)`, fila `pagamentos`/`pagamentos-dlq` (5º Worker de `worker:certificados`, só com chave), `processarEventoStripe(gateway, eventoId, contaId)` |

Testes: `tests/integracao/fase2-pagamentos.test.ts`, `fase2-webhook-stripe.test.ts` (Postgres real,
`StripeFalso`, eventos assinados com `Stripe.webhooks.generateTestHeaderString`) e
`src/lib/pagamentos/regras.test.ts` (taxa, comissão, cupom, parâmetros da Checkout Session).

## Fase 3: campanhas e automações de e-mail (ADR-0020, RN-220 a RN-227) — DONO e ADMIN

Migração `0014_fase3_campanhas_automacoes` (só aditiva: 6 tabelas, índice `ix_emails_disparos_quando`,
CHECK de `emails_disparos.tipo` com `CAMPANHA`/`AUTOMACAO`). Mesma convenção das Fases 1 e 2: `"use
server"`, `executar()` → `Resultado`, criador do HOST, Zod `strictObject` de `src/lib/validators/marketing.ts`
(as telas importam os MESMOS schemas), `versao` = `updated_at` ISO, trilha na transação, ação crítica
(agendar/enviar agora, cancelar, excluir, reenviar acesso) com `ModalConfirmacaoBlock`. Sem e-mail
configurado, agendar, testar e reenviar devolvem "E-mail não configurado nesta plataforma." (`MSG_EMAIL_DESLIGADO`).

**Tipos compartilhados** (`src/lib/db/schema/marketing.ts`):
`ConteudoMarketing = { assunto (1–150), previa (0–150), titulo (1–120), corpo (1–10000; cada linha um
parágrafo; até 20 links https), botao: { texto (1–40), url https } | null }` — TEXTO, nunca HTML.
`PublicoCampanha = { grupoIds[], tagIds[], produtoIds[] (até 50 cada), nuncaAcessou, membros? = true,
leads?: { paginaIds[], funilIds[], tagIds[] } | null }` — E entre critérios, OU dentro; vazio = todos os
ALUNOS ativos; `leads` soma os leads das páginas sem repetir pessoa (ADR-0023, ver "Leads nas campanhas").

| Tabela | Colunas |
|--------|---------|
| `criadores_emails_modelos` | `nome` (2–80, único por criador em `lower`), `conteudo` jsonb |
| `criadores_campanhas` | `nome`, `conteudo`, `publico` jsonb, `situacao` (`SITUACOES_CAMPANHA`: RASCUNHO/AGENDADA/ENVIANDO/CONCLUIDA/CANCELADA), `agendada_para?`, `iniciada_em?`, `concluida_em?`, `cancelada_em?`, `total_destinatarios` |
| `criadores_automacoes` | `nome`, `gatilho` (`GATILHOS_AUTOMACAO`), `produto_id?` (FK composta; só `GATILHOS_COM_CURSO`), `dias?` (1–365; só INATIVIDADE/NUNCA_ACESSOU), `atraso_minutos` (0–43200), `conteudo?`, `tag_id?` (FK composta; ao menos um dos dois), `pagina_id?`/`funil_id?` (FKs compostas; só `LEAD_CAPTURADO`), `situacao` ATIVA/PAUSADA (nasce PAUSADA) |
| `criadores_automacoes_execucoes` | `automacao_id`, `membro_id?` OU `lead_id?` (FKs compostas; exatamente um), `referencia` (única com automação + membro), `situacao` (AGENDADA/CONCLUIDA/IGNORADA/FALHOU), `executar_em`, `executada_em?`, `tag_aplicada`, `envio_id?`, `motivo?` |
| `criadores_emails_envios` | `membro_id?` OU `lead_id?` (FKs compostas; exatamente um; PRIMEIRO_ACESSO só membro), `origem` (CAMPANHA/AUTOMACAO/PRIMEIRO_ACESSO), `campanha_id?`/`automacao_id?` (FKs compostas, coerentes com a origem), `chave` (única por criador), `situacao` (PENDENTE/ENVIADO/FALHOU/IGNORADO), `motivo?`, `tentativas`, `enviado_em?`, `aberto_em?`, `aberturas`, `clicado_em?`, `cliques` |
| `criadores_emails_descadastros` | `destinatario_hash` (HMAC hex, único vivo por criador), `destinatario_mascarado`, `origem` LINK/UM_CLIQUE — nunca o e-mail |

### Actions (`src/lib/actions/campanhas.ts` e `automacoes.ts`)

| Action | Entrada → saída |
|--------|-----------------|
| `acaoCriarModeloEmail` / `acaoSalvarModeloEmail` / `acaoExcluirModeloEmail` | `{ nome, conteudo }` → `{ id, versao }` / `{ modeloId, versao, nome, conteudo }` → `{ versao }` / `{ modeloId, versao }` (nome repetido = "Já existe um modelo com este nome.") |
| `acaoCriarCampanha` | `{ nome, conteudo, publico }` → `{ id, versao }` (RASCUNHO) |
| `acaoSalvarCampanha` | `{ campanhaId, versao, nome, conteudo, publico }` → `{ versao }` (só RASCUNHO/AGENDADA) |
| `acaoContarPublico` | `{ publico }` → `{ total, descadastrados, receberao, membros, leads }` — mostrar ANTES de enviar (`membros`/`leads` = dos que receberão) |
| `acaoEnviarTesteEmail` | `{ conteudo }` → `{ para }` (o e-mail da sessão; "[Teste]" no assunto; 10 a cada 10 min; serve a campanha, automação e modelo) |
| `acaoAgendarCampanha` | `{ campanhaId, versao, quando: ISO ou null }` → `{ versao, quando }` (`null` = enviar agora; até 1 ano) |
| `acaoCancelarCampanha` | `{ campanhaId, versao }` → `{ versao, naoEnviados }` (AGENDADA ou ENVIANDO) |
| `acaoExcluirCampanha` | `{ campanhaId, versao }` (só RASCUNHO) |
| `acaoContarReenvioPrimeiroAcesso` | `{ publico }` (só os campos de membro, `reenvioSchema`) → `{ total, receberao, foraDaRegra }` (regra do link, RN-102) |
| `acaoReenviarPrimeiroAcesso` | `{ publico }` → `{ lote, enfileirados, foraDaRegra, alemDoLimite }` (link NOVO por pessoa, gerado no envio; 3 lotes a cada 10 min por área; até 5000) |
| `acaoCriarAutomacao` | `{ nome, gatilho, produtoId?, dias?, atrasoMinutos? = 0, conteudo?, tagId?, paginaId?, funilId? }` → `{ id, versao }` (PAUSADA; página/funil só em `LEAD_CAPTURADO`) |
| `acaoSalvarAutomacao` | `{ automacaoId, versao, gatilho (o mesmo), nome, produtoId?, dias?, atrasoMinutos?, conteudo?, tagId?, paginaId?, funilId? }` → `{ versao }` |
| `acaoMudarSituacaoAutomacao` | `{ automacaoId, versao, situacao: "ATIVA" ou "PAUSADA" }` → `{ versao }` |
| `acaoExcluirAutomacao` | `{ automacaoId, versao }` (soft delete; o histórico fica) |

### Leituras para as telas

| Função | Devolve |
|--------|---------|
| `listarCampanhas(criadorId, { situacao? })` (`marketing/consultas.ts`) | `[{ id, nome, assunto, situacao, agendadaPara, iniciadaEm, concluidaEm, canceladaEm, destinatarios, criadoEm, versao, total, enviados, falhas, ignorados, pendentes, aberturas, cliques, taxaAbertura, taxaClique }]` (aberturas/cliques = pessoas; taxas em % sobre enviados) |
| `campanhaDoCriador(criadorId, campanhaId)` | o mesmo + `conteudo`, `publico`; ou `null` |
| `destinatariosDaCampanha(criadorId, campanhaId, { situacao?, pagina, porPagina })` | `{ total, linhas: [{ envioId, tipo: "MEMBRO" \| "LEAD", membroId?, leadId?, nome, email, situacao, motivo, enviadoEm, abertoEm, aberturas, clicadoEm, cliques }] }` ou `null` |
| `listarModelos(criadorId)` | `[{ id, nome, conteudo, criadoEm, versao }]` |
| `listarAutomacoes(criadorId)` | `[{ id, nome, gatilho, produtoId, produto, dias, atrasoMinutos, conteudo, tagId, tag, paginaId, pagina, funilId, funil, situacao, criadoEm, versao, execucoes, agendadas, total, enviados, falhas, ignorados, pendentes, aberturas, cliques, taxaAbertura, taxaClique }]` |
| `historicoDaAutomacao(criadorId, automacaoId, { pagina, porPagina })` (aba "Histórico") | `{ total, linhas: [{ id, tipo, membroId?, leadId?, nome, email, referencia, situacao, motivo, executarEm, executadaEm, tagAplicada, envioSituacao, envioMotivo, abertoEm, clicadoEm, criadoEm }] }` ou `null` |
| `listarDescadastros(criadorId, { email?, pagina, porPagina })` (`marketing/descadastro.ts`) | `{ total, linhas: [{ id, destinatario (máscara), origem, quando }] }`; `email` = busca EXATA pelo HMAC |
| `estaDescadastrado(criadorId, email)` | `boolean` (ficha do membro) |
| `contarPublico` (`publico.ts`), `contarReenvio` (`reenvio.ts`) | o que as actions de contagem devolvem |
| `src/lib/marketing/regras.ts` (puro, tela) | `ROTULO_SITUACAO_CAMPANHA`, `ROTULO_SITUACAO_ENVIO`, `ROTULO_SITUACAO_EXECUCAO`, `ROTULO_GATILHO`, `campanhaEditavel`, `campanhaCancelavel`, `segmentosComLinks` (prévia), `paragrafosDoCorpo`, `extrairUrls`, `urlsDoConteudo`, `taxa`, `PUBLICO_TODOS`, `MOTIVOS_ENVIO`, `MSG_EMAIL_DESLIGADO`, `limitesDeEnvio` |

Filtros da tela: `filtrosCampanhasSchema`, `filtrosDestinatariosSchema`. Prévia na tela (pura):
`emailMarketing(marcaDaArea(criador, url), conteudo, nome, { descadastro: <url da área>, linkar: (u) => u })`.

### Rotas públicas (sem sessão, no host da área; `src/lib/marketing/rotas.ts`)

- `GET /api/email/abertura?e=<envio>&s=<assinatura>` → GIF 1×1 sempre (assinatura ruim ou outra área = não conta).
- `GET /api/email/clique?e=<envio>&u=<url>&s=<assinatura>` → 302 para `u` só se HMAC(envio, URL) confere, a URL é https e o envio é da área; senão 404.
- `GET /api/email/descadastro?t=<token>` → 303 para a página `/descadastro?t=` (confirmação com a marca da área; o botão chama a server action `confirmarDescadastro` em `src/app/descadastro/acoes.ts`, que confere o token e o criador pelo host; GET nunca descadastra); `POST` (formulário
  ou `List-Unsubscribe=One-Click`, RFC 8058) → descadastra (idempotente). Token adulterado ou de outra área = 404.

### Serviços (`src/lib/marketing/`)

| Arquivo | Funções |
|---------|---------|
| `provedor.ts` | `ProvedorEmail` (interface `configurado()`, `enviar(email)`), `provedorSmtp` (= `enviarEmail`), `provedorEmail()`, `usarProvedorEmail` (testes / troca de provedor), `esperaParaEnviar(agora?, limites?)` (teto por janela deslizante em `emails_disparos`); `provedor-falso.ts` = `ProvedorFalso` (testes) |
| `fila.ts` | filas `emails` (6º Worker, concorrência 1, `jobId` = envio, `rateLimit` no teto) e `marketing` (7º: `campanha`, `execucao`, `varredura` às 09:00 de Brasília), DLQs `emails-dlq`/`marketing-dlq`, `enfileirarEnviosComPrazo`, `enfileirarMarketingComPrazo` |
| `campanhas.ts` | `criarCampanha`, `salvarCampanha`, `agendarCampanha`, `cancelarCampanha`, `excluirCampanha` (todos `(tx, p)`), `iniciarCampanha(id)` (worker), `concluirCampanhaSeTerminou`, `campanhasAgendadas` |
| `modelos.ts`, `automacoes.ts` | `criarModelo`, `salvarModelo`, `excluirModelo`; `criarAutomacao`, `salvarAutomacao`, `mudarSituacaoAutomacao`, `excluirAutomacao` |
| `publico.ts` | `condicaoDoPublico` (a regra única dos membros), `normalizarPublico`, `conferirPublico`, `pessoasDoPublico`, `destinatariosDoPublico` (membros + leads, dedupe pelo HMAC), `descadastradosEntre`, `contarPublico` |
| `envio.ts` | `processarEnvio(envioId, tentativa, max, { provedor?, espera? })` → `enviado` / `ignorado` / `adiado` (worker), `enviosPendentes`, `linksDoEnvio`, `enviarTeste` |
| `gatilhos.ts` | `dispararAutomacoes(criadorId, gatilho, alvos)` e `automacaoMembrosCadastrados`, `automacaoMatriculas`, `automacaoAulaConcluida`, `automacaoCursoConcluido`, `automacaoCertificadoEmitido` (chamadas DENTRO das funções de `webhooks/emitir.ts`), `automacaoVoucherResgatado` (`actions/vouchers.ts`), `automacaoLeadCapturado` (`paginas/leads.ts`) — depois do commit, nunca lançam; `execucoesAgendadas` |
| `execucoes.ts` | `processarExecucao(execucaoId)` (tag + envio; worker), `varreduraDiaria()` (INATIVIDADE por episódio, NUNCA_ACESSOU uma vez) |
| `reenvio.ts` | `atorDoLink`, `alvosDoLink`, `contarReenvio`, `criarLoteDeReenvio` (regra `motivoParaNaoGerarLink`) |
| `descadastro.ts`, `tokens.ts` | `descadastrar(criadorId, hash, origem)`; `tokenDescadastro`, `lerTokenDescadastro`, `assinaturaAbertura`, `aberturaValida`, `assinaturaClique`, `cliqueValido` (HKDF do `BETTER_AUTH_SECRET`, `timingSafeEqual`) |

Testes: `tests/integracao/fase3-campanhas.test.ts`, `fase3-automacoes.test.ts` (Postgres real + Redis;
`ProvedorFalso`, nunca SMTP) e `src/lib/marketing/regras.test.ts` (conteúdo, escape, validadores, teto).

## Integrações: Hotmart e Eduzz (ADR-0021, RN-230 a RN-236) — só DONO

Migração `0015_integracoes_hotmart_eduzz` (só aditiva: 4 tabelas, `integracoes_recibos` append-only).
Tela `/admin/vendas/integracoes` (aba "Integrações" de Vendas; card "Integrações" do hub). Mesma
convenção das fases anteriores: `executar()` → `Resultado`, criador do HOST, Zod `strictObject` de
`src/lib/validators/integracoes.ts`, `versao` = `updated_at` ISO, trilha na transação (sem o token).

| Tabela | Colunas |
|--------|---------|
| `criadores_integracoes` | `plataforma` HOTMART/EDUZZ (uma viva por criador), `segredo_cifrado` (`v1:` AES-256-GCM, AAD `integracao:<id>`), `segredo_final` (4) |
| `criadores_integracoes_produtos` | `integracao_id` (FK composta), `produto_externo` (`^[A-Za-z0-9_-]{1,64}$`), `nome_externo?`, `produto_id` (FK composta), `dias_acesso?` (1–3650; nulo = vitalício); um vivo por (integração, externo, curso) |
| `integracoes_recibos` (**append-only**) | `integracao_id`, `plataforma`, `evento_id?` (único por integração), `evento` (nome original), `tipo` (`TIPOS_EVENTO_INTEGRACAO`), `transacao?`, `assinatura?`, `produto_externo?`, `recusa?` (TOKEN_INVALIDO/FORMATO_INVALIDO), `ocorrido_em?`, `created_at` — sem payload nem dado pessoal |
| `criadores_integracoes_eventos` | `recibo_id` (único), `situacao` (`SITUACOES_EVENTO_INTEGRACAO`), `erro?` (nota ≤ 300), `comprador_email?`/`comprador_nome?` (só até PROCESSADO/IGNORADO), `proxima_cobranca?`, `membro_id?`, `matriculas` jsonb, `processado_em?` |

| Action (`src/lib/actions/integracoes.ts`) | Entrada → saída |
|-------------------------------------------|-----------------|
| `acaoConectarIntegracao` | `{ plataforma, segredo }` → `{ id, url, versao }` (2ª da mesma plataforma = "A Hotmart já está conectada nesta área.") |
| `acaoTrocarSegredoIntegracao` | `{ integracaoId, versao, segredo }` → `{ versao }` |
| `acaoDesconectarIntegracao` | `{ integracaoId, versao }` → `{ mapeamentos }` (ModalConfirmacaoBlock; URL vira 404) |
| `acaoCriarMapeamento` | `{ integracaoId, produtoExterno, nomeExterno?, produtoIds[1..20], diasAcesso: number \| null }` → `{ criados }` |
| `acaoExcluirMapeamento` | `{ mapeamentoId, versao }` (ModalConfirmacaoBlock) |
| `acaoReprocessarEventoIntegracao` | `{ eventoId, versao }` → `{ versao, naFila }` (só SEM_MAPEAMENTO/ERRO) |

| Leitura (`src/lib/integracoes/consultas.ts`) | Devolve |
|----------------------------------------------|---------|
| `integracoesDoCriador(criadorId)` | `[{ id, plataforma, segredoFinal, criadoEm, versao }]` (nunca a cifra) |
| `mapeamentosDoCriador(criadorId)` | `[{ id, integracaoId, plataforma, produtoExterno, nomeExterno, produtoId, produto, diasAcesso, versao }]` |
| `eventosRecentes(criadorId, limite = 50)` | `[{ reciboId, eventoId, plataforma, evento, tipo, transacao, assinatura, produtoExterno, recusa, recebidoEm, situacao (+ RECUSADO), nota, pessoa (e-mail mascarado ou nome do aluno), versao }]` |

### Rota

- `POST /api/integracoes/hotmart/<id>` e `POST /api/integracoes/eduzz/<id>` (apex; `id` = conexão).
  Hotmart: `X-HOTMART-HOTTOK` = hottok. Eduzz: `x-signature` = HMAC-SHA256(chave, corpo cru), hex ou base64.
  Respostas: 200 recebido (também reentrega e evento não tratado), 401 token inválido (recibo RECUSADO,
  teto 20/10 min por conexão), 400 formato, 404 conexão inexistente/desconectada ou plataforma errada,
  413 corpo > 64 KB, 500 fila fora do ar (a plataforma reenvia).

### Serviços (`src/lib/integracoes/`)

| Arquivo | Funções |
|---------|---------|
| `regras.ts` (puro, tela) | `normalizarHotmart`, `normalizarEduzz`, `normalizar`, `chaveDoAcesso` (`hotmart:<transação>` / `hotmart-assinatura:<código>`), `referenciaDoAcesso`, `acessoAte` (próxima cobrança + 3 dias, senão dias do mapeamento, senão vitalício), `urlDoWebhook`, rótulos, `REPROCESSAVEIS`, `TETO_RECUSAS_POR_CONEXAO`, `TAMANHO_MAXIMO_CORPO` |
| `autenticidade.ts` | `iguaisEmTempoConstante`, `hottokConfere`, `assinaturaEduzzConfere` |
| `servico.ts` | `conectarIntegracao`, `trocarSegredoIntegracao`, `desconectarIntegracao`, `criarMapeamento`, `excluirMapeamento`, `reprocessarEvento` — todos `(tx, p)` |
| `receber.ts` | `receberEventoIntegracao({ segmento, integracaoId, corpo, cabecalhos }, enfileirar?)` |
| `fila.ts` | fila `integracoes`/`integracoes-dlq` (8º Worker de `worker:certificados`), `enfileirarComPrazo` |
| `processar.ts` | `processarEventoIntegracao(eventoId, tentativa, max)` → situação, `eventosPendentes()` (reenfileirados ao subir o worker) |

Testes: `tests/integracao/integracoes-hotmart-eduzz.test.ts` (Postgres real, fila injetada) e
`tests/integracoes/regras.test.ts` (fora de `src/`: a imagem Docker não leva `tests/`, e o build checa os tipos de todo `src/`), com os payloads de exemplo anonimizados de `tests/integracoes/exemplos.ts`.

## Páginas e funis (ADR-0022, RN-240 a RN-247) — DONO e ADMIN

Migração `0016_paginas_funis_leads` (só aditiva: 5 tabelas). Mesma convenção das Fases 1 a 3: `"use
server"`, `executar()` → `Resultado`, criador do HOST, Zod `strictObject` de `src/lib/validators/paginas.ts`
(as telas importam os MESMOS schemas), `versao` = `updated_at` ISO, trilha na transação, ação crítica
(publicar, tirar do ar, excluir, remover bloco) com `ModalConfirmacaoBlock`. A configuração da página é
`ConfigPagina` (`src/lib/paginas/config.ts`, PURO): `{ tema: ESCURO|CLARO, seo: { titulo ≤70, descricao ≤160,
imagemArquivoId?, noindex }, blocos[≤30] }`; bloco = `{ id, visivel, tipo, ...campos do tipo }` com
`TIPOS_BLOCO` = CAPA (título, subtítulo, mídia NENHUMA/IMAGEM/VIDEO YouTube|Vimeo por id, botão?), BENEFICIOS,
MODULOS (`produtoId`, `mostrarAulas`), AUTOR (foto?), DEPOIMENTOS, PRECO (`ofertaId`, itens, texto do botão),
GARANTIA (`dias`), FAQ, CHAMADA (botão), FORMULARIO (consentimento 10–400, `tagId?`, mensagem de sucesso; um
por página). Botão = `{ texto, acao: PRECO|FORMULARIO|LINK, url (só LINK, https) }`. Tudo TEXTO.

| Tabela | Colunas |
|--------|---------|
| `criadores_paginas` | `slug` (`^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])$`, único vivo por criador), `titulo` (2–80, interno), `modelo` VENDA/CAPTURA, `situacao` RASCUNHO/PUBLICADA, `rascunho` jsonb, `publicada` jsonb?, `publicada_em?`, `publicacoes` (nº da versão) |
| `criadores_funis` | `nome` (2–80), `etapas` jsonb `[{ paginaId, nome }]` (1–10, páginas do criador, sem repetir) |
| `criadores_paginas_visitas` | `pagina_id`, `funil_id?` (FKs compostas), `dia` (Brasília), `visitas` — `UNIQUE NULLS NOT DISTINCT (pagina, funil, dia)` |
| `criadores_paginas_checkouts` | `pagina_id`, `funil_id?` (FKs compostas), `venda_id` (único, FK `criadores_vendas`) |
| `criadores_leads` | `nome`, `email` (minúsculo, único vivo por criador), `pagina_id`, `funil_id?`, `tag_id?` (FKs compostas), `utm` jsonb (source/medium/campaign/term/content), `consentimento_texto`, `consentimento_em`, `capturas`, `ultima_captura_em` |

### Actions (`src/lib/actions/paginas.ts`; público: `src/app/p/[slug]/acoes.ts`)

| Action | Entrada → saída |
|--------|-----------------|
| `acaoCriarPagina` | `{ modelo, titulo, slug }` → `{ id, versao }` (rascunho do modelo; 1º curso e 1ª oferta ATIVA já ligados) |
| `acaoSalvarRascunhoPagina` | `{ paginaId, versao, titulo, slug, config }` → `{ versao }` (autosave; o endereço novo vale na hora) |
| `acaoPublicarPagina` | `{ paginaId, versao }` → `{ versao, numero, publicadaEm }` (recusa com `pendenciasParaPublicar`) |
| `acaoDespublicarPagina` / `acaoExcluirPagina` | `{ paginaId, versao }` → `{ versao }` / `null` (excluir recusa se a página é etapa de funil vivo) |
| `acaoPrepararImagemPagina` | `{ arquivoId }` → `{ url }` (imagem IMAGEM desta área, recém-enviada por `acaoIniciarEnvio`/`acaoConfirmarEnvio`) |
| `acaoCriarFunil` / `acaoSalvarFunil` / `acaoExcluirFunil` | `{ nome, etapas }` → `{ id, versao }` / `{ funilId, versao, nome, etapas }` → `{ versao }` / `{ funilId, versao }` |
| `enviarCaptura(estado, FormData)` (público, `useActionState`) | campos `slug`, `pagina`, `nome`, `email`, `consentimento=sim`, `site` (honeypot), `funil?`, `cupom?`, `afiliado?`, `utm_*` → `{ ok: true, proxima: "/p/<próxima>?funil=…" \| null }` ou `{ ok: false, erro }` |

### Leituras (`src/lib/paginas/consultas.ts` e `publico.ts`)

| Função | Devolve |
|--------|---------|
| `listarPaginas(criadorId)` | `[{ id, titulo, slug, modelo, situacao, publicacoes, publicadaEm, atualizadaEm, alterada, visitas (30 dias), leads, versao }]` |
| `paginaParaEditar(criadorId, id)` / `opcoesDoEditor(criadorId)` | página com `rascunho`, `publicada`, `imagens` (id → URL) / `{ cursos, ofertas, tags }` |
| `listarLeads(criadorId, { paginaId?, funilId?, busca?, pagina })` | `{ total, linhas: [{ id, nome, email, pagina, funil, tag, utm, consentimentoTexto, consentimentoEm, capturas, criadoEm, ultimaCapturaEm, descadastrado }] }` (50 por página) |
| `listarFunis(criadorId)` | `[{ id, nome, etapas, versao, criadoEm, visitas, leads, vendas }]` (30 dias) |
| `metricasDoFunil(criadorId, funilId, dias)` | `{ id, nome, versao, etapasBrutas, etapas: [{ paginaId, nome, titulo, slug, publicada, visitas, leads, cliques, vendas, receitaCentavos, daAnterior, taxaLead, taxaClique, taxaVenda }] }` ou `null` |
| `paginaPublicada(criadorId, slug)` / `paginaEmRascunho(criadorId, id)` | `{ id, slug, titulo, config }` ou `null` |
| `dadosParaRender(criadorId, config)` | `DadosRender` (`render-tipos.ts`): imagens assinadas, módulos PUBLICADOS do curso com títulos das aulas, ofertas ATIVAS |
| `src/lib/paginas/metricas.ts` (puro) | `conversoes`, `conversaoTotal`, `percentual`, `textoPercentual` |
| `src/lib/paginas/visita.ts` (puro) | `lerParametros` (funil, cupom, afiliado, UTM validados), `consultaDaVisita` |

Render: `BlocosDaPagina` (`src/components/paginas/blocos.tsx`, server, sem `dangerouslySetInnerHTML`),
`MolduraPagina` (tema + `EstiloMarca`), `FormularioCaptura` e `RegistrarVisita` (client).

### Rotas

- `/p/<slug>` (pública, host da área; `p` em `PUBLICAS` do proxy): só a PUBLICADA; `?funil=&cupom=&afiliado=&utm_*`
  validados e repassados; `generateMetadata` com título, descrição, canônica, Open Graph e `noindex` opcional.
- `GET /p/<slug>/imagem` (`src/app/p/[slug]/imagem/route.ts`, rota `/p/[slug]/imagem`) → 302 para a URL assinada da imagem de compartilhamento (link estável do `og:image`); 404 sem imagem.
- `POST /api/paginas/visita` (`rota-visita.ts`) corpo `{ p: paginaId, f: funilId \| null }` → sempre 204; conta só
  página PUBLICADA do host (funil inválido conta fora de funil); teto 60/IP/10 min; sem cookie, sem IP gravado.
- `/previa-pagina/<id>` (equipe): o RASCUNHO com os mesmos blocos, no iframe do editor (preço e formulário inertes).
- Link de compra da Fase 2 aceita `pagina=` e `funil=` (`registrarCheckoutDaPagina`, nunca lança): só atribuição.

Testes: `tests/integracao/paginas.test.ts`, `paginas-leads-funis.test.ts` (Postgres real, `StripeFalso`) e
`src/lib/paginas/config.test.ts`, `src/components/paginas/blocos.test.tsx` (schema, vídeo, escape, links).

## Leads nas campanhas (ADR-0023, RN-250 a RN-254) — DONO e ADMIN

Migração `0017_leads_nas_campanhas` (só aditiva/compatível): `lead_id?` em `criadores_emails_envios` e
`criadores_automacoes_execucoes` (FK composta `fk_..._lead` → `criadores_leads(id, criador_id)`, unique novo
`uq_criadores_leads_id_criador`), `membro_id` anulável + CHECK `ck_..._destinatario` (exatamente um; envio
`PRIMEIRO_ACESSO` só de membro), índice único parcial `uq_criadores_automacoes_execucoes_ref_lead`
`(automacao_id, lead_id, referencia)`, `pagina_id?`/`funil_id?` em `criadores_automacoes` (FKs compostas,
CHECK `ck_criadores_automacoes_origem_lead`) e o gatilho `LEAD_CAPTURADO` no CHECK de `gatilho`.

- **Público** (`publico.ts`): `destinatariosDoPublico(criadorId, publico)` → `Destinatario[]` (`{ tipo: "MEMBRO",
  membroId } | { tipo: "LEAD", leadId }` + `nome`, `email`, `hash`). Ordem: membros do segmento → leads do
  segmento que já são ALUNO ativo (como MEMBRO) → leads sem vínculo vivo na área; dedupe pelo HMAC.
  `iniciarCampanha` cria `campanha:<id>:<membro>` ou `campanha:<id>:lead:<lead>`.
- **Envio** (`envio.ts`): destinatário pelo `LEFT JOIN` em membro e lead; lead removido = IGNORADO
  (`MOTIVOS_ENVIO.LEAD` "Lead removido."). Abertura, clique e descadastro iguais (por envio e por HMAC);
  `descadastrar` acha a máscara também no lead.
- **Automação** (`gatilhos.ts`): `automacaoLeadCapturado(criadorId, leadId, paginaId, funilId)`, chamada no
  fim de `capturarLead` (depois do commit, nunca lança); filtro = página/funil DESTA captura; referência
  `captura` (`REFERENCIA_CAPTURA`). `processarExecucao` aplica a tag em `criadores_leads.tag_id` (trilha
  com a anterior) e cria o envio com `lead_id`.
- **Telas**: Campanhas › "Quem recebe" com as seções Alunos e Leads das páginas (`SeletorPublico`; opções
  `paginas` e `funis` em `dadosDoEditor`); `/admin/campanhas/nova?leads=1&pagina=<id>` abre com só leads;
  destinatários com a coluna Tipo; Automações com o gatilho "Alguém se cadastra numa página (lead)" e os
  campos Página/Funil; Leads com "Exportar CSV" e "Criar campanha para estes leads".

### Exportação CSV

- `GET /admin/paginas/leads/exportar?pagina=&q=` (`src/app/admin/paginas/leads/exportar/route.ts` →
  `atenderExportacaoLeads` em `src/lib/paginas/exportar-leads.ts`): sessão PLENA + DONO/ADMIN do banco
  (401/403; filtro inválido = 400). Mesma regra de `listarLeads` (agora com `porPagina?`), até
  `LIMITE_EXPORTACAO_LEADS` (50 mil). `csvLeads(linhas)`: colunas `nome;email;pagina_origem;funil;tag;
  utm_source;utm_medium;utm_campaign;utm_term;utm_content;consentimento;consentimento_em;capturas;
  primeira_captura_em;ultima_captura_em;descadastrado`, pelo `gerarCsv` (BOM, `;`, CRLF, `'` antes de
  `= + - @`). Trilha `acao = "exportar"` ANTES da resposta, com quantos e o filtro (busca só como
  `com_busca`), nunca os e-mails. `Cache-Control: no-store`.

Testes: `tests/integracao/leads-campanhas.test.ts` (Postgres real + Redis, `ProvedorFalso`) e
`src/app/admin/automacoes/_components/campos.test.ts` (textos e formulário do gatilho de lead).
