"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AreaTexto } from "@/components/ui/area-texto";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { CampoMoldura } from "@/components/ui/campo-moldura";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { IDS_OPCOES, OPCOES_VF, ROTULO_TIPO_QUESTAO } from "@/lib/avaliacoes/regras";
import { TIPOS_QUESTAO, type TipoQuestao } from "@/lib/db/schema/_enums";
import { questaoSchema } from "@/lib/validators/avaliacoes";

/** Questão no formato que a action recebe (`questaoSchema`): opções na ordem, cada uma com `correta`. */
export interface QuestaoEntrada {
  tipo: TipoQuestao;
  enunciado: string;
  opcoes: { texto: string; correta: boolean }[];
  peso: number;
  explicacao: string | null;
}

export interface EditorQuestaoProps {
  aberto: boolean;
  onFechar: () => void;
  /** Ausente = questão nova. */
  inicial?: QuestaoEntrada;
  /** "Questão 3" ou "Nova questão". */
  titulo: string;
  carregando: boolean;
  /** Erro do servidor (colisão etc.). */
  erro: string | null;
  onSalvar: (questao: QuestaoEntrada) => void;
}

const NOVA: QuestaoEntrada = {
  tipo: "UNICA",
  enunciado: "",
  opcoes: [
    { texto: "", correta: true },
    { texto: "", correta: false },
  ],
  peso: 1,
  explicacao: null,
};
const vf = (correta: number) => OPCOES_VF.map((texto, i) => ({ texto, correta: i === correta }));

/** Troca de tipo sem perder o que dá: V/F fixa as 2 opções; ÚNICA fica com uma correta só. */
export function trocarTipo(q: QuestaoEntrada, tipo: TipoQuestao): QuestaoEntrada {
  if (tipo === "VERDADEIRO_FALSO") return { ...q, tipo, opcoes: vf(Math.max(0, q.tipo === "VERDADEIRO_FALSO" ? q.opcoes.findIndex((o) => o.correta) : 0)) };
  const opcoes = q.tipo === "VERDADEIRO_FALSO" ? NOVA.opcoes.map((o) => ({ ...o })) : q.opcoes;
  if (tipo === "UNICA") {
    const primeira = opcoes.findIndex((o) => o.correta);
    return { ...q, tipo, opcoes: opcoes.map((o, i) => ({ ...o, correta: i === primeira })) };
  }
  return { ...q, tipo, opcoes };
}

/**
 * Criar/editar questão (diálogo; fecha por ESC: ação não crítica). Valida na tela com o MESMO
 * `questaoSchema` da action: ao menos 1 correta, ÚNICA e V/F com exatamente 1, 2–8 opções sem
 * texto repetido. O corpo desmonta ao fechar: cada abertura começa do `inicial`.
 */
export function EditorQuestao({ aberto, onFechar, ...resto }: EditorQuestaoProps) {
  return (
    <AlertDialog open={aberto} onOpenChange={(abrir) => !abrir && onFechar()}>
      {aberto && <Corpo onFechar={onFechar} {...resto} />}
    </AlertDialog>
  );
}

function Corpo({ onFechar, inicial, titulo, carregando, erro, onSalvar }: Omit<EditorQuestaoProps, "aberto">) {
  const id = useId();
  const [q, setQ] = useState<QuestaoEntrada>(() => structuredClone(inicial ?? NOVA));
  const [invalido, setInvalido] = useState<string | null>(null);
  const multipla = q.tipo === "MULTIPLA";
  const fixas = q.tipo === "VERDADEIRO_FALSO";
  const mudar = (novo: QuestaoEntrada) => {
    setQ(novo);
    setInvalido(null);
  };
  const marcar = (i: number, marcada: boolean) =>
    mudar({ ...q, opcoes: q.opcoes.map((o, j) => (multipla ? (j === i ? { ...o, correta: marcada } : o) : { ...o, correta: j === i })) });

  return (
    <AlertDialogContent className="max-h-[calc(100dvh-32px)] overflow-y-auto data-[size=default]:max-w-[640px]">
      <AlertDialogHeader>
        <AlertDialogTitle className="text-[22px]">{titulo}</AlertDialogTitle>
        <AlertDialogDescription>Marque as opções corretas. O gabarito só chega ao aluno depois da correção.</AlertDialogDescription>
      </AlertDialogHeader>
      <form
        id={id}
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          const entrada = { ...q, explicacao: q.explicacao?.trim() ? q.explicacao : null };
          const r = questaoSchema.safeParse(entrada);
          if (!r.success) return setInvalido(r.error.issues[0]?.message ?? "Questão inválida.");
          onSalvar(entrada);
        }}
      >
        <AreaTexto rotulo="Enunciado" value={q.enunciado} onChange={(e) => mudar({ ...q, enunciado: e.target.value })} rows={3} maxLength={4000} autoFocus />
        <CampoMoldura id={`${id}-tipo`} rotulo="Tipo">
          <GrupoChips
            id={`${id}-tipo`}
            aria-labelledby={`${id}-tipo-rotulo`}
            opcoes={TIPOS_QUESTAO.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_QUESTAO[t] }))}
            valor={q.tipo}
            onMudar={(t) => mudar(trocarTipo(q, t))}
          />
        </CampoMoldura>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-[13px] font-semibold">
            Opções <span className="font-normal text-muted">· {multipla ? "marque todas as corretas" : "marque a correta"}</span>
          </legend>
          {q.opcoes.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type={multipla ? "checkbox" : "radio"}
                name={`${id}-correta`}
                checked={o.correta}
                onChange={(e) => marcar(i, e.target.checked)}
                aria-label={`Opção ${IDS_OPCOES[i].toUpperCase()} correta`}
                className="size-[18px] shrink-0 cursor-pointer accent-accent"
              />
              <span aria-hidden className="w-4 shrink-0 text-center text-xs font-bold text-muted uppercase">
                {IDS_OPCOES[i]}
              </span>
              <Campo
                rotulo={`Texto da opção ${IDS_OPCOES[i].toUpperCase()}`}
                rotuloOculto
                value={o.texto}
                readOnly={fixas}
                onChange={(e) => mudar({ ...q, opcoes: q.opcoes.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)) })}
                maxLength={500}
                tamanho="42"
                classNameMoldura="flex-1"
              />
              {!fixas && (
                <Button
                  type="button"
                  variant="fantasma"
                  size="icone36"
                  className="text-muted"
                  aria-label={`Remover opção ${IDS_OPCOES[i].toUpperCase()}`}
                  disabled={q.opcoes.length <= 2}
                  onClick={() => mudar({ ...q, opcoes: q.opcoes.filter((_, j) => j !== i) })}
                >
                  <X aria-hidden />
                </Button>
              )}
            </div>
          ))}
          {!fixas && q.opcoes.length < IDS_OPCOES.length && (
            <Button type="button" variant="fantasma" size="36" className="self-start" onClick={() => mudar({ ...q, opcoes: [...q.opcoes, { texto: "", correta: false }] })}>
              <Plus className="size-3.5" aria-hidden />
              Adicionar opção
            </Button>
          )}
        </fieldset>
        <div className="grid gap-5 desk:grid-cols-[140px_minmax(0,1fr)]">
          <Campo
            rotulo="Peso"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={q.peso}
            onChange={(e) => mudar({ ...q, peso: Number.parseInt(e.target.value, 10) || 0 })}
            tamanho="42"
            ajuda="1 a 100."
          />
          <AreaTexto
            rotulo="Explicação (opcional)"
            value={q.explicacao ?? ""}
            onChange={(e) => mudar({ ...q, explicacao: e.target.value })}
            rows={2}
            maxLength={2000}
            ajuda="Aparece no resultado junto com o gabarito."
          />
        </div>
        {(invalido ?? erro) && <Aviso tom="erro">{invalido ?? erro}</Aviso>}
      </form>
      <AlertDialogFooter>
        <Button type="button" variant="contorno" size="42" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" form={id} size="42" carregando={carregando}>
          Salvar questão
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
