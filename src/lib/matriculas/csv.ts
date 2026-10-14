import { lerCsv, type ErroCsv, type LeituraCsvDe } from "@/lib/membros/csv";
import { linhaCsvMatriculaSchema, type LinhaCsvMatricula } from "@/lib/validators/matriculas";
import { MSG_EXPIRACAO_PASSADA, expiracaoValida } from "./regras";

/**
 * CSV de matriculas (`nome,email,produto,expira_em,grupo`) — mesmo leitor, limites e regras do
 * CSV de membros (src/lib/membros/csv.ts). Funcao PURA: a tela faz a previa e a action le DE NOVO.
 * Uma pessoa pode vir em varias linhas (um produto por linha); o par e-mail + produto repetido
 * vale so na primeira.
 */

export function lerCsvDeMatriculas(texto: string, agora: Date): LeituraCsvDe<LinhaCsvMatricula> {
  return lerCsv(texto, {
    obrigatorias: ["nome", "email", "produto"],
    opcionais: ["expira_em", "grupo"],
    item: "matrícula",
    validar: (v) => {
      const r = linhaCsvMatriculaSchema.safeParse({ nome: v.nome, email: v.email, produto: v.produto, expira_em: v.expira_em, grupo: v.grupo });
      if (!r.success) return { ok: false, mensagem: r.error.issues[0]?.message ?? "Linha inválida." };
      if (!expiracaoValida(r.data.expira_em, agora)) return { ok: false, mensagem: MSG_EXPIRACAO_PASSADA };
      return { ok: true, dados: r.data };
    },
    chave: (d) => `${d.email}|${d.produto}`,
    repetido: "E-mail e produto repetidos no arquivo (vale a primeira ocorrência).",
  });
}

export interface ProdutoDoCsv {
  id: string;
  titulo: string;
  codigo: number;
  slug: string;
}

/**
 * Liga o produto de cada linha (codigo ou slug) aos produtos DESTE criador. Produto de outro
 * criador, removido ou inexistente: a linha vira erro "produto não encontrado".
 */
export function resolverProdutos<L extends { numero: number; dados: LinhaCsvMatricula }>(validas: readonly L[], produtos: readonly ProdutoDoCsv[]) {
  const porCodigo = new Map(produtos.map((p) => [String(p.codigo), p]));
  const porSlug = new Map(produtos.map((p) => [p.slug, p]));
  const ok: (L & { produto: ProdutoDoCsv })[] = [];
  const erros: ErroCsv[] = [];
  for (const l of validas) {
    const p = porCodigo.get(l.dados.produto) ?? porSlug.get(l.dados.produto);
    if (p) ok.push({ ...l, produto: p });
    else erros.push({ numero: l.numero, mensagem: `Produto "${l.dados.produto}" não encontrado.` });
  }
  return { ok, erros };
}
