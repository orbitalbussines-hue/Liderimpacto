import type { ModeloPagina } from "@/lib/db/schema/_enums";
import type { BlocoDoTipo, BlocoPagina, ConfigPagina, TipoBloco } from "./config";

/**
 * Modelos prontos (RN-240): "Página de vendas de curso" e "Captura de e-mail", e o bloco novo de cada
 * tipo (botão "Adicionar bloco" do editor). PURO. Os textos são ponto de partida: o criador troca tudo.
 * Curso e oferta vêm preenchidos com o primeiro da área quando existem (nulo = escolher no editor).
 */

export const ROTULO_MODELO: Record<ModeloPagina, { titulo: string; descricao: string }> = {
  VENDA: { titulo: "Página de vendas de curso", descricao: "Capa, benefícios, módulos, autor, depoimentos, preço, garantia, perguntas e chamada final." },
  CAPTURA: { titulo: "Captura de e-mail", descricao: "Capa curta, o que a pessoa recebe e o formulário de nome e e-mail." },
};

export interface ReferenciasIniciais {
  produtoId: string | null;
  ofertaId: string | null;
}

/** Bloco novo, com texto de exemplo, do tipo pedido. */
export function novoBloco<T extends TipoBloco>(tipo: T, id: string, r: ReferenciasIniciais = { produtoId: null, ofertaId: null }): BlocoDoTipo<T> {
  const v = { id, visivel: true };
  const blocos: { [K in TipoBloco]: BlocoDoTipo<K> } = {
    CAPA: { ...v, tipo: "CAPA", titulo: "O título que resume a transformação", subtitulo: "Uma frase sobre para quem é e o que a pessoa conquista.", midia: { tipo: "NENHUMA" }, botao: { texto: "Quero começar", acao: "PRECO", url: null } },
    BENEFICIOS: {
      ...v,
      tipo: "BENEFICIOS",
      titulo: "O que você vai conquistar",
      itens: [
        { titulo: "Primeiro resultado", texto: "Explique em uma frase o ganho concreto." },
        { titulo: "Segundo resultado", texto: "Outro ganho que a pessoa sente no dia a dia." },
        { titulo: "Terceiro resultado", texto: "O ganho que faz a decisão valer a pena." },
      ],
    },
    MODULOS: { ...v, tipo: "MODULOS", titulo: "O que tem no curso", produtoId: r.produtoId, mostrarAulas: true },
    AUTOR: { ...v, tipo: "AUTOR", titulo: "Quem vai te ensinar", nome: "Seu nome", texto: "Conte sua trajetória e por que você é a pessoa certa para ensinar isso.", imagemArquivoId: null },
    DEPOIMENTOS: {
      ...v,
      tipo: "DEPOIMENTOS",
      titulo: "Quem já fez",
      itens: [
        { nome: "Nome do aluno", detalhe: "Cargo ou cidade", texto: "O que mudou depois do curso, nas palavras do aluno." },
        { nome: "Nome da aluna", detalhe: "Cargo ou cidade", texto: "Um segundo relato, de preferência com um resultado concreto." },
      ],
    },
    PRECO: { ...v, tipo: "PRECO", titulo: "Comece hoje", ofertaId: r.ofertaId, itens: ["Acesso a todas as aulas", "Certificado de conclusão", "Comunidade de alunos"], textoBotao: "Comprar agora", observacao: "Pagamento seguro por cartão, Pix ou boleto." },
    GARANTIA: { ...v, tipo: "GARANTIA", titulo: "Garantia incondicional", texto: "Se não for para você, peça o reembolso dentro do prazo e devolvemos o valor pago.", dias: 7 },
    FAQ: {
      ...v,
      tipo: "FAQ",
      titulo: "Perguntas frequentes",
      itens: [
        { pergunta: "Por quanto tempo tenho acesso?", resposta: "Responda conforme a oferta escolhida." },
        { pergunta: "Recebo certificado?", resposta: "Sim, ao concluir todas as aulas." },
      ],
    },
    CHAMADA: { ...v, tipo: "CHAMADA", titulo: "Pronto para começar?", texto: "Reforce o principal benefício em uma frase.", botao: { texto: "Quero minha vaga", acao: "PRECO", url: null } },
    FORMULARIO: {
      ...v,
      tipo: "FORMULARIO",
      titulo: "Receba o material gratuito",
      texto: "Deixe seu nome e e-mail que enviamos para você.",
      textoBotao: "Quero receber",
      consentimento: "Aceito receber e-mails com conteúdos e ofertas. Posso me descadastrar a qualquer momento pelo link no rodapé dos e-mails.",
      tagId: null,
      sucesso: "Pronto! Confira sua caixa de entrada nos próximos minutos.",
    },
  };
  return blocos[tipo];
}

const SEO_VAZIO: ConfigPagina["seo"] = { titulo: "", descricao: "", imagemArquivoId: null, noindex: false };

/** Página inteira de um modelo. `idNovo` gera ids estáveis dos blocos. */
export function paginaDoModelo(modelo: ModeloPagina, r: ReferenciasIniciais, idNovo: (i: number) => string = (i) => `b${i + 1}`): ConfigPagina {
  const tipos: TipoBloco[] =
    modelo === "VENDA" ? ["CAPA", "BENEFICIOS", "MODULOS", "AUTOR", "DEPOIMENTOS", "PRECO", "GARANTIA", "FAQ", "CHAMADA"] : ["CAPA", "BENEFICIOS", "FORMULARIO"];
  const blocos: BlocoPagina[] = tipos.map((t, i) => novoBloco(t, idNovo(i), r));
  if (modelo === "CAPTURA") {
    const c = blocos[0] as BlocoDoTipo<"CAPA">;
    blocos[0] = { ...c, titulo: "O material gratuito que resolve uma dor do seu público", botao: { texto: "Quero receber", acao: "FORMULARIO", url: null } };
    const b = blocos[1] as BlocoDoTipo<"BENEFICIOS">;
    blocos[1] = { ...b, titulo: "O que você vai receber" };
  }
  return { tema: "ESCURO", seo: SEO_VAZIO, blocos };
}
