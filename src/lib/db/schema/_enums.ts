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
 * COMPRA = pagamento confirmado no webhook do Stripe (ADR-0019). VOUCHER = resgate de codigo (RN-201).
 */
export const ORIGENS_MATRICULA = ["MANUAL", "IMPORTACAO", "COMPRA", "VOUCHER"] as const;
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

/**
 * Base de conhecimento do assistente (ADR-0014, RN-190): de onde veio o documento. As três
 * primeiras são DERIVADAS do catálogo (reindexadas quando a fonte muda); TEXTO é escrito pela equipe.
 */
export const FONTES_CONHECIMENTO = ["AULA_TRANSCRICAO", "AULA_DESCRICAO", "PRODUTO_DESCRICAO", "TEXTO"] as const;
export type FonteConhecimento = (typeof FONTES_CONHECIMENTO)[number];

/** Quem escreveu a mensagem da conversa com o assistente (ADR-0014). */
export const PAPEIS_MENSAGEM_ASSISTENTE = ["USUARIO", "ASSISTENTE"] as const;
export type PapelMensagemAssistente = (typeof PAPEIS_MENSAGEM_ASSISTENTE)[number];

/** Vouchers (ADR-0018, RN-201): ENCERRADO não volta; PAUSADO volta a ATIVO. */
export const SITUACOES_VOUCHER = ["ATIVO", "PAUSADO", "ENCERRADO"] as const;
export type SituacaoVoucher = (typeof SITUACOES_VOUCHER)[number];

/** E-mails que o sistema envia (registro em `emails_disparos`, ADR-0018 item 4). */
export const TIPOS_EMAIL = ["DEFINIR_SENHA", "PRIMEIRO_ACESSO", "AVISO_SEGURANCA", "CAMPANHA", "AUTOMACAO"] as const;
export type TipoEmail = (typeof TIPOS_EMAIL)[number];

export const SITUACOES_EMAIL = ["ENVIADO", "FALHOU", "NAO_CONFIGURADO"] as const;
export type SituacaoEmail = (typeof SITUACOES_EMAIL)[number];

/** Eventos que saem pelos webhooks do criador (ADR-0018 item 5, RN-204). */
export const EVENTOS_WEBHOOK = [
  "MATRICULA_CRIADA",
  "MATRICULA_CANCELADA",
  "AULA_CONCLUIDA",
  "CURSO_CONCLUIDO",
  "CERTIFICADO_EMITIDO",
  "AVALIACAO_APROVADA",
  "MEMBRO_CADASTRADO",
] as const;
export type EventoWebhook = (typeof EVENTOS_WEBHOOK)[number];

export const SITUACOES_WEBHOOK = ["ATIVO", "PAUSADO"] as const;
export type SituacaoWebhook = (typeof SITUACOES_WEBHOOK)[number];

/** Entrega: PENDENTE = na fila (ou aguardando nova tentativa); FALHOU = esgotou as tentativas (DLQ). */
export const SITUACOES_ENTREGA_WEBHOOK = ["PENDENTE", "ENTREGUE", "FALHOU"] as const;
export type SituacaoEntregaWebhook = (typeof SITUACOES_ENTREGA_WEBHOOK)[number];

/** Pagamentos por Stripe Connect (ADR-0019, RN-210 a RN-217). */
export const TIPOS_OFERTA = ["AVULSO", "ASSINATURA"] as const;
export type TipoOferta = (typeof TIPOS_OFERTA)[number];

export const INTERVALOS_ASSINATURA = ["MES", "ANO"] as const;
export type IntervaloAssinatura = (typeof INTERVALOS_ASSINATURA)[number];

/** Oferta, cupom e afiliado: PAUSADO volta a ATIVO (excluir = soft delete). */
export const SITUACOES_OFERTA = ["ATIVA", "PAUSADA"] as const;
export type SituacaoOferta = (typeof SITUACOES_OFERTA)[number];
export const SITUACOES_CUPOM = ["ATIVO", "PAUSADO"] as const;
export type SituacaoCupom = (typeof SITUACOES_CUPOM)[number];
export const SITUACOES_AFILIADO = ["ATIVO", "PAUSADO"] as const;
export type SituacaoAfiliado = (typeof SITUACOES_AFILIADO)[number];

export const TIPOS_CUPOM = ["PERCENTUAL", "VALOR"] as const;
export type TipoCupom = (typeof TIPOS_CUPOM)[number];

/**
 * Venda: PENDENTE = Checkout aberto; AGUARDANDO_PAGAMENTO = Pix/boleto emitido; PAGA libera o acesso;
 * REEMBOLSADA = reembolso TOTAL (parcial continua PAGA com o valor reembolsado).
 */
export const SITUACOES_VENDA = ["PENDENTE", "AGUARDANDO_PAGAMENTO", "PAGA", "FALHOU", "EXPIRADA", "REEMBOLSADA"] as const;
export type SituacaoVenda = (typeof SITUACOES_VENDA)[number];

/** Espelho do `status` da assinatura no Stripe (src/lib/pagamentos/regras.ts `situacaoDaAssinatura`). */
export const SITUACOES_ASSINATURA = ["ATIVA", "ATRASADA", "PAUSADA", "INCOMPLETA", "CANCELADA"] as const;
export type SituacaoAssinatura = (typeof SITUACOES_ASSINATURA)[number];

/** Fase 3 — campanhas e automações de e-mail (ADR-0020, RN-220 a RN-227). */
export const SITUACOES_CAMPANHA = ["RASCUNHO", "AGENDADA", "ENVIANDO", "CONCLUIDA", "CANCELADA"] as const;
export type SituacaoCampanha = (typeof SITUACOES_CAMPANHA)[number];

/** INATIVIDADE e NUNCA_ACESSOU vêm da varredura diária (com `dias`); os outros, dos ganchos depois do commit. */
export const GATILHOS_AUTOMACAO = [
  "MEMBRO_CADASTRADO",
  "MATRICULA_CRIADA",
  "AULA_CONCLUIDA",
  "CURSO_CONCLUIDO",
  "CERTIFICADO_EMITIDO",
  "VOUCHER_RESGATADO",
  "INATIVIDADE",
  "NUNCA_ACESSOU",
  "LEAD_CAPTURADO",
] as const;
export type GatilhoAutomacao = (typeof GATILHOS_AUTOMACAO)[number];
/** Gatilhos que aceitam o filtro "só deste curso". */
export const GATILHOS_COM_CURSO = ["MATRICULA_CRIADA", "AULA_CONCLUIDA", "CURSO_CONCLUIDO", "CERTIFICADO_EMITIDO"] as const;
/** Gatilho de LEAD (captura numa página, ADR-0023): filtro opcional por página/funil; o alvo é o lead, não o membro. */
export const GATILHO_LEAD = "LEAD_CAPTURADO" as const;
/** Gatilhos da varredura diária: exigem `dias`. */
export const GATILHOS_COM_DIAS = ["INATIVIDADE", "NUNCA_ACESSOU"] as const;

export const SITUACOES_AUTOMACAO = ["ATIVA", "PAUSADA"] as const;
export type SituacaoAutomacao = (typeof SITUACOES_AUTOMACAO)[number];

/** Execução: AGENDADA = esperando o atraso (job atrasado na fila `marketing`). */
export const SITUACOES_EXECUCAO = ["AGENDADA", "CONCLUIDA", "IGNORADA", "FALHOU"] as const;
export type SituacaoExecucao = (typeof SITUACOES_EXECUCAO)[number];

/** De onde vem um envio da fila `emails` (PRIMEIRO_ACESSO = reenvio em massa, transacional). */
export const ORIGENS_ENVIO = ["CAMPANHA", "AUTOMACAO", "PRIMEIRO_ACESSO"] as const;
export type OrigemEnvio = (typeof ORIGENS_ENVIO)[number];

/** IGNORADO = não saiu de propósito (descadastrado, campanha cancelada, membro inativo...). */
export const SITUACOES_ENVIO = ["PENDENTE", "ENVIADO", "FALHOU", "IGNORADO"] as const;
export type SituacaoEnvio = (typeof SITUACOES_ENVIO)[number];

/** LINK = página de confirmação; UM_CLIQUE = POST do cliente de e-mail (RFC 8058). */
export const ORIGENS_DESCADASTRO = ["LINK", "UM_CLIQUE"] as const;
export type OrigemDescadastro = (typeof ORIGENS_DESCADASTRO)[number];

/** Páginas de venda/captura e funis (ADR-0022, RN-240 a RN-247). Modelo = de que esqueleto a página nasceu. */
export const MODELOS_PAGINA = ["VENDA", "CAPTURA"] as const;
export type ModeloPagina = (typeof MODELOS_PAGINA)[number];

/** RASCUNHO = nunca publicada ou despublicada (fora do ar); PUBLICADA = `/p/<slug>` no ar. */
export const SITUACOES_PAGINA = ["RASCUNHO", "PUBLICADA"] as const;
export type SituacaoPagina = (typeof SITUACOES_PAGINA)[number];

/** Integrações de venda externa — Hotmart e Eduzz (ADR-0021, RN-230 a RN-236). */
export const PLATAFORMAS_INTEGRACAO = ["HOTMART", "EDUZZ"] as const;
export type PlataformaIntegracao = (typeof PLATAFORMAS_INTEGRACAO)[number];

/** O que o evento externo significa para o acesso (src/lib/integracoes/normalizar.ts). OUTRO = só registrado. */
export const TIPOS_EVENTO_INTEGRACAO = ["COMPRA_APROVADA", "REEMBOLSO", "CHARGEBACK", "CANCELAMENTO", "ASSINATURA_CANCELADA", "ASSINATURA_ATRASADA", "OUTRO"] as const;
export type TipoEventoIntegracao = (typeof TIPOS_EVENTO_INTEGRACAO)[number];

/** Recibo recusado: token/assinatura não confere ou corpo fora do formato (não vira processamento). */
export const RECUSAS_INTEGRACAO = ["TOKEN_INVALIDO", "FORMATO_INVALIDO"] as const;
export type RecusaIntegracao = (typeof RECUSAS_INTEGRACAO)[number];

/** Processamento do evento: SEM_MAPEAMENTO e ERRO podem ser reprocessados (voltam a PENDENTE). */
export const SITUACOES_EVENTO_INTEGRACAO = ["PENDENTE", "PROCESSADO", "SEM_MAPEAMENTO", "IGNORADO", "ERRO"] as const;
export type SituacaoEventoIntegracao = (typeof SITUACOES_EVENTO_INTEGRACAO)[number];
