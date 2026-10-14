import { PAPEIS_CRIADOR, type PapelCriador, type PapelPlataforma } from "@/lib/db/schema/_enums";

/**
 * QUEM PODE GERAR LINK DE SENHA PARA QUEM — regra pura (sem banco), travada por teste.
 *
 * Com o link na tela, quem gera consegue entrar na conta. Como a identidade e GLOBAL (a
 * mesma senha vale em todos os criadores), o link e uma chave de todas as areas da pessoa.
 * Por isso:
 *  - ninguem gera para si (troca a propria senha em Conta > Seguranca);
 *  - SUPER_ADMIN gera para qualquer outra conta (a de outro SUPER_ADMIN continua exigindo o TOTP);
 *  - equipe do criador (DONO/ADMIN) so para membro DESTE criador, com papel ABAIXO do seu
 *    (DONO -> ADMIN/ALUNO; ADMIN -> ALUNO), e so se a pessoa nao participar de OUTRO criador
 *    nem for SUPER_ADMIN — senao a equipe de A abriria a conta da pessoa em B.
 */

export interface AtorDoLink {
  id: string;
  superAdmin: boolean;
  /** Criador da requisicao (nulo no apex). */
  criadorId: string | null;
  /** Papel efetivo no criador da requisicao. */
  papel: PapelCriador | null;
}

export interface AlvoDoLink {
  id: string;
  papelPlataforma: PapelPlataforma;
  /** Vinculos VIVOS (ativos ou inativos). */
  vinculos: { criadorId: string; papel: PapelCriador }[];
}

/** `null` = pode. `"sem-permissao"` = recusa generica (vai para a tela como "Sem permissão"). */
export function motivoParaNaoGerarLink(ator: AtorDoLink, alvo: AlvoDoLink): string | null {
  if (ator.id === alvo.id) return "Para trocar a sua senha, use Conta › Segurança.";
  if (ator.superAdmin) return null;
  if (!ator.criadorId || (ator.papel !== "DONO" && ator.papel !== "ADMIN")) return "sem-permissao";
  if (alvo.papelPlataforma === "SUPER_ADMIN") return "sem-permissao";
  const aqui = alvo.vinculos.find((v) => v.criadorId === ator.criadorId);
  if (!aqui) return "Esta pessoa não é membro desta área.";
  if (alvo.vinculos.some((v) => v.criadorId !== ator.criadorId)) {
    return "Esta pessoa também participa de outra área. Peça o link à equipe da plataforma.";
  }
  if (PAPEIS_CRIADOR.indexOf(aqui.papel) <= PAPEIS_CRIADOR.indexOf(ator.papel)) {
    return "Você só pode gerar link para papéis abaixo do seu.";
  }
  return null;
}
