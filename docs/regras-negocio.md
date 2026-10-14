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
- **Descricao**: Cada criador tem área própria em `<slug>.liderdeimpacto.com.br`. A pessoa tem UMA conta (e-mail e senha) que vale em qualquer criador em que tenha vínculo ativo; cada área tem a sua sessão (cookie por host, ADR-0003).
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
