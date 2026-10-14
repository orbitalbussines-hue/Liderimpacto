import type { Metadata } from "next";
import { Suspense } from "react";
import { MolduraAbas } from "@/components/admin/moldura-abas";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { ABAS_BASE } from "../_components/comum";
import { TestarBusca } from "../_components/testar-busca";

export const metadata: Metadata = { title: "Testar busca · Base de conhecimento" };

async function Conteudo() {
  await membroDaPagina(EQUIPE);
  return <TestarBusca />;
}

/** Testar busca (DONO e ADMIN): os trechos que o assistente receberia para uma pergunta. */
export default function PaginaTestarBusca() {
  return (
    <MolduraAbas titulo="Base de conhecimento" abas={ABAS_BASE} ativa="Testar busca">
      <Suspense fallback={null}>
        <Conteudo />
      </Suspense>
    </MolduraAbas>
  );
}
