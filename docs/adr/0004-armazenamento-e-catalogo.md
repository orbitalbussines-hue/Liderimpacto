# ADR-0004: Armazenamento S3 com envio direto e catálogo isolado por criador

- **Status**: Aceito
- **Data**: 2026-10-14
- **Decisores**: Paulo (Bah! Tech)

## Contexto

O passo 3 (catálogo: produto > módulo > aula > material) precisa de capas, thumbs e anexos, e o
passo 3b (vídeo) precisa de arquivos de GB. `docs/ARQUITETURA_VPS.md` fixa o modelo: VPS + object
storage S3 + CDN, SeaweedFS (nunca MinIO, arquivado em abr/2026), com R2 como alternativa de
produção. O app é multi-criador (ADR-0002): um arquivo de um criador nunca pode aparecer em outro.

## Decisão

1. **Um cliente S3 só** (`src/lib/armazenamento/cliente.ts`, `@aws-sdk/client-s3`), configurado por
   `S3_*`: SeaweedFS no `docker-compose` em dev, R2 (ou SeaweedFS na VPS) em produção sem mudar
   código. Três buckets: arquivos, vídeos originais, HLS. Checksum automático desligado
   (`WHEN_REQUIRED`): o navegador não calcula CRC32 e R2/SeaweedFS recusariam o PUT.
2. **O Next nunca recebe o binário.** Envio em 3 tempos: a action valida a allowlist (MIME +
   extensão + tamanho), grava `arquivos` como `ENVIADO_PENDENTE` e devolve uma URL de PUT
   pré-assinada (10 min) com `Content-Type` e `Content-Length` **dentro da assinatura**; o navegador
   sobe direto; a action de confirmação faz HEAD e só então marca `DISPONIVEL`. PUT pré-assinado
   (não POST com policy) porque o R2 não aceita POST. Arquivos grandes: multipart pré-assinado.
3. **Chave sempre `criadores/<criadorId>/...`**, montada só por `chaveDoCriador` e conferida por
   `chavePertenceAoCriador` em TODA função do cliente (assinar, ler, apagar), além de CHECK no
   banco. As actions recebem id de arquivo (nunca chave) e filtram pelo criador do host.
4. **Isolamento no banco:** `criador_id` em todas as tabelas do catálogo e FKs COMPOSTAS
   `(filho, criador) -> (pai, criador)` para módulo, aula, material, capa, thumb, professor e
   pré-requisito. Mesmo uma action com bug não consegue misturar criadores.
5. **Imagens no `next/image` por URL pré-assinada com janela fixa.** A assinatura usa a data
   arredondada para a hora (`signingDate`) e vale 2 h: a URL fica igual durante a janela, então o
   cache do otimizador (cuja chave é a URL) acerta. Imagem trocada = chave nova = URL nova (sem
   cache velho). `images.remotePatterns` libera só o host do storage do env e o caminho
   `/<bucket>/criadores/**`; `dangerouslyAllowLocalIP` só quando o storage é local (dev).
6. **Ordem sem buraco:** único `(pai, ordem)` entre os vivos; reordenar em duas fases na mesma
   transação (afasta +1.000.000 e grava 1..n), sempre com a linha do pai travada e trava otimista
   pela versão de TODOS os irmãos.

## Alternativas Consideradas

- **Rota própria que redireciona para a URL assinada** (`/arquivos/<id>` -> 302): o otimizador do
  Next 16 busca imagem local por requisição interna SEM cabeçalhos (sem host, sem cookie) e recusa
  resposta 3xx; não daria para descobrir o criador. E servir os bytes pela rota faria o Next
  receber o arquivo, o contrário do item 2.
- **URL assinada nova a cada render**: cada visita criaria uma entrada nova no cache de imagens e
  buscaria o original no storage de novo.
- **Bucket público para capas**: simples, mas expõe tudo que estiver no bucket a quem adivinhar a
  chave e não serve para anexos.
- **Upload passando pelo servidor (Server Action com `File`)**: limite de corpo, memória e CPU do
  app para arquivos grandes; inviável para vídeo.
- **MinIO**: arquivado (ver ARQUITETURA_VPS.md).

## Consequencias

### Positivas
- Mesmo código em dev e produção; trocar SeaweedFS por R2 é só env.
- Três barreiras contra mistura de criadores: filtro do host na action, prefixo da chave no
  cliente S3 e FK composta/CHECK no banco.

### Negativas / Trade-offs
- URL de imagem vale até 2 h depois de emitida (capas e thumbs não são segredo; anexos usam URL
  de 5 min).
- Objeto órfão quando o envio não é confirmado ou a remoção do objeto falha (log CRITICAL): falta
  um job de varredura bucket × `arquivos` vivos.
- O navegador precisa alcançar `S3_ENDPOINT` (CORS do bucket por `npm run armazenamento:preparar`).

### Neutras
- Um arquivo é usado em um lugar só (capa, thumb ou material): trocar/remover apaga o objeto.
