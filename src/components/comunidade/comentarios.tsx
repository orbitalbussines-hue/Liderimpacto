"use client";

import { useState } from "react";
import { EyeOff, MessageCircle } from "lucide-react";
import { AreaTexto } from "@/components/ui/area-texto";
import { Aviso } from "@/components/ui/aviso";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { acaoComentar, acaoEditarComentario } from "@/lib/actions/comunidade";
import type {
  AutorPublico,
  ComentarioDaArvore,
} from "@/lib/comunidade/consultas";
import { TEXTO_COMENTARIO_MAX } from "@/lib/comunidade/regras";
import { cn } from "@/lib/utils";
import { BotaoCurtir } from "./botao-curtir";
import { quando } from "./formatos";
import { MenuConteudo, type MudancaDoConteudo } from "./menu-conteudo";
import { TextoComLinks } from "./texto-com-links";

export interface ComentariosProps {
  /** Comentários de um post ou da aula (aba do player). */
  alvo: { postId: string } | { aulaId: string };
  iniciais: readonly ComentarioDaArvore[];
  /** Quem está na sessão (`null` = sem vínculo: só lê). */
  eu: AutorPublico | null;
  /** Silenciado: o texto do aviso (não comenta nem responde). */
  bloqueio?: string | null;
  /** Mudou a quantidade (+1 ao comentar, −n ao remover com as respostas). */
  aoMudarTotal?: (delta: number) => void;
  /** Texto do vazio ("Seja o primeiro a comentar esta aula"). */
  vazio?: string;
}

const novoComentario = (
  eu: AutorPublico,
  id: string,
  versao: string,
  texto: string,
): ComentarioDaArvore => ({
  id,
  autor: eu,
  texto: texto.trim(),
  criadoEm: new Date(),
  editadoEm: null,
  oculto: null,
  curtidas: 0,
  curtiu: false,
  podeEditar: true,
  podeRemover: true,
  podeModerar: eu.equipe,
  versao,
  respostas: [],
});

/** Campo de comentar/responder com o botão; devolve o texto e limpa só se a action aceitou. */
function FormComentario({
  eu,
  rotulo,
  textoBotao,
  aoEnviar,
  aoCancelar,
  autoFocus,
}: {
  eu: AutorPublico;
  rotulo: string;
  textoBotao: string;
  aoEnviar: (texto: string) => Promise<string | null>;
  aoCancelar?: () => void;
  autoFocus?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enviar = async () => {
    setEnviando(true);
    const e = await aoEnviar(texto).catch(
      () => "Sem conexão com o servidor. Tente de novo.",
    );
    setEnviando(false);
    setErro(e);
    if (!e) setTexto("");
  };
  return (
    <form
      className="flex items-start gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <Avatar nome={eu.nome} src={eu.imagem} tamanho={32} tom="accent" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <AreaTexto
          rotulo={rotulo}
          rotuloOculto
          placeholder={`${rotulo}...`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={TEXTO_COMENTARIO_MAX}
          rows={2}
          erro={erro ?? undefined}
          autoFocus={autoFocus}
        />
        <div className="flex justify-end gap-2">
          {aoCancelar && (
            <Button
              type="button"
              variant="contorno"
              size="36"
              onClick={aoCancelar}
              disabled={enviando}
            >
              Cancelar
            </Button>
          )}
          <Button
            type="submit"
            size="36"
            className="px-4"
            carregando={enviando}
            disabled={!texto.trim()}
          >
            {textoBotao}
          </Button>
        </div>
      </div>
    </form>
  );
}

interface ItemProps {
  c: ComentarioDaArvore;
  eu: AutorPublico | null;
  podeEscrever: boolean;
  aoResponder?: () => void;
  aoRemovido: () => void;
}

/** Um comentário (ou resposta): curtir, responder (só o de 1º nível), editar, ⋮. */
function ItemComentario({
  c,
  eu,
  podeEscrever,
  aoResponder,
  aoRemovido,
}: ItemProps) {
  const [estado, setEstado] = useState({
    texto: c.texto,
    editado: !!c.editadoEm,
    oculto: c.oculto,
    versao: c.versao,
  });
  const [editando, setEditando] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{
    texto: string;
    tom: "ok" | "erro";
  } | null>(null);

  const salvar = async () => {
    if (editando === null) return;
    setSalvando(true);
    const r = await acaoEditarComentario({
      comentarioId: c.id,
      versao: estado.versao,
      texto: editando,
    }).catch(() => null);
    setSalvando(false);
    if (!r?.ok)
      return setAviso({
        texto: r?.erro ?? "Sem conexão com o servidor.",
        tom: "erro",
      });
    setEstado((e) => ({
      ...e,
      texto: editando.trim(),
      editado: true,
      versao: r.dados.versao,
    }));
    setEditando(null);
    setAviso(null);
  };
  const mudar = (m: MudancaDoConteudo) =>
    setEstado((e) => ({
      ...e,
      versao: m.versao,
      oculto: m.oculto === undefined ? e.oculto : m.oculto,
    }));

  return (
    <div
      className={cn("flex items-start gap-3", estado.oculto && "opacity-75")}
    >
      <Avatar nome={c.autor.nome} src={c.autor.imagem} tamanho={32} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 pt-1.5 text-[13px]">
            <span className="font-bold">{c.autor.nome}</span>
            {c.autor.equipe && (
              <span className="text-xs font-semibold text-muted">
                {" "}
                · Equipe
              </span>
            )}
            <span className="text-xs text-muted">
              {" · "}
              <time
                dateTime={new Date(c.criadoEm).toISOString()}
                suppressHydrationWarning
              >
                {quando(c.criadoEm)}
              </time>
              {estado.editado && " · editado"}
            </span>
          </div>
          <div className="-my-2 -mr-2 shrink-0">
            <MenuConteudo
              alvo={{ comentarioId: c.id }}
              rotulo={`comentário de ${c.autor.nome}`}
              versao={estado.versao}
              oculto={!!estado.oculto}
              podeEditar={c.podeEditar && podeEscrever && editando === null}
              podeRemover={c.podeRemover}
              podeModerar={c.podeModerar}
              podeDenunciar={!!eu && c.autor.membroId !== eu.membroId}
              aoEditar={() => setEditando(estado.texto)}
              aoRemovido={aoRemovido}
              aoMudar={mudar}
              aoAviso={(texto, tom) => setAviso({ texto, tom })}
            />
          </div>
        </div>
        {editando !== null ? (
          <div className="flex flex-col gap-2">
            <AreaTexto
              rotulo="Editar comentário"
              rotuloOculto
              value={editando}
              onChange={(e) => setEditando(e.target.value)}
              maxLength={TEXTO_COMENTARIO_MAX}
              rows={2}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="contorno"
                size="36"
                onClick={() => setEditando(null)}
                disabled={salvando}
              >
                Cancelar
              </Button>
              <Button
                size="36"
                carregando={salvando}
                disabled={!editando.trim()}
                onClick={() => void salvar()}
              >
                Salvar
              </Button>
            </div>
          </div>
        ) : (
          <TextoComLinks
            texto={estado.texto}
            className="text-sm leading-relaxed"
          />
        )}
        {estado.oculto && (
          <p className="m-0 flex items-center gap-1.5 text-xs text-muted">
            <EyeOff aria-hidden className="size-3.5 shrink-0" />
            Oculto pela moderação
            {estado.oculto.motivo ? `: ${estado.oculto.motivo}` : ""}.
          </p>
        )}
        <div className="flex items-center gap-4 text-xs text-muted">
          <BotaoCurtir
            alvo={{ comentarioId: c.id }}
            curtiu={c.curtiu}
            curtidas={c.curtidas}
            desabilitado={!eu}
            compacto
          />
          {aoResponder && podeEscrever && (
            <button
              type="button"
              onClick={aoResponder}
              className="-mx-1.5 inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-1.5 font-semibold hover:text-text"
            >
              <MessageCircle aria-hidden className="size-3.5" />
              Responder
            </button>
          )}
        </div>
        {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
      </div>
    </div>
  );
}

/**
 * Comentários de post (post aberto) e de aula (aba do player): lista com respostas de 1 nível,
 * comentar/responder sem recarregar a página (o novo entra na lista com a versão do servidor).
 */
export function Comentarios({
  alvo,
  iniciais,
  eu,
  bloqueio,
  aoMudarTotal,
  vazio = "Ninguém comentou ainda. Comece a conversa.",
}: ComentariosProps) {
  const [lista, setLista] = useState<ComentarioDaArvore[]>(() => [...iniciais]);
  const [respondendo, setRespondendo] = useState<string | null>(null);
  const podeEscrever = !!eu && !bloqueio;

  const comentar = async (
    texto: string,
    paiId: string | null,
  ): Promise<string | null> => {
    if (!eu) return "Sem vínculo nesta área.";
    const r = await acaoComentar({ ...alvo, texto, paiId });
    if (!r.ok) return r.erro;
    const novo = novoComentario(eu, r.dados.id, r.dados.versao, texto);
    setLista((l) =>
      paiId
        ? l.map((c) =>
            c.id === paiId ? { ...c, respostas: [...c.respostas, novo] } : c,
          )
        : [...l, novo],
    );
    if (paiId) setRespondendo(null);
    aoMudarTotal?.(1);
    return null;
  };
  const remover = (id: string, paiId: string | null) => {
    // Remover o comentário leva as respostas junto (serviço `removerComentario`).
    aoMudarTotal?.(
      -(
        1 +
        (paiId ? 0 : (lista.find((c) => c.id === id)?.respostas.length ?? 0))
      ),
    );
    setLista((l) =>
      paiId
        ? l.map((c) =>
            c.id === paiId
              ? { ...c, respostas: c.respostas.filter((r) => r.id !== id) }
              : c,
          )
        : l.filter((c) => c.id !== id),
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {bloqueio ? (
        <Aviso tom="info">{bloqueio}</Aviso>
      ) : (
        eu && (
          <FormComentario
            eu={eu}
            rotulo="Escreva um comentário"
            textoBotao="Comentar"
            aoEnviar={(t) => comentar(t, null)}
          />
        )
      )}
      {lista.length === 0 ? (
        <EstadoVazio
          icone={<MessageCircle />}
          titulo="Sem comentários"
          descricao={vazio}
          className="py-6"
        />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-5 p-0">
          {lista.map((c) => (
            <li key={c.id} className="flex flex-col gap-3">
              <ItemComentario
                c={c}
                eu={eu}
                podeEscrever={podeEscrever}
                aoResponder={() => setRespondendo(c.id)}
                aoRemovido={() => remover(c.id, null)}
              />
              {(c.respostas.length > 0 || respondendo === c.id) && (
                <ul className="m-0 ml-4 flex list-none flex-col gap-4 border-l border-border py-0.5 pr-0 pl-4 desk:ml-11">
                  {c.respostas.map((r) => (
                    <li key={r.id}>
                      <ItemComentario
                        c={r}
                        eu={eu}
                        podeEscrever={podeEscrever}
                        aoRemovido={() => remover(r.id, c.id)}
                      />
                    </li>
                  ))}
                  {respondendo === c.id && eu && podeEscrever && (
                    <li>
                      <FormComentario
                        eu={eu}
                        rotulo={`Responder a ${c.autor.nome}`}
                        textoBotao="Responder"
                        aoEnviar={(t) => comentar(t, c.id)}
                        aoCancelar={() => setRespondendo(null)}
                        autoFocus
                      />
                    </li>
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
