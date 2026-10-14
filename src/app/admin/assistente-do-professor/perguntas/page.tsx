import type { Metadata } from "next";
import { Suspense } from "react";
import { MolduraAbas } from "@/components/admin/moldura-abas";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { SegmentosLink } from "@/components/ui/segmentos-link";
import { Selo } from "@/components/ui/selo";
import { perguntasRecentes } from "@/lib/assistente/admin";
import { configDoAssistente } from "@/lib/assistente/config";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { dataHoraCurta } from "../../conteudos/_components/comum";
import { ABAS_ASSISTENTE, ROTA_ASSISTENTE, SeloSituacao } from "../_components/comum";

export const metadata: Metadata = { title: "Perguntas · Assistente do professor" };

type Busca = Promise<Record<string, string | string[] | undefined>>;
const ROTA = `${ROTA_ASSISTENTE}/perguntas`;

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const semResposta = (await searchParams).filtro === "sem-resposta";
  const [c, lista] = await Promise.all([configDoAssistente(criador.id), perguntasRecentes(criador.id, { semResposta })]);
  return (
    <MolduraAbas titulo="Assistente do professor" meta={<SeloSituacao ligado={c.ligado} />} abas={ABAS_ASSISTENTE} ativa="Perguntas">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentosLink
            aria-label="Filtrar perguntas"
            opcoes={[
              { rotulo: "Recentes", href: ROTA, ativo: !semResposta },
              { rotulo: "Sem resposta na base", href: `${ROTA}?filtro=sem-resposta`, ativo: semResposta },
            ]}
          />
          <p className="m-0 text-[13px] text-muted">
            {semResposta ? "O que os alunos perguntaram e a base não cobria: bom ponto de partida para um texto ou uma aula." : "As 50 mais recentes dos alunos (os testes da equipe ficam de fora)."}
          </p>
        </div>
        {lista.length ? (
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {lista.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="m-0 min-w-0 flex-1 text-[14.5px] font-bold leading-snug">{p.pergunta}</p>
                  {p.semResposta ? (
                    <Selo tom="warn">Sem resposta</Selo>
                  ) : p.interrompida ? (
                    <Selo tom="neutro">Interrompida</Selo>
                  ) : (
                    <Selo tom="neutro">{p.fontes === 1 ? "1 fonte" : `${p.fontes} fontes`}</Selo>
                  )}
                </div>
                <p className="m-0 text-xs text-muted">
                  {p.aluno} · {dataHoraCurta(p.quando)}
                  {p.aula ? ` · na aula ${p.aula}` : ""}
                </p>
                {p.resposta && <p className="m-0 line-clamp-2 text-[13px] leading-relaxed text-muted">{p.resposta.replace(/\s+/g, " ")}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <EstadoVazio
            comMoldura
            titulo={semResposta ? "Nenhuma pergunta sem resposta" : "Nenhuma pergunta ainda"}
            descricao={semResposta ? "Quando a base não tiver o que o aluno perguntou, a pergunta aparece aqui." : "Quando os alunos usarem o assistente, as perguntas aparecem aqui."}
          />
        )}
      </div>
    </MolduraAbas>
  );
}

/** Perguntas recentes e sem resposta (DONO e ADMIN): para o professor melhorar o conteúdo. */
export default function PaginaPerguntasAssistente({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}
