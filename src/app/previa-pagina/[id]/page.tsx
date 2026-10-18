import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BlocosDaPagina } from "@/components/paginas/blocos";
import { MolduraPagina } from "@/components/paginas/moldura-pagina";
import { PontePreviaPagina } from "@/components/paginas/ponte-previa-pagina";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { dadosParaRender, paginaEmRascunho } from "@/lib/paginas/publico";
import { idSchema } from "@/lib/validators/membros";

export const metadata: Metadata = { title: "Prévia da página", robots: { index: false, follow: false } };

async function Previa({ params }: PageProps<"/previa-pagina/[id]">) {
  const [{ id }, { criador }] = await Promise.all([params, membroDaPagina(EQUIPE)]);
  const pagina = idSchema.safeParse(id).success ? await paginaEmRascunho(criador.id, id) : null;
  if (!pagina) notFound();
  const dados = await dadosParaRender(criador.id, pagina.config);
  return (
    <MolduraPagina tema={pagina.config.tema} criador={criador}>
      <PontePreviaPagina />
      <BlocosDaPagina config={pagina.config} dados={dados} ctx={{ paginaId: pagina.id, funilId: null, cupom: null, afiliado: null, utm: {}, previa: true }} slug={pagina.slug} />
    </MolduraPagina>
  );
}

/**
 * PRÉVIA do editor (ADR-0022): o RASCUNHO montado com os mesmos blocos da página pública, no <iframe> do
 * editor. Só equipe (ALUNO = 403). Botão de preço e formulário não fazem nada aqui. `?v=` só recarrega.
 */
export default function PaginaPreviaPagina(props: PageProps<"/previa-pagina/[id]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
      <Previa {...props} />
    </Suspense>
  );
}
