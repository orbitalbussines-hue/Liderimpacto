import type { Metadata } from "next";
import { Suspense } from "react";
import { Video } from "lucide-react";
import { MolduraAbas } from "@/components/admin/moldura-abas";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Selecao } from "@/components/ui/selecao";
import { iaConfigurada } from "@/lib/assistente/cliente";
import { formatarUsd } from "@/lib/assistente/regras";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { avaliacoesDoAdmin } from "@/lib/avaliacoes/admin";
import { aulaParaEditar } from "@/lib/catalogo/consultas";
import { LIMITES_ESTUDIO_IA } from "@/lib/estudio-ia/regras";
import { geracoesDeHoje, sugestoesDaAula } from "@/lib/estudio-ia/servico";
import { formatarTempo } from "@/lib/validators/catalogo";
import { listarVideos } from "@/lib/video/estudio";
import { dataHoraCurta, ehUuid } from "../../conteudos/_components/comum";
import { ABAS_ESTUDIO, ROTA_ESTUDIO, um, type Busca } from "../_components/comum";
import { PainelIa } from "./_components/painel-ia";
import type { SugestaoTela } from "./_components/tipos";

export const metadata: Metadata = { title: "IA · Estúdio de vídeo" };

// ponytail: 500 vídeos prontos no seletor; acima disso, busca por texto no lugar do <select>.
const MAX_AULAS = 500;
const dataCurta = (d: Date | null) => (d ? dataHoraCurta(d) : null);

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  const pedida = um(sp.aula);
  const aulaId = pedida && ehUuid(pedida) ? pedida : undefined;
  const [prontos, hoje] = await Promise.all([listarVideos(criador.id, { situacao: "PRONTO", pagina: 1, porPagina: MAX_AULAS }), geracoesDeHoje(criador.id)]);
  // Uma linha por aula (o vídeo vivo é um só; o Set protege a <option> de chave repetida).
  const vistas = new Set<string>();
  const aulas = prontos.linhas.filter((v) => !vistas.has(v.aulaId) && vistas.add(v.aulaId));
  const escolhida = aulas.find((a) => a.aulaId === aulaId);

  const detalhe = escolhida
    ? await Promise.all([
        aulaParaEditar(criador.id, escolhida.produtoId, escolhida.aulaId),
        sugestoesDaAula(criador.id, escolhida.aulaId),
        avaliacoesDoAdmin(criador.id, { produtoId: escolhida.produtoId }),
      ])
    : null;

  const ligada = iaConfigurada();
  return (
    <MolduraAbas titulo="Estúdio de vídeo" meta={`${hoje} de ${LIMITES_ESTUDIO_IA.porDia} gerações hoje`} abas={ABAS_ESTUDIO} ativa="IA">
      <div className="flex flex-col gap-5">
        {!ligada && <Aviso tom="info">IA não configurada: falta a chave da Anthropic no servidor. As sugestões já geradas continuam aqui para aplicar.</Aviso>}
        <p className="m-0 max-w-[68ch] text-[13px] leading-relaxed text-muted">
          A IA lê a legenda da aula e sugere uma descrição, capítulos com o minuto e perguntas de múltipla escolha. Nada muda na aula até você revisar e aplicar cada parte.
        </p>

        {aulas.length === 0 ? (
          <EstadoVazio comMoldura icone={<Video />} titulo="Nenhum vídeo pronto" descricao="Envie o vídeo no editor da aula, em Conteúdos. Quando ele terminar de processar, a aula aparece aqui." />
        ) : (
          <form method="get" action={`${ROTA_ESTUDIO}/ia`} className="flex flex-wrap items-end gap-2">
            <Selecao
              name="aula"
              rotulo="Aula com vídeo"
              tamanho="36"
              fundo="surface"
              vazio="Escolha uma aula"
              defaultValue={escolhida?.aulaId ?? ""}
              opcoes={aulas.map((a) => ({ valor: a.aulaId, rotulo: a.legendas ? a.aula : `${a.aula} (sem legenda)`, grupo: a.produto }))}
              classNameMoldura="min-w-0 flex-[1_1_280px] desk:max-w-[480px]"
            />
            <Button type="submit" variant="secundario" size="36">
              Abrir
            </Button>
          </form>
        )}

        {pedida && !escolhida && <Aviso tom="erro">Aula não encontrada entre as que têm vídeo pronto.</Aviso>}

        {escolhida && detalhe?.[0] && (
          <PainelIa
            key={escolhida.aulaId}
            aula={{
              id: escolhida.aulaId,
              titulo: escolhida.aula,
              produto: escolhida.produto,
              href: `/admin/conteudos/${escolhida.produtoId}/aulas/${escolhida.aulaId}`,
              legendas: escolhida.legendas,
              versao: detalhe[0].aula.updated_at.toISOString(),
              temDescricao: !!detalhe[0].aula.descricao?.trim(),
              capitulosAtuais: detalhe[0].aula.capitulos.length,
            }}
            geracao={{ ligada, hoje, limite: LIMITES_ESTUDIO_IA.porDia }}
            avaliacoes={detalhe[2].linhas.map((a) => ({ id: a.id, titulo: a.titulo }))}
            sugestoes={detalhe[1].map(
              (s): SugestaoTela => ({
                id: s.id,
                versao: s.versao.toISOString(),
                criadaEm: dataHoraCurta(s.criadaEm),
                custo: formatarUsd(s.custoUsd),
                descricao: s.descricao,
                capitulos: s.capitulos.map((c) => ({ tempo: formatarTempo(c.inicioSeg), titulo: c.titulo })),
                perguntas: s.perguntas,
                aplicada: { DESCRICAO: dataCurta(s.descricaoAplicadaEm), CAPITULOS: dataCurta(s.capitulosAplicadosEm), PERGUNTAS: dataCurta(s.perguntasAplicadasEm) },
              }),
            )}
          />
        )}
      </div>
    </MolduraAbas>
  );
}

/** IA do Estúdio (RN-206), DONO e ADMIN: gerar, revisar e aplicar por parte as sugestões de uma aula. */
export default function PaginaIaEstudio({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}
