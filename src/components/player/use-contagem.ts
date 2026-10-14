"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Contagem regressiva da reprodução automática ("Próxima aula em 5s · Cancelar"). `restante`
 * nulo = parada. Chega a zero: chama `aoTerminar` uma vez e para.
 */
export function useContagem(segundos: number, aoTerminar: () => void) {
  const [restante, setRestante] = useState<number | null>(null);
  const fim = useRef(aoTerminar);
  useEffect(() => {
    fim.current = aoTerminar;
  });

  useEffect(() => {
    if (restante === null) return;
    const t = setTimeout(() => {
      if (restante > 1) return setRestante(restante - 1);
      setRestante(null);
      fim.current();
    }, 1000);
    return () => clearTimeout(t);
  }, [restante]);

  const iniciar = useCallback(() => setRestante(segundos), [segundos]);
  const cancelar = useCallback(() => setRestante(null), []);
  return { restante, iniciar, cancelar };
}
