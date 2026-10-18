"use client";

import { useActionState, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { enviarCaptura } from "@/app/p/[slug]/acoes";
import { Aviso } from "@/components/ui/aviso";
import { Campo } from "@/components/ui/campo";
import type { ContextoRender } from "@/lib/paginas/render-tipos";

const BOTAO = "inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-accent px-7 text-[15px] font-bold text-accent-ink transition-colors duration-150 hover:bg-accent/88 disabled:cursor-progress disabled:opacity-70";

/**
 * Formulário de captura (nome + e-mail + consentimento LGPD explícito). O campo `site` é a ARMADILHA
 * (honeypot): escondido de pessoas e de leitor de tela; robô que preenche "passa" sem gravar nada.
 * Em funil, o servidor devolve a próxima etapa e a página segue para ela. Na prévia não envia.
 */
export function FormularioCaptura({ slug, ctx, textoBotao, consentimento, sucesso }: { slug: string; ctx: ContextoRender; textoBotao: string; consentimento: string; sucesso: string }) {
  const [estado, acao, enviando] = useActionState(enviarCaptura, null);
  const proxima = estado?.ok ? estado.proxima : null;
  useEffect(() => {
    if (proxima) window.location.assign(proxima);
  }, [proxima]);

  if (estado?.ok && !proxima)
    return (
      <div role="status" className="flex items-start gap-3 rounded-2xl border border-border bg-bg p-5 text-[15px] leading-relaxed">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
        {sucesso}
      </div>
    );

  return (
    <form action={ctx.previa ? undefined : acao} onSubmit={ctx.previa ? (e) => e.preventDefault() : undefined} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="pagina" value={ctx.paginaId} />
      {ctx.funilId && <input type="hidden" name="funil" value={ctx.funilId} />}
      {ctx.cupom && <input type="hidden" name="cupom" value={ctx.cupom} />}
      {ctx.afiliado && <input type="hidden" name="afiliado" value={ctx.afiliado} />}
      {Object.entries(ctx.utm).map(([k, v]) => (
        <input key={k} type="hidden" name={`utm_${k}`} value={v} />
      ))}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Site
          <input type="text" name="site" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <Campo rotulo="Nome" name="nome" autoComplete="name" required minLength={2} maxLength={120} tamanho="48" />
      <Campo rotulo="E-mail" name="email" type="email" autoComplete="email" inputMode="email" required maxLength={254} tamanho="48" />
      <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-muted">
        <input type="checkbox" name="consentimento" value="sim" required className="mt-0.5 size-4 shrink-0 cursor-pointer accent-accent" />
        <span>{consentimento}</span>
      </label>
      {estado && !estado.ok && <Aviso tom="erro">{estado.erro}</Aviso>}
      <button type="submit" disabled={enviando || !!proxima} className={BOTAO} title={ctx.previa ? "Na prévia o formulário não envia." : undefined}>
        {enviando || proxima ? "Enviando…" : textoBotao}
      </button>
    </form>
  );
}
