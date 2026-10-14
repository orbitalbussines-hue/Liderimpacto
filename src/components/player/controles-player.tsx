"use client";

import type { ReactNode } from "react";
import { Captions, Maximize, Minimize, Pause, PictureInPicture2, Play, Settings2, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { formatarTempo } from "@/lib/validators/catalogo";
import { cn } from "@/lib/utils";
import { BarraTempo, type CapituloPlayer } from "./barra-tempo";
import { MenuPlayer } from "./menu-player";
import type { NivelHls } from "@/components/video/use-hls";

export const VELOCIDADES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** "1.0x", "1.25x", "0.5x" (como no protótipo). */
export const rotuloVelocidade = (v: number) => `${Number.isInteger(v * 10) ? v.toFixed(1) : v.toFixed(2)}x`;

export interface ControlesPlayerProps {
  tocando: boolean;
  tempo: number;
  duracao: number;
  carregado: number;
  capitulos: readonly CapituloPlayer[];
  volume: number;
  mudo: boolean;
  velocidade: number | null;
  niveis: readonly NivelHls[];
  nivel: number;
  telaCheia: boolean;
  pip: boolean;
  anterior: { titulo: string } | null;
  proxima: { titulo: string } | null;
  menu: MenuAberto;
  onMenu: (m: MenuAberto) => void;
  /** Legendas da aula (vazio = botão desabilitado, só no desktop, como antes). */
  legendas: readonly { id: string; rotulo: string }[];
  legendaAtiva: string | null;
  /** `null` = desligar. */
  onLegenda: (id: string | null) => void;
  onAlternar: () => void;
  onBuscar: (seg: number) => void;
  onVolume: (v: number) => void;
  onMudo: () => void;
  onVelocidade: (v: number) => void;
  onNivel: (n: number) => void;
  onTelaCheia: () => void;
  onPip: () => void;
  onAnterior: () => void;
  onProxima: () => void;
}

export type MenuAberto = "velocidade" | "qualidade" | "legendas" | null;

function BotaoControle({
  rotulo,
  onClick,
  disabled,
  title,
  children,
  className,
  pressionado,
}: {
  rotulo: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
  className?: string;
  pressionado?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      aria-pressed={pressionado}
      title={title ?? rotulo}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg text-white/90 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-fixo-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent [&_svg]:size-5",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Traço sob o ícone quando a legenda está ligada (o estado não depende só da cor). */
const LIGADA = "relative text-white after:absolute after:bottom-[7px] after:left-1/2 after:h-[3px] after:w-5 after:-translate-x-1/2 after:rounded-full after:bg-fixo-accent";

/**
 * CC: sem legenda, desabilitado (só desktop: lugar no design, sem prometer o que não há); uma,
 * liga/desliga (C); mais de uma, menu com "Desligadas" + os idiomas.
 */
function BotaoLegendas(p: ControlesPlayerProps) {
  if (p.legendas.length === 0) {
    return (
      <BotaoControle rotulo="Legendas indisponíveis nesta aula" title="Sem legendas" disabled className="max-desk:hidden">
        <Captions />
      </BotaoControle>
    );
  }
  const ligada = p.legendaAtiva !== null;
  if (p.legendas.length === 1) {
    return (
      <BotaoControle rotulo="Legendas (C)" pressionado={ligada} onClick={() => p.onLegenda(ligada ? null : p.legendas[0].id)} className={cn(ligada && LIGADA)}>
        <Captions />
      </BotaoControle>
    );
  }
  const ativa = p.legendas.find((l) => l.id === p.legendaAtiva);
  return (
    <MenuPlayer
      rotulo={`Legendas: ${ativa?.rotulo ?? "desligadas"}`}
      titulo="Legendas"
      gatilho={<Captions className="size-5" aria-hidden />}
      opcoes={[{ valor: "", rotulo: "Desligadas" }, ...p.legendas.map((l) => ({ valor: l.id, rotulo: l.rotulo }))]}
      valor={p.legendaAtiva ?? ""}
      aberto={p.menu === "legendas"}
      onAbrir={(a) => p.onMenu(a ? "legendas" : null)}
      onEscolher={(v) => p.onLegenda(v || null)}
      className={cn(ligada && LIGADA)}
    />
  );
}

/** Faixa inferior do player: barra com capítulos + botões do design (alvos de 44 px). */
export function ControlesPlayer(p: ControlesPlayerProps) {
  const rotuloNivel = p.nivel === -1 ? "Auto" : `${p.niveis.find((n) => n.indice === p.nivel)?.altura ?? ""}p`;
  return (
    <div className="flex flex-col gap-1 px-3 pt-4 pb-2 desk:px-[18px] desk:pt-8 desk:pb-3">
      <BarraTempo tempo={p.tempo} duracao={p.duracao} carregado={p.carregado} capitulos={p.capitulos} onBuscar={p.onBuscar} />
      <div className="flex items-center gap-0.5 text-xs font-semibold text-white">
        <BotaoControle rotulo={p.anterior ? `Aula anterior: ${p.anterior.titulo}` : "Sem aula anterior"} onClick={p.onAnterior} disabled={!p.anterior} className="max-desk:hidden">
          <SkipBack />
        </BotaoControle>
        <BotaoControle rotulo={p.tocando ? "Pausar (K)" : "Reproduzir (K)"} onClick={p.onAlternar}>
          {p.tocando ? <Pause className="fill-current" /> : <Play className="fill-current" />}
        </BotaoControle>
        <BotaoControle rotulo={p.proxima ? `Próxima aula: ${p.proxima.titulo}` : "Sem próxima aula"} onClick={p.onProxima} disabled={!p.proxima}>
          <SkipForward />
        </BotaoControle>
        <div className="group/volume flex items-center max-desk:hidden">
          <BotaoControle rotulo={p.mudo || p.volume === 0 ? "Ativar som (M)" : "Silenciar (M)"} onClick={p.onMudo}>
            {p.mudo || p.volume === 0 ? <VolumeX /> : <Volume2 />}
          </BotaoControle>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={p.mudo ? 0 : p.volume}
            onChange={(e) => p.onVolume(Number(e.target.value))}
            aria-label="Volume"
            className="w-0 cursor-pointer opacity-0 transition-[width,opacity] duration-150 [accent-color:var(--color-fixo-accent)] group-focus-within/volume:w-[72px] group-focus-within/volume:opacity-100 group-hover/volume:w-[72px] group-hover/volume:opacity-100 max-desk:hidden motion-reduce:transition-none"
          />
        </div>
        <span className="ml-1.5 tabular-nums whitespace-nowrap" aria-hidden>
          {formatarTempo(p.tempo)} / {formatarTempo(p.duracao)}
        </span>
        <span className="flex-1" />
        {p.velocidade !== null && (
          <MenuPlayer
            rotulo={`Velocidade: ${rotuloVelocidade(p.velocidade)}`}
            titulo="Velocidade"
            gatilho={<span className="rounded-md border border-white/40 px-2 py-[3px] tabular-nums">{rotuloVelocidade(p.velocidade)}</span>}
            opcoes={VELOCIDADES.map((v) => ({ valor: v, rotulo: v === 1 ? "Normal" : rotuloVelocidade(v) }))}
            valor={p.velocidade}
            aberto={p.menu === "velocidade"}
            onAbrir={(a) => p.onMenu(a ? "velocidade" : null)}
            onEscolher={p.onVelocidade}
          />
        )}
        {p.niveis.length > 1 && (
          <MenuPlayer
            rotulo={`Qualidade: ${rotuloNivel}`}
            titulo="Qualidade"
            gatilho={<Settings2 className="size-5" aria-hidden />}
            opcoes={[{ valor: -1, rotulo: "Automática" }, ...p.niveis.map((n) => ({ valor: n.indice, rotulo: `${n.altura}p` }))]}
            valor={p.nivel}
            aberto={p.menu === "qualidade"}
            onAbrir={(a) => p.onMenu(a ? "qualidade" : null)}
            onEscolher={p.onNivel}
          />
        )}
        <BotaoLegendas {...p} />
        {p.pip && (
          <BotaoControle rotulo="Picture-in-picture" onClick={p.onPip} className="max-desk:hidden">
            <PictureInPicture2 />
          </BotaoControle>
        )}
        <BotaoControle rotulo={p.telaCheia ? "Sair da tela cheia (F)" : "Tela cheia (F)"} onClick={p.onTelaCheia}>
          {p.telaCheia ? <Minimize /> : <Maximize />}
        </BotaoControle>
      </div>
    </div>
  );
}
