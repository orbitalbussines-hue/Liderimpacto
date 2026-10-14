import type { EventoDoMembro } from "@/lib/eventos/consultas";
import { ROTA_EVENTOS } from "@/lib/eventos/regras";
import { diaEMes, quandoPorExtenso } from "@/lib/eventos/tela";
import { CartaoEncontroAoVivo } from "./cartao-encontro-ao-vivo";

export interface EncontroDaComunidadeProps {
  evento: EventoDoMembro;
  idTitulo?: string;
  className?: string;
  /** Mostra "Adicionar à agenda". */
  comAgenda?: boolean;
}

/** `CartaoEncontroAoVivo` ligado ao próximo encontro do membro (`proximoEventoDoMembro`). */
export function EncontroDaComunidade({ evento: e, idTitulo, className, comAgenda = false }: EncontroDaComunidadeProps) {
  const { dia, mes } = diaEMes(e.inicioEm);
  const href = `${ROTA_EVENTOS}/${e.id}`;
  return (
    <CartaoEncontroAoVivo
      dia={dia}
      mes={mes}
      titulo={e.titulo}
      quando={e.momento === "ABERTO" ? "Ao vivo agora" : quandoPorExtenso(e.inicioEm)}
      href={href}
      hrefAgenda={comAgenda ? `${href}/agenda.ics` : undefined}
      hrefTodos={ROTA_EVENTOS}
      idTitulo={idTitulo}
      className={className}
    />
  );
}
