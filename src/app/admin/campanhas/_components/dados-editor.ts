import "server-only";
import type { CriadorDaRequisicao } from "@/lib/criador/area";
import { urlDaPlataforma } from "@/lib/criador/area";
import { marcaDaArea } from "@/lib/email/modelo";
import { listarModelos } from "@/lib/marketing/consultas";
import { provedorEmail } from "@/lib/marketing/provedor";
import { produtosParaMatricular } from "@/lib/matriculas/consultas";
import { listarGrupos, listarTags } from "@/lib/membros/consultas";

/** O que os editores (campanha e modelo) recebem do servidor: marca do e-mail, opções de público e modelos. */
export async function dadosDoEditor(criador: CriadorDaRequisicao) {
  const [grupos, tags, cursos, modelos] = await Promise.all([listarGrupos(criador.id), listarTags(criador.id), produtosParaMatricular(criador.id), listarModelos(criador.id)]);
  return {
    marca: marcaDaArea(criador, urlDaPlataforma()),
    emailLigado: provedorEmail().configurado(),
    opcoes: {
      grupos: grupos.map((g) => ({ id: g.id, nome: g.nome })),
      tags: tags.map((t) => ({ id: t.id, nome: t.nome })),
      cursos: cursos.map((c) => ({ id: c.id, nome: c.titulo })),
    },
    modelos: modelos.map((m) => ({ id: m.id, nome: m.nome, conteudo: m.conteudo })),
  };
}

export type DadosDoEditor = Awaited<ReturnType<typeof dadosDoEditor>>;
