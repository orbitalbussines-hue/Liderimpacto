import Image from "next/image";
import type { ReactNode } from "react";
import { Check, ChevronDown, ShieldCheck } from "lucide-react";
import { formatarCentavos } from "@/lib/pagamentos/regras";
import { ANCORA, paragrafos, urlDoPlayer, type BlocoDoTipo, type BlocoPagina, type BotaoPagina, type ConfigPagina } from "@/lib/paginas/config";
import type { ContextoRender, DadosRender } from "@/lib/paginas/render-tipos";
import { cn } from "@/lib/utils";
import { FormularioCaptura } from "./formulario-captura";

/**
 * Render dos blocos da página de venda/captura (ADR-0022). Server component PURO (dados já resolvidos):
 * serve a `/p/<slug>`, à prévia da equipe e ao teste. Todo texto do criador entra como TEXTO (o React
 * escapa); nenhum `dangerouslySetInnerHTML`. Links: âncoras internas, `https://` validado no schema ou o
 * link de compra da própria área. Vídeo: só o player do YouTube/Vimeo montado com o id validado.
 */

const LARGURA = "mx-auto w-full max-w-[1120px] px-5 md:px-8";
const TITULO_SECAO = "m-0 font-serif text-[30px] leading-[1.08] font-semibold tracking-[-0.015em] text-balance md:text-[42px]";
const BOTAO = "inline-flex h-12 items-center justify-center rounded-full bg-accent px-7 text-[15px] font-bold text-accent-ink transition-colors duration-150 hover:bg-accent/88 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function Paragrafos({ texto, className }: { texto: string; className?: string }) {
  const ps = paragrafos(texto);
  if (!ps.length) return null;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {ps.map((p, i) => (
        <p key={i} className="m-0">
          {p}
        </p>
      ))}
    </div>
  );
}

function Secao({ children, id, className, bloco }: { children: ReactNode; id?: string; className?: string; bloco: string }) {
  return (
    <section id={id} data-bloco={bloco} className={cn("scroll-mt-6 py-16 md:py-24", className)}>
      <div className={LARGURA}>{children}</div>
    </section>
  );
}

export function hrefDoBotao(b: BotaoPagina): string {
  return b.acao === "LINK" && b.url ? b.url : `#${ANCORA[b.acao === "LINK" ? "PRECO" : b.acao]}`;
}

function Botao({ b, className }: { b: BotaoPagina; className?: string }) {
  const externo = b.acao === "LINK";
  return (
    <a href={hrefDoBotao(b)} className={cn(BOTAO, className)} {...(externo ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}>
      {b.texto}
    </a>
  );
}

/** Link de compra da oferta, repassando cupom/afiliado da URL e a atribuição (página e funil). */
export function linkDoCheckout(ofertaId: string, ctx: ContextoRender): string {
  const q = new URLSearchParams({ oferta: ofertaId, pagina: ctx.paginaId });
  if (ctx.funilId) q.set("funil", ctx.funilId);
  if (ctx.cupom) q.set("cupom", ctx.cupom);
  if (ctx.afiliado) q.set("afiliado", ctx.afiliado);
  return `/api/stripe/checkout?${q.toString()}`;
}

function Capa({ b, dados }: { b: BlocoDoTipo<"CAPA">; dados: DadosRender }) {
  const imagem = b.midia.tipo === "IMAGEM" ? dados.imagens[b.midia.arquivoId] : null;
  const temMidia = !!imagem || b.midia.tipo === "VIDEO";
  return (
    <section data-bloco={b.id} className="pt-14 pb-16 md:pt-24 md:pb-24">
      <div className={cn(LARGURA, "grid items-center gap-10", temMidia ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14" : "max-w-[880px] text-center")}>
        <div className={cn("flex flex-col gap-6", !temMidia && "items-center")}>
          <h1 className="m-0 font-serif text-[40px] leading-[1.02] font-semibold tracking-[-0.025em] text-balance md:text-[64px]">{b.titulo}</h1>
          {b.subtitulo && <p className="m-0 max-w-[60ch] text-[17px] leading-relaxed text-pretty text-muted md:text-[19px]">{b.subtitulo}</p>}
          {b.botao && <Botao b={b.botao} className="w-full sm:w-auto sm:self-start" />}
        </div>
        {b.midia.tipo === "VIDEO" && (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <iframe
              src={urlDoPlayer(b.midia)}
              title={`Vídeo: ${b.titulo}`}
              loading="lazy"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
              className="aspect-video w-full border-0"
            />
          </div>
        )}
        {imagem && (
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-surface">
            <Image src={imagem} alt="" fill priority sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" />
          </div>
        )}
      </div>
    </section>
  );
}

function ItemComCheck({ titulo, texto }: { titulo: string; texto?: string }) {
  return (
    <li className="flex gap-3">
      <Check className="mt-1 size-[18px] shrink-0 text-accent" strokeWidth={2.5} aria-hidden />
      <div className="flex flex-col gap-1">
        <span className="text-[16px] leading-snug font-bold">{titulo}</span>
        {texto && <span className="text-[15px] leading-relaxed text-muted">{texto}</span>}
      </div>
    </li>
  );
}

function Beneficios({ b }: { b: BlocoDoTipo<"BENEFICIOS"> }) {
  return (
    <Secao bloco={b.id}>
      {b.titulo && <h2 className={cn(TITULO_SECAO, "mb-10 max-w-[22ch]")}>{b.titulo}</h2>}
      <ul className="m-0 grid list-none gap-x-10 gap-y-8 p-0 md:grid-cols-2 lg:grid-cols-3">
        {b.itens.map((i, n) => (
          <ItemComCheck key={n} titulo={i.titulo} texto={i.texto} />
        ))}
      </ul>
    </Secao>
  );
}

function Modulos({ b, dados }: { b: BlocoDoTipo<"MODULOS">; dados: DadosRender }) {
  const curso = b.produtoId ? dados.cursos[b.produtoId] : undefined;
  if (!curso?.modulos.length) return null;
  const aulas = curso.modulos.reduce((s, m) => s + m.aulas.length, 0);
  return (
    <Secao bloco={b.id} className="border-y border-border bg-surface">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <h2 className={cn(TITULO_SECAO, "max-w-[22ch]")}>{b.titulo || curso.titulo}</h2>
        <p className="m-0 text-sm text-muted tabular-nums">
          {curso.modulos.length} {curso.modulos.length === 1 ? "módulo" : "módulos"} · {aulas} {aulas === 1 ? "aula" : "aulas"}
        </p>
      </div>
      <ol className="m-0 flex list-none flex-col p-0">
        {curso.modulos.map((m, i) => {
          const cabeca = (
            <>
              <span className="w-8 shrink-0 text-sm font-semibold text-muted tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1 text-[17px] font-bold">{m.titulo}</span>
              <span className="shrink-0 text-sm text-muted tabular-nums">
                {m.aulas.length} {m.aulas.length === 1 ? "aula" : "aulas"}
              </span>
            </>
          );
          return (
            <li key={m.id} className="border-b border-border last:border-b-0">
              {b.mostrarAulas && m.aulas.length ? (
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 py-5 [&::-webkit-details-marker]:hidden">
                    {cabeca}
                    <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <ul className="m-0 flex list-none flex-col gap-2 pb-5 pl-11 text-[15px] text-muted">
                    {m.aulas.map((a, j) => (
                      <li key={j}>{a}</li>
                    ))}
                  </ul>
                </details>
              ) : (
                <div className="flex items-center gap-3 py-5">{cabeca}</div>
              )}
            </li>
          );
        })}
      </ol>
    </Secao>
  );
}

function Autor({ b, dados }: { b: BlocoDoTipo<"AUTOR">; dados: DadosRender }) {
  const foto = b.imagemArquivoId ? dados.imagens[b.imagemArquivoId] : null;
  return (
    <Secao bloco={b.id}>
      <div className={cn("grid items-center gap-10", foto && "md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16")}>
        {foto && (
          <div className="relative mx-auto aspect-[4/5] w-full max-w-[420px] overflow-hidden rounded-2xl border border-border bg-surface">
            <Image src={foto} alt={b.nome} fill sizes="(min-width: 768px) 420px, 100vw" className="object-cover" />
          </div>
        )}
        <div className="flex flex-col gap-5">
          {b.titulo && <p className="m-0 text-sm font-semibold text-accent">{b.titulo}</p>}
          <h2 className={TITULO_SECAO}>{b.nome}</h2>
          <Paragrafos texto={b.texto} className="max-w-[62ch] text-[17px] leading-relaxed text-muted" />
        </div>
      </div>
    </Secao>
  );
}

function Depoimentos({ b }: { b: BlocoDoTipo<"DEPOIMENTOS"> }) {
  return (
    <Secao bloco={b.id}>
      {b.titulo && <h2 className={cn(TITULO_SECAO, "mb-10")}>{b.titulo}</h2>}
      <ul className="m-0 grid list-none gap-5 p-0 md:grid-cols-2 lg:grid-cols-3">
        {b.itens.map((d, i) => (
          <li key={i}>
            <figure className="m-0 flex h-full flex-col justify-between gap-6 rounded-2xl border border-border bg-surface p-6">
              <blockquote className="m-0 text-[16px] leading-relaxed">
                <Paragrafos texto={d.texto} />
              </blockquote>
              <figcaption className="flex flex-col">
                <span className="text-sm font-bold">{d.nome}</span>
                {d.detalhe && <span className="text-[13px] text-muted">{d.detalhe}</span>}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </Secao>
  );
}

function Preco({ b, dados, ctx, ancora }: { b: BlocoDoTipo<"PRECO">; dados: DadosRender; ctx: ContextoRender; ancora: boolean }) {
  const o = b.ofertaId ? dados.ofertas[b.ofertaId] : undefined;
  if (!o) return null;
  const periodo = o.tipo === "ASSINATURA" ? (o.intervalo === "ANO" ? "/ano" : "/mês") : null;
  return (
    <Secao bloco={b.id} id={ancora ? ANCORA.PRECO : undefined}>
      <div className="mx-auto flex max-w-[460px] flex-col gap-7 rounded-3xl border border-border bg-surface p-7 md:p-9">
        <div className="flex flex-col gap-2">
          {b.titulo && <h2 className="m-0 font-serif text-[28px] leading-tight font-semibold">{b.titulo}</h2>}
          <p className="m-0 text-[15px] text-muted">{o.nome}</p>
        </div>
        <p className="m-0 flex items-baseline gap-1.5">
          <span className="font-serif text-[48px] leading-none font-semibold tracking-[-0.02em] tabular-nums">{formatarCentavos(o.precoCentavos)}</span>
          {periodo && <span className="text-base text-muted">{periodo}</span>}
        </p>
        {b.itens.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {b.itens.map((t, i) => (
              <li key={i} className="flex gap-3 text-[15px]">
                <Check className="mt-0.5 size-[18px] shrink-0 text-accent" strokeWidth={2.5} aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        )}
        {ctx.previa ? (
          <span className={cn(BOTAO, "w-full opacity-80")} title="Na prévia o botão não abre o pagamento.">
            {b.textoBotao}
          </span>
        ) : (
          <a href={linkDoCheckout(o.id, ctx)} rel="nofollow" className={cn(BOTAO, "w-full")}>
            {b.textoBotao}
          </a>
        )}
        {b.observacao && <p className="m-0 -mt-3 text-center text-[13px] text-muted">{b.observacao}</p>}
      </div>
    </Secao>
  );
}

function Garantia({ b }: { b: BlocoDoTipo<"GARANTIA"> }) {
  return (
    <Secao bloco={b.id} className="py-10 md:py-14">
      <div className="mx-auto flex max-w-[760px] flex-col items-center gap-5 rounded-3xl border border-border p-8 text-center md:flex-row md:items-start md:gap-7 md:text-left">
        <ShieldCheck className="size-10 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
        <div className="flex flex-col gap-2">
          <h2 className="m-0 font-serif text-[26px] leading-tight font-semibold">
            {b.dias > 0 && <span className="tabular-nums">{b.dias} dias · </span>}
            {b.titulo}
          </h2>
          <Paragrafos texto={b.texto} className="text-[15px] leading-relaxed text-muted" />
        </div>
      </div>
    </Secao>
  );
}

function Faq({ b }: { b: BlocoDoTipo<"FAQ"> }) {
  return (
    <Secao bloco={b.id}>
      <div className="mx-auto max-w-[820px]">
        {b.titulo && <h2 className={cn(TITULO_SECAO, "mb-8")}>{b.titulo}</h2>}
        <div className="border-t border-border">
          {b.itens.map((q, i) => (
            <details key={i} className="group border-b border-border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[17px] font-bold [&::-webkit-details-marker]:hidden">
                {q.pergunta}
                <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <Paragrafos texto={q.resposta} className="pb-6 text-[15px] leading-relaxed text-muted" />
            </details>
          ))}
        </div>
      </div>
    </Secao>
  );
}

function Chamada({ b }: { b: BlocoDoTipo<"CHAMADA"> }) {
  return (
    <Secao bloco={b.id} className="border-t border-border">
      <div className="mx-auto flex max-w-[760px] flex-col items-center gap-6 text-center">
        <h2 className={TITULO_SECAO}>{b.titulo}</h2>
        {b.texto && <p className="m-0 max-w-[56ch] text-[17px] leading-relaxed text-muted">{b.texto}</p>}
        <Botao b={b.botao} />
      </div>
    </Secao>
  );
}

function Formulario({ b, ctx, slug }: { b: BlocoDoTipo<"FORMULARIO">; ctx: ContextoRender; slug: string }) {
  return (
    <Secao bloco={b.id} id={ANCORA.FORMULARIO}>
      <div className="mx-auto flex max-w-[520px] flex-col gap-6 rounded-3xl border border-border bg-surface p-7 md:p-9">
        <div className="flex flex-col gap-2">
          <h2 className="m-0 font-serif text-[28px] leading-tight font-semibold">{b.titulo}</h2>
          {b.texto && <p className="m-0 text-[15px] leading-relaxed text-muted">{b.texto}</p>}
        </div>
        <FormularioCaptura slug={slug} ctx={ctx} textoBotao={b.textoBotao} consentimento={b.consentimento} sucesso={b.sucesso} />
      </div>
    </Secao>
  );
}

function Bloco({ b, dados, ctx, slug, ancoraPreco }: { b: BlocoPagina; dados: DadosRender; ctx: ContextoRender; slug: string; ancoraPreco: boolean }) {
  switch (b.tipo) {
    case "CAPA":
      return <Capa b={b} dados={dados} />;
    case "BENEFICIOS":
      return <Beneficios b={b} />;
    case "MODULOS":
      return <Modulos b={b} dados={dados} />;
    case "AUTOR":
      return <Autor b={b} dados={dados} />;
    case "DEPOIMENTOS":
      return <Depoimentos b={b} />;
    case "PRECO":
      return <Preco b={b} dados={dados} ctx={ctx} ancora={ancoraPreco} />;
    case "GARANTIA":
      return <Garantia b={b} />;
    case "FAQ":
      return <Faq b={b} />;
    case "CHAMADA":
      return <Chamada b={b} />;
    case "FORMULARIO":
      return <Formulario b={b} ctx={ctx} slug={slug} />;
  }
}

/** Página inteira: só blocos visíveis, na ordem; o 1º Preço com oferta ativa recebe a âncora `#preco`. */
export function BlocosDaPagina({ config, dados, ctx, slug }: { config: ConfigPagina; dados: DadosRender; ctx: ContextoRender; slug: string }) {
  const visiveis = config.blocos.filter((b) => b.visivel);
  const precoComAncora = visiveis.find((b) => b.tipo === "PRECO" && b.ofertaId && dados.ofertas[b.ofertaId])?.id;
  return (
    <>
      {visiveis.map((b) => (
        <Bloco key={b.id} b={b} dados={dados} ctx={ctx} slug={slug} ancoraPreco={b.id === precoComAncora} />
      ))}
    </>
  );
}
