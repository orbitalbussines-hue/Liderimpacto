/**
 * Enums do banco: `text` + CHECK, com a lista aqui. Nunca `pgEnum` —
 * acrescentar valor em pgEnum exige migracao que nao roda dentro de transacao.
 */

/** Papel na PLATAFORMA (ADR-0002). O default da coluna e o menor: NENHUM. */
export const PAPEIS_PLATAFORMA = ["NENHUM", "SUPER_ADMIN"] as const;
export type PapelPlataforma = (typeof PAPEIS_PLATAFORMA)[number];

/** Papel DENTRO de um criador, do maior para o menor privilegio (a ordem e a hierarquia). */
export const PAPEIS_CRIADOR = ["DONO", "ADMIN", "ALUNO"] as const;
export type PapelCriador = (typeof PAPEIS_CRIADOR)[number];

export const STATUS_CRIADOR = ["ATIVO", "SUSPENSO"] as const;
export type StatusCriador = (typeof STATUS_CRIADOR)[number];

export const STATUS_MEMBRO = ["ATIVO", "INATIVO"] as const;
export type StatusMembro = (typeof STATUS_MEMBRO)[number];

/** Turma (cohort) ou grupo de acesso (libera conteudo/canal). */
export const TIPOS_GRUPO = ["TURMA", "ACESSO"] as const;
export type TipoGrupo = (typeof TIPOS_GRUPO)[number];

/** Monta o CHECK de uma coluna enum a partir da lista (sem repetir os valores). */
export const listaSql = (valores: readonly string[]) =>
  valores.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ");

/** Catalogo (SISTEMA.md §4): Produto > Modulo > Aula > Material. */
export const TIPOS_PRODUTO = ["CURSO", "MENTORIA", "EVENTO"] as const;
export type TipoProduto = (typeof TIPOS_PRODUTO)[number];

/** NAO_LISTADO = publicado, mas fora da vitrine (so quem tem o link/matricula). */
export const STATUS_PRODUTO = ["RASCUNHO", "PUBLICADO", "NAO_LISTADO"] as const;
export type StatusProduto = (typeof STATUS_PRODUTO)[number];

/** Modulo em RASCUNHO nao aparece para o aluno (nem conta para publicar o produto). */
export const STATUS_MODULO = ["PUBLICADO", "RASCUNHO"] as const;
export type StatusModulo = (typeof STATUS_MODULO)[number];

export const TIPOS_MATERIAL = ["PDF", "DOC", "LINK"] as const;
export type TipoMaterial = (typeof TIPOS_MATERIAL)[number];

/**
 * Para que serve o arquivo: define a allowlist (MIME, extensao, tamanho) e onde pode ser usado
 * (src/lib/armazenamento/regras.ts). Video NAO entra aqui (pipeline proprio, passo 3b).
 */
export const FINALIDADES_ARQUIVO = ["IMAGEM", "MATERIAL"] as const;
export type FinalidadeArquivo = (typeof FINALIDADES_ARQUIVO)[number];

/** ENVIADO_PENDENTE = URL de envio emitida; DISPONIVEL = HEAD no storage conferiu tamanho e tipo. */
export const STATUS_ARQUIVO = ["ENVIADO_PENDENTE", "DISPONIVEL"] as const;
export type StatusArquivo = (typeof STATUS_ARQUIVO)[number];

/**
 * Video da aula (pipeline HLS, docs/ARQUITETURA_VPS.md): ENVIANDO = multipart aberto, o
 * navegador sobe as partes; PROCESSANDO = na fila ou no worker; PRONTO = HLS no storage;
 * FALHOU = esgotou as tentativas (o erro legivel fica no registro).
 */
export const SITUACOES_VIDEO = ["ENVIANDO", "PROCESSANDO", "PRONTO", "FALHOU"] as const;
export type SituacaoVideo = (typeof SITUACOES_VIDEO)[number];

/** Uma tentativa do worker. */
export const SITUACOES_PROCESSAMENTO = ["PROCESSANDO", "PRONTO", "FALHOU"] as const;
export type SituacaoProcessamento = (typeof SITUACOES_PROCESSAMENTO)[number];

/**
 * Matricula (SISTEMA.md §4 Enrollment): como entrou e em que situacao esta. EXPIRADA nao e
 * status gravado: e ATIVA com `expira_em` no passado (src/lib/matriculas/regras.ts).
 * COMPRA fica para o webhook do gateway (ainda nao escolhido).
 */
export const ORIGENS_MATRICULA = ["MANUAL", "IMPORTACAO", "COMPRA"] as const;
export type OrigemMatricula = (typeof ORIGENS_MATRICULA)[number];

export const STATUS_MATRICULA = ["ATIVA", "PENDENTE", "CANCELADA"] as const;
export type StatusMatricula = (typeof STATUS_MATRICULA)[number];

/** Como a aula foi concluida (passo 5): ASSISTIU = cruzou 90% assistido de verdade; MANUAL = botao "Concluir e avancar". */
export const CONCLUSOES_AULA = ["ASSISTIU", "MANUAL"] as const;
export type ConclusaoAula = (typeof CONCLUSOES_AULA)[number];
