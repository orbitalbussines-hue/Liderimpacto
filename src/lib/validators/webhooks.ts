import { z } from "zod";
import { EVENTOS_WEBHOOK, SITUACOES_WEBHOOK } from "@/lib/db/schema/_enums";
import { problemaNaUrlWebhook } from "@/lib/webhooks/regras";
import { idSchema, versaoSchema } from "./membros";

/** Webhooks de saída (RN-204). Mesmos schemas na action e na tela. */

const urlWebhook = z
  .string()
  .trim()
  .max(500, "URL muito longa (máximo de 500).")
  .superRefine((url, ctx) => {
    const problema = problemaNaUrlWebhook(url);
    if (problema) ctx.addIssue({ code: "custom", message: problema });
  });

const campos = {
  nome: z.string().trim().min(2, "Informe um nome (mínimo de 2).").max(60, "Nome muito longo (máximo de 60).").regex(/^[^<>]+$/, "Nome com caracteres inválidos."),
  url: urlWebhook,
  eventos: z.array(z.enum(EVENTOS_WEBHOOK)).min(1, "Escolha ao menos um evento.").max(EVENTOS_WEBHOOK.length),
};

export const criarWebhookSchema = z.strictObject(campos);
export const salvarWebhookSchema = z.strictObject({ webhookId: idSchema, versao: versaoSchema, ...campos });
export const situacaoWebhookSchema = z.strictObject({ webhookId: idSchema, versao: versaoSchema, situacao: z.enum(SITUACOES_WEBHOOK) });
export const webhookVersaoSchema = z.strictObject({ webhookId: idSchema, versao: versaoSchema });
export const reenviarEntregaSchema = z.strictObject({ entregaId: idSchema, versao: versaoSchema });
