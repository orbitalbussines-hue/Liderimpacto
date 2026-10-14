"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { GraduationCap, KeyRound, MoreVertical, Power, ShieldCheck, Trash2, Users } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { DialogoMatricular, type DialogoMatricularProps } from "@/components/matriculas/dialogo-matricular";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import type { Resultado } from "@/lib/acao";
import { acaoAlterarSituacaoMembro, acaoDefinirGruposDoMembro, acaoMudarPapel, acaoRemoverMembro } from "@/lib/actions/membros-gestao";
import type { PapelCriador, StatusMembro } from "@/lib/db/schema/_enums";
import { podeGerir, podeMudarPapel } from "@/lib/membros/regras";
import { ROTULO_PAPEL } from "./comum";
import { DialogoGrupos, DialogoLink, DialogoPapel } from "./dialogos-membro";

export interface MembroDaLinha {
  id: string;
  usuarioId: string;
  nome: string;
  papel: PapelCriador;
  status: StatusMembro;
  /** `updated_at` ISO do vínculo (trava de colisão). */
  versao: string;
  grupoIds: string[];
  email: string;
  imagem: string | null;
}

export interface AcoesMembroProps {
  membro: MembroDaLinha;
  grupos: readonly { id: string; nome: string }[];
  /** Produtos do criador para "Matricular em…". */
  produtos: DialogoMatricularProps["produtos"];
  ator: { usuarioId: string; papel: PapelCriador };
}

type Aberto = "link" | "papel" | "grupos" | "matricular" | null;
type Critica = { titulo: string; mensagem: string; texto: string; executar: () => Promise<Resultado<null>> } | null;

/**
 * Menu "⋮" da linha de membro. Esconder item é conforto: a action confere tudo de novo.
 * Ações críticas (papel, inativar, remover) passam pelo ModalConfirmacaoBlock.
 */
export function AcoesMembro({ membro, grupos, produtos, ator }: AcoesMembroProps) {
  const router = useRouter();
  const [aberto, setAberto] = useState<Aberto>(null);
  const [critica, setCritica] = useState<Critica>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const proprio = membro.usuarioId === ator.usuarioId;
  const gerir = podeGerir(ator.papel, membro.papel) && !proprio;
  const inativo = membro.status === "INATIVO";

  const rodar = (acao: () => Promise<Resultado<null>>) =>
    iniciar(async () => {
      const r = await acao();
      setCritica(null);
      if (!r.ok) return setErro(r.erro);
      setAberto(null);
      router.refresh();
    });

  const itens: ItemMenuAdmin[] = [{ rotulo: "Matricular em…", icone: <GraduationCap />, onSelecionar: () => setAberto("matricular") }];
  if (gerir) itens.push({ rotulo: "Gerar link de senha", icone: <KeyRound />, onSelecionar: () => setAberto("link") });
  if (podeMudarPapel(ator.papel)) itens.push({ rotulo: "Mudar papel", icone: <ShieldCheck />, onSelecionar: () => setAberto("papel") });
  if (podeGerir(ator.papel, membro.papel)) itens.push({ rotulo: "Grupos", icone: <Users />, onSelecionar: () => setAberto("grupos") });
  if (gerir) {
    itens.push({
      rotulo: inativo ? "Reativar" : "Inativar",
      icone: <Power />,
      onSelecionar: () =>
        setCritica({
          titulo: inativo ? "Reativar membro" : "Inativar membro",
          mensagem: inativo
            ? `${membro.nome} volta a entrar nesta área com a mesma conta.`
            : `${membro.nome} perde o acesso a esta área na próxima página que abrir. Matrículas e histórico ficam guardados.`,
          texto: inativo ? "Reativar" : "Inativar",
          executar: () => acaoAlterarSituacaoMembro({ membroId: membro.id, status: inativo ? "ATIVO" : "INATIVO", versao: membro.versao }),
        }),
    });
    itens.push({
      rotulo: "Remover da área",
      icone: <Trash2 />,
      perigo: true,
      onSelecionar: () =>
        setCritica({
          titulo: "Remover membro",
          mensagem: `${membro.nome} deixa de ser membro desta área e sai de todos os grupos. A conta na plataforma continua (pode ser cadastrada de novo depois). Fica registrado na trilha.`,
          texto: "Remover",
          executar: () => acaoRemoverMembro({ membroId: membro.id, versao: membro.versao }),
        }),
    });
  }

  return (
    <div className="flex justify-center">
      <MenuAdmin gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações de ${membro.nome}`} className="text-muted" />} itens={itens}>
        <MoreVertical aria-hidden />
      </MenuAdmin>

      {aberto === "matricular" && (
        <DialogoMatricular
          aberto
          onFechar={() => setAberto(null)}
          produtos={produtos}
          grupos={grupos}
          membroInicial={{ id: membro.id, nome: membro.nome, email: membro.email, imagem: membro.imagem }}
        />
      )}
      <DialogoLink aberto={aberto === "link"} onFechar={() => setAberto(null)} nome={membro.nome} usuarioId={membro.usuarioId} />
      <DialogoPapel
        aberto={aberto === "papel"}
        onFechar={() => setAberto(null)}
        nome={membro.nome}
        papel={membro.papel}
        onEscolher={(papel) => {
          setAberto(null);
          setCritica({
            titulo: "Mudar papel",
            mensagem: `${membro.nome}: ${ROTULO_PAPEL[membro.papel]} → ${ROTULO_PAPEL[papel]}.${papel === "DONO" ? " Dono tem acesso a tudo, inclusive financeiro, equipe e configurações." : ""}`,
            texto: "Confirmar papel",
            executar: () => acaoMudarPapel({ membroId: membro.id, papel, versao: membro.versao }),
          });
        }}
      />
      {aberto === "grupos" && (
        <DialogoGrupos
          aberto
          onFechar={() => setAberto(null)}
          nome={membro.nome}
          grupos={grupos}
          marcados={membro.grupoIds}
          erro={erro}
          pendente={pendente}
          onSalvar={(grupoIds) => {
            setErro(null);
            rodar(() => acaoDefinirGruposDoMembro({ membroId: membro.id, grupoIds, versao: membro.versao }));
          }}
        />
      )}

      <ModalConfirmacaoBlock
        aberto={critica !== null}
        titulo={critica?.titulo ?? ""}
        mensagem={critica?.mensagem ?? ""}
        textoConfirmar={critica?.texto}
        carregando={pendente}
        onCancelar={() => setCritica(null)}
        onConfirmar={() => critica && rodar(critica.executar)}
      />
      <DialogoAdmin
        aberto={erro !== null && aberto !== "grupos"}
        onFechar={() => setErro(null)}
        titulo="Não foi possível concluir"
        descricao={erro}
        rodape={
          <Button size="42" onClick={() => setErro(null)}>
            Entendi
          </Button>
        }
      />
    </div>
  );
}
