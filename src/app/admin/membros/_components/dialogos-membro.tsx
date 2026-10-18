"use client";

import { useState, useTransition } from "react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { LinkDeAcesso } from "@/components/admin/link-de-acesso";
import { Button } from "@/components/ui/button";
import { CaixaSelecao } from "@/components/ui/caixa-selecao";
import { Campo } from "@/components/ui/campo";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { acaoGerarLinkDeSenha } from "@/lib/actions/usuarios-senha";
import type { PapelCriador } from "@/lib/db/schema/_enums";
import { ChipTag, type TagVisivel } from "./chip-tag";
import { ROTULO_PAPEL } from "./comum";

interface BaseDialogo {
  aberto: boolean;
  onFechar: () => void;
  nome: string;
}

/** Gera o link de primeiro acesso/redefinição e o mostra UMA vez (só no estado deste diálogo). */
export function DialogoLink({ aberto, onFechar, nome, usuarioId }: BaseDialogo & { usuarioId: string }) {
  const [motivo, setMotivo] = useState("Primeiro acesso / redefinição de senha");
  const [erro, setErro] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; expiraEm: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const fechar = () => {
    setLink(null);
    setErro(null);
    onFechar();
  };
  return (
    <DialogoAdmin
      aberto={aberto}
      onFechar={fechar}
      titulo="Link de senha"
      descricao={link ? `Entregue a ${nome} por um canal privado. Gerar outro invalida este.` : `${nome} define a própria senha pelo link. O motivo fica na trilha de auditoria.`}
      rodape={
        link ? (
          <Button size="42" onClick={fechar}>
            Concluir
          </Button>
        ) : (
          <>
            <Button variant="contorno" size="42" onClick={fechar}>
              Cancelar
            </Button>
            <Button
              size="42"
              carregando={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await acaoGerarLinkDeSenha({ usuarioId, motivo });
                  if (!r.ok) return setErro(r.erro);
                  setLink(r.dados);
                })
              }
            >
              Gerar link
            </Button>
          </>
        )
      }
    >
      {link ? (
        <LinkDeAcesso url={link.url} expiraEm={link.expiraEm} />
      ) : (
        <Campo rotulo="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} minLength={5} maxLength={300} tamanho="42" erro={erro ?? undefined} />
      )}
    </DialogoAdmin>
  );
}

/** Escolhe o novo papel; a confirmação (modal block) vem depois, em quem chama. */
export function DialogoPapel({ aberto, onFechar, nome, papel, onEscolher }: BaseDialogo & { papel: PapelCriador; onEscolher: (p: PapelCriador) => void }) {
  const [escolhido, setEscolhido] = useState<PapelCriador>(papel);
  return (
    <DialogoAdmin
      aberto={aberto}
      onFechar={onFechar}
      titulo="Mudar papel"
      descricao={`Papel de ${nome} nesta área. Dono tem acesso a tudo, inclusive financeiro e configurações; Admin gerencia conteúdo e alunos.`}
      rodape={
        <>
          <Button variant="contorno" size="42" onClick={onFechar}>
            Cancelar
          </Button>
          <Button size="42" disabled={escolhido === papel} onClick={() => onEscolher(escolhido)}>
            Continuar
          </Button>
        </>
      }
    >
      <GrupoChips
        aria-label="Novo papel"
        opcoes={(["ALUNO", "ADMIN", "DONO"] as const).map((p) => ({ valor: p, rotulo: ROTULO_PAPEL[p] }))}
        valor={escolhido}
        onMudar={setEscolhido}
      />
    </DialogoAdmin>
  );
}

/** Marca/desmarca os grupos do membro (adicionar e retirar numa tela só). */
export function DialogoGrupos({
  aberto,
  onFechar,
  nome,
  grupos,
  marcados,
  erro,
  pendente,
  onSalvar,
}: BaseDialogo & {
  grupos: readonly { id: string; nome: string }[];
  marcados: readonly string[];
  erro: string | null;
  pendente: boolean;
  onSalvar: (ids: string[]) => void;
}) {
  const [selecao, setSelecao] = useState<string[]>([...marcados]);
  const alternar = (id: string, ligado: boolean) => setSelecao((s) => (ligado ? [...s, id] : s.filter((x) => x !== id)));
  return (
    <DialogoAdmin
      aberto={aberto}
      onFechar={onFechar}
      titulo="Grupos de acesso"
      descricao={grupos.length ? `Grupos de ${nome}.` : "Esta área ainda não tem grupos. Crie na aba Grupos de acesso."}
      rodape={
        <>
          <Button variant="contorno" size="42" onClick={onFechar}>
            Cancelar
          </Button>
          <Button size="42" carregando={pendente} disabled={!grupos.length} onClick={() => onSalvar(selecao)}>
            Salvar
          </Button>
        </>
      }
    >
      {grupos.length > 0 && (
        <fieldset className="m-0 flex max-h-72 flex-col overflow-y-auto border-0 p-0">
          <legend className="sr-only">Grupos</legend>
          {grupos.map((g) => (
            <CaixaSelecao key={g.id} rotulo={g.nome} checked={selecao.includes(g.id)} onChange={(e) => alternar(g.id, e.target.checked)} className="text-text" />
          ))}
        </fieldset>
      )}
      {erro && (
        <p role="alert" className="m-0 text-[13px] font-semibold text-warn">
          {erro}
        </p>
      )}
    </DialogoAdmin>
  );
}

/** Marca/desmarca as tags do membro (RN-200: tag só organiza, não libera nada). */
export function DialogoTags({
  aberto,
  onFechar,
  nome,
  tags,
  marcadas,
  erro,
  pendente,
  onSalvar,
}: BaseDialogo & {
  tags: readonly TagVisivel[];
  marcadas: readonly string[];
  erro: string | null;
  pendente: boolean;
  onSalvar: (ids: string[]) => void;
}) {
  const [selecao, setSelecao] = useState<string[]>([...marcadas]);
  const alternar = (id: string, ligado: boolean) => setSelecao((s) => (ligado ? [...s, id] : s.filter((x) => x !== id)));
  const mudou = selecao.length !== marcadas.length || selecao.some((id) => !marcadas.includes(id));
  return (
    <DialogoAdmin
      aberto={aberto}
      onFechar={onFechar}
      titulo="Tags"
      descricao={tags.length ? `Tags de ${nome}. Só organizam a lista: não liberam conteúdo.` : "Esta área ainda não tem tags. Crie na aba Tags."}
      rodape={
        <>
          <Button variant="contorno" size="42" onClick={onFechar}>
            Cancelar
          </Button>
          <Button size="42" carregando={pendente} disabled={!mudou} onClick={() => onSalvar(selecao)}>
            Salvar
          </Button>
        </>
      }
    >
      {tags.length > 0 && (
        <fieldset className="m-0 flex max-h-72 flex-col overflow-y-auto border-0 p-0">
          <legend className="sr-only">Tags</legend>
          {tags.map((t) => (
            <CaixaSelecao key={t.id} rotulo={<ChipTag tag={t} />} checked={selecao.includes(t.id)} onChange={(e) => alternar(t.id, e.target.checked)} />
          ))}
        </fieldset>
      )}
      {erro && (
        <p role="alert" className="m-0 text-[13px] font-semibold text-warn">
          {erro}
        </p>
      )}
    </DialogoAdmin>
  );
}
