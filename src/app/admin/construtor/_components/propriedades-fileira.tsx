"use client";

import { useId, type ReactNode } from "react";
import { Copy, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CaixaSelecao } from "@/components/ui/caixa-selecao";
import { Campo } from "@/components/ui/campo";
import { GrupoChips } from "@/components/ui/grupo-chips";
import {
  MARCADOR_NOME,
  MAX_ITENS_MANUAIS,
  ORDENACOES_DO_TIPO,
  QUANTIDADES_FILEIRA,
  ROTULO_ORDENACAO,
  ROTULO_TIPO_FILEIRA,
  TIPOS_FILEIRA,
  type FileiraVitrine,
  type OrdenacaoFileira,
  type TipoFileira,
} from "@/lib/vitrine/config";
import { BuscaConteudo } from "./busca-conteudo";
import { LinhaInterruptor } from "./propriedades-destaque";

export interface PropriedadesFileiraProps {
  fileira: FileiraVitrine;
  grupos: readonly { id: string; nome: string }[];
  rotulos: Record<string, string>;
  lembrarRotulo: (id: string, rotulo: string) => void;
  onMudar: (f: FileiraVitrine) => void;
  onDuplicar: () => void;
  onRemover: () => void;
}

function Grupo({ rotulo, children }: { rotulo: string; children: (idRotulo: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div id={id} className="text-xs font-bold text-muted">
        {rotulo}
      </div>
      {children(id)}
    </div>
  );
}

/** Propriedades da fileira (protótipo): título, tipo, quantidade, ordenação, quem vê, itens, visível. */
export function PropriedadesFileira({ fileira: f, grupos, rotulos, lembrarRotulo, onMudar, onDuplicar, onRemover }: PropriedadesFileiraProps) {
  const mudar = (p: Partial<FileiraVitrine>) => onMudar({ ...f, ...p });
  const trocarTipo = (tipo: TipoFileira) => mudar({ tipo, ordenacao: ORDENACOES_DO_TIPO[tipo][0], itensManuais: tipo === "MANUAL" ? f.itensManuais : [] });
  const ordenacoes = ORDENACOES_DO_TIPO[f.tipo];
  const porGrupo = f.grupos.length > 0;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 text-sm font-extrabold">Fileira</h2>
      <Campo
        rotulo="Título da fileira"
        estiloRotulo="discreto"
        tamanho="42"
        fundo="bg"
        value={f.titulo}
        maxLength={60}
        ajuda={`${MARCADOR_NOME} vira o primeiro nome do aluno.`}
        onChange={(e) => mudar({ titulo: e.target.value })}
      />
      <Grupo rotulo="Tipo de conteúdo">
        {(id) => <GrupoChips aria-labelledby={id} opcoes={TIPOS_FILEIRA.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_FILEIRA[t] }))} valor={f.tipo} onMudar={trocarTipo} />}
      </Grupo>
      <Grupo rotulo="Quantidade de itens">
        {(id) => (
          <GrupoChips
            aria-labelledby={id}
            opcoes={QUANTIDADES_FILEIRA.map((n) => ({ valor: String(n), rotulo: String(n) }))}
            valor={String(f.quantidade)}
            onMudar={(v) => mudar({ quantidade: Number(v) as FileiraVitrine["quantidade"] })}
          />
        )}
      </Grupo>
      {ordenacoes.length > 1 && (
        <Grupo rotulo="Ordenação">
          {(id) => <GrupoChips aria-labelledby={id} opcoes={ordenacoes.map((o) => ({ valor: o, rotulo: ROTULO_ORDENACAO[o] }))} valor={f.ordenacao} onMudar={(v: OrdenacaoFileira) => mudar({ ordenacao: v })} />}
        </Grupo>
      )}
      {f.tipo === "MANUAL" && (
        <Grupo rotulo={`Itens escolhidos (${f.itensManuais.length} de ${MAX_ITENS_MANUAIS})`}>
          {() => (
            <>
              {f.itensManuais.length > 0 && (
                <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {f.itensManuais.map((i, n) => (
                    <li key={i.id} className="flex items-center gap-2 rounded-[10px] border border-border bg-bg py-1 pr-1 pl-3">
                      <span className="w-4 shrink-0 text-[11px] font-bold text-muted tabular-nums">{n + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{rotulos[i.id] ?? "Item removido"}</span>
                      <Button
                        type="button"
                        variant="fantasma"
                        size="icone36"
                        className="size-8 text-muted"
                        aria-label={`Tirar ${rotulos[i.id] ?? "item"}`}
                        onClick={() => mudar({ itensManuais: f.itensManuais.filter((x) => x.id !== i.id) })}
                      >
                        <X aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ol>
              )}
              {f.itensManuais.length < MAX_ITENS_MANUAIS && (
                <BuscaConteudo
                  rotulo="Adicionar curso ou aula"
                  ignorar={f.itensManuais.map((i) => i.id)}
                  onEscolher={(c) => {
                    lembrarRotulo(c.id, c.titulo);
                    mudar({ itensManuais: [...f.itensManuais, { tipo: c.tipo, id: c.id }] });
                  }}
                />
              )}
              <p className="m-0 text-[11px] text-muted">Cada aluno só vê os itens a que tem acesso.</p>
            </>
          )}
        </Grupo>
      )}
      <Grupo rotulo="Quem vê">
        {(id) => (
          <>
            {grupos.length > 0 || porGrupo ? (
              <GrupoChips
                aria-labelledby={id}
                opcoes={[
                  { valor: "TODOS", rotulo: "Todos os alunos" },
                  { valor: "GRUPOS", rotulo: "Grupos escolhidos" },
                ]}
                valor={porGrupo ? "GRUPOS" : "TODOS"}
                onMudar={(v) => mudar({ grupos: v === "TODOS" ? [] : grupos.slice(0, 1).map((g) => g.id) })}
              />
            ) : (
              <p className="m-0 text-[13px] font-semibold">Todos os alunos</p>
            )}
            {porGrupo && (
              <div className="flex flex-col gap-2 pt-1">
                {grupos.map((g) => (
                  <CaixaSelecao
                    key={g.id}
                    rotulo={g.nome}
                    checked={f.grupos.includes(g.id)}
                    onChange={(e) => {
                      const novos = e.target.checked ? [...f.grupos, g.id] : f.grupos.filter((x) => x !== g.id);
                      if (novos.length) mudar({ grupos: novos });
                    }}
                  />
                ))}
              </div>
            )}
            {grupos.length === 0 && <p className="m-0 text-[11px] text-muted">Crie grupos em Membros &gt; Grupos de acesso para limitar quem vê.</p>}
          </>
        )}
      </Grupo>
      <LinhaInterruptor titulo="Visível para os alunos" ligado={f.visivel} onAlternar={(v) => mudar({ visivel: v })} />
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button type="button" variant="contorno" size="40" className="flex-1" onClick={onDuplicar}>
          <Copy aria-hidden />
          Duplicar
        </Button>
        <Button type="button" variant="contorno" size="40" className="flex-1 text-warn" onClick={onRemover}>
          <Trash2 aria-hidden />
          Remover fileira
        </Button>
      </div>
    </div>
  );
}
