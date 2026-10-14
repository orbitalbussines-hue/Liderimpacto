import { z } from "zod";
import { nomePessoa, versaoSchema } from "./membros";

/**
 * "Meu perfil" (dados pessoais da PESSOA, valem em qualquer criador). Tela e action usam os MESMOS
 * schemas. E-mail não entra: é só leitura (identidade do login).
 */

/** Celular BR: DDD (11–99) + 9 + 8 dígitos; fixo: DDD + 8 dígitos começando em 2–8. */
export const RE_WHATSAPP_BR = /^[1-9]{2}(?:9\d{8}|[2-8]\d{7})$/;
/** Empresa/cargo: texto simples, sem < >. */
export const RE_TEXTO_SIMPLES = /^[^<>]*$/;

/** Só os dígitos, sem o 55 do país quando vier com ele. */
export function digitosDoWhatsapp(valor: string): string {
  const d = valor.replace(/\D/g, "");
  return (d.length === 12 || d.length === 13) && d.startsWith("55") ? d.slice(2) : d;
}

/** Máscara de exibição/digitação: (11) 99999-0000 ou (11) 3333-0000. Aceita parcial. */
export function mascararWhatsapp(valor: string): string {
  const d = digitosDoWhatsapp(valor).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  const ddd = `(${d.slice(0, 2)}) `;
  const resto = d.slice(2);
  const corte = resto.length > 8 ? 5 : 4;
  return resto.length > corte ? `${ddd}${resto.slice(0, corte)}-${resto.slice(corte)}` : `${ddd}${resto}`;
}

export const perfilSchema = z.strictObject({
  nome: nomePessoa,
  whatsapp: z
    .string()
    .max(30, "WhatsApp inválido.")
    .regex(/^[\d\s()+.-]*$/, "WhatsApp inválido: use só números, ex.: (11) 99999-0000.")
    .transform(digitosDoWhatsapp)
    .refine((d) => d === "" || RE_WHATSAPP_BR.test(d), "WhatsApp inválido: use DDD + número, ex.: (11) 99999-0000.")
    .transform((d) => d || null),
  empresaCargo: z
    .string()
    .trim()
    .max(120, "Empresa / cargo: máximo de 120 caracteres.")
    .regex(RE_TEXTO_SIMPLES, "Empresa / cargo com caracteres inválidos (< >).")
    .transform((v) => v || null),
  versao: versaoSchema,
});

export type EntradaPerfil = z.input<typeof perfilSchema>;
