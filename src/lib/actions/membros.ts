"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro, MSG_SEM_PERMISSAO } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { db } from "@/lib/db";
import { criadores_grupos, criadores_grupos_membros } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { lerCsvDeMembros, MAX_BYTES_CSV, type ErroCsv } from "@/lib/membros/csv";
import { enviarPrimeiroAcesso, linkDePrimeiroAcesso, MSG_CONTA_EXISTENTE, type LinkNaTela } from "@/lib/membros/primeiro-acesso";
import { papeisQuePodeCadastrar } from "@/lib/membros/regras";
import { definirGruposDoMembro, vincularPessoa, violouUnico } from "@/lib/membros/vinculos";
import { cadastroMembroSchema } from "@/lib/validators/membros";
import { webhookMembrosCadastrados } from "@/lib/webhooks/emitir";

/**
 * Cadastro e importacao de membros do criador do HOST (RN-104). DONO e ADMIN; ADMIN so
 * cadastra ALUNO. E-mail que ja existe na plataforma reaproveita a identidade (mensagem
 * neutra); conta nova nasce sem senha e o link de primeiro acesso volta para a tela.
 */

export async function acaoCadastrarMembro(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador, membro } = await exigirMembro(EQUIPE);
    const e = cadastroMembroSchema.parse(entrada);
    if (!papeisQuePodeCadastrar(membro.papel).includes(e.papel)) throw new ErroDeNegocio(MSG_SEM_PERMISSAO);

    const vinculo = await db
      .transaction(async (tx) => {
        const v = await vincularPessoa(tx, { criadorId: criador.id, autorId: usuario.id, nome: e.nome, email: e.email, papel: e.papel });
        if (v.tipo === "ja-membro") throw new ErroDeNegocio("Este e-mail já é membro desta área.");
        if (e.grupoIds.length > 0) {
          const grupos = await definirGruposDoMembro(tx, { criadorId: criador.id, membroId: v.membroId, grupoIds: e.grupoIds, autorId: usuario.id });
          await registrarAuditoria(tx, {
            userId: usuario.id,
            criadorId: criador.id,
            acao: "atualizar",
            tabela: "criadores_grupos_membros",
            registroId: v.membroId,
            detalhes: `Colocou ${e.email} nos grupos: ${grupos.depois.join(", ")}`,
            dadosNovos: { grupos: grupos.depois },
          });
        }
        return v;
      })
      .catch((erro: unknown) => {
        if (violouUnico(erro)) throw new ErroDeNegocio("Este e-mail acabou de ser cadastrado por outra pessoa. Recarregue a página.");
        throw erro;
      });

    await webhookMembrosCadastrados(criador.id, [vinculo.membroId], usuario.id); // depois do commit; nunca lança (RN-204)
    if (!vinculo.identidadeNova) return { link: null, emailEnviado: false, aviso: MSG_CONTA_EXISTENTE };
    const link = await linkDePrimeiroAcesso(vinculo.usuarioId, criador, usuario.id, "Primeiro acesso (cadastro de membro)");
    const emailEnviado = await enviarPrimeiroAcesso(e.email, e.nome, criador, link);
    return { link, emailEnviado, aviso: null };
  });
}

export interface ResultadoImportacao {
  criados: number;
  reaproveitados: number;
  jaMembros: number;
  gruposCriados: string[];
  invalidas: ErroCsv[];
  links: (LinkNaTela & { nome: string; email: string })[];
}

/**
 * Importacao CSV (`nome,email,grupo`), sempre como ALUNO. O servidor le o arquivo DE NOVO (a
 * previa do cliente nao vale): linha invalida nao grava nada; as validas entram numa transacao
 * so (falhou uma, nenhuma entra). Grupo que nao existe e criado como Turma.
 */
export async function acaoImportarMembros(entrada: unknown) {
  return executar(async (): Promise<ResultadoImportacao> => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const { csv } = z.strictObject({ csv: z.string().max(MAX_BYTES_CSV, "Arquivo maior que 1 MB.") }).parse(entrada);
    const leitura = lerCsvDeMembros(csv);
    if (!leitura.ok) throw new ErroDeNegocio(leitura.erro);
    if (leitura.validas.length === 0) throw new ErroDeNegocio("Nenhuma linha válida para importar.");

    const novos: { usuarioId: string; nome: string; email: string }[] = [];
    let reaproveitados = 0;
    let jaMembros = 0;
    const gruposCriados: string[] = [];
    const cadastrados: string[] = [];

    await db
      .transaction(async (tx) => {
        const existentes = await tx
          .select({ id: criadores_grupos.id, nome: criadores_grupos.nome })
          .from(criadores_grupos)
          .where(and(eq(criadores_grupos.criador_id, criador.id), vivos(criadores_grupos)));
        const grupos = new Map(existentes.map((g) => [g.nome.toLowerCase(), g.id]));

        for (const { dados } of leitura.validas) {
          const v = await vincularPessoa(tx, { criadorId: criador.id, autorId: usuario.id, nome: dados.nome, email: dados.email, papel: "ALUNO" });
          if (v.tipo === "ja-membro") {
            jaMembros++;
            continue;
          }
          cadastrados.push(v.membroId);
          if (v.identidadeNova) novos.push({ usuarioId: v.usuarioId, nome: dados.nome, email: dados.email });
          else reaproveitados++;
          if (!dados.grupo) continue;
          let grupoId = grupos.get(dados.grupo.toLowerCase());
          if (!grupoId) {
            const [g] = await tx
              .insert(criadores_grupos)
              .values({ criador_id: criador.id, nome: dados.grupo, tipo: "TURMA", modified_by: usuario.id })
              .returning({ id: criadores_grupos.id });
            grupoId = g.id;
            grupos.set(dados.grupo.toLowerCase(), grupoId);
            gruposCriados.push(dados.grupo);
            await registrarAuditoria(tx, {
              userId: usuario.id,
              criadorId: criador.id,
              acao: "criar",
              tabela: "criadores_grupos",
              registroId: grupoId,
              detalhes: `Criou o grupo "${dados.grupo}" (Turma) pela importação CSV`,
              dadosNovos: { nome: dados.grupo, tipo: "TURMA" },
            });
          }
          await tx
            .insert(criadores_grupos_membros)
            .values({ criador_id: criador.id, grupo_id: grupoId, membro_id: v.membroId, modified_by: usuario.id });
        }
        await registrarAuditoria(tx, {
          userId: usuario.id,
          criadorId: criador.id,
          acao: "criar",
          tabela: "criadores_membros",
          registroId: null,
          detalhes: `Importação CSV: ${novos.length} contas novas, ${reaproveitados} contas existentes vinculadas, ${jaMembros} já eram membros, ${leitura.erros.length} linhas inválidas ignoradas`,
          dadosNovos: { linhasInvalidas: leitura.erros.map((x) => x.numero) },
        });
      })
      .catch((erro: unknown) => {
        if (violouUnico(erro)) throw new ErroDeNegocio("Outra pessoa alterou membros ou grupos durante a importação. Nada foi gravado; tente de novo.");
        throw erro;
      });

    await webhookMembrosCadastrados(criador.id, cadastrados, usuario.id); // depois do commit; nunca lança (RN-204)
    // ponytail: um link por conta nova, em sequencia (4 consultas cada); fila se passar de 1000 linhas.
    const links: ResultadoImportacao["links"] = [];
    for (const n of novos) {
      const link = await linkDePrimeiroAcesso(n.usuarioId, criador, usuario.id, "Primeiro acesso (importação CSV)");
      links.push({ ...link, nome: n.nome, email: n.email });
    }
    return { criados: novos.length, reaproveitados, jaMembros, gruposCriados, invalidas: leitura.erros, links };
  });
}
