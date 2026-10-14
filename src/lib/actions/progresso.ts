"use server";

import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { avaliarMembro, exigirSessao, MSG_SEM_PERMISSAO } from "@/lib/auth/autorizacao";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { receberBatida } from "@/lib/progresso/batida";
import { concluirManualmente } from "@/lib/progresso/registrar";
import { podeConcluirManual } from "@/lib/progresso/regras";
import { acessoDaAula } from "@/lib/video/acesso-aula";
import { idSchema } from "@/lib/validators/progresso";

/**
 * Progresso do player (RN-118). Batida = a mesma porta do beacon (`receberBatida`); concluir =
 * botão "Concluir e avançar". Criador e membro vêm da sessão do HOST, nunca do corpo.
 */

const MSG_AULA_NAO_ENCONTRADA = "Aula não encontrada.";

async function membroDoHost() {
  const s = await exigirSessao();
  const m = await avaliarMembro(s, TODOS_OS_MEMBROS);
  if (!m) throw new ErroDeNegocio(MSG_SEM_PERMISSAO);
  return { s, m };
}

/**
 * Batida do player a cada ~10 s (corpo: `esquemaBatida`). Devolve o progresso gravado ou
 * `ignorada` (limite de 1 batida/3 s por aula, teto de segundos, aula sem duração).
 */
export async function acaoRegistrarProgresso(entrada: unknown) {
  return executar(async () => {
    const { s, m } = await membroDoHost();
    const r = await receberBatida(
      { criadorId: m.criador.id, membroId: m.membro.id, usuarioId: m.usuario.id, papel: m.membro.papel, sessaoId: s.sessaoId },
      entrada,
    );
    if (r.situacao === "recusada") throw new ErroDeNegocio(r.motivo === "nao-encontrada" ? MSG_AULA_NAO_ENCONTRADA : MSG_SEM_PERMISSAO);
    return r;
  });
}

/** "Concluir e avançar": idempotente; a próxima aula a tela já tem (`aulaParaPlayer().proxima`). */
export async function acaoConcluirAula(entrada: unknown) {
  return executar(async () => {
    const { aulaId } = z.strictObject({ aulaId: idSchema }).parse(entrada);
    const { m } = await membroDoHost();
    if (!m.membro.id) throw new ErroDeNegocio("Conclusão vale só para quem é membro desta área.");
    const acesso = await acessoDaAula(m.criador.id, aulaId, { papel: m.membro.papel, membroId: m.membro.id });
    if (!acesso) throw new ErroDeNegocio(MSG_AULA_NAO_ENCONTRADA);
    if (!acesso.pode) throw new ErroDeNegocio(MSG_SEM_PERMISSAO);
    if (!podeConcluirManual({ id: acesso.produtoId })) throw new ErroDeNegocio("Este curso só conclui a aula assistindo até o fim.");
    const p = await concluirManualmente({ criadorId: m.criador.id, membroId: m.membro.id, usuarioId: m.usuario.id, aulaId });
    if (!p) throw new ErroDeNegocio(MSG_AULA_NAO_ENCONTRADA);
    return p;
  });
}
