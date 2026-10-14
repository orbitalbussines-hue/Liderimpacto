"use client";

import { useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { acaoTestarBusca } from "@/lib/actions/conhecimento";
import { LIMITES_ASSISTENTE } from "@/lib/assistente/regras";
import { formatarTempo } from "@/lib/validators/catalogo";

type Resultado = Extract<Awaited<ReturnType<typeof acaoTestarBusca>>, { ok: true }>["dados"];

/**
 * "Testar busca": mostra os trechos que o assistente RECEBERIA para a pergunta (nos cursos em que
 * ele aparece), na ordem de relevância. Não chama o modelo nem conta no limite.
 */
export function TestarBusca() {
  const [pergunta, setPergunta] = useState("");
  const [resultado, setResultado] = useState<{ pergunta: string; trechos: Resultado } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const buscar = () =>
    iniciar(async () => {
      setErro(null);
      const r = await acaoTestarBusca({ pergunta }).catch(() => null);
      if (!r || !r.ok) return setErro(r?.erro ?? "Sem conexão com o servidor. Tente de novo.");
      setResultado({ pergunta, trechos: r.dados });
    });

  return (
    <div className="flex max-w-[860px] flex-col gap-5">
      <form
        className="flex flex-col gap-2.5 min-[640px]:flex-row min-[640px]:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          buscar();
        }}
      >
        <Campo
          rotulo="Pergunta de um aluno"
          classNameMoldura="flex-1"
          tamanho="42"
          value={pergunta}
          maxLength={LIMITES_ASSISTENTE.pergunta}
          placeholder="Ex.: Como dar feedback para a equipe sem desmotivar?"
          onChange={(e) => setPergunta(e.target.value)}
        />
        <Button type="submit" size="42" carregando={pendente} disabled={pergunta.trim().length < 2}>
          <Search aria-hidden />
          Testar
        </Button>
      </form>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {resultado &&
        (resultado.trechos.length ? (
          <section aria-label="Trechos recuperados" className="flex flex-col gap-3">
            <p className="m-0 text-[13px] text-muted">
              {resultado.trechos.length === 1 ? "1 trecho iria" : `${resultado.trechos.length} trechos iriam`} para o assistente, nesta ordem.
            </p>
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {resultado.trechos.map((t) => (
                <li key={t.n} className="rounded-xl border border-border bg-bg p-4">
                  <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px]">
                    <span className="font-bold text-muted">[{t.n}]</span>
                    <span className="font-bold">{t.titulo}</span>
                    <span className="text-muted">
                      {t.fonte}
                      {t.curso ? ` · ${t.curso}` : ""}
                      {t.inicioSeg != null ? ` · ${formatarTempo(t.inicioSeg)}` : ""}
                    </span>
                    <span className="ml-auto text-xs text-muted tabular-nums">relevância {t.relevancia.toLocaleString("pt-BR")}</span>
                  </p>
                  <p className="m-0 mt-2 line-clamp-6 text-sm leading-relaxed whitespace-pre-line">{t.texto}</p>
                </li>
              ))}
            </ol>
          </section>
        ) : (
          <EstadoVazio
            comMoldura
            titulo="Nenhum trecho encontrado"
            descricao="O assistente responderia que não encontrou isso nas aulas e sugeriria a Comunidade. Escreva um texto na base ou envie a legenda da aula que trata do assunto."
          />
        ))}
    </div>
  );
}
