import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Award, ClipboardList, ShieldCheck } from "lucide-react";
import { AtualizarEnquantoGera } from "@/components/certificados/atualizar-enquanto-gera";
import { BotaoBaixarCertificado } from "@/components/certificados/botao-baixar-certificado";
import { CartaoCertificado } from "@/components/engajamento/cartao-certificado";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Esqueleto } from "@/components/ui/esqueleto";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { certificadosDoAluno, type CertificadoBloqueado } from "@/lib/certificados/consultas";

export const metadata: Metadata = { title: "Certificados" };

const data = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "Faltam 5 aulas · 1 avaliação" (o que ainda impede a emissão). */
function oQueFalta(b: CertificadoBloqueado): string {
  const partes = [
    b.aulasRestantes > 0 ? plural(b.aulasRestantes, "aula", "aulas") : null,
    b.avaliacoesPendentes.length > 0 ? plural(b.avaliacoesPendentes.length, "avaliação", "avaliações") : null,
  ].filter(Boolean);
  return partes.length ? `Falta${b.aulasRestantes + b.avaliacoesPendentes.length > 1 ? "m" : ""} ${partes.join(" e ")}` : "Finalizando a conclusão do curso";
}

const GRADE = "grid gap-[18px] min-[700px]:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]";

async function Certificados() {
  const q = await membroDaPagina(TODOS_OS_MEMBROS);
  const { emitidos, bloqueados } = await certificadosDoAluno(q);
  if (emitidos.length === 0 && bloqueados.length === 0)
    return (
      <EstadoVazio
        comMoldura
        icone={<Award />}
        titulo="Nenhum certificado ainda"
        descricao="Ao concluir todas as aulas e avaliações obrigatórias de um curso, o certificado é emitido sozinho e aparece aqui."
        acao={
          <Link href="/continuar" className={buttonVariants({ variant: "contorno", size: "40" })}>
            Ver meus cursos
          </Link>
        }
        className="py-16"
      />
    );
  const gerando = emitidos.some((c) => c.situacao === "EMITIDO" && (c.pdf === null || c.pdf.situacao === "PENDENTE"));
  return (
    <>
      <AtualizarEnquantoGera ativo={gerando} />
      <ul className={`m-0 list-none p-0 ${GRADE}`} aria-label="Seus certificados">
        {emitidos.map((c) => {
          const revogado = c.situacao === "REVOGADO";
          const gerando = !revogado && (c.pdf === null || c.pdf.situacao === "PENDENTE");
          return (
            <li key={c.id} className="grid">
              <CartaoCertificado
                titulo={c.curso.titulo}
                nomeAluno={c.nome || q.usuario.nome}
                bloqueado={false}
                meta={revogado && c.revogadoEm ? `Emitido em ${data(c.emitidoEm)} · revogado em ${data(c.revogadoEm)}` : `Emitido em ${data(c.emitidoEm)} · ${c.cargaHoraria}`}
                sobreposicao={revogado ? "Certificado revogado" : undefined}
                selo={
                  revogado ? (
                    <Selo tom="warn">Revogado</Selo>
                  ) : gerando ? (
                    <Selo tom="accent">Gerando PDF</Selo>
                  ) : (
                    <Selo tom="ok">
                      <ShieldCheck className="size-3" aria-hidden />
                      Válido
                    </Selo>
                  )
                }
                detalhe={
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                    <span>
                      Código <b className="font-mono font-semibold tracking-wide text-text">{c.codigoLegivel}</b>
                    </span>
                    {!revogado && (
                      <Link href={`/certificado/${c.codigo}`} target="_blank" className="font-semibold text-accent underline-offset-2 hover:underline">
                        Verificar<span className="sr-only"> o certificado de {c.curso.titulo} (abre em nova aba)</span>
                      </Link>
                    )}
                  </div>
                }
                acao={<BotaoBaixarCertificado certificadoId={c.id} pdf={c.pdf?.situacao ?? null} revogado={revogado} larguraTotal />}
              />
            </li>
          );
        })}
        {bloqueados.map((b) => (
          <li key={b.curso.id} className="grid">
            <CartaoCertificado
              titulo={b.curso.titulo}
              nomeAluno={q.usuario.nome}
              bloqueado
              progresso={b.percentual}
              meta={oQueFalta(b)}
              hrefCurso={`/cursos/${b.curso.slug}`}
              detalhe={
                b.avaliacoesPendentes.length > 0 && (
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label={`Avaliações pendentes de ${b.curso.titulo}`}>
                    {b.avaliacoesPendentes.map((a) => (
                      <li key={a.id}>
                        <Link href={a.href} className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent underline-offset-2 hover:underline">
                          <ClipboardList className="size-3.5" aria-hidden />
                          {a.titulo}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )
              }
            />
          </li>
        ))}
      </ul>
    </>
  );
}

const esqueleto = (
  <div aria-busy className={GRADE}>
    <span className="sr-only">Carregando certificados</span>
    {[0, 1, 2].map((i) => (
      <Esqueleto key={i} className="h-[380px] rounded-[18px]" />
    ))}
  </div>
);

/** Certificados (README tela 9): emitidos (baixar, verificar) e bloqueados (progresso e o que falta). */
export default function PaginaCertificados() {
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <CabecalhoPagina titulo="Certificados" descricao="Emitidos automaticamente ao concluir 100% das aulas e avaliações." />
      <Suspense fallback={esqueleto}>
        <Certificados />
      </Suspense>
    </div>
  );
}
