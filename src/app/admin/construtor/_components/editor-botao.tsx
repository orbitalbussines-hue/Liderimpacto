"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { Selecao } from "@/components/ui/selecao";
import { ACOES_BOTAO, ROTULO_ACAO, type AcaoBotao, type BotaoDestaque } from "@/lib/vitrine/config";
import { BuscaConteudo } from "./busca-conteudo";

export interface OpcoesAlvo {
  cursos: readonly { id: string; titulo: string; status: string }[];
  rotulos: Record<string, string>;
  lembrarRotulo: (id: string, rotulo: string) => void;
}

/** Botão do destaque: texto, ação (curso, aula, continuar, link interno) e o destino. */
export function EditorBotao({ nome, botao, onMudar, opcoes }: { nome: string; botao: BotaoDestaque; onMudar: (b: BotaoDestaque) => void; opcoes: OpcoesAlvo }) {
  const trocarAcao = (acao: AcaoBotao) => {
    const primeiroCurso = opcoes.cursos.find((c) => c.status !== "RASCUNHO")?.id ?? opcoes.cursos[0]?.id ?? null;
    const alvo = acao === "LINK" ? "/trilhas" : acao === "AULA" ? null : acao === "CONTINUAR" ? null : primeiroCurso;
    onMudar({ ...botao, acao, alvo });
  };
  const cursos = opcoes.cursos.map((c) => ({ valor: c.id, rotulo: c.status === "RASCUNHO" ? `${c.titulo} (rascunho)` : c.titulo }));
  return (
    <fieldset className="m-0 flex flex-col gap-2.5 rounded-xl border border-border p-3">
      <legend className="px-1 text-xs font-bold text-muted">{nome}</legend>
      <Campo rotulo="Texto" estiloRotulo="discreto" tamanho="42" fundo="bg" value={botao.texto} maxLength={30} onChange={(e) => onMudar({ ...botao, texto: e.target.value })} />
      <Selecao rotulo="Ao clicar" estiloRotulo="discreto" fundo="bg" value={botao.acao} opcoes={ACOES_BOTAO.map((a) => ({ valor: a, rotulo: ROTULO_ACAO[a] }))} onChange={(e) => trocarAcao(e.target.value as AcaoBotao)} />
      {botao.acao === "CURSO" && <Selecao rotulo="Curso" estiloRotulo="discreto" fundo="bg" value={botao.alvo ?? ""} vazio="Escolha o curso" opcoes={cursos} onChange={(e) => onMudar({ ...botao, alvo: e.target.value || null })} />}
      {botao.acao === "CONTINUAR" && (
        <Selecao
          rotulo="Curso"
          estiloRotulo="discreto"
          fundo="bg"
          value={botao.alvo ?? ""}
          vazio="Onde o aluno parou (qualquer curso)"
          opcoes={cursos}
          ajuda="Leva à próxima aula do aluno neste curso."
          onChange={(e) => onMudar({ ...botao, alvo: e.target.value || null })}
        />
      )}
      {botao.acao === "LINK" && (
        <Campo
          rotulo="Caminho na área do aluno"
          estiloRotulo="discreto"
          tamanho="42"
          fundo="bg"
          value={botao.alvo ?? ""}
          placeholder="/trilhas"
          ajuda="Só endereços desta área, começando com /."
          onChange={(e) => onMudar({ ...botao, alvo: e.target.value })}
        />
      )}
      {botao.acao === "AULA" &&
        (botao.alvo ? (
          <div className="flex items-center gap-2 rounded-[10px] border border-border bg-bg px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{opcoes.rotulos[botao.alvo] ?? "Aula escolhida"}</span>
            <Button type="button" variant="fantasma" size="icone36" className="size-8 text-muted" aria-label="Trocar a aula" onClick={() => onMudar({ ...botao, alvo: null })}>
              <X aria-hidden />
            </Button>
          </div>
        ) : (
          <BuscaConteudo
            rotulo="Buscar a aula"
            tipos={["AULA"]}
            onEscolher={(c) => {
              opcoes.lembrarRotulo(c.id, `${c.titulo} · ${c.detalhe.replace(/^Aula · /, "")}`);
              onMudar({ ...botao, alvo: c.id });
            }}
          />
        ))}
    </fieldset>
  );
}
