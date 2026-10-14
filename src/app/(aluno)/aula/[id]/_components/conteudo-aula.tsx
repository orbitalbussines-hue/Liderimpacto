import { notFound } from "next/navigation";
import { duracaoCurta, textoDoBloqueio } from "@/components/aluno/formatos";
import { ListaAulas, type GrupoPlaylist } from "@/components/curso/lista-aulas";
import { EstiloMarca } from "@/components/marca/estilo-marca";
import { urlDeImagemOuNula } from "@/lib/armazenamento/cliente";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { aulaParaPlayer } from "@/lib/progresso/consultas";
import { cn } from "@/lib/utils";
import { idSchema } from "@/lib/validators/progresso";
import { AulaInterativa } from "./aula-interativa";
import { QuadroAviso } from "./quadro-aviso";
import { avisoDeBloqueio, avisoDoVideo, eyebrowDaAula } from "./textos";

type Dados = NonNullable<Awaited<ReturnType<typeof aulaParaPlayer>>>;

/** Playlist da tela: módulos, aula aberta marcada, travadas com o motivo curto. */
function gruposDaPlaylist(d: Dados): GrupoPlaylist[] {
  return d.playlist.map((m) => ({
    id: m.id,
    titulo: `Módulo ${Number(m.numero)} · ${m.titulo}`,
    aulas: m.aulas.map((a) => ({
      id: a.id,
      titulo: a.titulo,
      duracao: duracaoCurta(a.duracaoSeg),
      href: a.href,
      estado: a.estado === "concluida" ? "concluida" : "pendente",
      atual: a.id === d.aula.id,
      bloqueio: textoDoBloqueio(a) ?? undefined,
    })),
  }));
}

/**
 * Dados da aula no servidor (sessão do HOST, `aulaParaPlayer` com a mesma trava do token e da
 * chave) e o layout da tela 5: coluna do vídeo | playlist 340 px sticky, na cor do curso.
 */
export interface ParametrosAula {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function ConteudoAula({ params, searchParams }: ParametrosAula) {
  const [{ id }, busca] = await Promise.all([params, searchParams]);
  const q = await membroDaPagina(TODOS_OS_MEMBROS);
  if (!idSchema.safeParse(id).success) notFound();
  const d = await aulaParaPlayer(q, id);
  if (!d) notFound();

  const poster = await urlDeImagemOuNula(q.criador.id, d.aula.thumbChave);
  const atualNaPlaylist = d.playlist.flatMap((m) => m.aulas).find((a) => a.id === d.aula.id);
  const aviso = d.motivoBloqueio
    ? avisoDeBloqueio(d.motivoBloqueio, { produto: d.produto, liberaEm: atualNaPlaylist?.liberaEm ?? null, preRequisito: atualNaPlaylist?.preRequisito ?? null, avaliacaoPendente: atualNaPlaylist?.avaliacaoPendente ?? null })
    : avisoDoVideo(d.video);
  const escopo = d.produto.id;

  return (
    <div data-marca={escopo} className={cn("mx-auto grid max-w-[1400px] items-start gap-6", d.flags.playlist && "desk:grid-cols-[minmax(0,1fr)_340px]")}>
      <EstiloMarca cor={d.produto.corMarca} escopo={escopo} />
      <AulaInterativa
        aula={{ id: d.aula.id, numero: d.aula.numero, titulo: d.aula.titulo, descricao: d.aula.descricao, duracaoSeg: d.aula.duracaoSeg, capitulos: d.aula.capitulos }}
        eyebrow={eyebrowDaAula(d.aula.numero)}
        player={aviso ? null : { poster, marcaDagua: `${q.usuario.nome} · ${q.usuario.email}`, retomarEm: d.retomarEm, autoIniciar: busca.auto === "1" }}
        quadro={aviso ? <QuadroAviso aviso={aviso} poster={poster} /> : undefined}
        flags={d.flags}
        concluida={d.progresso.concluida}
        concluirManual={d.concluirManual}
        podeAnotar={d.pode && !!q.membro.id}
        anterior={d.anterior}
        proxima={d.proxima}
        materiais={d.materiais}
        anotacoes={d.anotacoes}
      />
      {d.flags.playlist && (
        <ListaAulas tituloCurso={d.produto.titulo} aulasConcluidas={d.progressoDoCurso.concluidas} totalAulas={d.progressoDoCurso.total} grupos={gruposDaPlaylist(d)} />
      )}
    </div>
  );
}
