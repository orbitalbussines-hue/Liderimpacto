import type { Metadata } from "next";
import { Suspense } from "react";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { rascunhoEfetivo } from "@/lib/vitrine/dados";
import { PontePrevia } from "../_vitrine/ponte-previa";
import { EsqueletoVitrine, VitrineMontada } from "../_vitrine/vitrine-montada";

export const metadata: Metadata = { title: "Prévia da vitrine" };

type Busca = Promise<Record<string, string | string[] | undefined>>;

/**
 * PRÉVIA do construtor (ADR-0010): a vitrine REAL montada no servidor com o RASCUNHO, dentro do
 * <iframe> do construtor (1440 escalada ou 390). Só equipe (ALUNO = 403). `?v=` só força recarregar
 * depois do autosave; `?sel=` é o bloco selecionado.
 */
async function Previa({ searchParams }: { searchParams: Busca }) {
  const [q, busca] = await Promise.all([membroDaPagina(EQUIPE), searchParams]);
  const sel = typeof busca.sel === "string" && /^[a-z0-9_-]{1,40}$/.test(busca.sel) ? busca.sel : null;
  return (
    <>
      {/* Na prévia o atalho da equipe some: o desenho é o que o ALUNO vê. */}
      <style>{`a[href="/admin"]{display:none!important}`}</style>
      <PontePrevia selecionado={sel} />
      <VitrineMontada q={q} config={await rascunhoEfetivo(q.criador.id)} previa />
    </>
  );
}

export default function PaginaPreviaVitrine({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={<EsqueletoVitrine />}>
      <Previa searchParams={searchParams} />
    </Suspense>
  );
}
