# Mapa do Projeto

> Gerado por `scripts/project-map.mjs`. Leia este resumo antes de explorar arquivos.

## Resumo

| Metrica | Total |
|---------|-------|
| Arquivos TS/TSX | 237 |
| Tabelas (Drizzle) | 12 |
| Server Actions (arquivos) | 9 |
| Rotas de API | 0 |
| Paginas | 20 |
| Componentes | 86 |

## Arvore (profundidade 3)

```
app/
  _autenticacao/
    moldura-autenticacao.tsx
    pecas.tsx
  (aluno)/
    [secao]/
    perfil/
    layout.tsx
    page.tsx
  admin/
    [secao]/
    configuracoes/
    membros/
    layout.tsx
    page.tsx
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
    cartao-kpi.tsx
    celula-tabela.tsx
    dialogo-admin.tsx
    link-de-acesso.tsx
    menu-admin.tsx
    navegacao.test.ts
    navegacao.ts
    pagina-cards.tsx
    pagina-tabela.test.tsx
    pagina-tabela.tsx
    saudacao.test.ts
    saudacao.ts
    seletor-periodo.tsx
    shell-admin.tsx
    sidebar-admin.tsx
    tabela-tipos.ts
  aluno/
    cena-autenticacao.tsx
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
    selo.tsx
    use-selecao-unica.ts
  vitrine/
    cartao-fileira.test.tsx
    cartao-fileira.tsx
    destaque.tsx
    fileira.test.tsx
    fileira.tsx
    tipos.ts
  modal-confirmacao-block.test.tsx
  modal-confirmacao-block.tsx
lib/
  actions/
    aparencia.ts
    auth.ts
    criadores.ts
    grupos.ts
    membros-gestao.ts
    membros.ts
    seguranca.ts
    tema.ts
    usuarios-senha.ts
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
  membros/
    consultas.ts
    csv.test.ts
    csv.ts
    primeiro-acesso.ts
    regras.test.ts
    regras.ts
    vinculos.ts
  validators/
    criadores.test.ts
    criadores.ts
    membros.ts
    senha.test.ts
    senha.ts
  acao.ts
  tema-constantes.ts
  tema.ts
  utils.ts
proxy.ts
```

## Tabelas (Drizzle)

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
`id`, `nome`, `email`, `email_verificado`, `imagem`, `papel_plataforma`, `ativo`, `tema`, `whatsapp`, `empresa_cargo`, `ultimo_acesso_em`, `falhas_login`, `bloqueado_ate`, `two_factor_enabled`

## Server Actions

- `src/lib/actions/aparencia.ts`: `acaoSalvarCorDaMarca()`
- `src/lib/actions/auth.ts`: `entrar()`, `verificarCodigo()`, `sair()`, `pedirLinkDeSenha()`, `definirNovaSenha()`
- `src/lib/actions/criadores.ts`: `acaoCriarCriador()`, `acaoAlterarSituacaoCriador()`
- `src/lib/actions/grupos.ts`: `acaoCriarGrupo()`, `acaoRenomearGrupo()`, `acaoRemoverGrupo()`
- `src/lib/actions/membros-gestao.ts`: `acaoMudarPapel()`, `acaoAlterarSituacaoMembro()`, `acaoRemoverMembro()`, `acaoDefinirGruposDoMembro()`
- `src/lib/actions/membros.ts`: `acaoCadastrarMembro()`, `acaoImportarMembros()`
- `src/lib/actions/seguranca.ts`: `acaoIniciarTotp()`, `acaoConfirmarTotp()`, `acaoNovosCodigos()`, `acaoTrocarSenha()`, `acaoEncerrarOutrasSessoes()`
- `src/lib/actions/tema.ts`: `alterarTema()`
- `src/lib/actions/usuarios-senha.ts`: `acaoGerarLinkDeSenha()`

## Paginas

- `src/app/(aluno)/[secao]/page.tsx`
- `src/app/(aluno)/page.tsx`
- `src/app/(aluno)/perfil/page.tsx`
- `src/app/admin/[secao]/page.tsx`
- `src/app/admin/configuracoes/aparencia/page.tsx`
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
