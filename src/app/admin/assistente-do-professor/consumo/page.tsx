import type { Metadata } from "next";
import { Suspense } from "react";
import { CartaoKpi } from "@/components/admin/cartao-kpi";
import { MolduraAbas } from "@/components/admin/moldura-abas";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { consumoDoAssistente, type LinhaConsumo } from "@/lib/assistente/admin";
import { configDoAssistente } from "@/lib/assistente/config";
import { formatarUsd, MODELO_PADRAO } from "@/lib/assistente/regras";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { ABAS_ASSISTENTE, SeloSituacao } from "../_components/comum";

export const metadata: Metadata = { title: "Consumo · Assistente do professor" };

const numero = (n: number) => n.toLocaleString("pt-BR");
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloDia = (p: string) => `${p.slice(8, 10)}/${p.slice(5, 7)}`;
const rotuloMes = (p: string) => `${MESES[Number(p.slice(5, 7)) - 1]}/${p.slice(0, 4)}`;

function Tabela({ titulo, linhas, rotulo }: { titulo: string; linhas: LinhaConsumo[]; rotulo: (p: string) => string }) {
  return (
    <section aria-label={titulo} className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[560px] border-collapse text-[13px]">
        <caption className="border-b border-border px-4 py-3 text-left text-sm font-bold">{titulo}</caption>
        <thead>
          <tr className="text-xs text-muted">
            {["Período", "Respostas", "Sem resposta", "Tokens de entrada", "Tokens de saída", "Custo estimado"].map((c, i) => (
              <th key={c} scope="col" className={`px-4 py-2.5 font-semibold ${i ? "text-right" : "text-left"}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.periodo} className="border-t border-border tabular-nums">
              <th scope="row" className="px-4 py-2.5 text-left font-semibold">
                {rotulo(l.periodo)}
              </th>
              <td className="px-4 py-2.5 text-right">{numero(l.perguntas)}</td>
              <td className="px-4 py-2.5 text-right">{numero(l.semResposta)}</td>
              <td className="px-4 py-2.5 text-right">{numero(l.tokensEntrada)}</td>
              <td className="px-4 py-2.5 text-right">{numero(l.tokensSaida)}</td>
              <td className="px-4 py-2.5 text-right font-semibold">{formatarUsd(l.custoUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

async function Conteudo() {
  const { criador } = await membroDaPagina(EQUIPE);
  const [c, consumo] = await Promise.all([configDoAssistente(criador.id), consumoDoAssistente(criador.id)]);
  const mes = consumo.meses[0];
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const doDia = consumo.dias.find((d) => d.periodo === hoje);
  return (
    <MolduraAbas titulo="Assistente do professor" meta={<SeloSituacao ligado={c.ligado} />} abas={ABAS_ASSISTENTE} ativa="Consumo">
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 min-[640px]:grid-cols-3">
          <CartaoKpi rotulo="Respostas hoje" valor={numero(doDia?.perguntas ?? 0)} complemento={`Custo estimado ${formatarUsd(doDia?.custoUsd ?? 0)}`} />
          <CartaoKpi rotulo="Respostas no mês" valor={numero(mes?.perguntas ?? 0)} complemento={`${numero(mes?.semResposta ?? 0)} sem resposta na base`} />
          <CartaoKpi rotulo="Custo estimado no mês" valor={formatarUsd(mes?.custoUsd ?? 0)} complemento={`${numero((mes?.tokensEntrada ?? 0) + (mes?.tokensSaida ?? 0))} tokens`} />
        </div>
        {consumo.dias.length ? (
          <>
            <Tabela titulo="Últimos 30 dias" linhas={consumo.dias} rotulo={rotuloDia} />
            <Tabela titulo="Por mês" linhas={consumo.meses} rotulo={rotuloMes} />
          </>
        ) : (
          <EstadoVazio comMoldura titulo="Nenhum consumo ainda" descricao="Respostas, tokens e custo aparecem aqui assim que o assistente começar a responder." />
        )}
        <p className="m-0 text-xs leading-relaxed text-muted">
          Estimativa em dólar pela tabela pública da Anthropic (modelo padrão {MODELO_PADRAO}), incluindo os testes da equipe e conversas apagadas. A cobrança real é a da fatura da Anthropic. Respostas sem trecho na base não chamam o modelo e custam zero.
        </p>
      </div>
    </MolduraAbas>
  );
}

/** Consumo do assistente (DONO e ADMIN): respostas, tokens e custo estimado por dia e por mês. */
export default function PaginaConsumoAssistente() {
  return (
    <Suspense fallback={null}>
      <Conteudo />
    </Suspense>
  );
}
