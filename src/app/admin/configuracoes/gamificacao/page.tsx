import type { Metadata } from "next";
import { Suspense } from "react";
import { membroDaPagina } from "@/lib/auth/guarda";
import { configDaGamificacao } from "@/lib/gamificacao/pontos";
import { CabecalhoConfiguracao } from "../_components/cabecalho-configuracao";
import { FormGamificacao } from "./form-gamificacao";

export const metadata: Metadata = { title: "Gamificação" };

/** Só DONO (ADMIN recebe 403 na trilha). Lida do banco agora, com a versão para a trava. */
async function Conteudo() {
  const { criador } = await membroDaPagina(["DONO"]);
  const c = await configDaGamificacao(criador.id);
  return <FormGamificacao inicial={{ ligada: c.ligada, pontos: c.pontos, niveis: c.niveis, versao: c.updatedAt?.toISOString() ?? null }} />;
}

export default function PaginaConfigGamificacao() {
  return (
    <div className="flex max-w-[860px] flex-col gap-5">
      <CabecalhoConfiguracao titulo="Gamificação" descricao="Pontos por ação, níveis e se a área do aluno mostra Conquistas (pontos, ranking e desafios)." />
      <Suspense fallback={null}>
        <Conteudo />
      </Suspense>
    </div>
  );
}
