"use client";

import { useEffect, useRef, useState } from "react";
import { GrupoChips } from "@/components/ui/grupo-chips";
import type { MensagemPronta } from "@/lib/email/mensagens";
import type { EmailExemplo, MarcaExemplo } from "./_exemplos";

export interface ExemploPronto extends MensagemPronta {
  marca: MarcaExemplo;
  email: EmailExemplo;
  rotulo: string;
}

/** O HTML do e-mail num iframe isolado (sem script), na altura do conteudo. */
function QuadroEmail({ html, titulo }: { html: string; titulo: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const ajustar = () => {
    const doc = ref.current?.contentDocument;
    // body (nao o documentElement, que nunca fica menor que o proprio iframe)
    if (ref.current && doc?.body) ref.current.style.height = `${doc.body.scrollHeight}px`;
  };
  // O srcdoc pode carregar antes da hidratacao (onLoad perdido): ajusta tambem na montagem.
  useEffect(ajustar, [html]);
  return (
    <iframe
      ref={ref}
      title={titulo}
      srcDoc={html}
      sandbox="allow-same-origin"
      onLoad={ajustar}
      className="block h-[760px] w-full max-w-[600px] rounded-xl border border-border bg-[#f5f4ef]"
    />
  );
}

export function PreviaEmails({ exemplos, marcas }: { exemplos: ExemploPronto[]; marcas: { valor: MarcaExemplo; rotulo: string }[] }) {
  const [marca, setMarca] = useState<MarcaExemplo>("plataforma");

  return (
    <div className="flex flex-col gap-10">
      <GrupoChips aria-label="Marca da área" opcoes={marcas} valor={marca} onMudar={setMarca} />
      {exemplos
        .filter((e) => e.marca === marca)
        .map((e) => {
          const bruto = `/componentes/emails/bruto?email=${e.email}&marca=${e.marca}`;
          return (
            <section key={e.email} aria-label={e.rotulo} className="flex flex-col gap-4 border-t border-border pt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="m-0 text-2xl">{e.rotulo}</h2>
                <a href={bruto} className="text-xs text-muted underline underline-offset-2">
                  Abrir o HTML sozinho
                </a>
              </div>
              <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted">De</dt>
                <dd className="m-0">{e.remetente} &lt;nao-responda@lideresdeimpacto.com.br&gt;</dd>
                <dt className="text-muted">Assunto</dt>
                <dd className="m-0">{e.assunto}</dd>
              </dl>
              <div className="grid items-start gap-6 desk:grid-cols-[600px_1fr]">
                <QuadroEmail html={e.html} titulo={`${e.rotulo}, versão HTML`} />
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="text-[11px] font-bold tracking-[.1em] text-muted uppercase">Versão texto</div>
                  <pre className="m-0 overflow-x-auto rounded-xl border border-border bg-surface p-4 text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                    {e.texto}
                  </pre>
                </div>
              </div>
            </section>
          );
        })}
    </div>
  );
}
