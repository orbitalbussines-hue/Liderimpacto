import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { urlDaPlataforma } from "@/lib/criador/area";
import { marcaDaArea } from "@/lib/email/modelo";
import { listarModelos } from "@/lib/marketing/consultas";
import { provedorEmail } from "@/lib/marketing/provedor";
import { ehUuid } from "../../../conteudos/_components/comum";
import { EditorModelo } from "../../_components/editor-modelo";

export const metadata: Metadata = { title: "Editar modelo" };

type Params = Promise<{ id: string }>;

async function Editar({ params }: { params: Params }) {
  const { id } = await params;
  const { usuario, criador } = await membroDaPagina(EQUIPE);
  if (!ehUuid(id)) notFound();
  // ponytail: lê a lista toda (poucos modelos por área); leitura por id se passar de centenas.
  const m = (await listarModelos(criador.id)).find((x) => x.id === id);
  if (!m) notFound();
  return (
    <EditorModelo
      modelo={{ id: m.id, versao: m.versao.toISOString(), nome: m.nome, conteudo: m.conteudo }}
      marca={marcaDaArea(criador, urlDaPlataforma())}
      emailLigado={provedorEmail().configurado()}
      nomeUsuario={usuario.nome}
    />
  );
}

/** Editar modelo de e-mail (DONO e ADMIN). */
export default function PaginaEditarModelo({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <Editar params={params} />
    </Suspense>
  );
}
