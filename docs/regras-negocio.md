# Regras de Negocio do Cliente

## Como Usar Este Documento

Este arquivo e o registro oficial de TODAS as regras de negocio definidas pelo cliente.
Toda vez que uma regra nova for definida, ela DEVE ser adicionada aqui.
Agentes IA devem consultar este arquivo antes de implementar qualquer logica.

## Formato de Registro

Cada regra segue este formato:

```
### RN-[NUMERO] - [Titulo da Regra]
- **Definida por**: [Nome do cliente/stakeholder]
- **Data**: [YYYY-MM-DD]
- **Modulo**: [Qual parte do sistema]
- **Descricao**: [O que acontece]
- **Comportamento esperado**: [Como o sistema deve reagir]
- **Impacto se descumprida**: [O que da errado se nao seguir]
```

---

## Regras Globais (aplicam a todos os projetos)

### RN-001 - Exclusao Sempre Logica
- **Definida por**: Estrutura Base
- **Data**: 2026-05-15
- **Modulo**: Todos
- **Descricao**: Nenhum registro pode ser excluido fisicamente do banco de dados
- **Comportamento esperado**: Ao excluir, marcar `is_deleted = true` e `deleted_at = now()`. Registro permanece no banco
- **Impacto se descumprida**: Perda de dados, impossibilidade de auditoria, cliente diz que "sumiu coisa"

### RN-002 - Rastreabilidade de Acoes
- **Definida por**: Estrutura Base
- **Data**: 2026-05-15
- **Modulo**: Todos
- **Descricao**: Toda acao de criar, alterar ou excluir deve registrar quem fez e quando
- **Comportamento esperado**: Tabela de auditoria com user_id, acao, timestamp, dados anteriores e novos
- **Impacto se descumprida**: Impossibilidade de identificar origem de problemas

### RN-003 - Validacao Pre-Salvamento com Modal Block
- **Definida por**: Estrutura Base
- **Data**: 2026-05-15
- **Modulo**: Lancamentos, Contratos, qualquer dado financeiro
- **Descricao**: Antes de salvar dados criticos, mostrar modal bloqueante por 3 segundos com resumo da acao
- **Comportamento esperado**: Modal aparece, tela bloqueia 3s, usuario le e confirma ou cancela
- **Impacto se descumprida**: Usuario salva dados errados sem perceber, gerando inconsistencias

### RN-004 - Versionamento de Documentos Gerados
- **Definida por**: Estrutura Base
- **Data**: 2026-05-15
- **Modulo**: Relatorios, PDFs, Demonstrativos
- **Descricao**: Todo documento gerado (PDF, relatorio) deve ter versao incremental
- **Comportamento esperado**: v1, v2, v3... Sempre mostra ultima versao. Historico completo acessivel
- **Impacto se descumprida**: Cliente alega que dados mudaram sem prova do contrario

### RN-005 - Validacao de Categoria por Regex
- **Definida por**: Estrutura Base
- **Data**: 2026-05-15
- **Modulo**: Lancamentos
- **Descricao**: Quando usuario lanca com categoria "Outros", validar por regex se a descricao corresponde a uma categoria existente
- **Comportamento esperado**: Sistema detecta que descricao "IPTU" deveria ser categoria IPTU, nao "Outros". Alerta o usuario
- **Impacto se descumprida**: Lancamentos ficam com categoria errada, relatorios ficam incorretos

---

## Regras Especificas do Projeto: Líder de Impacto (plataforma multi-criador)

### RN-100 - Área por criador e um login para tudo
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-13
- **Modulo**: Autenticação / Criadores
- **Descricao**: Cada criador tem área própria em `<slug>.lideresdeimpacto.com.br`. A pessoa tem UMA conta (e-mail e senha) que vale em qualquer criador em que tenha vínculo ativo; cada área tem a sua sessão (cookie por host, ADR-0003).
- **Comportamento esperado**: login num criador exige vínculo ATIVO nele (ou SUPER_ADMIN). Sem vínculo, recusa com a MESMA mensagem de senha errada. Criador SUSPENSO ou inexistente: 404. O apex é só da plataforma (SUPER_ADMIN).
- **Impacto se descumprida**: aluno de um criador vendo conteúdo ou dados de outro.

### RN-101 - Papéis e o que cada um pode
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-13
- **Modulo**: Autenticação / Permissões
- **Descricao**: Plataforma: `SUPER_ADMIN` (opera a plataforma; entra em qualquer criador como DONO, registrado como acesso de suporte). Criador: `DONO` (tudo, incluindo financeiro, equipe e configurações), `ADMIN` (conteúdo, membros, comunidade, vitrine; sem financeiro/configurações), `ALUNO` (só a área do aluno, conteúdo das próprias matrículas). Matriz em `docs/rbac.md`.
- **Comportamento esperado**: ALUNO não entra em `/admin` (403 na trilha). Papel rebaixado, vínculo inativado ou conta desativada valem na próxima requisição.
- **Impacto se descumprida**: acesso administrativo indevido.

### RN-102 - Senha: a pessoa escolhe, a equipe só entrega o link
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-13
- **Modulo**: Autenticação
- **Descricao**: Ninguém define a senha de outra pessoa. A equipe gera um link de primeiro acesso/redefinição (uso único, 24 h) que aparece na tela para copiar; com SMTP configurado, "Esqueci a senha" manda um link de 30 min por e-mail. Quem pode gerar para quem: SUPER_ADMIN para qualquer outra conta; DONO para ADMIN/ALUNO do próprio criador; ADMIN só para ALUNO do próprio criador; e a equipe do criador NÃO gera para quem também participa de outro criador nem para SUPER_ADMIN (identidade global: o link abriria as outras áreas). Ninguém gera para si.
- **Comportamento esperado**: link novo invalida o anterior; a trilha registra quem gerou, para quem, onde e o motivo (nunca o token). Senha mínima de 8 caracteres (decisão do Paulo, ADR-0003), sem reuso das 5 últimas, sem nome/e-mail/marca, recusada se aparece em vazamentos.
- **Impacto se descumprida**: tomada de conta por quem administra outra área.

### RN-103 - Segundo fator obrigatório para SUPER_ADMIN
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-13
- **Modulo**: Autenticação
- **Descricao**: SUPER_ADMIN entra com senha + código do aplicativo autenticador (ou um dos 10 códigos de recuperação, uso único). Sem TOTP confirmado, a sessão só abre Conta › Segurança para cadastrar. Nesta fase os demais papéis entram só com senha (desvio temporário da régua, ADR-0003; rever antes de produção).
- **Comportamento esperado**: 5 senhas erradas bloqueiam a CONTA por 15 min; 5 códigos errados bloqueiam o segundo fator por 15 min; código já usado é recusado.
- **Impacto se descumprida**: conta de maior privilégio aberta só com a senha.

### RN-104 - Gestão de membros da área
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-13
- **Modulo**: Admin › Membros
- **Descricao**: DONO e ADMIN cadastram, inativam/reativam, removem e mudam grupos de ALUNOS; só o DONO gerencia a equipe (cadastra ADMIN, muda papel, mexe em ADMIN/DONO). DONO só nasce pela troca de papel (ou pela plataforma, no novo criador). Ninguém mexe no próprio acesso pelo menu (exceto o DONO trocar o próprio papel). Remover = exclusão lógica do VÍNCULO e das participações em grupos; a conta global continua e pode ser cadastrada de novo.
- **Comportamento esperado**: o último DONO ATIVO nunca sai (rebaixar, inativar ou remover é recusado; conferido com trava de linha). E-mail que já tem conta na plataforma reaproveita a identidade (nome e senha da pessoa não mudam) com mensagem neutra, sem revelar outras áreas; conta nova nasce sem senha e o link de primeiro acesso (24 h, uso único) aparece UMA vez na tela (e vai por e-mail se o SMTP estiver configurado). Inativar/remover/mudar papel passam pelo modal block; toda edição usa a trava de colisão do vínculo e grava a trilha (papel antigo → novo gravado ANTES do efeito).
- **Impacto se descumprida**: área sem dono, equipe de uma área mexendo em pessoas de outra, tomada de conta.

### RN-105 - Grupos de acesso e turmas
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-13
- **Modulo**: Admin › Membros › Grupos de acesso
- **Descricao**: Grupo é Turma ou Acesso, com nome único por área (sem diferenciar maiúsculas, entre os vivos). DONO e ADMIN criam, renomeiam e removem.
- **Comportamento esperado**: remover é exclusão lógica e é RECUSADO enquanto o grupo tiver membros ("tem N membros, retire-os antes"). Renomear usa a trava de colisão. Grupo e membro são sempre da mesma área (FK composta no banco).
- **Impacto se descumprida**: membros "somem" de turmas sem ninguém ver; mistura entre áreas.

### RN-106 - Importação de membros por CSV
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-13
- **Modulo**: Admin › Membros › Importar CSV
- **Descricao**: Arquivo `nome,email,grupo` (separador `,` ou `;`, grupo opcional) de até 1 MB e 1000 linhas; todos entram como ALUNO. Matrícula em curso: RN-117 (CSV de matrículas).
- **Comportamento esperado**: prévia com erro por linha antes de gravar; o servidor lê o arquivo de novo. Linha inválida (nome/e-mail fora do formato, e-mail repetido no arquivo, colunas a mais) não grava nada; as válidas entram numa ÚNICA transação (falhou uma, nenhuma entra). Grupo inexistente vira Turma. Quem já é membro é contado e pulado. Os links de primeiro acesso das contas novas aparecem só no resultado (copiar todos ou baixar CSV gerado no navegador).
- **Impacto se descumprida**: importação pela metade, contas duplicadas, links vazados.

### RN-107 - Cor da marca da área
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-13
- **Modulo**: Admin › Configurações › Aparência
- **Descricao**: Só o DONO troca a cor da marca da área do aluno (seletor, hex ou as 4 cores prontas), com prévia nos dois temas.
- **Comportamento esperado**: grava o hex normalizado em `criadores.cor_marca` (vazio = dourado padrão) com trava de colisão e trilha cor antiga → nova; a área do aluno usa a cor na próxima página. Se a cor não tem contraste, a tela mostra a cor ajustada por `gerarPaleta`.
- **Impacto se descumprida**: vitrine ilegível ou trocada por quem não é responsável.

### RN-108 - Criadores na plataforma
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-13
- **Modulo**: Plataforma (apex)
- **Descricao**: Só o SUPER_ADMIN, no apex, cria criador (nome, endereço `[a-z0-9-]` sem hífen nas pontas e fora dos reservados www/admin/api/app/plataforma/mail/smtp, cor opcional, nome e e-mail do DONO) e suspende/reativa.
- **Comportamento esperado**: criar grava o criador e o vínculo DONO numa transação e mostra o link de primeiro acesso do DONO no host da área nova (conta já existente: sem link, mensagem neutra). Suspender passa pelo modal block; a área responde 404 e as sessões de lá caem na próxima requisição. Endereço já usado é recusado.
- **Impacto se descumprida**: área criada sem dono, subdomínio sequestrado, área suspensa ainda aberta.

### RN-109 - Catálogo de produtos
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-14
- **Modulo**: Admin › Conteúdos
- **Descricao**: DONO e ADMIN criam e editam produtos (Curso, Mentoria, Evento) da própria área: título, endereço (slug), descrição, tipo, professor (alguém DONO/ADMIN ativo da área), cor própria do curso (opcional, ADR-0002) e capas 3:4 e 16:9. Cada produto ganha um código sequencial por área ("Cód. N"), nunca reaproveitado. A estrutura é Produto > Módulo > Aula > Material.
- **Comportamento esperado**: produto nasce em RASCUNHO. Endereço único por área entre os vivos (só `a-z`, `0-9` e hífen). Toda edição usa a trava de colisão e grava a trilha campo a campo (antes → depois). Remover produto só em RASCUNHO, com modal block, e leva junto (exclusão lógica) módulos, aulas e materiais; os arquivos dele são descartados.
- **Impacto se descumprida**: curso de uma área aparecendo em outra, edição sobrescrita, aluno perdendo curso publicado por engano.

### RN-110 - Publicar produto
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-14
- **Modulo**: Admin › Conteúdos
- **Descricao**: Situações: RASCUNHO (só a equipe vê), PUBLICADO (vitrine) e NÃO LISTADO (acessível a quem tem matrícula, fora da vitrine). Sair de RASCUNHO exige título, ao menos 1 módulo PUBLICADO com 1 aula e capa 16:9.
- **Comportamento esperado**: a recusa diz o que falta ("Para publicar, falta: capa 16:9."). Produto fora de RASCUNHO não perde o mínimo: remover a capa 16:9, a última aula ou ocultar o último módulo com aula é recusado ("volte o produto para rascunho antes"). Mudança de situação passa pelo modal block e vai para a trilha (`publicar`, antes → depois).
- **Impacto se descumprida**: aluno abrindo curso vazio ou sem capa na vitrine.

### RN-111 - Módulos, aulas e ordem
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-14
- **Modulo**: Admin › Conteúdos › Estrutura
- **Descricao**: Módulo tem título e situação (PUBLICADO/RASCUNHO; rascunho não aparece ao aluno). Aula tem título, descrição, liberação programada (opcional, horário de Brasília), pré-requisito (outra aula do MESMO produto, sem ciclo), capítulos (tempo mm:ss + título) e thumb. Módulos e aulas são reordenados arrastando (mouse, toque ou teclado) ou com subir/descer.
- **Comportamento esperado**: a ordem é sempre 1..n, sem buraco nem repetição (criar entra no fim; remover fecha o buraco). Reordenar envia a versão de TODOS os irmãos: se alguém mexeu antes, é recusado. Remover módulo com aula é recusado; remover aula que é pré-requisito de outra é recusado. Capítulos são gravados em ordem crescente, sem tempo repetido e, com a duração do vídeo conhecida, antes do fim. Remover (módulo, aula, material) passa pelo modal block.
- **Impacto se descumprida**: curso com ordem embaralhada, aula travada por pré-requisito que não existe, marcador fora do vídeo.

### RN-112 - Arquivos (capas, thumbs e materiais)
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-14
- **Modulo**: Admin › Conteúdos / Armazenamento
- **Descricao**: Imagens (capa, thumb): JPG, PNG ou WebP até 10 MB (SVG recusado). Materiais: PDF, DOC ou DOCX até 50 MB, ou link `https://`. O navegador envia direto ao armazenamento (o servidor só assina o envio e confere o resultado). Material tem nome (renomeável) e é arquivo OU link, nunca os dois.
- **Comportamento esperado**: MIME e extensão precisam bater com a lista; o envio só vale depois da confirmação (o servidor confere tamanho e tipo no armazenamento); se não bater, o envio é descartado. Arquivo de uma área nunca é aceito em outra. Cada arquivo é usado em um lugar só; trocar ou remover descarta o registro (exclusão lógica, na trilha) e apaga o objeto do armazenamento.
- **Impacto se descumprida**: arquivo malicioso servido aos alunos, anexos de uma área vazando para outra, armazenamento cheio de lixo.

### RN-113 - Vídeo da aula (envio, troca e processamento)
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-14
- **Modulo**: Admin › Conteúdos › Aula › Vídeo
- **Descricao**: Cada aula tem no máximo UM vídeo. Aceitos MP4, MOV, MKV ou WebM até 10 GB (MIME e extensão batendo). O navegador envia direto ao armazenamento em partes de 16 MB, com progresso; parte que falha é tentada de novo e o envio pode ser continuado de onde parou ou cancelado. Ao concluir, o servidor confere o tamanho no armazenamento e põe o vídeo na fila: o worker gera o streaming protegido (720p + 480p, nunca aumenta a resolução do original), a thumb e a duração, e a duração vai para a aula.
- **Comportamento esperado**: situação ENVIANDO → PROCESSANDO → PRONTO, ou FALHOU com mensagem legível depois de 3 tentativas. DONO e ADMIN podem reprocessar. Trocar o vídeo passa pelo modal block: o vídeo atual é excluído (lógico, na trilha) e os arquivos dele saem do armazenamento assim que o envio novo começa. O original nunca é servido a ninguém.
- **Impacto se descumprida**: aula com dois vídeos, upload de arquivo que não é vídeo, armazenamento cheio de lixo, vídeo em claro.

### RN-114 - Quem assiste o vídeo
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-14
- **Modulo**: Vídeo / Player
- **Descricao**: Regra única em `podeAssistir` (src/lib/video/acesso.ts), com os dados de `acessoDaAula` (src/lib/video/acesso-aula.ts). A equipe do criador (DONO, ADMIN; SUPER_ADMIN como suporte) sempre assiste, para conferir o vídeo no admin. O ALUNO assiste com matrícula valendo no produto da aula (RN-116), produto PUBLICADO ou NÃO LISTADO, módulo PUBLICADO, aula liberada (`libera_em` vazia ou já passada) e pré-requisito concluído (RN-118).
- **Comportamento esperado**: o token de reprodução vale 10 min, é amarrado a vídeo + criador + pessoa + sessão de reprodução e o player renova a cada 4 min. A chave do vídeo só sai com sessão de login válida, `podeAssistir` e sessão de reprodução viva. Vídeo de uma área nunca abre em outra (404).
- **Impacto se descumprida**: aula paga assistida sem matrícula, link de vídeo compartilhado funcionando para quem não é aluno.

### RN-115 - Limite de telas simultâneas
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-14
- **Modulo**: Vídeo / Player
- **Descricao**: Cada pessoa assiste em no máximo 2 telas ao mesmo tempo (configurável por `VIDEO_LIMITE_SESSOES`, 1 a 10). Reabrir o vídeo no mesmo navegador não conta como tela nova. Tela sem sinal por 6 min deixa de contar.
- **Comportamento esperado**: abrir uma tela além do limite encerra a mais antiga: ela perde a chave e a renovação e mostra "A reprodução foi aberta em outra tela". Cada abertura vai para a trilha (com quantas telas foram encerradas).
- **Impacto se descumprida**: uma conta compartilhada entre muitas pessoas assistindo ao mesmo tempo.

### RN-116 - Matrículas
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-14
- **Modulo**: Admin › Matrículas / Vídeo
- **Descricao**: Matrícula liga um membro da área a um produto da MESMA área, com origem (Manual, Importação, Compra), situação (Ativa, Pendente, Cancelada) e expiração opcional (vale até o fim do dia, horário de Brasília). "Expirada" não é gravada: é Ativa com a data já passada. DONO e ADMIN matriculam pessoas escolhidas ou um grupo inteiro (membros vivos do grupo naquele momento) em um ou mais produtos, alteram a expiração, cancelam (com motivo) e reativam. Agora só manual e CSV; a compra (webhook do gateway) chama a mesma função `matricular` depois.
- **Comportamento esperado**: UMA matrícula por membro e produto: matricular de novo quem já tem matrícula valendo deixa como está ("já existia"); cancelada, pendente ou expirada é REATIVADA na mesma linha (nunca duplica). A referência externa (`gateway:eventoId`) é única por área: o mesmo evento repetido devolve a mesma matrícula sem mudar nada. Cancelar é situação + motivo (nunca apaga) e passa pelo modal block; o acesso cai na próxima requisição. Matricular passa pelo modal block com o resumo e mostra quantas foram criadas, reativadas e já existiam. Expiração no passado é recusada. Toda escrita usa a trava de colisão e grava a trilha (antes → depois). Pessoa que ainda não é membro: o caminho é o cadastro de membros. Membro, produto ou grupo de outra área: "não encontrado" (e o banco recusa por FK composta). O aluno vê em "Continuar" só os próprios cursos valendo e fora de rascunho.
- **Impacto se descumprida**: aluno sem matrícula assistindo aula paga, matrícula duplicada por webhook repetido, acesso de uma área liberado em outra.

### RN-117 - Importação de matrículas por CSV
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-14
- **Modulo**: Admin › Matrículas › Importar CSV
- **Descricao**: Arquivo `nome,email,produto,expira_em,grupo` com os mesmos limites e leitura do CSV de membros (RN-106): até 1 MB e 1000 linhas, `,` ou `;`. Produto pelo código ("164") ou pelo endereço; `expira_em` (DD/MM/AAAA ou AAAA-MM-DD) e `grupo` opcionais; uma linha por produto (a mesma pessoa pode vir em várias linhas).
- **Comportamento esperado**: prévia com erro por linha (o servidor lê de novo). Linha inválida não grava: formato, data inexistente ou passada, e-mail + produto repetidos no arquivo, produto que não é DESTA área ("Produto não encontrado"). As válidas entram numa ÚNICA transação. E-mail sem vínculo vira ALUNO (conta nova sem senha com link de primeiro acesso na tela e por e-mail se o SMTP estiver configurado; conta existente reaproveitada com a mensagem neutra da RN-104); o grupo é criado como Turma se não existir e a pessoa entra nele. Resultado com matrículas criadas/reativadas/já existentes, contas novas e links.
- **Impacto se descumprida**: importação pela metade, matrícula em curso de outra área, contas duplicadas, links vazados.

### RN-118 - Progresso da aula, conclusão e pré-requisito
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-14
- **Modulo**: Player / Área do aluno
- **Descricao**: O player informa a cada ~10 s (e ao pausar, pular, terminar, trocar de aba ou sair) os trechos que REALMENTE tocaram. O servidor guarda os segundos assistidos únicos de cada membro em cada aula (rever não soma; arrastar a barra não conta), a última posição (para retomar, inclusive quando a pessoa voltou no vídeo) e o percentual. A aula é concluída ao chegar a 90% assistido ("Assistiu") ou pelo botão "Concluir e avançar" ("Manual", liberado em todos os cursos nesta fase; a regra por curso vem com o construtor do player). Conclusão nunca é desfeita. Aula com pré-requisito só abre para o ALUNO depois que ele concluiu a aula pré-requisito; se o pré-requisito foi removido ou está num módulo oculto, ele deixa de travar. Equipe nunca é travada. Quando todas as aulas publicadas do curso estão concluídas, a matrícula ganha a data de conclusão (base do certificado).
- **Comportamento esperado**: só registra quem pode assistir a aula (RN-114: matrícula valendo, liberação, pré-requisito). Cada trecho tem no máximo 30 s e cada batida pode declarar no máximo o dobro do tempo real desde a anterior + 15 s; o que passar disso é ignorado sem erro (ninguém conclui "pulando para o fim"). Batidas da mesma aba mais próximas que 3 s são ignoradas. Ao reabrir a aula, o vídeo volta à última posição, ou ao começo se a pessoa tinha parado a menos de 10 s do fim. A conclusão pelo botão vai para a trilha. Na tela do curso e no player, aula travada mostra o motivo: sem matrícula, libera em data X, conclua a aula Y antes.
- **Impacto se descumprida**: progresso perdido, aula "concluída" sem ser vista, certificado indevido, aula com pré-requisito aberta antes da hora.

### RN-119 - Fileiras da vitrine e Minha lista
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-14
- **Modulo**: Área do aluno › Início
- **Descricao**: CONTINUAR = aulas com 1% a 94% assistido, mais recentes primeiro (some a concluída pelo botão e a que deixou de abrir). TOP 10 = aulas mais vistas nos últimos 7 dias (hoje incluso, calendário de Brasília), contando 1 visualização por membro, aula e dia; só catálogo publicado e já liberado; atualiza no máximo a cada hora. NOVIDADES = cursos publicados pela primeira vez nos últimos 30 dias (todos veem) e aulas novas, nos últimos 30 dias, de cursos já publicados antes (só quem está matriculado). MENTORIAS = produtos do tipo Mentoria publicados. MINHA LISTA = cursos e aulas que o membro favoritou.
- **Comportamento esperado**: fileira vazia não aparece. Curso em rascunho ou não listado não entra em nenhuma fileira pública (não listado abre só pelo link). Favoritar é idempotente; tirar da lista é exclusão lógica e favoritar de novo reativa o mesmo registro; cada mudança vai para a trilha. Curso em rascunho ou de outra área não pode ser favoritado ("não encontrado").
- **Impacto se descumprida**: vitrine mostrando curso em rascunho, ranking inflado por quem revê a mesma aula, lista com item de outra área.

### RN-120 - Anotações com tempo
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-14
- **Modulo**: Player › Anotações
- **Descricao**: O aluno anota um texto (1 a 2000 caracteres) num instante da aula. Só quem pode assistir a aula anota. Cada pessoa vê, edita e remove só as próprias anotações.
- **Comportamento esperado**: lista em ordem de tempo; editar e remover usam a trava de colisão (duas abas abertas: a segunda recebe "Registro alterado por outro usuário") e vão para a trilha; remover é exclusão lógica.
- **Impacto se descumprida**: anotação de um aluno visível ou editável por outro, edição perdida.

### RN-121 - Preferências do aluno
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-14
- **Modulo**: Perfil
- **Descricao**: "Reprodução automática" (abre a próxima aula após a contagem de 5 s) e "Lembretes", ambas ligadas por padrão, são da PESSOA e valem em todas as áreas em que ela é membro (como o tema).
- **Comportamento esperado**: só a própria pessoa altera, pela sessão (nenhum id vem da tela); a mudança vai para a trilha com antes e depois. O player lê a reprodução automática a cada abertura.
- **Impacto se descumprida**: preferência de uma pessoa alterada por outra, autoplay ignorando a escolha.

### RN-122 - Painel (Home) do admin
- **Definida por**: Paulo (Bah! Tech)
- **Data**: 2026-10-14
- **Modulo**: Admin / Home
- **Descricao**: DONO e ADMIN veem o pulso da área (o ALUNO é recusado). Período escolhido num calendário (de um dia até 366 dias, nunca depois de hoje; atalhos como "Últimos 30 dias", "Este mês", "Mês passado", "Últimos 12 meses"), em dias do calendário de Brasília, os dois extremos inclusivos; padrão = últimos 30 dias. Nada que aconteceu depois do último dia escolhido entra na conta. Comparado com o período anterior de mesmo tamanho, imediatamente antes do primeiro dia. Só membros com papel ALUNO entram nas métricas de aluno. **Alunos ativos**: alunos com ao menos um dia de atividade de aula no período (assistiu ≥ 1 segundo de qualquer aula, ou concluiu uma aula). **Novos alunos**: vínculos ALUNO criados no período. **Matrículas**: matrículas de alunos criadas ou reativadas no período (início da matrícula), com a **taxa de conclusão** = matrículas valendo agora (ATIVA e não expirada) já concluídas ÷ matrículas valendo agora. **Aulas concluídas**: conclusões de aula (botão ou 90% assistido) no período. **Acessos por dia**: alunos distintos com atividade em cada um dos últimos 14 dias (sempre 14, qualquer período). **Conteúdos mais assistidos**: aulas com mais visualizações no período (1 visualização = 1 membro na aula no dia, a mesma conta do Top 10). **Saúde dos produtos**: produtos PUBLICADOS, conclusão média (média, entre os publicados com matrícula valendo, da taxa de conclusão de cada um) e alunos com ao menos uma matrícula valendo. **Acontecendo agora**: últimos 8 eventos — membro cadastrado, matrícula criada ou reativada, produto publicado, vídeo pronto e aula concluída por aluno.
- **Comportamento esperado**: variação com seta e texto; período anterior zerado mostra "novo" (nunca % infinito); os dois zerados, "Sem movimento". "Acontecendo agora" mostra só nome, título e número da aula — nunca e-mail, token ou IP. Receita e avaliação média só quando existirem (vendas, passo 7+): nada inventado. Os agregados podem ficar até ~1 min atrasados (cache); "Acontecendo agora" é ao vivo.
- **Impacto se descumprida**: decisão tomada com número errado, dado de um criador no painel de outro, e-mail de aluno exposto na tela.

> **RN-123 a RN-129 (passo 7): PADRÕES definidos pela Bah! Tech aguardando o cliente** (SISTEMA.md §11:
> "política de certificados e nota mínima" é pendência do cliente). Os valores marcados como
> padrão são configuráveis por avaliação/modelo; trocar o padrão = mudar o default da coluna e esta RN.

### RN-123 - Avaliações (cadastro) — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Admin › Avaliações
- **Descricao**: Avaliação pertence a um curso e, opcionalmente, a um módulo do MESMO curso. Tipos: Quiz, Prova e Simulado (Formulário fica de fora até ser pedido). Configurável por avaliação: nota mínima (**padrão 70%**, 0–100), tentativas (**padrão 3**, 0 = ilimitado, até 50), tempo limite (**padrão sem limite**, 1–600 min), obrigatória para o certificado (padrão não), libera o próximo módulo (só avaliação de módulo; padrão não), embaralhar questões e opções (padrão não) e exige as aulas concluídas (**padrão sim**: só abre quando todas as aulas publicadas do módulo — ou do curso, se a avaliação for do curso — estiverem concluídas). Situação Rascunho ou Publicada. Questões: Única (uma correta), Múltipla (várias corretas), Verdadeiro ou falso; enunciado, 2 a 8 opções sem texto repetido, peso 1–100 (**padrão 1**) e explicação opcional.
- **Comportamento esperado**: só DONO e ADMIN mexem; nasce em rascunho; publicar exige ao menos 1 questão e publicada não fica sem questão; questões em ordem 1..n reordenável com trava; avaliação numa trilha não pode ser removida (tire da trilha antes); toda escrita com trava de colisão e trilha antes → depois. Rascunho não aparece para o aluno.
- **Impacto se descumprida**: aluno respondendo avaliação vazia ou incompleta, avaliação de um curso travando outro.

### RN-124 - Tentativas e correção — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Área do aluno › Avaliações
- **Descricao**: A correção é SEMPRE no servidor. Única e V/F: certa se marcou a opção correta. **Múltipla: certa só se marcou exatamente o conjunto correto (sem ponto parcial)**. Nota = soma dos pesos das certas ÷ soma dos pesos × 100, com 1 casa (meio para cima). Aprovado = nota ≥ nota mínima. Vale a MELHOR nota. Uma tentativa aberta por vez (iniciar de novo retoma a aberta). Respostas salvas a cada clique. Tempo limite contado pelo servidor desde o início: resposta depois do prazo não é gravada e a tentativa fecha com o que já tinha ("tempo esgotado"). Esgotou as tentativas sem aprovar: a equipe pode conceder de 1 a 10 tentativas extras com motivo. Gabarito e explicação: **Quiz e Simulado mostram logo depois de finalizar; Prova só mostra quando o aluno foi aprovado ou não tem mais tentativas** (certa/errada aparece sempre). A equipe pode fazer tentativa de prévia sem limite (não entra nas estatísticas).
- **Comportamento esperado**: o gabarito nunca vai para a tela antes da correção; dois cliques em "Iniciar" abrem uma tentativa só; finalizar duas vezes devolve o mesmo resultado; cada início, correção e concessão vai para a trilha.
- **Impacto se descumprida**: aluno lendo o gabarito no navegador, nota calculada pelo cliente, prova com tempo burlável.

### RN-125 - Avaliação que libera o próximo módulo — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Curso / Player / Avaliações
- **Descricao**: Avaliação PUBLICADA de um módulo publicado com "libera o próximo módulo" trava, para o ALUNO, TODOS os módulos seguintes do curso até ele ser aprovado nela. Mesma regra única de `motivoDoBloqueio` (motivo AVALIACAO): vale para vídeo, chave, progresso, materiais, curso e player. Equipe nunca é travada. Avaliação em rascunho ou em módulo oculto não trava.
- **Comportamento esperado**: a aula travada mostra "Seja aprovado em (avaliação)"; a avaliação do módulo travado também não abre ("Seja aprovado na avaliação anterior").
- **Impacto se descumprida**: aluno pulando a avaliação de liberação, ou travado para sempre por avaliação que ele nem consegue ver.

### RN-126 - Trilhas — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Área do aluno › Trilhas / Admin
- **Descricao**: Trilha do criador: título, descrição, tag, capa, situação e etapas ordenadas — um curso ou uma avaliação (aula avulsa fica de fora até ser pedida) —, cada uma com "exige a anterior" (**padrão sim**). Etapa concluída: curso = matrícula concluída; avaliação = aprovada. **O aluno vê a trilha publicada se tiver matrícula valendo em ao menos 1 curso dela**; etapas de curso sem matrícula aparecem com "Matricule-se".
- **Comportamento esperado**: cada etapa mostra concluída / em andamento / disponível / bloqueada com o motivo (etapa anterior, matrícula, aulas pendentes, tentativas esgotadas); botão Iniciar / Continuar / Rever e o próximo passo. Publicar exige ao menos 1 etapa; publicada não fica vazia; o mesmo curso/avaliação não entra duas vezes; ordem com trava; curso ou avaliação de outra área é recusado.
- **Impacto se descumprida**: aluno vendo trilha de cursos que não comprou, etapa liberada fora de ordem.

### RN-127 - Modelo do certificado — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Admin › Certificados
- **Descricao**: Um modelo padrão do criador e, opcionalmente, um por curso (o do curso vale sobre o padrão). Campos: título (**padrão "Certificado de conclusão"**), texto com as variáveis {nome}, {curso}, {carga_horaria} e {data} ({nome} obrigatória; **padrão "Certificamos que {nome} concluiu o curso {curso}, com carga horária de {carga_horaria}, em {data}."**), nome e cargo de quem assina (padrão: nome do criador, "Responsável") e cor (padrão: cor do curso, senão do criador, senão o dourado; sempre ajustada para leitura no papel claro). Logo em texto (nome do criador) até existir o logo oficial. Carga horária = soma da duração das aulas publicadas do curso **arredondada à hora cheia, mínimo 1 hora**. Data = conclusão da matrícula, por extenso, horário de Brasília.
- **Comportamento esperado**: só DONO e ADMIN editam; mudar o modelo vale para os PDFs gerados depois (os já gerados ficam no histórico); trava e trilha.
- **Impacto se descumprida**: certificado com texto quebrado ou carga errada.

### RN-128 - Emissão do certificado — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Certificados
- **Descricao**: Emitido AUTOMATICAMENTE quando a matrícula está concluída (todas as aulas publicadas, RN-118) e não cancelada E o aluno foi aprovado em todas as avaliações publicadas marcadas "obrigatória para o certificado" do curso. Um certificado por aluno e curso. Código de verificação de 10 caracteres sem letras/números ambíguos (sem 0, O, 1, I), aleatório, único na plataforma. O PDF (A4 paisagem, com QR e o endereço `https://(área).(plataforma)/certificado/(código)`) é gerado em segundo plano: cada geração é uma VERSÃO (v1, v2…) com histórico completo; pedir de novo gera a próxima versão mesmo sem mudança; o download é sempre a última versão pronta.
- **Comportamento esperado**: concluir a última aula ou ser aprovado na última obrigatória emite na hora (duas conclusões ao mesmo tempo = um certificado); a tela de certificados também emite quem ficou elegível sem evento; certificado não é emitido antes das condições; emissão e cada versão vão para a trilha.
- **Impacto se descumprida**: certificado para quem não concluiu, certificados duplicados, PDF diferente do registrado.

### RN-129 - Revogação e verificação pública
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Certificados / Página pública
- **Descricao**: DONO e ADMIN revogam com motivo (modal block). A verificação pública (sem login, no endereço da área) mostra só o que o certificado impresso já mostra: nome, curso, carga horária, datas, criador e situação (Válido ou Revogado). Nunca e-mail, motivo da revogação ou dados da conta. Revogado: não baixa PDF, não gera versão nova e não é reemitido. Código de outra área = "não encontrado".
- **Comportamento esperado**: revogar usa trava de colisão e vai para a trilha (antes → depois); a página pública passa a dizer "revogado" na hora.
- **Impacto se descumprida**: certificado cancelado ainda "válido" para quem confere, vazamento de dados pessoais na página pública.

### RN-130 - Canais da comunidade — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Área do aluno › Comunidade / Admin
- **Descricao**: O criador tem canais com nome, descrição e ordem. Quem VÊ: **todos os membros** (padrão), só quem está num **grupo**, só quem tem **matrícula valendo num curso**, ou só a **equipe**. Quem PUBLICA: todos que veem (padrão) ou **só a equipe** (canal de avisos). Comentar segue quem vê. Todo criador nasce com o canal **"Geral"** (de todos; não se remove nem fecha). A equipe (DONO, ADMIN) vê e modera todos os canais.
- **Comportamento esperado**: aluno nunca vê canal, post, comentário ou anexo de canal fora do acesso dele — nem pelo link; matrícula expirada ou saída do grupo tira o acesso na próxima requisição. Nome de canal único por área. Criar/alterar/remover canal: só DONO e ADMIN, com trava e trilha.
- **Impacto se descumprida**: conteúdo de turma/curso pago vazando para quem não comprou; avisos misturados com conversa.

### RN-131 - Publicações: texto puro, anexos e enquete — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Área do aluno › Comunidade
- **Descricao**: Publicação = texto puro de 1 a 5000 caracteres (sem HTML/formatação; links http/https ficam clicáveis e abrem em outra aba; menção fica para depois), aula relacionada opcional ("em <aula>", só uma aula que a pessoa pode assistir), até **4 imagens** (JPG, PNG ou WebP até **5 MB**) e **2 PDFs** (até **20 MB**), e enquete opcional (pergunta + **2 a 6 opções**, **voto único que pode ser trocado** até o encerramento opcional). Só o autor edita o texto (aparece "editado"); anexos e enquete não se editam. O autor ou a equipe removem (modal block); os anexos saem junto.
- **Comportamento esperado**: HTML digitado aparece como texto, nunca executa; arquivo fora da lista, maior que o limite, de outra pessoa ou já usado é recusado; voto depois do encerramento é recusado.
- **Impacto se descumprida**: XSS/golpe por link disfarçado, arquivo perigoso na área, enquete fraudada.

### RN-132 - Comentários, curtidas e moderação — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Comunidade / Player (aba Comentários) / Admin
- **Descricao**: Comentário (texto puro 1 a 2000) em publicação ou em AULA (visível a quem pode assistir a aula), com **um nível de resposta** (responder a uma resposta vai para o mesmo comentário principal). Autor edita e remove; remover o comentário principal leva as respostas. Curtida em publicação ou comentário: **uma por pessoa** (curtir de novo descurte). A equipe **fixa** publicações, **oculta/reexibe com motivo** (o autor continua vendo, com o motivo; os outros alunos não) e remove. Qualquer membro **denuncia** publicação ou comentário de outra pessoa (motivo; uma vez por item) e a equipe vê a **fila de denúncias** para resolver ou descartar. A equipe **silencia um aluno por 1 a 365 dias** (não publica, não comenta, não edita; ainda lê, curte e vota). Equipe não é silenciada.
- **Comportamento esperado**: tudo com trava de colisão e na trilha (quem, o quê, quando).
- **Impacto se descumprida**: comunidade sem controle, conteúdo ofensivo sem resposta, aluno silenciado publicando.

### RN-133 - Limite de frequência na comunidade — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Comunidade
- **Descricao**: Por pessoa, numa janela de 10 minutos: no máximo **5 publicações**, **20 comentários** e **12 envios de anexo**. Apagar não devolve a cota.
- **Comportamento esperado**: o excedente recebe "Você publicou muitas vezes em pouco tempo. Aguarde alguns minutos e tente de novo." e nada é gravado.
- **Impacto se descumprida**: spam e enxurrada de notificações.

### RN-134 - Notificações — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Sino (área do aluno e admin)
- **Descricao**: Notificação dentro do sistema (sem e-mail) para: comentário na minha publicação; resposta ao meu comentário; curtidas na minha publicação (**agrupadas: uma por publicação por dia**, "Ana e mais 3 curtiram"); aviso novo no canal de avisos e publicação fixada (para quem vê o canal); **aula nova** (o vídeo ficou pronto) em curso em que estou matriculado; certificado emitido; matrícula nova; denúncia nova (só equipe). Nunca para quem causou o evento. Não lida/lida, "marcar todas como lidas", contador no sino (atualiza a cada ~1 minuto, "99+" no teto). Notificações com mais de **90 dias** somem da lista (arquivadas, não apagadas). Tentativa de avaliação corrigida não notifica (o resultado aparece na hora). Preferência por tipo fica para depois.
- **Comportamento esperado**: a notificação nunca derruba a ação que a gerou; nada de dado pessoal além do primeiro nome de quem agiu e do nome do curso/aula/canal.
- **Impacto se descumprida**: aluno sem saber que responderam, ou notificação vazando conteúdo de quem não deveria ver.

### RN-135 - Construtor da vitrine: rascunho, publicar, histórico — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório, SISTEMA.md §6)
- **Data**: 2026-10-14
- **Modulo**: Construtor da vitrine (`/admin/construtor`)
- **Descricao**: DONO e ADMIN editam UM rascunho por área, salvo sozinho 0,8 s depois de cada mudança. **Publicar** (modal de 3 s com o resumo do que muda) cria a versão n+1 e todos os alunos passam a vê-la na hora. O **histórico** lista cada versão (número, quem, quando); **Reverter** traz uma versão para o rascunho sem publicar; **Descartar alterações** volta o rascunho para o que está no ar. Versão publicada nunca muda. Remover fileira, reverter e descartar também pedem o modal de 3 s.
- **Comportamento esperado**: indicador "Publicado · versão N" (verde), "Alterações não publicadas" (dourado) ou "Vitrine padrão" (nada publicado ainda). Duas pessoas editando: a segunda gravação é recusada com "Outra pessoa alterou a vitrine. Recarregue a página".
- **Impacto se descumprida**: aluno vendo vitrine pela metade, ou edição de uma pessoa apagando a de outra.

### RN-136 - Fileiras da vitrine — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Vitrine do aluno (`/`)
- **Descricao**: cada fileira tem título (`{nome}` = primeiro nome do aluno), tipo (Continuar assistindo, Top 10, Novidades, Trilhas, Mentorias, Minha lista, Escolha manual), quantidade (3, 5, 7 ou 10), ordenação (só Mentorias escolhe: mais recentes ou mais assistidas nos últimos 30 dias; as outras têm ordem natural), quem vê (todos ou alunos de ao menos um grupo escolhido; a equipe vê todas) e visível. Escolha manual: até 10 cursos/aulas, cada aluno só vê os que pode abrir (curso fora de rascunho; aula com matrícula valendo e liberada). Sem nada publicado valem as 6 fileiras padrão e o destaque automático.
- **Comportamento esperado**: fileira sem itens para aquele aluno não aparece; destaque cujo curso/aula sumiu perde o botão em vez de quebrar.
- **Impacto se descumprida**: aluno vendo conteúdo que não pode abrir, ou fileira vazia na tela.

### RN-137 - Destaque da vitrine — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Vitrine do aluno (`/`)
- **Descricao**: imagem enviada (ou a capa 16:9 do curso em destaque), selo (automático = nº de aulas do curso, texto livre ou nenhum), título, descrição, botão principal e secundário (abrir curso, abrir aula, continuar de onde o aluno parou num curso ou em qualquer curso, link interno começando com `/`) e avisos do canto (última novidade e a aula nº 1 do Top 10). Curso em destaque = o do primeiro botão que aponta para curso/aula; a linha "Curso online • duração" e "Continue de onde parou" saem dele.
- **Comportamento esperado**: link externo é recusado; o botão "continuar" leva à próxima aula do aluno.
- **Impacto se descumprida**: botão levando para fora da área ou para página quebrada.

### RN-138 - Player configurado no construtor — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Player da aula (`/aula/[id]`)
- **Descricao**: a aba "Player da aula" liga/desliga as abas Descrição, Materiais, Comentários e Anotações, a lista de aulas lateral, a reprodução automática (vale só se o aluno também quiser, no Perfil), o controle de velocidade, os marcadores de capítulo e o aviso "Faltam N aulas para o seu certificado" (só para aluno matriculado, enquanto faltar aula). Vale o que está PUBLICADO; sem publicação, o player de antes (todas as abas, aviso desligado).
- **Comportamento esperado**: desligar Comentários esconde a aba e não carrega os comentários.
- **Impacto se descumprida**: recurso desligado aparecendo para o aluno.

### RN-139 - Analytics do admin — definições das métricas (PADRÃO aguardando o cliente)
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Admin > Analytics (`/admin/analytics`, DONO e ADMIN)
- **Descricao**: Só alunos (vínculo vivo com papel ALUNO) entram; a equipe nunca conta. Período escolhido no mesmo calendário do painel (RN-122: até 366 dias, dias de Brasília, nada depois do último dia conta), comparado com os N dias imediatamente anteriores. Os gráficos de alunos ativos e visualizações são por dia até 92 dias e por semana acima disso. **Alunos ativos** = alunos distintos com dia de atividade de aula; com filtro de curso, os que tiveram batida no curso no período, sem comparação (o progresso guarda só a última batida). **Horas assistidas** = segundos ÚNICOS NOVOS assistidos por dia (rever um trecho não soma), no período e no anterior; contados a partir de 14/10/2026 (migração 0009 — dias antes disso valem 0). Com filtro de curso: segundos únicos ACUMULADOS desde o início nas aulas do curso, sem comparação (o registro diário não guarda a aula). **Aulas concluídas** = conclusões no período. **Conclusão de cursos** = matrículas valendo concluídas ÷ matrículas valendo (hoje) + cursos concluídos no período. **Aprovação** = pares (aluno, avaliação) com ao menos uma tentativa aprovada ÷ pares com tentativa finalizada no período (variação em pontos percentuais). **Abandono da aula** = alunos que começaram e não concluíram (abaixo de 90%) ÷ alunos que começaram (situação de hoje, só módulos publicados). **Retenção** = coortes pela semana (segunda a domingo) da PRIMEIRA matrícula, últimas 8 semanas; % da coorte com atividade em qualquer aula N semanas depois; coorte com menos de 5 alunos é "amostra pequena". **Avaliações** = tentativas finalizadas no período; nota média das tentativas; top 3 questões pelo número de erros.
- **Comportamento esperado**: número sem base vira "—", nunca "0%"; o que não tem recorte por período ou por curso é dito na tela ("acumulado", "indisponível por curso"). O CSV de cada aba sai só com agregados (nenhum nome, e-mail ou id de pessoa).
- **Impacto se descumprida**: decisão de conteúdo tomada em cima de número que não significa o que o rótulo diz.

### RN-140 - Logs da área: o que a trilha mostra e o que nunca mostra
- **Definida por**: Bah! Tech
- **Data**: 2026-10-14
- **Modulo**: Admin > Configurações > Logs (`/admin/configuracoes/logs`, só DONO)
- **Descricao**: O DONO vê a trilha de auditoria da PRÓPRIA área (quem, ação, entidade, registro, quando), com filtros por pessoa (nome), ação, entidade e período (calendário com início e fim, em dias de Brasília; sem período escolhido = desde o início) e paginação "mais antigos" por cursor. A aba **Excluídos** lista as exclusões lógicas (quem excluiu, quando e o que era: o título entre aspas do registro). A tela é só leitura: a trilha é append-only (sem editar, sem apagar). Decisão de privacidade: só o texto `detalhes` sai, e mascarado — e-mail vira `p•••@dominio`, IP perde o último bloco, sequência longa com cara de token/hash/segredo e `token=`/`senha:` viram "[oculto]"; os campos `dados_anteriores`/`dados_novos` nunca saem. Quem fez aparece pelo nome (sem e-mail); evento sem conta aparece como "Anônimo".
- **Comportamento esperado**: evento de outra área ou da plataforma nunca aparece; ADMIN e ALUNO recebem 403.
- **Impacto se descumprida**: vazamento de e-mail de terceiros, IP ou segredo para quem administra a área.

### RN-141 - Nome, endereço e domínio da área
- **Definida por**: Bah! Tech
- **Data**: 2026-10-14
- **Modulo**: Admin > Configurações > Geral e Domínios (só DONO)
- **Descricao**: O DONO renomeia a área (2 a 80 caracteres, trava de colisão, trilha com antes/depois). O endereço `<slug>.<domínio da plataforma>` é somente leitura (trocar quebraria links, sessões e certificados). Fuso `America/Sao_Paulo` e idioma `pt-BR` são fixos da plataforma. **Domínio próprio fica "Em breve"**: a coluna existe, mas nada grava por enquanto — ligar exige DNS (CNAME) e certificado HTTPS na infraestrutura e o host passar a resolver o domínio (hoje responde 404).
- **Comportamento esperado**: nenhuma tela promete um domínio que ainda não responde.
- **Impacto se descumprida**: aluno perde o acesso por um endereço que não funciona.

### RN-142 - Eventos ao vivo: cadastro, público e link — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Admin > Eventos (DONO e ADMIN) e área do aluno (`/eventos`)
- **Descricao**: DONO e ADMIN cadastram encontros ao vivo: título (3 a 120), descrição em texto puro (até 2.000), início (data e hora de Brasília), duração (5 a 720 min), link da sala **https** (Zoom, Meet, YouTube...; obrigatório para publicar), situação **Rascunho → Publicado → Cancelado**, público (**todos os alunos**, **só os matriculados de um curso** — matrícula valendo — ou **grupos escolhidos**) e, depois, a **gravação** (uma aula do catálogo). O aluno vê os eventos publicados e cancelados do seu público (rascunho nunca). **O link só aparece de 15 minutos antes do início até o fim (início + duração)**; antes, contagem regressiva; depois, "encerrado" e "assistir à gravação" se houver (a aula segue as regras de acesso dela). Cancelado continua na lista, sem link.
- **Comportamento esperado**: o link nunca vai para a página fora da janela nem para quem não é do público; link sem https é recusado; edição com trava de colisão; toda escrita na trilha.
- **Impacto se descumprida**: link da sala circulando antes da hora ou para quem não pagou.

### RN-143 - Eventos ao vivo: presença e avisos — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Área do aluno (`/eventos`), sino
- **Descricao**: O aluno do público confirma presença ("Vou participar") num evento publicado que ainda não terminou e pode desconfirmar até o fim (uma confirmação valendo por pessoa; o histórico fica). Avisos no sino: **ao publicar**, para os alunos do público; **1 hora antes**, lembrete para quem confirmou e está com "Lembretes" ligado no Perfil; **ao cancelar**, para quem confirmou. Mudar o horário de um evento publicado reprograma o lembrete (o do horário antigo não sai). Quem confirma na última hora ou evento publicado com menos de 1 h de antecedência fica sem lembrete.
- **Comportamento esperado**: nunca dois lembretes do mesmo horário para a mesma pessoa; lembrete de evento cancelado ou já terminado não sai.
- **Impacto se descumprida**: aluno perde o encontro, ou recebe aviso de encontro que não vai acontecer.

### RN-144 - Gamificação: configuração e níveis — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Admin > Configurações > Gamificação (só DONO)
- **Descricao**: Por área, **desligada por padrão**. Ligar ou desligar pede confirmação (modal de 3 s). Pontos por ação (0 a 10.000; 0 = não pontua): **aula concluída 10**, **curso concluído 100**, **avaliação aprovada 30** (a primeira aprovação de cada avaliação), **primeira publicação do dia na comunidade 2**, **desafio concluído = bônus do desafio**. Níveis (1 a 10, nome de 2 a 30 caracteres, o primeiro em 0, mínimos crescentes): **Iniciante 0, Aprendiz 100, Praticante 300, Líder 700, Referência 1500**. Só alunos pontuam (a equipe não). **Ligar a gamificação calcula os pontos de tudo o que o aluno já fez** (retroativo, pela data em que aconteceu). Mudar o valor de uma ação vale dali em diante (o que já foi lançado fica).
- **Comportamento esperado**: desligada, nenhum ponto novo é lançado e o ranking some da área do aluno; trava de colisão e trilha na configuração.
- **Impacto se descumprida**: pontos que mudam sozinhos ou que dependem de quando a área ligou a gamificação.

### RN-145 - Pontos: lançamentos, idempotência e ajuste manual
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Gamificação (razão de pontos)
- **Descricao**: Cada ponto é um **lançamento** com motivo, valor, referência (a aula, o curso, a avaliação, o desafio ou o dia) e a data do fato. O mesmo fato **nunca pontua duas vezes** (repetir, reprocessar ou recalcular não muda nada). Lançamento nunca é alterado nem apagado. **Ajuste manual** só por DONO ou ADMIN, só para alunos, positivo ou negativo (nunca zero), com **justificativa de 5 a 500 caracteres**, autor e trilha; corrigir um ajuste = outro ajuste com o sinal contrário. Saldo = soma dos lançamentos (pode ficar negativo por ajuste; o nível não desce do primeiro).
- **Comportamento esperado**: o aluno vê o extrato (motivo, pontos, quando); a equipe vê quem ajustou e por quê.
- **Impacto se descumprida**: pontos em dobro, ou correção sem rastro de quem fez.

### RN-146 - Ranking — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Área do aluno (ranking, perfil)
- **Descricao**: Ranking da área por **semana** (segunda 00:00 a domingo, Brasília), **mês** (desde o dia 1) e **total**, somando os pontos pela data em que cada fato aconteceu. Só alunos ativos com saldo positivo no período; empate = mesma posição. O aluno pode **sair do ranking** no Perfil ("Aparecer no ranking", ligado por padrão; vale em todas as áreas, como "Lembretes"): some da lista dos outros e não tem posição, mas continua vendo os próprios pontos e nível.
- **Comportamento esperado**: nada de outra área aparece; a lista pode ficar alguns minutos atrasada (cache).
- **Impacto se descumprida**: aluno exposto contra a vontade, ou ranking que mistura áreas.

### RN-147 - Desafios — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Admin > Gamificação > Desafios (DONO e ADMIN) e área do aluno
- **Descricao**: Desafio = título, descrição, **início e fim**, meta (**concluir N aulas**, **concluir um curso**, **ser aprovado numa avaliação** ou **N publicações na comunidade**), bônus em pontos (0 a 10.000), recompensa opcional em texto (ex.: "Mentoria individual de 30 min"), situação **Rascunho → Publicado → Encerrado** (encerrar antes do fim para tudo) e público (todos ou grupos, como os eventos). O aluno do público clica **Participar** até o fim. O progresso conta só o que ele fez **entre o início e o fim** (mesmo antes de clicar em Participar); publicação removida ou oculta não conta. Ao alcançar a meta o desafio fica **concluído** e o bônus entra uma única vez; a equipe marca quando **entregou a recompensa**.
- **Comportamento esperado**: progresso sempre recalculado dos dados (nunca um contador que diverge); desafio encerrado não conclui ninguém.
- **Impacto se descumprida**: bônus em dobro, recompensa prometida e não registrada, ou desafio que conta atividade fora do prazo.

### RN-160 - Eventos ao vivo: ciclo na tela da equipe — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Admin > Eventos (DONO e ADMIN) e área do aluno (`/eventos`)
- **Descricao**: Todo evento nasce **rascunho** (o link pode ficar para depois). **Publicar** exige o link e que o encontro ainda não tenha terminado, e passa por confirmação de 3 s (avisa o público). Rascunho se **exclui** (exclusão lógica); publicado não se exclui: se **cancela** antes do fim, também com confirmação de 3 s (avisa quem confirmou), e cancelado fica só para consulta. Evento publicado continua editável (inclusive a gravação depois do fim); mudar o público de um evento publicado e não terminado avisa só quem **passou** a vê-lo. O aluno baixa um arquivo de agenda (`.ics`) com data, hora e o endereço da página do encontro, nunca o link da sala. No celular, o caminho até os encontros é o cartão "Próximo encontro ao vivo" no topo da Comunidade e os avisos do sino (a barra inferior tem 5 abas fixas).
- **Comportamento esperado**: ninguém recebe aviso de um rascunho; nenhum aviso repetido para a mesma pessoa; toda mudança na trilha de auditoria.
- **Impacto se descumprida**: aluno avisado de encontro que não existe, ou encontro sumindo da lista de quem já tinha confirmado.

### RN-180 - Legendas e transcrição da aula
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Admin > Conteúdos > editor da aula (seção Legendas, DONO e ADMIN), Estúdio de vídeo e player do aluno
- **Descricao**: A equipe envia a legenda da aula em **VTT ou SRT até 2 MB** (UTF-8, ou o "ANSI"/Windows-1252 do Bloco de Notas, convertido), com **idioma** (`pt-BR` padrão; `en`, `es`, `es-419`...) e o **nome no player** ("Português"). Uma legenda por idioma em cada aula: **Trocar** guarda a anterior no histórico (exclusão lógica); **Remover** pede a confirmação de 3 s. O sistema confere a estrutura, os tempos (fim depois do início, inícios em ordem crescente, nada além do fim do vídeo + 10 s), limita 20.000 trechos e 1.000 caracteres por trecho, converte SRT em VTT e **tira toda formatação e tag** (`<i>`, `<b>`, cor, voz, posição): o aluno vê só o texto. O texto puro (sem tempos) fica guardado para busca e para a futura Base de conhecimento. No player, o botão **CC** (ou a tecla **C**) liga e desliga; com mais de um idioma, vira menu. A escolha é lembrada **por pessoa neste navegador**. Com legenda, a página da aula ganha a aba **Transcrição**: os trechos com o tempo, clique leva o vídeo ao ponto, o trecho que toca fica destacado e há busca (sem diferenciar acento). O Estúdio mostra os idiomas de legenda de cada vídeo.
- **Comportamento esperado**: o `.vtt` só sai para quem pode assistir a aula (mesma regra do vídeo); legenda de outro criador não existe; toda mudança na trilha (sem o conteúdo inteiro).
- **Impacto se descumprida**: legenda de outra aula (tempos errados), script ou HTML entrando pelo arquivo, transcrição de curso pago vazando para quem não comprou.

### RN-190 - Base de conhecimento: fontes — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Admin > Inteligência artificial > Base de conhecimento (DONO e ADMIN)
- **Descricao**: A base se monta sozinha com a **transcrição** de cada aula (a legenda em português; sem ela, a primeira legenda enviada), a **descrição de cada aula** e a **descrição de cada curso**; a equipe escreve **textos** (FAQ, política de certificados, sobre o professor), para todos os alunos ou só para quem tem um curso. Cada fonte é dividida em trechos de cerca de mil caracteres; a transcrição guarda o minuto de cada trecho. Mudou a legenda, a aula ou o curso: a base se atualiza em segundos; aula, curso ou descrição removidos saem da base. Qualquer fonte pode ser **desligada** (fica na lista, o assistente não usa). Excluir texto pede a confirmação de 3 s (exclusão lógica). PDFs dos materiais ainda **não** entram.
- **Comportamento esperado**: a lista mostra tipo, título, curso, trechos, data e se está incluída, com filtro por tipo e curso; toda mudança da equipe na trilha (sem o texto inteiro).
- **Impacto se descumprida**: assistente respondendo com conteúdo velho ou apagado, ou com texto que a equipe tirou do ar.

### RN-191 - O assistente só usa o que o aluno pode ver
- **Definida por**: Bah! Tech
- **Data**: 2026-10-14
- **Modulo**: Assistente do professor (aula e `/assistente`) e "Testar busca"
- **Descricao**: Para cada pergunta, o sistema escolhe os trechos mais parecidos (até 6, no máximo 3 da mesma fonte) **somente** entre os cursos em que o aluno tem matrícula valendo agora, curso publicado, módulo publicado e aula liberada para ele (liberação programada, avaliação que libera o módulo e pré-requisito — a mesma regra de assistir o vídeo), mais os textos da equipe para todos. Fonte desligada e cursos fora da lista do assistente não entram. Só esses trechos vão ao modelo. "Testar busca" mostra à equipe exatamente o que iria.
- **Comportamento esperado**: aluno sem o curso nunca recebe nada dele, nem citado nem parafraseado; matrícula expirada deixa de valer na hora.
- **Impacto se descumprida**: conteúdo pago vazando por dentro de uma resposta.

### RN-192 - Respostas com fonte, ou "não sei"
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Assistente do professor
- **Descricao**: A resposta cita cada informação com um número que leva à fonte: na aula, abre o vídeo no minuto do trecho (`?t=`). Se nenhum trecho combina com a pergunta, a resposta é fixa ("não encontrei isso nas aulas... pergunte na Comunidade") **sem chamar a IA**; se os trechos não respondem, o assistente diz que não encontrou. Resposta sem nenhuma fonte citada conta como **sem resposta**. Ele não revela suas instruções, não fala de outros alunos, notas ou pagamentos e não dá conselho médico, jurídico ou financeiro individual. A resposta é exibida como texto (parágrafos e listas simples).
- **Comportamento esperado**: nada inventado; sempre o caminho para conferir na aula.
- **Impacto se descumprida**: aluno decorando resposta errada atribuída ao professor.

### RN-193 - Configuração do assistente — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Admin > Inteligência artificial > Assistente do professor (DONO e ADMIN)
- **Descricao**: Nasce **desligado**. A equipe liga/desliga, dá o **nome** (2 a 60 caracteres), escreve as **instruções de tom** (até 800 caracteres; só estilo, não mudam as regras da RN-192), define o **limite de perguntas por aluno por dia** (padrão 20, de 1 a 200) e os **cursos em que aparece** (todos ou os escolhidos). "Testar" conversa como um aluno com acesso a todos esses cursos, mesmo desligado. Sem a chave da IA configurada no servidor, as telas mostram "IA não configurada" e o aluno não vê o assistente.
- **Comportamento esperado**: salvar com trava de edição simultânea e na trilha.
- **Impacto se descumprida**: assistente aparecendo em curso que a equipe não preparou.

### RN-194 - Limites de uso e custo
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Assistente do professor
- **Descricao**: Cada aluno faz no máximo o limite configurado de perguntas por **dia de Brasília**; a equipe não tem limite próprio. Cada área tem um **teto diário** de perguntas (padrão 500, ajustável pela operação da plataforma) que vale para todos, inclusive a equipe. Apagar uma conversa **não** devolve perguntas do dia. Ao chegar ao limite, o aluno vê a mensagem e a sugestão de usar a Comunidade.
- **Comportamento esperado**: a pergunta além do limite é recusada mesmo com cliques simultâneos.
- **Impacto se descumprida**: conta da IA sem teto.

### RN-195 - Conversas do aluno e privacidade
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Aula ("Pergunte ao professor") e `/assistente`
- **Descricao**: A aba "Pergunte ao professor" aparece na aula para quem pode assisti-la, com o assistente ligado no curso; ela retoma a última conversa começada naquela aula. `/assistente` lista as conversas da própria pessoa (só ela vê) e permite **apagar** uma conversa (confirmação de 3 s, exclusão lógica). Aviso visível: "Suas perguntas podem ser lidas pela equipe para melhorar o curso." Sair no meio da resposta interrompe a IA e guarda o que já tinha chegado.
- **Comportamento esperado**: nenhum aluno vê conversa de outro; conversa apagada some para a equipe também.
- **Impacto se descumprida**: exposição de dúvidas pessoais.

### RN-196 - Perguntas recentes e sem resposta
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Admin > Assistente do professor > Perguntas
- **Descricao**: A equipe vê as 50 perguntas mais recentes dos alunos (sem os testes da equipe), com aluno, aula, data e quantas fontes a resposta citou, e o filtro **Sem resposta na base**: o que os alunos perguntaram e o conteúdo não cobria — ponto de partida para um texto ou uma aula.
- **Comportamento esperado**: só conversas não apagadas.
- **Impacto se descumprida**: professor sem saber o que falta no curso.

### RN-197 - Consumo do assistente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-14
- **Modulo**: Admin > Assistente do professor > Consumo
- **Descricao**: Respostas, sem resposta, tokens de entrada e saída e **custo estimado em dólar** por dia (últimos 30) e por mês (últimos 6), contando os testes da equipe e as conversas apagadas. A estimativa usa a tabela pública de preços da Anthropic; a cobrança real é a fatura dela. Resposta sem trecho na base custa zero.
- **Comportamento esperado**: números calculados das mensagens gravadas (nada de contador que diverge).
- **Impacto se descumprida**: surpresa na fatura.

### RN-200 - Tags de membros — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-17
- **Modulo**: Admin > Membros > Tags (DONO e ADMIN)
- **Descricao**: A equipe cria **tags** (nome de até 40 caracteres, único na área sem diferenciar maiúsculas, e uma cor) e marca um ou vários membros de uma vez (marcar quem já tem não muda nada). A lista de membros filtra por tag e mostra as tags de cada pessoa. Tag só organiza: **não libera curso, canal nem conteúdo** (isso é grupo). Editar usa a versão aberta (outra pessoa mexeu = "recarregue"). Excluir a tag pede a confirmação de 3 s e tira a tag de todos os membros; o nome fica livre de novo.
- **Comportamento esperado**: contagem de membros por tag; toda mudança na trilha.
- **Impacto se descumprida**: equipe misturando tag com permissão; tags duplicadas ("VIP" e "vip").

### RN-201 - Vouchers — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-17
- **Modulo**: Admin > Membros > Vouchers (DONO e ADMIN) e resgate pelo aluno
- **Descricao**: Um voucher é um **código** que dá matrícula em um ou mais cursos. Código de 6 a 16 letras e números **sem 0, O, 1 e I** (o gerado pelo sistema tem 8); o aluno pode digitar com minúsculas, espaço ou hífen. Único na área; não muda depois de criado. Tem descrição, **validade** opcional, **limite total de usos** opcional, **limite por pessoa** (padrão 1) e **dias de acesso** da matrícula gerada (vazio = sem expiração). Situação **ATIVO**, **PAUSADO** (volta a ativo) ou **ENCERRADO** (final). Resgate: confere situação, validade e limites com o voucher travado (dois resgates ao mesmo tempo nunca passam do limite) e matricula em cada curso (origem "Voucher"); quem já tem um dos cursos valendo fica como está nesse curso; quem já tem **todos** recebe "você já tem acesso" sem gastar uso. Voucher com resgate não se exclui: encerre.
- **Comportamento esperado**: lista com usos, cursos e "Expirado" quando a validade passou; resgates com quem, quando e as matrículas; trilha de criar, editar, mudar situação e resgatar.
- **Impacto se descumprida**: código vazado sendo usado além do combinado; matrícula paga sobrescrita.

### RN-202 - Feedback de conteúdo — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-17
- **Modulo**: Aula do aluno (botão discreto) e Admin > Matrículas > Feedbacks de conteúdo
- **Descricao**: O aluno diz se a aula foi **útil** ou **não útil**, com um comentário opcional de até 500 caracteres (texto puro). Uma avaliação por aluno por aula: mudar de ideia substitui a anterior; ele pode tirar a avaliação. Só aluno com acesso à aula avalia (a prévia da equipe não conta). A equipe vê a lista (mais recentes primeiro; filtros por curso, aula, útil/não útil e "só com comentário") e o resumo por aula com o **% de útil** (a "média"), piores primeiro.
- **Comportamento esperado**: comentário sempre exibido como texto; números calculados das avaliações vivas.
- **Impacto se descumprida**: estatística distorcida pela equipe; HTML do aluno na tela da equipe.

### RN-203 - Disparos de e-mails
- **Definida por**: Bah! Tech
- **Data**: 2026-10-17
- **Modulo**: Admin > Configurações > Disparos de e-mails (só DONO)
- **Descricao**: Cada e-mail que o sistema tenta mandar (definir senha, primeiro acesso, aviso de segurança) vira um registro com tipo, **destinatário mascarado** (`pa***@gm***.com`), assunto, situação (**Enviado**, **Falhou** com o código do erro, **Não configurado** quando o SMTP não está ligado) e data. O corpo nunca é guardado (leva link com token). A busca por destinatário exige o **e-mail completo** (compara um código derivado do endereço, não o endereço). O registro não pode ser alterado nem apagado.
- **Comportamento esperado**: resumo dos últimos 30 dias por situação; só os da própria área.
- **Impacto se descumprida**: suporte sem saber se o e-mail saiu; dado pessoal em claro num registro que não se apaga.

### RN-204 - Integrações e webhooks
- **Definida por**: Bah! Tech
- **Data**: 2026-10-17
- **Modulo**: Admin > Configurações > Integrações e webhooks (só DONO)
- **Descricao**: O dono cadastra até **10 endereços https** que recebem eventos: matrícula criada (inclui reativada e por voucher), matrícula cancelada, aula concluída, curso concluído, certificado emitido, avaliação aprovada, membro cadastrado. Cada webhook tem nome, eventos escolhidos e situação (**ativo**/**pausado**). O **segredo** de assinatura aparece **uma única vez** ao criar ou ao trocar (o antigo para de valer na hora); depois só os 4 últimos caracteres. Cada envio leva a assinatura HMAC-SHA256 no cabeçalho `X-Lider-Assinatura` (`t=<unix>,v1=<hex>` do texto `<t>.<corpo>`), o evento e o id da entrega. Falhou (sem resposta em 5 s, erro, redirecionamento ou status fora de 2xx): até 8 tentativas em cerca de 1 hora; depois "Falhou" e pode ser **reenviada**. Endereços internos (localhost, rede privada, metadados da nuvem) são recusados sempre. O corpo leva id, nome e e-mail da pessoa e os dados do curso/aula.
- **Comportamento esperado**: lista de entregas com evento, situação, status HTTP, tentativas, próxima tentativa e erro resumido; criar, editar, pausar, trocar segredo e excluir na trilha (sem o segredo).
- **Impacto se descumprida**: dado de aluno enviado para lugar errado; servidor da plataforma usado para atacar a rede interna.

### RN-205 - Abas de acompanhamento (Matrículas, Continuar, Estúdio)
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-17
- **Modulo**: Admin > Matrículas (Progresso, Avaliações, Tentativas extras), Aluno > Continuar (Anotações, Turmas), Admin > Estúdio de vídeo (Estatísticas)
- **Descricao**: **Progresso**: por aluno e curso (matrículas ativas), aulas concluídas de aulas publicadas, %, última atividade e conclusão. **Avaliações**: tentativas dos alunos com nota, aprovada/reprovada ou em andamento. **Tentativas extras** (no lugar de "Correção": as avaliações são objetivas e corrigidas na hora): quem esgotou as tentativas sem aprovar, para a equipe conceder nova chance, e o histórico de concessões (quem, quanto, por quê, quem deu). **Anotações**: todas as anotações do próprio aluno por curso e aula, com o minuto. **Turmas**: os grupos em que o aluno está. **Estatísticas** por vídeo pronto: visualizações no período (padrão 30 dias), pessoas que abriram, minutos assistidos (segundos únicos por pessoa), retenção média (% assistido) e conclusões.
- **Comportamento esperado**: só dados da própria área; aluno só vê o que é dele.
- **Impacto se descumprida**: equipe decidindo com número errado; aluno vendo dado de outro.

### RN-206 - IA no Estúdio de vídeo — PADRÃO aguardando o cliente
- **Definida por**: Bah! Tech (padrão provisório)
- **Data**: 2026-10-17
- **Modulo**: Admin > Estúdio de vídeo > IA (DONO e ADMIN)
- **Descricao**: Com a **legenda** enviada, a equipe pede à IA (Claude) uma **descrição** da aula, **capítulos** com o minuto e **3 a 5 perguntas** de múltipla escolha (4 opções, uma certa, com explicação). Nada muda sozinho: a equipe revisa e **aplica cada parte** — a descrição e os capítulos substituem os da aula (se alguém editou a aula nesse meio tempo, "recarregue"); as perguntas escolhidas entram no fim de uma avaliação **do mesmo curso**. Sem o arquivo da legenda no armazenamento não há capítulos (o minuto seria inventado). Até **30 gerações por dia** por área, contando as descartadas; cada geração guarda os tokens e o custo estimado. Resposta fora do formato é descartada com aviso.
- **Comportamento esperado**: sugestões mais recentes primeiro com o que já foi aplicado; descartar some da lista; toda geração e aplicação na trilha.
- **Impacto se descumprida**: conteúdo inventado publicado sem revisão; custo sem teto.

<!-- Exemplo de registro: -->

<!--
### RN-100 - [Titulo]
- **Definida por**: [Cliente]
- **Data**: [YYYY-MM-DD]
- **Modulo**: [Modulo]
- **Descricao**: [Descricao]
- **Comportamento esperado**: [Comportamento]
- **Impacto se descumprida**: [Impacto]
-->
