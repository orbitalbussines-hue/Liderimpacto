"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Aviso } from "@/components/ui/aviso";
import { AreaTexto } from "@/components/ui/area-texto";
import { Button } from "@/components/ui/button";
import { CaixaSelecao } from "@/components/ui/caixa-selecao";
import { Campo } from "@/components/ui/campo";
import { CartaoTitulo } from "@/components/ui/cartao";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { Interruptor } from "@/components/ui/interruptor";
import { acaoSalvarConfigAssistente } from "@/lib/actions/assistente";
import { LIMITES_ASSISTENTE } from "@/lib/assistente/regras";

export interface FormAssistenteProps {
  inicial: { ligado: boolean; nome: string; instrucoes: string; limiteDiario: number; todosOsCursos: boolean; produtos: string[]; versao: string | null };
  cursos: { id: string; titulo: string }[];
}

const SECAO = "flex flex-col gap-4 border-b border-border pb-6 last:border-b-0 last:pb-0";

/** Configuração do assistente (DONO e ADMIN): ligar, nome, tom, limite diário e cursos em que aparece. */
export function FormAssistente({ inicial, cursos }: FormAssistenteProps) {
  const router = useRouter();
  const [ligado, setLigado] = useState(inicial.ligado);
  const [nome, setNome] = useState(inicial.nome);
  const [instrucoes, setInstrucoes] = useState(inicial.instrucoes);
  const [limite, setLimite] = useState(String(inicial.limiteDiario));
  const [todos, setTodos] = useState(inicial.todosOsCursos);
  const [produtos, setProdutos] = useState<string[]>(inicial.produtos);
  const [versao, setVersao] = useState(inicial.versao);
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const salvar = () =>
    iniciar(async () => {
      setAviso(null);
      const r = await acaoSalvarConfigAssistente({ versao, ligado, nome, instrucoes, limiteDiario: Number(limite), todosOsCursos: todos, produtos: todos ? [] : produtos }).catch(() => null);
      if (!r || !r.ok) return setAviso({ tom: "erro", texto: r?.erro ?? "Sem conexão com o servidor. Tente de novo." });
      setVersao(r.dados.versao);
      setAviso({ tom: "ok", texto: "Configuração salva." });
      router.refresh();
    });

  return (
    <form
      className="flex max-w-[760px] flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        salvar();
      }}
    >
      <section aria-labelledby="titulo-ligado" className="flex items-start justify-between gap-4 border-b border-border pb-6">
        <div className="min-w-0">
          <CartaoTitulo tamanho={15} id="titulo-ligado">
            Mostrar aos alunos
          </CartaoTitulo>
          <p className="m-0 mt-1 text-[13px] leading-relaxed text-muted">
            Ligado, aparece a aba “Pergunte ao professor” nas aulas dos cursos escolhidos e a página de conversas. Ele responde só com o conteúdo da Base de conhecimento a que o aluno tem acesso.
          </p>
        </div>
        <Interruptor ligado={ligado} onAlternar={setLigado} aria-labelledby="titulo-ligado" className="mt-0.5 shrink-0" />
      </section>

      <section aria-labelledby="titulo-voz" className={SECAO}>
        <CartaoTitulo tamanho={15} id="titulo-voz">
          Nome e tom
        </CartaoTitulo>
        <Campo rotulo="Nome do assistente" value={nome} maxLength={LIMITES_ASSISTENTE.nome} required tamanho="42" onChange={(e) => setNome(e.target.value)} />
        <AreaTexto
          rotulo="Instruções de tom"
          rows={5}
          value={instrucoes}
          maxLength={LIMITES_ASSISTENTE.instrucoes}
          placeholder="Ex.: Fale de forma próxima, como o professor fala em aula. Use exemplos de liderança no dia a dia."
          ajuda={`Só estilo: as regras de segurança (responder só pelas aulas, citar as fontes) não mudam. ${instrucoes.length} de ${LIMITES_ASSISTENTE.instrucoes} caracteres.`}
          onChange={(e) => setInstrucoes(e.target.value)}
        />
      </section>

      <section aria-labelledby="titulo-limite" className={SECAO}>
        <CartaoTitulo tamanho={15} id="titulo-limite">
          Limite de uso
        </CartaoTitulo>
        <Campo
          rotulo="Perguntas por aluno por dia"
          type="number"
          inputMode="numeric"
          min={1}
          max={LIMITES_ASSISTENTE.limiteDiarioMax}
          required
          tamanho="42"
          classNameMoldura="max-w-[240px]"
          value={limite}
          ajuda="Conta pelo dia de Brasília. A equipe não tem limite próprio."
          onChange={(e) => setLimite(e.target.value)}
        />
      </section>

      <section aria-labelledby="titulo-cursos" className={SECAO}>
        <CartaoTitulo tamanho={15} id="titulo-cursos">
          Cursos em que aparece
        </CartaoTitulo>
        <GrupoChips
          aria-labelledby="titulo-cursos"
          opcoes={[
            { valor: "todos", rotulo: "Todos os cursos" },
            { valor: "alguns", rotulo: "Só os escolhidos" },
          ]}
          valor={todos ? "todos" : "alguns"}
          onMudar={(v) => setTodos(v === "todos")}
        />
        {!todos &&
          (cursos.length ? (
            <fieldset className="m-0 grid gap-x-4 border-0 p-0 min-[640px]:grid-cols-2">
              <legend className="sr-only">Cursos</legend>
              {cursos.map((c) => (
                <CaixaSelecao
                  key={c.id}
                  rotulo={<span className="text-text">{c.titulo}</span>}
                  checked={produtos.includes(c.id)}
                  onChange={(e) => setProdutos((l) => (e.target.checked ? [...l, c.id] : l.filter((x) => x !== c.id)))}
                />
              ))}
            </fieldset>
          ) : (
            <p className="m-0 text-[13px] text-muted">Nenhum curso nesta área ainda.</p>
          ))}
        <p className="m-0 text-[13px] text-muted">Fora desses cursos, o conteúdo deles também não entra nas respostas. Textos da equipe para todos continuam valendo.</p>
      </section>

      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
      <Button type="submit" size="42" carregando={pendente} className="self-start">
        Salvar configuração
      </Button>
    </form>
  );
}
