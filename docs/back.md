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
pg_dump "$DATABASE_URL" --no-owner --no-acl --clean --if-exists \
  --file="backup_$(date +%d_%m_%Y_%H_%M).sql"
```

Backup fica FORA do servidor do banco e o restore e testado em HML. O pipeline de
deploy ja faz o dump e a copia off-server antes do PRD.

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
