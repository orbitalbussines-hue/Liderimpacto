import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { Abas } from "@/components/ui/abas";
import { BotaoFiltro } from "@/components/ui/botao-filtro";
import { Button, buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { CampoBusca } from "@/components/ui/campo-busca";
import { Cartao } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { FiltroAtivo } from "@/components/ui/filtro-ativo";
import { Selo } from "@/components/ui/selo";
import { CelulaTabela } from "./celula-tabela";
import type { AcaoPagina } from "./navegacao";
import type { Coluna, Linha } from "./tabela-tipos";

export interface PaginacaoTabela {
  pagina: number;
  porPagina: number;
  total: number;
  /** Link de cada página (searchParams): liga as setas ‹ ›. */
  href?: (pagina: number) => string;
}

/** Aba com rota própria (`href`) ou sem rota ainda (`emBreve`: aparece desabilitada com selo). */
export type AbaTabela = string | { rotulo: string; href?: string; emBreve?: boolean };

/** Busca como formulário GET (`nome` na URL); `manter` reenvia os outros filtros. */
export interface BuscaTabela {
  nome: string;
  manter?: Record<string, string>;
}

export interface PaginaTabelaProps {
  titulo: string;
  /** "139 total · 137 ativos". Aceita nós (ex.: trecho em <b className="text-ok">). */
  estatistica?: ReactNode;
  abas: readonly AbaTabela[];
  /** Aba marcada; padrão = a primeira. */
  abaAtiva?: string;
  /** Placeholder da busca. */
  busca?: string;
  valorBusca?: string;
  filtros?: readonly string[];
  filtrosAtivos?: readonly { rotulo: string; hrefRemover: string }[];
  /** Busca de verdade (form GET). Sem isto o campo é só visual (molde vazio). */
  formBusca?: BuscaTabela;
  /** Controles interativos ao lado dos filtros (menus de filtro). */
  controles?: ReactNode;
  /** Botões do cabeçalho prontos (client). Substitui acaoPrincipal/acaoSecundaria. */
  acoes?: ReactNode;
  /** Chave estável de cada linha (id): o estado dos menus não pula de linha ao recarregar. */
  chaves?: readonly string[];
  colunas: readonly Coluna[];
  linhas: readonly Linha[];
  acaoPrincipal?: AcaoPagina;
  acaoSecundaria?: AcaoPagina;
  paginacao?: PaginacaoTabela;
  /** Texto do estado vazio (sem linhas). */
  vazio?: { titulo: string; descricao?: string };
}

const LARGURA_FLEX = 220;
const FOLGA_LATERAL = 40;

function BotaoAcao({ acao, primaria }: { acao: AcaoPagina; primaria?: boolean }) {
  const Icone = acao.icone;
  const conteudo = (
    <>
      <Icone className="size-3.5" aria-hidden />
      {acao.rotulo}
    </>
  );
  const variante = primaria ? "primario" : "contorno";
  return acao.href ? (
    <Link href={acao.href} className={buttonVariants({ variant: variante, size: "36" })}>
      {conteudo}
    </Link>
  ) : (
    <Button variant={variante} size="36">
      {conteudo}
    </Button>
  );
}

const classeSeta = buttonVariants({ variant: "fantasma", size: "icone36", className: "size-7 text-muted" });

function Rodape({ paginacao }: { paginacao: PaginacaoTabela }) {
  const { pagina, porPagina, total } = paginacao;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const de = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const ate = Math.min(total, pagina * porPagina);
  return (
    <div className="flex flex-wrap justify-between gap-2 border-t border-border px-5 py-3 text-xs text-muted">
      <span>
        Mostrando {de}–{ate} de {total}
      </span>
      <span className="flex items-center gap-1">
        Por página: {porPagina} · {pagina} / {totalPaginas}
        {paginacao.href && (
          <nav aria-label="Paginação" className="ml-1 flex gap-0.5">
            {pagina > 1 && (
              <Link href={paginacao.href(pagina - 1)} aria-label="Página anterior" className={classeSeta}>
                <ChevronLeft className="size-4" aria-hidden />
              </Link>
            )}
            {pagina < totalPaginas && (
              <Link href={paginacao.href(pagina + 1)} aria-label="Próxima página" className={classeSeta}>
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            )}
          </nav>
        )}
      </span>
    </div>
  );
}

/**
 * MOLDE de lista do admin: cartão único com cabeçalho, abas, filtros, tabela e rodapé.
 * Só apresentação (Server Component): busca, filtro e paginação chegam por props/searchParams.
 */
export function PaginaTabela({
  titulo,
  estatistica,
  abas,
  abaAtiva,
  busca = "Pesquisar...",
  valorBusca,
  filtros = [],
  filtrosAtivos = [],
  formBusca,
  controles,
  acoes,
  chaves,
  colunas,
  linhas,
  acaoPrincipal,
  acaoSecundaria,
  paginacao,
  vazio = { titulo: "Nada por aqui ainda", descricao: "Quando houver registros, eles aparecem nesta lista." },
}: PaginaTabelaProps) {
  const larguraMinima =
    colunas.reduce((soma, c) => soma + (c.largura ?? LARGURA_FLEX), 0) + FOLGA_LATERAL;
  const normalizadas = abas.map((a) => (typeof a === "string" ? { rotulo: a, href: `?aba=${encodeURIComponent(a)}` } : a));
  const itensAbas = normalizadas.filter((a) => !a.emBreve).map((a) => ({ valor: a.rotulo, rotulo: a.rotulo, href: a.href }));
  const emBreve = normalizadas.filter((a) => a.emBreve);
  const campoBusca = (
    <CampoBusca
      name={formBusca?.nome}
      placeholder={busca}
      defaultValue={valorBusca}
      rotulo={`Pesquisar em ${titulo}`}
      classNameMoldura="min-w-[200px] flex-1"
    />
  );

  return (
    <Cartao padding={0} como="section" aria-label={titulo}>
      <CabecalhoPagina
        variante="adminTabela"
        titulo={titulo}
        meta={estatistica}
        className="px-5 py-[18px]"
        acoes={
          acoes ??
          ((acaoPrincipal || acaoSecundaria) && (
            <>
              {acaoSecundaria && <BotaoAcao acao={acaoSecundaria} />}
              {acaoPrincipal && <BotaoAcao acao={acaoPrincipal} primaria />}
            </>
          ))
        }
      />

      {itensAbas.length > 0 && (
        <div className="scrollbar-oculta flex overflow-x-auto border-b border-border px-5">
          <Abas
            tamanho="admin"
            itens={itensAbas}
            ativo={abaAtiva ?? itensAbas[0].valor}
            aria-label={`Seções de ${titulo}`}
            className="overflow-visible border-b-0"
          />
          {emBreve.map((a) => (
            <span
              key={a.rotulo}
              aria-disabled="true"
              className="inline-flex shrink-0 cursor-not-allowed items-center gap-1.5 px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap text-muted opacity-70"
            >
              {a.rotulo}
              <Selo tom="transparente" forma="etiqueta" className="px-0">
                Em breve
              </Selo>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-5 py-3.5">
        {formBusca ? (
          <form role="search" method="get" className="flex min-w-[200px] flex-1">
            {Object.entries(formBusca.manter ?? {}).map(([nome, valor]) => (
              <input key={nome} type="hidden" name={nome} value={valor} />
            ))}
            {campoBusca}
          </form>
        ) : (
          campoBusca
        )}
        {filtrosAtivos.map((f) => (
          <FiltroAtivo key={f.rotulo} rotulo={f.rotulo} hrefRemover={f.hrefRemover} />
        ))}
        {filtros.map((f) => (
          <BotaoFiltro key={f}>{f}</BotaoFiltro>
        ))}
        {controles}
      </div>

      {/* `relative`: os textos sr-only das celulas (absolute) ficam presos aqui; sem isso escapam
          da rolagem e esticam a pagina inteira no celular. */}
      <div className="relative overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]" style={{ minWidth: larguraMinima }}>
          <thead>
            <tr className="border-y border-border bg-surface-2 text-xs text-muted">
              {colunas.map((c) => (
                <th
                  key={c.titulo}
                  scope="col"
                  style={c.largura ? { width: c.largura } : { minWidth: LARGURA_FLEX }}
                  className="px-3 py-2.5 font-normal first:pl-5 last:pr-5"
                >
                  {c.titulo === "Ações" || c.titulo === "Capa" ? <span className="sr-only">{c.titulo}</span> : c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, i) => (
              <tr key={chaves?.[i] ?? i} className="border-b border-border last:border-b-0">
                {linha.map((celula, j) => (
                  <td key={j} className="px-3 py-2 align-middle first:pl-5 last:pr-5">
                    <CelulaTabela celula={celula} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {linhas.length === 0 && (
        <EstadoVazio icone={<List />} titulo={vazio.titulo} descricao={vazio.descricao} />
      )}
      {linhas.length > 0 && paginacao && <Rodape paginacao={paginacao} />}
    </Cartao>
  );
}
