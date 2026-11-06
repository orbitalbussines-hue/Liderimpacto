"use client";

import { useId, useState, type ReactNode } from "react";
import { Copy, Trash2, X } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
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

/** Curso nas opções do construtor (com a contagem de módulos e de capas 3:4 dos módulos). */
export interface CursoDoConstrutor {
  id: string;
  titulo: string;
  status: string;
  descricao: string;
  modulos: number;
  modulosComCapa: number;
}

export interface PropriedadesFileiraProps {
  fileira: FileiraVitrine;
  grupos: readonly { id: string; nome: string }[];
  /** Cursos da área (fileira "Módulos do curso": aviso de módulos sem capa). */
  cursos?: readonly CursoDoConstrutor[];
  rotulos: Record<string, string>;
  lembrarRotulo: (id: string, rotulo: string) => void;
  onMudar: (f: FileiraVitrine) => void;
  onDuplicar: () => void;
  onRemover: () => void;
}

/** Curso em RASCUNHO: a prévia (equipe) mostra tudo, mas o aluno não vê nada até publicar o curso. */
export function AvisoCursoRascunho({ curso }: { curso?: CursoDoConstrutor }) {
  if (curso?.status !== "RASCUNHO") return null;
  return <Aviso tom="info">Este curso está em rascunho: os alunos só veem esta fileira quando você publicar o curso em Conteúdos.</Aviso>;
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

/** Fileira "Módulos do curso": o curso (busca só de cursos) e o aviso quando falta capa 3:4 nos módulos. */
function CursoDaFileira({ f, cursos, rotulos, lembrarRotulo, mudar }: { f: FileiraVitrine; cursos: readonly CursoDoConstrutor[]; rotulos: Record<string, string>; lembrarRotulo: (id: string, rotulo: string) => void; mudar: (p: Partial<FileiraVitrine>) => void }) {
  const curso = cursos.find((c) => c.id === f.cursoId);
  const nome = f.cursoId ? (rotulos[f.cursoId] ?? curso?.titulo ?? "Curso removido") : null;
  const semCapa = curso ? curso.modulos - curso.modulosComCapa : 0;
  // Trocar não limpa o curso (config sem curso é inválida e o autosave recusaria).
  const [trocando, setTrocando] = useState(false);
  return (
    <Grupo rotulo="Curso">
      {() => (
        <>
          {nome && !trocando ? (
            <div className="flex items-center gap-2 rounded-[10px] border border-border bg-bg py-1 pr-1 pl-3">
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{nome}</span>
              {/* Texto, não X: no mesmo painel o X tira item da fileira manual. */}
              <Button type="button" variant="fantasma" size="36" aria-label="Trocar o curso" onClick={() => setTrocando(true)}>
                Trocar
              </Button>
            </div>
          ) : (
            <>
              <BuscaConteudo
                rotulo="Buscar o curso"
                tipos={["PRODUTO"]}
                onEscolher={(c) => {
                  lembrarRotulo(c.id, c.titulo);
                  mudar({ cursoId: c.id });
                  setTrocando(false);
                }}
              />
              {nome && (
                <Button type="button" variant="fantasma" size="36" className="self-start" onClick={() => setTrocando(false)}>
                  Manter {nome}
                </Button>
              )}
            </>
          )}
          <AvisoCursoRascunho curso={curso} />
          {curso && curso.modulos > 0 && semCapa > 0 && (
            <Aviso tom="info">
              {semCapa === curso.modulos ? "Os módulos deste curso ainda não têm capa" : `${semCapa} de ${curso.modulos} módulos sem capa`} (aparece a capa vertical 3:4 do curso). Envie as capas verticais (3:4) em Conteúdos &gt; módulo, botão &quot;Adicionar capa&quot;.
            </Aviso>
          )}
          {curso && curso.modulos === 0 && <p className="m-0 text-[11px] text-muted">Este curso ainda não tem módulo publicado com aula: a fileira não aparece para os alunos.</p>}
          <p className="m-0 text-[11px] text-muted">Na ordem do curso. Cada aluno vê só os módulos publicados.</p>
        </>
      )}
    </Grupo>
  );
}

/** Propriedades da fileira (protótipo): título, tipo, quantidade, ordenação, quem vê, itens, curso (módulos), visível. */
export function PropriedadesFileira({ fileira: f, grupos, cursos = [], rotulos, lembrarRotulo, onMudar, onDuplicar, onRemover }: PropriedadesFileiraProps) {
  const mudar = (p: Partial<FileiraVitrine>) => onMudar({ ...f, ...p });
  const primeiroCurso = cursos.find((c) => c.status !== "RASCUNHO")?.id ?? cursos[0]?.id;
  const trocarTipo = (tipo: TipoFileira) =>
    mudar({ tipo, ordenacao: ORDENACOES_DO_TIPO[tipo][0], itensManuais: tipo === "MANUAL" ? f.itensManuais : [], cursoId: tipo === "MODULOS" ? (f.cursoId ?? primeiroCurso) : undefined });
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
      {f.tipo === "MODULOS" && <CursoDaFileira f={f} cursos={cursos} rotulos={rotulos} lembrarRotulo={lembrarRotulo} mudar={mudar} />}
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
