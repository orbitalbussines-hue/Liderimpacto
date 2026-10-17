import { sql } from "drizzle-orm";
import diario from "./migrations/meta/_journal.json";
import { db } from "@/lib/db";

/**
 * O banco já tem TODAS as migrações que este código conhece? (ADR-0016)
 *
 * No Easypanel não há "job antes do deploy": o serviço `ferramentas` migra (scripts/db-migrar.ts,
 * com trava) enquanto o app e os workers novos sobem. Quem sobe antes da migração terminar espera:
 * o `GET /api/saude` responde 503 (a versão anterior continua atendendo) e os workers aguardam em
 * `aguardarEsquema`. Compara o `when` da última migração do journal (entra no bundle) com o maior
 * `created_at` da tabela de controle do migrator. `>=`: a versão ANTERIOR continua saudável sobre
 * o schema novo (migrações aditivas, ADR-0015). Em PRD, além disso, a marca da versão (abaixo).
 */
export const ULTIMA_MIGRACAO = Math.max(...diario.entries.map((e) => e.when));

export const esquemaAtende = (ultimaAplicada: number | null) => ultimaAplicada !== null && ultimaAplicada >= ULTIMA_MIGRACAO;

/**
 * Marca da versão liberada (ADR-0017), no COMMENT do banco. Quem grava é o `scripts/db-migrar.ts`
 * (mesmo texto lá), no li-ferramentas, que só migra depois do backup pré-deploy no R2
 * (deploy/easypanel/ferramentas.sh). Assim nenhuma versão nova, nem a sem migração, entra no ar sem
 * backup. Sem `VERSAO_IMAGEM` (dev, CI, imagem local) não há trava.
 */
export const MARCA_IMPLANTACAO = "implantacao:";
export const implantacaoLiberada = (marca: string | null, versao: string | undefined) => !versao || marca === `${MARCA_IMPLANTACAO}${versao}`;

/**
 * Trava por processo: liberado uma vez, segue liberado quando a PRÓXIMA versão gravar a marca dela
 * (a anterior continua atendendo até a nova ficar saudável, e não cai se a nova falhar).
 */
let liberadaNesteProcesso = false;

/** false também quando o banco está fora ou a tabela de controle ainda não existe. */
export async function esquemaEmDia(): Promise<boolean> {
  try {
    const r = await db.execute<{ ultima: string | null; marca: string | null }>(sql`
      select max(created_at)::text as ultima,
        shobj_description((select oid from pg_database where datname = current_database()), 'pg_database') as marca
      from drizzle.__drizzle_migrations`);
    const linha = r.rows[0];
    if (!esquemaAtende(linha?.ultima ? Number(linha.ultima) : null)) return false;
    liberadaNesteProcesso ||= implantacaoLiberada(linha?.marca ?? null, process.env.VERSAO_IMAGEM?.trim() || undefined);
    return liberadaNesteProcesso;
  } catch {
    return false;
  }
}

/** Workers: só começam a consumir a fila com o schema em dia (consulta a cada 5 s, sem prazo). */
export async function aguardarEsquema(quem: string, intervaloMs = 5000): Promise<void> {
  let avisou = false;
  while (!(await esquemaEmDia())) {
    if (!avisou) console.log(`[${quem}] aguardando o li-ferramentas (backup pré-deploy + migração)...`);
    avisou = true;
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
  if (avisou) console.log(`[${quem}] versão liberada; iniciando.`);
}
