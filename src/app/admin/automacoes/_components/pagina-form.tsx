import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { listarAutomacoes, listarModelos } from "@/lib/marketing/consultas";
import { produtosParaMatricular } from "@/lib/matriculas/consultas";
import { listarTags } from "@/lib/membros/consultas";
import { camposDaAutomacao } from "./campos";
import { FormAutomacao } from "./form-automacao";

/** Página de criar (`automacaoId` vazio) ou editar a automação do criador do HOST (DONO e ADMIN). */
export async function PaginaFormAutomacao({ automacaoId }: { automacaoId?: string }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const [produtos, tags, modelos, automacoes] = await Promise.all([
    produtosParaMatricular(criador.id),
    listarTags(criador.id),
    listarModelos(criador.id),
    automacaoId ? listarAutomacoes(criador.id) : null,
  ]);
  const a = automacoes?.find((x) => x.id === automacaoId);
  if (automacaoId && !a) notFound();

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
      <Link href="/admin/automacoes" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Automações
      </Link>
      <CabecalhoPagina variante="admin" titulo={a ? a.nome : "Nova automação"} />
      <FormAutomacao
        automacao={a && { id: a.id, versao: a.versao.toISOString(), situacao: a.situacao, campos: camposDaAutomacao(a) }}
        produtos={produtos.map((p) => ({ id: p.id, titulo: p.titulo }))}
        tags={tags.map((t) => ({ id: t.id, nome: t.nome }))}
        modelos={modelos.map((m) => ({ id: m.id, nome: m.nome, conteudo: m.conteudo }))}
      />
    </div>
  );
}
