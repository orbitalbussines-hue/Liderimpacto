"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { CaixaSelecao } from "@/components/ui/caixa-selecao";
import { Campo } from "@/components/ui/campo";
import { acaoCriarWebhook, acaoSalvarWebhook } from "@/lib/actions/webhooks";
import { EVENTOS_WEBHOOK, type EventoWebhook } from "@/lib/db/schema/_enums";
import { criarWebhookSchema } from "@/lib/validators/webhooks";
import {
  MAX_WEBHOOKS_POR_CRIADOR,
  ROTULO_EVENTO_WEBHOOK,
} from "@/lib/webhooks/regras";
import { SegredoUmaVez } from "./segredo-uma-vez";

export interface WebhookEditavel {
  id: string;
  nome: string;
  url: string;
  eventos: EventoWebhook[];
  /** `updated_at` ISO (trava de colisão). */
  versao: string;
}

type Erros = Partial<Record<"nome" | "url" | "eventos", string>>;

/** "Endereço não permitido." da regra pura vira uma frase que diz o porquê. */
export const explicarProblemaUrl = (msg: string) =>
  msg === "Endereço não permitido."
    ? "Endereço interno não é aceito (localhost, rede privada, metadados da nuvem). Use o endereço público do sistema."
    : msg;

const AJUDA_URL =
  "Só https://. Endereços internos (localhost, rede privada, metadados da nuvem) são recusados.";

export interface DialogoWebhookProps {
  aberto: boolean;
  onFechar: () => void;
  /** Sem `webhook` = criar. */
  webhook?: WebhookEditavel;
  /** Só ao criar: o segredo em claro devolvido pela action. */
  onCriado?: (segredo: string, nome: string) => void;
}

/** Formulário de criar/editar (nome, URL https, eventos). Valida com o MESMO schema da action. */
export function DialogoWebhook({ aberto, ...resto }: DialogoWebhookProps) {
  // Desmonta ao fechar: o estado do formulário recomeça a cada abertura.
  return aberto ? <Formulario {...resto} /> : null;
}

const ID_FORM = "form-webhook";

function Formulario({
  webhook,
  onFechar,
  onCriado,
}: Omit<DialogoWebhookProps, "aberto">) {
  const router = useRouter();
  const [nome, setNome] = useState(webhook?.nome ?? "");
  const [url, setUrl] = useState(webhook?.url ?? "");
  const [eventos, setEventos] = useState<EventoWebhook[]>(
    webhook?.eventos ?? [],
  );
  const [erros, setErros] = useState<Erros>({});
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const alternar = (e: EventoWebhook, marcar: boolean) =>
    setEventos((atual) =>
      marcar ? [...atual, e] : atual.filter((x) => x !== e),
    );

  const salvar = () => {
    const v = criarWebhookSchema.safeParse({ nome, url, eventos });
    if (!v.success) {
      const novos: Erros = {};
      for (const i of v.error.issues) {
        const campo = i.path[0] as keyof Erros;
        novos[campo] ??=
          campo === "url" ? explicarProblemaUrl(i.message) : i.message;
      }
      return setErros(novos);
    }
    setErros({});
    iniciar(async () => {
      const r = await (
        webhook
          ? acaoSalvarWebhook({
              webhookId: webhook.id,
              versao: webhook.versao,
              ...v.data,
            }).then((x) => (x.ok ? { ok: true as const, segredo: null } : x))
          : acaoCriarWebhook(v.data).then((x) =>
              x.ok ? { ok: true as const, segredo: x.dados.segredo } : x,
            )
      ).catch(() => null);
      if (!r)
        return setErroServidor("Sem conexão com o servidor. Tente de novo.");
      if (!r.ok) return setErroServidor(explicarProblemaUrl(r.erro));
      onFechar();
      if (r.segredo) onCriado?.(r.segredo, v.data.nome);
      router.refresh();
    });
  };

  return (
    <DialogoAdmin
      aberto
      onFechar={onFechar}
      titulo={webhook ? "Editar webhook" : "Novo webhook"}
      descricao="Cada evento escolhido é enviado por POST, em JSON, para a URL, com a assinatura no cabeçalho."
      rodape={
        <>
          <Button
            type="button"
            variant="contorno"
            size="42"
            onClick={onFechar}
            disabled={pendente}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} size="42" carregando={pendente}>
            {pendente ? "Salvando..." : webhook ? "Salvar" : "Criar webhook"}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
        noValidate
      >
        <Campo
          rotulo="Nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={60}
          tamanho="42"
          placeholder="Ex.: CRM de vendas"
          erro={erros.nome}
        />
        <Campo
          rotulo="URL de destino"
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          maxLength={500}
          tamanho="42"
          placeholder="https://exemplo.com/webhooks/lider"
          ajuda={erros.url ? undefined : AJUDA_URL}
          erro={erros.url}
          className="text-[13px]"
        />
        <fieldset
          className="m-0 flex flex-col border-0 p-0"
          aria-describedby={erros.eventos ? "erro-eventos" : undefined}
        >
          <legend className="mb-1 p-0 text-[13px] font-semibold">
            Eventos
          </legend>
          <div className="grid grid-cols-1 desk:grid-cols-2 desk:gap-x-4">
            {EVENTOS_WEBHOOK.map((e) => (
              <CaixaSelecao
                key={e}
                rotulo={ROTULO_EVENTO_WEBHOOK[e]}
                checked={eventos.includes(e)}
                onChange={(ev) => alternar(e, ev.target.checked)}
                className="text-text"
              />
            ))}
          </div>
          {erros.eventos && (
            <p id="erro-eventos" className="m-0 text-xs text-warn">
              {erros.eventos}
            </p>
          )}
        </fieldset>
        {erroServidor && <Aviso tom="erro">{erroServidor}</Aviso>}
      </form>
    </DialogoAdmin>
  );
}

/** Botão "Novo webhook" do cabeçalho + formulário + segredo mostrado uma vez. */
export function BotaoNovoWebhook({ quantidade }: { quantidade: number }) {
  const [aberto, setAberto] = useState(false);
  const [segredo, setSegredo] = useState<{
    valor: string;
    nome: string;
  } | null>(null);
  const cheio = quantidade >= MAX_WEBHOOKS_POR_CRIADOR;
  return (
    <>
      <Button
        size="36"
        onClick={() => setAberto(true)}
        disabled={cheio}
        title={
          cheio
            ? `Limite de ${MAX_WEBHOOKS_POR_CRIADOR} webhooks por área. Exclua um para criar outro.`
            : undefined
        }
      >
        <Plus className="size-3.5" aria-hidden />
        Novo webhook
      </Button>
      <DialogoWebhook
        aberto={aberto}
        onFechar={() => setAberto(false)}
        onCriado={(valor, nome) => setSegredo({ valor, nome })}
      />
      <SegredoUmaVez
        segredo={segredo?.valor ?? null}
        nome={segredo?.nome ?? ""}
        onFechar={() => setSegredo(null)}
      />
    </>
  );
}
