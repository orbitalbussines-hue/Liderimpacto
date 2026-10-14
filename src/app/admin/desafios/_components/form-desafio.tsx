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
import { acaoSalvarDesafio } from "@/lib/actions/gamificacao";
import type { MetaDesafio, PublicoDesafio } from "@/lib/db/schema/_enums";
import { paraCampoLocal, paraIso } from "./comum";

export interface CamposFormDesafio {
  titulo: string;
  descricao: string;
  /** ISO. */
  inicioEm: string;
  fimEm: string;
  metaTipo: MetaDesafio;
  metaQuantidade: number | null;
  metaProdutoId: string | null;
  metaAvaliacaoId: string | null;
  pontosBonus: number;
  recompensa: string | null;
  publico: PublicoDesafio;
  grupoIds: string[];
}

export interface FormDesafioProps {
  /** Sem desafio = criar (rascunho) e ir para o editor. */
  desafio?: { id: string; versao: string; campos: CamposFormDesafio; somenteLeitura: boolean };
  opcoes: { produtos: { id: string; titulo: string }[]; avaliacoes: { id: string; titulo: string; curso: string }[]; grupos: { id: string; nome: string }[] };
}

const METAS: { valor: MetaDesafio; rotulo: string }[] = [
  { valor: "AULAS_CONCLUIDAS", rotulo: "Concluir aulas" },
  { valor: "CURSO_CONCLUIDO", rotulo: "Concluir um curso" },
  { valor: "AVALIACAO_APROVADA", rotulo: "Ser aprovado numa avaliação" },
  { valor: "PUBLICACOES_COMUNIDADE", rotulo: "Publicar na comunidade" },
];

const numero = (v: FormDataEntryValue | null) => {
  const t = String(v ?? "").trim();
  return t === "" ? null : Number(t);
};

/** Dados do desafio (RN-147): janela, meta, bônus, recompensa e público. Salvar usa a trava pela versão. */
export function FormDesafio({ desafio, opcoes }: FormDesafioProps) {
  const router = useRouter();
  const c = desafio?.campos;
  const [metaTipo, setMetaTipo] = useState<MetaDesafio>(c?.metaTipo ?? "AULAS_CONCLUIDAS");
  const [publico, setPublico] = useState<PublicoDesafio>(c?.publico ?? "TODOS");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [pendente, iniciar] = useTransition();
  const somenteLeitura = desafio?.somenteLeitura ?? false;

  return (
    <form
      className="flex flex-col gap-5"
      onChange={() => setFeito(false)}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const inicio = String(f.get("inicioEm") ?? "");
        const fim = String(f.get("fimEm") ?? "");
        if (!inicio || !fim) return setErro("Informe o início e o fim do desafio.");
        const campos = {
          titulo: String(f.get("titulo") ?? ""),
          descricao: String(f.get("descricao") ?? ""),
          inicioEm: paraIso(inicio),
          fimEm: paraIso(fim),
          metaTipo,
          metaQuantidade: numero(f.get("metaQuantidade")),
          metaProdutoId: String(f.get("metaProdutoId") ?? "") || null,
          metaAvaliacaoId: String(f.get("metaAvaliacaoId") ?? "") || null,
          pontosBonus: numero(f.get("pontosBonus")) ?? 0,
          recompensa: String(f.get("recompensa") ?? ""),
          publico,
          grupoIds: f.getAll("grupoIds").map(String),
        };
        setErro(null);
        iniciar(async () => {
          const r = await acaoSalvarDesafio({ desafioId: desafio?.id ?? null, versao: desafio?.versao ?? null, campos }).catch(() => null);
          if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
          if (!r.ok) return setErro(r.erro);
          if (!desafio) return router.push(`/admin/desafios/${r.dados.id}`);
          setFeito(true);
          router.refresh();
        });
      }}
    >
      <fieldset disabled={somenteLeitura} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
        <Campo rotulo="Título" name="titulo" defaultValue={c?.titulo} required minLength={3} maxLength={120} tamanho="42" autoComplete="off" autoFocus={!desafio} />
        <AreaTexto rotulo="Descrição" name="descricao" defaultValue={c?.descricao} maxLength={2000} rows={3} ajuda="O que o aluno precisa fazer e por quê. Aparece no cartão do desafio." />
        <div className="grid gap-5 min-[640px]:grid-cols-2">
          <Campo rotulo="Início" name="inicioEm" type="datetime-local" defaultValue={paraCampoLocal(c?.inicioEm ?? null)} required tamanho="42" ajuda="Horário de Brasília." />
          <Campo rotulo="Fim" name="fimEm" type="datetime-local" defaultValue={paraCampoLocal(c?.fimEm ?? null)} required tamanho="42" ajuda="Só conta o que o aluno fizer entre o início e o fim." />
        </div>

        <CampoMoldura id="meta-desafio" rotulo="Meta">
          <GrupoChips id="meta-desafio" aria-labelledby="meta-desafio-rotulo" opcoes={METAS} valor={metaTipo} onMudar={(v) => setMetaTipo(v)} />
        </CampoMoldura>
        {metaTipo === "AULAS_CONCLUIDAS" || metaTipo === "PUBLICACOES_COMUNIDADE" ? (
          <Campo
            key={metaTipo}
            rotulo={metaTipo === "AULAS_CONCLUIDAS" ? "Quantas aulas" : "Quantas publicações"}
            name="metaQuantidade"
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            defaultValue={c?.metaTipo === metaTipo ? (c.metaQuantidade ?? undefined) : metaTipo === "AULAS_CONCLUIDAS" ? 5 : 3}
            required
            tamanho="42"
            classNameMoldura="max-w-[220px]"
            ajuda={metaTipo === "PUBLICACOES_COMUNIDADE" ? "Publicação removida ou oculta não conta." : undefined}
          />
        ) : metaTipo === "CURSO_CONCLUIDO" ? (
          <Selecao rotulo="Curso" name="metaProdutoId" defaultValue={c?.metaProdutoId ?? ""} vazio="Escolha o curso" required opcoes={opcoes.produtos.map((p) => ({ valor: p.id, rotulo: p.titulo }))} />
        ) : (
          <Selecao
            rotulo="Avaliação"
            name="metaAvaliacaoId"
            defaultValue={c?.metaAvaliacaoId ?? ""}
            vazio="Escolha a avaliação"
            required
            opcoes={opcoes.avaliacoes.map((a) => ({ valor: a.id, rotulo: a.titulo, grupo: a.curso }))}
          />
        )}

        <div className="grid gap-5 min-[640px]:grid-cols-[180px_minmax(0,1fr)]">
          <Campo rotulo="Bônus em pontos" name="pontosBonus" type="number" inputMode="numeric" min={0} max={10000} defaultValue={c?.pontosBonus ?? 50} required tamanho="42" />
          <Campo
            rotulo="Recompensa (opcional)"
            name="recompensa"
            defaultValue={c?.recompensa ?? ""}
            maxLength={200}
            tamanho="42"
            autoComplete="off"
            placeholder="Ex.: Mentoria individual de 30 min"
            ajuda="A equipe marca a entrega em Desafios › Recompensas."
          />
        </div>

        <CampoMoldura id="publico-desafio" rotulo="Quem pode participar">
          <GrupoChips
            id="publico-desafio"
            aria-labelledby="publico-desafio-rotulo"
            opcoes={[
              { valor: "TODOS", rotulo: "Todos os alunos" },
              { valor: "GRUPOS", rotulo: "Grupos escolhidos" },
            ]}
            valor={publico}
            onMudar={(v) => setPublico(v as PublicoDesafio)}
          />
        </CampoMoldura>
        {publico === "GRUPOS" &&
          (opcoes.grupos.length === 0 ? (
            <Aviso tom="info">Nenhum grupo nesta área. Crie em Membros › Grupos de acesso.</Aviso>
          ) : (
            <fieldset className="m-0 grid gap-x-4 border-0 p-0 min-[640px]:grid-cols-2">
              <legend className="sr-only">Grupos</legend>
              {opcoes.grupos.map((g) => (
                <CaixaSelecao key={g.id} name="grupoIds" value={g.id} defaultChecked={c?.grupoIds.includes(g.id)} rotulo={<span className="text-text">{g.nome}</span>} />
              ))}
            </fieldset>
          ))}
      </fieldset>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {feito && <Aviso tom="ok">Desafio salvo.</Aviso>}
      {!somenteLeitura && (
        <Button type="submit" size="42" carregando={pendente} className="self-start">
          {desafio ? "Salvar desafio" : "Criar rascunho"}
        </Button>
      )}
    </form>
  );
}
