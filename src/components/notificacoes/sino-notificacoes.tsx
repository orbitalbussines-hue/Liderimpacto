"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { rotuloDoContador, TETO_CONTADOR } from "@/lib/notificacoes/regras";
import { PainelNotificacoes } from "./painel-notificacoes";
import { useContagemNaoLidas } from "./use-contagem";

export interface SinoNotificacoesProps {
  /** Contagem lida no servidor (layout). */
  inicial: number;
  /** Abaixo de ~900px: `pagina` leva a /notificacoes (aluno); `painel` abre o popover mesmo no celular (admin). */
  celular?: "pagina" | "painel";
  /** Lado em que o painel abre (a sidebar do admin abre para a direita). */
  lado?: "bottom" | "right";
  /** Só monta neste porte de tela (evita dois sinos, dois pollings, quando o shell tem um por porte). */
  somente?: "desktop" | "celular";
}

const quantas = (n: number) => (n > TETO_CONTADOR ? `mais de ${TETO_CONTADOR}` : String(n));

export const rotuloDoSino = (n: number) => (n <= 0 ? "Notificações" : `Notificações, ${quantas(n)} ${n === 1 ? "não lida" : "não lidas"}`);

const CONSULTA_DESKTOP = "(min-width: 900px)";
const ehDesktop = () => window.matchMedia?.(CONSULTA_DESKTOP).matches ?? true;
const assinarPorte = (aoMudar: () => void) => {
  const m = window.matchMedia?.(CONSULTA_DESKTOP);
  m?.addEventListener("change", aoMudar);
  return () => m?.removeEventListener("change", aoMudar);
};

export function SinoNotificacoes({ somente, ...props }: SinoNotificacoesProps) {
  const desktop = useSyncExternalStore(assinarPorte, ehDesktop, () => true);
  if (somente && (somente === "desktop") !== desktop) return null;
  return <Sino {...props} />;
}

/** Sino do header: contador dourado + painel. Aviso discreto (`aria-live`) quando o contador sobe. */
function Sino({ inicial, celular = "pagina", lado = "bottom" }: Omit<SinoNotificacoesProps, "somente">) {
  const n = useContagemNaoLidas(inicial);
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState("");
  const anterior = useRef(n);

  useEffect(() => {
    if (n > anterior.current) setAviso(`Você tem ${quantas(n)} ${n === 1 ? "notificação não lida" : "notificações não lidas"}.`);
    anterior.current = n;
  }, [n]);

  const aoAbrir = (abrir: boolean) => {
    if (abrir && celular === "pagina" && !ehDesktop()) router.push("/notificacoes");
    else setAberto(abrir);
  };

  return (
    <>
      <Popover.Root open={aberto} onOpenChange={aoAbrir} modal="trap-focus">
        <Popover.Trigger render={<Button variant="fantasma" size="icone44" aria-label={rotuloDoSino(n)} className="relative min-w-11 shrink-0" />}>
          <Bell aria-hidden />
          {n > 0 && (
            <span
              aria-hidden
              className="absolute top-[5px] right-1 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-accent px-1 text-[10px] font-extrabold text-accent-ink"
            >
              {rotuloDoContador(n)}
            </span>
          )}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side={lado} align={lado === "right" ? "start" : "end"} sideOffset={8} collisionPadding={12} className="z-50 outline-none">
            <Popover.Popup className="w-[380px] max-w-[calc(100vw-24px)] rounded-xl border border-border bg-surface text-text shadow-card outline-none data-ending-style:opacity-0 data-starting-style:opacity-0">
              <PainelNotificacoes aoFechar={() => setAberto(false)} />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <span aria-live="polite" role="status" className="sr-only">
        {aviso}
      </span>
    </>
  );
}
