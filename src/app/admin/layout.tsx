import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { ShellAdmin } from "@/components/admin/shell-admin";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { contarNaoLidas } from "@/lib/notificacoes/consultas";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

/**
 * Painel da equipe do criador do HOST. Sem sessao -> /login; ALUNO (ou apex) -> 403 na
 * trilha. SUPER_ADMIN entra como DONO (suporte). Papel lido do banco a cada requisicao.
 * O admin NAO usa a cor personalizada da marca: fica no dourado padrao.
 */
async function ShellComSessao({ children }: { children: ReactNode }) {
  const { usuario, membro, criador } = await membroDaPagina(EQUIPE);
  const naoLidas = membro.id ? await contarNaoLidas(criador.id, membro.id) : 0;
  const papel = membro.papel === "DONO" ? "DONO" : "ADMIN";
  return <ShellAdmin usuario={{ nome: usuario.nome, papel }} naoLidas={naoLidas}>{children}</ShellAdmin>;
}

export default function LayoutAdmin({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ShellComSessao>{children}</ShellComSessao>
    </Suspense>
  );
}
