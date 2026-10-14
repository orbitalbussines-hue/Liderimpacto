"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarClock, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { ListaOrdenavel, useOrdemPersistida, type ControlesOrdem } from "@/components/admin/lista-ordenavel";
import { MenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { CampoMoldura } from "@/components/ui/campo-moldura";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { Selo } from "@/components/ui/selo";
import type { Resultado } from "@/lib/acao";
import { acaoCriarAula, acaoEditarModulo, acaoReordenarAulas, acaoRemoverAula, acaoRemoverModulo } from "@/lib/actions/produtos-estrutura";
import { ROTULO_STATUS_MODULO } from "@/lib/catalogo/regras";
import { STATUS_MODULO, type StatusModulo } from "@/lib/db/schema/_enums";
import { DialogoTitulo } from "./dialogo-titulo";

export interface AulaDaEstrutura {
  id: string;
  titulo: string;
  versao: string;
  /** Rótulo pronto da liberação ("Libera 01/11 · 09:00") ou null. */
  libera: string | null;
}

export interface ModuloDaEstrutura {
  id: string;
  titulo: string;
  status: StatusModulo;
  versao: string;
  aulas: AulaDaEstrutura[];
}

/** Roda a action; erro fica na tela, sucesso recarrega (versões novas vêm do servidor). */
export function useAcaoEstrutura() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (acao: () => Promise<Resultado<unknown>>, aoConcluir?: () => void) =>
    iniciar(async () => {
      setErro(null);
      const r = await acao();
      if (!r.ok) return setErro(r.erro);
      aoConcluir?.();
      router.refresh();
    });
  return { erro, setErro, pendente, rodar };
}

function LinhaAula({ aula, numero, produtoId, controles }: { aula: AulaDaEstrutura; numero: number; produtoId: string; controles: ControlesOrdem }) {
  const [removendo, setRemovendo] = useState(false);
  const { erro, setErro, pendente, rodar } = useAcaoEstrutura();
  const editar = `/admin/conteudos/${produtoId}/aulas/${aula.id}`;
  return (
    <div className="flex min-h-12 items-center gap-1.5 border-t border-border py-1 pr-1 pl-1.5">
      {controles.alca}
      <span className="w-6 shrink-0 text-center text-xs font-bold text-muted tabular-nums">{numero}</span>
      <div className="min-w-0 flex-1">
        <Link href={editar} className="block truncate text-[13px] font-semibold text-text hover:text-accent">
          {aula.titulo}
        </Link>
        {aula.libera && (
          <span className="flex items-center gap-1 text-xs text-muted">
            <CalendarClock className="size-3" aria-hidden />
            {aula.libera}
          </span>
        )}
        {erro && (
          <span role="alert" className="block text-xs font-semibold text-warn">
            {erro}
          </span>
        )}
      </div>
      {controles.subirDescer}
      <MenuAdmin
        gatilho={<Button variant="fantasma" size="icone36" aria-label={`Ações da aula ${aula.titulo}`} className="text-muted" />}
        itens={[
          { rotulo: "Editar aula", icone: <Pencil />, href: editar },
          { rotulo: "Remover", icone: <Trash2 />, perigo: true, onSelecionar: () => {
            setErro(null);
            setRemovendo(true);
          } },
        ]}
      >
        <MoreVertical aria-hidden />
      </MenuAdmin>
      <ModalConfirmacaoBlock
        aberto={removendo}
        titulo="Remover aula"
        mensagem={`"${aula.titulo}" sai do módulo com os materiais (exclusão lógica, fica na trilha). Thumb e anexos são apagados do armazenamento.`}
        textoConfirmar="Remover"
        carregando={pendente}
        onCancelar={() => setRemovendo(false)}
        onConfirmar={() => {
          setRemovendo(false);
          rodar(() => acaoRemoverAula({ aulaId: aula.id, versao: aula.versao }));
        }}
      />
    </div>
  );
}

export interface ModuloEstruturaProps {
  modulo: ModuloDaEstrutura;
  numero: number;
  produtoId: string;
  controles: ControlesOrdem;
}

/** Cartão do módulo: alça, título e situação, menu (editar/remover) e as aulas reordenáveis. */
export function ModuloEstrutura({ modulo, numero, produtoId, controles }: ModuloEstruturaProps) {
  const aulas = useOrdemPersistida(modulo.aulas, (itens) => acaoReordenarAulas({ moduloId: modulo.id, itens }));
  const [dialogo, setDialogo] = useState<"editar" | "aula" | "remover" | null>(null);
  const [status, setStatus] = useState<StatusModulo>(modulo.status);
  const { erro, setErro, pendente, rodar } = useAcaoEstrutura();
  const abrir = (d: typeof dialogo) => {
    setErro(null);
    setStatus(modulo.status);
    setDialogo(d);
  };
  const fechar = () => setDialogo(null);

  return (
    <section aria-label={`Módulo ${numero}: ${modulo.titulo}`} className="mb-3 overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-1.5 bg-surface-2 py-1.5 pr-1 pl-1.5">
        {controles.alca}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold tracking-[.08em] text-muted uppercase">Módulo {numero}</div>
          <div className="flex items-center gap-2">
            <h3 className="m-0 truncate text-sm font-extrabold">{modulo.titulo}</h3>
            {modulo.status === "RASCUNHO" && (
              <Selo tom="neutro" forma="etiqueta">
                Rascunho
              </Selo>
            )}
          </div>
        </div>
        {controles.subirDescer}
        <MenuAdmin
          gatilho={<Button variant="fantasma" size="icone36" aria-label={`Ações do módulo ${modulo.titulo}`} className="text-muted" />}
          itens={[
            { rotulo: "Renomear e situação", icone: <Pencil />, onSelecionar: () => abrir("editar") },
            { rotulo: "Remover módulo", icone: <Trash2 />, perigo: true, onSelecionar: () => abrir("remover") },
          ]}
        >
          <MoreVertical aria-hidden />
        </MenuAdmin>
      </div>

      {aulas.itens.length > 0 ? (
        <ListaOrdenavel
          itens={aulas.itens}
          rotulo={(a) => `Aula ${a.titulo}`}
          onReordenar={aulas.reordenar}
          desabilitado={aulas.pendente}
          renderItem={(aula, c) => <LinhaAula aula={aula} numero={aulas.itens.indexOf(aula) + 1} produtoId={produtoId} controles={c} />}
        />
      ) : (
        <p className="m-0 border-t border-border px-4 py-3 text-[13px] text-muted">Nenhuma aula neste módulo.</p>
      )}
      {(aulas.erro || (erro && dialogo === null)) && (
        <p role="alert" className="m-0 border-t border-border px-4 py-2 text-[13px] font-semibold text-warn">
          {aulas.erro ?? erro}
        </p>
      )}
      <div className="border-t border-border px-2 py-1.5">
        <Button variant="fantasma" size="36" onClick={() => abrir("aula")}>
          <Plus className="size-3.5" aria-hidden />
          Nova aula
        </Button>
      </div>

      <DialogoTitulo
        aberto={dialogo === "aula"}
        onFechar={fechar}
        titulo="Nova aula"
        descricao={`No módulo "${modulo.titulo}". Vídeo, materiais e capítulos ficam no editor da aula.`}
        textoSalvar="Criar aula"
        carregando={pendente}
        erro={erro}
        onSalvar={(titulo) => rodar(() => acaoCriarAula({ moduloId: modulo.id, titulo }), fechar)}
      />
      <DialogoTitulo
        aberto={dialogo === "editar"}
        onFechar={fechar}
        titulo="Editar módulo"
        inicial={modulo.titulo}
        textoSalvar="Salvar"
        carregando={pendente}
        erro={erro}
        onSalvar={(titulo) => rodar(() => acaoEditarModulo({ moduloId: modulo.id, versao: modulo.versao, titulo, status }), fechar)}
      >
        <CampoMoldura id={`situacao-${modulo.id}`} rotulo="Situação" ajuda="Módulo em rascunho não aparece para os alunos.">
          <GrupoChips
            id={`situacao-${modulo.id}`}
            aria-labelledby={`situacao-${modulo.id}-rotulo`}
            opcoes={STATUS_MODULO.map((s) => ({ valor: s, rotulo: ROTULO_STATUS_MODULO[s] }))}
            valor={status}
            onMudar={setStatus}
          />
        </CampoMoldura>
      </DialogoTitulo>
      <ModalConfirmacaoBlock
        aberto={dialogo === "remover"}
        titulo="Remover módulo"
        mensagem={
          modulo.aulas.length > 0
            ? `"${modulo.titulo}" tem ${modulo.aulas.length} ${modulo.aulas.length === 1 ? "aula" : "aulas"}: a remoção será recusada. Remova as aulas antes.`
            : `"${modulo.titulo}" sai do produto (exclusão lógica, fica na trilha).`
        }
        textoConfirmar="Remover"
        carregando={pendente}
        onCancelar={fechar}
        onConfirmar={() => {
          fechar();
          rodar(() => acaoRemoverModulo({ moduloId: modulo.id, versao: modulo.versao }));
        }}
      />
    </section>
  );
}
