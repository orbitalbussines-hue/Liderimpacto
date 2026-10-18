import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { CABECALHO_ASSINATURA, CABECALHO_ENTREGA, CABECALHO_EVENTO, TENTATIVAS_WEBHOOK, TIMEOUT_WEBHOOK_MS } from "@/lib/webhooks/regras";

/** Formato EXATO de `assinarCorpo` (src/lib/webhooks/segredo.ts): `t=<unix>,v1=<hex HMAC-SHA256(segredo, "<t>.<corpo>")>`. */
const EXEMPLO = `import { createHmac, timingSafeEqual } from "node:crypto";

// corpo = o texto CRU da requisição (antes do JSON.parse)
export function assinaturaValida(corpo, cabecalho, segredo) {
  // cabecalho = req.headers["${CABECALHO_ASSINATURA.toLowerCase()}"], ex.: "t=1760700000,v1=9f2c…"
  const partes = Object.fromEntries(cabecalho.split(",").map((p) => p.split("=")));
  const t = Number(partes.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false; // mais de 5 min: recusa

  const esperado = createHmac("sha256", segredo).update(\`\${t}.\${corpo}\`).digest("hex");
  const recebido = String(partes.v1 ?? "");
  return recebido.length === esperado.length
    && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
}`;

/** Seção "Como validar a assinatura" (estática). */
export function ComoValidar() {
  return (
    <Cartao como="section" aria-labelledby="como-validar" className="flex flex-col gap-3">
      <CartaoTitulo id="como-validar" como="h2" tamanho={15} className="font-semibold">
        Como validar a assinatura
      </CartaoTitulo>
      <p className="m-0 text-[13px] leading-relaxed text-muted">
        Cada envio é um <code className="text-text">POST</code> em JSON com três cabeçalhos:{" "}
        <code className="text-text">{CABECALHO_ASSINATURA}</code> (<code className="text-text">t=&lt;unix&gt;,v1=&lt;hex&gt;</code>),{" "}
        <code className="text-text">{CABECALHO_EVENTO}</code> e <code className="text-text">{CABECALHO_ENTREGA}</code>. O{" "}
        <code className="text-text">v1</code> é o HMAC-SHA256, com o segredo, do texto <code className="text-text">&lt;t&gt;.&lt;corpo cru&gt;</code>.
      </p>
      <pre className="m-0 overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 text-xs leading-relaxed">
        <code>{EXEMPLO}</code>
      </pre>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] text-muted">
        <li>
          Responda com status 2xx em até {TIMEOUT_WEBHOOK_MS / 1000} segundos. Redirecionamento não é seguido e conta como falha.
        </li>
        <li>Falhou: até {TENTATIVAS_WEBHOOK} tentativas em cerca de 1 hora. Depois, a entrega pode ser reenviada pela lista de entregas.</li>
        <li>
          Use <code className="text-text">{CABECALHO_ENTREGA}</code> para ignorar repetições: a mesma entrega pode chegar mais de uma vez.
        </li>
      </ul>
    </Cartao>
  );
}
