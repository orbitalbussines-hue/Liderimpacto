import { segmentosDeTexto } from "@/lib/comunidade/regras";
import { cn } from "@/lib/utils";

/**
 * Texto PURO da comunidade (post, comentário): o React escapa o texto e só http(s) vira link,
 * pela lista de `segmentosDeTexto`. NUNCA `dangerouslySetInnerHTML` (ADR-0009).
 */
export function TextoComLinks({ texto, className }: { texto: string; className?: string }) {
  return (
    <p className={cn("m-0 break-words whitespace-pre-line", className)}>
      {segmentosDeTexto(texto).map((s, i) =>
        s.tipo === "link" ? (
          <a key={i} href={s.href} rel="noopener noreferrer nofollow" target="_blank" className="font-semibold text-accent underline-offset-2 hover:underline">
            {s.valor}
          </a>
        ) : (
          <span key={i}>{s.valor}</span>
        ),
      )}
    </p>
  );
}
