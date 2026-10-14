import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Globe } from "lucide-react";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { IconeQuadrado } from "@/components/ui/icone-quadrado";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import { enderecoDaArea } from "@/lib/criador/area";
import { dadosDaArea } from "@/lib/criador/consultas";
import { CabecalhoConfiguracao } from "../_components/cabecalho-configuracao";
import { LinhaInfo } from "../_components/linha-info";

export const metadata: Metadata = { title: "Domínios" };

/**
 * So DONO. Mostra o endereco atual e explica o dominio proprio, que AINDA NAO liga: a coluna
 * `criadores.dominio_proprio` existe, mas atender outro dominio exige DNS + certificado SSL na
 * infraestrutura (proxy) e o host ainda responde 404 para ele (`alvoDosCabecalhos`). Sem gravacao.
 */
async function Conteudo() {
  const { criador } = await membroDaPagina(["DONO"]);
  const area = await dadosDaArea(criador.id);
  if (!area) notFound();
  const endereco = enderecoDaArea(area.slug);
  return (
    <div className="grid items-start gap-5 desk:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Cartao padding={24} como="section" aria-labelledby="titulo-atual">
        <div className="mb-1 flex items-center justify-between gap-2">
          <CartaoTitulo tamanho={15} como="h2" id="titulo-atual">
            Endereço atual
          </CartaoTitulo>
          <Selo tom="ok">Ativo</Selo>
        </div>
        <dl className="m-0">
          <LinhaInfo
            rotulo="Endereço"
            valor={
              <a href={endereco.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                {endereco.host}
              </a>
            }
            ajuda="Subdomínio da plataforma. É por ele que os alunos entram hoje."
          />
        </dl>
      </Cartao>

      <Cartao padding={24} como="section" aria-labelledby="titulo-proprio" className="flex flex-col gap-4">
        <div className="flex items-start gap-3.5">
          <IconeQuadrado tamanho={42} tom="neutro">
            <Globe />
          </IconeQuadrado>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CartaoTitulo tamanho={15} como="h2" id="titulo-proprio">
                Domínio próprio
              </CartaoTitulo>
              <Selo tom="neutro" forma="etiqueta">
                Em breve
              </Selo>
            </div>
            <p className="m-0 mt-1 text-[13px] text-muted">
              Use um endereço da sua marca, como <b className="font-semibold text-text">cursos.suamarca.com.br</b>, no lugar de {endereco.host}.
            </p>
          </div>
        </div>
        <p className="m-0 -mb-2 text-[13px] font-semibold">Como vai funcionar</p>
        <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-[13px]">
          <li>Você informa o domínio nesta tela.</li>
          <li>
            No seu provedor de DNS, cria um registro <b className="font-semibold">CNAME</b> apontando para {endereco.host}.
          </li>
          <li>A plataforma confere o DNS e emite o certificado HTTPS do novo endereço.</li>
        </ol>
        <p className="m-0 rounded-lg border border-border bg-surface-2 p-3 text-[13px]">
          {area.dominioProprio
            ? `Domínio reservado: ${area.dominioProprio}. Ele ainda não responde: a ligação depende da etapa de infraestrutura (DNS e certificado).`
            : "Ainda não dá para conectar um domínio por aqui: a ligação depende da etapa de infraestrutura (DNS e certificado). O endereço atual continua funcionando normalmente."}
        </p>
      </Cartao>
    </div>
  );
}

export default function PaginaDominios() {
  return (
    <div className="flex flex-col gap-5">
      <CabecalhoConfiguracao titulo="Domínios" descricao="Endereço pelo qual os alunos acessam a área de membros." />
      <Suspense fallback={null}>
        <Conteudo />
      </Suspense>
    </div>
  );
}
