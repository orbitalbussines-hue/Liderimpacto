import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { campanhaDoCriador } from "@/lib/marketing/consultas";
import { campanhaEditavel, limitesDeEnvio } from "@/lib/marketing/regras";
import { ehUuid } from "../../../conteudos/_components/comum";
import { dadosDoEditor } from "../../_components/dados-editor";
import { EditorCampanha } from "../../_components/editor-campanha";

export const metadata: Metadata = { title: "Editar campanha" };

type Params = Promise<{ id: string }>;

async function Editar({ params }: { params: Params }) {
  const { id } = await params;
  const { usuario, criador } = await membroDaPagina(EQUIPE);
  if (!ehUuid(id)) notFound();
  const [c, dados] = await Promise.all([campanhaDoCriador(criador.id, id), dadosDoEditor(criador)]);
  if (!c) notFound();
  if (!campanhaEditavel(c.situacao)) redirect(`/admin/campanhas/${id}`);
  return (
    <EditorCampanha
      campanha={{ id: c.id, versao: c.versao.toISOString(), situacao: c.situacao, nome: c.nome, conteudo: c.conteudo, publico: c.publico }}
      dados={dados}
      limite={limitesDeEnvio()}
      nomeUsuario={usuario.nome}
    />
  );
}

/** Editar campanha em rascunho ou agendada (depois de começar a sair, só o resultado). */
export default function PaginaEditarCampanha({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <Editar params={params} />
    </Suspense>
  );
}
