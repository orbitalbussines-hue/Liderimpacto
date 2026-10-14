import { sql } from "drizzle-orm";

/**
 * Sinal do segundo fator para um `select ... from usuarios` (politica-fatores.ts).
 * A coluna externa vai ESCRITA com a tabela ("usuarios"."id") de proposito: num select de
 * uma tabela so o Drizzle renderiza `${usuarios.id}` como "id" puro, e dentro da subquery
 * esse "id" viraria o da propria usuarios_totp — o exists daria sempre false.
 * Travado pelo teste de integracao (SUPER_ADMIN sem TOTP fica provisorio).
 */
export const totpVerificadoSql = sql<boolean>`exists (select 1 from usuarios_totp t where t.usuario_id = "usuarios"."id" and t.verificado)`;
