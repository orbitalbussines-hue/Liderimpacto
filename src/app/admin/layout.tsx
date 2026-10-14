import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { ShellAdmin } from "@/components/admin/shell-admin";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { contarNaoLidas } from "@/lib/notificacoes/consultas";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

/**
 * O painel inteiro depende da sessao (papel lido do banco a cada requisicao): nao ha casca estatica
 * util para navegacao instantanea. Sem isto a validacao do Next 16 acusa "Blocking Route" em
 * /admin/[secao] (Better Auth usa `new Date()` ao ler a sessao). Doc: guides/instant-navigation.
 */
export const instant = false;

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
