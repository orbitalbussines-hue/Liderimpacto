# ADR-0013: Legendas e transcrição: VTT normalizado no storage, texto puro no banco, entrega pelo app

- **Status**: Aceito
- **Data**: 2026-10-14
- **Decisores**: Paulo (Bah! Tech)

## Contexto

Primeiro passo da parte de IA: a aula precisa de legenda (acessibilidade, assistir sem som) e de
transcrição (aba na página da aula, busca). A futura Base de conhecimento com Claude vai precisar do
texto de cada aula. Legenda é arquivo de TERCEIRO (exportado de editor, serviço de transcrição,
YouTube): pode vir em SRT ou VTT, em UTF-8 ou Windows-1252, com tags de formatação e, no pior caso,
com HTML/JS colado. O vídeo já é protegido (ADR-0005): a legenda de uma aula paga também é conteúdo pago.

## Decisão

1. **Tabela `produtos_modulos_aulas_legendas`** (migração 0010): aula por FK composta
   `(aula_id, criador_id)`, `idioma` (BCP-47 simples, CHECK), `rotulo`, `nome_original`, `chave` do
   `.vtt` (CHECK `criadores/<criador>/legendas/%`), `texto` (transcrição em texto puro, sem tempos),
   `trechos`, `duracao_seg` (fim do último trecho), `enviado_por` (FK usuários) e as colunas de
   auditoria. **Uma viva por (aula, idioma)** (índice único parcial). Trocar = soft delete da anterior
   + linha nova; o `.vtt` da anterior FICA no storage (KB): o histórico guarda texto e tempos.
2. **Envio em dois tempos, reaproveitando o ADR-0004**: o arquivo bruto sobe direto ao storage pela
   finalidade `LEGENDA` da allowlist (`.vtt`/`.srt`, 2 MB, pasta `legendas-envios`), é confirmado
   por HEAD e só então `acaoEnviarLegenda` o LÊ no servidor (com teto de bytes), valida, converte e
   grava o `.vtt` normalizado em `criadores/<criador>/legendas/<id>.vtt`. O bruto é descartado na
   mesma transação (registro) e apagado depois do commit (objeto). Não se mexeu no limite de corpo
   das Server Actions (1 MB) nem se abriu rota de upload própria.
3. **Parser próprio** (`src/lib/legendas/regras.ts`, puro, ~200 linhas, sem dependência): WebVTT
   (NOTE/STYLE/REGION ignorados, ajustes de posição descartados) e SRT; BOM, CRLF/CR, UTF-16 com
   BOM; Windows-1252 quando não é UTF-8 válido (tabela própria para 0x80–0x9F: o Node 24 decodifica
   esse rótulo como ISO-8859-1). Recusa com a linha do problema. **Sanitização = texto puro**: toda
   tag sai (`<b>`, `<i>`, `<c.x>`, `<v Nome>`, `<00:01.000>`, `<script>`, `{\an8}`), entidades são
   decodificadas DEPOIS (então `&lt;script&gt;` vira o texto "<script>", nunca uma tag), invisíveis
   e controles saem. Na saída o texto é escapado (`& < >`), então o `.vtt` normalizado não tem tag
   nenhuma e "-->" no texto não quebra a estrutura. O mesmo módulo roda na tela (erro na hora, sem
   subir nada; aba Transcrição) e no servidor (fronteira).
4. **Entrega pelo app** (`GET /api/legendas/[id]`, `src/lib/legendas/entrega.ts`): sessão do HOST
   (401), legenda viva DESTE criador (404), `acessoDaAula` = a mesma decisão do token, da playlist e
   da chave do vídeo (403, com a recusa na trilha). `text/vtt; charset=utf-8`, `Cache-Control:
   private, max-age=300`, `nosniff`. A chave do storage nunca sai; trocar a legenda muda o id e a URL.
   Arquivo de KB passa pelo Next sem custo relevante (diferente dos segmentos de vídeo).
5. **Player**: `<track kind="subtitles">` (mesma origem, cookie vai junto) em modo `hidden`; quem
   desenha é o próprio player (`useLegenda` lê `activeCues` no `cuechange`), acima dos controles
   quando eles aparecem, com tamanho pela largura do player (`cqw`, o player é `@container`): legível
   em tela cheia e no celular. iPhone em tela cheia nativa (só o `<video>`): a faixa vira `showing`
   e o sistema desenha. O hls.js só liga/desliga as faixas que ele mesmo criou (conferido no
   `subtitle-track-controller` da 1.7.3); a faixa externa funciona igual com MSE e com HLS nativo.
   Escolha (idioma ou desligada) em `localStorage` com chave por pessoa, em try/catch; sem banco.
   O construtor (ADR-0010) não tem flag de legenda; nenhuma flag nova foi criada.
6. **Transcrição**: a aba baixa o MESMO `.vtt` (só na primeira vez que abre) e o lê com o mesmo
   parser; destaque pelo segundo que o player já sobe 1x/s; busca sem acento/caixa; tudo como texto
   (nunca `dangerouslySetInnerHTML`).
7. **Texto puro no banco** (`texto`): busca e a futura Base de conhecimento leem do Postgres sem
   baixar nem reparsear arquivos e sem tempos misturados ao texto. Quando a Base entrar, ela indexa
   `texto` por aula/criador (embeddings ou `tsvector` em português) e cita a aula pela `aula_id`;
   para apontar o minuto exato, relê os trechos do `.vtt` da legenda viva. Nada de índice agora (YAGNI).

## Alternativas Consideradas

- **Server Action recebendo o arquivo**: menos código, mas exige subir o limite de corpo de TODAS as
  actions para ~3 MB (`serverActions.bodySizeLimit`) e reiniciar o servidor; o envio direto já existe.
- **Biblioteca de parsing (`subsrt`, `node-webvtt`, `vtt.js`)**: dependência nova para ~150 linhas;
  e a sanitização (o ponto de segurança) teria de ser nossa de qualquer jeito.
- **Manter as tags simples (`<i>`, `<b>`)**: o renderizador nativo as aceitaria, mas a transcrição e a
  Base de conhecimento querem texto, e cada tag permitida é superfície. Itálico é perdido (aceito).
- **Renderização nativa da legenda (`showing`)**: fica por baixo da barra de controles e o `::cue` tem
  estilo limitado; usada só na tela cheia nativa do iPhone.
- **Trechos com tempo no banco (jsonb)**: duplicaria o `.vtt`; o arquivo é a fonte dos tempos.

## Consequencias

### Positivas
- Três barreiras como no resto do catálogo: filtro do host, prefixo da chave e FK composta/CHECK.
- Script/HTML no arquivo nunca chega ao navegador como marcação: sai na conversão e a tela só exibe texto.
- `.vtt` com a mesma proteção do vídeo, sem token próprio.

### Negativas / Trade-offs
- O bruto que falha na validação fica como arquivo `DISPONIVEL` órfão até a varredura de órfãos (ADR-0004).
- `.vtt` de legendas trocadas/removidas fica no storage (histórico); poda só com a mesma varredura.
- A aba Transcrição baixa o `.vtt` uma segunda vez (o `<track>` já baixou); o `max-age=300` costuma
  servir do cache do navegador.
- Formatação (itálico, cor, posição) é descartada.

### Neutras
- Com CDN na frente, a rota da legenda continua no app (como playlist e chave).
