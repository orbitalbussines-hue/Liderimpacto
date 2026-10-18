import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha, TomSelo } from "@/components/admin/tabela-tipos";
import { MenuFiltro } from "@/components/comunidade/menu-filtro";
import { buttonVariants } from "@/components/ui/button";
import { Estatistica } from "@/components/ui/estatistica";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import { SITUACOES_EMAIL, TIPOS_EMAIL, type SituacaoEmail, type TipoEmail } from "@/lib/db/schema/_enums";
import { listarDisparos, resumoDisparos } from "@/lib/email/disparos";
import { dataHoraCurta } from "../../conteudos/_components/comum";
import { rotuloErroEmail } from "./rotulos";

export const metadata: Metadata = { title: "Disparos de e-mails" };

const POR_PAGINA = 30;
const COLUNAS: Coluna[] = [
  { titulo: "Quando", largura: 130 },
  { titulo: "Tipo", largura: 160 },
  { titulo: "Destinatário", largura: 200 },
  { titulo: "Assunto" },
  { titulo: "Situação", largura: 240 },
];
const ROTULO_TIPO: Record<TipoEmail, string> = {
  DEFINIR_SENHA: "Definir senha",
  PRIMEIRO_ACESSO: "Primeiro acesso",
  AVISO_SEGURANCA: "Aviso de segurança",
};
const ROTULO_SITUACAO: Record<SituacaoEmail, string> = { ENVIADO: "Enviado", FALHOU: "Falhou", NAO_CONFIGURADO: "Não configurado" };
const TOM_SITUACAO: Record<SituacaoEmail, TomSelo> = { ENVIADO: "ok", FALHOU: "warn", NAO_CONFIGURADO: "neutro" };
/** Endereço completo (a busca é exata, por um código derivado do endereço). */
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

type Busca = Promise<Record<string, string | string[] | undefined>>;
type Parametro = "tipo" | "situacao" | "email" | "pagina";
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const ehTipo = (v?: string): v is TipoEmail => TIPOS_EMAIL.includes(v as TipoEmail);
const ehSituacao = (v?: string): v is SituacaoEmail => SITUACOES_EMAIL.includes(v as SituacaoEmail);

async function Disparos({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(["DONO"]);
  const sp = await searchParams;
  // searchParams são entrada do usuário: só passa o que tem formato conhecido.
  const tipo = um(sp.tipo);
  const situacao = um(sp.situacao);
  const emailDigitado = um(sp.email)?.slice(0, 254);
  const filtros = {
    tipo: ehTipo(tipo) ? tipo : undefined,
    situacao: ehSituacao(situacao) ? situacao : undefined,
    email: emailDigitado,
  };
  const emailValido = !emailDigitado || EMAIL.test(emailDigitado);
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(um(sp.pagina) ?? "1", 10) || 1));
  const [lista, resumo] = await Promise.all([
    emailValido
      ? listarDisparos(criador.id, { ...filtros, pagina, porPagina: POR_PAGINA })
      : Promise.resolve({ total: 0, linhas: [] }),
    resumoDisparos(criador.id),
  ]);

  const href = (mudar: Partial<Record<Parametro, string | undefined>>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filtros, pagina: undefined, ...mudar })) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/admin/configuracoes/disparos?${qs}` : "/admin/configuracoes/disparos";
  };
  const filtrosAtivos = [
    filtros.tipo && { rotulo: `Tipo · ${ROTULO_TIPO[filtros.tipo]}`, hrefRemover: href({ tipo: undefined }) },
    filtros.situacao && { rotulo: `Situação · ${ROTULO_SITUACAO[filtros.situacao]}`, hrefRemover: href({ situacao: undefined }) },
    filtros.email && { rotulo: `Destinatário · ${filtros.email}`, hrefRemover: href({ email: undefined }) },
  ].filter((f) => !!f);
  const manter = Object.fromEntries(Object.entries({ tipo: filtros.tipo, situacao: filtros.situacao }).filter(([, v]) => v)) as Record<string, string>;

  const linhas: Linha[] = lista.linhas.map((d) => [
    { tipo: "data", texto: dataHoraCurta(d.quando) },
    { tipo: "texto", texto: ROTULO_TIPO[d.tipo] },
    { tipo: "no", conteudo: <span className="tabular-nums">{d.destinatario}</span> },
    { tipo: "no", conteudo: <span className="line-clamp-2">{d.assunto}</span> },
    {
      tipo: "no",
      conteudo: (
        <div className="flex flex-col items-start gap-1">
          <Selo tom={TOM_SITUACAO[d.situacao]}>{ROTULO_SITUACAO[d.situacao]}</Selo>
          {d.situacao === "FALHOU" && (
            <span className="text-xs text-muted" title={d.erro ?? undefined}>
              {rotuloErroEmail(d.erro)}
            </span>
          )}
          {d.situacao === "NAO_CONFIGURADO" && <span className="text-xs text-muted">Servidor de e-mail não configurado</span>}
        </div>
      ),
    },
  ]);

  const vazio = !emailValido
    ? { titulo: "Digite o e-mail completo", descricao: "A busca compara o endereço inteiro (ex.: nome@dominio.com). Parte do e-mail não encontra nada." }
    : filtros.email
      ? { titulo: "Nenhum e-mail para este endereço", descricao: "Confira se o endereço está completo e escrito igual ao cadastro." }
      : Object.values(filtros).some(Boolean)
        ? { titulo: "Nenhum disparo encontrado", descricao: "Remova os filtros para ver todos." }
        : { titulo: "Nenhum e-mail enviado ainda", descricao: "Links de acesso, redefinição de senha e avisos de segurança aparecem aqui." };

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/configuracoes" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Configurações
      </Link>
      <section aria-labelledby="resumo-disparos" className="flex flex-col gap-2">
        <h2 id="resumo-disparos" className="m-0 font-sans text-[15px] font-semibold tracking-normal">
          Últimos 30 dias
        </h2>
        <div className="grid grid-cols-3 gap-2 desk:gap-3">
          <Estatistica valor={resumo.ENVIADO} rotulo="Enviados" className="border border-border bg-surface" />
          <Estatistica valor={resumo.FALHOU} rotulo="Falharam" className="border border-border bg-surface" />
          <Estatistica valor={resumo.NAO_CONFIGURADO} rotulo="Sem servidor configurado" className="border border-border bg-surface" />
        </div>
      </section>
      <PaginaTabela
        titulo="Disparos de e-mails"
        estatistica="Registro somente leitura · destinatário mascarado, sem o conteúdo do e-mail"
        abas={[]}
        busca="E-mail completo..."
        valorBusca={filtros.email}
        formBusca={{ nome: "email", manter }}
        filtrosAtivos={filtrosAtivos}
        controles={
          <>
            <MenuFiltro
              rotulo="Tipo"
              itens={[
                { rotulo: "Todos os tipos", href: href({ tipo: undefined }), marcado: !filtros.tipo },
                ...TIPOS_EMAIL.map((t) => ({ rotulo: ROTULO_TIPO[t], href: href({ tipo: t }), marcado: filtros.tipo === t })),
              ]}
            />
            <MenuFiltro
              rotulo="Situação"
              itens={[
                { rotulo: "Todas as situações", href: href({ situacao: undefined }), marcado: !filtros.situacao },
                ...SITUACOES_EMAIL.map((s) => ({ rotulo: ROTULO_SITUACAO[s], href: href({ situacao: s }), marcado: filtros.situacao === s })),
              ]}
            />
          </>
        }
        colunas={COLUNAS}
        linhas={linhas}
        chaves={lista.linhas.map((d) => d.id)}
        paginacao={{ pagina, porPagina: POR_PAGINA, total: lista.total, href: (n) => href({ pagina: n > 1 ? String(n) : undefined }) }}
        vazio={vazio}
      />
      {lista.linhas.length === 0 && pagina > 1 && (
        <Link href={href({})} className={buttonVariants({ variant: "contorno", size: "36", className: "self-start" })}>
          Voltar para a primeira página
        </Link>
      )}
      <p className="m-0 text-xs text-muted">
        O registro não pode ser alterado nem apagado. Para saber se um e-mail chegou a alguém, pesquise pelo endereço completo da pessoa.
      </p>
    </div>
  );
}

/** Disparos de e-mail do criador do HOST (RN-203, só DONO; ADMIN e ALUNO recebem 403). */
export default function PaginaDisparos({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Disparos searchParams={searchParams} />
    </Suspense>
  );
}
