import type { Metadata } from "next";
import { Suspense } from "react";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { urlDaPlataforma } from "@/lib/criador/area";
import { marcaDaArea } from "@/lib/email/modelo";
import { provedorEmail } from "@/lib/marketing/provedor";
import { EditorModelo } from "../../_components/editor-modelo";

export const metadata: Metadata = { title: "Novo modelo" };

async function Novo() {
  const { usuario, criador } = await membroDaPagina(EQUIPE);
  return <EditorModelo marca={marcaDaArea(criador, urlDaPlataforma())} emailLigado={provedorEmail().configurado()} nomeUsuario={usuario.nome} />;
}

/** Novo modelo de e-mail (DONO e ADMIN). */
export default function PaginaNovoModelo() {
  return (
    <Suspense fallback={null}>
      <Novo />
    </Suspense>
  );
}
