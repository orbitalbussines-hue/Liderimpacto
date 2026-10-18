"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { acaoGerarSugestao } from "@/lib/actions/estudio-ia";
import { CartaoSugestao } from "./cartao-sugestao";
import type { AulaTela, SugestaoTela } from "./tipos";

export interface PainelIaProps {
  aula: AulaTela;
  geracao: { ligada: boolean; hoje: number; limite: number };
  avaliacoes: { id: string; titulo: string }[];
  sugestoes: SugestaoTela[];
}

/** Por que o "Gerar sugestões" está desligado (null = pode gerar). */
function bloqueio({ aula, geracao }: Pick<PainelIaProps, "aula" | "geracao">): string | null {
  if (!geracao.ligada) return "IA não configurada no servidor.";
  if (!aula.legendas) return "Esta aula ainda não tem legenda. Gere a legenda no editor da aula: a IA lê a legenda para sugerir descrição, capítulos e perguntas.";
  if (geracao.hoje >= geracao.limite) return `Limite de ${geracao.limite} gerações por dia atingido. Tente amanhã.`;
  return null;
}

/**
 * Aula escolhida na aba IA: gerar (chama o Claude, leva segundos), contador do dia e a lista de
 * sugestões (mais recentes primeiro). As travas e o limite valem no servidor; aqui só explicam.
 */
export function PainelIa({ aula, geracao, avaliacoes, sugestoes }: PainelIaProps) {
  const router = useRouter();
  const [gerando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const motivo = bloqueio({ aula, geracao });

  const gerar = () =>
    iniciar(async () => {
      setErro(null);
      const r = await acaoGerarSugestao({ aulaId: aula.id });
      if (!r.ok) return setErro(r.erro);
      router.refresh();
    });

  return (
    <section aria-labelledby="titulo-aula-ia" className="flex flex-col gap-4 border-t border-border pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="titulo-aula-ia" className="m-0 text-base font-semibold">
            {aula.titulo}
          </h2>
          <p className="m-0 text-[13px] text-muted">
            {aula.produto} · {aula.legendas ? `Legenda: ${aula.legendas}` : "Sem legenda"} ·{" "}
            <Link href={aula.href} className="font-semibold text-text underline-offset-4 hover:underline">
              Abrir aula
            </Link>
          </p>
        </div>
        <Button size="36" onClick={gerar} disabled={!!motivo || gerando} aria-busy={gerando || undefined}>
          {gerando && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {gerando ? "Gerando…" : "Gerar sugestões"}
        </Button>
      </div>

      <div aria-live="polite" className="contents">
        {gerando && <p className="m-0 text-[13px] text-muted">Lendo a legenda e escrevendo as sugestões. Pode levar até um minuto; não feche a página.</p>}
      </div>
      {motivo && <Aviso tom="info">{motivo}</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {sugestoes.length === 0 ? (
        !motivo && (
          <EstadoVazio comMoldura titulo="Nenhuma sugestão para esta aula" descricao="Clique em “Gerar sugestões”. Cada geração conta no limite do dia, mesmo se descartada." />
        )
      ) : (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {sugestoes.map((s, i) => (
            <li key={s.id}>
              <CartaoSugestao sugestao={s} maisRecente={i === 0} aula={aula} avaliacoes={avaliacoes} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
