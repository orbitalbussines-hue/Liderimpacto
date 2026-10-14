# Design system Líder de Impacto

**Regra: tela nova = montar com estas peças.** Precisa de algo que não existe? Crie a
primitiva aqui (`src/components/ui/`, um arquivo por componente, com amostra no catálogo),
nunca estilo solto na tela. Cor só por token (`bg-surface`, `text-muted`, `bg-accent`...,
ver `src/app/globals.css`); hex solto em componente é proibido.

- Catálogo vivo: `/componentes` (só em desenvolvimento; em produção dá 404). Compostos do
  aluno em `/componentes/aluno`, do admin em `/componentes/admin`.
- Fonte de fidelidade: `README.md` (tokens) e `reference/Sistema de Aulas Lider de Impacto v3.dc.html`.
- Importação direta por arquivo (sem barrel): `import { Selo } from "@/components/ui/selo"`.
- Server Component por padrão. São client: `Interruptor`, `GrupoChips`, `ControleSegmentado`,
  `Abas`, `AlternarTema` (e quem passa callback: `onRemover`, `onTentarNovamente`).
- Os nomes `variant`/`size` do `Button` ficam em inglês (compatibilidade com o shadcn); os valores são PT.

| Componente | Arquivo | Onde aparece no protótipo | Variantes / props principais |
| :--- | :--- | :--- | :--- |
| `Button`, `buttonVariants` | `ui/button.tsx` | todas as telas | `variant`: primario, secundario, contorno, fantasma, perigo, link, heroPrimario, heroSecundario (apelidos default/outline/secondary/ghost/destructive); `size`: 36, 40 (padrão), 42, 46, 48 (hero, pílula), 50 (login), icone36, icone44; `pilula`, `larguraTotal`, `carregando` (aria-busy), `disabled`. Link com cara de botão: `<Link className={buttonVariants({...})}>` |
| `AlertDialog*` | `ui/alert-dialog.tsx` | base do modal | shadcn/Base UI reestilizado: surface, borda, rounded-2xl, shadow-card, título serifado |
| `ModalConfirmacaoBlock` | `modal-confirmacao-block.tsx` | ação crítica | `aberto`, `titulo`, `mensagem`, `onConfirmar`, `onCancelar`, `carregando`, `textoConfirmar`; 3 s travado, sem ESC/clique fora |
| `Campo` | `ui/campo.tsx` | login, perfil, construtor | `rotulo`, `tamanho` 36/42/44/48, `fundo` bg/surface, `estiloRotulo` padrao/discreto, `ajuda`, `erro` (aria-invalid + aria-describedby), `icone`, `sufixo`, `rotuloOculto`, `classNameMoldura` + props de `<input>` |
| `AreaTexto` | `ui/area-texto.tsx` | construtor (descrição do destaque) | as do Campo (sem tamanho/ícone) + `rows` |
| `CampoMoldura`, `idsDescricao` | `ui/campo-moldura.tsx` | rótulo de grupo no construtor | `id`, `rotulo`, `estiloRotulo`, `ajuda`, `erro`; o `<label>` ganha `id="{id}-rotulo"` para o `aria-labelledby` de grupos |
| `CampoSenha` | `ui/campo-senha.tsx` | login, definir senha | props do Campo (sem `type`/`sufixo`); botão mostrar/ocultar com `aria-pressed` e aviso de Caps Lock na ajuda. Client |
| `CampoCodigo` | `ui/campo-codigo.tsx` | desafio 2FA (`/login/verificar`) | `name` (input hidden com o código), `rotulo`, `comprimento` (6), `onCompleto(codigo)` (envio automático), `erro`, `disabled`, `autoFocus`. Colar/autopreenchimento distribui, Backspace volta, setas navegam. Para limpar, troque a `key`. Client |
| `Aviso` | `ui/aviso.tsx` | erro de login, link enviado, senha salva | `tom` erro (role=alert) / info / ok (role=status), `id`, `children`. Borda 1px translúcida do tom, sem faixa lateral |
| `CaixaSelecao` | `ui/caixa-selecao.tsx` | login ("Manter conectado") | `rotulo` + props de checkbox |
| `Interruptor` | `ui/interruptor.tsx` | perfil, construtor | `ligado` (controlado) ou `ligadoInicial`, `onAlternar(bool)`, `name` (input hidden), `aria-label`/`aria-labelledby` |
| `Selo` | `ui/selo.tsx` | tabelas, avaliações, fileiras, hero, sidebar | `tom`: accent, ok, warn, neutro, solido, fixo, transparente; `forma`: pilula (status), etiqueta (TOP 10, ADMIN, 28 AULAS), rotulo (grupo), canto (Novo na capa) |
| `Abas` | `ui/abas.tsx` | continuar, player, tabelas do admin | `itens` {valor, rotulo, href?, idPainel?}, `ativo`, `valorInicial`, `onSelecionar`, `tamanho` aluno/admin, `aria-label`. Com href: links + aria-current. Sem: tablist + aria-selected + setas |
| `GrupoChips` | `ui/grupo-chips.tsx` | construtor (tipo, quantidade, ordenação, quem vê, Vitrine/Player, Desktop/Mobile) | `opcoes` {valor, rotulo}, `valor`/`valorInicial`, `onMudar`, `name`, `aria-label(ledby)`; radiogroup com setas |
| `ControleSegmentado` | `ui/controle-segmentado.tsx` | dashboard (período) | mesmas props do GrupoChips (sem `name`) |
| `useSelecaoUnica` | `ui/use-selecao-unica.ts` | interno | roving tabindex + setas/Home/End dos três acima |
| `BarraProgresso` | `ui/barra-progresso.tsx` | cards, curso, certificados, tabelas, fileira | `valor` (0 a 100, limitado), `rotulo`, `variante` padrao/sobreImagem, `espessura` 5/6, `mostrarPercentual` |
| `Avatar`, `iniciais` | `ui/avatar.tsx` | header, comunidade, membros, perfil, sidebar | `nome`, `src`, `tamanho` 28/30/32/36/40/56/96, `forma` circulo/quadrado, `tom` neutro/accent/dourado, `borda` |
| `Cartao`, `CartaoTitulo` | `ui/cartao.tsx` | todas as superfícies | Cartao: `padding` 0/16/18/20/24, `raio` 14/16/18, `como` div/article/section/aside. Título: `tamanho` 14/15/16, `como` h2/h3/div (sans 800) |
| `IconeQuadrado` | `ui/icone-quadrado.tsx` | construtor, páginas de cards, avaliações, anexos PDF/DOC | `children` (ícone lucide ou texto), `tamanho` 32/42/44, `tom` accent/ok/warn/neutro |
| `CabecalhoPagina` | `ui/cabecalho-pagina.tsx` | topo de toda página | `titulo`, `variante` aluno (36) / curso (56/38) / aula (38/28) / adminDestaque (32) / admin (24) / adminTabela (20), `eyebrow`, `contador`, `meta`, `descricao`, `acoes`, `como` h1/h2 |
| `SegmentosLink` | `ui/segmentos-link.tsx` | período do ranking, "A entregar/Entregues" | o desenho do `ControleSegmentado` em LINK (filtro na URL, sem JS): `opcoes {rotulo, href, ativo}[]`, `aria-label`; ativo com `aria-current` |
| `CampoBusca` | `ui/campo-busca.tsx` | barras de filtro, sidebar | props do Campo (36px, lupa); `rotulo` oculto (padrão "Pesquisar"), `fundo`, `sufixo` (atalho) |
| `BotaoFiltro` | `ui/botao-filtro.tsx` | "Tipo", "Grupos" com seta | props do Button + `aberto` (aria-expanded) |
| `FiltroAtivo` | `ui/filtro-ativo.tsx` | "Status · Ativo ×" | `rotulo`, `hrefRemover` ou `onRemover`, `rotuloRemover` |
| `Estatistica` | `ui/estatistica.tsx` | perfil, saúde dos produtos | `valor`, `rotulo`, `tom` padrao/accent, `variante` padrao/compacta |
| `EstadoVazio` | `ui/estado-vazio.tsx` | derivado (não desenhado) | `titulo`, `descricao`, `icone`, `acao`, `comMoldura` |
| `Esqueleto` | `ui/esqueleto.tsx` | derivado | só `className` (formato); agrupe com `aria-busy` + texto sr-only |
| `EstadoErro` | `ui/estado-erro.tsx` | derivado | `titulo`, `mensagem`, `onTentarNovamente` |
| `Selecao` | `ui/selecao.tsx` | professor, pré-requisito (derivado) | `<select>` nativo com o visual do Campo: `rotulo`, `opcoes {valor, rotulo, grupo?}` (grupo vira `<optgroup>`), `vazio` (opção ""), `tamanho` (42), `erro`, `ajuda` + props de `<select>` |
| `EspacoImagem` | `ui/espaco-imagem.tsx` | toda capa/foto (`image-slot`) | `src`, `alt`, `dica`, `proporcao` 16/9, 3/4, 16/10, 1.414 (sem: preenche o pai), `sizes`, `prioritaria` |
| `AlternarTema` | `ui/alternar-tema.tsx` | header, perfil | `variante` icone/texto; action `alterarTema` em `src/lib/actions/tema.ts` |
| `Logo` | `marca/logo.tsx` | header, login, sidebar | `variante` cabecalho/bloco/fixo, `tamanho` 13/10 (provisório em texto, sem monograma; trocar só este arquivo) |
| `EstiloMarca` | `marca/estilo-marca.tsx` | área do aluno | `cor` (hex); ver "Cor da marca" |
| `PlayerHls` | `video/player-hls.tsx` | prévia do vídeo no editor da aula (controles nativos) | `acesso` {urlMaster, token}, `renovar()`, `titulo`, `poster`, `marcaDagua`, `autoPlay`. Usa o hook `useHls` (`video/use-hls.ts`: níveis de qualidade, token renovado a cada 4 min, HLS nativo no Safari) e `MarcaDagua` (`video/marca-dagua.tsx`, reaparece se removida). Client |
| `PlayerAula` | `player/player-aula.tsx` (+ `controles-player`, `barra-tempo`, `menu-player`, `fim-da-aula`, `use-progresso`, `acumulador`, `atalhos`) | 5 Player | `aulaId`, `titulo`, `duracaoSeg`, `poster`, `marcaDagua`, `retomarEm`, `capitulos`, `velocidade`, `autoplay`, `contagemSeg`, `anterior`/`proxima`, `autoIniciar`, `legendas?` (`LegendaPlayer {id, idioma, rotulo, url}`), `chaveLegenda?` (chave do `localStorage`, por pessoa), `onTempo`, `onGravado`; `ref` = `{ tempoAtual(), irPara(seg) }`. Marcadores de capítulo, velocidade, qualidade, legendas (botão CC: 1 legenda liga/desliga com `aria-pressed`, várias = menu; `<track>` em `hidden` e o texto desenhado por `LegendaNaTela` acima dos controles, tamanho em `cqw`; `useLegenda` em `use-legenda.ts`; tela cheia nativa do iPhone usa o desenho do sistema), PiP, tela cheia, atalhos (espaço/K, J/L, setas, F, M, C, 0–9), progresso a cada 10 s + beacon em pause/seek/aba oculta/saída (`acumuladorDeIntervalos` puro), conclusão ≥ 90 %, próxima aula com contagem. Sessão de reprodução só abre no primeiro play. Client |

## Cor da marca

A equipe pode trocar a cor de destaque da área do aluno. Por ora só o mecanismo (a
persistência no banco e a tela do admin vêm depois):

- `src/lib/marca/paleta.ts` (puro): `gerarPaleta(hex)` devolve `--accent`, `--accent-soft` e
  `--accent-ink` para `dark` e `light`. Valida `#RGB`/`#RRGGBB` (inválido lança erro). A tinta
  é a de maior contraste (escura `#1a1205` ou branca). Se o accent como texto ficar abaixo de
  3:1 sobre os fundos do tema, escurece (claro) ou clareia (escuro) em HSL até chegar lá.
  Também exporta `contraste(a, b)`, `validarHex`, `cssDaMarca(hex, escopo)` e `PALETA_PADRAO`.
- `<EstiloMarca cor={hex} />` (Server Component) injeta um `<style>` que vale dentro de
  `[data-area="aluno"]` nos dois temas e define `--marca-fixo`/`--marca-fixo-ink` (hero e login,
  sempre escuros, usam `bg-fixo-accent`). Coloque `data-area="aluno"` no container do layout do
  aluno. Cor vazia, inválida ou igual ao padrão não gera nada: valem os tokens do `globals.css`.
- Com o dourado padrão a função gera `#b48224` no tema claro (o README tem `#B5842A`) e tinta
  escura (o README usa branco); por isso o padrão não gera CSS e o desenho original fica intacto.
- Prévia ao vivo: bloco "Cor da marca" no `/componentes`.

**Cascata (ADR-0002):** padrão da plataforma (`globals.css`) → cor do **criador** (área do aluno
inteira: `ShellAluno corMarca`) → cor do **curso** (só dentro do curso: página do curso, player,
certificado). Para o curso, envolva o trecho em `<div data-marca="<id>">` e coloque
`<EstiloMarca cor={curso.cor} escopo="<id>" />` (id só `[a-z0-9-]`; outro formato é recusado).
Com escopo o CSS sai sempre, mesmo no dourado, para o curso poder ser dourado dentro de um
criador vinho. O painel admin não usa cor de marca. Demonstração em `/componentes/aluno`.

## Compostos da área do aluno

Montados só com as primitivas acima. Client: `MenuAluno`, `TabBarAluno`, `Fileira`, `AcordeaoModulos`.

| Composto | Arquivo | Tela do protótipo | Props principais |
| :--- | :--- | :--- | :--- |
| `ShellAluno`, `MenuAluno`, `TabBarAluno`, `itemAtivo` | `aluno/*` (itens em `aluno/navegacao.ts`) | navegação global | `usuario {nome, iniciais, avatarUrl?}`, `notificacoes`, `corMarca?`; põe `data-area="aluno"` + `EstiloMarca` |
| `LayoutAutenticacao`, `CenaAutenticacao` | `aluno/layout-autenticacao.tsx`, `aluno/cena-autenticacao.tsx` | 1 Login (e código, esqueci a senha, definir senha) | `variante` criador/plataforma, `eyebrow?`, `titulo?`, `subtitulo?`, `rodape?`, `imagemUrl?` (foto do criador; coluna no banco ainda não existe), `children` (o formulário). Cena sempre escura (`data-theme="dark"` local) com aurora/feixe/grade/grão na cor da marca (utilitários `cena-*` e `textura-grao` em `globals.css`); celular: faixa no topo + folha do formulário |
| `Destaque` | `vitrine/destaque.tsx` | 2 Hero | espelha `StorefrontConfig.hero`: `titulo`, `descricao`, `imagemUrl`, `badge`, `meta[]`, `botaoPrincipal?`, `botaoSecundario?` (sem alvo visível o botão some), `avisos`, `mostrarAvisos`, `mostrarSom?` |
| `Fileira`, `CartaoFileira`, `varianteDoTipo` | `vitrine/*` | 2 Fileiras | `Fileira {titulo, tag?, variante?, itens}` (0 itens = não renderiza); variantes `padrao`, `progresso`, `top10`, `novo` |
| `CartaoCurso` | `curso/cartao-curso.tsx` | 3 Continuar | `titulo`, `capaUrl?`, `progresso`, `aulasConcluidas`, `totalAulas`, `href` |
| `ProgressoCurso`, `AcordeaoModulos`, `ItemAula`, `CartaoInclui`, `CartaoProfessor` | `curso/*` | 4 Curso | `AcordeaoModulos {modulos}` (módulo em andamento abre; aula atual com aria-current) |
| `ListaAulas`, `FaixaCapitulos`, `AnexoMaterial` | `curso/*` | 5 Player (playlist e anexos) | `ListaAulas {tituloCurso, aulasConcluidas, totalAulas, grupos}` (aula com `bloqueio` vira linha com cadeado, sem link; `atual` destacada); `FaixaCapitulos {capitulos, onSelecionar?}` (capítulo pula o vídeo); `AnexoMaterial {tipo, nome, href?, onAbrir?}` (modo botão pede o link curto) |
| `TranscricaoAula` | `app/(aluno)/aula/[id]/_components/transcricao-aula.tsx` (colocado) | 5 Player, aba Transcrição (RN-180) | client; `url` (rota do `.vtt`), `ativa` (baixa só na 1ª abertura), `tempo`, `onIrPara(seg)`. Trechos com tempo (clique leva o vídeo), atual com `aria-current` + `accent-soft` e a lista o acompanha (rola só a lista), busca sem acento com `<mark>` via `partesComDestaque` (nunca HTML). A aba só existe com legenda e player |
| `ChatAssistente`, `RespostaAssistente`, `perguntarAoAssistente` | `assistente/chat-assistente.tsx`, `assistente/resposta-assistente.tsx`, `assistente/stream.ts` | aba "Pergunte ao professor" da aula, `/assistente`, "Testar" do admin (ADR-0014, RN-192/195) | `ChatAssistente` (client): `nomeAssistente`, `inicial {conversaId, versao, mensagens}`, `aulaId?`, `teste?`, `indisponivel?` (motivo; o histórico continua visível), `vazio?`, `avisoPrivacidade?`, `mostrarNova?`, `onConversa(c \| null)`, `enviar?` (injeção nos testes). Streaming NDJSON de `POST /api/assistente`, "Parar" aborta, Enter envia/Shift+Enter quebra, "N perguntas restantes hoje". `RespostaAssistente {texto, fontes, mostrarFontes?}`: renderizador mínimo (`blocosDoTexto`: parágrafo, lista, negrito, citação `[n]` em pílula com link `/aula/<id>?t=<seg>`) + lista "Fontes" só das citadas. Nunca HTML do modelo |
| `ChatDaPagina` | `app/(aluno)/assistente/_components/` (colocado) | `/assistente` | client; conversa da URL (`?c=`), "Apagar" pelo modal block, troca a URL quando a conversa ganha id. A página tem a lista "Conversas" (300 px no desktop, embaixo no celular) |
| `LinhaCartao`, `LinhaAvaliacao` | `engajamento/*` | 6 Avaliações | `LinhaCartao {icone?, titulo, meta?, status?, acao?}` serve para qualquer lista de cartões em linha |
| `CartaoTrilha`, `EtapasTrilha` | `engajamento/*` | 7 Trilhas | `totalEtapas`, `etapasConcluidas` (CTA deriva do progresso) |
| `CompositorPost`, `CartaoPost`, `ListaCanais`, `CartaoEncontroAoVivo`, `CartaoMembrosAtivos`, `CartaoFixados` | `engajamento/*` | 8 Comunidade | peças visuais com slots: `CompositorPost` (client) recebe `enviarAnexo`/`publicar`; `CartaoPost` tem `menu`, `corpo`, `acoes`, `children`, `equipe`, `fixado`, `editado`, `canal`; `ListaCanais` com `restrito`; `CartaoFixados` com `variante="lista"`; `CartaoEncontroAoVivo {dia, mes, titulo, quando, href, hrefAgenda?, hrefTodos?, idTitulo?}` (ligado aos dados por `EncontroDaComunidade {evento, comAgenda?}`) |
| `BlocoData`, `EncontroDaComunidade` | `engajamento/*` | Eventos ao vivo, Comunidade | `BlocoData {dia, mes, tamanho padrao/grande, apagado}` (data em bloco accent-soft; decorativo, a data por extenso vai ao lado). Telas `/eventos` e `/eventos/[id]` com colocados em `app/(aluno)/eventos/_components/`: `DestaqueEvento`, `LinhaEvento`, `BotaoPresenca` (client, `secundario` quando há "Entrar no encontro"), `ContagemEvento` (client: texto de `textoDaContagem` e `router.refresh()` ao abrir a janela do link e no fim) |
| `TextoComLinks`, `PostComunidade`, `FeedComunidade`, `PostAberto`, `Comentarios`, `BotaoCurtir`, `AnexosPost`, `EnquetePost`, `MenuConteudo`, `DialogoMotivo`, `CompositorComunidade`, `SeletorCanal` | `comunidade/*` | 8 Comunidade (ligada aos dados) e aba Comentários da aula | texto SÓ por `segmentosDeTexto` (proibido `dangerouslySetInnerHTML`); curtida otimista com reversão; comentários com 1 nível de resposta; moderação pelo menu ⋮ com `ModalConfirmacaoBlock` |
| `SinoNotificacoes`, `PainelNotificacoes`, `ItemNotificacao`, `ListaCompleta` | `notificacoes/*` | header do aluno, sidebar/topbar do admin, `/notificacoes` | `inicial` (contagem do servidor), polling de `/api/notificacoes/contagem` só com a aba visível (para em 401), painel com foco preso; no celular do aluno leva a `/notificacoes` |
| `CartaoCertificado` | `engajamento/cartao-certificado.tsx` | 9 Certificados | `titulo`, `meta`, `nomeAluno`, `bloqueado`, `progresso?`, `hrefPdf?` |
| `CartaoPerfil`, `LinhaPreferencia` | `engajamento/*` | 10 Perfil | `CartaoPerfil {estatisticas}`: 3 numa linha, 4 (com os pontos) em 2 × 2; `LinhaPreferencia {titulo, descricao?, controle}` |
| `PeriodoRankingLinks` | `gamificacao/periodo-ranking.tsx` | `/conquistas`, `/admin/desafios/ranking` | `ativo` (semana/mes/total), `href(periodo)`; sobre `SegmentosLink` |

## Compostos e moldes do admin

| Composto | Arquivo | Onde | Props principais |
| :--- | :--- | :--- | :--- |
| `ShellAdmin`, `SidebarAdmin` | `admin/shell-admin.tsx`, `admin/sidebar-admin.tsx` | layout do admin | `usuario {nome, papel}`; sidebar 280px (o design pedia 240, cortava nomes), gaveta no celular |
| `navegacao.ts` | `admin/navegacao.ts` | fonte única | itens `{slug, rotulo, href, icone, selo?, fase, papelMinimo, molde}`; `secaoPorSlug`, `itemAtivo`, `papelPodeVer`, `secaoAcessivel` |
| `PaginaTabela`, `CelulaTabela` | `admin/pagina-tabela.tsx`, `admin/celula-tabela.tsx` | toda lista | `titulo, estatistica?, abas, busca?, semBusca? (ranking), filtros?, filtrosAtivos?, colunas, linhas, acaoPrincipal?, acaoSecundaria?, paginacao?`; células tipadas em `admin/tabela-tipos.ts`: texto, membro, capa, selo, etiqueta, barra, numeroDestaque, data ("Nunca" em warn), acoes. Sem linhas: EstadoVazio com os cabeçalhos reais |
| `MenuAdmin` | `admin/menu-admin.tsx` | ⋮ das linhas, filtros "Situação ▾" | client; Menu da Base UI. `gatilho` (elemento Button/BotaoFiltro), `children` (conteúdo do gatilho), `itens[{rotulo, icone?, onSelecionar?, href?, perigo?, marcado?}]`, `alinhar` |
| `DialogoAdmin` | `admin/dialogo-admin.tsx` | gerar link, grupos, renomear | client; cartão do AlertDialog que fecha por ESC (ação NÃO crítica). `aberto`, `onFechar`, `titulo`, `descricao?`, `children`, `rodape` |
| `LinkDeAcesso`, `dataHora` | `admin/link-de-acesso.tsx` | link de primeiro acesso/redefinição | client; campo só leitura + Copiar + validade. Só no estado da tela (nunca URL/log) |
| `PaginaCards`, `GradeCards` | `admin/pagina-cards.tsx` | Configurações, Vendas; `GradeCards` (só a grade) nos atalhos do hub Área de membros | `titulo, subtitulo, acao?, cards[{icone, titulo, descricao, href?}]`; card SEM `href` mostra o selo "Em breve" no lugar da seta |
| `CartaoKpi` | `admin/cartao-kpi.tsx` | Home, Analytics | `rotulo, valor, variacao?` (seta + texto, nunca só cor), `variacaoLeitor?` (por extenso p/ leitor de tela), `tom?`, `legenda?`, `complemento?` (linha muted) |
| `SeletorDatas` (client) | `admin/seletor-datas.tsx` | Home, Analytics, Logs | `valor` (`{ de, ate }` ou `null` = sem filtro, gatilho mostra `rotuloVazio`, padrão "Todo o período"), `hoje` (AAAA-MM-DD de Brasília, vem do servidor), `caminho`, `manter` (outros filtros da URL preservados). Gatilho = botão com `CalendarDays` e "01/10/2026 a 14/10/2026"; popover (Base UI) com atalhos à esquerda (ativo em accent-soft), dois meses (semana começa na SEG), início/fim em pílula accent, meio em faixa accent-soft, prévia no hover. Atalho e dias só mudam o rascunho; **Atualizar** navega com `?de=&ate=` e fecha; Cancelar/Esc/clique fora fecham sem aplicar. Dias depois de hoje e fim a 366+ dias do início ficam `disabled`. Celular (< `desk:`): um mês e atalhos em chips roláveis (`scrollbar-oculta`), alvos de 44 px. Regras de data em `src/lib/painel/periodo.ts`. Limpar o filtro (Logs) = chip "Período · …" do `FiltroAtivo` |
| `GraficoAcessos` | `app/admin/_components/grafico-acessos.tsx` | Home (colocado) | barras CSS dos 14 dias: hoje em accent, demais em `muted/30`, rótulo só em hoje e no maior, dica no hover, 3 datas no eixo, `<table>` sr-only. `dias {dia, alunos}[]` |
| `GraficoBarrasDia` | `app/admin/analytics/_components/grafico-barras-dia.tsx` | Analytics (colocado) | mesmo desenho do `GraficoAcessos` para 7/30/90 pontos (vão encolhe com o número de dias): `pontos {dia, valor}[]`, `unidade`, `legenda` (caption da `<table>` sr-only) |
| `ListaOrdenavel`, `useOrdemPersistida` | `admin/lista-ordenavel.tsx` | estrutura do produto (módulos, aulas) | client; dnd-kit com alça (mouse, toque e teclado: Espaço pega, setas movem, Espaço solta, Esc cancela; anúncios PT-BR) + botões subir/descer. `itens {id, versao}`, `rotulo(item)`, `onReordenar(novos)`, `renderItem(item, {alca, subirDescer, arrastando})`. O hook move na hora, grava com a versão de todos e volta se der colisão |
| Construtor da vitrine (`Construtor`, `EstruturaVitrine`, `PreviaVitrine`, `PropriedadesDestaque`, `EditorBotao`, `PropriedadesFileira`, `AbaPlayer`, `HistoricoVitrine`, `StatusVitrine`, `BuscaConteudo`, `useRascunho`) | `app/admin/construtor/_components/` (colocados) | `/admin/construtor` | client. `useRascunho({config, versao}, salvar)`: autosave 800 ms em fila com trava (`estado` salvo/pendente/salvando/erro/conflito; `mudar`, `substituir`, `descarregar`). `PreviaVitrine {versao, selecionado, dispositivo, onSelecionar}`: iframe de `/previa-vitrine` (1440 escalada ou 390×844), troca sem piscar. `LinhaInterruptor {titulo, descricao?, ligado, onAlternar}` (toggle com rótulo). A prévia usa `VitrineMontada` (`app/(aluno)/_vitrine/`), a MESMA da página `/` |
| `LegendasAula` | `app/admin/conteudos/[id]/aulas/[aulaId]/_components/legendas-aula.tsx` (colocado) | editor da aula, seção Legendas (RN-180) | client; `aulaId`, `duracaoSeg`, `legendas[{id, idioma, rotulo, nomeOriginal, trechos, duracaoSeg, versao}]`. Lista com ⋮ (Trocar arquivo, Remover pelo modal block) e envio de idioma novo (idioma + nome no player). Confere o arquivo na tela com `processarLegenda` antes de subir; sobe por `useEnvioDeArquivo("LEGENDA")` com o MIME da extensão |
| `MolduraAbas` | `admin/moldura-abas.tsx` | abas que não são tabela (Testar busca, Configuração/Testar/Perguntas/Consumo do assistente) | `titulo, meta?, acoes?, abas {rotulo, href}[], ativa, children`: o cabeçalho e as abas do `PaginaTabela` com conteúdo livre embaixo, para todas as abas da seção terem a mesma cara |
| Base de conhecimento (`FiltrosBase`, `InterruptorFonte`, `AcoesTexto`/`useExcluirTexto`, `FormTexto`, `TestarBusca`) | `app/admin/base-de-conhecimento/_components/` (colocados) | `/admin/base-de-conhecimento` (RN-190) | lista no `PaginaTabela` (filtros Tipo/Curso por link, interruptor "Incluída" otimista, ⋮ do texto com Editar/Excluir pelo modal block); `FormTexto {cursos, texto?}` com contagem de caracteres e de trechos (`dividirEmTrechos`), "Vale para" todos ou um curso; `TestarBusca` lista os trechos `[n]` com fonte, curso, minuto e relevância |
| Assistente (`FormAssistente`, `SeloSituacao`, `AvisoIaNaoConfigurada`, `ABAS_ASSISTENTE`) | `app/admin/assistente-do-professor/_components/` (colocados) | `/admin/assistente-do-professor` (RN-193) | `FormAssistente {inicial, cursos}`: interruptor, nome, instruções de tom (contador), limite diário, cursos (`GrupoChips` Todos/Só os escolhidos + `CaixaSelecao`). Perguntas: `SegmentosLink` Recentes/Sem resposta; Consumo: `CartaoKpi` + tabelas por dia e mês |
| `CampoImagem` | `admin/campo-imagem.tsx` | capas 3:4/16:9, thumb da aula | client; prévia `EspacoImagem`, enviar/trocar (direto ao storage, com progresso), remover pelo modal block. `rotulo, proporcao, src, alt, onDefinir(arquivoId \| null), descricaoRemover, ajuda?` |
| `useEnvioDeArquivo` | `admin/use-envio-arquivo.ts` | imagens e materiais | hook client: allowlist na tela → URL assinada → PUT com progresso → confirmação; devolve o `arquivoId` (ou `erro`) |
| `SeletorCorMarca`, `PreviaCorMarca`, `PreviaMarca` | `admin/seletor-cor-marca.tsx`, `admin/previa-cor-marca.tsx`, `admin/previa-marca.tsx` | Aparência e cor própria do curso | seletor nativo + Hex + 4 cores prontas + aviso de ajuste (`cor`, `onMudar`, `onValidade`); prévia nos dois temas com os componentes reais (`cor`, `disposicao` lado/pilha) |
| `ListaErrosCsv` | `admin/lista-erros-csv.tsx` | prévia e resultado das importações CSV | `erros {numero, mensagem}[]` (vazio = não renderiza) |
| `LinksPrimeiroAcesso` | `admin/links-primeiro-acesso.tsx` | resultado das importações CSV | client; `links {nome, email, url, expiraEm}[]`: copiar todos / baixar CSV gerado no navegador (nunca URL/log) |
| `CabecalhoConfiguracao`, `LinhaInfo` | `app/admin/configuracoes/_components/` (colocado) | Geral, Domínios | cabeçalho com "← Configurações"; `LinhaInfo {rotulo, valor, ajuda?}` = linha só leitura de um `<dl>` |
| `DialogoMatricular` | `matriculas/dialogo-matricular.tsx` | botão "Matricular" de `/admin/matriculas` e "Matricular em…" de `/admin/membros` | client; `aberto`, `onFechar`, `produtos {id, titulo, status}[]`, `grupos`, `membroInicial?`. Pessoas (busca por action) OU grupo, produtos, expiração (`<input type="date">`); resumo no modal block; resultado criadas/reativadas/já existiam. Monte só quando aberto (estado novo a cada vez) |

### Tela nova do admin em 3 passos

1. Em `src/components/admin/navegacao.ts`, adicione o item no grupo certo com
   `item(slug, rotulo, icone, fase, molde, { selo?, papelMinimo? })` (`papelMinimo: "DONO"` para
   financeiro e configurações).
2. Escolha o molde: lista = `tabela(titulo, abas, colunas, {...})`; cards = `{ tipo: "cards", ... }`;
   tela desenhada à parte = `{ tipo: "proprio" }`. Pronto: `/admin/<slug>` já existe pela rota
   `[secao]`, com sidebar, papel e 404, e a lista aparece vazia com os cabeçalhos reais.
3. Quando houver dados, crie `src/app/admin/<slug>/page.tsx` (pasta fixa vence a rota genérica) e
   renderize `<PaginaTabela linhas={...} />`. Coluna de tipo novo: variante em `Celula`
   (`tabela-tipos.ts`) + caso em `celula-tabela.tsx`.
   Com dados reais (ver `/admin/membros`): `abas` aceita `{rotulo, href?, emBreve?}`;
   `formBusca={{ nome: "q", manter }}` vira busca GET; `controles` recebe os `MenuAdmin` de filtro;
   `acaoPrincipal/acaoSecundaria` com `href` viram link (ou `acoes` para botões client);
   `paginacao.href(n)` liga ‹ ›; `chaves` (ids) mantém o estado do menu da linha; célula
   `{ tipo: "no", conteudo }` para o menu de ações e selos combinados.

### Editor (tela própria, sem desenho no protótipo)

Duas colunas como a página do curso: `grid items-start gap-5 desk:grid-cols-[minmax(0,1fr)_340px]`,
`Cartao padding={24}` no principal (dados, estrutura) e `Cartao padding={20}` no `aside` (situação,
imagens). Topo com link de volta + `CabecalhoPagina variante="admin"` (`eyebrow` com código/tipo,
`meta` com `Selo`). Referência: `/admin/conteudos/[id]` e `/admin/conteudos/[id]/aulas/[aulaId]`.

### Tela nova do aluno

Rota em `src/app/(aluno)/` (o layout já põe o `ShellAluno`), topo com `CabecalhoPagina`, corpo com
os compostos acima e `EstadoVazio`/`Esqueleto`/`EstadoErro` para os estados. Item de menu novo:
`src/components/aluno/navegacao.ts`.

> Com `cacheComponents` (Next 16), página que lê `params`/`searchParams`/sessão faz isso dentro de
> `<Suspense>` (ver `src/app/admin/[secao]/page.tsx`).

---

# Padrao de Componentes

Como construir e organizar componentes nesta base. A IA DEVE seguir este padrao.
Arquivo-ouro de referencia: [`templates/component.tsx`](../templates/component.tsx).

## Principio: Colocation (colocate first, extract later)

Comece colocando o componente do lado de quem usa. So mova para uma pasta
compartilhada quando **2+ telas** realmente reusarem.

```
src/
  app/
    (app)/
      lancamentos/
        page.tsx                 # server component — busca dados, resolve RBAC
        _components/             # _ = pasta privada (fora do routing do Next)
          lancamentos-lista.tsx  # client — interativo
          lancamento-form.tsx
  components/
    ui/                          # genericos shadcn (Button, Card, Dialog...)
    modal-confirmacao-block.tsx  # compartilhado entre features
```

| Onde | O que vai |
|------|-----------|
| `app/<rota>/_components/` | Componentes usados SO por aquela rota |
| `components/ui/` | Primitivos genericos (shadcn/ui): Button, Input, Card |
| `components/` | Compartilhados entre features (ex.: ModalConfirmacaoBlock) |

## Server vs Client Components

- **Server Component (padrao)**: nao leva `"use client"`. Faz fetch de dados,
  resolve RBAC, repassa dados prontos via props. Nao tem estado nem efeito.
- **Client Component**: leva `"use client"` SO quando precisa de `useState`,
  `useEffect`, eventos (onClick), ou APIs de browser.

Regra: busque dados no server (page.tsx), passe via props para um client
component pequeno. Nao transforme a pagina inteira em client.

```tsx
// page.tsx (SERVER) — busca + RBAC
import { listar } from "@/lib/actions/contratos-lancamentos";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { LancamentosLista } from "./_components/lancamentos-lista";

// (dentro de <Suspense> por causa do cacheComponents)
export default async function Page() {
  const { membro } = await membroDaPagina(TODOS_OS_MEMBROS);
  const itens = await listar();
  return <LancamentosLista itens={itens} podeExcluir={membro.papel === "DONO"} />;
}
```

## Convencoes de Nomenclatura

| Item | Convencao | Exemplo |
|------|-----------|---------|
| Arquivo de componente | kebab-case | `lancamento-form.tsx` |
| Nome do componente | PascalCase | `LancamentoForm` |
| Export | nomeado (nunca default em feature) | `export function LancamentoForm()` |
| Props | interface `<Componente>Props` | `interface LancamentoFormProps` |
| Hook | camelCase com `use` | `useLancamentos` |
| 1 arquivo | 1 componente | — |

> Excecao: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` usam `export default` (exigencia do Next).

## Tipagem de Props

- SEMPRE interface explicita. NUNCA `any`.
- Reusar tipos do schema Drizzle (`$inferSelect`) em vez de redefinir.

```tsx
import type { ContratoLancamento } from "@/lib/db/schema/contratos-lancamentos";

interface Props {
  itens: ContratoLancamento[];
  podeExcluir: boolean;
}
```

## Estados Obrigatorios

Todo componente que carrega ou envia dados trata os 4 estados:

| Estado | Como |
|--------|------|
| Carregando | skeleton ou spinner (`loading.tsx` no server, `useState` no client) |
| Vazio | mensagem clara ("Nenhum lancamento") |
| Erro | `error.tsx` (server) ou `r.erro` da action exibido na tela (client) — nunca `alert()` |
| Sucesso | render normal |

## Acoes Criticas: Modal com Block 3s

Excluir, salvar lancamento, qualquer acao irreversivel/sensivel passa por
`<ModalConfirmacaoBlock>`: bloqueia 3s, nao fecha por ESC/click-fora, mostra
resumo do que vai acontecer. Ver `templates/component.tsx`.

## shadcn/ui

- Primitivos vem de `components/ui/` (instalados via `npx shadcn@latest add`).
- NUNCA editar a logica interna de um primitivo shadcn para uma feature —
  componha por cima ou estenda via props/className.
- Estilizar com Tailwind + `cn()` helper. Tema dark por padrao.

## Acessibilidade (minimo)

- Todo `<button>` tem texto ou `aria-label`.
- Todo input tem `<label>` associado.
- Foco visivel; modais prendem o foco (focus trap).
- Contraste AA.

## Checklist do Componente

- [ ] Server por padrao? `"use client"` so se precisa de estado/evento?
- [ ] Export nomeado + PascalCase + 1 por arquivo?
- [ ] Props com interface explicita (sem `any`)?
- [ ] Tipos reaproveitados do schema Drizzle?
- [ ] Estados carregando/vazio/erro/sucesso tratados?
- [ ] Acao critica com ModalConfirmacaoBlock (3s)?
- [ ] Genericos em `ui/`, feature-only em `_components/`?
- [ ] Acessibilidade minima (labels, foco, contraste)?
- [ ] Teste do caminho critico (ver `templates/component.test.tsx`)?
