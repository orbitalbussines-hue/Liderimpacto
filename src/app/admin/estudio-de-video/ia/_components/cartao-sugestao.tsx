"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { CaixaSelecao } from "@/components/ui/caixa-selecao";
import { Cartao } from "@/components/ui/cartao";
import { Selecao } from "@/components/ui/selecao";
import { Selo } from "@/components/ui/selo";
import { acaoAplicarSugestao, acaoDescartarSugestao } from "@/lib/actions/estudio-ia";
import type { AulaTela, Parte, SugestaoTela } from "./tipos";

type Confirmar = Parte | "DESCARTAR";
const LETRAS = "ABCDEFGH";
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export interface CartaoSugestaoProps {
  sugestao: SugestaoTela;
  maisRecente: boolean;
  aula: AulaTela;
  avaliacoes: { id: string; titulo: string }[];
}

function Bloco({ titulo, aplicadaEm, children, acao }: { titulo: string; aplicadaEm: string | null; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="m-0 flex items-center gap-2 text-sm font-semibold">
          {titulo}
          {aplicadaEm && <Selo tom="ok">Aplicada em {aplicadaEm}</Selo>}
        </h4>
        {acao}
      </div>
      {children}
    </section>
  );
}

/**
 * Uma sugestão da IA: descrição, capítulos e perguntas, cada parte aplicada em separado
 * (ModalConfirmacaoBlock: muda conteúdo que os alunos veem) ou a sugestão inteira descartada.
 */
export function CartaoSugestao({ sugestao: s, maisRecente, aula, avaliacoes }: CartaoSugestaoProps) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState<Confirmar | null>(null);
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [marcadas, setMarcadas] = useState<number[]>(() => s.perguntas.map((_, i) => i));
  const [avaliacaoId, setAvaliacaoId] = useState(avaliacoes[0]?.id ?? "");
  const avaliacao = avaliacoes.find((a) => a.id === avaliacaoId);

  const alternar = (i: number) => setMarcadas((m) => (m.includes(i) ? m.filter((x) => x !== i) : [...m, i].sort((a, b) => a - b)));

  const mensagem: Record<Confirmar, string> = {
    DESCRICAO: `${aula.temDescricao ? "A descrição atual" : "A descrição"} da aula "${aula.titulo}" passa a ser o texto sugerido. Os alunos veem a mudança na hora e o assistente do professor reaprende a aula. Fica registrado na trilha.`,
    CAPITULOS: `${aula.capitulosAtuais ? `Os ${plural(aula.capitulosAtuais, "capítulo atual", "capítulos atuais")} da aula "${aula.titulo}" são substituídos pelos ${s.capitulos.length} sugeridos.` : `A aula "${aula.titulo}" passa a ter os ${plural(s.capitulos.length, "capítulo sugerido", "capítulos sugeridos")}.`} Os alunos veem a mudança no player. Fica registrado na trilha.`,
    PERGUNTAS: `${plural(marcadas.length, "pergunta entra", "perguntas entram")} no fim da avaliação "${avaliacao?.titulo ?? ""}". Quem fizer a avaliação a partir de agora responde a ${marcadas.length === 1 ? "ela" : "elas"}. Fica registrado na trilha.`,
    DESCARTAR: "A sugestão sai da lista e nada é aplicado. A geração continua contando no limite de hoje. Fica registrado na trilha.",
  };
  const textoConfirmar: Record<Confirmar, string> = { DESCRICAO: "Aplicar descrição", CAPITULOS: "Aplicar capítulos", PERGUNTAS: "Adicionar perguntas", DESCARTAR: "Descartar" };

  const executar = (alvo: Confirmar) =>
    iniciar(async () => {
      const r =
        alvo === "DESCARTAR"
          ? await acaoDescartarSugestao({ sugestaoId: s.id, versao: s.versao })
          : alvo === "PERGUNTAS"
            ? await acaoAplicarSugestao({ parte: "PERGUNTAS", sugestaoId: s.id, versao: s.versao, avaliacaoId, indices: marcadas })
            : await acaoAplicarSugestao({ parte: alvo, sugestaoId: s.id, versao: s.versao, aulaVersao: aula.versao });
      setConfirmando(null);
      if (!r.ok) return setAviso({ tom: "erro", texto: r.erro });
      if (alvo !== "DESCARTAR") {
        const feito = { DESCRICAO: "Descrição aplicada na aula.", CAPITULOS: "Capítulos aplicados na aula.", PERGUNTAS: `${plural(marcadas.length, "pergunta adicionada", "perguntas adicionadas")} à avaliação "${avaliacao?.titulo}".` };
        setAviso({ tom: "ok", texto: feito[alvo] });
      }
      router.refresh();
    });

  const botao = (parte: Parte, rotulo: string, desligado = false) => (
    <Button size="36" variant="secundario" disabled={desligado || pendente} onClick={() => setConfirmando(parte)}>
      {s.aplicada[parte] ? (parte === "PERGUNTAS" ? "Adicionar de novo" : "Aplicar de novo") : rotulo}
    </Button>
  );

  return (
    <Cartao como="article" padding={16} aria-label={`Sugestão de ${s.criadaEm}`} className="flex flex-col gap-4 desk:p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="m-0 text-[15px] font-semibold">{maisRecente ? "Sugestão mais recente" : "Sugestão anterior"}</h3>
          <p className="m-0 text-xs text-muted tabular-nums">
            Gerada em {s.criadaEm} · custo estimado {s.custo}
          </p>
        </div>
        <Button size="36" variant="fantasma" className="text-muted" disabled={pendente} onClick={() => setConfirmando("DESCARTAR")}>
          Descartar
        </Button>
      </header>

      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}

      <Bloco titulo="Descrição" aplicadaEm={s.aplicada.DESCRICAO} acao={botao("DESCRICAO", "Aplicar descrição")}>
        <p className="m-0 max-w-[72ch] text-sm leading-relaxed whitespace-pre-line">{s.descricao}</p>
      </Bloco>

      <Bloco titulo="Capítulos" aplicadaEm={s.aplicada.CAPITULOS} acao={s.capitulos.length > 0 && botao("CAPITULOS", "Aplicar capítulos")}>
        {s.capitulos.length === 0 ? (
          <p className="m-0 text-[13px] leading-relaxed text-muted">
            Sem capítulos: eles saem dos tempos do arquivo da legenda (.vtt), que não pôde ser lido. Gere a legenda da aula para sugerir capítulos.
          </p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            {s.capitulos.map((c) => (
              <li key={c.tempo} className="flex gap-3">
                <span className="w-14 shrink-0 text-muted tabular-nums">{c.tempo}</span>
                <span className="min-w-0">{c.titulo}</span>
              </li>
            ))}
          </ol>
        )}
      </Bloco>

      <Bloco titulo="Perguntas" aplicadaEm={s.aplicada.PERGUNTAS}>
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {s.perguntas.map((p, i) => (
            <li key={i} className="flex flex-col gap-1.5 rounded-xl border border-border px-3.5 py-2">
              <CaixaSelecao
                checked={marcadas.includes(i)}
                onChange={() => alternar(i)}
                rotulo={
                  <span className="text-sm font-semibold text-text">
                    {i + 1}. {p.enunciado}
                  </span>
                }
              />
              <ul className="m-0 flex list-none flex-col gap-1 p-0 pl-6 text-[13px]">
                {p.opcoes.map((o, j) => (
                  <li key={j} className={j === p.correta ? "font-semibold text-ok" : undefined}>
                    {LETRAS[j]}) {o}
                    {j === p.correta && " · correta"}
                  </li>
                ))}
              </ul>
              {p.explicacao && <p className="m-0 pb-1.5 pl-6 text-xs leading-relaxed text-muted">{p.explicacao}</p>}
            </li>
          ))}
        </ol>
        {avaliacoes.length === 0 ? (
          <p className="m-0 text-[13px] text-muted">
            Este curso não tem avaliação para receber as perguntas.{" "}
            <Link href="/admin/avaliacoes/nova" className="font-semibold text-text underline-offset-4 hover:underline">
              Criar avaliação
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <Selecao
              rotulo="Avaliação que recebe as perguntas"
              tamanho="36"
              fundo="surface"
              value={avaliacaoId}
              onChange={(e) => setAvaliacaoId(e.target.value)}
              opcoes={avaliacoes.map((a) => ({ valor: a.id, rotulo: a.titulo }))}
              classNameMoldura="min-w-0 flex-[1_1_240px] desk:max-w-[400px]"
            />
            {botao("PERGUNTAS", marcadas.length ? `Adicionar ${plural(marcadas.length, "pergunta", "perguntas")}` : "Adicionar perguntas", marcadas.length === 0 || !avaliacao)}
          </div>
        )}
      </Bloco>

      <ModalConfirmacaoBlock
        aberto={confirmando !== null}
        titulo={confirmando === "DESCARTAR" ? "Descartar sugestão" : "Aplicar sugestão da IA"}
        mensagem={confirmando ? mensagem[confirmando] : ""}
        textoConfirmar={confirmando ? textoConfirmar[confirmando] : undefined}
        carregando={pendente}
        onCancelar={() => setConfirmando(null)}
        onConfirmar={() => confirmando && executar(confirmando)}
      />
    </Cartao>
  );
}
