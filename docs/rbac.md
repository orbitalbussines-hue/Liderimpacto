# RBAC — controle de acesso

Plataforma com vários criadores (ADR-0002) e autenticação do ADR-0003. Papéis em dois níveis.

## Papéis

| Nível | Papel | Quem | Onde mora |
|-------|-------|------|-----------|
| Plataforma | `SUPER_ADMIN` | Bah! Tech / operação da plataforma. 2FA obrigatório. Entra em qualquer criador como DONO (auditado como "acesso de suporte") | `usuarios.papel_plataforma` |
| Plataforma | `NENHUM` | Todo o resto (default da coluna = menor privilégio) | `usuarios.papel_plataforma` |
| Criador | `DONO` | Responsável pelo criador: tudo, incluindo financeiro e configurações | `criadores_membros.papel` |
| Criador | `ADMIN` | Equipe: conteúdo, membros, comunidade, vitrine | `criadores_membros.papel` |
| Criador | `ALUNO` | Só a área do aluno do criador (default da coluna) | `criadores_membros.papel` |

A lista mora em `src/lib/db/schema/_enums.ts` (`PAPEIS_PLATAFORMA`, `PAPEIS_CRIADOR`, do maior
para o menor). Vínculo `INATIVO`, conta inativa ou criador `SUSPENSO` = sem acesso na próxima
requisição.

## Uma checagem só

```ts
// Server Action (lança ErroDeNegocio; executar() vira mensagem):
const { usuario, criador, membro } = await exigirMembro(EQUIPE); // src/lib/auth/autorizacao.ts
const sessao = await exigirSuperAdmin();                          // área da plataforma
// Página (dentro de <Suspense>; sem sessão -> /login, recusa -> 403):
const { usuario, criador } = await membroDaPagina(TODOS_OS_MEMBROS); // src/lib/auth/guarda.ts
```

O **criador vem sempre do host** da requisição (`src/lib/criador/`), nunca do corpo. A regra
pura é `papelEfetivo`/`papelAceito` (`src/lib/auth/permissoes.ts`, com teste).

## Matriz — quem entra onde

| Área | Quem |
|------|------|
| Apex (`lideresdeimpacto.com.br`): `/login`, `/plataforma` | só `SUPER_ADMIN` |
| Criador: área do aluno (`/`, `/continuar`…) | `DONO`, `ADMIN`, `ALUNO` (vínculo ativo) e `SUPER_ADMIN` |
| Criador: `/admin` | `DONO`, `ADMIN` e `SUPER_ADMIN` (seções financeiras/configuração: `papelMinimo: "DONO"` em `navegacao.ts`) |
| Membros e grupos (`/admin/membros`) | `DONO` e `ADMIN`; ADMIN só mexe em `ALUNO`; papel e equipe só `DONO` (RN-104) |
| Aparência (`/admin/configuracoes/aparencia`) | só `DONO` (RN-107) |
| Configurações: Geral (`/geral`, `acaoRenomearArea`), Domínios (`/dominios`), Logs (`/logs`, `listarTrilha`), Equipe e acesso (`/equipe`, `/equipe/convidar`) | só `DONO` (ADMIN e ALUNO: 403 na página e "Sem permissão" na action). Equipe reusa `acaoCadastrarMembro` (papel ADMIN), `acaoMudarPapel` e `acaoRemoverMembro` (último DONO protegido) — RN-104, RN-140, RN-141 |
| Estúdio de vídeo (`/admin/estudio-de-video`: `listarVideos`, `totaisDoEstudio`, `estadoDaFila`; reprocessar = `acaoReprocessarVideo`) e hub Área de membros (`/admin/area-de-membros`: `resumoDaArea`, `listarGrupos`) | `DONO` e `ADMIN`; atalhos do hub filtrados por `papelPodeVer` (Aparência só aparece para o DONO). Fila: só jobs de vídeos do criador |
| Conteúdos (`/admin/conteudos`, `/novo`, `/[id]`, `/[id]/aulas/[aulaId]`) e envio de arquivos | `DONO` e `ADMIN` (`ALUNO` recebe 403 na página e "Sem permissão" em toda action) — RN-109 a RN-112 |
| Vídeo da aula: enviar, cancelar, trocar, reprocessar (`src/lib/actions/videos.ts`) e situação (`GET /api/video/[id]/situacao`) | `DONO` e `ADMIN` (RN-113) |
| Legendas da aula: enviar/trocar (`acaoEnviarLegenda`, com o bruto por `acaoIniciarEnvio`/`acaoConfirmarEnvio` finalidade `LEGENDA`) e remover (`acaoRemoverLegenda`) | `DONO` e `ADMIN` (`ALUNO`: "Sem permissão"). Aula, arquivo ou legenda de outro criador = "não encontrado"/colisão — RN-180 |
| Ler a legenda (`GET /api/legendas/[id]`: `<track>` do player e aba Transcrição) | quem passa em `podeAssistir` a aula (`acessoDaAula`, mesma regra da chave do vídeo). Sem sessão do host = 401; sem acesso = 403 (na trilha); legenda de outro criador = 404 — RN-180 |
| Base de conhecimento (`/admin/base-de-conhecimento`, `/testar`, `/textos/novo`, `/textos/[id]`; `acaoCriarTexto`, `acaoSalvarTexto`, `acaoExcluirTexto`, `acaoIncluirDocumento`, `acaoTestarBusca`) | `DONO` e `ADMIN` (`ALUNO`: 403 na página e "Sem permissão" na action). Documento ou curso de outro criador = colisão/"não encontrado" (FK composta) — RN-190 |
| Assistente do professor — equipe (`/admin/assistente-do-professor`, `/testar`, `/perguntas`, `/consumo`; `acaoSalvarConfigAssistente`; `POST /api/assistente` com `teste: true`) | `DONO` e `ADMIN` (`ALUNO`: 403/"Sem permissão"; teste por ALUNO = 403 na trilha). SUPER_ADMIN sem vínculo vê as telas mas não conversa (não há membro para contar o limite) — RN-193, RN-196, RN-197 |
| Assistente do professor — perguntar (`POST /api/assistente`, aba "Pergunte ao professor" da aula, `/assistente`) | membro com VÍNCULO no criador do HOST, assistente ligado; com `aulaId`, só quem passa em `podeAssistir` a aula e curso com o assistente. A RECUPERAÇÃO só usa trechos que a pessoa pode ver (matrícula valendo + `motivoDoBloqueio`, `recuperarTrechos`). Sem sessão = 401; limite do dia = 429; sem chave = 503 — RN-191, RN-194 |
| Conversas do assistente (`/assistente`, `acaoApagarConversa`) | só as do PRÓPRIO membro (nenhum id de pessoa no corpo); conversa de outro = colisão. A equipe lê as perguntas em "Perguntas" (aviso ao aluno) — RN-195, RN-196 |
| Assistir vídeo: token (`acaoIniciarReproducao`/`acaoRenovarReproducao`), playlist (`/api/video/[id]/hls/...`) e chave (`/api/video/[id]/chave`) | quem passa em `podeAssistir`: `DONO`, `ADMIN` e `SUPER_ADMIN` sempre; `ALUNO` só com matrícula valendo no produto, produto publicado/não listado, módulo publicado, aula liberada, aprovado na avaliação que libera o módulo e pré-requisito concluído (`motivoDoBloqueio`, RN-114, RN-116, RN-118, RN-125). Vídeo de outro criador = 404 |
| Progresso: `acaoRegistrarProgresso`, `acaoConcluirAula` e `POST /api/progresso` (beacon) | quem passa em `podeAssistir` a aula, com vínculo no criador do HOST (SUPER_ADMIN sem vínculo: ignorado). Sessão de outro host = 401; aula de outro criador = 404; sem acesso = 403 (RN-118) |
| Materiais da aula (`acaoLinkDoMaterial`) | `DONO`, `ADMIN`; `ALUNO` só se `podeAssistir` a aula do material |
| Minha lista (`acaoFavoritar`/`acaoDesfavoritar`) | qualquer membro com vínculo, só para si; curso em rascunho (aluno) ou de outro criador = "não encontrado" (RN-119) |
| Anotações (`acaoCriarAnotacao`, `acaoEditarAnotacao`, `acaoRemoverAnotacao`) | criar: quem `podeAssistir` a aula; editar/remover: só o próprio autor, com trava (RN-120) |
| Preferências (`acaoSalvarPreferencias`) | a própria sessão (nenhum id no corpo), vale em todos os criadores (RN-121) |
| Consultas da área do aluno (`src/lib/progresso/consultas.ts`: fileiras, curso, player, perfil) | recebem o `membroDaPagina(TODOS_OS_MEMBROS)`; ALUNO vê só o que a matrícula libera e só o próprio progresso/lista/anotações; equipe vê rascunho no curso e no player (prévia), sem trava |
| Matrículas (`/admin/matriculas`, `/admin/matriculas/importar`; "Matricular em…" em `/admin/membros`): matricular pessoas ou grupo, alterar expiração, cancelar, reativar, importar CSV, buscar membros (`src/lib/actions/matriculas.ts`, `matriculas-importacao.ts`) | `DONO` e `ADMIN` (`ALUNO`: 403 na página e "Sem permissão" em toda action) — RN-116, RN-117. Membro, produto, grupo ou matrícula de outro criador = "não encontrado"/colisão |
| Avaliações — equipe (`src/lib/actions/avaliacoes.ts`): criar, salvar, publicar/despublicar, remover, questões (criar, salvar, remover, reordenar), conceder tentativa; editor e lista (`src/lib/avaliacoes/admin.ts`, com gabarito) | `DONO` e `ADMIN` (`ALUNO`: "Sem permissão"). Avaliação, módulo, curso ou membro de outro criador = "não encontrado" (FK composta no banco) — RN-123, RN-124 |
| Avaliações — responder (`src/lib/actions/avaliacoes-aluno.ts`: iniciar/retomar, responder, finalizar) | membro com vínculo no criador do HOST, sempre na PRÓPRIA tentativa (nenhum id de pessoa no corpo). `ALUNO` dentro da disponibilidade (publicada, matrícula valendo, módulo não travado, aulas concluídas se exigido, tentativas restantes); `DONO`/`ADMIN` em prévia sem limite; SUPER_ADMIN sem vínculo não faz tentativa — RN-124 |
| Avaliações — leitura (`src/lib/avaliacoes/consultas.ts`) | aluno: só as dos cursos com matrícula valendo e só as próprias tentativas; gabarito só no resultado e conforme `revelaGabarito`. Equipe: vê o resultado de qualquer tentativa do criador, sempre com gabarito — RN-124 |
| Certificados — modelo, nova versão do PDF, revogar (`src/lib/actions/certificados.ts`) e lista do admin (`certificadosDoAdmin`) | `DONO` e `ADMIN` (`ALUNO`: "Sem permissão"); certificado/curso de outro criador = "não encontrado" — RN-127 a RN-129 |
| Certificados — baixar (`acaoBaixarCertificado`) e tela do aluno (`certificadosDoAluno`) | `ALUNO`: só os próprios; equipe: qualquer um do criador. Revogado não baixa |
| Certificado — verificação pública (`verificarPublico`, `urlDoPdfPorCodigo`) | qualquer pessoa, SEM sessão, no host do criador: só nome, curso, carga, datas, criador e situação; código de outro criador = 404 — RN-129 |
| Trilhas — equipe (`src/lib/actions/trilhas.ts`: criar, salvar, capa, publicar, remover, etapas, reordenar) e editor (`trilhaParaEditar`) | `DONO` e `ADMIN`; curso/avaliação/trilha de outro criador = "não encontrado" — RN-126 |
| Trilhas — aluno (`trilhasDoAluno`, `trilhaDoAluno`, `trilhasParaVitrine`) | `ALUNO`: trilha publicada com matrícula valendo em ao menos 1 curso dela; equipe: todas as publicadas — RN-126 |
| Comunidade — ler (`canaisDoMembro`, `feedDaComunidade`, `postDaComunidade`, `lateralDaComunidade`, `acaoMaisPublicacoes`, `acaoLinkDoAnexo`) | `ALUNO`: só canais TODOS, GRUPO (está no grupo) e PRODUTO (matrícula valendo); post oculto só o autor; `DONO`/`ADMIN`/`SUPER_ADMIN`: todos os canais e os ocultos. Canal/post de outro criador = 404/"não encontrado" — RN-130 |
| Comunidade — participar (`acaoPublicar`, `acaoEditarPublicacao`, `acaoVotarEnquete`, `acaoCurtir`, `acaoComentar`, `acaoEditarComentario`, `acaoDenunciar`, `acaoIniciarEnvioAnexo`, `acaoConfirmarEnvioAnexo`) | membro com VÍNCULO no criador do HOST que vê o canal (SUPER_ADMIN sem vínculo só lê). Canal de avisos: só `DONO`/`ADMIN` publicam. Silenciado: não publica, não comenta, não edita. Editar: só o autor. Denunciar: não o próprio — RN-131 a RN-133 |
| Comunidade — remover (`acaoRemoverPublicacao`, `acaoRemoverComentario`) | o autor, ou `DONO`/`ADMIN` (moderação) |
| Comentários da aula (`comentariosDaAula`, `acaoComentar({ aulaId })`) | quem passa em `podeAssistir` a aula (`acessoDaAula`) — RN-132 |
| Moderação e canais (`src/lib/actions/comunidade-moderacao.ts`: fixar, ocultar/reexibir, resolver denúncia, silenciar/dessilenciar, criar/salvar/remover canal; `filaDeDenuncias`, `membrosSilenciados`, `canaisParaEditar`) | `DONO` e `ADMIN` (`ALUNO`: "Sem permissão" em toda action). Silenciar: só alvo `ALUNO` — RN-132 |
| Notificações (`notificacoesDoMembro`, `acaoMarcarNotificacoesLidas`, `acaoMaisNotificacoes`, `GET /api/notificacoes/contagem`) | só as da PRÓPRIA pessoa no criador do HOST (membro da sessão; nenhum id de pessoa no corpo). Sem sessão ou sessão de outro host = 401; SUPER_ADMIN sem vínculo = 0 — RN-134 |
| Construtor da vitrine (`/admin/construtor`; `src/lib/actions/vitrine.ts`: salvar rascunho, publicar, reverter, descartar, buscar conteúdo, preparar imagem) e prévia (`/previa-vitrine`, `previaDaVitrine`) | `DONO` e `ADMIN` (`ALUNO`: 403 nas páginas e "Sem permissão" em toda action). Curso, aula, grupo, imagem ou versão de outro criador = recusa — RN-135 a RN-138 |
| Vitrine do aluno (`/`, `vitrineDoAluno`) e player (`aulaParaPlayer` com o `player` publicado) | qualquer membro; fileira com grupos só para quem está em um deles (equipe vê todas); itens só os que a pessoa pode abrir — RN-136 |
| Eventos ao vivo — gerenciar (`/admin/eventos`, `/novo`, `/[id]`; `acaoCriarEvento`, `acaoSalvarEvento`, `acaoPublicarEvento`, `acaoCancelarEvento`, `acaoExcluirEvento`; leituras de `src/lib/eventos/admin.ts`, com a lista de confirmados) | `DONO` e `ADMIN` (`ALUNO`: 403 na página e "Sem permissão" na action). Evento, curso, aula ou grupo de outro criador = "não encontrado" (e a FK composta recusa) — RN-142, RN-160 |
| Eventos ao vivo — ver e confirmar presença (`/eventos`, `/eventos/[id]`, `GET /eventos/[id]/agenda.ics`; `eventosProximos`, `eventosPassados`, `eventoDoMembro`, `proximoEventoDoMembro`, `acaoConfirmarPresenca`/`acaoCancelarPresenca` → `confirmarPresenca`, `cancelarPresenca`) | membro do criador do HOST no público do evento (`vePublicoSql`: TODOS; PRODUTO = matrícula valendo; GRUPOS = está no grupo); equipe vê todos. Rascunho nunca; o LINK só sai do servidor de 15 min antes até o fim. Presença só a PRÓPRIA (nenhum id de pessoa no corpo); SUPER_ADMIN sem vínculo só lê — RN-142, RN-143 |
| Gamificação — configurar (`/admin/configuracoes/gamificacao`, `acaoSalvarConfigGamificacao`: ligar/desligar, pontos, níveis) | só `DONO` (ADMIN e ALUNO: 403 na página e "Sem permissão" na action), com trava e trilha — RN-144 |
| Gamificação — desafios (`/admin/desafios`, `/novo`, `/[id]`, `/ranking`, `/recompensas`; criar, editar, publicar, encerrar, excluir rascunho, marcar recompensa entregue) e `/admin/membros/gamificacao` | `DONO` e `ADMIN` (`ALUNO`: 403/"Sem permissão"), com trava e trilha; curso, avaliação, grupo e desafio de outro criador = recusa — RN-147 |
| Gamificação — ajuste manual de pontos (`ajustarPontos`) | só `DONO` e `ADMIN`, só para `ALUNO` do criador, com justificativa e trilha na mesma transação — RN-145 |
| Gamificação — aluno (`/conquistas` = `conquistasDoMembro`: `rankingDoCriador`, `resumoDoMembro`, `extratoDoMembro` do próprio, `desafiosDoMembro`; `acaoParticiparDoDesafio`) — desligada: 404 e recusa | qualquer membro do criador do HOST; extrato e participação só os PRÓPRIOS; desafio só do público (`vePublicoSql`). Ranking só com alunos ativos que não saíram dele (`aparecer_no_ranking`) — RN-146, RN-147 |
| `/continuar` (cursos do aluno) | qualquer membro ativo; mostra só as matrículas DELE neste criador |
| Criadores (`/plataforma`, `/plataforma/novo`) | só `SUPER_ADMIN` no apex (RN-108) |
| `/conta/seguranca` | qualquer sessão, inclusive a provisória do SUPER_ADMIN sem TOTP |
| Link de senha para outra pessoa | ver RN-102 em `docs/regras-negocio.md` |

## Regras

- Papel, `ativo`, vínculo e status do criador são lidos do banco a cada requisição, nunca do token.
- Esconder botão é conforto; a action confere de novo.
- Recusa por permissão (403) vai para a trilha (`acesso_negado`, com `criador_id`).
- Nenhum dado de um criador aparece em outro: toda consulta de negócio filtra `criador_id`
  (e `criadores_grupos_membros` tem FK composta que o banco usa para recusar mistura).
