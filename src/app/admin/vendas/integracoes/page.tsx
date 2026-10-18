import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MolduraAbas } from "@/components/admin/moldura-abas";
import type { Coluna, Linha, TomSelo } from "@/components/admin/tabela-tipos";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import { urlDaPlataforma } from "@/lib/criador/area";
import { PLATAFORMAS_INTEGRACAO, type PlataformaIntegracao } from "@/lib/db/schema/_enums";
import { eventosRecentes, integracoesDoCriador, mapeamentosDoCriador } from "@/lib/integracoes/consultas";
import { NOME_DO_TOKEN, REPROCESSAVEIS, ROTULO_PLATAFORMA, ROTULO_SITUACAO_EVENTO, ROTULO_TIPO_EVENTO, urlDoWebhook, type SituacaoNaTela } from "@/lib/integracoes/regras";
import { produtosParaMatricular } from "@/lib/matriculas/consultas";
import { dataHoraCurta } from "../../conteudos/_components/comum";
import { CarregandoLista } from "../../matriculas/_components/carregando";
import { LinhaInfo } from "../../configuracoes/_components/linha-info";
import { ABAS_VENDAS_LINKS } from "../_components/comum";
import { CopiarLink } from "../ofertas/_components/copiar-link";
import { AcoesConexao, FormConectar } from "./_components/conexao";
import { BotaoNovoMapeamento, ExcluirMapeamento, Reprocessar } from "./_components/mapeamentos";
import { TabelaSimples } from "./_components/tabela-simples";

export const metadata: Metadata = { title: "Integrações" };

/** Passo a passo curto de cada plataforma (RN-230): onde pegar o token e onde colar a URL. */
const PASSOS: Record<PlataformaIntegracao, { antes: string[]; depois: string[] }> = {
  HOTMART: {
    antes: ["Na Hotmart, abra Ferramentas › Webhook (API e notificações).", "Na aba Autenticação, copie o Hottok e cole aqui embaixo."],
    depois: [
      "Na Hotmart, em Webhook › Cadastrar, cole a URL acima e escolha a versão 2.0.0.",
      "Marque os eventos: Compra aprovada, Compra completa, Compra reembolsada, Chargeback, Compra cancelada, Compra atrasada e Cancelamento de assinatura.",
      "Salve e mapeie abaixo cada produto da Hotmart para os cursos daqui.",
    ],
  },
  EDUZZ: {
    antes: ["No Console da Eduzz (console.eduzz.com), abra Webhook › Segurança e gere uma chave secreta.", "Copie a chave e cole aqui embaixo."],
    depois: [
      "No Console, em Webhook › + Nova configuração, cole a URL acima e escolha a mesma chave em \"Chave de acesso\".",
      "Marque os eventos do MyEduzz: Fatura paga, reembolsada, cancelada, chargeback e Contrato atualizado. Crie e ative (o teste da Eduzz aparece em Últimos eventos).",
      "Mapeie abaixo cada produto da Eduzz para os cursos daqui.",
    ],
  },
};

const TOM: Record<SituacaoNaTela, TomSelo> = { PENDENTE: "neutro", PROCESSADO: "ok", SEM_MAPEAMENTO: "accent", IGNORADO: "neutro", ERRO: "warn", RECUSADO: "warn" };
const NOTA_RECUSA = { TOKEN_INVALIDO: "Token não confere: confira o token colado aqui.", FORMATO_INVALIDO: "Formato inesperado." } as const;

function Passos({ itens, inicio = 1 }: { itens: string[]; inicio?: number }) {
  return (
    <ol start={inicio} className="m-0 list-decimal pl-5 text-[13px] leading-relaxed text-muted">
      {itens.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ol>
  );
}

const COLUNAS_MAPA: Coluna[] = [{ titulo: "Produto externo" }, { titulo: "Curso liberado" }, { titulo: "Acesso", largura: 120 }, { titulo: "Ações", largura: 56 }];
const COLUNAS_EVENTOS: Coluna[] = [
  { titulo: "Recebido", largura: 140 },
  { titulo: "Evento" },
  { titulo: "Compra", largura: 170 },
  { titulo: "Pessoa", largura: 170 },
  { titulo: "Situação", largura: 220 },
  { titulo: "Ações", largura: 140 },
];

async function Integracoes() {
  const { criador } = await membroDaPagina(["DONO"]);
  const [conexoes, mapas, eventos, cursos] = await Promise.all([integracoesDoCriador(criador.id), mapeamentosDoCriador(criador.id), eventosRecentes(criador.id), produtosParaMatricular(criador.id)]);
  const base = urlDaPlataforma();
  const semMapa = eventos.filter((e) => e.situacao === "SEM_MAPEAMENTO").length;

  const linhasMapa: Linha[] = mapas.map((m) => [
    { tipo: "texto", texto: m.nomeExterno ?? `Produto ${m.produtoExterno}`, sub: `${ROTULO_PLATAFORMA[m.plataforma]} · id ${m.produtoExterno}` },
    { tipo: "texto", texto: m.produto },
    { tipo: "texto", texto: m.diasAcesso === null ? "Vitalício" : `${m.diasAcesso} ${m.diasAcesso === 1 ? "dia" : "dias"}` },
    { tipo: "no", conteudo: <ExcluirMapeamento id={m.id} versao={m.versao.toISOString()} descricao={`do produto ${m.produtoExterno} para "${m.produto}"`} /> },
  ]);

  const linhasEventos: Linha[] = eventos.map((e) => [
    { tipo: "data", texto: dataHoraCurta(e.recebidoEm) },
    { tipo: "texto", texto: e.tipo ? ROTULO_TIPO_EVENTO[e.tipo] : "Chamada recusada", sub: [ROTULO_PLATAFORMA[e.plataforma], e.evento].filter(Boolean).join(" · ") },
    { tipo: "texto", texto: e.transacao ?? e.assinatura ?? "—", sub: e.produtoExterno ? `Produto ${e.produtoExterno}` : undefined },
    { tipo: "texto", texto: e.pessoa ?? "—" },
    {
      tipo: "no",
      conteudo: (
        <div className="flex min-w-0 flex-col items-start gap-0.5">
          <Selo tom={TOM[e.situacao]}>{ROTULO_SITUACAO_EVENTO[e.situacao]}</Selo>
          {(e.recusa ? NOTA_RECUSA[e.recusa] : e.nota) && <span className="line-clamp-2 text-xs text-muted">{e.recusa ? NOTA_RECUSA[e.recusa] : e.nota}</span>}
        </div>
      ),
    },
    { tipo: "no", conteudo: e.eventoId && e.versao && e.situacao !== "RECUSADO" && REPROCESSAVEIS.includes(e.situacao) ? <Reprocessar eventoId={e.eventoId} versao={e.versao} /> : null },
  ]);

  return (
    <div className="flex flex-col gap-7">
      <section aria-labelledby="titulo-conexoes" className="flex flex-col gap-3">
        <CartaoTitulo tamanho={15} como="h2" id="titulo-conexoes" className="font-semibold">
          Conexões
        </CartaoTitulo>
        <div className="grid items-start gap-4 desk:grid-cols-2">
          {PLATAFORMAS_INTEGRACAO.map((p) => {
            const c = conexoes.find((x) => x.plataforma === p);
            const url = c ? urlDoWebhook(base, p, c.id) : null;
            return (
              <Cartao key={p} padding={20} como="section" aria-labelledby={`titulo-${p}`} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CartaoTitulo tamanho={15} como="h3" id={`titulo-${p}`} className="font-semibold">
                    {ROTULO_PLATAFORMA[p]}
                  </CartaoTitulo>
                  <Selo tom={c ? "ok" : "neutro"}>{c ? "Conectada" : "Não conectada"}</Selo>
                </div>
                {c && url ? (
                  <>
                    <dl className="m-0">
                      <LinhaInfo rotulo="URL do webhook" valor={<code className="text-[13px] font-normal break-all">{url}</code>} ajuda={<span className="mt-2 inline-block"><CopiarLink links={[{ rotulo: ROTULO_PLATAFORMA[p], url }]} descricao={`URL do webhook da ${ROTULO_PLATAFORMA[p]}`} /></span>} />
                      <LinhaInfo rotulo={NOME_DO_TOKEN[p]} valor={<code className="text-[13px] font-normal text-muted">••••{c.segredoFinal}</code>} ajuda={`Conectada em ${dataHoraCurta(c.criadoEm)}`} />
                    </dl>
                    <Passos itens={PASSOS[p].depois} />
                    <AcoesConexao id={c.id} plataforma={p} versao={c.versao.toISOString()} />
                  </>
                ) : (
                  <>
                    <Passos itens={PASSOS[p].antes} />
                    <FormConectar plataforma={p} />
                    <p className="m-0 text-xs text-muted">Depois de conectar, aparece a URL para colar na {ROTULO_PLATAFORMA[p]}.</p>
                  </>
                )}
              </Cartao>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="titulo-mapas" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CartaoTitulo tamanho={15} como="h2" id="titulo-mapas" className="font-semibold">
              Produtos mapeados
            </CartaoTitulo>
            <p className="m-0 text-[13px] text-muted">Cada produto vendido lá fora libera um ou mais cursos daqui.</p>
          </div>
          <BotaoNovoMapeamento conexoes={conexoes.map((c) => ({ id: c.id, plataforma: c.plataforma }))} cursos={cursos.map((c) => ({ id: c.id, titulo: c.titulo }))} />
        </div>
        <TabelaSimples colunas={COLUNAS_MAPA} linhas={linhasMapa} chaves={mapas.map((m) => m.id)} vazio="Nenhum produto mapeado. Sem mapeamento, a compra fica guardada em Últimos eventos até você mapear e reprocessar." />
      </section>

      <section aria-labelledby="titulo-eventos" className="flex flex-col gap-3">
        <div>
          <CartaoTitulo tamanho={15} como="h2" id="titulo-eventos" className="font-semibold">
            Últimos eventos
          </CartaoTitulo>
          <p className="m-0 text-[13px] text-muted">
            Os 50 avisos mais recentes da Hotmart e da Eduzz.
            {semMapa > 0 && ` ${semMapa} ${semMapa === 1 ? "compra espera" : "compras esperam"} mapeamento: mapeie o produto e clique em Reprocessar.`}
          </p>
        </div>
        <TabelaSimples colunas={COLUNAS_EVENTOS} linhas={linhasEventos} chaves={eventos.map((e) => e.reciboId)} vazio="Nenhum evento recebido ainda." />
      </section>

      <p className="m-0 text-[13px] text-muted">
        Vendas pelo link de compra da própria área usam o Stripe:{" "}
        <Link href="/admin/configuracoes/pagamentos" className="font-semibold text-accent underline-offset-4 hover:underline">
          Configurações › Pagamentos
        </Link>
        .
      </p>
    </div>
  );
}

/** Vendas › Integrações (só DONO, RN-230 a RN-236): Hotmart e Eduzz liberam o acesso pelo webhook. */
export default function PaginaIntegracoes() {
  return (
    <MolduraAbas titulo="Integrações" meta="Venda na Hotmart ou na Eduzz e o acesso é liberado aqui automaticamente" abas={ABAS_VENDAS_LINKS} ativa="Integrações">
      <Suspense fallback={<CarregandoLista />}>
        <Integracoes />
      </Suspense>
    </MolduraAbas>
  );
}
