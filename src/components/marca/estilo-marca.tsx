import { PALETA_PADRAO, cssDaMarca, validarHex } from "@/lib/marca/paleta";

const ID_ESCOPO = /^[a-z0-9-]{1,64}$/;

interface EstiloMarcaProps {
  /** Cor da marca em hex (#RGB/#RRGGBB). Vazia ou invalida: nada e renderizado. */
  cor?: string | null;
  /**
   * Restringe a cor a um trecho: o container precisa de `data-marca="<escopo>"`.
   * Uso: cor do curso dentro da area do criador (pagina do curso, player, certificado).
   * Sem escopo, vale para `[data-area="aluno"]` inteira (cor do criador).
   */
  escopo?: string;
}

/**
 * Aplica a cor da marca: renderiza um <style> que sobrescreve --accent/--accent-soft/
 * --accent-ink (nos dois temas) e --marca-fixo* (hero e login) no escopo.
 * Cascata: padrao da plataforma (globals.css) -> cor do criador (area do aluno) -> cor do curso.
 * Declaracao no proprio elemento vence a herdada, entao o escopo do curso aninhado ganha.
 */
export function EstiloMarca({ cor, escopo }: EstiloMarcaProps) {
  const hex = cor ? validarHex(cor) : null;
  // ponytail: cor invalida vinda do banco cai no padrao em vez de derrubar a pagina; quem grava valida.
  if (!hex) return null;
  if (escopo === undefined) {
    // Area inteira no dourado padrao: o globals.css ja resolve, nao gera CSS.
    if (hex === validarHex(PALETA_PADRAO)) return null;
    return <style dangerouslySetInnerHTML={{ __html: cssDaMarca(hex) }} />;
  }
  // Escopo aninhado sempre gera CSS: o curso pode querer o dourado dentro de um criador vinho.
  if (!ID_ESCOPO.test(escopo)) return null;
  // Seguro: escopo validado por regex e CSS so com valores gerados por gerarPaleta.
  return <style dangerouslySetInnerHTML={{ __html: cssDaMarca(hex, `[data-marca="${escopo}"]`) }} />;
}
