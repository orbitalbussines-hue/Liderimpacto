/**
 * Tabelas do CSV de cada aba do Analytics (PURO; testado em regras.test.ts). Decisão: o CSV é
 * só AGREGADO — nenhuma linha por aluno, nenhum nome, e-mail ou id de pessoa; ids saem só de
 * curso/aula/avaliação (servem para cruzar planilhas). Taxas em fração 0..1 (a planilha formata).
 */
import type { CursoConteudo, DiaAnalytics, HorasAssistidas, KpisAnalytics } from "./consultas";
import type { AvaliacaoAnalytics } from "./consultas-avaliacoes";
import { abandono, gerarCsv, taxa, type AulaAnalytics, type Coorte } from "./regras";

/** `porSemana`: a série veio agrupada por semana (período > 92 dias); a 1ª coluna vira `semana_inicio`. */
export function csvVisaoGeral(k: KpisAnalytics, horas: HorasAssistidas, serie: readonly DiaAnalytics[], comCurso: boolean, porSemana = false): string {
  const indicadores = gerarCsv(
    ["indicador", "periodo", "periodo_anterior", "observacao"],
    [
      ["alunos_ativos", k.ativos, k.ativosAnt, comCurso ? "com filtro de curso: alunos com batida no curso no período; anterior indisponível" : "alunos distintos com dia de atividade de aula"],
      ["horas_assistidas", Math.round((horas.segundos / 3600) * 100) / 100, horas.segundosAnt === null ? null : Math.round((horas.segundosAnt / 3600) * 100) / 100, horas.recorte === "acumulado" ? "ACUMULADO desde o início (com filtro de curso não há segundos por dia)" : "segundos únicos novos por dia (contados desde 14/10/2026)"],
      ["aulas_concluidas", k.aulas, k.aulasAnt, ""],
      ["taxa_conclusao_cursos_hoje", taxa(k.validasConcluidas, k.validas), null, `${k.validasConcluidas} de ${k.validas} matrículas valendo`],
      ["cursos_concluidos", k.cursosConcluidos, k.cursosConcluidosAnt, ""],
      ["taxa_aprovacao_avaliacoes", taxa(k.aprovados, k.avaliados), taxa(k.aprovadosAnt, k.avaliadosAnt), "pares aluno x avaliação"],
    ],
  );
  const dias = gerarCsv(
    [porSemana ? "semana_inicio" : "dia", "alunos_ativos_todos_os_cursos", "visualizacoes"],
    serie.map((d) => [d.dia, d.alunos, d.visualizacoes]),
  );
  return `${indicadores}\r\n${dias.replace(/^﻿/, "")}`;
}

export function csvConteudo(cursos: readonly CursoConteudo[], aulas: readonly AulaAnalytics[]): string {
  return gerarCsv(
    ["nivel", "curso_id", "curso", "aula_id", "aula_numero", "aula", "iniciaram", "concluiram", "taxa_conclusao", "pararam_antes_de_90", "taxa_abandono", "tempo_medio_seg"],
    [
      ...cursos.map((c) => ["curso", c.produtoId, c.curso, null, null, null, c.iniciaram, c.concluiram, taxa(c.concluiram, c.iniciaram), null, null, Math.round(c.tempoMedioSeg)] as const),
      ...aulas.map((a) => ["aula", a.produtoId, a.curso, a.aulaId, a.numero, a.titulo, a.iniciaram, a.concluiram, taxa(a.concluiram, a.iniciaram), a.pararam, abandono(a), Math.round(a.tempoMedioSeg)] as const),
    ],
  );
}

export function csvRetencao(coortes: readonly Coorte[]): string {
  const n = coortes.length;
  return gerarCsv(
    ["semana_de_entrada", "alunos", "amostra_pequena", ...Array.from({ length: n }, (_, k) => `semana_${k}`)],
    coortes.map((c) => [c.semana, c.tamanho, c.pequena ? "sim" : "nao", ...c.celulas.map((x) => (x === null ? null : x.taxa))]),
  );
}

export function csvAvaliacoes(avs: readonly AvaliacaoAnalytics[]): string {
  const questoes = [1, 2, 3].flatMap((i) => [`questao_${i}`, `erros_${i}`, `respostas_${i}`]);
  return gerarCsv(
    ["avaliacao_id", "curso", "avaliacao", "nota_minima", "tentativas", "alunos", "aprovados", "taxa_aprovacao", "nota_media", ...questoes],
    avs.map((a) => [
      a.avaliacaoId, a.curso, a.titulo, a.notaMinima, a.tentativas, a.alunos, a.aprovados, taxa(a.aprovados, a.alunos), a.notaMedia,
      ...[0, 1, 2].flatMap((i) => {
        const q = a.questoes[i];
        return q ? [q.enunciado === null ? "(questão removida)" : `${q.ordem}. ${q.enunciado}`, q.erros, q.respostas] : [null, null, null];
      }),
    ]),
  );
}
