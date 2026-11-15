/**
 * Página de vendas própria (ADR-0025) no PostgreSQL real: o aviso assinado que a página Liderança Inteligente manda
 * (`x-assinatura: sha256=<hex>`) vira conta + ALUNO + matrícula em cada curso mapeado; reenvio do mesmo pedido
 * ("Reenviar aviso de acesso" no painel da página) não duplica; assinatura errada é recusada.
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { assinarPagina, paginaCompra } from "../integracoes/exemplos";
import { novoCriador, novoUsuario, vincular } from "./_apoio";
import { cursoPronto } from "./_progresso";

let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;
let serv: typeof import("@/lib/integracoes/servico");
let receber: typeof import("@/lib/integracoes/receber");
let processar: typeof import("@/lib/integracoes/processar");

beforeAll(async () => {
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
  serv = await import("@/lib/integracoes/servico");
  receber = await import("@/lib/integracoes/receber");
  processar = await import("@/lib/integracoes/processar");
});

const SEGREDO = "segredo-ficticio-da-pagina-com-mais-de-32-caracteres";

async function entregar(integracaoId: string, payload: unknown, segredo = SEGREDO) {
  const corpo = JSON.stringify(payload);
  const fila: string[] = [];
  const r = await receber.receberEventoIntegracao(
    { segmento: "pagina", integracaoId, corpo, cabecalhos: new Headers({ "x-assinatura": assinarPagina(segredo, corpo), "x-evento-id": "ignorado" }) },
    async (ids) => {
      fila.push(...ids);
      return true;
    },
  );
  for (const id of fila) await processar.processarEventoIntegracao(id);
  return { r, fila };
}

describe("página de vendas própria", () => {
  it("compra paga libera os 2 cursos mapeados para o comprador novo; reenvio não duplica; assinatura errada = 401", async () => {
    const criador = await novoCriador();
    const dono = await novoUsuario();
    await vincular(criador.id, dono.id, "DONO");
    const aulas = (await cursoPronto(criador.id, { aulas: 1 })).produto;
    const bonus = (await cursoPronto(criador.id, { aulas: 1 })).produto;
    const integ = await db.transaction((tx) => serv.conectarIntegracao(tx, { criadorId: criador.id, autor: dono.id, plataforma: "PAGINA", segredo: SEGREDO }));
    await db.transaction((tx) =>
      serv.criarMapeamento(tx, { criadorId: criador.id, autor: dono.id, integracaoId: integ.id, produtoExterno: "lideranca-inteligente", nomeExterno: "Livro Liderança Inteligente", produtoIds: [aulas.id, bonus.id], diasAcesso: null }),
    );

    const payload = paginaCompra({ pedido: "LI-HWGOVF6RE3" });
    expect((await entregar(integ.id, payload, "segredo-errado-com-mais-de-32-caracteres!!")).r.status).toBe(401);
    const primeira = await entregar(integ.id, payload);
    expect(primeira.r.status).toBe(200);
    expect(primeira.fila).toHaveLength(1);
    expect((await entregar(integ.id, payload)).fila).toEqual([]); // reenvio: já processado

    const ms = await db.select().from(s.produtos_matriculas).where(eq(s.produtos_matriculas.criador_id, criador.id));
    expect(ms.map((m) => m.referencia_externa).sort()).toEqual([`pagina:LI-HWGOVF6RE3:${aulas.id}`, `pagina:LI-HWGOVF6RE3:${bonus.id}`].sort());
    expect(ms.every((m) => m.status === "ATIVA" && m.origem === "COMPRA" && m.expira_em === null && m.membro_id === ms[0].membro_id)).toBe(true);
    const [pessoa] = await db
      .select({ email: s.usuarios.email, papel: s.criadores_membros.papel })
      .from(s.criadores_membros)
      .innerJoin(s.usuarios, eq(s.usuarios.id, s.criadores_membros.usuario_id))
      .where(eq(s.criadores_membros.id, ms[0].membro_id));
    expect(pessoa).toEqual({ email: payload.comprador.email, papel: "ALUNO" });
    const recibos = await db.select().from(s.integracoes_recibos).where(eq(s.integracoes_recibos.integracao_id, integ.id));
    expect(recibos.map((r) => r.recusa ?? "ok").sort()).toEqual(["TOKEN_INVALIDO", "ok"]);
    expect(JSON.stringify(recibos)).not.toContain("52998224725");
  });
});
