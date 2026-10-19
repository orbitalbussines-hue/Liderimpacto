import type { AbaTabela } from "@/components/admin/pagina-tabela";
import type { TomSelo } from "@/components/admin/tabela-tipos";
import { GATILHO_LEAD, GATILHOS_COM_CURSO, GATILHOS_COM_DIAS, type GatilhoAutomacao, type SituacaoEnvio, type SituacaoExecucao } from "@/lib/db/schema/_enums";
import { MOTIVOS_ENVIO } from "@/lib/marketing/regras";

/** Peças puras das telas de Automações (RN-224): textos simples para quem não é técnico. */

export const ABAS_AUTOMACOES: AbaTabela[] = [
  { rotulo: "Automações", href: "/admin/automacoes" },
  { rotulo: "Histórico", href: "/admin/automacoes/historico" },
];

export const pedeCurso = (g: GatilhoAutomacao) => (GATILHOS_COM_CURSO as readonly string[]).includes(g);
export const pedeDias = (g: GatilhoAutomacao) => (GATILHOS_COM_DIAS as readonly string[]).includes(g);
/** Gatilho de lead: filtro por página/funil e o alvo é o lead (não o aluno). */
export const pedeOrigem = (g: GatilhoAutomacao) => g === GATILHO_LEAD;

/** Opções do "Quando..." no formulário (a frase completa sai de `descreverGatilho`). */
export const OPCOES_GATILHO: { valor: GatilhoAutomacao; rotulo: string }[] = [
  { valor: "MEMBRO_CADASTRADO", rotulo: "Alguém é cadastrado na área" },
  { valor: "MATRICULA_CRIADA", rotulo: "Alguém é matriculado em um curso" },
  { valor: "AULA_CONCLUIDA", rotulo: "Alguém conclui uma aula" },
  { valor: "CURSO_CONCLUIDO", rotulo: "Alguém conclui um curso" },
  { valor: "CERTIFICADO_EMITIDO", rotulo: "Alguém recebe um certificado" },
  { valor: "VOUCHER_RESGATADO", rotulo: "Alguém resgata um voucher" },
  { valor: "INATIVIDADE", rotulo: "Alguém fica um tempo sem entrar" },
  { valor: "NUNCA_ACESSOU", rotulo: "Alguém se cadastra e nunca entra" },
  { valor: "LEAD_CAPTURADO", rotulo: "Alguém se cadastra numa página (lead)" },
];

const diasTexto = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

/** "Quando alguém conclui o curso X" / "Quando alguém fica 14 dias sem entrar". `origem` = filtro do gatilho de lead. */
export function descreverGatilho(g: GatilhoAutomacao, curso: string | null, dias: number | null, origem: { pagina: string | null; funil: string | null } = { pagina: null, funil: null }): string {
  const n = diasTexto(dias ?? 1);
  switch (g) {
    case "MEMBRO_CADASTRADO":
      return "Quando alguém é cadastrado na área";
    case "MATRICULA_CRIADA":
      return curso ? `Quando alguém é matriculado em ${curso}` : "Quando alguém é matriculado em qualquer curso";
    case "AULA_CONCLUIDA":
      return curso ? `Quando alguém conclui uma aula de ${curso}` : "Quando alguém conclui qualquer aula";
    case "CURSO_CONCLUIDO":
      return curso ? `Quando alguém conclui o curso ${curso}` : "Quando alguém conclui qualquer curso";
    case "CERTIFICADO_EMITIDO":
      return curso ? `Quando alguém recebe o certificado de ${curso}` : "Quando alguém recebe qualquer certificado";
    case "VOUCHER_RESGATADO":
      return "Quando alguém resgata um voucher";
    case "INATIVIDADE":
      return `Quando alguém fica ${n} sem entrar`;
    case "NUNCA_ACESSOU":
      return `Quando alguém se cadastra e não entra em ${n}`;
    case "LEAD_CAPTURADO": {
      const funil = origem.funil ? ` pelo funil ${origem.funil}` : "";
      if (origem.pagina) return `Quando alguém se cadastra na página ${origem.pagina}${funil}`;
      return origem.funil ? `Quando alguém se cadastra numa página do funil ${origem.funil}` : "Quando alguém se cadastra em qualquer página";
    }
  }
}

export type UnidadeAtraso = "minutos" | "horas" | "dias";
export const MINUTOS_POR: Record<UnidadeAtraso, number> = { minutos: 1, horas: 60, dias: 1440 };
export const MAX_ATRASO_MINUTOS = 43_200;

/** Minutos gravados → a maior unidade exata (90 min fica em minutos; 2880 vira 2 dias). */
export function atrasoEmUnidade(minutos: number): { valor: number; unidade: UnidadeAtraso } {
  if (minutos > 0 && minutos % 1440 === 0) return { valor: minutos / 1440, unidade: "dias" };
  if (minutos > 0 && minutos % 60 === 0) return { valor: minutos / 60, unidade: "horas" };
  return { valor: minutos, unidade: "minutos" };
}

/** "Na hora" / "2 dias depois" / "1 hora depois". */
export function descreverAtraso(minutos: number): string {
  if (minutos <= 0) return "Na hora";
  const { valor, unidade } = atrasoEmUnidade(minutos);
  const nome = unidade === "dias" ? (valor === 1 ? "dia" : "dias") : unidade === "horas" ? (valor === 1 ? "hora" : "horas") : valor === 1 ? "minuto" : "minutos";
  return `${valor} ${nome} depois`;
}

/** Referência gravada na execução → o que aconteceu, em português. */
export function descreverReferencia(referencia: string, dataCurta: (d: Date) => string): string {
  if (referencia === "cadastro") return "Cadastro na área";
  if (referencia === "nunca-acessou") return "Nunca entrou";
  if (referencia === "captura") return "Cadastro numa página";
  const tipo = referencia.split(":")[0];
  if (tipo === "inativo") {
    const d = new Date(referencia.slice("inativo:".length));
    return Number.isNaN(d.getTime()) ? "Sem entrar" : `Sem entrar desde ${dataCurta(d)}`;
  }
  return { matricula: "Matrícula", aula: "Aula concluída", curso: "Curso concluído", certificado: "Certificado emitido", voucher: "Voucher resgatado" }[tipo] ?? "Evento";
}

export interface LinhaExecucao {
  situacao: SituacaoExecucao;
  motivo: string | null;
  tagAplicada: boolean;
  envioSituacao: SituacaoEnvio | null;
  envioMotivo: string | null;
}

/** Resultado da execução numa palavra (selo) + detalhe opcional. */
export function resultadoDaExecucao(l: LinhaExecucao): { texto: string; tom: TomSelo; detalhe?: string } {
  if (l.situacao === "AGENDADA") return { texto: "Agendado", tom: "accent" };
  if (l.situacao === "IGNORADA") return { texto: "Ignorado", tom: "neutro", detalhe: l.motivo ?? undefined };
  if (l.situacao === "FALHOU") return { texto: "Falhou", tom: "warn", detalhe: l.motivo ?? undefined };
  if (!l.envioSituacao) return { texto: l.tagAplicada ? "Tag aplicada" : "Executado", tom: "ok" };
  switch (l.envioSituacao) {
    case "PENDENTE":
      return { texto: "Na fila", tom: "neutro", detalhe: "O e-mail sai assim que couber no limite de envio." };
    case "ENVIADO":
      return { texto: "Enviado", tom: "ok" };
    case "FALHOU":
      return { texto: "Falhou", tom: "warn", detalhe: l.envioMotivo ?? undefined };
    case "IGNORADO":
      return l.envioMotivo === MOTIVOS_ENVIO.DESCADASTRADO
        ? { texto: "Descadastrado", tom: "neutro", detalhe: "A pessoa pediu para não receber e-mails desta área." }
        : { texto: "Não enviado", tom: "neutro", detalhe: l.envioMotivo ?? undefined };
  }
}
