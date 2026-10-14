"use client";

import { Award, Play } from "lucide-react";
import { Cartao } from "@/components/ui/cartao";
import { cn } from "@/lib/utils";
import type { PlayerConfig } from "@/lib/vitrine/config";
import type { Dispositivo } from "./previa-vitrine";
import { LinhaInterruptor } from "./propriedades-destaque";

type Chave = "descricao" | "materiais" | "comentarios" | "anotacoes" | "playlist" | "autoplay" | "velocidade" | "marcadores" | "avisoCertificado";

/** Os 9 recursos do protótipo (`bPlayerToggles`), com o texto de apoio. */
const RECURSOS: { chave: Chave; titulo: string; descricao: string }[] = [
  { chave: "descricao", titulo: "Aba Descrição", descricao: "Texto da aula" },
  { chave: "materiais", titulo: "Aba Materiais", descricao: "PDFs e anexos" },
  { chave: "comentarios", titulo: "Aba Comentários", descricao: "Dúvidas dos alunos" },
  { chave: "anotacoes", titulo: "Aba Anotações", descricao: "Notas pessoais no vídeo" },
  { chave: "playlist", titulo: "Lista de aulas lateral", descricao: "Módulos e progresso" },
  { chave: "autoplay", titulo: "Reprodução automática", descricao: "Avança para a próxima aula (se o aluno também quiser)" },
  { chave: "velocidade", titulo: "Controle de velocidade", descricao: "0.5x a 2x" },
  { chave: "marcadores", titulo: "Marcadores de capítulo", descricao: "Pontos na barra de progresso" },
  { chave: "avisoCertificado", titulo: "Aviso de certificado", descricao: "Mostra quantas aulas faltam para emitir" },
];

const ABAS = ["descricao", "materiais", "comentarios", "anotacoes"] as const;
const ROTULO_ABA = { descricao: "Descrição", materiais: "Materiais", comentarios: "Comentários", anotacoes: "Anotações" } as const;

const valor = (p: PlayerConfig, k: Chave) => ((ABAS as readonly string[]).includes(k) ? p.abas[k as (typeof ABAS)[number]] : p[k as Exclude<Chave, (typeof ABAS)[number]>]);

/** Aba "Player da aula": os recursos (grava `player` no rascunho) e a prévia que reflete cada um. */
export function AbaPlayer({ player, dispositivo, onMudar }: { player: PlayerConfig; dispositivo: Dispositivo; onMudar: (p: PlayerConfig) => void }) {
  const alternar = (k: Chave, v: boolean) =>
    onMudar((ABAS as readonly string[]).includes(k) ? { ...player, abas: { ...player.abas, [k]: v } } : { ...player, [k]: v });
  const abas = ABAS.filter((a) => player.abas[a]);
  return (
    <div className="grid items-start gap-4 min-[1200px]:grid-cols-[340px_minmax(0,1fr)]">
      <Cartao padding={18} como="section" aria-label="Recursos do player" className="flex flex-col gap-3">
        <h2 className="m-0 text-sm font-extrabold">Recursos do player</h2>
        {RECURSOS.map((r) => (
          <div key={r.chave} className="border-b border-border pb-3 last:border-b-0 last:pb-0">
            <LinhaInterruptor titulo={r.titulo} descricao={r.descricao} ligado={valor(player, r.chave)} onAlternar={(v) => alternar(r.chave, v)} />
          </div>
        ))}
      </Cartao>
      <Cartao padding={18} como="section" aria-label="Prévia do player" className="flex justify-center bg-surface-2">
        <div className={cn("flex w-full flex-col gap-3 rounded-[14px] border border-border bg-bg p-3 transition-[max-width] duration-200", dispositivo === "mobile" ? "max-w-[360px]" : "max-w-full")}>
          <div className="flex flex-wrap gap-3">
            <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-2.5">
              <div className="relative grid aspect-video place-items-center rounded-[10px] bg-fixo-bg">
                <span className="grid size-11 place-items-center rounded-full bg-fixo-accent text-fixo-accent-ink">
                  <Play aria-hidden className="size-[18px] fill-current" />
                </span>
                <div className="absolute inset-x-2.5 bottom-2 flex flex-col gap-1.5">
                  <div className="relative h-1 rounded-full bg-white/25">
                    <div className="h-full w-[38%] rounded-full bg-fixo-accent" />
                    {player.marcadores && (
                      <>
                        <span className="absolute -top-0.5 left-[24%] h-2 w-0.5 bg-fixo-text" />
                        <span className="absolute -top-0.5 left-[61%] h-2 w-0.5 bg-fixo-text" />
                      </>
                    )}
                  </div>
                  {player.velocidade && <span className="self-end rounded border border-white/50 px-1.5 text-[10px] text-fixo-text">1.0x</span>}
                </div>
              </div>
              <div className="flex gap-1 border-b border-border">
                {abas.length ? (
                  abas.map((a, i) => (
                    <span key={a} className={cn("border-b-2 px-2.5 py-1.5 text-[11px] font-semibold", i === 0 ? "border-accent text-text" : "border-transparent text-muted")}>
                      {ROTULO_ABA[a]}
                    </span>
                  ))
                ) : (
                  <span className="px-2.5 py-1.5 text-[11px] text-muted">Sem abas abaixo do vídeo</span>
                )}
              </div>
              {player.avisoCertificado && (
                <div className="flex items-center gap-2 rounded-[9px] bg-accent-soft px-2.5 py-2 text-[11px] font-bold text-accent">
                  <Award aria-hidden className="size-3.5" />
                  Faltam 16 aulas para o seu certificado
                </div>
              )}
              {player.autoplay && <div className="text-[11px] text-muted">Próxima aula em 5s · cancelar</div>}
            </div>
            {player.playlist && (
              <div className="flex min-w-[110px] flex-[0_1_140px] flex-col gap-[7px] rounded-[10px] border border-border p-2">
                <div className="text-[10px] font-extrabold">Lista de aulas</div>
                {[false, true, false, false].map((atual, i) => (
                  <div key={i} className={cn("h-1.5 rounded", atual ? "bg-accent-soft" : "bg-surface-2")} />
                ))}
              </div>
            )}
          </div>
        </div>
      </Cartao>
    </div>
  );
}
