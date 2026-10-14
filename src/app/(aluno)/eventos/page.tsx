import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, PlayCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Esqueleto } from "@/components/ui/esqueleto";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { eventosPassados, eventosProximos, type EventoDoMembro } from "@/lib/eventos/consultas";
import { DestaqueEvento } from "./_components/destaque-evento";
import { LinhaEvento } from "./_components/linha-evento";

export const metadata: Metadata = { title: "Encontros ao vivo" };

const situacao = (e: EventoDoMembro) => (e.situacao === "CANCELADO" ? "Cancelado" : e.momento === "ABERTO" ? "Ao vivo agora" : e.inscrito ? "Presença confirmada" : undefined);

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={titulo}>
      <h2 className="m-0 font-sans text-[17px] font-extrabold tracking-normal">{titulo}</h2>
      {children}
    </section>
  );
}

async function ListaEventos() {
  const q = await membroDaPagina(TODOS_OS_MEMBROS);
  const agora = new Date();
  const [proximos, passados] = await Promise.all([eventosProximos(q, agora), eventosPassados(q, agora, 20)]);
  if (proximos.length === 0 && passados.length === 0)
    return (
      <EstadoVazio
        comMoldura
        icone={<CalendarDays />}
        titulo="Nenhum encontro marcado por enquanto"
        descricao="Quando a equipe marcar uma aula ao vivo ou mentoria, ela aparece aqui e você recebe um aviso no sino."
        className="py-16"
      />
    );

  const destaque = proximos.find((e) => e.situacao === "PUBLICADO") ?? null;
  const demais = proximos.filter((e) => e !== destaque);
  return (
    <>
      {destaque && <DestaqueEvento evento={destaque} />}
      {demais.length > 0 && (
        <Secao titulo={destaque ? "Mais encontros" : "Próximos encontros"}>
          {demais.map((e) => (
            <LinhaEvento key={e.id} id={e.id} titulo={e.titulo} inicioEm={e.inicioEm} duracaoMin={e.duracaoMin} apagado={e.situacao === "CANCELADO"} situacao={situacao(e)} />
          ))}
        </Secao>
      )}
      {!destaque && demais.length === 0 && <p className="m-0 text-sm text-muted">Nenhum encontro marcado por enquanto. Veja abaixo os que já aconteceram.</p>}
      {passados.length > 0 && (
        <Secao titulo="Encontros anteriores">
          {passados.map((e) => (
            <LinhaEvento
              key={e.id}
              id={e.id}
              titulo={e.titulo}
              inicioEm={e.inicioEm}
              duracaoMin={e.duracaoMin}
              apagado
              situacao={e.situacao === "CANCELADO" ? "Cancelado" : undefined}
              acao={
                e.gravacaoAulaId && (
                  <Link href={`/aula/${e.gravacaoAulaId}`} className={buttonVariants({ variant: "contorno", size: "40", className: "max-desk:w-full" })}>
                    <PlayCircle aria-hidden />
                    Assistir gravação
                  </Link>
                )
              }
            />
          ))}
        </Secao>
      )}
    </>
  );
}

const esqueleto = (
  <div aria-busy className="flex flex-col gap-4">
    <span className="sr-only">Carregando os encontros</span>
    <Esqueleto className="h-[150px] rounded-[18px]" />
    {[0, 1].map((i) => (
      <Esqueleto key={i} className="h-[88px] rounded-2xl" />
    ))}
  </div>
);

/** Encontros ao vivo do público do membro (RN-142): o próximo em destaque, os demais e os anteriores com gravação. */
export default function PaginaEventos() {
  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-6">
      <CabecalhoPagina titulo="Encontros ao vivo" descricao="Aulas ao vivo e mentorias. Confirme presença para receber um lembrete 1 hora antes." />
      <Suspense fallback={esqueleto}>
        <ListaEventos />
      </Suspense>
    </div>
  );
}
