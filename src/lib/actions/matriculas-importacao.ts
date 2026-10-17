"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { db, type Transacao } from "@/lib/db";
import { criadores_grupos, criadores_grupos_membros } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { produtosParaMatricular } from "@/lib/matriculas/consultas";
import { lerCsvDeMatriculas, resolverProdutos } from "@/lib/matriculas/csv";
import { contagemVazia, matricular, somar, type ContagemMatriculas } from "@/lib/matriculas/servico";
import { MAX_BYTES_CSV, type ErroCsv } from "@/lib/membros/csv";
import { enviarPrimeiroAcesso, linkDePrimeiroAcesso, type LinkNaTela } from "@/lib/membros/primeiro-acesso";
import { vincularPessoa, violouUnico } from "@/lib/membros/vinculos";
import { notificarMatriculas } from "@/lib/notificacoes/gerar";

/**
 * Importacao CSV de matriculas (`nome,email,produto,expira_em,grupo`), RN-117. DONO e ADMIN.
 * Mesmo fluxo da importacao de membros (RN-106): o servidor le o arquivo DE NOVO; linha invalida
 * (inclusive produto que nao e DESTE criador) nao grava nada; as validas entram numa transacao so.
 * E-mail sem vinculo vira ALUNO (conta nova sem senha, link de primeiro acesso na tela e por
 * e-mail com SMTP; conta existente reaproveitada com mensagem neutra) e e matriculado.
 */

export interface ResultadoImportacaoMatriculas extends ContagemMatriculas {
  contasNovas: number;
  reaproveitados: number;
  jaMembros: number;
  gruposCriados: string[];
  invalidas: ErroCsv[];
  links: (LinkNaTela & { nome: string; email: string })[];
  emailsEnviados: number;
}

/** Coloca o membro no grupo (pelo nome; inexistente vira Turma). Devolve o nome se criou o grupo. */
async function porNoGrupo(tx: Transacao, p: { criadorId: string; autorId: string; membroId: string; nome: string; grupos: Map<string, string> }) {
  let grupoId = p.grupos.get(p.nome.toLowerCase());
  let criado: string | null = null;
  if (!grupoId) {
    const [g] = await tx
      .insert(criadores_grupos)
      .values({ criador_id: p.criadorId, nome: p.nome, tipo: "TURMA", modified_by: p.autorId })
      .returning({ id: criadores_grupos.id });
    grupoId = g.id;
    p.grupos.set(p.nome.toLowerCase(), grupoId);
    criado = p.nome;
    await registrarAuditoria(tx, {
      userId: p.autorId,
      criadorId: p.criadorId,
      acao: "criar",
      tabela: "criadores_grupos",
      registroId: grupoId,
      detalhes: `Criou o grupo "${p.nome}" (Turma) pela importação CSV de matrículas`,
      dadosNovos: { nome: p.nome, tipo: "TURMA" },
    });
  }
  const [ja] = await tx
    .select({ id: criadores_grupos_membros.id })
    .from(criadores_grupos_membros)
    .where(and(eq(criadores_grupos_membros.grupo_id, grupoId), eq(criadores_grupos_membros.membro_id, p.membroId), vivos(criadores_grupos_membros)));
  if (!ja) {
    await tx.insert(criadores_grupos_membros).values({ criador_id: p.criadorId, grupo_id: grupoId, membro_id: p.membroId, modified_by: p.autorId });
  }
  return criado;
}

export async function acaoImportarMatriculas(entrada: unknown) {
  return executar(async (): Promise<ResultadoImportacaoMatriculas> => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const { csv } = z.strictObject({ csv: z.string().max(MAX_BYTES_CSV, "Arquivo maior que 1 MB.") }).parse(entrada);
    const agora = new Date();
    const leitura = lerCsvDeMatriculas(csv, agora);
    if (!leitura.ok) throw new ErroDeNegocio(leitura.erro);
    const ligadas = resolverProdutos(leitura.validas, await produtosParaMatricular(criador.id));
    const invalidas = [...leitura.erros, ...ligadas.erros].sort((a, b) => a.numero - b.numero);
    if (ligadas.ok.length === 0) throw new ErroDeNegocio("Nenhuma linha válida para importar.");

    const contagem = contagemVazia();
    const novos = new Map<string, { usuarioId: string; nome: string; email: string }>();
    const membroPorEmail = new Map<string, string>();
    let reaproveitados = 0;
    let jaMembros = 0;
    const gruposCriados: string[] = [];
    const novasMatriculas: string[] = [];

    await db
      .transaction(async (tx) => {
        const existentes = await tx
          .select({ id: criadores_grupos.id, nome: criadores_grupos.nome })
          .from(criadores_grupos)
          .where(and(eq(criadores_grupos.criador_id, criador.id), vivos(criadores_grupos)));
        const grupos = new Map(existentes.map((g) => [g.nome.toLowerCase(), g.id]));

        for (const { dados, produto } of ligadas.ok) {
          let membroId = membroPorEmail.get(dados.email);
          if (!membroId) {
            const v = await vincularPessoa(tx, { criadorId: criador.id, autorId: usuario.id, nome: dados.nome, email: dados.email, papel: "ALUNO" });
            membroId = v.membroId;
            membroPorEmail.set(dados.email, membroId);
            if (v.tipo === "ja-membro") jaMembros++;
            else if (v.identidadeNova) novos.set(dados.email, { usuarioId: v.usuarioId, nome: dados.nome, email: dados.email });
            else reaproveitados++;
          }
          if (dados.grupo) {
            const criado = await porNoGrupo(tx, { criadorId: criador.id, autorId: usuario.id, membroId, nome: dados.grupo, grupos });
            if (criado) gruposCriados.push(criado);
          }
          const r = await matricular(tx, {
            criadorId: criador.id,
            membroId,
            produtoId: produto.id,
            origem: "IMPORTACAO",
            expiraEm: dados.expira_em,
            autor: usuario.id,
            agora,
          });
          somar(contagem, r.resultado);
          if (r.resultado !== "ja-existia") novasMatriculas.push(r.matriculaId);
        }
        await registrarAuditoria(tx, {
          userId: usuario.id,
          criadorId: criador.id,
          acao: "criar",
          tabela: "produtos_matriculas",
          registroId: null,
          detalhes: `Importação CSV de matrículas: ${contagem.criadas} criadas, ${contagem.reativadas} reativadas, ${contagem.jaExistiam} já existiam; ${novos.size} contas novas, ${reaproveitados} contas existentes vinculadas; ${invalidas.length} linhas inválidas ignoradas`,
          dadosNovos: { linhasInvalidas: invalidas.map((x) => x.numero) },
        });
      })
      .catch((erro: unknown) => {
        if (violouUnico(erro)) throw new ErroDeNegocio("Outra pessoa alterou membros, grupos ou matrículas durante a importação. Nada foi gravado; tente de novo.");
        throw erro;
      });

    // Depois do commit; nunca lança (RN-134).
    await notificarMatriculas(criador.id, novasMatriculas, usuario.id);

    // ponytail: um link (e um e-mail) por conta nova, em sequencia; fila se passar de 1000 linhas.
    const links: ResultadoImportacaoMatriculas["links"] = [];
    let emailsEnviados = 0;
    for (const n of novos.values()) {
      const link = await linkDePrimeiroAcesso(n.usuarioId, criador, usuario.id, "Primeiro acesso (importação CSV de matrículas)");
      links.push({ ...link, nome: n.nome, email: n.email });
      if (await enviarPrimeiroAcesso(n.email, n.nome, criador, link)) emailsEnviados++;
    }
    return { ...contagem, contasNovas: novos.size, reaproveitados, jaMembros, gruposCriados, invalidas, links, emailsEnviados };
  });
}
