"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { AreaTexto } from "@/components/ui/area-texto";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { CampoMoldura } from "@/components/ui/campo-moldura";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { Selecao } from "@/components/ui/selecao";
import { acaoCriarCanal, acaoRemoverCanal, acaoSalvarCanal } from "@/lib/actions/comunidade-moderacao";
import type { CanalParaEditar } from "@/lib/comunidade/canais";
import type { AcessoCanal, QuemPostaCanal } from "@/lib/db/schema/_enums";

export interface OpcoesCanal {
  grupos: readonly { id: string; nome: string }[];
  produtos: readonly { id: string; titulo: string }[];
}

interface Formulario {
  nome: string;
  descricao: string;
  acesso: AcessoCanal;
  grupoId: string;
  produtoId: string;
  quemPosta: QuemPostaCanal;
}

const SEM_CONEXAO = "Sem conexão com o servidor. Tente de novo.";
const ACESSOS: { valor: AcessoCanal; rotulo: string }[] = [
  { valor: "TODOS", rotulo: "Todos os membros" },
  { valor: "GRUPO", rotulo: "Um grupo" },
  { valor: "PRODUTO", rotulo: "Alunos de um curso" },
  { valor: "EQUIPE", rotulo: "Só a equipe" },
];

/** Dados do canal como a action espera (campo a campo; grupo/curso só no acesso certo). */
const dadosDe = (f: Formulario, ordem: number) => ({
  nome: f.nome,
  descricao: f.descricao,
  ordem,
  acesso: f.acesso,
  grupoId: f.acesso === "GRUPO" ? f.grupoId || null : null,
  produtoId: f.acesso === "PRODUTO" ? f.produtoId || null : null,
  quemPosta: f.quemPosta,
});
const formularioDe = (c: CanalParaEditar): Formulario => ({ nome: c.nome, descricao: c.descricao, acesso: c.acesso, grupoId: c.grupo?.id ?? "", produtoId: c.produto?.id ?? "", quemPosta: c.quemPosta });

/** Diálogo de criar/editar: nome, descrição, quem vê (todos, grupo, curso, equipe) e quem publica. */
function DialogoCanal({ aberto, titulo, inicial, padrao, opcoes, onFechar, onSalvar }: { aberto: boolean; titulo: string; inicial: Formulario; padrao?: boolean; opcoes: OpcoesCanal; onFechar: () => void; onSalvar: (f: Formulario) => Promise<string | null> }) {
  const [f, setF] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const mudar = (m: Partial<Formulario>) => setF((x) => ({ ...x, ...m }));
  const salvar = async () => {
    setSalvando(true);
    const e = await onSalvar(f).catch(() => SEM_CONEXAO);
    setSalvando(false);
    setErro(e);
  };
  return (
    <DialogoAdmin
      aberto={aberto}
      onFechar={onFechar}
      titulo={titulo}
      descricao={padrao ? "O canal padrão é de todos os membros e não pode ser removido." : "Quem vê o canal também comenta nele; quem publica pode ficar só com a equipe (avisos)."}
      rodape={
        <>
          <Button variant="contorno" size="42" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button size="42" carregando={salvando} disabled={f.nome.trim().length < 2} onClick={() => void salvar()}>
            Salvar canal
          </Button>
        </>
      }
    >
      <Campo rotulo="Nome" tamanho="42" maxLength={60} value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} placeholder="Ex.: Dúvidas das aulas" />
      <AreaTexto rotulo="Descrição (opcional)" rows={2} maxLength={280} value={f.descricao} onChange={(e) => mudar({ descricao: e.target.value })} />
      {!padrao && (
        <CampoMoldura id="acesso-canal" rotulo="Quem vê">
          <GrupoChips id="acesso-canal" aria-labelledby="acesso-canal-rotulo" opcoes={ACESSOS} valor={f.acesso} onMudar={(v) => mudar({ acesso: v as AcessoCanal })} />
        </CampoMoldura>
      )}
      {f.acesso === "GRUPO" && <Selecao rotulo="Grupo" vazio="Escolha o grupo" opcoes={opcoes.grupos.map((g) => ({ valor: g.id, rotulo: g.nome }))} value={f.grupoId} onChange={(e) => mudar({ grupoId: e.target.value })} />}
      {f.acesso === "PRODUTO" && <Selecao rotulo="Curso" vazio="Escolha o curso" opcoes={opcoes.produtos.map((p) => ({ valor: p.id, rotulo: p.titulo }))} value={f.produtoId} onChange={(e) => mudar({ produtoId: e.target.value })} />}
      <CampoMoldura id="quem-posta-canal" rotulo="Quem publica">
        <GrupoChips
          id="quem-posta-canal"
          aria-labelledby="quem-posta-canal-rotulo"
          opcoes={[
            { valor: "TODOS", rotulo: "Quem vê o canal" },
            { valor: "EQUIPE", rotulo: "Só a equipe (avisos)" },
          ]}
          valor={f.quemPosta}
          onMudar={(v) => mudar({ quemPosta: v as QuemPostaCanal })}
        />
      </CampoMoldura>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </DialogoAdmin>
  );
}

/** Botão "Novo canal" do cabeçalho (entra no fim da ordem). */
export function NovoCanal({ proximaOrdem, opcoes }: { proximaOrdem: number; opcoes: OpcoesCanal }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button size="36" onClick={() => setAberto(true)}>
        <Plus className="size-3.5" aria-hidden />
        Novo canal
      </Button>
      {aberto && (
        <DialogoCanal
          aberto
          titulo="Novo canal"
          inicial={{ nome: "", descricao: "", acesso: "TODOS", grupoId: "", produtoId: "", quemPosta: "TODOS" }}
          opcoes={opcoes}
          onFechar={() => setAberto(false)}
          onSalvar={async (f) => {
            const r = await acaoCriarCanal(dadosDe(f, proximaOrdem));
            if (!r.ok) return r.erro;
            setAberto(false);
            router.refresh();
            return null;
          }}
        />
      )}
    </>
  );
}

/**
 * ⋮ da linha: editar, subir/descer (renumera 1..n e grava só os que mudaram, cada um com a sua
 * trava) e remover (modal block; o padrão não sai).
 */
export function AcoesCanal({ canal, todos, opcoes }: { canal: CanalParaEditar; todos: readonly CanalParaEditar[]; opcoes: OpcoesCanal }) {
  const router = useRouter();
  const [dialogo, setDialogo] = useState<"editar" | "remover" | null>(null);
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const i = todos.findIndex((c) => c.id === canal.id);

  const mover = async (delta: -1 | 1) => {
    const lista = [...todos];
    [lista[i], lista[i + delta]] = [lista[i + delta], lista[i]];
    setErro(null);
    for (const [pos, c] of lista.entries()) {
      if (c.ordem === pos + 1) continue;
      const r = await acaoSalvarCanal({ canalId: c.id, versao: c.versao, dados: dadosDe(formularioDe(c), pos + 1) }).catch(() => null);
      if (!r?.ok) {
        setErro(r?.erro ?? SEM_CONEXAO);
        break;
      }
    }
    router.refresh();
  };
  const remover = async () => {
    setRodando(true);
    const r = await acaoRemoverCanal({ canalId: canal.id, versao: canal.versao }).catch(() => null);
    setRodando(false);
    setDialogo(null);
    if (!r?.ok) return setErro(r?.erro ?? SEM_CONEXAO);
    router.refresh();
  };

  const candidatos: (ItemMenuAdmin | false)[] = [
    { rotulo: "Editar", icone: <Pencil />, onSelecionar: () => setDialogo("editar") },
    i > 0 && { rotulo: "Subir", icone: <ArrowUp />, onSelecionar: () => void mover(-1) },
    i < todos.length - 1 && { rotulo: "Descer", icone: <ArrowDown />, onSelecionar: () => void mover(1) },
    !canal.padrao && { rotulo: "Remover", icone: <Trash2 />, perigo: true, onSelecionar: () => setDialogo("remover") },
  ];
  return (
    <div className="flex justify-center">
      <MenuAdmin gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações do canal ${canal.nome}`} className="text-muted" />} itens={candidatos.filter((x): x is ItemMenuAdmin => !!x)}>
        <MoreVertical aria-hidden />
      </MenuAdmin>
      {erro && (
        <Aviso tom="erro" className="fixed right-4 bottom-4 z-50 max-w-sm bg-surface shadow-card">
          {erro}
        </Aviso>
      )}
      {dialogo === "editar" && (
        <DialogoCanal
          aberto
          titulo={`Editar # ${canal.nome}`}
          inicial={formularioDe(canal)}
          padrao={canal.padrao}
          opcoes={opcoes}
          onFechar={() => setDialogo(null)}
          onSalvar={async (f) => {
            const r = await acaoSalvarCanal({ canalId: canal.id, versao: canal.versao, dados: dadosDe(f, canal.ordem) });
            if (!r.ok) return r.erro;
            setDialogo(null);
            router.refresh();
            return null;
          }}
        />
      )}
      <ModalConfirmacaoBlock
        aberto={dialogo === "remover"}
        titulo={`Remover # ${canal.nome}?`}
        mensagem={`O canal some da comunidade${canal.publicacoes ? ` junto com as ${canal.publicacoes} publicações dele` : ""}. A remoção fica registrada na trilha.`}
        textoConfirmar="Remover canal"
        carregando={rodando}
        onCancelar={() => setDialogo(null)}
        onConfirmar={() => void remover()}
      />
    </div>
  );
}
