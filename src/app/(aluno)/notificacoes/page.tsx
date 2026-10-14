import type { Metadata } from "next";
import { Suspense } from "react";
import { ListaCompleta } from "@/components/notificacoes/lista-completa";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Esqueleto } from "@/components/ui/esqueleto";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { notificacoesDoMembro } from "@/lib/notificacoes/consultas";

export const metadata: Metadata = { title: "Notificações" };

async function Notificacoes() {
  const q = await membroDaPagina(TODOS_OS_MEMBROS);
  const inicial = q.membro.id ? await notificacoesDoMembro(q.criador.id, q.membro.id) : { itens: [], proximoCursor: null };
  return <ListaCompleta inicial={inicial} />;
}

export default function PaginaNotificacoes() {
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina variante="aluno" titulo="Notificações" descricao="Respostas, curtidas e avisos dos seus cursos e comunidades." />
      <Suspense fallback={<Esqueleto className="h-64 max-w-[720px] rounded-2xl" />}>
        <Notificacoes />
      </Suspense>
    </div>
  );
}
