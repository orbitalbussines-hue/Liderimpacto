import type { Metadata } from "next";
import { Suspense } from "react";
import { Esqueleto } from "@/components/ui/esqueleto";
import { urlDeImagemOuNula } from "@/lib/armazenamento/cliente";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { db } from "@/lib/db";
import { arquivos } from "@/lib/db/schema";
import { referenciasDaConfig } from "@/lib/vitrine/config";
import { dadosDoConstrutor, rotulosDasReferencias } from "@/lib/vitrine/dados";
import { and, eq } from "drizzle-orm";
import { dataHoraCurta } from "../conteudos/_components/comum";
import { Construtor } from "./_components/construtor";

export const metadata: Metadata = { title: "Construtor da vitrine" };

async function Conteudo() {
  // DONO e ADMIN (o layout não é fronteira: papel lido do banco agora).
  const { usuario, criador } = await membroDaPagina(EQUIPE);
  const d = await dadosDoConstrutor(criador.id);
  const refs = [d.rascunho, d.publicada?.config].filter((c) => !!c).map((c) => referenciasDaConfig(c!));
  const [rotulos, chaveImagem] = await Promise.all([
    rotulosDasReferencias(criador.id, { produtos: refs.flatMap((x) => x.produtos), aulas: refs.flatMap((x) => x.aulas) }),
    d.rascunho.destaque.imagemArquivoId
      ? db
          .select({ chave: arquivos.chave })
          .from(arquivos)
          .where(and(eq(arquivos.id, d.rascunho.destaque.imagemArquivoId), eq(arquivos.criador_id, criador.id), eq(arquivos.is_deleted, false)))
          .then((r) => r[0]?.chave ?? null)
      : null,
  ]);
  return (
    <Construtor
      rascunho={d.rascunho}
      versao={d.versao}
      publicada={d.publicada ? { numero: d.publicada.numero, config: d.publicada.config } : null}
      padrao={d.padrao}
      historico={d.historico.map((v) => ({ numero: v.numero, quando: dataHoraCurta(v.publicadaEm), publicadaPor: v.publicadaPor }))}
      imagemUrl={await urlDeImagemOuNula(criador.id, chaveImagem)}
      rotulos={rotulos}
      cursos={d.opcoes.cursos}
      grupos={d.opcoes.grupos}
      nome={usuario.nome.trim().split(/\s+/)[0] ?? usuario.nome}
    />
  );
}

/** Construtor da vitrine (DONO e ADMIN): rascunho com autosave, prévia real, publicar e histórico. */
export default function PaginaConstrutor() {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" className="flex flex-col gap-5">
          <span className="sr-only">Carregando o construtor</span>
          <Esqueleto className="h-14 w-80" />
          <Esqueleto className="h-[560px] rounded-2xl" />
        </div>
      }
    >
      <Conteudo />
    </Suspense>
  );
}
