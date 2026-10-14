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
export const FINALIDADES_ARQUIVO_CATALOGO = ["IMAGEM", "MATERIAL", "LEGENDA"] as const;
/** Anexos de publicação da comunidade (passo 8, RN-131): qualquer membro envia, só ao próprio post. */
export const FINALIDADES_ARQUIVO_COMUNIDADE = ["COMUNIDADE_IMAGEM", "COMUNIDADE_PDF"] as const;
export const FINALIDADES_ARQUIVO = [...FINALIDADES_ARQUIVO_CATALOGO, ...FINALIDADES_ARQUIVO_COMUNIDADE] as const;
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

/**
 * Arquivos que o SISTEMA grava (não vêm de envio do navegador): a coluna `arquivos.finalidade`
 * aceita as de envio + estas. CERTIFICADO = PDF gerado pelo worker (passo 7, ADR-0008).
 * `FinalidadeArquivo` continua sendo só a de envio (allowlist das telas).
 */
export const FINALIDADES_ARQUIVO_GRAVADAS = [...FINALIDADES_ARQUIVO, "CERTIFICADO"] as const;
export type FinalidadeArquivoGravada = (typeof FINALIDADES_ARQUIVO_GRAVADAS)[number];

/** Avaliação (passo 7). FORMULARIO (SISTEMA.md §4) fica de fora: YAGNI (RN-123). */
export const TIPOS_AVALIACAO = ["QUIZ", "PROVA", "SIMULADO"] as const;
export type TipoAvaliacao = (typeof TIPOS_AVALIACAO)[number];

export const STATUS_AVALIACAO = ["RASCUNHO", "PUBLICADA"] as const;
export type StatusAvaliacao = (typeof STATUS_AVALIACAO)[number];

/** UNICA = uma correta; MULTIPLA = várias corretas (pontua só o conjunto exato); VERDADEIRO_FALSO. */
export const TIPOS_QUESTAO = ["UNICA", "MULTIPLA", "VERDADEIRO_FALSO"] as const;
export type TipoQuestao = (typeof TIPOS_QUESTAO)[number];

/** Quem fechou a tentativa: o aluno ("Finalizar") ou o prazo (tempo limite, conferido no servidor). */
export const FINALIZACOES_TENTATIVA = ["ALUNO", "TEMPO"] as const;
export type FinalizacaoTentativa = (typeof FINALIZACOES_TENTATIVA)[number];

export const SITUACOES_CERTIFICADO = ["EMITIDO", "REVOGADO"] as const;
export type SituacaoCertificado = (typeof SITUACOES_CERTIFICADO)[number];

/** Versão do PDF do certificado: PENDENTE = na fila; PRONTA = no storage; FALHOU = esgotou as tentativas. */
export const SITUACOES_VERSAO_CERTIFICADO = ["PENDENTE", "PRONTA", "FALHOU"] as const;
export type SituacaoVersaoCertificado = (typeof SITUACOES_VERSAO_CERTIFICADO)[number];

export const STATUS_TRILHA = ["RASCUNHO", "PUBLICADA"] as const;
export type StatusTrilha = (typeof STATUS_TRILHA)[number];

/** Item da trilha. Aula avulsa fica de fora: YAGNI (RN-126). */
export const TIPOS_ITEM_TRILHA = ["PRODUTO", "AVALIACAO"] as const;
export type TipoItemTrilha = (typeof TIPOS_ITEM_TRILHA)[number];

/** Comunidade (passo 8, RN-130): quem VÊ o canal. GRUPO/PRODUTO apontam o grupo ou o produto. */
export const ACESSOS_CANAL = ["TODOS", "GRUPO", "PRODUTO", "EQUIPE"] as const;
export type AcessoCanal = (typeof ACESSOS_CANAL)[number];

/** Quem PUBLICA no canal (comentar segue quem vê). EQUIPE = canal de avisos. */
export const QUEM_POSTA_CANAL = ["TODOS", "EQUIPE"] as const;
export type QuemPostaCanal = (typeof QUEM_POSTA_CANAL)[number];

export const SITUACOES_DENUNCIA = ["ABERTA", "RESOLVIDA", "DESCARTADA"] as const;
export type SituacaoDenuncia = (typeof SITUACOES_DENUNCIA)[number];

/** Notificação in-app (passo 8, RN-134). Texto e link saem de src/lib/notificacoes/regras.ts. */
export const TIPOS_NOTIFICACAO = [
  "COMENTARIO_NO_POST",
  "RESPOSTA_AO_COMENTARIO",
  "CURTIDAS_NO_POST",
  "POST_FIXADO",
  "AVISO",
  "AULA_NOVA",
  "CERTIFICADO_EMITIDO",
  "MATRICULA_NOVA",
  "DENUNCIA_NOVA",
  // Eventos ao vivo (ADR-0011, RN-143): publicado (público), lembrete 1 h antes (inscritos), cancelado (inscritos).
  "EVENTO_PUBLICADO",
  "EVENTO_LEMBRETE",
  "EVENTO_CANCELADO",
] as const;
export type TipoNotificacao = (typeof TIPOS_NOTIFICACAO)[number];

/** Eventos ao vivo (ADR-0011, RN-142). CANCELADO continua visível ("cancelado"), sem link. */
export const SITUACOES_EVENTO = ["RASCUNHO", "PUBLICADO", "CANCELADO"] as const;
export type SituacaoEvento = (typeof SITUACOES_EVENTO)[number];

/**
 * Quem vê o evento/desafio: TODOS os membros; PRODUTO = matrícula valendo no curso (`produto_id`);
 * GRUPOS = está em ao menos um grupo da tabela de junção. Desafio não tem PRODUTO.
 */
export const PUBLICOS_EVENTO = ["TODOS", "PRODUTO", "GRUPOS"] as const;
export type PublicoEvento = (typeof PUBLICOS_EVENTO)[number];
export const PUBLICOS_DESAFIO = ["TODOS", "GRUPOS"] as const;
export type PublicoDesafio = (typeof PUBLICOS_DESAFIO)[number];

/** Gamificação (ADR-0012, RN-144 a RN-147). ENCERRADO = a equipe encerrou antes do fim. */
export const SITUACOES_DESAFIO = ["RASCUNHO", "PUBLICADO", "ENCERRADO"] as const;
export type SituacaoDesafio = (typeof SITUACOES_DESAFIO)[number];

/** Meta do desafio: AULAS_CONCLUIDAS e PUBLICACOES_COMUNIDADE com quantidade; CURSO_CONCLUIDO com produto; AVALIACAO_APROVADA com avaliação. */
export const METAS_DESAFIO = ["AULAS_CONCLUIDAS", "CURSO_CONCLUIDO", "AVALIACAO_APROVADA", "PUBLICACOES_COMUNIDADE"] as const;
export type MetaDesafio = (typeof METAS_DESAFIO)[number];

/** Motivo de um lançamento no razão de pontos. Só AJUSTE_MANUAL pode ser negativo. */
export const MOTIVOS_PONTOS = ["AULA_CONCLUIDA", "CURSO_CONCLUIDO", "AVALIACAO_APROVADA", "PUBLICACAO_COMUNIDADE", "DESAFIO_CONCLUIDO", "AJUSTE_MANUAL"] as const;
export type MotivoPontos = (typeof MOTIVOS_PONTOS)[number];
