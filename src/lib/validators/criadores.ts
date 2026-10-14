import { z } from "zod";
import { slugValido } from "@/lib/criador/host";
import { emailPessoa, nomePessoa } from "./membros";

/** Endereco do criador (`<slug>.<PLATAFORMA_DOMINIO>`): a MESMA regra do host e do CHECK do banco. */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(slugValido, "Endereço inválido: use só letras minúsculas, números e hífen (sem hífen nas pontas). www, admin, api, app e plataforma são reservados.");

export const corOpcionalSchema = z.union([z.literal(""), z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, "Cor inválida: use #RGB ou #RRGGBB.")]);

export const novoCriadorSchema = z.strictObject({
  nome: z.string().trim().min(2, "Informe o nome do criador.").max(120, "Nome muito longo.").regex(/^[^<>]+$/, "Nome com caracteres inválidos."),
  slug: slugSchema,
  cor: corOpcionalSchema,
  donoNome: nomePessoa,
  donoEmail: emailPessoa,
});
