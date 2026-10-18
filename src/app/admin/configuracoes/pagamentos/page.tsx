import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/ui/aviso";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import { contaStripe } from "@/lib/pagamentos/consultas";
import { percentualDaTaxa } from "@/lib/pagamentos/regras";
import { stripeConfigurado } from "@/lib/pagamentos/stripe";
import { um, type Busca } from "../../matriculas/_components/comum";
import { CabecalhoConfiguracao } from "../_components/cabecalho-configuracao";
import { LinhaInfo } from "../_components/linha-info";
import { BotoesConta } from "./_components/botoes-conta";

export const metadata: Metadata = { title: "Pagamentos" };

type Conta = NonNullable<Awaited<ReturnType<typeof contaStripe>>>;

const ESTADO = {
  desconectada: { rotulo: "Não conectada", tom: "neutro" },
  pendente: { rotulo: "Cadastro pendente", tom: "accent" },
  ativa: { rotulo: "Ativa", tom: "ok" },
} as const;

/** "Ativa" = o Stripe liberou as cobranças (RN-210: só então a área vende). */
const estadoDa = (c: Conta) => (!c.conectada ? "desconectada" : c.cobrancasAtivas ? "ativa" : "pendente");

/** O que ainda falta, na ordem em que a pessoa resolve. */
function pendencias(c: Conta): string[] {
  const p: string[] = [];
  if (!c.dadosEnviados) p.push("Terminar o cadastro no Stripe: dados da empresa ou pessoa, documento e conta bancária.");
  else if (!c.cobrancasAtivas) p.push("O Stripe está analisando o cadastro. As vendas liberam quando ele aprovar as cobranças.");
  if (!c.repassesAtivos) p.push("Repasses para o banco ainda não liberados: confira a conta bancária no Stripe.");
  return p;
}

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(["DONO"]);
  const [conta, sp] = await Promise.all([contaStripe(criador.id), searchParams]);
  if (!conta) notFound();
  const configurada = stripeConfigurado();
  const estado = estadoDa(conta);
  const chegada = configurada && (um(sp.stripe) === "retorno" ? "retorno" : um(sp.stripe) === "renovar" ? "renovar" : null);
  const taxa = percentualDaTaxa(conta.taxaBps).toLocaleString("pt-BR");
  const falta = conta.conectada ? pendencias(conta) : [];

  return (
    <>
      {!configurada && (
        <Aviso tom="info">
          Pagamentos não configurados nesta plataforma: falta a chave do Stripe no servidor. Ofertas, cupons e afiliados podem ser preparados; as vendas começam quando ela estiver
          definida.
        </Aviso>
      )}
      <div className="grid items-start gap-5 desk:grid-cols-2">
        <Cartao padding={24} como="section" aria-labelledby="titulo-conta" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CartaoTitulo tamanho={15} como="h2" id="titulo-conta" className="font-semibold">
              Conta Stripe
            </CartaoTitulo>
            <Selo tom={ESTADO[estado].tom}>{ESTADO[estado].rotulo}</Selo>
          </div>
          {!conta.conectada ? (
            <p className="m-0 max-w-[62ch] text-[13px] leading-relaxed text-muted">
              As vendas desta área caem na sua própria conta Stripe, com Dashboard completo. Ao conectar, você é levado ao Stripe para fazer o cadastro (dados, documento e conta
              bancária) e volta para cá no fim. As taxas do Stripe são cobradas na sua conta.
            </p>
          ) : (
            <>
              <dl className="m-0">
                <LinhaInfo rotulo="Cobranças" valor={conta.cobrancasAtivas ? "Liberadas" : "Bloqueadas"} ajuda={conta.cobrancasAtivas ? "Os links de compra das ofertas estão abertos." : "Os links de compra recusam até o Stripe liberar."} />
                <LinhaInfo rotulo="Repasses para o banco" valor={conta.repassesAtivos ? "Liberados" : "Pendentes"} />
                <LinhaInfo rotulo="Cadastro" valor={conta.dadosEnviados ? "Enviado" : "Incompleto"} />
                <LinhaInfo rotulo="Conta" valor={<code className="text-[13px] font-normal">{conta.contaId}</code>} />
              </dl>
              {falta.length > 0 && (
                <div>
                  <p className="m-0 text-[13px] font-semibold">O que falta</p>
                  <ul className="m-0 mt-1 list-disc pl-5 text-[13px] leading-relaxed text-muted">
                    {falta.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          {configurada && <BotoesConta estado={estado} chegada={chegada || null} />}
        </Cartao>

        <Cartao padding={24} como="section" aria-labelledby="titulo-taxa">
          <CartaoTitulo tamanho={15} como="h2" id="titulo-taxa" className="mb-1 font-semibold">
            Taxas
          </CartaoTitulo>
          <dl className="m-0">
            <LinhaInfo
              rotulo="Taxa da plataforma"
              valor={<span className="tabular-nums">{taxa}% por venda</span>}
              ajuda="Sai na mesma cobrança; o comprador vê só o preço. Em reembolso, volta na mesma proporção. Definida pela plataforma."
            />
            <LinhaInfo rotulo="Taxas do Stripe" valor="Na sua conta Stripe" ajuda="Cartão, Pix e boleto têm as taxas do Stripe, descontadas no Dashboard dele." />
          </dl>
        </Cartao>
      </div>
    </>
  );
}

/** Configurações › Pagamentos (só DONO, RN-210/211). Volta do cadastro do Stripe em `?stripe=retorno|renovar`. */
export default function PaginaPagamentos({ searchParams }: { searchParams: Busca }) {
  return (
    <div className="flex flex-col gap-5">
      <CabecalhoConfiguracao titulo="Pagamentos" descricao="Conta Stripe que recebe as vendas desta área e a taxa da plataforma." />
      <Suspense fallback={null}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
