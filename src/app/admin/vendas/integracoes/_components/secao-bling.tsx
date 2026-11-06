import type { Coluna, Linha, TomSelo } from "@/components/admin/tabela-tipos";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { Selo } from "@/components/ui/selo";
import type { SituacaoAutorizacaoIntegracao } from "@/lib/db/schema/_enums";
import { ROTULO_AUTORIZACAO, ROTULO_PEDIDO } from "@/lib/integracoes/bling/regras";
import type { autorizacaoBling, pedidosMarketplace } from "@/lib/integracoes/consultas";
import { dataHoraCurta } from "../../../conteudos/_components/comum";
import { LinhaInfo } from "../../../configuracoes/_components/linha-info";
import { CopiarLink } from "../../ofertas/_components/copiar-link";
import { AcoesBling, FormConectarBling } from "./bling";
import { TabelaSimples } from "./tabela-simples";

/** Card do Bling e lista "Pedidos de marketplace" (ADR-0024, RN-260 a RN-265). Só DONO (a página confere). */

const TOM_AUTORIZACAO: Record<SituacaoAutorizacaoIntegracao, TomSelo> = { AGUARDANDO: "accent", AUTORIZADA: "ok", REAUTORIZAR: "warn" };

const PASSOS_ANTES = [
  "No Bling, abra Central de Extensões › Área do integrador › Criar aplicativo (visibilidade Privado).",
  "Em Link de redirecionamento, cole a URL de retorno abaixo. Em Escopos, adicione Pedidos de Venda (leitura).",
  "Salve, copie o Client ID e o Client Secret do app e cole aqui embaixo.",
];
const PASSOS_DEPOIS = [
  "No app do Bling, aba Webhooks: cadastre a URL do webhook acima como servidor.",
  "Em Pedido de venda, marque Criado, Atualizado e Excluído (versão 1) e salve.",
  "Clique em Autorizar no Bling e aceite. Os avisos só começam depois da autorização.",
  "Mapeie abaixo o SKU de cada produto (ex.: o livro) para os cursos daqui.",
];

function Passos({ itens }: { itens: string[] }) {
  return (
    <ol className="m-0 list-decimal pl-5 text-[13px] leading-relaxed text-muted">
      {itens.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ol>
  );
}

const Url = ({ url, rotulo }: { url: string; rotulo: string }) => (
  <LinhaInfo rotulo={rotulo} valor={<code className="text-[13px] font-normal break-all">{url}</code>} ajuda={<span className="mt-2 inline-block"><CopiarLink links={[{ rotulo, url }]} descricao={rotulo} /></span>} />
);

export function CartaoBling(p: {
  conexao: { id: string; segredoFinal: string; criadoEm: Date; versao: Date } | null;
  autorizacao: Awaited<ReturnType<typeof autorizacaoBling>>;
  urlRetorno: string;
  urlWebhook: string | null;
  retorno: { ok: boolean; motivo: string | null } | null;
}) {
  const a = p.autorizacao;
  return (
    <Cartao padding={20} como="section" aria-labelledby="titulo-BLING" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <CartaoTitulo tamanho={15} como="h3" id="titulo-BLING" className="font-semibold">
            Bling (Mercado Livre e TikTok Shop)
          </CartaoTitulo>
          <p className="m-0 text-[13px] text-muted">O comprador resgata em /resgatar-pedido com o número do pedido e o CPF.</p>
        </div>
        <Selo tom={p.conexao && a ? TOM_AUTORIZACAO[a.situacao] : "neutro"}>{p.conexao && a ? ROTULO_AUTORIZACAO[a.situacao] : "Não conectado"}</Selo>
      </div>
      {p.retorno && <p className={p.retorno.ok ? "m-0 text-[13px] text-ok" : "m-0 text-[13px] text-warn"}>{p.retorno.ok ? "Bling autorizado." : (p.retorno.motivo ?? "A autorização não foi concluída.")}</p>}
      <dl className="m-0">
        <Url url={p.urlRetorno} rotulo="URL de retorno (Link de redirecionamento)" />
        {p.conexao && p.urlWebhook && (
          <>
            <Url url={p.urlWebhook} rotulo="URL do webhook" />
            <LinhaInfo rotulo="Credenciais" valor={<code className="text-[13px] font-normal text-muted">Client ID ••••{a?.clienteIdFinal} · Secret ••••{p.conexao.segredoFinal}</code>} ajuda={a?.renovadoEm ? `Token renovado em ${dataHoraCurta(a.renovadoEm)}` : `Conectado em ${dataHoraCurta(p.conexao.criadoEm)}`} />
          </>
        )}
      </dl>
      {a?.situacao === "REAUTORIZAR" && <p className="m-0 text-[13px] text-warn">O Bling recusou a renovação do acesso{a.erro ? ` (${a.erro})` : ""}. Clique em Reautorizar.</p>}
      {p.conexao && a ? (
        <>
          <Passos itens={PASSOS_DEPOIS} />
          <AcoesBling integracaoId={p.conexao.id} versao={p.conexao.versao.toISOString()} situacao={a.situacao} />
        </>
      ) : (
        <>
          <Passos itens={PASSOS_ANTES} />
          <FormConectarBling />
        </>
      )}
    </Cartao>
  );
}

const COLUNAS: Coluna[] = [{ titulo: "Pedido" }, { titulo: "Situação", largura: 130 }, { titulo: "SKUs", largura: 180 }, { titulo: "Resgate", largura: 220 }, { titulo: "Atualizado", largura: 140 }];

export function PedidosMarketplace({ pedidos }: { pedidos: Awaited<ReturnType<typeof pedidosMarketplace>> }) {
  const linhas: Linha[] = pedidos.map((x) => [
    { tipo: "texto", texto: x.numeroLoja ?? `Bling ${x.pedidoId}`, sub: [x.lojaId ? `Loja ${x.lojaId}` : null, `Bling ${x.pedidoId}`, x.comCpf ? null : "sem CPF"].filter(Boolean).join(" · ") },
    { tipo: "no", conteudo: <Selo tom={x.situacao === "VALIDO" ? "ok" : "warn"}>{ROTULO_PEDIDO[x.situacao]}</Selo> },
    { tipo: "texto", texto: x.skus.length ? x.skus.join(", ") : "—" },
    { tipo: "texto", texto: x.resgatadoEm ? `Sim · ${dataHoraCurta(x.resgatadoEm)}` : "Não", sub: x.resgatadoPor ?? undefined },
    { tipo: "data", texto: dataHoraCurta(x.atualizadoEm) },
  ]);
  return (
    <section aria-labelledby="titulo-pedidos" className="flex flex-col gap-3">
      <div>
        <CartaoTitulo tamanho={15} como="h2" id="titulo-pedidos" className="font-semibold">
          Pedidos de marketplace
        </CartaoTitulo>
        <p className="m-0 text-[13px] text-muted">Os 50 pedidos do Bling atualizados por último. O CPF não fica guardado; o e-mail de quem resgatou aparece mascarado.</p>
      </div>
      <TabelaSimples colunas={COLUNAS} linhas={linhas} chaves={pedidos.map((x) => x.id)} vazio="Nenhum pedido recebido do Bling ainda." />
    </section>
  );
}
