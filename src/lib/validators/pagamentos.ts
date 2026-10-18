import { z } from "zod";
import { INTERVALOS_ASSINATURA, SITUACOES_AFILIADO, SITUACOES_ASSINATURA, SITUACOES_CUPOM, SITUACOES_OFERTA, SITUACOES_VENDA, TIPOS_CUPOM, TIPOS_OFERTA } from "@/lib/db/schema/_enums";
import { PRECO_MAXIMO_CENTAVOS, PRECO_MINIMO_CENTAVOS, RE_CODIGO_AFILIADO, RE_CODIGO_CUPOM, TAXA_MAXIMA_BPS, normalizarCodigo } from "@/lib/pagamentos/regras";
import { emailPessoa, idSchema, nomePessoa, versaoSchema } from "./membros";

/** Pagamentos (ADR-0019, RN-210 a RN-217). Mesmos schemas na action e na tela. Dinheiro em CENTAVOS inteiros. */

const centavos = z.number().int("Valor em centavos inteiros.").min(PRECO_MINIMO_CENTAVOS, "Preço mínimo de R$ 1,00.").max(PRECO_MAXIMO_CENTAVOS, "Preço acima do permitido.");
const dataIso = z.iso.datetime({ offset: true, message: "Data inválida." }).transform((v) => new Date(v));
const texto = (max: number, rotulo: string) => z.string().trim().min(2, `${rotulo}: mínimo de 2 caracteres.`).max(max, `${rotulo}: máximo de ${max} caracteres.`).regex(/^[^<>]*$/, `${rotulo} com caracteres inválidos.`);

export const codigoCupom = z.string().max(40, "Código inválido.").transform(normalizarCodigo).pipe(z.string().regex(RE_CODIGO_CUPOM, "Código: 3 a 20 letras e números."));
export const codigoAfiliado = z.string().max(40, "Código inválido.").transform(normalizarCodigo).pipe(z.string().regex(RE_CODIGO_AFILIADO, "Código: 4 a 20 letras e números."));

const camposOferta = {
  nome: texto(80, "Nome"),
  precoCentavos: centavos,
  intervalo: z.enum(INTERVALOS_ASSINATURA, "Intervalo inválido.").nullable().default(null),
  diasAcesso: z.number().int().min(1, "Mínimo de 1 dia.").max(3650, "Máximo de 3650 dias.").nullable().default(null),
  produtoIds: z.array(idSchema).min(1, "Escolha ao menos um curso.").max(50, "Cursos demais."),
};
export const criarOfertaSchema = z.strictObject({ tipo: z.enum(TIPOS_OFERTA, "Tipo inválido."), ...camposOferta });
/** O tipo não muda depois de criada. */
export const salvarOfertaSchema = z.strictObject({ ofertaId: idSchema, versao: versaoSchema, ...camposOferta });
export const situacaoOfertaSchema = z.strictObject({ ofertaId: idSchema, versao: versaoSchema, situacao: z.enum(SITUACOES_OFERTA, "Situação inválida.") });
export const excluirOfertaSchema = z.strictObject({ ofertaId: idSchema, versao: versaoSchema });

const camposCupom = {
  tipo: z.enum(TIPOS_CUPOM, "Tipo inválido."),
  percentualBps: z.number().int().min(1, "Desconto mínimo de 0,01%.").max(10000, "Desconto máximo de 100%.").nullable().default(null),
  valorCentavos: z.number().int().min(1, "Desconto mínimo de 1 centavo.").max(PRECO_MAXIMO_CENTAVOS).nullable().default(null),
  ofertaId: idSchema.nullable().default(null),
  validoAte: dataIso.nullable().default(null),
  limiteUsos: z.number().int().min(1, "Limite mínimo de 1 uso.").max(100000).nullable().default(null),
};
/** O código não muda depois de criado. */
export const criarCupomSchema = z.strictObject({ codigo: codigoCupom, ...camposCupom });
export const salvarCupomSchema = z.strictObject({ cupomId: idSchema, versao: versaoSchema, ...camposCupom });
export const situacaoCupomSchema = z.strictObject({ cupomId: idSchema, versao: versaoSchema, situacao: z.enum(SITUACOES_CUPOM, "Situação inválida.") });
export const excluirCupomSchema = z.strictObject({ cupomId: idSchema, versao: versaoSchema });

const camposAfiliado = {
  nome: nomePessoa,
  email: emailPessoa,
  comissaoBps: z.number().int().min(0, "Comissão mínima de 0%.").max(9000, "Comissão máxima de 90%."),
};
/** `codigo` ausente/nulo = gerado (8 símbolos). */
export const criarAfiliadoSchema = z.strictObject({ codigo: codigoAfiliado.nullable().default(null), ...camposAfiliado });
export const salvarAfiliadoSchema = z.strictObject({ afiliadoId: idSchema, versao: versaoSchema, ...camposAfiliado });
export const situacaoAfiliadoSchema = z.strictObject({ afiliadoId: idSchema, versao: versaoSchema, situacao: z.enum(SITUACOES_AFILIADO, "Situação inválida.") });
export const excluirAfiliadoSchema = z.strictObject({ afiliadoId: idSchema, versao: versaoSchema });

export const reembolsarVendaSchema = z.strictObject({ vendaId: idSchema, versao: versaoSchema });
/** SUPER_ADMIN: taxa em bps (800 = 8%). */
export const mudarTaxaSchema = z.strictObject({ criadorId: idSchema, versao: versaoSchema, taxaBps: z.number().int("Taxa inválida.").min(0, "Taxa mínima de 0%.").max(TAXA_MAXIMA_BPS, "Taxa máxima de 50%.") });

/** Filtros das leituras (a tela valida o que vem da URL). */
export const filtrosVendasSchema = z.strictObject({
  situacao: z.enum(SITUACOES_VENDA).optional(),
  ofertaId: idSchema.optional(),
  afiliadoId: idSchema.optional(),
  busca: z.string().trim().max(120).optional(),
  de: dataIso.optional(),
  ate: dataIso.optional(),
  pagina: z.number().int().min(1).default(1),
  porPagina: z.number().int().min(1).max(100).default(25),
});
export const filtrosAssinaturasSchema = z.strictObject({
  situacao: z.enum(SITUACOES_ASSINATURA).optional(),
  pagina: z.number().int().min(1).default(1),
  porPagina: z.number().int().min(1).max(100).default(25),
});

/** Query da rota pública de compra (`/api/stripe/checkout?oferta=&afiliado=&cupom=`). */
export const compraSchema = z.strictObject({
  oferta: idSchema,
  afiliado: codigoAfiliado.optional(),
  cupom: codigoCupom.optional(),
});
