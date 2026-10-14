"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Resultado } from "@/lib/acao";
import type { ConfigVitrine } from "@/lib/vitrine/config";

export type EstadoGravacao = "salvo" | "pendente" | "salvando" | "erro" | "conflito";

export const ESPERA_AUTOSAVE_MS = 800;
const CONFLITO = /alterou|alterado por outro/i;

type Salvar = (e: { versao: string | null; config: ConfigVitrine }) => Promise<Resultado<{ versao: string }>>;

/**
 * Rascunho do construtor com AUTOSAVE: cada mudança espera 800 ms parada e grava com a versão
 * (trava otimista). As gravações vão numa fila (nunca duas ao mesmo tempo, sempre com a versão
 * mais nova). Conflito = outra pessoa gravou: para de salvar e a tela pede para recarregar.
 * `substituir` troca o rascunho por um que JÁ está no servidor (reverter/descartar), sem regravar.
 */
export function useRascunho(inicial: { config: ConfigVitrine; versao: string | null }, salvar: Salvar) {
  const [config, setConfig] = useState(inicial.config);
  const [versao, setVersao] = useState(inicial.versao);
  const [estado, setEstado] = useState<EstadoGravacao>("salvo");
  const [erro, setErro] = useState<string | null>(null);
  const versaoRef = useRef(inicial.versao);
  const gravado = useRef(JSON.stringify(inicial.config));
  const atual = useRef(inicial.config);
  const fila = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const travado = useRef(false);

  const gravarAgora = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    fila.current = fila.current.then(async () => {
      const alvo = atual.current;
      const json = JSON.stringify(alvo);
      if (travado.current || json === gravado.current) return;
      setEstado("salvando");
      const r = await salvar({ versao: versaoRef.current, config: alvo });
      if (!r.ok) {
        const conflito = CONFLITO.test(r.erro);
        travado.current = conflito;
        setErro(r.erro);
        setEstado(conflito ? "conflito" : "erro");
        return;
      }
      versaoRef.current = r.dados.versao;
      gravado.current = json;
      setVersao(r.dados.versao);
      setErro(null);
      setEstado(JSON.stringify(atual.current) === json ? "salvo" : "pendente");
    });
    return fila.current;
  }, [salvar]);

  const mudar = useCallback(
    (f: (c: ConfigVitrine) => ConfigVitrine) => {
      if (travado.current) return;
      const novo = f(atual.current);
      atual.current = novo;
      setConfig(novo);
      setEstado("pendente");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(gravarAgora, ESPERA_AUTOSAVE_MS);
    },
    [gravarAgora],
  );

  const substituir = useCallback((c: ConfigVitrine, v: string) => {
    if (timer.current) clearTimeout(timer.current);
    atual.current = c;
    gravado.current = JSON.stringify(c);
    versaoRef.current = v;
    setConfig(c);
    setVersao(v);
    setEstado("salvo");
    setErro(null);
  }, []);

  /** Grava o que estiver pendente e devolve a versão vigente (antes de publicar/reverter). */
  const descarregar = useCallback(async () => {
    await gravarAgora();
    return { versao: versaoRef.current, ok: !travado.current && JSON.stringify(atual.current) === gravado.current };
  }, [gravarAgora]);

  useEffect(() => {
    // Saindo da página com mudança pendente: o navegador pergunta antes de fechar.
    const aviso = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(atual.current) !== gravado.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, []);

  return { config, versao, estado, erro, mudar, substituir, descarregar };
}
