# Mapa do Projeto

> Gerado por `scripts/project-map.mjs`. Leia este resumo antes de explorar arquivos.

## Resumo

| Metrica | Total |
|---------|-------|
| Arquivos TS/TSX | 721 |
| Tabelas (Drizzle) | 61 |
| Server Actions (arquivos) | 35 |
| Rotas de API | 10 |
| Paginas | 80 |
| Componentes | 155 |

## Arvore (profundidade 3)

```
app/
  _autenticacao/
    moldura-autenticacao.tsx
    pecas.tsx
  (aluno)/
    _vitrine/
    assistente/
    aula/
    avaliacoes/
    certificados/
    comunidade/
    conquistas/
    continuar/
    cursos/
    eventos/
    notificacoes/
    perfil/
    previa-vitrine/
    trilhas/
    layout.tsx
    page.tsx
  admin/
    _components/
    [secao]/
    analytics/
    area-de-membros/
    assistente-do-professor/
    avaliacoes/
    base-de-conhecimento/
    certificados/
    comunidade/
    configuracoes/
    construtor/
    conteudos/
    desafios/
    estudio-de-video/
    eventos/
    matriculas/
    membros/
    trilhas/
    layout.tsx
    page.tsx
  api/
    assistente/
    legendas/
    notificacoes/
    progresso/
    video/
  certificado/
    [codigo]/
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
    moldura-abas.tsx
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
    seletor-datas.test.tsx
    seletor-datas.tsx
    shell-admin.tsx
    sidebar-admin.tsx
    tabela-tipos.ts
    use-envio-arquivo.ts
  aluno/
    botao-favoritar.test.tsx
    botao-favoritar.tsx
    cena-autenticacao.tsx
    formatos.test.ts
    formatos.ts
    layout-autenticacao.tsx
    menu-aluno.tsx
    navegacao.test.ts
    navegacao.ts
    shell-aluno.tsx
    tab-bar-aluno.tsx
  assistente/
    chat-assistente.test.tsx
    chat-assistente.tsx
    resposta-assistente.tsx
    stream.ts
  avaliacoes/
    botao-iniciar.tsx
    editor-questao.test.tsx
    editor-questao.tsx
    formatos.ts
    responder-tentativa.test.tsx
    responder-tentativa.tsx
    resultado-tentativa.test.tsx
    resultado-tentativa.tsx
  certificados/
    atualizar-enquanto-gera.tsx
    botao-baixar-certificado.tsx
    previa-certificado.test.tsx
    previa-certificado.tsx
    verificacao-publica.test.tsx
    verificacao-publica.tsx
  comunidade/
    botao-curtir.tsx
    comentarios.tsx
    compositor-comunidade.tsx
    comunidade.test.tsx
    dialogo-motivo.tsx
    extras-post.tsx
    feed-comunidade.tsx
    formatos.ts
    menu-conteudo.tsx
    menu-filtro.tsx
    post-aberto.tsx
    post-comunidade.tsx
    seletor-canal.tsx
    texto-com-links.tsx
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
    bloco-data.tsx
    cartao-certificado.test.tsx
    cartao-certificado.tsx
    cartao-encontro-ao-vivo.tsx
    cartao-fixados.tsx
    cartao-membros-ativos.tsx
    cartao-perfil.tsx
    cartao-post.tsx
    cartao-trilha.tsx
    compositor-post.test.tsx
    compositor-post.tsx
    encontro-da-comunidade.tsx
    etapas-trilha.test.tsx
    etapas-trilha.tsx
    linha-avaliacao.tsx
    linha-cartao.tsx
    linha-preferencia.tsx
    lista-canais.tsx
  gamificacao/
    periodo-ranking.tsx
  marca/
    estilo-marca.test.tsx
    estilo-marca.tsx
    logo.tsx
  matriculas/
    dialogo-matricular.tsx
  notificacoes/
    item-notificacao.tsx
    leitura.ts
    lista-completa.tsx
    painel-notificacoes.tsx
    sino-notificacoes.test.tsx
    sino-notificacoes.tsx
    tempo.test.ts
    tempo.ts
    use-contagem.ts
  player/
    acumulador.test.ts
    acumulador.ts
    atalhos.test.ts
    atalhos.ts
    barra-tempo.tsx
    controles-player.tsx
    fim-da-aula.test.tsx
    fim-da-aula.tsx
    legenda-na-tela.tsx
    legendas-player.test.tsx
    menu-player.tsx
    player-aula.tsx
    use-contagem.ts
    use-legenda.ts
    use-progresso.test.tsx
    use-progresso.ts
  trilhas/
    etapa-trilha.test.tsx
    etapa-trilha.tsx
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
    segmentos-link.tsx
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
    assistente.ts
    aulas.ts
    auth.ts
    avaliacoes-aluno.ts
    avaliacoes.ts
    certificados.ts
    comunidade-moderacao.ts
    comunidade.ts
    configuracoes.ts
    conhecimento.ts
    criadores.ts
    eventos.ts
    favoritos.ts
    gamificacao.ts
    grupos.ts
    legendas.ts
    matriculas-importacao.ts
    matriculas.ts
    membros-gestao.ts
    membros.ts
    notificacoes.ts
    perfil.ts
    preferencias.ts
    produtos-estrutura.ts
    produtos.ts
    progresso.ts
    seguranca.ts
    tema.ts
    trilhas.ts
    usuarios-senha.ts
    videos.ts
    vitrine.ts
  analytics/
    cache.ts
    consultas-avaliacoes.ts
    consultas.ts
    csv.ts
    exportar.ts
    regras.test.ts
    regras.ts
  armazenamento/
    arquivos.ts
    cliente.ts
    envio.ts
    regras.test.ts
    regras.ts
  assistente/
    admin.ts
    cliente-falso.ts
    cliente.ts
    config.ts
    conversas.ts
    regras.test.ts
    regras.ts
    responder.ts
    rota.ts
    tela.ts
    texto.test.ts
    texto.ts
  audit/
    consultas.ts
    registrar.ts
    regras.test.ts
    regras.ts
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
  avaliacoes/
    admin.ts
    consultas.ts
    estrutura.ts
    regras.test.ts
    regras.ts
    situacao.ts
    sql.ts
    tentativas.ts
  catalogo/
    consultas.ts
    ordem.ts
    publicacao.ts
    regras.test.ts
    regras.ts
  certificados/
    consultas.ts
    emissao.ts
    fila.ts
    pdf.ts
    regras.test.ts
    regras.ts
    worker.ts
  comunidade/
    anexos.ts
    canais.ts
    comentarios.ts
    consultas.ts
    moderacao.ts
    publicacoes.ts
    regras.test.ts
    regras.ts
    sql.ts
  conhecimento/
    busca.ts
    consultas.ts
    fila.ts
    indexar.ts
    pedir.ts
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
  eventos/
    admin.ts
    agenda-ics.test.ts
    agenda-ics.ts
    consultas.ts
    fila.ts
    lembrete.ts
    presenca.ts
    regras.test.ts
    regras.ts
    rota-agenda.ts
    sql.ts
    tela.test.ts
    tela.ts
  gamificacao/
    admin.ts
    conquistas.ts
    desafios.ts
    padroes.ts
    pontos.ts
    ranking.ts
    recalcular.ts
    regras.test.ts
    regras.ts
  legendas/
    consultas.ts
    entrega.ts
    regras.test.ts
    regras.ts
    servico.ts
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
  notificacoes/
    consultas.ts
    gerar.ts
    regras.test.ts
    regras.ts
    rota.ts
  painel/
    cache.ts
    consultas.ts
    periodo.test.ts
    periodo.ts
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
  trilhas/
    consultas.ts
    regras.test.ts
    regras.ts
  validators/
    avaliacoes.ts
    catalogo.test.ts
    catalogo.ts
    comunidade.ts
    criadores.test.ts
    criadores.ts
    eventos.test.ts
    eventos.ts
    gamificacao.ts
    ia.ts
    legendas.ts
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
    estudio.ts
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
  vitrine/
    cache.ts
    config.ts
    dados.ts
    resolver.ts
  acao.ts
  tema-constantes.ts
  tema.ts
  utils.ts
proxy.ts
```

## Tabelas (Drizzle)

### `arquivos` — src/lib/db/schema/arquivos.ts
`id`, `criador_id`, `chave`, `finalidade`, `nome_original`, `mime`, `tamanho_bytes`, `status`

### `criadores_assistentes` — src/lib/db/schema/assistente.ts
`id`, `criador_id`, `ligado`, `nome`, `instrucoes`, `limite_diario`, `todos_os_cursos`

### `criadores_assistentes_produtos` — src/lib/db/schema/assistente.ts
`id`, `criador_id`, `produto_id`

### `criadores_assistentes_conversas` — src/lib/db/schema/assistente.ts
`id`, `criador_id`, `membro_id`, `aula_id`, `titulo`, `teste`

### `criadores_assistentes_conversas_mensagens` — src/lib/db/schema/assistente.ts
`id`, `criador_id`, `conversa_id`, `membro_id`, `papel`, `texto`, `fontes`, `tokens_entrada`, `tokens_saida`, `tokens_cache_leitura`, `tokens_cache_escrita`, `modelo`, `sem_resposta`, `interrompida`

### `auditoria` — src/lib/db/schema/auditoria.ts
`id`, `user_id`, `criador_id`, `acao`, `tabela`, `registro_id`, `detalhes`, `dados_anteriores`, `dados_novos`, `created_at`

### `produtos_avaliacoes` — src/lib/db/schema/avaliacoes.ts
`id`, `criador_id`, `produto_id`, `modulo_id`, `tipo`, `titulo`, `instrucoes`, `nota_minima`, `tentativas_max`, `tempo_limite_min`, `obrigatoria_para_certificado`, `libera_proximo_modulo`, `embaralhar`, `exige_aulas_concluidas`, `status`, `publicada_em`

### `produtos_avaliacoes_questoes` — src/lib/db/schema/avaliacoes.ts
`id`, `criador_id`, `avaliacao_id`, `ordem`, `tipo`, `enunciado`, `opcoes`, `gabarito`, `peso`, `explicacao`

### `produtos_avaliacoes_tentativas` — src/lib/db/schema/avaliacoes.ts
`id`, `criador_id`, `avaliacao_id`, `membro_id`, `numero`, `iniciada_em`, `prazo_em`, `finalizada_em`, `finalizada_por`, `ordem`, `respostas`, `nota`, `aprovada`, `correcao`

### `produtos_avaliacoes_concessoes` — src/lib/db/schema/avaliacoes.ts
`id`, `criador_id`, `avaliacao_id`, `membro_id`, `quantidade`, `motivo`

### `criadores_certificados_modelos` — src/lib/db/schema/certificados.ts
`id`, `criador_id`, `produto_id`, `titulo`, `texto`, `assinatura_nome`, `assinatura_cargo`, `cor`

### `produtos_certificados` — src/lib/db/schema/certificados.ts
`id`, `criador_id`, `produto_id`, `membro_id`, `matricula_id`, `codigo`, `situacao`, `emitido_em`, `revogado_em`, `motivo_revogacao`

### `produtos_certificados_versoes` — src/lib/db/schema/certificados.ts
`id`, `criador_id`, `certificado_id`, `versao`, `situacao`, `dados`, `arquivo_id`, `gerada_em`, `erro`

### `criadores_denuncias` — src/lib/db/schema/comunidade-moderacao.ts
`id`, `criador_id`, `denunciante_membro_id`, `post_id`, `comentario_id`, `motivo`, `situacao`, `resolvida_em`, `decisao`

### `criadores_membros_silenciamentos` — src/lib/db/schema/comunidade-moderacao.ts
`id`, `criador_id`, `membro_id`, `ate`, `motivo`

### `criadores_membros_notificacoes` — src/lib/db/schema/comunidade-moderacao.ts
`id`, `criador_id`, `membro_id`, `tipo`, `dados`, `chave`, `atores`, `total`, `evento_em`, `lida_em`, `arquivada_em`

### `criadores_canais` — src/lib/db/schema/comunidade.ts
`id`, `criador_id`, `nome`, `descricao`, `ordem`, `acesso`, `grupo_id`, `produto_id`, `quem_posta`, `padrao`

### `criadores_canais_posts` — src/lib/db/schema/comunidade.ts
`id`, `criador_id`, `canal_id`, `autor_membro_id`, `aula_id`, `texto`, `enquete_pergunta`, `enquete_opcoes`, `enquete_encerra_em`, `fixado_em`, `oculto_em`, `motivo_ocultacao`, `editado_em`, `curtidas`, `comentarios`

### `criadores_canais_posts_anexos` — src/lib/db/schema/comunidade.ts
`id`, `criador_id`, `post_id`, `arquivo_id`, `ordem`

### `criadores_canais_posts_votos` — src/lib/db/schema/comunidade.ts
`id`, `criador_id`, `post_id`, `membro_id`, `opcao`

### `criadores_comentarios` — src/lib/db/schema/comunidade.ts
`id`, `criador_id`, `post_id`, `aula_id`, `pai_id`, `autor_membro_id`, `texto`, `oculto_em`, `motivo_ocultacao`, `editado_em`, `curtidas`

### `criadores_curtidas` — src/lib/db/schema/comunidade.ts
`id`, `criador_id`, `membro_id`, `post_id`, `comentario_id`

### `criadores_conhecimento_documentos` — src/lib/db/schema/conhecimento.ts
`id`, `criador_id`, `fonte`, `aula_id`, `produto_id`, `titulo`, `texto`, `incluir`, `assinatura`, `trechos`, `indexado_em`

### `criadores_conhecimento_documentos_trechos` — src/lib/db/schema/conhecimento.ts
`id`, `criador_id`, `documento_id`, `ordem`, `texto`, `inicio_seg`, `busca`

### `criadores_grupos` — src/lib/db/schema/criadores-grupos.ts
`id`, `criador_id`, `nome`, `tipo`

### `criadores_grupos_membros` — src/lib/db/schema/criadores-grupos.ts
`id`, `criador_id`, `grupo_id`, `membro_id`

### `criadores` — src/lib/db/schema/criadores.ts
`id`, `slug`, `nome`, `cor_marca`, `status`, `dominio_proprio`

### `criadores_membros` — src/lib/db/schema/criadores.ts
`id`, `criador_id`, `usuario_id`, `papel`, `status`, `ultimo_acesso_em`

### `criadores_eventos` — src/lib/db/schema/eventos.ts
`id`, `criador_id`, `titulo`, `descricao`, `inicio_em`, `duracao_min`, `link_acesso`, `situacao`, `publico`, `produto_id`, `gravacao_aula_id`, `publicado_em`, `cancelado_em`, `criado_por`

### `criadores_eventos_grupos` — src/lib/db/schema/eventos.ts
`id`, `criador_id`, `evento_id`, `grupo_id`

### `criadores_eventos_inscricoes` — src/lib/db/schema/eventos.ts
`id`, `criador_id`, `evento_id`, `membro_id`

### `criadores_membros_favoritos` — src/lib/db/schema/favoritos.ts
`id`, `criador_id`, `membro_id`, `produto_id`, `aula_id`

### `criadores_gamificacao` — src/lib/db/schema/gamificacao.ts
`id`, `criador_id`, `ligada`, `pontos_aula_concluida`, `pontos_curso_concluido`, `pontos_avaliacao_aprovada`, `pontos_publicacao_comunidade`, `niveis`

### `criadores_membros_pontos` — src/lib/db/schema/gamificacao.ts
`id`, `criador_id`, `membro_id`, `motivo`, `pontos`, `referencia`, `ocorrido_em`, `justificativa`, `created_at`, `modified_by`

### `criadores_desafios` — src/lib/db/schema/gamificacao.ts
`id`, `criador_id`, `titulo`, `descricao`, `inicio_em`, `fim_em`, `meta_tipo`, `meta_quantidade`, `meta_produto_id`, `meta_avaliacao_id`, `pontos_bonus`, `recompensa`, `situacao`, `publico`, `criado_por`

### `criadores_desafios_grupos` — src/lib/db/schema/gamificacao.ts
`id`, `criador_id`, `desafio_id`, `grupo_id`

### `criadores_desafios_participacoes` — src/lib/db/schema/gamificacao.ts
`id`, `criador_id`, `desafio_id`, `membro_id`, `concluido_em`, `recompensa_entregue_em`, `recompensa_entregue_por`

### `produtos_modulos_aulas_legendas` — src/lib/db/schema/legendas.ts
`id`, `criador_id`, `aula_id`, `idioma`, `rotulo`, `nome_original`, `chave`, `texto`, `trechos`, `duracao_seg`, `enviado_por`

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
`id`, `criador_id`, `membro_id`, `aula_id`, `segundos_bitmap`, `segundos_assistidos`, `max_posicao_seg`, `ultima_posicao_seg`, `percentual`, `concluida`, `concluida_em`, `concluida_por`, `ultima_visualizacao_dia`, `visualizacao_nova`, `segundos_novos`

### `produtos_modulos_aulas_visualizacoes` — src/lib/db/schema/progresso.ts
`id`, `criador_id`, `aula_id`, `dia`, `visualizacoes`

### `criadores_membros_atividades` — src/lib/db/schema/progresso.ts
`id`, `criador_id`, `membro_id`, `dia`, `segundos`

### `produtos_modulos_aulas_anotacoes` — src/lib/db/schema/progresso.ts
`id`, `criador_id`, `membro_id`, `aula_id`, `tempo_seg`, `texto`

### `criadores_trilhas` — src/lib/db/schema/trilhas.ts
`id`, `criador_id`, `titulo`, `descricao`, `tag`, `capa_arquivo_id`, `status`, `publicada_em`

### `criadores_trilhas_itens` — src/lib/db/schema/trilhas.ts
`id`, `criador_id`, `trilha_id`, `ordem`, `tipo`, `produto_id`, `avaliacao_id`, `exige_anterior`

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
`id`, `nome`, `email`, `email_verificado`, `imagem`, `papel_plataforma`, `ativo`, `tema`, `reproducao_automatica`, `lembretes`, `aparecer_no_ranking`, `whatsapp`, `empresa_cargo`, `ultimo_acesso_em`, `falhas_login`, `bloqueado_ate`, `two_factor_enabled`

### `produtos_modulos_aulas_videos` — src/lib/db/schema/videos.ts
`id`, `criador_id`, `aula_id`, `situacao`, `nome_original`, `mime`, `tamanho_bytes`, `chave_origem`, `upload_id`, `prefixo_hls`, `chave_cifrada`, `duracao_seg`, `resolucoes`, `thumb_chave`, `erro`, `tentativas`, `processado_em`

### `produtos_modulos_aulas_videos_processamentos` — src/lib/db/schema/videos.ts
`id`, `criador_id`, `video_id`, `tentativa`, `situacao`, `iniciado_em`, `terminado_em`, `cpu_seg`, `log`

### `produtos_modulos_aulas_videos_sessoes` — src/lib/db/schema/videos.ts
`id`, `criador_id`, `video_id`, `usuario_id`, `sessao_login_id`, `ip`, `user_agent`, `ultimo_sinal_em`, `encerrada_em`, `motivo_encerramento`

### `criadores_vitrines` — src/lib/db/schema/vitrines.ts
`id`, `criador_id`, `rascunho`

### `criadores_vitrines_versoes` — src/lib/db/schema/vitrines.ts
`id`, `criador_id`, `vitrine_id`, `numero`, `config`, `publicada_em`, `publicada_por`

## Rotas de API

| Rota | Metodos |
|------|---------|
| `/admin/analytics/exportar` | GET |
| `/api/assistente` | POST |
| `/api/legendas/[id]` | GET |
| `/api/notificacoes/contagem` | GET |
| `/api/progresso` | POST |
| `/api/video/[id]/chave` | GET |
| `/api/video/[id]/hls/[...caminho]` | GET |
| `/api/video/[id]/situacao` | GET |
| `/certificado/[codigo]/pdf` | GET |
| `/eventos/[id]/agenda.ics` | GET |

## Server Actions

- `src/lib/actions/anotacoes.ts`: `acaoCriarAnotacao()`, `acaoEditarAnotacao()`, `acaoRemoverAnotacao()`
- `src/lib/actions/aparencia.ts`: `acaoSalvarCorDaMarca()`
- `src/lib/actions/arquivos.ts`: `acaoIniciarEnvio()`, `acaoConfirmarEnvio()`
- `src/lib/actions/assistente.ts`: `acaoSalvarConfigAssistente()`, `acaoApagarConversa()`
- `src/lib/actions/aulas.ts`: `acaoSalvarAula()`, `acaoDefinirThumbAula()`, `acaoAdicionarMaterial()`, `acaoRenomearMaterial()`, `acaoRemoverMaterial()`, `acaoLinkDoMaterial()`
- `src/lib/actions/auth.ts`: `entrar()`, `verificarCodigo()`, `sair()`, `pedirLinkDeSenha()`, `definirNovaSenha()`
- `src/lib/actions/avaliacoes-aluno.ts`: `acaoIniciarTentativa()`, `acaoResponder()`, `acaoFinalizarTentativa()`
- `src/lib/actions/avaliacoes.ts`: `acaoCriarAvaliacao()`, `acaoSalvarAvaliacao()`, `acaoAlterarSituacaoAvaliacao()`, `acaoRemoverAvaliacao()`, `acaoCriarQuestao()`, `acaoSalvarQuestao()`, `acaoRemoverQuestao()`, `acaoReordenarQuestoes()`, `acaoConcederTentativa()`
- `src/lib/actions/certificados.ts`: `acaoSalvarModeloCertificado()`, `acaoGerarNovaVersaoCertificado()`, `acaoRevogarCertificado()`, `acaoBaixarCertificado()`
- `src/lib/actions/comunidade-moderacao.ts`: `acaoFixarPublicacao()`, `acaoOcultar()`, `acaoResolverDenuncia()`, `acaoSilenciarMembro()`, `acaoDessilenciarMembro()`, `acaoCriarCanal()`, `acaoSalvarCanal()`, `acaoRemoverCanal()`
- `src/lib/actions/comunidade.ts`: `acaoPublicar()`, `acaoEditarPublicacao()`, `acaoRemoverPublicacao()`, `acaoVotarEnquete()`, `acaoCurtir()`, `acaoComentar()`, `acaoEditarComentario()`, `acaoRemoverComentario()`, `acaoDenunciar()`, `acaoIniciarEnvioAnexo()`, `acaoConfirmarEnvioAnexo()`, `acaoLinkDoAnexo()`, `acaoMaisPublicacoes()`
- `src/lib/actions/configuracoes.ts`: `acaoRenomearArea()`
- `src/lib/actions/conhecimento.ts`: `acaoCriarTexto()`, `acaoSalvarTexto()`, `acaoExcluirTexto()`, `acaoIncluirDocumento()`, `acaoTestarBusca()`
- `src/lib/actions/criadores.ts`: `acaoCriarCriador()`, `acaoAlterarSituacaoCriador()`
- `src/lib/actions/eventos.ts`: `acaoCriarEvento()`, `acaoSalvarEvento()`, `acaoPublicarEvento()`, `acaoCancelarEvento()`, `acaoExcluirEvento()`, `acaoConfirmarPresenca()`, `acaoCancelarPresenca()`
- `src/lib/actions/favoritos.ts`: `acaoFavoritar()`, `acaoDesfavoritar()`
- `src/lib/actions/gamificacao.ts`: `acaoSalvarConfigGamificacao()`, `acaoSalvarDesafio()`, `acaoPublicarDesafio()`, `acaoEncerrarDesafio()`, `acaoExcluirDesafio()`, `acaoMarcarRecompensaEntregue()`, `acaoAjustarPontos()`, `acaoParticiparDoDesafio()`
- `src/lib/actions/grupos.ts`: `acaoCriarGrupo()`, `acaoRenomearGrupo()`, `acaoRemoverGrupo()`
- `src/lib/actions/legendas.ts`: `acaoEnviarLegenda()`, `acaoRemoverLegenda()`
- `src/lib/actions/matriculas-importacao.ts`: `acaoImportarMatriculas()`
- `src/lib/actions/matriculas.ts`: `acaoMatricular()`, `acaoCancelarMatricula()`, `acaoAlterarExpiracao()`, `acaoReativarMatricula()`, `acaoBuscarMembros()`
- `src/lib/actions/membros-gestao.ts`: `acaoMudarPapel()`, `acaoAlterarSituacaoMembro()`, `acaoRemoverMembro()`, `acaoDefinirGruposDoMembro()`
- `src/lib/actions/membros.ts`: `acaoCadastrarMembro()`, `acaoImportarMembros()`
- `src/lib/actions/notificacoes.ts`: `acaoMarcarNotificacoesLidas()`, `acaoMaisNotificacoes()`
- `src/lib/actions/perfil.ts`: `acaoSalvarPerfil()`
- `src/lib/actions/preferencias.ts`: `acaoSalvarPreferencias()`
- `src/lib/actions/produtos-estrutura.ts`: `acaoCriarModulo()`, `acaoEditarModulo()`, `acaoRemoverModulo()`, `acaoReordenarModulos()`, `acaoCriarAula()`, `acaoRemoverAula()`, `acaoReordenarAulas()`
- `src/lib/actions/produtos.ts`: `acaoCriarProduto()`, `acaoSalvarProduto()`, `acaoAlterarSituacaoProduto()`, `acaoDefinirCapaProduto()`, `acaoRemoverProduto()`
- `src/lib/actions/progresso.ts`: `acaoRegistrarProgresso()`, `acaoConcluirAula()`
- `src/lib/actions/seguranca.ts`: `acaoIniciarTotp()`, `acaoConfirmarTotp()`, `acaoNovosCodigos()`, `acaoTrocarSenha()`, `acaoEncerrarOutrasSessoes()`
- `src/lib/actions/tema.ts`: `alterarTema()`
- `src/lib/actions/trilhas.ts`: `acaoCriarTrilha()`, `acaoSalvarTrilha()`, `acaoDefinirCapaTrilha()`, `acaoAlterarSituacaoTrilha()`, `acaoRemoverTrilha()`, `acaoAdicionarItemTrilha()`, `acaoSalvarItemTrilha()`, `acaoRemoverItemTrilha()`, `acaoReordenarItensTrilha()`
- `src/lib/actions/usuarios-senha.ts`: `acaoGerarLinkDeSenha()`
- `src/lib/actions/videos.ts`: `acaoIniciarEnvioVideo()`, `acaoAssinarPartesVideo()`, `acaoConcluirEnvioVideo()`, `acaoCancelarEnvioVideo()`, `acaoReprocessarVideo()`, `acaoIniciarReproducao()`, `acaoRenovarReproducao()`
- `src/lib/actions/vitrine.ts`: `acaoSalvarRascunhoVitrine()`, `acaoPublicarVitrine()`, `acaoReverterVitrine()`, `acaoDescartarRascunhoVitrine()`, `acaoBuscarConteudoVitrine()`, `acaoPrepararImagemDestaque()`

## Paginas

- `src/app/(aluno)/assistente/page.tsx`
- `src/app/(aluno)/aula/[id]/page.tsx`
- `src/app/(aluno)/avaliacoes/[id]/page.tsx`
- `src/app/(aluno)/avaliacoes/[id]/resultado/[tentativaId]/page.tsx`
- `src/app/(aluno)/avaliacoes/[id]/tentativa/[tentativaId]/page.tsx`
- `src/app/(aluno)/avaliacoes/page.tsx`
- `src/app/(aluno)/certificados/page.tsx`
- `src/app/(aluno)/comunidade/page.tsx`
- `src/app/(aluno)/conquistas/page.tsx`
- `src/app/(aluno)/continuar/page.tsx`
- `src/app/(aluno)/cursos/[slug]/page.tsx`
- `src/app/(aluno)/eventos/[id]/page.tsx`
- `src/app/(aluno)/eventos/page.tsx`
- `src/app/(aluno)/notificacoes/page.tsx`
- `src/app/(aluno)/page.tsx`
- `src/app/(aluno)/perfil/page.tsx`
- `src/app/(aluno)/previa-vitrine/page.tsx`
- `src/app/(aluno)/trilhas/[id]/page.tsx`
- `src/app/(aluno)/trilhas/page.tsx`
- `src/app/admin/[secao]/page.tsx`
- `src/app/admin/analytics/page.tsx`
- `src/app/admin/area-de-membros/page.tsx`
- `src/app/admin/assistente-do-professor/consumo/page.tsx`
- `src/app/admin/assistente-do-professor/page.tsx`
- `src/app/admin/assistente-do-professor/perguntas/page.tsx`
- `src/app/admin/assistente-do-professor/testar/page.tsx`
- `src/app/admin/avaliacoes/[id]/alunos/page.tsx`
- `src/app/admin/avaliacoes/[id]/page.tsx`
- `src/app/admin/avaliacoes/nova/page.tsx`
- `src/app/admin/avaliacoes/page.tsx`
- `src/app/admin/base-de-conhecimento/page.tsx`
- `src/app/admin/base-de-conhecimento/testar/page.tsx`
- `src/app/admin/base-de-conhecimento/textos/[id]/page.tsx`
- `src/app/admin/base-de-conhecimento/textos/novo/page.tsx`
- `src/app/admin/certificados/modelo/page.tsx`
- `src/app/admin/certificados/page.tsx`
- `src/app/admin/comunidade/page.tsx`
- `src/app/admin/configuracoes/aparencia/page.tsx`
- `src/app/admin/configuracoes/dominios/page.tsx`
- `src/app/admin/configuracoes/equipe/convidar/page.tsx`
- `src/app/admin/configuracoes/equipe/page.tsx`
- `src/app/admin/configuracoes/gamificacao/page.tsx`
- `src/app/admin/configuracoes/geral/page.tsx`
- `src/app/admin/configuracoes/logs/page.tsx`
- `src/app/admin/construtor/page.tsx`
- `src/app/admin/conteudos/[id]/aulas/[aulaId]/page.tsx`
- `src/app/admin/conteudos/[id]/page.tsx`
- `src/app/admin/conteudos/novo/page.tsx`
- `src/app/admin/conteudos/page.tsx`
- `src/app/admin/desafios/[id]/page.tsx`
- `src/app/admin/desafios/novo/page.tsx`
- `src/app/admin/desafios/page.tsx`
- `src/app/admin/desafios/ranking/page.tsx`
- `src/app/admin/desafios/recompensas/page.tsx`
- `src/app/admin/estudio-de-video/page.tsx`
- `src/app/admin/eventos/[id]/page.tsx`
- `src/app/admin/eventos/novo/page.tsx`
- `src/app/admin/eventos/page.tsx`
- `src/app/admin/matriculas/importar/page.tsx`
- `src/app/admin/matriculas/page.tsx`
- `src/app/admin/membros/cadastrar/page.tsx`
- `src/app/admin/membros/gamificacao/page.tsx`
- `src/app/admin/membros/grupos/page.tsx`
- `src/app/admin/membros/importar/page.tsx`
- `src/app/admin/membros/page.tsx`
- `src/app/admin/page.tsx`
- `src/app/admin/trilhas/[id]/page.tsx`
- `src/app/admin/trilhas/nova/page.tsx`
- `src/app/admin/trilhas/page.tsx`
- `src/app/certificado/[codigo]/page.tsx`
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
