import { z } from "zod";
import { CLIENTE_ID_BLING } from "@/lib/integracoes/bling/regras";
import { PRODUTO_EXTERNO, SEGREDO_EXTERNO } from "@/lib/integracoes/regras";
import { idSchema, versaoSchema } from "./membros";

/** Integrações Hotmart/Eduzz/Bling (RN-230 a RN-236, RN-260). Mesmos schemas na action e na tela. */

const segredo = z.string().trim().regex(SEGREDO_EXTERNO, "Cole o token exato, sem espaços (8 a 200 caracteres).");

/** Só Hotmart e Eduzz por aqui: o Bling conecta com client_id + secret (`conectarBlingSchema`). */
export const conectarIntegracaoSchema = z.strictObject({ plataforma: z.enum(["HOTMART", "EDUZZ"], "Plataforma inválida."), segredo });
export const trocarSegredoSchema = z.strictObject({ integracaoId: idSchema, versao: versaoSchema, segredo });
export const integracaoVersaoSchema = z.strictObject({ integracaoId: idSchema, versao: versaoSchema });

export const criarMapeamentoSchema = z.strictObject({
  integracaoId: idSchema,
  produtoExterno: z.string().trim().regex(PRODUTO_EXTERNO, "Id do produto: só letras, números, hífen ou sublinhado (até 64)."),
  nomeExterno: z
    .string()
    .trim()
    .max(120, "Nome muito longo (máximo de 120).")
    .regex(/^[^<>]*$/, "Nome com caracteres inválidos.")
    .transform((v) => v || null)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  produtoIds: z.array(idSchema).min(1, "Escolha ao menos um curso.").max(20, "No máximo 20 cursos por produto."),
  diasAcesso: z.number().int("Dias inteiros.").min(1, "Mínimo de 1 dia.").max(3650, "Máximo de 3650 dias.").nullable(),
});

export const mapeamentoVersaoSchema = z.strictObject({ mapeamentoId: idSchema, versao: versaoSchema });
export const reprocessarEventoSchema = z.strictObject({ eventoId: idSchema, versao: versaoSchema });

/** Bling (ADR-0024): client_id + client_secret do app que o dono cria no Bling. */
const clienteId = z.string().trim().regex(CLIENTE_ID_BLING, "Client ID inválido: cole o valor exato do app no Bling.");
export const conectarBlingSchema = z.strictObject({ clienteId, clientSecret: segredo });
export const trocarCredenciaisBlingSchema = z.strictObject({ integracaoId: idSchema, versao: versaoSchema, clienteId, clientSecret: segredo });
export const autorizarBlingSchema = z.strictObject({ integracaoId: idSchema });
