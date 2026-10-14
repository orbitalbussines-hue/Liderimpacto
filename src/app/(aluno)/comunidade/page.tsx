import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ChevronLeft, Megaphone } from "lucide-react";
import { CompositorComunidade } from "@/components/comunidade/compositor-comunidade";
import { FeedComunidade } from "@/components/comunidade/feed-comunidade";
import { contagem, estadoDoCompositor, hrefDoPost, textoSilenciado } from "@/components/comunidade/formatos";
import { MenuFiltro } from "@/components/comunidade/menu-filtro";
import { PostAberto } from "@/components/comunidade/post-aberto";
import { SeletorCanal } from "@/components/comunidade/seletor-canal";
import { CartaoFixados } from "@/components/engajamento/cartao-fixados";
import { CartaoMembrosAtivos } from "@/components/engajamento/cartao-membros-ativos";
import { EncontroDaComunidade } from "@/components/engajamento/encontro-da-comunidade";
import { ListaCanais } from "@/components/engajamento/lista-canais";
import { Esqueleto } from "@/components/ui/esqueleto";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { canaisDoMembro } from "@/lib/comunidade/canais";
import { aulasParaRelacionar, feedDaComunidade, lateralDaComunidade, postDaComunidade, situacaoNaComunidade, totalDePublicacoes, type AutorPublico } from "@/lib/comunidade/consultas";
import { iniciais, type OrdemFeed } from "@/lib/comunidade/regras";
import { idSchema } from "@/lib/validators/comunidade";

export const metadata: Metadata = { title: "Comunidade" };

type Busca = Promise<Record<string, string | string[] | undefined>>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
/** searchParams são entrada do usuário: id fora do formato = sem filtro (post: 404). */
const idOuNulo = (v: string | string[] | undefined) => {
  const r = idSchema.safeParse(um(v));
  return r.success ? r.data : null;
};

const ROTULO_ORDEM: Record<OrdemFeed, string> = { RECENTES: "Recentes", CURTIDOS: "Mais curtidos" };

async function Comunidade({ searchParams }: { searchParams: Busca }) {
  const q = await membroDaPagina(TODOS_OS_MEMBROS);
  const sp = await searchParams;
  const postId = idOuNulo(sp.post);
  if (um(sp.post) && !postId) notFound();
  const canalId = postId ? null : idOuNulo(sp.canal);
  const ordem: OrdemFeed = um(sp.ordem) === "curtidos" ? "CURTIDOS" : "RECENTES";

  const [canais, situacao, lateral] = await Promise.all([canaisDoMembro(q), situacaoNaComunidade(q), lateralDaComunidade(q)]);
  const canal = canalId ? (canais.find((c) => c.id === canalId) ?? null) : null;
  if (canalId && !canal) notFound();

  const eu: AutorPublico | null = q.membro.id ? { membroId: q.membro.id, nome: q.usuario.nome, iniciais: iniciais(q.usuario.nome), imagem: null, equipe: situacao.equipe } : null;
  const bloqueio = situacao.silenciadoAte ? textoSilenciado(situacao.silenciadoAte) : null;
  const hrefCanal = (id: string | null, o: OrdemFeed = ordem) => {
    const p = new URLSearchParams();
    if (id) p.set("canal", id);
    if (o === "CURTIDOS") p.set("ordem", "curtidos");
    const qs = p.toString();
    return qs ? `/comunidade?${qs}` : "/comunidade";
  };
  const navCanais = [{ id: "todos", nome: "Home", href: hrefCanal(null) }, ...canais.map((c) => ({ id: c.id, nome: c.nome, href: hrefCanal(c.id), restrito: c.acesso !== "TODOS" }))];
  const ativoId = postId ? undefined : (canal?.id ?? "todos");

  let centro: ReactNode;
  if (postId) {
    const aberto = await postDaComunidade(q, postId);
    if (!aberto) notFound();
    centro = (
      <>
        <Link href={hrefCanal(aberto.post.canal.id)} className="inline-flex items-center gap-1 self-start text-[13px] font-semibold text-muted hover:text-text">
          <ChevronLeft aria-hidden className="size-4" />
          Voltar para # {aberto.post.canal.nome}
        </Link>
        <PostAberto post={aberto.post} comentarios={aberto.comentarios} eu={eu} bloqueio={bloqueio} />
      </>
    );
  } else {
    const [feed, total, aulas] = await Promise.all([feedDaComunidade(q, { canalId, ordem }), totalDePublicacoes(q, canalId), eu ? aulasParaRelacionar(q) : Promise.resolve([])]);
    if (!feed) notFound();
    const paraPublicar = canais.filter((c) => c.podePublicar);
    const estado = estadoDoCompositor(situacao, canal, paraPublicar.length);
    centro = (
      <>
        {canal?.descricao && <p className="m-0 text-[13px] leading-relaxed text-muted">{canal.descricao}</p>}
        {(estado === "livre" || estado === "silenciado") && eu && (
          <CompositorComunidade
            nomeUsuario={eu.nome}
            bloqueio={bloqueio}
            canalId={canal?.id ?? null}
            canais={paraPublicar.map((c) => ({ id: c.id, nome: c.nome }))}
            aulas={aulas.map((a) => ({ id: a.id, titulo: a.titulo, grupo: a.produtoTitulo }))}
          />
        )}
        {estado === "so-equipe" && (
          <p className="m-0 flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-[13px] text-muted">
            <Megaphone aria-hidden className="size-4 shrink-0" />
            {canal ? `Só a equipe publica em # ${canal.nome}. Você pode curtir, votar e comentar.` : "Só a equipe publica por aqui. Você pode curtir, votar e comentar."}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <MenuFiltro className="bg-surface" rotulo={ROTULO_ORDEM[ordem]} itens={(["RECENTES", "CURTIDOS"] as const).map((o) => ({ rotulo: ROTULO_ORDEM[o], href: hrefCanal(canal?.id ?? null, o), marcado: o === ordem }))} />
          <span className="text-[13px] text-muted">{contagem(total, "publicação", "publicações")}</span>
        </div>
        <FeedComunidade key={`${canalId}-${ordem}-${total}-${feed.itens[0]?.id}-${feed.itens[0]?.versao}`} inicial={feed} canalId={canalId} ordem={ordem} meuMembroId={eu?.membroId ?? null} />
      </>
    );
  }

  return (
    <div className="mx-auto grid max-w-[1280px] items-start gap-6 desk:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_280px]">
      <aside className="hidden desk:sticky desk:top-24 desk:block">
        <ListaCanais comoTitulo="h1" canais={navCanais} ativoId={ativoId} />
      </aside>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-3 desk:hidden">
          <h1 className="m-0 font-sans text-[22px] font-extrabold tracking-normal">Comunidade</h1>
          <SeletorCanal canais={navCanais} ativoHref={navCanais.find((c) => c.id === ativoId)?.href ?? hrefCanal(null)} />
        </div>
        {/* Abaixo de xl o lateral cai para depois do feed: o encontro sobe para o topo (no celular é o caminho até /eventos). */}
        {lateral.proximoEncontro && !postId && <EncontroDaComunidade evento={lateral.proximoEncontro} idTitulo="titulo-encontro-topo" className="xl:hidden" />}
        {centro}
      </div>
      {(lateral.proximoEncontro || lateral.fixados.length > 0 || lateral.membrosAtivos.length > 0) && (
        <aside aria-label="Destaques da comunidade" className="flex flex-col gap-4 desk:col-start-2 xl:sticky xl:top-24 xl:col-start-auto">
          {lateral.proximoEncontro && <EncontroDaComunidade evento={lateral.proximoEncontro} comAgenda className="hidden xl:flex" />}
          {lateral.fixados.length > 0 && <CartaoFixados variante="lista" links={lateral.fixados.map((f) => ({ rotulo: f.titulo, href: hrefDoPost(f.id), detalhe: `# ${f.canalNome}` }))} />}
          {lateral.membrosAtivos.length > 0 && (
            <CartaoMembrosAtivos
              membros={lateral.membrosAtivos.map((m) =>
                // Com a gamificação ligada, o aluno mostra os pontos; equipe e quem saiu do ranking, as interações.
                m.pontos !== null ? { nome: m.nome, src: m.imagem, pontos: m.pontos } : { nome: m.nome, src: m.imagem, detalhe: contagem(m.interacoes, "interação", "interações") },
              )}
            />
          )}
        </aside>
      )}
    </div>
  );
}

const esqueleto = (
  <div aria-busy className="mx-auto grid max-w-[1280px] items-start gap-6 desk:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_280px]">
    <span className="sr-only">Carregando a comunidade</span>
    <div className="hidden flex-col gap-2 desk:flex">
      <Esqueleto className="mb-2 h-6 w-32" />
      {[0, 1, 2, 3].map((i) => (
        <Esqueleto key={i} className="h-10 rounded-[10px]" />
      ))}
    </div>
    <div className="flex flex-col gap-4">
      <Esqueleto className="h-[118px] rounded-2xl" />
      {[0, 1].map((i) => (
        <Esqueleto key={i} className="h-[190px] rounded-2xl" />
      ))}
    </div>
    <div className="hidden flex-col gap-4 xl:flex">
      <Esqueleto className="h-[150px] rounded-2xl" />
      <Esqueleto className="h-[190px] rounded-2xl" />
    </div>
  </div>
);

/** Tela 8 (Comunidade): canais | feed (ou post aberto em `?post=`) | fixados e membros ativos. */
export default function PaginaComunidade({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={esqueleto}>
      <Comunidade searchParams={searchParams} />
    </Suspense>
  );
}
