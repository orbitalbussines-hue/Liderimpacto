import "server-only";
import type { MembroDaRequisicao } from "@/lib/auth/autorizacao";
import { iaConfigurada } from "./cliente";
import { apareceNoCurso, configDoAssistente } from "./config";
import { conversaDoMembro, ultimaConversaDaAula } from "./conversas";

/**
 * O que as telas do ALUNO precisam do assistente (ADR-0014): se aparece, o nome, por que não dá
 * para perguntar agora e a conversa inicial. A rota confere tudo de novo ao perguntar.
 */

const paraChat = (c: NonNullable<Awaited<ReturnType<typeof conversaDoMembro>>>) => ({
  conversaId: c.id,
  versao: c.versao,
  mensagens: c.mensagens.map((m) => ({ id: m.id, papel: m.papel, texto: m.texto, fontes: m.fontes })),
});

/** Painel "Pergunte ao professor" da aula: só com IA configurada, assistente ligado no curso e acesso à aula. */
export async function assistenteDaAula(q: MembroDaRequisicao, aula: { id: string; produtoId: string; pode: boolean }) {
  if (!q.membro.id || !aula.pode || !iaConfigurada()) return null;
  const config = await configDoAssistente(q.criador.id);
  if (!apareceNoCurso(config, aula.produtoId)) return null;
  const c = await ultimaConversaDaAula(q.criador.id, q.membro.id, aula.id);
  return { nome: config.nome, inicial: c ? paraChat(c) : null };
}

/** Página `/assistente`: histórico sempre visível; perguntar só com IA configurada e ligado. */
export async function assistenteDoMembro(q: MembroDaRequisicao, conversaId: string | null) {
  const config = await configDoAssistente(q.criador.id);
  const indisponivel = !iaConfigurada() ? "O assistente está indisponível no momento (IA não configurada)." : !config.ligado ? "O assistente do professor não está ligado nesta área." : null;
  const c = q.membro.id && conversaId ? await conversaDoMembro(q.criador.id, q.membro.id, conversaId) : null;
  return { nome: config.nome, ligado: config.ligado, indisponivel, conversa: c ? paraChat(c) : null };
}
