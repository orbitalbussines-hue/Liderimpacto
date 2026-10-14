import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { recuperarTrechos, type TrechoRecuperado } from "@/lib/conhecimento/busca";
import { db } from "@/lib/db";
import type { PapelCriador } from "@/lib/db/schema/_enums";
import { criadores_assistentes_conversas_mensagens as mensagens, type FonteMensagem } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { formatarTempo } from "@/lib/validators/catalogo";
import { acessoDaAula } from "@/lib/video/acesso-aula";
import { ehErroDeWorkspace, type ClienteIA } from "./cliente";
import { apareceNoCurso, configDoAssistente, produtosDaBusca } from "./config";
import { gravarResposta, registrarPergunta } from "./conversas";
import {
  citacoesDoTexto,
  LIMITES_ASSISTENTE,
  montarMensagem,
  montarSistema,
  RESPOSTA_RECUSADA,
  RESPOSTA_SEM_BASE,
  tetoDoCriador,
  USO_ZERO,
  type Uso,
} from "./regras";

/**
 * Fluxo de UMA pergunta (ADR-0014): tudo o que pode recusar acontece ANTES de chamar o modelo —
 * IA configurada, assistente ligado, acesso à aula, recuperação filtrada pelo acesso de quem
 * pergunta e limite diário (atômico, no banco). Depois, `eventos(sinal)` faz o streaming e grava a
 * resposta com os tokens (também se o aluno sair no meio). Sem trecho recuperado = resposta fixa,
 * sem chamar a API (custo zero). O cliente é INJETADO (os testes usam um falso).
 */

export const MSG_IA_NAO_CONFIGURADA = "IA não configurada nesta plataforma. Avise a equipe da Bah! Tech.";
export const MSG_DESLIGADO = "O assistente do professor não está disponível nesta área.";
export const MSG_SEM_WORKSPACE = "Chave da IA sem workspace: configure ANTHROPIC_WORKSPACE_ID ou use uma chave de workspace";
export const MSG_FALHA_API = "O assistente não conseguiu responder agora. Tente de novo em instantes.";

export class ErroIaNaoConfigurada extends ErroDeNegocio {
  constructor() {
    super(MSG_IA_NAO_CONFIGURADA);
  }
}

export interface Perguntante {
  criadorId: string;
  nomeArea: string;
  usuarioId: string;
  /** Vínculo no criador (SUPER_ADMIN sem vínculo não conversa: não há de quem contar o limite). */
  membroId: string | null;
  papel: PapelCriador;
}

export interface PedidoPergunta {
  pergunta: string;
  conversaId: string | null;
  aulaId: string | null;
  /** Playground da equipe: acesso a tudo, fora das perguntas recentes. */
  teste: boolean;
}

export type EventoResposta =
  | { tipo: "inicio"; conversaId: string; fontes: FonteMensagem[]; restantes: number | null }
  | { tipo: "texto"; texto: string }
  /** O texto que chegou deve ser trocado (recusa do modelo). */
  | { tipo: "substituir"; texto: string }
  | { tipo: "fim"; mensagemId: string; semResposta: boolean; citadas: number[]; versao: string }
  | { tipo: "erro"; mensagem: string };

const origemDe = (t: TrechoRecuperado): string =>
  t.fonte === "TEXTO" ? "Texto da equipe" : t.fonte === "PRODUTO_DESCRICAO" ? "Descrição do curso" : t.produtoTitulo ?? "Aula";

const fonteDoPrompt = (t: TrechoRecuperado): string => {
  if (t.fonte === "TEXTO") return `Texto da equipe: ${t.titulo}`;
  if (t.fonte === "PRODUTO_DESCRICAO") return `Curso "${t.titulo}"`;
  const tempo = t.inicioSeg != null ? ` a partir de ${formatarTempo(t.inicioSeg)}` : "";
  return `Aula "${t.titulo}"${t.produtoTitulo ? ` do curso "${t.produtoTitulo}"` : ""}${tempo}`;
};

/** Pergunta anterior do aluno na conversa (melhora a busca em "e como faço isso?"). */
async function perguntaAnterior(criadorId: string, conversaId: string | null): Promise<string> {
  if (!conversaId) return "";
  const [m] = await db
    .select({ texto: mensagens.texto })
    .from(mensagens)
    .where(and(eq(mensagens.conversa_id, conversaId), eq(mensagens.criador_id, criadorId), eq(mensagens.papel, "USUARIO"), vivos(mensagens)))
    .orderBy(desc(mensagens.created_at))
    .limit(1);
  return m?.texto ?? "";
}

export async function prepararResposta(cliente: ClienteIA | null, quem: Perguntante, pedido: PedidoPergunta, agora: Date = new Date()) {
  if (!cliente) throw new ErroIaNaoConfigurada();
  const equipe = quem.papel === "DONO" || quem.papel === "ADMIN";
  if (!quem.membroId) throw new ErroDeNegocio("Entre com uma conta vinculada a esta área para conversar com o assistente.");
  if (pedido.teste && !equipe) throw new ErroDeNegocio("Sem permissão para esta ação.");
  const config = await configDoAssistente(quem.criadorId);
  if (!pedido.teste && !config.ligado) throw new ErroDeNegocio(MSG_DESLIGADO);
  if (pedido.aulaId) {
    const a = await acessoDaAula(quem.criadorId, pedido.aulaId, { papel: quem.papel, membroId: quem.membroId }, agora);
    if (!a || !a.pode || (!pedido.teste && !apareceNoCurso(config, a.produtoId))) throw new ErroDeNegocio("O assistente não está disponível nesta aula.");
  }

  // Recuperação filtrada pelo acesso de QUEM pergunta (o teste da equipe vê tudo).
  const busca = `${pedido.pergunta}\n${await perguntaAnterior(quem.criadorId, pedido.conversaId)}`;
  const trechos = await recuperarTrechos(
    quem.criadorId,
    { papel: pedido.teste ? "DONO" : quem.papel, membroId: quem.membroId },
    busca,
    { produtos: produtosDaBusca(config), limite: LIMITES_ASSISTENTE.trechos, porDocumento: LIMITES_ASSISTENTE.trechosPorDocumento },
    agora,
  );

  const registro = await registrarPergunta(
    {
      criadorId: quem.criadorId,
      membroId: quem.membroId,
      usuarioId: quem.usuarioId,
      equipe,
      pergunta: pedido.pergunta,
      conversaId: pedido.conversaId,
      aulaId: pedido.aulaId,
      teste: pedido.teste,
      limiteMembro: config.limiteDiario,
      tetoCriador: tetoDoCriador(process.env.ASSISTENTE_TETO_DIARIO_CRIADOR),
    },
    agora,
  );

  const fontes: FonteMensagem[] = trechos.map((t, i) => ({ n: i + 1, titulo: t.titulo, origem: origemDe(t), aulaId: t.aulaId, inicioSeg: t.inicioSeg }));
  const membroId = quem.membroId;
  const base = { criadorId: quem.criadorId, conversaId: registro.conversaId, membroId, usuarioId: quem.usuarioId };

  async function* eventos(sinal: AbortSignal): AsyncGenerator<EventoResposta> {
    yield { tipo: "inicio", conversaId: registro.conversaId, fontes, restantes: registro.restantes };
    if (!trechos.length) {
      yield { tipo: "texto", texto: RESPOSTA_SEM_BASE };
      const g = await gravarResposta({ ...base, texto: RESPOSTA_SEM_BASE, fontes: [], uso: USO_ZERO, modelo: null, semResposta: true, interrompida: false });
      yield { tipo: "fim", mensagemId: g.mensagemId, semResposta: true, citadas: [], versao: g.versao.toISOString() };
      return;
    }
    const sistema = montarSistema({ nomeAssistente: config.nome, nomeArea: quem.nomeArea, instrucoes: config.instrucoes });
    const atual = montarMensagem(
      pedido.pergunta,
      trechos.map((t, i) => ({ n: i + 1, fonte: fonteDoPrompt(t), texto: t.texto })),
    );
    let texto = "";
    let uso: Uso = USO_ZERO;
    let modelo = cliente!.modelo;
    let recusou = false;
    try {
      for await (const ev of cliente!.responder({ sistema, mensagens: [...registro.historico, { papel: "USUARIO", texto: atual }], maxTokens: LIMITES_ASSISTENTE.maxTokens }, sinal)) {
        if (ev.tipo === "texto") {
          texto += ev.texto;
          yield ev;
        } else if (ev.tipo === "uso") uso = ev.uso;
        else {
          uso = ev.uso;
          modelo = ev.modelo;
          recusou = ev.recusou;
        }
      }
    } catch (e) {
      // Saiu no meio (aborto) ou a API falhou: grava o que chegou, com os tokens conhecidos.
      await gravarResposta({ ...base, texto, fontes: [], uso, modelo, semResposta: false, interrompida: true });
      if (sinal.aborted) return;
      console.error("[assistente] a API não respondeu:", e instanceof Error ? `${e.name}: ${e.message}` : "erro");
      // Configuração errada só aparece para a equipe; o aluno vê a mensagem genérica.
      yield { tipo: "erro", mensagem: equipe && ehErroDeWorkspace(e) ? MSG_SEM_WORKSPACE : MSG_FALHA_API };
      return;
    }
    if (recusou) {
      texto = RESPOSTA_RECUSADA;
      yield { tipo: "substituir", texto };
    }
    const citadas = recusou ? [] : citacoesDoTexto(texto, fontes.length);
    const g = await gravarResposta({ ...base, texto, fontes: fontes.filter((f) => citadas.includes(f.n)), uso, modelo, semResposta: citadas.length === 0, interrompida: false });
    yield { tipo: "fim", mensagemId: g.mensagemId, semResposta: citadas.length === 0, citadas, versao: g.versao.toISOString() };
  }

  return { conversaId: registro.conversaId, trechos, eventos };
}
