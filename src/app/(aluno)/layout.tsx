import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ShellAluno } from "@/components/aluno/shell-aluno";
import { iniciais } from "@/components/ui/avatar";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { hostAtual } from "@/lib/criador/atual";
import { contarNaoLidas } from "@/lib/notificacoes/consultas";

/**
 * Sessao + criador do HOST, lidos dentro do <Suspense> (cacheComponents). Sem sessao ->
 * /login; sem vinculo ativo neste criador -> 403; apex -> area da plataforma.
 */
async function ShellComSessao({ children }: { children: ReactNode }) {
  if ((await hostAtual()).tipo === "plataforma") redirect("/plataforma");
  const { usuario, criador, membro } = await membroDaPagina(TODOS_OS_MEMBROS);
  const naoLidas = membro.id ? await contarNaoLidas(criador.id, membro.id) : 0;
  return (
    <ShellAluno usuario={{ nome: usuario.nome, iniciais: iniciais(usuario.nome) }} notificacoes={naoLidas} corMarca={criador.cor_marca ?? undefined}>
      {children}
    </ShellAluno>
  );
}

export default function LayoutAluno({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={null}>
      <ShellComSessao>{children}</ShellComSessao>
    </Suspense>
  );
}
