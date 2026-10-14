import Image from "next/image";
import { CircleCheck, Play, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/marca/logo";
import { AlternarTema } from "@/components/ui/alternar-tema";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { Cartao } from "@/components/ui/cartao";
import { cn } from "@/lib/utils";

export interface CenaAutenticacaoProps {
  /** `criador`: luz na cor da marca + previa da area do aluno. `plataforma`: luz neutra + previa do acesso. */
  variante: "criador" | "plataforma";
  eyebrow?: string;
  titulo: string;
  subtitulo: string;
  rodape: string;
  /** Foto de login do criador (tela cheia, com veu cinematografico). Sem ela: aurora em CSS. */
  imagemUrl?: string | null;
}

/** Cartao de vidro sobre a cena escura (o tema escuro vem do data-theme do <aside>). */
const vidro = "border-fixo-text/10 bg-surface/55 shadow-card backdrop-blur-xl";

/** Previa ilustrativa do produto: so rotulos genericos, nenhum numero ou nome que pareca dado real. */
function PreviaCriador() {
  return (
    <div aria-hidden className="relative h-[290px] w-full max-w-[520px] select-none">
      <Cartao
        padding={0}
        raio={18}
        className={cn(vidro, "absolute top-8 left-0 w-[340px] animate-flutuar p-2.5 motion-reduce:animate-none")}
      >
        <div className="relative aspect-[16/8] overflow-hidden rounded-xl bg-fixo-bg">
          <div className="absolute inset-0 bg-radial-[80%_90%_at_30%_100%] from-fixo-accent/45 to-transparent" />
          <div className="absolute inset-0 bg-radial-[60%_70%_at_90%_0%] from-fixo-accent/20 to-transparent" />
          <div className="absolute inset-0 cena-grade" />
          <div className="absolute inset-0 grid place-items-center">
            <span className="grid size-11 place-items-center rounded-full border border-fixo-text/20 bg-fixo-text/10 text-fixo-text backdrop-blur-md">
              <Play className="size-4 translate-x-px fill-current" />
            </span>
          </div>
          <BarraProgresso valor={62} variante="sobreImagem" />
        </div>
        <div className="px-1.5 pt-3 pb-1.5">
          <div className="text-[13px] font-semibold text-text">Continue de onde parou</div>
          <div className="mt-0.5 text-xs text-muted">Sua próxima aula está pronta.</div>
        </div>
      </Cartao>

      <Cartao
        padding={0}
        raio={14}
        className={cn(
          vidro,
          "absolute top-0 right-0 w-[216px] rotate-[3deg] animate-flutuar p-2 [animation-delay:-4s] motion-reduce:animate-none"
        )}
      >
        <div className="flex aspect-[1.414] flex-col justify-between rounded-[10px] border border-border bg-surface p-3.5">
          <Logo variante="bloco" tamanho={10} />
          <div>
            <div className="font-serif text-[15px] leading-tight font-semibold text-balance text-fixo-titulo">Certificado de conclusão</div>
            <div className="mt-2 h-px bg-border" />
            <div className="mt-1.5 text-[10px] text-muted">Emitido ao concluir o curso</div>
          </div>
        </div>
      </Cartao>

      <div
        className={cn(
          vidro,
          "absolute right-10 bottom-4 flex animate-flutuar items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold text-text [animation-delay:-6s] motion-reduce:animate-none"
        )}
      >
        <CircleCheck className="size-4 text-ok" />
        Aula concluída
      </div>
    </div>
  );
}

function PreviaPlataforma() {
  return (
    <div aria-hidden className="relative h-[270px] w-full max-w-[480px] select-none">
      <Cartao
        padding={18}
        raio={18}
        className={cn(vidro, "absolute top-0 left-0 w-[300px] animate-flutuar motion-reduce:animate-none")}
      >
        <div className="flex items-center gap-2 text-[13px] font-semibold text-text">
          <ShieldCheck className="size-4 text-muted" />
          Verificação em duas etapas
        </div>
        <div className="mt-4 grid grid-cols-6 gap-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="grid h-10 place-items-center rounded-lg border border-border bg-bg/60">
              <span className="size-1.5 rounded-full bg-fixo-text/70" />
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-muted">Código do aplicativo autenticador</div>
      </Cartao>
      <div
        className={cn(
          vidro,
          "absolute right-0 bottom-0 flex w-[220px] animate-flutuar flex-col gap-2.5 rounded-2xl border p-4 [animation-delay:-4s] motion-reduce:animate-none"
        )}
      >
        <div className="text-xs font-semibold text-text">Trilha de auditoria</div>
        {["Entrada confirmada", "Senha alterada", "Papel atualizado"].map((t) => (
          <div key={t} className="flex items-center gap-2 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-fixo-text/40" />
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Cena das telas de entrada: SEMPRE escura (data-theme="dark" local, independe do tema).
 * `data-area="aluno"` aqui faz a cor do criador (EstiloMarca) valer dentro da cena.
 * Desktop: painel arredondado a esquerda. Celular: faixa curta no topo.
 */
export function CenaAutenticacao({ variante, eyebrow, titulo, subtitulo, rodape, imagemUrl }: CenaAutenticacaoProps) {
  return (
    <aside
      data-area="aluno"
      data-theme="dark"
      className={cn(
        "relative isolate h-[212px] shrink-0 overflow-hidden bg-fixo-bg text-fixo-text",
        "desk:sticky desk:top-3 desk:m-3 desk:h-[calc(100dvh-24px)] desk:min-h-[600px] desk:rounded-[22px] desk:border desk:border-fixo-text/10",
        variante === "plataforma" ? "cena-luz-neutra" : "cena-luz-marca"
      )}
    >
      {imagemUrl ? (
        <>
          <Image src={imagemUrl} alt="" fill priority sizes="(min-width: 900px) 55vw, 100vw" className="object-cover" />
          <div aria-hidden className="absolute inset-0 cena-veu-foto" />
        </>
      ) : (
        <>
          <div aria-hidden className="absolute -inset-[20%] cena-aurora animate-aurora motion-reduce:animate-none" />
          <div
            aria-hidden
            className="absolute -inset-x-1/4 top-[8%] h-1/2 cena-feixe animate-feixe motion-reduce:animate-none"
          />
          <div aria-hidden className="absolute inset-0 cena-grade" />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-fixo-bg/85 to-transparent" />
        </>
      )}
      <div aria-hidden className="absolute inset-0 textura-grao" />

      <div className="relative flex h-full flex-col justify-between gap-6 p-5 pb-11 desk:p-12">
        <div className="flex items-center justify-between">
          <Logo variante="fixo" />
          <AlternarTema className="desk:hidden" />
        </div>

        <div className="flex flex-col gap-12">
          <div className="max-w-[500px]">
            {eyebrow && (
              <span className="mb-5 hidden rounded-full border border-fixo-text/12 bg-fixo-text/[.04] px-3 py-1 text-xs font-medium text-fixo-muted backdrop-blur-sm desk:inline-flex">
                {eyebrow}
              </span>
            )}
            <p className="m-0 font-serif text-[28px] leading-[1.05] font-semibold tracking-[-0.02em] text-balance text-fixo-titulo desk:text-[56px]">
              {titulo}
            </p>
            <p className="m-0 mt-4 hidden max-w-[420px] text-[15px] leading-relaxed text-fixo-muted desk:block">
              {subtitulo}
            </p>
          </div>
          {!imagemUrl && (
            <div className="hidden desk:block [@media(max-height:820px)]:hidden">
              {variante === "plataforma" ? <PreviaPlataforma /> : <PreviaCriador />}
            </div>
          )}
        </div>

        <div className="hidden text-xs text-fixo-muted desk:block">{rodape}</div>
      </div>
    </aside>
  );
}
