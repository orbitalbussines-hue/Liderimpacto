import type { Metadata } from "next";
import { Suspense } from "react";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { limitesDeEnvio } from "@/lib/marketing/regras";
import { ehUuid } from "../../conteudos/_components/comum";
import { LEADS_TODOS, PUBLICO_VAZIO } from "../_components/comum";
import { dadosDoEditor } from "../_components/dados-editor";
import { EditorCampanha } from "../_components/editor-campanha";

export const metadata: Metadata = { title: "Nova campanha" };

type Busca = Promise<Record<string, string | string[] | undefined>>;

async function Nova({ searchParams }: { searchParams: Busca }) {
  const { usuario, criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  const dados = await dadosDoEditor(criador);
  const idModelo = typeof sp.modelo === "string" && ehUuid(sp.modelo) ? sp.modelo : null;
  const modelo = idModelo ? dados.modelos.find((m) => m.id === idModelo) : undefined;
  // `?leads=1[&pagina=<id>]` (tela de Leads): só leads, da página pedida se ela for DESTE criador.
  const pagina = typeof sp.pagina === "string" && ehUuid(sp.pagina) && dados.opcoes.paginas.some((p) => p.id === sp.pagina) ? sp.pagina : null;
  const publico = sp.leads === "1" ? { ...PUBLICO_VAZIO, membros: false, leads: { ...LEADS_TODOS, paginaIds: pagina ? [pagina] : [] } } : undefined;
  return <EditorCampanha inicial={{ nome: modelo?.nome, conteudo: modelo?.conteudo, publico }} dados={dados} limite={limitesDeEnvio()} nomeUsuario={usuario.nome} />;
}

/** Nova campanha (DONO e ADMIN). `?modelo=<id>` começa com o texto de um modelo; `?leads=1&pagina=<id>` com o público de leads. */
export default function PaginaNovaCampanha({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Nova searchParams={searchParams} />
    </Suspense>
  );
}
