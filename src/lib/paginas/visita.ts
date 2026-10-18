import { codigoAfiliado, codigoCupom } from "@/lib/validators/pagamentos";
import { idSchema } from "@/lib/validators/membros";
import { UTM_CHAVES } from "@/lib/validators/paginas";

/**
 * Parâmetros da URL de uma visita (`/p/<slug>?funil=&cupom=&afiliado=&utm_*=`), validados (PURO). Valor
 * inválido = ausente (nunca recusa a página). O mesmo conjunto vai para o checkout e para a próxima etapa.
 */
export interface ParametrosVisita {
  funil: string | null;
  cupom: string | null;
  afiliado: string | null;
  utm: Record<string, string>;
}

const RE_UTM = /^[^\p{Cc}<>]{1,100}$/u;

export function lerParametros(q: (chave: string) => string | null | undefined): ParametrosVisita {
  const v = (k: string) => q(k)?.trim() || null;
  const cupom = codigoCupom.safeParse(v("cupom") ?? "");
  const afiliado = codigoAfiliado.safeParse(v("afiliado") ?? "");
  const funil = idSchema.safeParse(v("funil"));
  const utm: Record<string, string> = {};
  for (const k of UTM_CHAVES) {
    const x = v(`utm_${k}`);
    if (x && RE_UTM.test(x)) utm[k] = x;
  }
  return { funil: funil.success ? funil.data : null, cupom: cupom.success ? cupom.data : null, afiliado: afiliado.success ? afiliado.data : null, utm };
}

/** Consulta da próxima etapa do funil (repasse de funil, cupom, afiliado e UTM). */
export function consultaDaVisita(p: ParametrosVisita): string {
  const q = new URLSearchParams();
  if (p.funil) q.set("funil", p.funil);
  if (p.cupom) q.set("cupom", p.cupom);
  if (p.afiliado) q.set("afiliado", p.afiliado);
  for (const [k, x] of Object.entries(p.utm)) q.set(`utm_${k}`, x);
  const s = q.toString();
  return s ? `?${s}` : "";
}
