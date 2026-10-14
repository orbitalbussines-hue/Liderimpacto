import Link from "next/link";
import { notFound } from "next/navigation";
import { duracaoCurta, textoDoBloqueio } from "@/components/aluno/formatos";
import { ChatAssistente } from "@/components/assistente/chat-assistente";
import { ListaAulas, type GrupoPlaylist } from "@/components/curso/lista-aulas";
import { assistenteDaAula } from "@/lib/assistente/tela";
import { EstiloMarca } from "@/components/marca/estilo-marca";
import { urlDeImagemOuNula } from "@/lib/armazenamento/cliente";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { comentariosDaAula, situacaoNaComunidade } from "@/lib/comunidade/consultas";
import { iniciais } from "@/lib/comunidade/regras";
import { aulaParaPlayer } from "@/lib/progresso/consultas";
import { Comentarios } from "@/components/comunidade/comentarios";
import { textoSilenciado } from "@/components/comunidade/formatos";
import { cn } from "@/lib/utils";
import { configPublicada } from "@/lib/vitrine/cache";
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
  const d = await aulaParaPlayer(q, id, new Date(), (await configPublicada(q.criador.id))?.player);
  if (!d) notFound();

  const [poster, comentarios, situacao, assistente] = await Promise.all([
    urlDeImagemOuNula(q.criador.id, d.aula.thumbChave),
    d.flags.abas.comentarios ? comentariosDaAula(q, d.aula.id) : null,
    situacaoNaComunidade(q),
    assistenteDaAula(q, { id: d.aula.id, produtoId: d.produto.id, pode: d.pode }),
  ]);
  // `?t=` (link de fonte do assistente): abre a aula naquele segundo.
  const t = typeof busca.t === "string" && /^\d{1,6}$/.test(busca.t) ? Number(busca.t) : null;
  const inicio = t !== null && (!d.aula.duracaoSeg || t < d.aula.duracaoSeg) ? t : d.retomarEm;
  const eu = q.membro.id ? { membroId: q.membro.id, nome: q.usuario.nome, iniciais: iniciais(q.usuario.nome), imagem: null, equipe: situacao.equipe } : null;
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
        player={aviso ? null : { poster, marcaDagua: `${q.usuario.nome} · ${q.usuario.email}`, retomarEm: inicio, autoIniciar: busca.auto === "1" }}
        quadro={aviso ? <QuadroAviso aviso={aviso} poster={poster} /> : undefined}
        flags={d.flags}
        concluida={d.progresso.concluida}
        concluirManual={d.concluirManual}
        podeAnotar={d.pode && !!q.membro.id}
        anterior={d.anterior}
        proxima={d.proxima}
        materiais={d.materiais}
        anotacoes={d.anotacoes}
        abaInicial={typeof busca.aba === "string" ? busca.aba : undefined}
        legendas={aviso ? [] : d.legendas}
        chaveLegenda={`li:legenda:${q.usuario.id}`}
        saltoSeg={t}
        assistente={
          assistente && (
            <ChatAssistente
              nomeAssistente={assistente.nome}
              inicial={assistente.inicial}
              aulaId={d.aula.id}
              avisoPrivacidade
              vazio={
                <p className="m-0 text-sm leading-relaxed text-muted">
                  Tire dúvidas sobre esta aula e as outras do seu curso. A resposta vem só do conteúdo das aulas e cita de onde saiu.{" "}
                  <Link href="/assistente" className="font-semibold text-text underline-offset-2 hover:underline">
                    Ver conversas anteriores
                  </Link>
                </p>
              }
            />
          )
        }
        comentarios={
          comentarios && (
            <Comentarios
              alvo={{ aulaId: d.aula.id }}
              iniciais={comentarios}
              eu={eu}
              bloqueio={situacao.silenciadoAte ? textoSilenciado(situacao.silenciadoAte) : null}
              vazio="Ninguém comentou esta aula ainda. Tire sua dúvida ou conte o que achou."
            />
          )
        }
      />
      {d.flags.playlist && (
        <ListaAulas tituloCurso={d.produto.titulo} aulasConcluidas={d.progressoDoCurso.concluidas} totalAulas={d.progressoDoCurso.total} grupos={gruposDaPlaylist(d)} />
      )}
    </div>
  );
}
