import type { SituacaoVideo } from "@/lib/db/schema/_enums";
import type { MotivoBloqueio } from "@/lib/video/acesso";

/**
 * Textos PUROS da página da aula (testados): por que a aula não toca e o que fazer. A REGRA da
 * trava é `motivoDoBloqueio` (src/lib/video/acesso.ts); aqui só a explicação para o aluno.
 */

export type IconeAviso = "cadeado" | "calendario" | "ampulheta" | "video" | "alerta";

export interface AvisoAula {
  icone: IconeAviso;
  titulo: string;
  descricao: string;
  acao?: { rotulo: string; href: string };
}

const BRASILIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "20/10/2026 às 08:00" (horário de Brasília). */
export function dataDeLiberacao(d: Date): string {
  const partes = Object.fromEntries(BRASILIA.formatToParts(d).map((p) => [p.type, p.value]));
  return `${partes.day}/${partes.month}/${partes.year} às ${partes.hour}:${partes.minute}`;
}

export interface ContextoBloqueio {
  produto: { titulo: string; slug: string };
  liberaEm: Date | null;
  preRequisito: { id: string; numero: string; titulo: string } | null;
  /** Avaliação do módulo anterior que trava esta aula (motivo AVALIACAO, RN-125). */
  avaliacaoPendente?: { id: string; titulo: string } | null;
}

export function avisoDeBloqueio(motivo: MotivoBloqueio, c: ContextoBloqueio): AvisoAula {
  const curso = { rotulo: "Ver o curso", href: `/cursos/${c.produto.slug}` };
  switch (motivo) {
    case "MATRICULA":
      return {
        icone: "cadeado",
        titulo: "Aula exclusiva para alunos matriculados",
        descricao: `Esta aula faz parte de “${c.produto.titulo}”. Fale com a equipe para liberar o seu acesso.`,
        acao: curso,
      };
    case "LIBERACAO":
      return {
        icone: "calendario",
        titulo: "Esta aula ainda não foi liberada",
        descricao: c.liberaEm ? `Ela fica disponível em ${dataDeLiberacao(c.liberaEm)}.` : "Ela fica disponível em breve.",
        acao: curso,
      };
    case "PRE_REQUISITO":
      return c.preRequisito
        ? {
            icone: "cadeado",
            titulo: "Conclua a aula anterior primeiro",
            descricao: `Para abrir esta aula, conclua a aula ${c.preRequisito.numero} · ${c.preRequisito.titulo}.`,
            acao: { rotulo: `Ir para a aula ${c.preRequisito.numero}`, href: `/aula/${c.preRequisito.id}` },
          }
        : { icone: "cadeado", titulo: "Conclua a aula anterior primeiro", descricao: "Esta aula abre depois que você concluir a aula exigida.", acao: curso };
    case "AVALIACAO":
      return c.avaliacaoPendente
        ? {
            icone: "cadeado",
            titulo: "Seja aprovado na avaliação do módulo anterior",
            descricao: `Esta aula abre depois da sua aprovação em “${c.avaliacaoPendente.titulo}”.`,
            acao: { rotulo: "Ir para a avaliação", href: `/avaliacoes/${c.avaliacaoPendente.id}` },
          }
        : { icone: "cadeado", titulo: "Seja aprovado na avaliação do módulo anterior", descricao: "Esta aula abre depois da sua aprovação na avaliação exigida.", acao: curso };
    default:
      return { icone: "cadeado", titulo: "Aula indisponível", descricao: "Esta aula não está disponível para você agora." };
  }
}

/** Aviso no lugar do player quando o vídeo não pode tocar (`null` = vídeo PRONTO). */
export function avisoDoVideo(video: { situacao: SituacaoVideo } | null): AvisoAula | null {
  if (!video) return { icone: "video", titulo: "Esta aula ainda não tem vídeo", descricao: "O vídeo será publicado em breve. Enquanto isso, veja a descrição e os materiais abaixo." };
  if (video.situacao === "PRONTO") return null;
  if (video.situacao === "FALHOU") return { icone: "alerta", titulo: "Vídeo indisponível no momento", descricao: "A equipe já foi avisada pelo painel. Tente de novo mais tarde." };
  return { icone: "ampulheta", titulo: "O vídeo está sendo preparado", descricao: "Isso leva alguns minutos depois do envio. Volte daqui a pouco." };
}

/** "Módulo 3 · Aula 2" a partir de "3.2". */
export function eyebrowDaAula(numero: string): string {
  const [m, a] = numero.split(".");
  return `Módulo ${m} · Aula ${a}`;
}

