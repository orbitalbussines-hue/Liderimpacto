"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarClock, MoreVertical, RotateCcw, XCircle } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { acaoAlterarExpiracao, acaoCancelarMatricula, acaoReativarMatricula } from "@/lib/actions/matriculas";
import { dataEmBrasilia, type SituacaoMatricula } from "@/lib/matriculas/regras";

export interface MatriculaDaLinha {
  id: string;
  nome: string;
  produto: string;
  situacao: SituacaoMatricula;
  /** ISO da expiração atual (ou null). */
  expiraEm: string | null;
  /** `updated_at` ISO (trava de colisão). */
  versao: string;
}

type Aberto = "expiracao" | "reativar" | "cancelar" | null;

/**
 * Menu "⋮" da matrícula: alterar expiração, cancelar (motivo + modal block) e reativar. Esconder
 * item é conforto: a action confere tudo de novo, com a versão que a tela abriu.
 */
export function AcoesMatricula({ matricula }: { matricula: MatriculaDaLinha }) {
  const router = useRouter();
  const [aberto, setAberto] = useState<Aberto>(null);
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);
  const [data, setData] = useState(matricula.expiraEm ? dataEmBrasilia(new Date(matricula.expiraEm)) : "");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const cancelada = matricula.situacao === "CANCELADA";

  const fechar = () => {
    setAberto(null);
    setErro(null);
  };
  const rodar = (acao: () => Promise<{ ok: true } | { ok: false; erro: string }>) =>
    iniciar(async () => {
      const r = await acao();
      setConfirmarCancelamento(false);
      if (!r.ok) return setErro(r.erro);
      fechar();
      router.refresh();
    });

  const itens: ItemMenuAdmin[] = [];
  if (!cancelada && matricula.situacao !== "EXPIRADA") itens.push({ rotulo: "Alterar expiração", icone: <CalendarClock />, onSelecionar: () => setAberto("expiracao") });
  if (matricula.situacao !== "ATIVA") itens.push({ rotulo: "Reativar", icone: <RotateCcw />, onSelecionar: () => setAberto("reativar") });
  if (!cancelada) itens.push({ rotulo: "Cancelar matrícula", icone: <XCircle />, perigo: true, onSelecionar: () => setAberto("cancelar") });

  const campoData = (
    <Campo
      rotulo={aberto === "reativar" ? "Nova expiração (opcional)" : "Expira em"}
      type="date"
      tamanho="42"
      min={dataEmBrasilia(new Date())}
      value={data}
      onChange={(e) => setData(e.target.value)}
      ajuda="Vazio = sem expiração. Vale até o fim do dia (horário de Brasília)."
      erro={erro ?? undefined}
    />
  );
  const botoes = (rotulo: string, onClick: () => void, desabilitado = false) => (
    <>
      <Button variant="contorno" size="42" onClick={fechar}>
        Voltar
      </Button>
      <Button size="42" carregando={pendente} disabled={desabilitado} onClick={onClick}>
        {rotulo}
      </Button>
    </>
  );

  return (
    <div className="flex justify-center">
      <MenuAdmin gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações da matrícula de ${matricula.nome}`} className="text-muted" />} itens={itens}>
        <MoreVertical aria-hidden />
      </MenuAdmin>

      <DialogoAdmin
        aberto={aberto === "expiracao"}
        onFechar={fechar}
        titulo="Alterar expiração"
        descricao={`${matricula.nome} em ${matricula.produto}.`}
        rodape={botoes("Salvar", () => rodar(() => acaoAlterarExpiracao({ matriculaId: matricula.id, versao: matricula.versao, expiraEm: data || null })))}
      >
        {campoData}
      </DialogoAdmin>

      <DialogoAdmin
        aberto={aberto === "reativar"}
        onFechar={fechar}
        titulo="Reativar matrícula"
        descricao={`${matricula.nome} volta a acessar ${matricula.produto}.`}
        rodape={botoes("Reativar", () => rodar(() => acaoReativarMatricula({ matriculaId: matricula.id, versao: matricula.versao, expiraEm: data || null })))}
      >
        {campoData}
      </DialogoAdmin>

      <DialogoAdmin
        aberto={aberto === "cancelar" && !confirmarCancelamento}
        onFechar={fechar}
        titulo="Cancelar matrícula"
        descricao={`${matricula.nome} perde o acesso a ${matricula.produto} na próxima página que abrir. O motivo fica na trilha.`}
        rodape={botoes("Continuar", () => setConfirmarCancelamento(true), motivo.trim().length < 3)}
      >
        <Campo rotulo="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} minLength={3} maxLength={300} tamanho="42" erro={erro ?? undefined} />
      </DialogoAdmin>

      <ModalConfirmacaoBlock
        aberto={aberto === "cancelar" && confirmarCancelamento}
        titulo="Cancelar matrícula"
        mensagem={`Cancelar a matrícula de ${matricula.nome} em ${matricula.produto}. Motivo: ${motivo.trim()}. A matrícula não é apagada: pode ser reativada depois.`}
        textoConfirmar="Cancelar matrícula"
        carregando={pendente}
        onCancelar={() => setConfirmarCancelamento(false)}
        onConfirmar={() => rodar(() => acaoCancelarMatricula({ matriculaId: matricula.id, versao: matricula.versao, motivo }))}
      />
    </div>
  );
}
