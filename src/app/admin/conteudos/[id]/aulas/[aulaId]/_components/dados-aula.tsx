"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { Selecao } from "@/components/ui/selecao";
import { acaoSalvarAula } from "@/lib/actions/aulas";
import type { BlocoConteudo } from "@/lib/catalogo/conteudo-aula";
import type { Capitulo } from "@/lib/db/schema/produtos";
import { formatarTempo, lerTempo } from "@/lib/validators/catalogo";
import { CapitulosAula, erroDoCapitulo, type CapituloEditavel } from "./capitulos-aula";
import { aulaAntigaIntacta, ConteudoAula, editaveisDe, paraConteudo, type BlocoEditavel } from "./conteudo-aula";

export interface DadosAulaProps {
  aula: {
    id: string;
    titulo: string;
    descricao: string;
    /** Blocos (RN-275); null = aula antiga, abre com a descrição num bloco de texto. */
    conteudo: BlocoConteudo[] | null;
    /** URL assinada das imagens do conteúdo (prévia). */
    imagens: Record<string, string | null>;
    /** ISO ou null. */
    liberaEm: string | null;
    /** N dias depois da matrícula de cada aluno (RN-274) ou null. */
    liberaAposDias: number | null;
    preRequisitoAulaId: string | null;
    capitulos: Capitulo[];
    duracaoSeg: number | null;
    versao: string;
  };
  /** Outras aulas do mesmo produto (pré-requisito), com o módulo para agrupar. */
  aulasDoProduto: { id: string; titulo: string; modulo: string }[];
}

/**
 * Liberação no fuso de Brasília. ponytail: o Brasil está sem horário de verão desde 2019, então o
 * fuso é fixo em -03:00; se voltar, trocar por conversão com Intl (timeZone America/Sao_Paulo).
 */
const FUSO = "-03:00";
function paraCampoLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}
const paraIso = (local: string) => (local ? new Date(`${local}:00${FUSO}`).toISOString() : null);

/** Um modo de liberação por aula (RN-274): a action recusa data e dias juntos. */
type ModoLiberacao = "matricula" | "data" | "dias";
const MODOS: { valor: ModoLiberacao; rotulo: string }[] = [
  { valor: "matricula", rotulo: "Liberada com a matrícula" },
  { valor: "data", rotulo: "Numa data" },
  { valor: "dias", rotulo: "Alguns dias depois da matrícula" },
];
/** Vazio = null; o resto vai como número e o servidor confere (inteiro de 1 a 3650). */
const lerDias = (v: string) => (v.trim() ? Number(v.trim()) : null);

/** Dados da aula: título, conteúdo, liberação, pré-requisito e capítulos. Um "Salvar" com trava. */
export function DadosAula({ aula, aulasDoProduto }: DadosAulaProps) {
  const router = useRouter();
  const [capitulos, setCapitulos] = useState<CapituloEditavel[]>(() =>
    aula.capitulos.map((c, i) => ({ chave: `cap-inicial-${i}`, tempo: formatarTempo(c.inicioSeg), titulo: c.titulo })),
  );
  const [blocos, setBlocos] = useState<BlocoEditavel[]>(() => editaveisDe(aula.conteudo, aula.imagens, aula.descricao));
  const [modo, setModo] = useState<ModoLiberacao>(aula.liberaAposDias !== null ? "dias" : aula.liberaEm ? "data" : "matricula");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [pendente, iniciar] = useTransition();
  const capitulosComErro = capitulos.some((c) => erroDoCapitulo(c, capitulos, aula.duracaoSeg) !== null);

  return (
    <form
      className="flex flex-col gap-5"
      onChange={() => setFeito(false)}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setErro(null);
        const c = paraConteudo(blocos);
        if ("erro" in c) {
          // Leva o foco (e a rolagem) ao bloco com problema: o erro aparece lá embaixo, junto do Salvar.
          e.currentTarget.querySelectorAll<HTMLElement>("[data-bloco]")[c.bloco]?.focus();
          return setErro(c.erro);
        }
        // Aula antiga sem mexer nos blocos: não grava conteúdo (sem vídeo, ela não vira de leitura).
        const intacta = aulaAntigaIntacta(aula.conteudo, aula.descricao, blocos);
        iniciar(async () => {
          const r = await acaoSalvarAula({
            aulaId: aula.id,
            versao: aula.versao,
            titulo: String(f.get("titulo") ?? ""),
            // Com conteúdo, o servidor deriva a descrição dos blocos de texto; ausente, mantém o conteúdo.
            descricao: intacta ? aula.descricao : "",
            conteudo: intacta ? undefined : c.conteudo,
            liberaEm: modo === "data" ? paraIso(String(f.get("liberaEm") ?? "")) : null,
            liberaAposDias: modo === "dias" ? lerDias(String(f.get("liberaAposDias") ?? "")) : null,
            preRequisitoAulaId: String(f.get("preRequisito") ?? "") || null,
            capitulos: capitulos.map((c) => ({ inicioSeg: lerTempo(c.tempo) ?? -1, titulo: c.titulo.trim() })),
          });
          if (!r.ok) return setErro(r.erro);
          setFeito(true);
          router.refresh();
        });
      }}
    >
      <Campo rotulo="Título" name="titulo" defaultValue={aula.titulo} required minLength={2} maxLength={160} tamanho="42" autoComplete="off" />
      <ConteudoAula
        blocos={blocos}
        onMudar={(b) => {
          setBlocos(b);
          setFeito(false);
        }}
      />
      <div className="grid gap-5 desk:grid-cols-2">
        <Selecao
          rotulo="Liberação"
          name="modoLiberacao"
          value={modo}
          onChange={(e) => setModo(e.target.value as ModoLiberacao)}
          opcoes={MODOS}
        />
        {modo === "data" && (
          <Campo
            rotulo="Data de liberação"
            name="liberaEm"
            type="datetime-local"
            defaultValue={paraCampoLocal(aula.liberaEm)}
            required
            tamanho="42"
            ajuda="Horário de Brasília. Igual para todos os alunos."
          />
        )}
        {modo === "dias" && (
          <Campo
            rotulo="Dias depois da matrícula"
            name="liberaAposDias"
            type="number"
            inputMode="numeric"
            min={1}
            max={3650}
            step={1}
            defaultValue={aula.liberaAposDias ?? ""}
            required
            tamanho="42"
            ajuda="Conta do dia da matrícula de cada aluno (libera à meia-noite de Brasília)."
          />
        )}
        <Selecao
          rotulo="Pré-requisito"
          name="preRequisito"
          defaultValue={aula.preRequisitoAulaId ?? ""}
          vazio="Nenhum"
          opcoes={aulasDoProduto.map((a) => ({ valor: a.id, rotulo: a.titulo, grupo: a.modulo }))}
          ajuda="Aula deste curso que precisa estar concluída antes."
        />
      </div>
      <CapitulosAula capitulos={capitulos} onMudar={(c) => {
          setCapitulos(c);
          setFeito(false);
        }} duracaoSeg={aula.duracaoSeg} />
      {erro && (
        <p role="alert" className="m-0 text-[13px] font-semibold text-warn">
          {erro}
        </p>
      )}
      {feito && (
        <p role="status" className="m-0 text-[13px] font-semibold text-ok">
          Aula salva.
        </p>
      )}
      <Button type="submit" size="42" carregando={pendente} disabled={capitulosComErro} className="self-start">
        Salvar aula
      </Button>
    </form>
  );
}
