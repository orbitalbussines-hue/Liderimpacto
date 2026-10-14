# ADR-0010: Construtor da vitrine com rascunho único, versões publicadas imutáveis, prévia por iframe e cache por etiqueta

- **Status**: Aceito
- **Data**: 2026-10-14
- **Decisores**: Paulo (Bah! Tech)

## Contexto

O passo 9 (SISTEMA.md §4 `StorefrontConfig`/`StorefrontRow`, §6) entrega o construtor da vitrine:
a equipe monta o destaque, as fileiras e os recursos do player; o aluno só vê o que foi
publicado; precisa de histórico, reverter e indicador "Alterações não publicadas". A prévia tem de
usar os MESMOS componentes da vitrine real (desktop e celular). A vitrine é a página mais acessada:
a configuração não pode custar consultas a cada visita, mas a parte pessoal (continuar, lista) é
por aluno.

## Decisão

1. **Um rascunho por criador + versões publicadas imutáveis.** `criadores_vitrines` (1 linha viva
   por criador, `rascunho` jsonb) e `criadores_vitrines_versoes` (número 1..n único, `config` jsonb,
   `publicada_por`, `publicada_em`). Publicar copia o rascunho (conferindo a versão que a tela tem)
   para a versão n+1 e nunca altera uma versão existente; o aluno lê a de maior número. Reverter
   copia uma versão para o RASCUNHO (não publica). Descartar = rascunho ← última publicada (ou o
   padrão). O indicador compara rascunho × publicada semanticamente (`mesmaConfig`).
2. **JSON validado e referências conferidas.** Toda gravação passa por `configVitrineSchema`
   (Zod `strictObject`, enums, quantidades 3/5/7/10, ordenação compatível com o tipo, link só
   interno). Cursos, aulas, grupos e imagem citados no JSON não têm FK: a action confere que são
   DESTE criador (outro criador = recusa); removidos depois não reprovam (uma versão antiga continua
   revertível) e a resolução os esconde. Imagem do destaque nunca é descartada (versões antigas
   podem apontar para ela).
3. **Autosave com trava otimista.** A tela grava 800 ms depois da última mudança, numa fila (uma
   gravação por vez, sempre com a versão mais nova). `updated_at` do rascunho é a trava; conflito
   = "outra pessoa alterou — recarregue" e a edição para. A trilha registra cada gravação com um
   RESUMO do que mudou (não o JSON a cada 800 ms); a publicação guarda a config inteira.
4. **Prévia = a vitrine real num `<iframe>` da mesma origem** (`/previa-vitrine`, só equipe), montada
   no servidor com o rascunho pelos mesmos componentes e consultas (`VitrineMontada`), em 1440 px
   escalada à coluna ou 390×844 numa moldura de celular. Após cada autosave a versão muda e um quadro
   novo carrega por trás do atual (sem piscar). Clique num bloco seleciona-o no construtor por
   `postMessage` com origem e janela conferidas; links da prévia não navegam. Alternativa recusada:
   mini-vitrine redesenhada no cliente (o protótipo) — seria uma segunda implementação que deriva
   da real. Custo aceito: uma requisição por autosave. Se um dia entrar CSP `frame-ancestors`, ele
   precisa permitir `'self'`.
5. **Cache por etiqueta.** `configPublicada(criadorId)` usa `"use cache"` + `cacheTag("vitrine:<id>")`
   + `cacheLife("max")`; `acaoPublicarVitrine` chama `updateTag` (leitura-da-própria-escrita: a
   próxima requisição já vê a versão nova). A parte pessoal (continuar, lista, novidades com
   matrícula, trilhas) é resolvida por aluno, sem cache; o Top 10 segue no cache próprio (ADR-0006).
6. **Sem publicação, vale o padrão** de antes (destaque automático do curso do "Continuar" + as 6
   fileiras): nenhum criador precisa publicar para a vitrine funcionar. O construtor abre com esse
   padrão materializado como rascunho. O player lê `config.player` publicado (padrão = o de antes);
   a reprodução automática exige o construtor E a preferência do aluno.

## Consequências

- **Positivas**: histórico completo e auditável; reverter é seguro; prévia fiel por construção;
  vitrine sem consulta de config por visita; nenhuma dependência nova.
- **Negativas**: a prévia recarrega o iframe a cada autosave (≈0,5 s em dev); referências no JSON
  dependem da validação na action (sem FK); a fileira com grupos mostra tudo para a equipe.
- **Riscos**: config de versão antiga inválida para um schema futuro — `configDoBanco` recusa com
  log e a vitrine cai no padrão (migrar o JSON quando o schema mudar).
