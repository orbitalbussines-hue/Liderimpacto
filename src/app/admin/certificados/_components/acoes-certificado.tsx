"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban, Download, ExternalLink, History, MoreVertical, RefreshCw } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { AreaTexto } from "@/components/ui/area-texto";
import { acaoBaixarCertificado, acaoGerarNovaVersaoCertificado, acaoRevogarCertificado } from "@/lib/actions/certificados";
import type { Resultado } from "@/lib/acao";

export interface CertificadoDaLinha {
  id: string;
  codigo: string;
  codigoLegivel: string;
  aluno: string;
  curso: string;
  revogado: boolean;
  /** Há alguma versão PRONTA para baixar (última pronta). */
  podeBaixar: boolean;
  /** `updated_at` ISO do certificado (trava da revogação). */
  versao: string;
  /** Link que abre o histórico de versões (`?versoes=<id>`). */
  hrefVersoes: string;
}

type Aberto = "nova-versao" | "revogar" | "confirmar-revogar" | null;

/**
 * Menu "⋮" do certificado: baixar, gerar nova versão do PDF (modal block), ver versões,
 * página pública e revogar com motivo (modal block). A action confere tudo de novo.
 */
export function AcoesCertificado({ certificado: c }: { certificado: CertificadoDaLinha }) {
  const router = useRouter();
  const [aberto, setAberto] = useState<Aberto>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const rodar = (acao: () => Promise<Resultado<unknown>>, depois?: (dados: unknown) => void) =>
    iniciar(async () => {
      const r = await acao().catch(() => null);
      setAberto(null);
      if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
      if (!r.ok) return setErro(r.erro);
      setMotivo("");
      if (depois) depois(r.dados);
      else router.refresh();
    });

  const itens: ItemMenuAdmin[] = [];
  if (c.podeBaixar && !c.revogado)
    itens.push({
      rotulo: "Baixar PDF",
      icone: <Download />,
      onSelecionar: () => rodar(() => acaoBaixarCertificado({ certificadoId: c.id }), (d) => window.location.assign((d as { url: string }).url)),
    });
  if (!c.revogado) itens.push({ rotulo: "Gerar nova versão", icone: <RefreshCw />, onSelecionar: () => setAberto("nova-versao") });
  itens.push({ rotulo: "Ver versões", icone: <History />, href: c.hrefVersoes });
  if (!c.revogado) itens.push({ rotulo: "Página de verificação", icone: <ExternalLink />, href: `/certificado/${c.codigo}` });
  if (!c.revogado) itens.push({ rotulo: "Revogar", icone: <Ban />, perigo: true, onSelecionar: () => setAberto("revogar") });

  return (
    <div className="flex justify-center">
      <MenuAdmin gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações do certificado ${c.codigoLegivel} de ${c.aluno}`} className="text-muted" />} itens={itens}>
        <MoreVertical aria-hidden />
      </MenuAdmin>

      <ModalConfirmacaoBlock
        aberto={aberto === "nova-versao"}
        titulo="Gerar nova versão do PDF"
        mensagem={`Gera a próxima versão do certificado ${c.codigoLegivel} (${c.aluno}, ${c.curso}) com os dados e o modelo de agora. As versões anteriores ficam no histórico; o aluno passa a baixar a nova quando ficar pronta.`}
        textoConfirmar="Gerar nova versão"
        carregando={pendente}
        onCancelar={() => setAberto(null)}
        onConfirmar={() => rodar(() => acaoGerarNovaVersaoCertificado({ certificadoId: c.id }))}
      />

      <DialogoAdmin
        aberto={aberto === "revogar"}
        onFechar={() => setAberto(null)}
        titulo="Revogar certificado"
        descricao={`${c.aluno} · ${c.curso} · ${c.codigoLegivel}. A verificação pública passa a dizer "revogado" e o PDF deixa de ser baixado. O motivo fica na trilha (não aparece na página pública).`}
        rodape={
          <>
            <Button variant="contorno" size="42" onClick={() => setAberto(null)}>
              Voltar
            </Button>
            <Button variant="perigo" size="42" disabled={motivo.trim().length < 3} onClick={() => setAberto("confirmar-revogar")}>
              Continuar
            </Button>
          </>
        }
      >
        <AreaTexto rotulo="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} minLength={3} maxLength={500} rows={3} ajuda="Mínimo de 3 caracteres." />
      </DialogoAdmin>

      <ModalConfirmacaoBlock
        aberto={aberto === "confirmar-revogar"}
        titulo="Revogar certificado"
        mensagem={`Revogar o certificado ${c.codigoLegivel} de ${c.aluno} em ${c.curso}. Motivo: ${motivo.trim()}. O registro não é apagado, mas o certificado perde a validade.`}
        textoConfirmar="Revogar"
        carregando={pendente}
        onCancelar={() => setAberto("revogar")}
        onConfirmar={() => rodar(() => acaoRevogarCertificado({ certificadoId: c.id, versao: c.versao, motivo }))}
      />

      <DialogoAdmin
        aberto={erro !== null}
        onFechar={() => setErro(null)}
        titulo="Não foi possível concluir"
        rodape={
          <Button size="42" onClick={() => setErro(null)}>
            Entendi
          </Button>
        }
      >
        <Aviso tom="erro">{erro}</Aviso>
      </DialogoAdmin>
    </div>
  );
}
