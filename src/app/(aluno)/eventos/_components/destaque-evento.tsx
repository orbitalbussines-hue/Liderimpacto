import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { BlocoData } from "@/components/engajamento/bloco-data";
import { buttonVariants } from "@/components/ui/button";
import { Cartao } from "@/components/ui/cartao";
import type { EventoDoMembro } from "@/lib/eventos/consultas";
import { ROTA_EVENTOS } from "@/lib/eventos/regras";
import { diaEMes, duracaoTexto, quandoPorExtenso, textoConfirmados } from "@/lib/eventos/tela";
import { BotaoPresenca } from "./botao-presenca";
import { ContagemEvento } from "./contagem-evento";

/** O próximo encontro em destaque: contagem (ou "Ao vivo agora"), quando, confirmados e a ação certa. */
export function DestaqueEvento({ evento: e }: { evento: EventoDoMembro }) {
  const { dia, mes } = diaEMes(e.inicioEm);
  const href = `${ROTA_EVENTOS}/${e.id}`;
  return (
    <Cartao como="article" padding={24} raio={18} className="flex flex-col gap-5 desk:flex-row desk:items-center" aria-labelledby={`destaque-${e.id}`}>
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <BlocoData dia={dia} mes={mes} tamanho="grande" />
        <div className="flex min-w-0 flex-col gap-1">
          <ContagemEvento inicioEm={e.inicioEm.toISOString()} fimEm={e.fimEm.toISOString()} className="text-[13px] font-bold text-accent" />
          <h2 id={`destaque-${e.id}`} className="m-0 text-[24px] leading-tight desk:text-[28px]">
            <Link href={href} className="hover:underline">
              {e.titulo}
            </Link>
          </h2>
          <p className="m-0 text-sm text-muted">
            {quandoPorExtenso(e.inicioEm)} · {duracaoTexto(e.duracaoMin)}
          </p>
          <p className="m-0 text-[13px] text-muted">{textoConfirmados(e.inscritos)}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3 desk:w-[240px]">
        {e.link && (
          <a href={e.link} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "46", pilula: true, larguraTotal: true })}>
            Entrar no encontro
            <ExternalLink aria-hidden />
          </a>
        )}
        <BotaoPresenca eventoId={e.id} inscrito={e.inscrito} secundario={!!e.link} />
      </div>
    </Cartao>
  );
}
