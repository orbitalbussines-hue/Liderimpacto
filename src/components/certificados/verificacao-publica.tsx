import { Download, SearchX, ShieldCheck, ShieldX } from "lucide-react";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Cartao } from "@/components/ui/cartao";
import { cn } from "@/lib/utils";
import type { VerificacaoPublica } from "@/lib/certificados/consultas";

export interface VerificacaoPublicaProps {
  /** `null` = código inexistente neste endereço. */
  certificado: VerificacaoPublica | null;
  /** O que a pessoa digitou/abriu (só para mostrar no "não encontrado"). */
  codigoPedido: string;
  /** Link do PDF público (`/certificado/<codigo>/pdf`). */
  hrefPdf: string;
}

const data = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" });

function Item({ rotulo, children, largo }: { rotulo: string; children: ReactNode; largo?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1", largo && "min-[560px]:col-span-2")}>
      <dt className="text-[11px] font-bold tracking-[.1em] text-muted uppercase">{rotulo}</dt>
      <dd className="m-0 text-[15px] font-semibold text-text">{children}</dd>
    </div>
  );
}

/**
 * Resultado da verificação pública: VÁLIDO, REVOGADO ou não encontrado. Mostra SÓ o que
 * `verificarPublico` devolve (o que o certificado impresso já traz); nada de e-mail, ids ou motivo.
 */
export function VerificacaoPublicaCertificado({ certificado: c, codigoPedido, hrefPdf }: VerificacaoPublicaProps) {
  if (!c)
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-surface-2 text-muted">
          <SearchX className="size-7" aria-hidden />
        </span>
        <div className="text-xs font-bold tracking-[.14em] text-accent uppercase">Verificação de certificado</div>
        <h1 className="m-0 text-[32px] leading-tight desk:text-[40px]">Certificado não encontrado</h1>
        <p className="m-0 max-w-[460px] text-sm leading-relaxed text-muted">
          Nenhum certificado com o código <b className="font-mono text-text break-all">{codigoPedido.slice(0, 40)}</b> foi emitido por esta escola. Confira o código impresso no
          certificado (10 letras e números) ou leia o QR Code de novo.
        </p>
      </div>
    );

  const valido = c.situacao === "VALIDO";
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <span className={cn("grid size-16 place-items-center rounded-full", valido ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
        {valido ? <ShieldCheck className="size-8" aria-hidden /> : <ShieldX className="size-8" aria-hidden />}
      </span>
      <div className="flex flex-col items-center gap-2.5">
        <div className="text-xs font-bold tracking-[.14em] text-accent uppercase">Verificação de certificado</div>
        <h1 className="m-0 text-[32px] leading-tight desk:text-[40px]">{valido ? "Certificado válido" : "Certificado revogado"}</h1>
        <p className="m-0 max-w-[480px] text-sm leading-relaxed text-muted">
          {valido
            ? `Este certificado foi emitido por ${c.criador} e é autêntico.`
            : `Este certificado foi emitido por ${c.criador}, mas foi revogado${c.revogadoEm ? ` em ${data(c.revogadoEm)}` : ""} e não tem mais validade.`}
        </p>
      </div>

      <Cartao raio={18} padding={0} className="w-full text-left">
        <div className={cn("h-1 w-full", valido ? "bg-accent" : "bg-warn")} aria-hidden />
        <div className="flex flex-col gap-1 border-b border-border px-6 py-5 desk:px-8">
          <div className="text-[11px] font-bold tracking-[.1em] text-muted uppercase">Concedido a</div>
          <div className={cn("font-serif text-[28px] leading-tight font-semibold", !valido && "text-muted line-through decoration-warn/60")}>{c.nome}</div>
        </div>
        <dl className="m-0 grid gap-x-8 gap-y-5 px-6 py-6 min-[560px]:grid-cols-2 desk:px-8">
          <Item rotulo="Curso" largo>
            {c.curso}
          </Item>
          <Item rotulo="Carga horária">{c.cargaHoraria}</Item>
          <Item rotulo="Concluído em">{data(c.concluidoEm)}</Item>
          <Item rotulo="Emitido em">{data(c.emitidoEm)}</Item>
          <Item rotulo="Emitido por">{c.criador}</Item>
          {!valido && c.revogadoEm && <Item rotulo="Revogado em">{data(c.revogadoEm)}</Item>}
          <Item rotulo="Código de verificação">
            <span className="font-mono tracking-wide">{c.codigoLegivel}</span>
          </Item>
        </dl>
      </Cartao>

      {valido && c.temPdf && (
        <a href={hrefPdf} className={buttonVariants({ size: "46", pilula: true })}>
          <Download aria-hidden />
          Baixar PDF
        </a>
      )}
      {valido && !c.temPdf && <p className="m-0 text-[13px] text-muted">O PDF deste certificado está sendo preparado. Tente baixar daqui a pouco.</p>}
    </div>
  );
}
