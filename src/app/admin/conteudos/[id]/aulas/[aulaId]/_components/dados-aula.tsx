"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AreaTexto } from "@/components/ui/area-texto";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { Selecao } from "@/components/ui/selecao";
import { acaoSalvarAula } from "@/lib/actions/aulas";
import type { Capitulo } from "@/lib/db/schema/produtos";
import { formatarTempo, lerTempo } from "@/lib/validators/catalogo";
import { CapitulosAula, erroDoCapitulo, type CapituloEditavel } from "./capitulos-aula";

export interface DadosAulaProps {
  aula: {
    id: string;
    titulo: string;
    descricao: string;
    /** ISO ou null. */
    liberaEm: string | null;
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

/** Dados da aula: título, descrição, liberação, pré-requisito e capítulos. Um "Salvar" com trava. */
export function DadosAula({ aula, aulasDoProduto }: DadosAulaProps) {
  const router = useRouter();
  const [capitulos, setCapitulos] = useState<CapituloEditavel[]>(() =>
    aula.capitulos.map((c, i) => ({ chave: `cap-inicial-${i}`, tempo: formatarTempo(c.inicioSeg), titulo: c.titulo })),
  );
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
        iniciar(async () => {
          const r = await acaoSalvarAula({
            aulaId: aula.id,
            versao: aula.versao,
            titulo: String(f.get("titulo") ?? ""),
            descricao: String(f.get("descricao") ?? ""),
            liberaEm: paraIso(String(f.get("liberaEm") ?? "")),
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
      <AreaTexto rotulo="Descrição" name="descricao" defaultValue={aula.descricao} maxLength={5000} rows={5} />
      <div className="grid gap-5 desk:grid-cols-2">
        <Campo
          rotulo="Liberação"
          name="liberaEm"
          type="datetime-local"
          defaultValue={paraCampoLocal(aula.liberaEm)}
          tamanho="42"
          ajuda="Horário de Brasília. Vazio = libera junto com a matrícula."
        />
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
