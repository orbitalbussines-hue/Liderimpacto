import type { Metadata } from "next";
import { Suspense } from "react";
import { PaginaTabela, type AbaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { dataHoraCurta } from "@/components/comunidade/formatos";
import { MenuFiltro } from "@/components/comunidade/menu-filtro";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { canaisParaEditar } from "@/lib/comunidade/canais";
import { filaDeDenuncias, membrosSilenciados, type DenunciaDaFila } from "@/lib/comunidade/moderacao";
import type { SituacaoDenuncia } from "@/lib/db/schema/_enums";
import { produtosParaMatricular } from "@/lib/matriculas/consultas";
import { listarGrupos } from "@/lib/membros/consultas";
import { AcoesDenuncia } from "./_components/acoes-denuncia";
import { AcoesCanal, NovoCanal } from "./_components/canais";
import { Dessilenciar } from "./_components/dessilenciar";

export const metadata: Metadata = { title: "Comunidade" };

type Busca = Promise<Record<string, string | string[] | undefined>>;
type Aba = "denuncias" | "silenciados" | "canais";
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

const ROTULO_ABA: Record<Aba, string> = { denuncias: "Denúncias", silenciados: "Silenciados", canais: "Canais" };
const ABAS: AbaTabela[] = (Object.keys(ROTULO_ABA) as Aba[]).map((a) => ({ rotulo: ROTULO_ABA[a], href: `/admin/comunidade?aba=${a}` }));
const ROTULO_SITUACAO: Record<SituacaoDenuncia, string> = { ABERTA: "Abertas", RESOLVIDA: "Resolvidas", DESCARTADA: "Descartadas" };
const ROTULO_ACESSO = { TODOS: "Todos os membros", GRUPO: "Grupo", PRODUTO: "Curso", EQUIPE: "Só a equipe" } as const;

/** Busca simples em memória (as listas da moderação têm no máximo 100 itens). */
const contem = (busca: string | undefined, ...textos: (string | null | undefined)[]) => !busca || textos.some((t) => t?.toLowerCase().includes(busca.toLowerCase()));

function conteudo(d: DenunciaDaFila) {
  const estado = d.alvo.removido ? " · removido" : d.alvo.oculto ? " · oculto" : "";
  return (
    <div className="flex min-w-0 flex-col gap-0.5 py-1">
      <span className="text-xs text-muted">
        {d.alvo.tipo === "POST" ? "Publicação" : d.alvo.aulaId ? "Comentário em aula" : "Comentário"} de <b className="font-semibold text-text">{d.alvo.autor.nome}</b>
        {d.alvo.autor.equipe && " · Equipe"}
        {estado}
      </span>
      <span className="line-clamp-2 text-[13px] leading-snug">{d.alvo.trecho}</span>
      {d.decisao && <span className="text-xs text-muted">Decisão: {d.decisao}</span>}
    </div>
  );
}

async function Moderacao({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  const aba: Aba = (["denuncias", "silenciados", "canais"] as const).find((a) => a === um(sp.aba)) ?? "denuncias";
  const busca = um(sp.q)?.slice(0, 100);
  const situacao: SituacaoDenuncia = (["ABERTA", "RESOLVIDA", "DESCARTADA"] as const).find((s) => s === um(sp.situacao)) ?? "ABERTA";
  const comum = { titulo: "Comunidade", abas: ABAS, abaAtiva: ROTULO_ABA[aba], valorBusca: busca };

  if (aba === "silenciados") {
    const lista = (await membrosSilenciados(criador.id)).filter((s) => contem(busca, s.nome, s.motivo));
    const colunas: Coluna[] = [{ titulo: "Membro" }, { titulo: "Silenciado até", largura: 150 }, { titulo: "Motivo", largura: 280 }, { titulo: "Ações", largura: 140 }];
    const linhas: Linha[] = lista.map((s) => [
      { tipo: "texto", texto: s.nome },
      { tipo: "data", texto: dataHoraCurta(s.ate) },
      { tipo: "texto", texto: s.motivo },
      { tipo: "no", conteudo: <Dessilenciar membroId={s.membroId} nome={s.nome} /> },
    ]);
    return (
      <PaginaTabela
        {...comum}
        estatistica={`${lista.length} ${lista.length === 1 ? "membro silenciado" : "membros silenciados"} agora`}
        busca="Pesquise pelo nome ou motivo..."
        formBusca={{ nome: "q", manter: { aba } }}
        colunas={colunas}
        linhas={linhas}
        chaves={lista.map((s) => s.membroId)}
        vazio={{ titulo: "Ninguém silenciado", descricao: "Quem for silenciado pela fila de denúncias aparece aqui até o fim do prazo." }}
      />
    );
  }

  if (aba === "canais") {
    const [todos, grupos, produtos] = await Promise.all([canaisParaEditar(criador.id), listarGrupos(criador.id), produtosParaMatricular(criador.id)]);
    const opcoes = { grupos: grupos.map((g) => ({ id: g.id, nome: g.nome })), produtos: produtos.map((p) => ({ id: p.id, titulo: p.titulo })) };
    const lista = todos.filter((c) => contem(busca, c.nome, c.descricao));
    const colunas: Coluna[] = [{ titulo: "Canal" }, { titulo: "Quem vê", largura: 200 }, { titulo: "Quem publica", largura: 130 }, { titulo: "Publicações", largura: 110 }, { titulo: "Ações", largura: 56 }];
    const linhas: Linha[] = lista.map((c) => [
      { tipo: "texto", texto: `# ${c.nome}${c.padrao ? " (padrão)" : ""}`, sub: c.descricao || undefined },
      { tipo: "texto", texto: ROTULO_ACESSO[c.acesso], sub: c.grupo?.nome ?? c.produto?.titulo },
      { tipo: "texto", texto: c.quemPosta === "EQUIPE" ? "Só a equipe" : "Quem vê" },
      { tipo: "numeroDestaque", texto: String(c.publicacoes) },
      { tipo: "no", conteudo: <AcoesCanal canal={c} todos={todos} opcoes={opcoes} /> },
    ]);
    return (
      <PaginaTabela
        {...comum}
        estatistica={`${todos.length} ${todos.length === 1 ? "canal" : "canais"} · a ordem aqui é a da comunidade`}
        busca="Pesquise pelo nome do canal..."
        formBusca={{ nome: "q", manter: { aba } }}
        acoes={<NovoCanal proximaOrdem={Math.min(999, todos.length + 1)} opcoes={opcoes} />}
        colunas={colunas}
        linhas={linhas}
        chaves={lista.map((c) => c.id)}
        vazio={{ titulo: "Nenhum canal encontrado", descricao: "Ajuste a busca ou crie um canal novo." }}
      />
    );
  }

  const fila = (await filaDeDenuncias(criador.id, situacao)).filter((d) => contem(busca, d.alvo.trecho, d.alvo.autor.nome, d.denunciante.nome, d.motivo));
  const hrefSituacao = (s: SituacaoDenuncia) => `/admin/comunidade?aba=denuncias${s === "ABERTA" ? "" : `&situacao=${s}`}`;
  const colunas: Coluna[] = [{ titulo: "Conteúdo denunciado" }, { titulo: "Denunciado por", largura: 170 }, { titulo: "Motivo", largura: 240 }, { titulo: "Ações", largura: 56 }];
  const linhas: Linha[] = fila.map((d) => [
    { tipo: "no", conteudo: conteudo(d) },
    { tipo: "texto", texto: d.denunciante.nome, sub: dataHoraCurta(d.criadaEm) },
    { tipo: "texto", texto: d.motivo },
    { tipo: "no", conteudo: <AcoesDenuncia d={d} /> },
  ]);
  return (
    <PaginaTabela
      {...comum}
      estatistica={situacao === "ABERTA" ? `${fila.length} ${fila.length === 1 ? "denúncia aberta" : "denúncias abertas"}` : `${fila.length} ${ROTULO_SITUACAO[situacao].toLowerCase()}`}
      busca="Pesquise no conteúdo, autor ou motivo..."
      formBusca={{ nome: "q", manter: situacao === "ABERTA" ? { aba } : { aba, situacao } }}
      controles={
        <MenuFiltro rotulo={ROTULO_SITUACAO[situacao]} itens={(["ABERTA", "RESOLVIDA", "DESCARTADA"] as const).map((s) => ({ rotulo: ROTULO_SITUACAO[s], href: hrefSituacao(s), marcado: s === situacao }))} />
      }
      colunas={colunas}
      linhas={linhas}
      chaves={fila.map((d) => d.id)}
      vazio={situacao === "ABERTA" ? { titulo: "Nenhuma denúncia aberta", descricao: "Quando alguém denunciar uma publicação ou comentário, aparece aqui para a equipe decidir." } : { titulo: `Nenhuma denúncia ${ROTULO_SITUACAO[situacao].toLowerCase().replace(/s$/, "")}` }}
    />
  );
}

/** Moderação da comunidade (DONO/ADMIN): fila de denúncias, silenciados e canais. `?aba=denuncias` abre a fila. */
export default function PaginaModeracao({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Moderacao searchParams={searchParams} />
    </Suspense>
  );
}
