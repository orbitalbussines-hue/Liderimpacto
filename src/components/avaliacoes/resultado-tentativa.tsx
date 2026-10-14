import Link from "next/link";
import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { buttonVariants } from "@/components/ui/button";
import { Cartao } from "@/components/ui/cartao";
import type { QuestaoCorrigida } from "@/lib/avaliacoes/consultas";
import { formatarNota, ROTULO_TIPO_QUESTAO } from "@/lib/avaliacoes/regras";
import type { FinalizacaoTentativa } from "@/lib/db/schema/_enums";
import { cn } from "@/lib/utils";
import { duracaoLegivel } from "./formatos";

export interface ResultadoTentativaProps {
  avaliacao: { notaMinima: number; curso: { slug: string } };
  tentativa: { numero: number; nota: number; aprovada: boolean; finalizadaPor: FinalizacaoTentativa; duracaoSeg: number; acertos: number; total: number };
  melhorNota: number | null;
  revelaGabarito: boolean;
  /** Aprovada agora (ou antes) numa avaliação que libera o próximo módulo / conta para o certificado. */
  liberouModulo: boolean;
  contaParaCertificado: boolean;
  /** Botão "Tentar de novo" pronto (client), quando o aluno ainda pode. */
  tentarDeNovo?: ReactNode;
  questoes: QuestaoCorrigida[];
}

function Opcao({ o, revela }: { o: QuestaoCorrigida["opcoes"][number]; revela: boolean }) {
  const certa = revela && o.correta === true;
  const errada = o.marcada && revela && o.correta === false;
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed",
        certa ? "border-ok/40 bg-ok-soft" : errada ? "border-warn/40 bg-warn-soft" : o.marcada ? "border-border bg-surface-2" : "border-border",
      )}
    >
      <span aria-hidden className={cn("mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border", o.marcada ? "border-text bg-text text-bg" : "border-border")}>
        {o.marcada && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">{o.texto}</span>
      {(o.marcada || certa) && (
        <span className={cn("shrink-0 text-right text-xs font-bold", errada ? "text-warn" : certa ? "text-ok" : "text-muted")}>
          {o.marcada ? `Sua resposta${certa ? " · correta" : errada ? " · incorreta" : ""}` : "Resposta correta"}
        </span>
      )}
    </li>
  );
}

/**
 * Resultado de uma tentativa: nota grande, aprovado/reprovado (cor + ícone + texto), o que a
 * aprovação liberou, CTAs e cada questão certa/errada. Gabarito e explicação SÓ quando
 * `revelaGabarito` (o servidor já não manda sem isso; a tela também não presume).
 */
export function ResultadoTentativa({ avaliacao, tentativa, melhorNota, revelaGabarito, liberouModulo, contaParaCertificado, tentarDeNovo, questoes }: ResultadoTentativaProps) {
  const t = tentativa;
  const Icone = t.aprovada ? Check : X;
  return (
    <div className="flex flex-col gap-5">
      <Cartao padding={24} como="section" aria-label="Sua nota" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <div className="font-serif text-[64px] leading-none font-semibold tabular-nums">{formatarNota(t.nota)}%</div>
          <div className="flex min-w-0 flex-col gap-1">
            <div className={cn("flex items-center gap-2 text-lg font-extrabold", t.aprovada ? "text-ok" : "text-warn")}>
              <span aria-hidden className={cn("grid size-7 place-items-center rounded-full", t.aprovada ? "bg-ok-soft" : "bg-warn-soft")}>
                <Icone className="size-4" strokeWidth={3} />
              </span>
              {t.aprovada ? "Aprovado" : "Reprovado"}
            </div>
            <div className="text-[13px] text-muted">
              Nota mínima {avaliacao.notaMinima}% · {t.acertos} de {t.total} {t.total === 1 ? "certa" : "certas"} · {duracaoLegivel(t.duracaoSeg)} · tentativa {t.numero}
            </div>
            {melhorNota !== null && melhorNota !== t.nota && <div className="text-[13px] text-muted">Sua melhor nota nesta avaliação: {formatarNota(melhorNota)}%</div>}
          </div>
        </div>
        {t.finalizadaPor === "TEMPO" && <Aviso>O tempo acabou e a tentativa foi corrigida com o que você já tinha respondido.</Aviso>}
        {t.aprovada && liberouModulo && <Aviso tom="ok">Sua aprovação liberou o próximo módulo do curso.</Aviso>}
        {t.aprovada && contaParaCertificado && <Aviso tom="ok">Esta avaliação conta para o certificado. Com o curso concluído, ele aparece em Certificados.</Aviso>}
        {!revelaGabarito && <Aviso>O gabarito desta prova aparece quando você for aprovado ou não tiver mais tentativas.</Aviso>}
        <div className="flex flex-wrap gap-2.5">
          {tentarDeNovo}
          {t.aprovada && contaParaCertificado && (
            <Link href="/certificados" className={buttonVariants({ variant: tentarDeNovo ? "contorno" : "primario", size: "46" })}>
              Ver certificado
            </Link>
          )}
          <Link href={`/cursos/${avaliacao.curso.slug}`} className={buttonVariants({ variant: "contorno", size: "46" })}>
            Voltar ao curso
          </Link>
        </div>
      </Cartao>

      <section aria-label="Questões corrigidas" className="flex flex-col gap-3">
        <h2 className="m-0 font-sans text-base font-extrabold tracking-normal">Questões</h2>
        {questoes.map((q) => (
          <Cartao key={q.id} padding={20} como="article" aria-label={`Questão ${q.numero}: ${q.correta ? "certa" : "errada"}`} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-muted">
                Questão {q.numero} · {ROTULO_TIPO_QUESTAO[q.tipo]}
                {q.peso > 1 && ` · peso ${q.peso}`}
              </span>
              <span className={cn("flex items-center gap-1 text-xs font-bold", q.correta ? "text-ok" : "text-warn")}>
                {q.correta ? <Check className="size-3.5" aria-hidden strokeWidth={3} /> : <X className="size-3.5" aria-hidden strokeWidth={3} />}
                {q.correta ? "Certa" : "Errada"}
              </span>
            </div>
            <p className="m-0 text-[15px] leading-relaxed font-semibold whitespace-pre-line">{q.enunciado}</p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {q.opcoes.map((o) => (
                <Opcao key={o.id} o={o} revela={revelaGabarito} />
              ))}
            </ul>
            {revelaGabarito && q.explicacao && (
              <div className="rounded-xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed">
                <b>Explicação:</b> {q.explicacao}
              </div>
            )}
          </Cartao>
        ))}
      </section>
    </div>
  );
}
