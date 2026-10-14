"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { acaoSalvarCorDaMarca } from "@/lib/actions/aparencia";
import { PALETA_PADRAO, gerarPaleta, validarHex, type Tema } from "@/lib/marca/paleta";
import { PREDEFINICOES_MARCA } from "@/lib/marca/predefinicoes";
import { PreviaMarca } from "./previa-marca";

export interface EditorAparenciaProps {
  /** Hex salvo; nulo = dourado padrão. */
  corInicial: string | null;
  /** `updated_at` ISO do criador (trava de colisão). */
  versaoInicial: string;
  area: string;
}

const PADRAO = validarHex(PALETA_PADRAO)!;

/** Tokens do tema como CSS vars no próprio painel (vence o tema da página; valores gerados por gerarPaleta). */
function variaveis(cor: string, tema: Tema): CSSProperties {
  const p = gerarPaleta(cor);
  return { ...p[tema], "--marca-fixo": p.dark["--accent"], "--marca-fixo-ink": p.dark["--accent-ink"] } as CSSProperties;
}

/**
 * Seletor da cor da marca com prévia ao vivo nos dois temas, usando os componentes reais da
 * área do aluno. Salvar grava `criadores.cor_marca` (trava pelo `updated_at`).
 */
export function EditorAparencia({ corInicial, versaoInicial, area }: EditorAparenciaProps) {
  const router = useRouter();
  const [salva, setSalva] = useState(validarHex(corInicial ?? "") ?? PADRAO);
  const [cor, setCor] = useState(salva);
  const [texto, setTexto] = useState(salva);
  const [versao, setVersao] = useState(versaoInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [pendente, iniciar] = useTransition();

  const escolher = (valor: string) => {
    setTexto(valor);
    setFeito(false);
    const hex = validarHex(valor);
    if (hex) setCor(hex);
  };
  const textoInvalido = validarHex(texto) === null;
  const paleta = gerarPaleta(cor);
  const ajustada = paleta.dark["--accent"] !== cor || paleta.light["--accent"] !== cor;

  const salvar = () =>
    iniciar(async () => {
      setErro(null);
      const r = await acaoSalvarCorDaMarca({ cor: cor === PADRAO ? null : cor, versao });
      if (!r.ok) return setErro(r.erro);
      setVersao(r.dados.versao);
      setSalva(cor);
      setFeito(true);
      router.refresh();
    });

  return (
    <div className="grid gap-5 desk:grid-cols-[340px_minmax(0,1fr)]">
      <Cartao className="flex flex-col gap-5 self-start">
        <CartaoTitulo tamanho={15}>Cor da marca</CartaoTitulo>
        <div className="flex items-end gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            Seletor
            <input
              type="color"
              value={cor}
              onChange={(e) => escolher(e.target.value)}
              className="h-11 w-14 cursor-pointer rounded-lg border border-border bg-surface p-1"
            />
          </label>
          <Campo
            rotulo="Hex"
            value={texto}
            onChange={(e) => escolher(e.target.value.trim())}
            maxLength={7}
            spellCheck={false}
            classNameMoldura="flex-1"
            className="font-mono"
            erro={textoInvalido ? "Use #RGB ou #RRGGBB." : undefined}
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Cores prontas">
          {PREDEFINICOES_MARCA.map((p) => {
            const hex = validarHex(p.cor)!;
            return (
              <button
                key={p.cor}
                type="button"
                onClick={() => escolher(hex)}
                aria-pressed={cor === hex}
                className={cn(
                  "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors",
                  cor === hex ? "border-text" : "border-border hover:bg-surface-2"
                )}
              >
                {/* Cor de exemplo: valor dinamico, unico estilo inline permitido. */}
                <span className="size-3.5 rounded-full" style={{ background: hex }} aria-hidden />
                {p.nome}
              </button>
            );
          })}
        </div>
        {ajustada && (
          <p className="m-0 rounded-lg border border-border bg-surface-2 p-3 text-[13px]" role="status">
            Ajustamos a cor para manter a leitura: tema escuro <b className="font-mono">{paleta.dark["--accent"]}</b>, tema claro{" "}
            <b className="font-mono">{paleta.light["--accent"]}</b>.
          </p>
        )}
        {erro && (
          <p role="alert" className="m-0 text-[13px] font-semibold text-warn">
            {erro}
          </p>
        )}
        {feito && (
          <p role="status" className="m-0 text-[13px] font-semibold text-ok">
            Salvo. A área do aluno de {area} já usa esta cor.
          </p>
        )}
        <div className="flex flex-wrap gap-2.5 border-t border-border pt-4">
          <Button size="42" carregando={pendente} disabled={cor === salva || textoInvalido} onClick={salvar}>
            Salvar
          </Button>
          <Button variant="contorno" size="42" disabled={cor === PADRAO} onClick={() => escolher(PADRAO)}>
            Voltar ao padrão
          </Button>
        </div>
      </Cartao>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        {(["dark", "light"] as const).map((tema) => (
          <section
            key={tema}
            data-theme={tema}
            style={variaveis(cor, tema)}
            aria-label={`Prévia no tema ${tema === "dark" ? "escuro" : "claro"}`}
            className="min-w-0 rounded-2xl border border-border bg-bg p-4 text-text"
          >
            <p className="m-0 mb-3 text-xs font-bold tracking-[.08em] text-muted uppercase">Tema {tema === "dark" ? "escuro" : "claro"}</p>
            <PreviaMarca />
          </section>
        ))}
      </div>
    </div>
  );
}
