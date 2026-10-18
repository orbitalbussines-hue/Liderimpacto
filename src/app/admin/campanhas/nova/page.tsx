import type { Metadata } from "next";
import { Suspense } from "react";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { limitesDeEnvio } from "@/lib/marketing/regras";
import { ehUuid } from "../../conteudos/_components/comum";
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
  return <EditorCampanha inicial={modelo && { nome: modelo.nome, conteudo: modelo.conteudo }} dados={dados} limite={limitesDeEnvio()} nomeUsuario={usuario.nome} />;
}

/** Nova campanha (DONO e ADMIN). `?modelo=<id>` começa com o texto de um modelo. */
export default function PaginaNovaCampanha({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Nova searchParams={searchParams} />
    </Suspense>
  );
}
