import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/** Unica conexao do app. Nenhum outro arquivo abre Pool/Client. */
export const db = drizzle({
  connection: { connectionString: process.env.DATABASE_URL },
  schema,
});

/** Tipo da transacao, para helpers que precisam rodar dentro dela. */
export type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0];
