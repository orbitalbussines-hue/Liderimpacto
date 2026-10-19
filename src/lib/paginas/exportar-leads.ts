import "server-only";
import { gerarCsv } from "@/lib/analytics/regras";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { avaliarMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { sessaoDosCabecalhos, type SessaoAtiva } from "@/lib/auth/sessao";
import { db } from "@/lib/db";
import { filtrosLeadsSchema } from "@/lib/validators/paginas";
import { listarLeads } from "./consultas";

/**
 * `GET /admin/paginas/leads/exportar?pagina=&q=` — CSV dos leads (RN-254), gerado no SERVIDOR sob demanda,
 * com os MESMOS filtros da tela; nada fica guardado. Sem Next aqui (o route handler só repassa; o teste
 * chama direto).
 * - Sessão PLENA do host + papel DONO/ADMIN lido do banco (recusa vai para a trilha). Sem sessão = 401;
 *   ALUNO ou apex = 403. Criador SEMPRE do host.
 * - A trilha registra QUEM exportou, quantos e o filtro (página/funil; a busca só como "sim/não", porque
 *   pode ser um e-mail) — NUNCA os e-mails. Gravada ANTES de devolver o arquivo.
 * - Planilha: `gerarCsv` (`;`, BOM, CRLF) e célula que começa com `= + - @` ganha `'` (sem fórmula).
 */
const SEM_CACHE = { "Cache-Control": "no-store" };
/** ponytail: tudo numa resposta; streaming por página se uma área passar de ~50 mil leads. */
export const LIMITE_EXPORTACAO_LEADS = 50_000;

const dataHora = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

type LinhaLead = Awaited<ReturnType<typeof listarLeads>>["linhas"][number];

export function csvLeads(linhas: readonly LinhaLead[]): string {
  return gerarCsv(
    ["nome", "email", "pagina_origem", "funil", "tag", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "consentimento", "consentimento_em", "capturas", "primeira_captura_em", "ultima_captura_em", "descadastrado"],
    linhas.map((l) => [
      l.nome,
      l.email,
      l.pagina,
      l.funil,
      l.tag,
      l.utm.source ?? null,
      l.utm.medium ?? null,
      l.utm.campaign ?? null,
      l.utm.term ?? null,
      l.utm.content ?? null,
      l.consentimentoTexto,
      dataHora(l.consentimentoEm),
      l.capturas,
      dataHora(l.criadoEm),
      dataHora(l.ultimaCapturaEm),
      l.descadastrado ? "sim" : "nao",
    ]),
  );
}

export async function atenderExportacaoLeads(req: Request): Promise<Response> {
  const s = await sessaoDosCabecalhos(req.headers);
  if (!s || s.provisoria) return new Response("Sessão expirada. Entre novamente.", { status: 401, headers: SEM_CACHE });
  const quem = await avaliarMembro(s as SessaoAtiva, EQUIPE);
  if (!quem) return new Response("Sem permissão.", { status: 403, headers: SEM_CACHE });

  const q = new URL(req.url).searchParams;
  const f = filtrosLeadsSchema.safeParse({ pagina: q.get("pagina") || undefined, funil: q.get("funil") || undefined, busca: q.get("q") || undefined });
  if (!f.success) return new Response("Filtro inválido.", { status: 400, headers: SEM_CACHE });
  const criadorId = quem.criador.id;
  const { total, linhas } = await listarLeads(criadorId, { paginaId: f.data.pagina, funilId: f.data.funil, busca: f.data.busca, pagina: 1, porPagina: LIMITE_EXPORTACAO_LEADS });

  await registrarAuditoria(db, {
    userId: quem.usuario.id,
    criadorId,
    acao: "exportar",
    tabela: "criadores_leads",
    registroId: null,
    detalhes: `Exportou ${linhas.length} lead(s) em CSV${total > linhas.length ? ` (de ${total}; limite de ${LIMITE_EXPORTACAO_LEADS})` : ""}`,
    dadosNovos: { pagina_id: f.data.pagina ?? null, funil_id: f.data.funil ?? null, com_busca: !!f.data.busca, linhas: linhas.length },
  });
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return new Response(csvLeads(linhas), {
    headers: { ...SEM_CACHE, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="leads-${hoje}.csv"`, "X-Robots-Tag": "noindex" },
  });
}
