import "server-only";
import { avaliarMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { sessaoDosCabecalhos, type SessaoAtiva } from "@/lib/auth/sessao";
import { agrupamentoDaSerie, hojeEmBrasilia, lerIntervalo } from "@/lib/painel/periodo";
import { avaliacoesAnalytics } from "./consultas-avaliacoes";
import { conteudo, coortes, horasAssistidas, kpisAnalytics, serieDiaria } from "./consultas";
import { csvAvaliacoes, csvConteudo, csvRetencao, csvVisaoGeral } from "./csv";
import { lerAba, lerCurso, lerOrdem, montarCoortes, ordenarAulas } from "./regras";

/**
 * `GET /admin/analytics/exportar?aba=&de=&ate=&curso=` — CSV da aba, gerado no SERVIDOR. Período com a
 * MESMA leitura da tela (`lerIntervalo`: legado `periodo=`, padrão últimos 30 dias). Sem Next aqui (o
 * route handler só repassa; o teste chama direto).
 *
 * - Sessão PLENA do host + papel DONO/ADMIN lido do banco (o mesmo núcleo das páginas; a recusa
 *   de papel vai para a trilha). Sem sessão = 401; ALUNO ou apex = 403.
 * - Criador SEMPRE do host; curso de outro criador só devolve tabela vazia (toda consulta filtra
 *   `criador_id`). Lê sem cache (raro e deve sair fresco).
 * - Só agregados (ver csv.ts): nenhum dado pessoal. `Cache-Control: no-store`.
 */
const SEM_CACHE = { "Cache-Control": "no-store" };

export async function atenderExportacao(req: Request): Promise<Response> {
  const s = await sessaoDosCabecalhos(req.headers);
  if (!s || s.provisoria) return new Response("Sessão expirada. Entre novamente.", { status: 401, headers: SEM_CACHE });
  const quem = await avaliarMembro(s as SessaoAtiva, EQUIPE);
  if (!quem) return new Response("Sem permissão.", { status: 403, headers: SEM_CACHE });

  const q = new URL(req.url).searchParams;
  const valor = (k: string) => q.get(k) ?? undefined;
  const aba = lerAba(valor("aba"));
  const hoje = hojeEmBrasilia();
  const periodo = lerIntervalo({ de: valor("de"), ate: valor("ate"), periodo: valor("periodo") }, hoje);
  const curso = lerCurso(valor("curso"));
  const id = quem.criador.id;

  let corpo: string;
  if (aba === "conteudo") {
    const c = await conteudo(id, curso);
    corpo = csvConteudo(c.cursos, ordenarAulas(c.aulas, lerOrdem(valor("ordem"))));
  } else if (aba === "retencao") {
    corpo = csvRetencao(montarCoortes(await coortes(id, curso)));
  } else if (aba === "avaliacoes") {
    corpo = csvAvaliacoes(await avaliacoesAnalytics(id, periodo, curso));
  } else {
    const [k, h, serie] = await Promise.all([kpisAnalytics(id, periodo, curso), horasAssistidas(id, periodo, curso), serieDiaria(id, periodo, curso)]);
    corpo = csvVisaoGeral(k, h, serie, curso !== null, agrupamentoDaSerie(periodo.dias) === "semana");
  }
  const nome = aba === "conteudo" || aba === "retencao" ? `analytics-${aba}-${hoje}.csv` : `analytics-${aba}-${periodo.de}-a-${periodo.ate}.csv`;
  return new Response(corpo, {
    headers: { ...SEM_CACHE, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}"`, "X-Robots-Tag": "noindex" },
  });
}
