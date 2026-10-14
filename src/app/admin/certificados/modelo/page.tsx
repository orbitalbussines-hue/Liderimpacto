import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { Abas } from "@/components/ui/abas";
import { Aviso } from "@/components/ui/aviso";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { produtoParaEditar } from "@/lib/catalogo/consultas";
import { modeloDeCertificado, produtosComModelo } from "@/lib/certificados/consultas";
import { codigoLegivel, dataPorExtenso, urlDeVerificacao } from "@/lib/certificados/regras";
import { urlDaPlataforma } from "@/lib/criador/area";
import { PALETA_PADRAO } from "@/lib/marca/paleta";
import { produtosParaMatricular } from "@/lib/matriculas/consultas";
import { ehUuid } from "../../conteudos/_components/comum";
import { ABAS_CERTIFICADOS } from "../_components/comum";
import { EditorModelo } from "./_components/editor-modelo";
import { SeletorAlvoModelo } from "./_components/seletor-alvo-modelo";

export const metadata: Metadata = { title: "Modelo do certificado" };

type Busca = Promise<Record<string, string | string[] | undefined>>;
const CODIGO_EXEMPLO = "K7M2X9QP4H";

const ORIGEM = {
  PROPRIO: null,
  PADRAO_DO_CRIADOR: "Este curso ainda usa o modelo padrão da área. Salvar aqui cria um modelo próprio só para ele.",
  EMBUTIDO: "Ainda não há modelo salvo: os certificados saem com o texto padrão da plataforma. Salve para personalizar.",
} as const;

async function Modelo({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  const bruto = typeof sp.produto === "string" ? sp.produto : "";
  if (bruto && !ehUuid(bruto)) notFound();
  const produtoId = bruto || null;
  const [modelo, produtos, curso] = await Promise.all([
    modeloDeCertificado(criador.id, produtoId),
    produtosParaMatricular(criador.id),
    produtoId ? produtoParaEditar(criador.id, produtoId) : null,
  ]);
  if (produtoId && !curso) notFound();
  const comModelo = await produtosComModelo(
    criador.id,
    produtos.map((p) => p.id),
  );
  const aviso = ORIGEM[modelo.origem];
  return (
    <>
      <CabecalhoPagina
        variante="admin"
        eyebrow="Certificados"
        titulo="Modelo do certificado"
        descricao="Título, texto e assinatura do PDF emitido na conclusão. O modelo do curso vence o padrão da área."
        acoes={
          <SeletorAlvoModelo
            atual={produtoId ?? ""}
            opcoes={[
              { valor: "", rotulo: "Padrão da área (todos os cursos)" },
              ...produtos.map((p) => ({ valor: p.id, rotulo: comModelo.has(p.id) ? `${p.titulo} · modelo próprio` : p.titulo })),
            ]}
          />
        }
      />
      <Abas itens={ABAS_CERTIFICADOS.map((a) => ({ valor: a.rotulo, rotulo: a.rotulo, href: a.href }))} ativo="Modelo" tamanho="admin" aria-label="Seções de certificados" />
      {aviso && <Aviso tom="info">{aviso}</Aviso>}
      <EditorModelo
        key={produtoId ?? "padrao"}
        modelo={{
          produtoId,
          versao: modelo.versao,
          titulo: modelo.titulo,
          texto: modelo.texto,
          assinaturaNome: modelo.assinaturaNome,
          assinaturaCargo: modelo.assinaturaCargo ?? "",
          cor: modelo.cor,
        }}
        corHerdada={curso?.produto.cor_marca ?? criador.cor_marca ?? PALETA_PADRAO}
        exemplo={{
          nome: "Maria Exemplo da Silva",
          curso: curso?.produto.titulo ?? "Nome do curso",
          carga_horaria: "12 horas",
          data: dataPorExtenso(new Date()),
          criador: criador.nome,
          codigoLegivel: codigoLegivel(CODIGO_EXEMPLO),
          urlVerificacao: urlDeVerificacao(urlDaPlataforma(), criador.slug, CODIGO_EXEMPLO),
        }}
      />
    </>
  );
}

/** Modelo padrão da área ou de um curso (`?produto=<id>`), com prévia ao vivo (DONO e ADMIN). */
export default function PaginaModelo({ searchParams }: { searchParams: Busca }) {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/certificados" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Certificados
      </Link>
      <Suspense fallback={null}>
        <Modelo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
