import type { Metadata } from "next";
import { Suspense } from "react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import type { OrigemDescadastro } from "@/lib/db/schema/_enums";
import { listarDescadastros } from "@/lib/marketing/descadastro";
import { dataHoraCurta } from "../../conteudos/_components/comum";
import { ABAS_CAMPANHAS } from "../_components/comum";

export const metadata: Metadata = { title: "Descadastros" };

const POR_PAGINA = 50;
const COLUNAS: Coluna[] = [
  { titulo: "E-mail" },
  { titulo: "Como", largura: 220 },
  { titulo: "Quando", largura: 150 },
];
const ROTULO_ORIGEM: Record<OrigemDescadastro, string> = { LINK: "Link no rodapé do e-mail", UM_CLIQUE: "Botão do aplicativo de e-mail" };

type Busca = Promise<Record<string, string | string[] | undefined>>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

async function Descadastros({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  const email = um(sp.q)?.slice(0, 200);
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(um(sp.pagina) ?? "1", 10) || 1));
  const lista = await listarDescadastros(criador.id, { email, pagina, porPagina: POR_PAGINA });
  const base = "/admin/campanhas/descadastros";
  const href = (n: number) => {
    const p = new URLSearchParams();
    if (email) p.set("q", email);
    if (n > 1) p.set("pagina", String(n));
    const qs = p.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const linhas: Linha[] = lista.linhas.map((d) => [
    { tipo: "texto", texto: d.destinatario },
    { tipo: "texto", texto: ROTULO_ORIGEM[d.origem] },
    { tipo: "data", texto: dataHoraCurta(d.quando) },
  ]);

  return (
    <>
      <p className="m-0 max-w-[720px] text-xs text-muted">
        Quem se descadastra para de receber as campanhas e automações desta área, mas continua recebendo os e-mails da conta: criar ou trocar a senha, link de acesso e avisos de
        segurança. Por privacidade, o e-mail aparece mascarado; a busca acha pelo endereço completo.
      </p>
      <PaginaTabela
        titulo="Campanhas"
        estatistica={`${lista.total.toLocaleString("pt-BR")} ${lista.total === 1 ? "pessoa descadastrada" : "pessoas descadastradas"}${email ? " com este e-mail" : ""}`}
        abas={ABAS_CAMPANHAS}
        abaAtiva="Descadastros"
        busca="Procure pelo e-mail completo..."
        valorBusca={email}
        formBusca={{ nome: "q" }}
        filtrosAtivos={email ? [{ rotulo: `E-mail · ${email}`, hrefRemover: base }] : []}
        colunas={COLUNAS}
        linhas={linhas}
        chaves={lista.linhas.map((d) => d.id)}
        paginacao={{ pagina, porPagina: POR_PAGINA, total: lista.total, href }}
        vazio={
          email
            ? { titulo: "Este e-mail não se descadastrou", descricao: "A busca precisa do e-mail completo, exatamente como a pessoa usa." }
            : { titulo: "Ninguém se descadastrou", descricao: "Quando alguém clicar em “Descadastrar” num e-mail de campanha ou automação, aparece aqui." }
        }
      />
    </>
  );
}

/** Descadastros dos e-mails de marketing da área (RN-227): máscara, origem e quando. */
export default function PaginaDescadastros({ searchParams }: { searchParams: Busca }) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={null}>
        <Descadastros searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
