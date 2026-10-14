import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { membroDaPagina } from "@/lib/auth/guarda";
import { enderecoDaArea } from "@/lib/criador/area";
import { dadosDaArea } from "@/lib/criador/consultas";
import { CabecalhoConfiguracao } from "../_components/cabecalho-configuracao";
import { LinhaInfo } from "../_components/linha-info";
import { FormNomeArea } from "./form-nome-area";

export const metadata: Metadata = { title: "Geral" };

/** Fuso e idioma são fixos na plataforma (datas em Brasília, interface em português). */
const FUSO = "America/Sao_Paulo";
const IDIOMA = "pt-BR";

/** So DONO (ADMIN recebe 403 na trilha). Lido do banco agora, com a versao para a trava. */
async function Conteudo() {
  const { criador } = await membroDaPagina(["DONO"]);
  const area = await dadosDaArea(criador.id);
  if (!area) notFound();
  const endereco = enderecoDaArea(area.slug);
  return (
    <div className="grid items-start gap-5 desk:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Cartao padding={24} como="section" aria-labelledby="titulo-identidade">
        <CartaoTitulo tamanho={15} como="h2" id="titulo-identidade" className="mb-4">
          Identidade
        </CartaoTitulo>
        <FormNomeArea nomeInicial={area.nome} versaoInicial={area.versao.toISOString()} />
      </Cartao>
      <Cartao padding={24} como="section" aria-labelledby="titulo-regiao">
        <CartaoTitulo tamanho={15} como="h2" id="titulo-regiao" className="mb-1">
          Endereço e região
        </CartaoTitulo>
        <dl className="m-0">
          <LinhaInfo
            rotulo="Endereço"
            valor={
              <a href={endereco.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                {endereco.host}
              </a>
            }
            ajuda="Definido na criação da área. Domínio próprio: em Configurações › Domínios."
          />
          <LinhaInfo rotulo="Fuso horário" valor={FUSO} ajuda="Horário de Brasília (UTC−3) em todas as datas, relatórios e certificados." />
          <LinhaInfo rotulo="Idioma" valor={IDIOMA} ajuda="Português (Brasil) na área do aluno, no painel e nos e-mails." />
        </dl>
      </Cartao>
    </div>
  );
}

export default function PaginaGeral() {
  return (
    <div className="flex flex-col gap-5">
      <CabecalhoConfiguracao titulo="Geral" descricao="Nome, endereço, fuso e idioma da área de membros." />
      <Suspense fallback={null}>
        <Conteudo />
      </Suspense>
    </div>
  );
}
