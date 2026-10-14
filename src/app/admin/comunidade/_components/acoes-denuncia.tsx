"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ExternalLink, EyeOff, MoreVertical, VolumeX } from "lucide-react";
import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { DialogoMotivo } from "@/components/comunidade/dialogo-motivo";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { acaoOcultar, acaoResolverDenuncia, acaoSilenciarMembro } from "@/lib/actions/comunidade-moderacao";
import { SILENCIO_DIAS_MAX } from "@/lib/comunidade/regras";
import type { DenunciaDaFila } from "@/lib/comunidade/moderacao";

const SEM_CONEXAO = "Sem conexão com o servidor. Tente de novo.";

/** Onde o conteúdo denunciado aparece (post aberto ou aba de comentários da aula). */
export const hrefDoAlvo = (a: DenunciaDaFila["alvo"]) => (a.postId ? `/comunidade?post=${a.postId}` : a.aulaId ? `/aula/${a.aulaId}?aba=comentarios` : null);

/**
 * Ações da fila de denúncias (DONO/ADMIN), todas pelo modal block: ocultar o conteúdo (motivo,
 * trava do ALVO), manter (descarta a denúncia) e silenciar o autor (dias + motivo). Agir resolve
 * a denúncia com a decisão escrita; a trilha registra as duas coisas.
 */
export function AcoesDenuncia({ d }: { d: DenunciaDaFila }) {
  const router = useRouter();
  const [aberto, setAberto] = useState<"ocultar" | "manter" | "silenciar" | null>(null);
  const [dias, setDias] = useState("7");
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const href = hrefDoAlvo(d.alvo);
  const nomeAlvo = d.alvo.tipo === "POST" ? "a publicação" : "o comentário";
  const alvoId = d.alvo.tipo === "POST" ? { postId: d.alvo.id } : { comentarioId: d.alvo.id };

  const resolver = async (situacao: "RESOLVIDA" | "DESCARTADA", decisao: string) => {
    const r = await acaoResolverDenuncia({ denunciaId: d.id, versao: d.versao, situacao, decisao });
    router.refresh();
    return r.ok ? null : r.erro;
  };

  const manter = async () => {
    setRodando(true);
    const e = await resolver(d.alvo.removido ? "RESOLVIDA" : "DESCARTADA", d.alvo.removido ? "Conteúdo já removido" : "Conteúdo mantido").catch(() => SEM_CONEXAO);
    setRodando(false);
    setAberto(null);
    setErro(e);
  };

  const abertaENaoRemovida = d.situacao === "ABERTA" && !d.alvo.removido;
  const candidatos: (ItemMenuAdmin | false)[] = [
    !!href && !d.alvo.removido && { rotulo: d.alvo.postId ? "Abrir na comunidade" : "Abrir na aula", icone: <ExternalLink />, href },
    abertaENaoRemovida && !d.alvo.oculto && { rotulo: "Ocultar conteúdo", icone: <EyeOff />, onSelecionar: () => setAberto("ocultar") },
    d.situacao === "ABERTA" && { rotulo: d.alvo.removido ? "Encerrar denúncia" : "Manter conteúdo", icone: <Check />, onSelecionar: () => setAberto("manter") },
    abertaENaoRemovida && !d.alvo.autor.equipe && { rotulo: "Silenciar autor", icone: <VolumeX />, perigo: true, onSelecionar: () => setAberto("silenciar") },
  ];
  const itens = candidatos.filter((i): i is ItemMenuAdmin => !!i);
  if (itens.length === 0) return null;

  const diasNum = Number.parseInt(dias, 10);
  return (
    <div className="flex flex-col items-center gap-1">
      <MenuAdmin gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações da denúncia de ${d.denunciante.nome}`} className="text-muted" />} itens={itens}>
        <MoreVertical aria-hidden />
      </MenuAdmin>
      {erro && (
        <Aviso tom="erro" className="fixed right-4 bottom-4 z-50 max-w-sm bg-surface shadow-card">
          {erro}
        </Aviso>
      )}

      <DialogoMotivo
        aberto={aberto === "ocultar"}
        onFechar={() => setAberto(null)}
        titulo="Ocultar conteúdo"
        descricao={`${d.alvo.tipo === "POST" ? "A publicação" : "O comentário"} de ${d.alvo.autor.nome} some para a turma. O autor vê o motivo.`}
        inicial={d.motivo}
        textoConfirmar="Ocultar"
        confirmacao={(motivo) => ({ titulo: "Ocultar e resolver a denúncia?", mensagem: `${nomeAlvo[0].toUpperCase()}${nomeAlvo.slice(1)} de ${d.alvo.autor.nome} deixa de aparecer para a turma e a denúncia fica resolvida. Motivo: ${motivo}` })}
        onConfirmar={async (motivo) => {
          const r = await acaoOcultar({ ...alvoId, versao: d.alvo.versao, ocultar: true, motivo });
          if (!r.ok) return r.erro;
          return resolver("RESOLVIDA", `Conteúdo ocultado: ${motivo}`);
        }}
      />

      <ModalConfirmacaoBlock
        aberto={aberto === "manter"}
        titulo={d.alvo.removido ? "Encerrar a denúncia?" : "Manter o conteúdo?"}
        mensagem={d.alvo.removido ? "O conteúdo já foi removido. A denúncia sai da fila como resolvida." : `${nomeAlvo[0].toUpperCase()}${nomeAlvo.slice(1)} continua visível e a denúncia sai da fila como descartada.`}
        textoConfirmar={d.alvo.removido ? "Encerrar" : "Manter"}
        carregando={rodando}
        onCancelar={() => setAberto(null)}
        onConfirmar={() => void manter()}
      />

      <DialogoMotivo
        aberto={aberto === "silenciar"}
        onFechar={() => setAberto(null)}
        titulo={`Silenciar ${d.alvo.autor.nome}`}
        descricao="Silenciado lê e curte, mas não publica nem comenta até o fim do prazo."
        inicial={d.motivo}
        textoConfirmar="Silenciar"
        extra={<Campo rotulo="Por quantos dias" type="number" inputMode="numeric" min={1} max={SILENCIO_DIAS_MAX} tamanho="42" value={dias} onChange={(e) => setDias(e.target.value)} classNameMoldura="w-40" />}
        confirmacao={(motivo) => ({ titulo: `Silenciar ${d.alvo.autor.nome}?`, mensagem: `${d.alvo.autor.nome} fica ${diasNum === 1 ? "1 dia" : `${Number.isFinite(diasNum) ? diasNum : "?"} dias`} sem publicar nem comentar e a denúncia fica resolvida. Motivo: ${motivo}` })}
        onConfirmar={async (motivo) => {
          const r = await acaoSilenciarMembro({ membroId: d.alvo.autor.membroId, dias: diasNum, motivo });
          if (!r.ok) return r.erro;
          return resolver("RESOLVIDA", `Autor silenciado por ${diasNum === 1 ? "1 dia" : `${diasNum} dias`}: ${motivo}`);
        }}
      />
    </div>
  );
}
