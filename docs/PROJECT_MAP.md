# Mapa do Projeto

> Gerado por `scripts/project-map.mjs`. Leia este resumo antes de explorar arquivos.

## Resumo

| Metrica | Total |
|---------|-------|
| Arquivos TS/TSX | 392 |
| Tabelas (Drizzle) | 26 |
| Server Actions (arquivos) | 21 |
| Rotas de API | 4 |
| Paginas | 29 |
| Componentes | 108 |

## Arvore (profundidade 3)

```
app/
  _autenticacao/
    moldura-autenticacao.tsx
    pecas.tsx
  (aluno)/
    [secao]/
    aula/
    continuar/
    cursos/
    perfil/
    layout.tsx
    page.tsx
  admin/
    _components/
    [secao]/
    configuracoes/
    conteudos/
    matriculas/
    membros/
    layout.tsx
    page.tsx
  api/
    progresso/
    video/
  componentes/
    _components/
    admin/
    aluno/
    page.tsx
  conta/
    seguranca/
  login/
    _components/
    verificar/
    page.tsx
  plataforma/
    _components/
    novo/
    layout.tsx
    page.tsx
  primeiro-acesso/
    form-definir-senha.tsx
    page.tsx
    requisitos-senha.test.tsx
    requisitos-senha.tsx
  recuperar-senha/
    form-recuperar.tsx
    page.tsx
  favicon.ico
  forbidden.tsx
  globals.css
  layout.tsx
components/
  admin/
    campo-imagem.tsx
    cartao-kpi.tsx
    celula-tabela.tsx
    dialogo-admin.tsx
    link-de-acesso.tsx
    links-primeiro-acesso.tsx
    lista-erros-csv.tsx
    lista-ordenavel.test.tsx
    lista-ordenavel.tsx
    menu-admin.tsx
    navegacao.test.ts
    navegacao.ts
    pagina-cards.tsx
    pagina-tabela.test.tsx
    pagina-tabela.tsx
    previa-cor-marca.tsx
    previa-marca.tsx
    saudacao.test.ts
    saudacao.ts
    seletor-cor-marca.tsx
    seletor-periodo.tsx
    shell-admin.tsx
    sidebar-admin.tsx
    tabela-tipos.ts
    use-envio-arquivo.ts
  aluno/
    botao-favoritar.test.tsx
    botao-favoritar.tsx
    cena-autenticacao.tsx
    formatos.ts
    layout-autenticacao.tsx
    menu-aluno.tsx
    navegacao.test.ts
    navegacao.ts
    shell-aluno.tsx
    tab-bar-aluno.tsx
  curso/
    acordeao-modulos.test.tsx
    acordeao-modulos.tsx
    anexo-material.tsx
    cartao-curso.tsx
    cartao-inclui.tsx
    cartao-professor.tsx
    faixa-capitulos.tsx
    item-aula.tsx
    lista-aulas.test.tsx
    lista-aulas.tsx
    marca-aula.tsx
    progresso-curso.tsx
    tipos.ts
  engajamento/
    cartao-certificado.tsx
    cartao-encontro-ao-vivo.tsx
    cartao-fixados.tsx
    cartao-membros-ativos.tsx
    cartao-perfil.tsx
    cartao-post.tsx
    cartao-trilha.tsx
    compositor-post.tsx
    etapas-trilha.tsx
    linha-avaliacao.tsx
    linha-cartao.tsx
    linha-preferencia.tsx
    lista-canais.tsx
  marca/
    estilo-marca.test.tsx
    estilo-marca.tsx
    logo.tsx
  matriculas/
    dialogo-matricular.tsx
  player/
    acumulador.test.ts
    acumulador.ts
    atalhos.test.ts
    atalhos.ts
    barra-tempo.tsx
    controles-player.tsx
    fim-da-aula.test.tsx
    fim-da-aula.tsx
    menu-player.tsx
    player-aula.tsx
    use-contagem.ts
    use-progresso.test.tsx
    use-progresso.ts
  ui/
    abas.test.tsx
    abas.tsx
    alert-dialog.tsx
    alternar-tema.tsx
    area-texto.tsx
    avatar.tsx
    aviso.tsx
    barra-progresso.test.tsx
    barra-progresso.tsx
    botao-filtro.tsx
    button.tsx
    cabecalho-pagina.tsx
    caixa-selecao.tsx
    campo-busca.tsx
    campo-codigo.test.tsx
    campo-codigo.tsx
    campo-moldura.tsx
    campo-senha.test.tsx
    campo-senha.tsx
    campo.test.tsx
    campo.tsx
    cartao.tsx
    controle-segmentado.tsx
    espaco-imagem.tsx
    esqueleto.tsx
    estado-erro.tsx
    estado-vazio.tsx
    estatistica.tsx
    filtro-ativo.tsx
    grupo-chips.test.tsx
    grupo-chips.tsx
    icone-quadrado.tsx
    interruptor.test.tsx
    interruptor.tsx
    selecao.tsx
    selo.tsx
    use-selecao-unica.ts
  video/
    marca-dagua.tsx
    player-hls.tsx
    use-hls.ts
  vitrine/
    cartao-fileira.test.tsx
    cartao-fileira.tsx
    destaque.tsx
    esqueleto-fileira.tsx
    fileira.test.tsx
    fileira.tsx
    tipos.ts
  modal-confirmacao-block.test.tsx
  modal-confirmacao-block.tsx
lib/
  actions/
    anotacoes.ts
    aparencia.ts
    arquivos.ts
    aulas.ts
    auth.ts
    criadores.ts
    favoritos.ts
    grupos.ts
    matriculas-importacao.ts
    matriculas.ts
    membros-gestao.ts
    membros.ts
    perfil.ts
    preferencias.ts
    produtos-estrutura.ts
    produtos.ts
    progresso.ts
    seguranca.ts
    tema.ts
    usuarios-senha.ts
    videos.ts
  armazenamento/
    arquivos.ts
    cliente.ts
    regras.test.ts
    regras.ts
  audit/
    registrar.ts
  auth/
    auth.ts
    autorizacao.ts
    aviso.ts
    conta-seguranca.ts
    depois.ts
    destino.test.ts
    destino.ts
    eventos-senha.ts
    fatores.ts
    funil-sessao.ts
    guarda.ts
    historico-senha.ts
    ip.test.ts
    ip.ts
    link-de-senha-regra.test.ts
    link-de-senha-regra.ts
    link-de-senha.ts
    login.ts
    permissoes.test.ts
    permissoes.ts
    politica-fatores.test.ts
    politica-fatores.ts
    politica-senha.ts
    recuperacao.ts
    senha-kdf.ts
    sessao.ts
    teto.ts
    totp-replay.ts
  catalogo/
    consultas.ts
    ordem.ts
    publicacao.ts
    regras.test.ts
    regras.ts
  criador/
    area.ts
    atual.ts
    consultas.ts
    host.test.ts
    host.ts
  db/
    migrations/
    schema/
    index.ts
    sinais-fator.ts
    soft-delete.ts
  email/
    enviar.ts
  marca/
    paleta.test.ts
    paleta.ts
    predefinicoes.ts
  matriculas/
    consultas.ts
    csv.ts
    regras.test.ts
    regras.ts
    servico.ts
  membros/
    consultas.ts
    csv.test.ts
    csv.ts
    primeiro-acesso.ts
    regras.test.ts
    regras.ts
    vinculos.ts
  painel/
    cache.ts
    consultas.ts
    regras.test.ts
    regras.ts
  perfil/
    consultas.ts
  progresso/
    batida.ts
    beacon.ts
    consultas-curso.ts
    consultas.ts
    registrar.ts
    regras.test.ts
    regras.ts
    sql.ts
    top10.ts
    visao.ts
  validators/
    catalogo.test.ts
    catalogo.ts
    criadores.test.ts
    criadores.ts
    matriculas.ts
    membros.ts
    perfil.test.ts
    perfil.ts
    progresso.ts
    senha.test.ts
    senha.ts
  video/
    acesso-aula.ts
    acesso.ts
    chaves.test.ts
    chaves.ts
    entrega.ts
    ffmpeg.test.ts
    ffmpeg.ts
    fila.ts
    playlist.test.ts
    playlist.ts
    processar.ts
    provedor-proprio.test.ts
    provedor-proprio.ts
    provedor.ts
    registro.ts
    regras.test.ts
    regras.ts
    reproducao.ts
    segmento.ts
    sessoes.ts
    token.test.ts
    token.ts
    worker.ts
  acao.ts
  tema-constantes.ts
  tema.ts
  utils.ts
proxy.ts
```

## Tabelas (Drizzle)

### `arquivos` — src/lib/db/schema/arquivos.ts
`id`, `criador_id`, `chave`, `finalidade`, `nome_original`, `mime`, `tamanho_bytes`, `status`

### `auditoria` — src/lib/db/schema/auditoria.ts
`id`, `user_id`, `criador_id`, `acao`, `tabela`, `registro_id`, `detalhes`, `dados_anteriores`, `dados_novos`, `created_at`

### `criadores_grupos` — src/lib/db/schema/criadores-grupos.ts
`id`, `criador_id`, `nome`, `tipo`

### `criadores_grupos_membros` — src/lib/db/schema/criadores-grupos.ts
`id`, `criador_id`, `grupo_id`, `membro_id`

### `criadores` — src/lib/db/schema/criadores.ts
`id`, `slug`, `nome`, `cor_marca`, `status`, `dominio_proprio`

### `criadores_membros` — src/lib/db/schema/criadores.ts
`id`, `criador_id`, `usuario_id`, `papel`, `status`, `ultimo_acesso_em`

### `criadores_membros_favoritos` — src/lib/db/schema/favoritos.ts
`id`, `criador_id`, `membro_id`, `produto_id`, `aula_id`

### `produtos_matriculas` — src/lib/db/schema/matriculas.ts
`id`, `criador_id`, `membro_id`, `produto_id`, `origem`, `status`, `iniciada_em`, `concluida_em`, `expira_em`, `referencia_externa`, `motivo_cancelamento`

### `produtos` — src/lib/db/schema/produtos.ts
`id`, `criador_id`, `codigo`, `titulo`, `slug`, `descricao`, `tipo`, `capa_3x4_arquivo_id`, `capa_16x9_arquivo_id`, `status`, `publicado_em`, `professor_membro_id`, `cor_marca`

### `produtos_modulos` — src/lib/db/schema/produtos.ts
`id`, `criador_id`, `produto_id`, `ordem`, `titulo`, `status`

### `produtos_modulos_aulas` — src/lib/db/schema/produtos.ts
`id`, `criador_id`, `modulo_id`, `ordem`, `titulo`, `descricao`, `duracao_seg`, `thumb_arquivo_id`, `capitulos`, `libera_em`, `pre_requisito_aula_id`

### `produtos_modulos_aulas_materiais` — src/lib/db/schema/produtos.ts
`id`, `criador_id`, `aula_id`, `nome`, `tipo`, `arquivo_id`, `url`

### `produtos_modulos_aulas_progressos` — src/lib/db/schema/progresso.ts
`id`, `criador_id`, `membro_id`, `aula_id`, `segundos_bitmap`, `segundos_assistidos`, `max_posicao_seg`, `ultima_posicao_seg`, `percentual`, `concluida`, `concluida_em`, `concluida_por`, `ultima_visualizacao_dia`, `visualizacao_nova`

### `produtos_modulos_aulas_visualizacoes` — src/lib/db/schema/progresso.ts
`id`, `criador_id`, `aula_id`, `dia`, `visualizacoes`

### `criadores_membros_atividades` — src/lib/db/schema/progresso.ts
`id`, `criador_id`, `membro_id`, `dia`

### `produtos_modulos_aulas_anotacoes` — src/lib/db/schema/progresso.ts
`id`, `criador_id`, `membro_id`, `aula_id`, `tempo_seg`, `texto`

### `usuarios_contas` — src/lib/db/schema/usuarios-auth.ts
`id`, `usuario_id`, `conta_id`, `provedor_id`, `senha_hash`, `access_token`, `refresh_token`, `id_token`, `access_token_expira_em`, `refresh_token_expira_em`, `escopo`

### `usuarios_sessoes` — src/lib/db/schema/usuarios-auth.ts
`id`, `token`, `usuario_id`, `criador_id`, `expira_em`, `ip`, `agente`, `created_at`, `updated_at`

### `usuarios_verificacoes` — src/lib/db/schema/usuarios-auth.ts
`id`, `identificador`, `valor`, `expira_em`, `created_at`, `updated_at`

### `usuarios_limites` — src/lib/db/schema/usuarios-auth.ts
`id`, `chave`, `contagem`, `ultima_requisicao`

### `usuarios_totp` — src/lib/db/schema/usuarios-fatores.ts
`id`, `usuario_id`, `segredo`, `codigos_recuperacao`, `verificado`, `falhas_verificacao`, `bloqueado_ate`, `ultimo_passo_totp`, `created_at`

### `usuarios_senhas_anteriores` — src/lib/db/schema/usuarios-senhas.ts
`id`, `usuario_id`, `senha_hash`

### `usuarios` — src/lib/db/schema/usuarios.ts
`id`, `nome`, `email`, `email_verificado`, `imagem`, `papel_plataforma`, `ativo`, `tema`, `reproducao_automatica`, `lembretes`, `whatsapp`, `empresa_cargo`, `ultimo_acesso_em`, `falhas_login`, `bloqueado_ate`, `two_factor_enabled`

### `produtos_modulos_aulas_videos` — src/lib/db/schema/videos.ts
`id`, `criador_id`, `aula_id`, `situacao`, `nome_original`, `mime`, `tamanho_bytes`, `chave_origem`, `upload_id`, `prefixo_hls`, `chave_cifrada`, `duracao_seg`, `resolucoes`, `thumb_chave`, `erro`, `tentativas`, `processado_em`

### `produtos_modulos_aulas_videos_processamentos` — src/lib/db/schema/videos.ts
`id`, `criador_id`, `video_id`, `tentativa`, `situacao`, `iniciado_em`, `terminado_em`, `cpu_seg`, `log`

### `produtos_modulos_aulas_videos_sessoes` — src/lib/db/schema/videos.ts
`id`, `criador_id`, `video_id`, `usuario_id`, `sessao_login_id`, `ip`, `user_agent`, `ultimo_sinal_em`, `encerrada_em`, `motivo_encerramento`

## Rotas de API

| Rota | Metodos |
|------|---------|
| `/api/progresso` | POST |
| `/api/video/[id]/chave` | GET |
| `/api/video/[id]/hls/[...caminho]` | GET |
| `/api/video/[id]/situacao` | GET |

## Server Actions

- `src/lib/actions/anotacoes.ts`: `acaoCriarAnotacao()`, `acaoEditarAnotacao()`, `acaoRemoverAnotacao()`
- `src/lib/actions/aparencia.ts`: `acaoSalvarCorDaMarca()`
- `src/lib/actions/arquivos.ts`: `acaoIniciarEnvio()`, `acaoConfirmarEnvio()`
- `src/lib/actions/aulas.ts`: `acaoSalvarAula()`, `acaoDefinirThumbAula()`, `acaoAdicionarMaterial()`, `acaoRenomearMaterial()`, `acaoRemoverMaterial()`, `acaoLinkDoMaterial()`
- `src/lib/actions/auth.ts`: `entrar()`, `verificarCodigo()`, `sair()`, `pedirLinkDeSenha()`, `definirNovaSenha()`
- `src/lib/actions/criadores.ts`: `acaoCriarCriador()`, `acaoAlterarSituacaoCriador()`
- `src/lib/actions/favoritos.ts`: `acaoFavoritar()`, `acaoDesfavoritar()`
- `src/lib/actions/grupos.ts`: `acaoCriarGrupo()`, `acaoRenomearGrupo()`, `acaoRemoverGrupo()`
- `src/lib/actions/matriculas-importacao.ts`: `acaoImportarMatriculas()`
- `src/lib/actions/matriculas.ts`: `acaoMatricular()`, `acaoCancelarMatricula()`, `acaoAlterarExpiracao()`, `acaoReativarMatricula()`, `acaoBuscarMembros()`
- `src/lib/actions/membros-gestao.ts`: `acaoMudarPapel()`, `acaoAlterarSituacaoMembro()`, `acaoRemoverMembro()`, `acaoDefinirGruposDoMembro()`
- `src/lib/actions/membros.ts`: `acaoCadastrarMembro()`, `acaoImportarMembros()`
- `src/lib/actions/perfil.ts`: `acaoSalvarPerfil()`
- `src/lib/actions/preferencias.ts`: `acaoSalvarPreferencias()`
- `src/lib/actions/produtos-estrutura.ts`: `acaoCriarModulo()`, `acaoEditarModulo()`, `acaoRemoverModulo()`, `acaoReordenarModulos()`, `acaoCriarAula()`, `acaoRemoverAula()`, `acaoReordenarAulas()`
- `src/lib/actions/produtos.ts`: `acaoCriarProduto()`, `acaoSalvarProduto()`, `acaoAlterarSituacaoProduto()`, `acaoDefinirCapaProduto()`, `acaoRemoverProduto()`
- `src/lib/actions/progresso.ts`: `acaoRegistrarProgresso()`, `acaoConcluirAula()`
- `src/lib/actions/seguranca.ts`: `acaoIniciarTotp()`, `acaoConfirmarTotp()`, `acaoNovosCodigos()`, `acaoTrocarSenha()`, `acaoEncerrarOutrasSessoes()`
- `src/lib/actions/tema.ts`: `alterarTema()`
- `src/lib/actions/usuarios-senha.ts`: `acaoGerarLinkDeSenha()`
- `src/lib/actions/videos.ts`: `acaoIniciarEnvioVideo()`, `acaoAssinarPartesVideo()`, `acaoConcluirEnvioVideo()`, `acaoCancelarEnvioVideo()`, `acaoReprocessarVideo()`, `acaoIniciarReproducao()`, `acaoRenovarReproducao()`

## Paginas

- `src/app/(aluno)/[secao]/page.tsx`
- `src/app/(aluno)/aula/[id]/page.tsx`
- `src/app/(aluno)/continuar/page.tsx`
- `src/app/(aluno)/cursos/[slug]/page.tsx`
- `src/app/(aluno)/page.tsx`
- `src/app/(aluno)/perfil/page.tsx`
- `src/app/admin/[secao]/page.tsx`
- `src/app/admin/configuracoes/aparencia/page.tsx`
- `src/app/admin/conteudos/[id]/aulas/[aulaId]/page.tsx`
- `src/app/admin/conteudos/[id]/page.tsx`
- `src/app/admin/conteudos/novo/page.tsx`
- `src/app/admin/conteudos/page.tsx`
- `src/app/admin/matriculas/importar/page.tsx`
- `src/app/admin/matriculas/page.tsx`
- `src/app/admin/membros/cadastrar/page.tsx`
- `src/app/admin/membros/grupos/page.tsx`
- `src/app/admin/membros/importar/page.tsx`
- `src/app/admin/membros/page.tsx`
- `src/app/admin/page.tsx`
- `src/app/componentes/admin/page.tsx`
- `src/app/componentes/aluno/page.tsx`
- `src/app/componentes/page.tsx`
- `src/app/conta/seguranca/page.tsx`
- `src/app/login/page.tsx`
- `src/app/login/verificar/page.tsx`
- `src/app/plataforma/novo/page.tsx`
- `src/app/plataforma/page.tsx`
- `src/app/primeiro-acesso/page.tsx`
- `src/app/recuperar-senha/page.tsx`
