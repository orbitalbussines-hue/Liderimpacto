import { BarraProgresso } from "@/components/ui/barra-progresso";
import { Cartao } from "@/components/ui/cartao";
import type { DesafioDoMembro } from "@/lib/gamificacao/desafios";
import { pontosPtBr, textoDaMeta } from "@/lib/gamificacao/regras";
import { BotaoParticipar } from "./botao-participar";

const fuso = { timeZone: "America/Sao_Paulo" } as const;
const dia = (d: Date) => d.toLocaleDateString("pt-BR", { ...fuso, day: "2-digit", month: "2-digit" });
const diaHora = (d: Date) => `${dia(d)} às ${d.toLocaleTimeString("pt-BR", { ...fuso, hour: "2-digit", minute: "2-digit" })}`;

/** Quando: "Começa em 20/10 às 09:00", "Até 21/10 às 23:59", "Concluído em 15/10", "Encerrado em 21/10". */
function quando(d: DesafioDoMembro): string {
  if (d.concluidoEm) return `Concluído em ${dia(d.concluidoEm)}`;
  if (d.momento === "EM_BREVE") return `Começa em ${diaHora(d.inicioEm)}`;
  if (d.momento === "ENCERRADO") return `Encerrado em ${dia(d.fimEm)}`;
  return `Até ${diaHora(d.fimEm)}`;
}

/**
 * Um desafio (RN-147): meta, prazo, bônus, recompensa e — participando — o progresso calculado na
 * janela. Sóbrio: o destaque é o número, não enfeite.
 */
export function CartaoDesafio({ desafio: d }: { desafio: DesafioDoMembro }) {
  const pct = d.meta > 0 ? (d.atual * 100) / d.meta : 0;
  const podeParticipar = !d.participando && d.momento !== "ENCERRADO";
  return (
    <Cartao como="article" raio={16} padding={20} className="flex h-full flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-base font-extrabold">{d.titulo}</h3>
        <p className="m-0 text-[13px] text-muted">
          {textoDaMeta(d.metaTipo, d.meta)} · {quando(d)}
        </p>
      </div>
      {d.descricao && <p className="m-0 line-clamp-3 text-sm leading-relaxed whitespace-pre-line">{d.descricao}</p>}
      <dl className="m-0 grid gap-1 text-[13px]">
        {d.pontosBonus > 0 && (
          <div className="flex gap-1.5">
            <dt className="text-muted">Bônus</dt>
            <dd className="m-0 font-bold text-accent">+{pontosPtBr(d.pontosBonus)} pontos</dd>
          </div>
        )}
        {d.recompensa && (
          <div className="flex gap-1.5">
            <dt className="shrink-0 text-muted">Recompensa</dt>
            <dd className="m-0 min-w-0 font-semibold">
              {d.recompensa}
              {d.concluidoEm && <span className="font-normal text-muted"> · {d.recompensaEntregueEm ? "entregue" : "a equipe vai entrar em contato"}</span>}
            </dd>
          </div>
        )}
      </dl>
      <div className="mt-auto flex flex-col gap-2 pt-1">
        {d.participando && (
          <div className="flex items-center gap-2.5">
            <BarraProgresso valor={pct} rotulo={`Progresso em ${d.titulo}`} className="flex-1" />
            <span className="shrink-0 text-xs font-semibold text-muted tabular-nums">
              {d.atual}/{d.meta}
            </span>
          </div>
        )}
        {podeParticipar && <BotaoParticipar desafioId={d.id} titulo={d.titulo} />}
      </div>
    </Cartao>
  );
}
