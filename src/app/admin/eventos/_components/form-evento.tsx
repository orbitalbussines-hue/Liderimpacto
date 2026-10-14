"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AreaTexto } from "@/components/ui/area-texto";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { CaixaSelecao } from "@/components/ui/caixa-selecao";
import { Campo } from "@/components/ui/campo";
import { CampoMoldura } from "@/components/ui/campo-moldura";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { Selecao } from "@/components/ui/selecao";
import { acaoCriarEvento, acaoSalvarEvento } from "@/lib/actions/eventos";
import type { PublicoEvento } from "@/lib/db/schema/_enums";
import { camposDoFormulario } from "@/lib/validators/eventos";

export interface OpcoesDoEvento {
  cursos: readonly { id: string; titulo: string }[];
  grupos: readonly { id: string; nome: string }[];
  aulas: readonly { id: string; titulo: string; curso: string }[];
}

export interface CamposDoForm {
  titulo: string;
  descricao: string;
  /** "AAAA-MM-DDTHH:MM" em Brasília. */
  inicio: string;
  duracaoMin: number;
  link: string;
  publico: PublicoEvento;
  produtoId: string | null;
  grupoIds: string[];
  gravacaoAulaId: string | null;
}

export interface FormEventoProps {
  /** Sem evento = criar (rascunho) e ir para o editor. */
  evento?: { id: string; versao: string; campos: CamposDoForm };
  opcoes: OpcoesDoEvento;
  /** Cancelado: só leitura. */
  somenteLeitura?: boolean;
}

const PUBLICOS: { valor: PublicoEvento; rotulo: string }[] = [
  { valor: "TODOS", rotulo: "Todos os alunos" },
  { valor: "PRODUTO", rotulo: "Alunos de um curso" },
  { valor: "GRUPOS", rotulo: "Grupos" },
];

/** Dados do encontro ao vivo (RN-142). Quem valida é a action (mesmo Zod); aqui só a leitura do form. */
export function FormEvento({ evento, opcoes, somenteLeitura = false }: FormEventoProps) {
  const router = useRouter();
  const c = evento?.campos;
  const [publico, setPublico] = useState<PublicoEvento>(c?.publico ?? "TODOS");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <form
      className="flex flex-col gap-5"
      onChange={() => setAviso(null)}
      onSubmit={(ev) => {
        ev.preventDefault();
        const campos = camposDoFormulario(new FormData(ev.currentTarget));
        setErro(null);
        iniciar(async () => {
          if (!evento) {
            const r = await acaoCriarEvento(campos).catch(() => null);
            if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
            if (!r.ok) return setErro(r.erro);
            router.push(`/admin/eventos/${r.dados.id}`);
            return;
          }
          const r = await acaoSalvarEvento({ eventoId: evento.id, versao: evento.versao, campos }).catch(() => null);
          if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
          if (!r.ok) return setErro(r.erro);
          setAviso(r.dados.lembreteEnfileirado === false ? "Dados salvos. O lembrete do novo horário fica agendado assim que a fila voltar." : "Dados salvos.");
          router.refresh();
        });
      }}
    >
      <fieldset disabled={somenteLeitura || pendente} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
        <legend className="sr-only">Dados do encontro</legend>
        <Campo rotulo="Título" name="titulo" defaultValue={c?.titulo} required minLength={3} maxLength={120} tamanho="42" autoComplete="off" autoFocus={!evento} placeholder="Ex.: Mentoria em grupo" />
        <AreaTexto rotulo="Descrição" name="descricao" defaultValue={c?.descricao} maxLength={2000} rows={4} ajuda="Texto simples, sem formatação. Endereços (https://...) viram link para o aluno." />
        <div className="grid gap-5 min-[700px]:grid-cols-[minmax(0,1fr)_180px]">
          <Campo rotulo="Início" name="inicio" type="datetime-local" defaultValue={c?.inicio} required tamanho="42" ajuda="Horário de Brasília." />
          <Campo rotulo="Duração" name="duracaoMin" type="number" inputMode="numeric" defaultValue={c?.duracaoMin ?? 60} required min={5} max={720} step={5} tamanho="42" sufixo={<span className="text-[13px] text-muted">min</span>} />
        </div>
        <Campo
          rotulo="Link da sala"
          name="link"
          type="url"
          defaultValue={c?.link}
          maxLength={500}
          tamanho="42"
          autoComplete="off"
          placeholder="https://meet.google.com/..."
          ajuda="Zoom, Meet, YouTube... Obrigatório para publicar. O aluno só vê o link de 15 minutos antes do início até o fim."
        />
        <CampoMoldura id="publico-evento" rotulo="Quem pode participar">
          <GrupoChips id="publico-evento" aria-labelledby="publico-evento-rotulo" name="publico" opcoes={PUBLICOS} valor={publico} onMudar={setPublico} />
        </CampoMoldura>
        {publico === "PRODUTO" && (
          <Selecao
            rotulo="Curso"
            name="produtoId"
            required
            defaultValue={c?.produtoId ?? ""}
            vazio={opcoes.cursos.length ? "Escolha o curso" : "Esta área ainda não tem cursos"}
            opcoes={opcoes.cursos.map((x) => ({ valor: x.id, rotulo: x.titulo }))}
            ajuda="Só quem tem matrícula valendo neste curso vê o encontro."
          />
        )}
        {publico === "GRUPOS" && (
          <CampoMoldura id="grupos-evento" rotulo="Grupos" ajuda="Vê o encontro quem está em ao menos um dos grupos marcados.">
            {opcoes.grupos.length ? (
              <div role="group" aria-labelledby="grupos-evento-rotulo" className="flex flex-col">
                {opcoes.grupos.map((g) => (
                  <CaixaSelecao key={g.id} name="grupoIds" value={g.id} defaultChecked={c?.grupoIds.includes(g.id)} rotulo={<span className="text-text">{g.nome}</span>} />
                ))}
              </div>
            ) : (
              <p className="m-0 text-[13px] text-muted">Esta área ainda não tem grupos. Crie em Membros → Grupos de acesso.</p>
            )}
          </CampoMoldura>
        )}
        {evento && (
          <Selecao
            rotulo="Gravação"
            name="gravacaoAulaId"
            defaultValue={c?.gravacaoAulaId ?? ""}
            vazio="Sem gravação"
            opcoes={opcoes.aulas.map((a) => ({ valor: a.id, rotulo: a.titulo, grupo: a.curso }))}
            ajuda="Uma aula do catálogo. Aparece como “Assistir gravação” depois do fim, para quem tem acesso à aula."
          />
        )}
      </fieldset>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {aviso && <Aviso tom="ok">{aviso}</Aviso>}
      {!somenteLeitura && (
        <Button type="submit" size="42" carregando={pendente} className="self-start">
          {evento ? "Salvar dados" : "Criar rascunho"}
        </Button>
      )}
    </form>
  );
}
