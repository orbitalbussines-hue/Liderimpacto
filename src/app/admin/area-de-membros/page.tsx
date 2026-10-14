import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, ExternalLink, Monitor, Users } from "lucide-react";
import { itemAtivo, papelPodeVer, secaoPorSlug, type CartaoMolde } from "@/components/admin/navegacao";
import { GradeCards } from "@/components/admin/pagina-cards";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Estatistica } from "@/components/ui/estatistica";
import { IconeQuadrado } from "@/components/ui/icone-quadrado";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { enderecoDaArea } from "@/lib/criador/area";
import { resumoDaArea } from "@/lib/criador/consultas";
import { listarGrupos } from "@/lib/membros/consultas";

export const metadata: Metadata = { title: "Área de membros" };

const ROTULO_TIPO_GRUPO: Record<string, string> = { TURMA: "Turma", ACESSO: "Grupo de acesso" };
const MAX_GRUPOS = 6;

/** Atalhos do hub (cards do `navegacao.ts`), só os que o papel abre. */
function atalhosDoPapel(papel: "DONO" | "ADMIN"): CartaoMolde[] {
  const molde = secaoPorSlug("area-de-membros")?.molde;
  if (molde?.tipo !== "cards") return [];
  return molde.cards.filter((c) => {
    const destino = c.href ? itemAtivo(c.href) : null;
    return !destino || papelPodeVer(papel, destino);
  });
}

/** Hub da área do criador do HOST (DONO e ADMIN): área principal, turmas/grupos e atalhos. */
async function Hub() {
  const { criador, membro } = await membroDaPagina(EQUIPE);
  const papel = membro.papel === "DONO" ? "DONO" : "ADMIN";
  const [resumo, grupos] = await Promise.all([resumoDaArea(criador.id), listarGrupos(criador.id)]);
  const endereco = enderecoDaArea(criador.slug);

  return (
    <>
      <Cartao padding={24} como="section" aria-labelledby="titulo-area" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start gap-3.5">
          <IconeQuadrado tamanho={44}>
            <Monitor />
          </IconeQuadrado>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CartaoTitulo tamanho={16} como="h2" id="titulo-area">
                {criador.nome}
              </CartaoTitulo>
              <Selo tom="accent" forma="etiqueta">
                Principal
              </Selo>
            </div>
            <a href={endereco.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[13px] text-accent hover:underline">
              {endereco.host}
              <ExternalLink className="size-3" aria-hidden />
              <span className="sr-only">(abre em nova aba)</span>
            </a>
          </div>
          <a href={endereco.url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "contorno", size: "36", className: "w-full desk:w-auto" })}>
            Ver como aluno
          </a>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Estatistica valor={resumo.membros} rotulo="Membros ativos" />
          <Estatistica valor={resumo.alunos} rotulo="Alunos ativos" />
          <Estatistica valor={resumo.cursos} rotulo="Produtos publicados" />
        </div>
      </Cartao>

      <Cartao padding={0} como="section" aria-labelledby="titulo-grupos">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
          <CartaoTitulo tamanho={15} como="h2" id="titulo-grupos">
            Turmas e grupos de acesso
          </CartaoTitulo>
          <Link href="/admin/membros/grupos" className={buttonVariants({ variant: "link" })}>
            {grupos.length ? `Ver todos (${grupos.length})` : "Criar grupo"}
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        </div>
        {grupos.length === 0 ? (
          <EstadoVazio icone={<Users />} titulo="Nenhuma turma ainda" descricao="Turmas e grupos separam os alunos para matricular e liberar conteúdo em bloco." />
        ) : (
          <ul className="m-0 list-none border-t border-border p-0">
            {grupos.slice(0, MAX_GRUPOS).map((g) => (
              <li key={g.id} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-b-0">
                <IconeQuadrado tamanho={32} tom="neutro">
                  <Users />
                </IconeQuadrado>
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/membros?grupo=${g.id}`} className="block truncate text-sm font-semibold hover:underline">
                    {g.nome}
                  </Link>
                  <span className="text-xs text-muted">{ROTULO_TIPO_GRUPO[g.tipo] ?? g.tipo}</span>
                </div>
                <span className="shrink-0 text-[13px] text-muted tabular-nums">
                  {g.membros} {g.membros === 1 ? "membro" : "membros"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <section aria-labelledby="titulo-atalhos" className="flex flex-col gap-3">
        <h2 id="titulo-atalhos" className="m-0 text-base">
          Personalizar e gerenciar
        </h2>
        <GradeCards cards={atalhosDoPapel(papel)} />
      </section>
    </>
  );
}

export default function PaginaAreaDeMembros() {
  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina variante="admin" titulo="Área de membros" descricao="A área onde seus alunos assistem, com as turmas e os atalhos de personalização." />
      <Suspense fallback={null}>
        <Hub />
      </Suspense>
    </div>
  );
}
