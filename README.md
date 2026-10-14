# Handoff: Sistema de Aulas · Líder de Impacto (Valmer Albuquerque)

## Overview
Plataforma de área de membros / ensino online (referência funcional: Waid), com três frentes:
1. **Área do aluno**: vitrine estilo streaming, cursos, player, trilhas, avaliações, comunidade, certificados, perfil.
2. **Painel admin**: dashboard, conteúdos, membros, matrículas, avaliações, certificados, financeiro, marketing, configurações e o **Construtor da vitrine** (monta o que o aluno vê).
3. **Responsivo**: tudo funciona em desktop e mobile (bottom tab bar no mobile).

Leia também `docs/SISTEMA.md` (módulos, modelo de dados, API, permissões, fases e prompt inicial para o Claude Code) e `docs/ARQUITETURA.md` (vídeo/player, infraestrutura, desempenho, custos, segurança e plano de entrega, com pesquisa de mercado) e `docs/ARQUITETURA_VPS.md` (alternativa de hospedar o vídeo na própria VPS: storage, transcodificação HLS, proteção, CDN e dimensionamento).

## About the Design Files
Os arquivos desta pasta são **referências de design feitas em HTML**: protótipos que mostram aparência e comportamento pretendidos, **não código de produção para copiar**. A tarefa é **recriar estes designs no ambiente do projeto real** (stack sugerida em `docs/SISTEMA.md`), usando os padrões e bibliotecas dessa stack. Não publicar o HTML do protótipo.

## Fidelity
**Alta fidelidade (hifi)** nas cores, tipografia, espaçamento e interações descritas. Dados (nomes, números, títulos de aulas) são exemplos. Imagens (capas, hero, foto do professor, frame do vídeo, logo) são **espaços vazios** a preencher com material real. O logo "LÍDER DE IMPACTO" é provisório (texto).

## Arquivos de referência
- `reference/Sistema de Aulas Lider de Impacto v3.dc.html`: **versão final** (vitrine estilo streaming + construtor). Usar como fonte principal.
- `reference/Sistema de Aulas Lider de Impacto v2.dc.html`: v2 (home anterior, em formato de hero + grid de cursos). Útil só como alternativa.
- `reference/image-slot.js`: componente de espaço de imagem do protótipo (não vai para produção).
- Abra o arquivo v3 no navegador. A barra superior do protótipo alterna as telas, o tema (Escuro/Claro) e Desktop/Mobile.

## Design Tokens

### Cores (CSS variables; tema alternável via `data-theme="dark|light"`)
| Token | Escuro | Claro |
|---|---|---|
| --bg | #0B0B0D | #F5F4EF |
| --surface | #15151A | #FFFFFF |
| --surface2 | #1E1E25 | #F0EEE7 |
| --border | #27272F | #E3E0D6 |
| --text | #F3EFE6 | #14131A |
| --muted | #9B98A3 | #6E6B78 |
| --accent (dourado) | #D9A441 | #B5842A |
| --accent-soft | rgba(217,164,65,.14) | rgba(181,132,42,.12) |
| --accent-ink (texto sobre accent) | #1A1205 | #FFFFFF |
| --ok | #3DBB7A | #1E9A5A |
| --warn | #E06B6B | #D14A4A |
| --shadow | 0 12px 40px rgba(0,0,0,.45) | 0 10px 30px rgba(20,19,26,.08) |

Hero e login sempre escuros (independem do tema): fundo #0B0B0D, texto #F8F0DC / #F3EFE6, overlay `linear-gradient(90deg,rgba(11,11,13,.9),rgba(11,11,13,.45) 50%,transparent 80%)` + `linear-gradient(0deg,rgba(11,11,13,.92),transparent 55%)`.

### Tipografia
- **Plus Jakarta Sans** 400/500/600/700/800: UI, corpo, botões, números do Top 10.
- **Newsreader** (serifada) 500/600/700: h1, h2, logo, título do hero (caixa alta). Peso 600 nos títulos, letter-spacing -.015em, line-height 1.08.
- Escala: hero título 84px desktop / 46px mobile; título de página 36-56px (curso 56/38); título de aula 38/28; título de seção (h2) 28px; título de fileira (h3, sans 700) 21/17px; corpo 14-15px; labels 12-13px; eyebrow 11-12px uppercase letter-spacing .1-.14em.
- Texto mínimo na UI: 11px (badges), 12px (metadados).

### Espaçamento / forma
- Padding lateral das telas: 40px desktop, 20px mobile. Padding vertical: 44px / 24px.
- Gap entre fileiras da vitrine: 34px desktop, 22px mobile.
- Raios: botões/inputs 9-10px, pílulas 999px, cards 14-18px, hero 22-24px, frame mobile 44px.
- Alvos de toque mobile >= 44px.
- Transições: botões .15s (background, border-color, transform); `:active` scale(.98); hover de card de fileira scale(1.04).

## Screens / Views

### Navegação global do aluno (desktop)
Header sticky, 68px, fundo `linear-gradient(180deg,var(--bg) 20%,transparent)` + blur(8px), sem borda. Esquerda: logo serifado dourado "LÍDER" + " IMPACTO" (cor text), 20px. Menu em texto: Início, Continuar, Trilhas, Avaliações, Comunidade, Certificados (item ativo em pílula bg surface2, texto text; inativos muted; 14px/600; padding 9x12). Direita: busca (ícone 22px), sino com contador dourado, avatar 36px (raio 8px, gradiente dourado) + seta. Menu rola horizontalmente com fade na borda quando estreito.
**Mobile**: header com logo, busca, sino, avatar; **bottom tab bar** 76px (5 abas: Início, Aulas, Trilhas, Comunidade, Perfil; ícone 22px + label 11px/700; ativa em dourado), sombra superior.

### 1. Login
Grid 2 colunas desktop (1.1fr / 1fr); mobile só o formulário. Esquerda (sempre escura): halos dourados radiais, logo, eyebrow "Formação executiva", h1 52px "Transformando líderes, gerando legado.", subtítulo, rodapé "Valmer Albuquerque · Área de membros". Direita: card 400px: h2 "Bem-vindo de volta", campos E-mail e Senha (48px de altura, raio 10), "Manter conectado", "Esqueci minha senha", botão "Entrar" (50px, dourado), "Primeiro acesso? Criar minha senha".

### 2. Home / Vitrine (estilo streaming)
- **Hero**: raio 22px, min-height 600px desktop / 520px mobile, imagem de fundo (slot) cobrindo tudo, overlays de gradiente, "LI" serifado dourado no topo esquerdo, botão de som circular no topo direito. Conteúdo no rodapé esquerdo: título caixa alta Newsreader 700 (84/46px, #F8F0DC, line-height .98), linha meta (Curso • Liderança • 2026 • 9h 25 + selo dourado "28 AULAS"), descrição (18/15px, max 560px), botões pílula 48px: **primário** dourado com ícone play ("Assistir") e **secundário** rgba(60,60,70,.75) "Mais informações". Canto inferior direito (só desktop): aviso de novidade (ícone megafone dourado) e selo "TOP 1".
- **Fileiras** (todas configuráveis no Construtor): título (h3) + scroller horizontal (scroll-snap, scrollbar oculta, sangra até as bordas da tela com scroll-padding igual ao padding lateral). Cards 16:9 de 280px (210px mobile), raio 10px, título 13px/700 + subtítulo 12px muted abaixo. Variações:
  - *Continue assistindo*: barra de progresso dourada 4px na base do card.
  - *Top 10*: card 3:4 de 128px (100px mobile) com numeral grande (Plus Jakarta 800, 168px/124px, letter-spacing -.06em, preenchimento = cor de fundo, contorno dourado 4px, `paint-order: stroke fill`) parcialmente atrás do card.
  - *Novidades*: selo dourado "Novo" no canto inferior esquerdo (raio 0 8px 0 0).
  - Trilhas, Mentorias gravadas, Minha lista: card simples.
  Fileiras padrão: Continue assistindo, Top 10 aulas da semana (selo TOP 10), Novidades na plataforma, Trilhas para você, Mentorias gravadas, Minha lista.

### 3. Continuar assistindo
Título h1 "Continuar aprendendo" + contador; tabs (Conteúdos, Favoritos, Anotações, Turmas), busca e filtro; grid de cards 16:9 com título em caixa alta, barra de progresso, "x/y aulas", botão "Acessar".

### 4. Página do curso
Grid 2 colunas desktop (conteúdo | 340px sticky). Esquerda: eyebrow, h1 56px, descrição, card de progresso com botão "Continuar · Aula 3.2", **acordeão de módulos** (número em quadrado 34px; estados Concluído / Em andamento (aberto, lista de aulas) / Bloqueado; aula com círculo de check dourado, título, duração). Direita: capa 3:4, card "Este curso inclui" (ícones), card do professor (avatar circular 56px).

### 5. Player da aula
Grid desktop: vídeo | playlist 340px sticky. Vídeo 16:9 raio 16, overlay de controles: barra de progresso 5px com bolinha e marcadores de capítulo, controles (anterior, play, próxima, tempo, velocidade 1.0x, legendas, tela cheia). Abaixo: eyebrow "Módulo 3 · Aula 2", título 38/28px, botões 46px ("Anterior" / "Concluir e avançar", full-width no mobile), faixa de capítulos, tabs (Descrição, Materiais, Comentários, Anotações), texto + anexos (PDF/DOC). Playlist lateral: módulos agrupados, aula atual destacada (bg accent-soft + borda esquerda dourada), check nas concluídas. No mobile a playlist vai abaixo.

### 6. Avaliações (aluno)
Lista de cards: ícone, título, curso/módulo, meta (questões, tempo, nota mínima), status (Concluída · 92% / Disponível / Bloqueada) e botão (Ver resultado / Iniciar / bloqueado).

### 7. Trilhas
Cards largos: tag, título, descrição, passos numerados conectados por linha (concluído = dourado), "x de y etapas · duração", CTA (Continuar / Iniciar / Rever).

### 8. Comunidade
3 colunas desktop (canais 220px | feed | lateral 280px), 1 coluna no mobile. Compositor (avatar, campo, Imagem/Enquete/Anexo, "Publicar"), filtro "Recentes", posts (avatar, nome, "há 15 dias · em <aula>", texto, curtidas, comentários, compartilhar). Lateral: próximo encontro ao vivo (data em bloco dourado), fixados, membros ativos com pontos.

### 9. Certificados
Grid de cards: prévia do certificado (proporção 1.414, "Certificamos que <nome> concluiu <curso>"), título, meta, botão "Baixar PDF". Bloqueado: overlay com blur "Conclua o curso para emitir" + barra de progresso.

### 10. Meu perfil
2 colunas (card 300px com avatar, estatísticas aulas/certificados/pontos | formulários). Dados pessoais, preferências (tema, lembretes, reprodução automática com toggles), "Alterar senha", "Salvar alterações".

### Painel admin
Layout: sidebar 240px (sticky, sem scrollbar) + conteúdo. Mobile: topbar com menu hambúrguer.
Sidebar: logo + badge ADMIN, busca (⌘K), itens com ícone 16px e badges (Novo / Em breve): Home, Área de membros | **Educação**: Conteúdos, Avaliações, Desafios, **Construtor da vitrine (Novo)**, Comunidade, Estúdio de vídeo | **Inteligência artificial**: Assistente do professor, Base de conhecimento | **Marketing**: Páginas, Funis, Automações, Campanhas, Eventos | **Relatórios**: Membros, Matrículas, Certificados, Analytics, Vendas e financeiro | rodapé: Configurações, Portal do cliente, "Ver como aluno", usuário.
- **Home (dashboard)**: saudação (h1 serif), seletor de período, 4 KPIs (receita, novos alunos, acessos, matrículas com taxa de conclusão), gráfico de barras de acessos (14 dias), feed "Acontecendo agora", conteúdos mais assistidos, saúde dos produtos.
- **Conteúdos**: tabela de produtos (capa, título, código, aulas, alunos, tipo, situação Publicado/Não listado, atualização), tabs, busca, filtros, "Novo produto".
- **Membros**: contadores, tabs (Membros, Grupos de acesso, Vouchers, Gamificação, Tags), busca, filtros ativos, tabela (membro, grupo, matrículas, criado em, último acesso em vermelho se "Nunca"), paginação, Exportar, Cadastrar.
- **Páginas genéricas de lista** (Avaliações, Desafios, Comunidade, Estúdio de vídeo, Matrículas, Certificados, Analytics, Páginas, Automações, Campanhas, Eventos): cabeçalho com estatística, tabs, busca, filtro, tabela com colunas definidas por tela, badges de status, barras de progresso.
- **Páginas de cards** (Área de membros, Vendas e financeiro, Configurações): grid de cards com ícone, título, descrição e seta.
- **Construtor da vitrine** (nova, essencial): ver abaixo.

### Construtor da vitrine (admin)
Cabeçalho com status ("Publicado" verde / "Alterações não publicadas" dourado), "Ver como aluno" e "Publicar". Abaixo, tabs **Vitrine | Player da aula** e alternância Desktop/Mobile da prévia.
- **Aba Vitrine**, 3 colunas (280px | prévia | 320px):
  - *Estrutura*: item "Destaque" + lista de fileiras (grip, título, tipo, botões subir/descer/ocultar), "Adicionar fileira". Arrastar para reordenar (no protótipo são botões; implementar drag-and-drop real).
  - *Prévia ao vivo*: mini-vitrine (hero + fileiras com cards, numerais no Top 10, barras de progresso, selos). Clicar em um bloco o seleciona (contorno dourado 2px).
  - *Propriedades*: **Destaque**: imagem de fundo, título, descrição, botão principal, botão secundário, toggle de avisos do canto. **Fileira**: título, tipo de conteúdo (Continuar assistindo, Top 10, Novidades, Trilhas, Mentorias, Minha lista), quantidade (3/5/7/10), ordenação (Manual / Mais recentes / Mais assistidos), quem vê (Todos / Grupo: Mentoria / Grupo: Autores), visível (toggle), remover.
- **Aba Player da aula**: toggles de: abas Descrição/Materiais/Comentários/Anotações, lista lateral de aulas, reprodução automática, controle de velocidade, marcadores de capítulo, aviso de certificado. Prévia do player reflete as opções.
- No protótipo, mudanças na vitrine refletem na Home do aluno. Em produção: rascunho x publicado, persistência no backend, e os toggles do player devem alterar o player real.

## Interactions & Behavior
- Troca de tema Escuro/Claro (preferência salva no perfil do usuário). Padrão: escuro.
- Navegação: clique em card/Assistir leva ao player; "Mais informações" leva à página do curso; sino abre notificações (a desenhar).
- Hover: cards de fileira escalam 1.04; botões trocam fundo suavemente; `:active` scale .98.
- Scroll horizontal das fileiras com snap; setas/teclado recomendados em produção.
- Player: progresso salvo a cada ~10s; concluir aula = >=90% assistido ou clique em "Concluir e avançar"; reprodução automática opcional com contagem de 5s.
- Estados a implementar (não desenhados no protótipo): loading (skeletons nos cards), vazio (fileira sem itens oculta), erro de login, validação de formulários (e-mail, senha mín. 8), bloqueios por pré-requisito.
- Responsivo: breakpoint principal ~900px. Abaixo: sidebar admin vira topbar+drawer, grids viram 1 coluna, nav do aluno vira bottom tab bar, hero reduz tipografia.

## State Management
Ver `docs/SISTEMA.md` (modelo de dados e API). Estado de UI relevante: tema, tela atual, vitrine (hero + lista de fileiras com tipo/título/qtd/ordem/audiência/visível), flags do player, indicador de rascunho não publicado.

## Assets
- Ícones: traço de 2px, 24x24 (estilo Lucide/Feather). Usar **lucide-react** (ou equivalente) na implementação: home, play-circle, route, message-circle, award, user, search, bell, layout-grid, clipboard-list, rocket, video, users, inbox, activity, dollar-sign, settings, external-link, monitor, sparkles, layout, filter, zap, send, calendar, mail, heart, star, check, chevrons, download, plus, list, book-open, file-text, folder, more-vertical, menu, lock, clock, eye/eye-off, image, share-2, megaphone, tag, trash-2, grip-vertical.
- Fontes: Google Fonts (Plus Jakarta Sans, Newsreader).
- Imagens: nenhuma fornecida. Pendentes: logo oficial, capas dos cursos (3:4 e 16:9), imagem do hero, foto do professor, thumbnails das aulas, favicon.
