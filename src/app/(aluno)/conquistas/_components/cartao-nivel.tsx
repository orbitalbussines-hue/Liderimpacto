import Link from "next/link";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { Cartao } from "@/components/ui/cartao";
import { Estatistica } from "@/components/ui/estatistica";
import type { ResumoDePontos } from "@/lib/gamificacao/ranking";
import { pontosPtBr } from "@/lib/gamificacao/regras";

const posicao = (p: number | null) => (p === null ? "—" : `${p}º`);

/** Pontos, nível atual e o caminho até o próximo (RN-144/146). Saldo = soma do razão. */
export function CartaoNivel({ resumo }: { resumo: ResumoDePontos }) {
  const { nivel } = resumo;
  return (
    <Cartao como="section" raio={18} padding={24} aria-labelledby="titulo-pontos" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="titulo-pontos" className="m-0 font-sans text-[13px] font-semibold text-muted">
            Seus pontos
          </h2>
          <div className="mt-1 text-[40px] leading-none font-extrabold tabular-nums">{pontosPtBr(resumo.total)}</div>
        </div>
        <div className="text-right">
          <div className="text-[13px] font-semibold text-muted">Nível</div>
          <div className="mt-1 text-xl font-extrabold text-accent">{nivel.atual.nome}</div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <BarraProgresso valor={nivel.progresso * 100} rotulo={nivel.proximo ? `Progresso até o nível ${nivel.proximo.nome}` : "Último nível alcançado"} espessura={6} />
        <p className="m-0 text-[13px] text-muted">
          {nivel.proximo ? (
            <>
              Faltam <b className="font-bold text-text">{pontosPtBr(nivel.faltam)}</b> pontos para {nivel.proximo.nome}.
            </>
          ) : (
            "Você chegou ao último nível."
          )}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Estatistica variante="compacta" valor={pontosPtBr(resumo.semana)} rotulo="nesta semana" />
        <Estatistica variante="compacta" valor={pontosPtBr(resumo.mes)} rotulo="neste mês" />
        <Estatistica variante="compacta" valor={posicao(resumo.posicao.semana)} rotulo="na semana" />
      </div>
      {!resumo.aparecerNoRanking && (
        <p className="m-0 text-[13px] text-muted">
          Você está fora do ranking. Seus pontos continuam contando.{" "}
          <Link href="/perfil" className="font-semibold text-accent hover:underline">
            Mudar no Perfil
          </Link>
        </p>
      )}
    </Cartao>
  );
}
