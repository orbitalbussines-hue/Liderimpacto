import type { ItemMenuAdmin } from "@/components/admin/menu-admin";

export type Busca = Promise<Record<string, string | string[] | undefined>>;

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/**
 * Busca (`q`) e situação na URL das listas de Ofertas, Cupons e Afiliados. searchParams são entrada do
 * usuário: só passa situação conhecida. Listas pequenas: o filtro roda em memória (`casa`).
 */
export function filtrosDaLista<S extends string>(sp: Record<string, string | string[] | undefined>, base: string, situacoes: readonly S[], rotulos: Record<S, string>) {
  const busca = um(sp.q)?.slice(0, 60);
  const situacao = situacoes.find((s) => s === um(sp.situacao));
  const href = (mudar: Partial<Record<"q" | "situacao", string | undefined>>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: busca, situacao, ...mudar })) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const termo = busca?.toLocaleLowerCase("pt-BR");
  return {
    busca,
    situacao,
    filtrando: !!(busca || situacao),
    casa: (s: string, ...textos: string[]) => (!situacao || s === situacao) && (!termo || textos.some((t) => t.toLocaleLowerCase("pt-BR").includes(termo))),
    formBusca: { nome: "q", manter: situacao ? { situacao: situacao as string } : ({} as Record<string, string>) },
    filtrosAtivos: [
      situacao && { rotulo: `Situação · ${rotulos[situacao]}`, hrefRemover: href({ situacao: undefined }) },
      busca && { rotulo: `Busca · ${busca}`, hrefRemover: href({ q: undefined }) },
    ].filter((f) => !!f),
    menus: [{ rotulo: "Situação", itens: situacoes.map((s): ItemMenuAdmin => ({ rotulo: rotulos[s], href: href({ situacao: s }), marcado: situacao === s })) }],
  };
}
