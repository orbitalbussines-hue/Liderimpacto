import type { Celula, Linha } from "@/components/admin/tabela-tipos";

/** Fixtures do catálogo (dados do protótipo v3). Nada disto vai para produção. */

const acoes = (nome: string): Celula => ({ tipo: "acoes", rotulo: `Ações de ${nome}` });

const PRODUTOS = [
  { titulo: "Como ganhar 50 mil por mês", codigo: 166, aulas: 0, alunos: 0, situacao: "Publicado", atualizacao: "23/08/26 · 13:31" },
  { titulo: "Editora Signature", codigo: 165, aulas: 3, alunos: 69, situacao: "Não listado", atualizacao: "28/05/26 · 19:21" },
  { titulo: "Líder de Impacto", codigo: 164, aulas: 28, alunos: 137, situacao: "Não listado", atualizacao: "12/05/26 · 00:48" },
] as const;

export const LINHAS_CONTEUDOS: Linha[] = PRODUTOS.map((p) => [
  { tipo: "capa", alt: `Capa de ${p.titulo}` },
  { tipo: "texto", texto: p.titulo, sub: `Cód. ${p.codigo} · ${p.aulas} aulas · ${p.alunos} alunos`, caixaAlta: true },
  { tipo: "texto", texto: "Curso online" },
  { tipo: "selo", texto: p.situacao, tom: p.situacao === "Publicado" ? "ok" : "warn" },
  { tipo: "data", texto: p.atualizacao },
  acoes(p.titulo),
]);

const MEMBROS = [
  ["Juliana Conti Elias", "contato@julianaconti.com.br", "25/08/26", "21/09/26"],
  ["Valéria Laranjeiras", "valerialaranjeiraspsi@gmail.com", "28/08/26", "Nunca"],
  ["Franciele Foschiera", "francifos1421@gmail.com", "28/08/26", "01/09/26"],
  ["Kesia Costa Leite", "kleitepsi@gmail.com", "02/09/26", "03/09/26"],
  ["Nayara de Souza Silveira", "psi.nayarasilveira@gmail.com", "04/09/26", "11/09/26"],
  ["Pamela Forziati", "pamelaforziati@hotmail.com", "04/09/26", "15/09/26"],
  ["Ana Maria Martins Camelo", "admanamartins@gmail.com", "08/09/26", "18/09/26"],
  ["Silvia Svensson Paulino", "silviasvensson07@gmail.com", "08/09/26", "12/09/26"],
] as const;

export const LINHAS_MEMBROS: Linha[] = MEMBROS.map(([nome, email, criado, ultimo]) => [
  { tipo: "membro", nome, email },
  { tipo: "etiqueta", texto: "Autores · Signature" },
  { tipo: "numeroDestaque", texto: ultimo === "Nunca" ? "—" : "1" },
  { tipo: "data", texto: criado },
  { tipo: "data", texto: ultimo },
  acoes(nome),
]);

const MATRICULAS = [
  { nome: "Vanessa Félix", email: "vanessa.felixts@gmail.com", inicio: "21/09/26", fim: "—", pct: 66 },
  { nome: "Layla Jatobá", email: "laylacjatoba@gmail.com", inicio: "21/09/26", fim: "21/09/26", pct: 100 },
  { nome: "Pamela Forziati", email: "pamelaforziati@hotmail.com", inicio: "—", fim: "—", pct: 0 },
] as const;

/** Matrículas: mostra a célula `barra`. */
export const LINHAS_MATRICULAS: Linha[] = MATRICULAS.map((m) => [
  { tipo: "membro", nome: m.nome, email: m.email },
  { tipo: "texto", texto: "Editora Signature" },
  { tipo: "data", texto: m.inicio },
  { tipo: "data", texto: m.fim },
  { tipo: "barra", valor: m.pct },
  { tipo: "selo", texto: "Ativa", tom: "ok" },
  acoes(m.nome),
]);

export const KPIS_DASHBOARD = [
  { rotulo: "Receita", valor: "R$ 0,00", variacao: "11 vendas", tom: "neutro" },
  { rotulo: "Novos alunos", valor: "13", variacao: "↘ −51,9%", tom: "warn" },
  { rotulo: "Acessos de alunos", valor: "18", variacao: "↘ −51,4%", tom: "warn" },
  { rotulo: "Matrículas", valor: "69", variacao: "Conclusão 39,1%", tom: "ok" },
] as const;
