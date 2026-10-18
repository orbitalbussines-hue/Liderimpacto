"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button, buttonVariants } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { Cartao } from "@/components/ui/cartao";
import { Selecao } from "@/components/ui/selecao";
import { Selo } from "@/components/ui/selo";
import { acaoAgendarCampanha, acaoCriarCampanha, acaoEnviarTesteEmail, acaoSalvarCampanha } from "@/lib/actions/campanhas";
import type { SituacaoCampanha } from "@/lib/db/schema/_enums";
import type { ConteudoMarketing, PublicoCampanha } from "@/lib/db/schema/marketing";
import { primeiroNome } from "@/lib/email/modelo";
import { ROTULO_SITUACAO_CAMPANHA } from "@/lib/marketing/regras";
import { AgendarCampanha } from "./agendar-campanha";
import { CamposConteudo } from "./campos-conteudo";
import { CONTEUDO_VAZIO, PUBLICO_VAZIO, TOM_SITUACAO_CAMPANHA } from "./comum";
import type { DadosDoEditor } from "./dados-editor";
import { PreviaEmail } from "./previa-email";
import { SeletorPublico, type ContagemPublico } from "./seletor-publico";

export interface EditorCampanhaProps {
  /** Sem `campanha` = nova. */
  campanha?: { id: string; versao: string; situacao: SituacaoCampanha; nome: string; conteudo: ConteudoMarketing; publico: PublicoCampanha };
  /** Nova a partir de um modelo. */
  inicial?: { nome: string; conteudo: ConteudoMarketing };
  dados: DadosDoEditor;
  limite: { hora: number; dia: number };
  /** Quem está editando (saudação da prévia). */
  nomeUsuario: string;
}

type Retorno<T> = { ok: true; dados: T } | { ok: false; erro: string };

/**
 * Criar/editar campanha (RN-220/221/223): texto com prévia da montagem real, público com contagem ao
 * vivo, teste para o próprio e-mail e agendar/enviar agora (confirmação com bloqueio de 3 s).
 */
export function EditorCampanha({ campanha, inicial, dados, limite, nomeUsuario }: EditorCampanhaProps) {
  const router = useRouter();
  const [nome, setNome] = useState(campanha?.nome ?? inicial?.nome ?? "");
  const [conteudo, setConteudo] = useState<ConteudoMarketing>(campanha?.conteudo ?? inicial?.conteudo ?? CONTEUDO_VAZIO);
  const [publico, setPublico] = useState<PublicoCampanha>(campanha?.publico ?? PUBLICO_VAZIO);
  const [salva, setSalva] = useState(campanha ? { id: campanha.id, versao: campanha.versao } : null);
  const [gravado, setGravado] = useState(() => JSON.stringify(campanha ? [campanha.nome, campanha.conteudo, campanha.publico] : null));
  const [contagem, setContagem] = useState<ContagemPublico | null>(null);
  const [agendando, setAgendando] = useState(false);
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const onContagem = useCallback((c: ContagemPublico | null) => setContagem(c), []);
  const alterada = JSON.stringify([nome, conteudo, publico]) !== gravado;
  const situacao = campanha?.situacao ?? "RASCUNHO";

  /** Grava (cria ou salva) se houver mudança; devolve id e versão atuais. */
  const gravar = async (): Promise<Retorno<{ id: string; versao: string }>> => {
    if (salva && !alterada) return { ok: true, dados: salva };
    const r = salva
      ? await acaoSalvarCampanha({ campanhaId: salva.id, versao: salva.versao, nome, conteudo, publico }).then((x) => (x.ok ? { ...x, dados: { id: salva.id, versao: x.dados.versao } } : x))
      : await acaoCriarCampanha({ nome, conteudo, publico });
    if (!r.ok) return r;
    const atual = r.dados;
    setSalva(atual);
    setGravado(JSON.stringify([nome, conteudo, publico]));
    return { ok: true, dados: atual };
  };

  const salvar = () =>
    iniciar(async () => {
      setAviso(null);
      const novo = !salva;
      const r = await gravar();
      if (!r.ok) return setAviso({ tom: "erro", texto: r.erro });
      setAviso({ tom: "ok", texto: situacao === "AGENDADA" ? "Alterações salvas. O envio continua agendado." : "Rascunho salvo." });
      if (novo) router.replace(`/admin/campanhas/${r.dados.id}/editar`);
    });

  const testar = () =>
    iniciar(async () => {
      setAviso(null);
      const r = await acaoEnviarTesteEmail({ conteudo });
      setAviso(r.ok ? { tom: "ok", texto: `Teste enviado para ${r.dados.para}. Confira a caixa de entrada (e o spam).` } : { tom: "erro", texto: r.erro });
    });

  const agendar = (quando: string | null) =>
    iniciar(async () => {
      const g = await gravar();
      const r = g.ok ? await acaoAgendarCampanha({ campanhaId: g.dados.id, versao: g.dados.versao, quando }) : g;
      if (!r.ok) {
        setAgendando(false);
        return setAviso({ tom: "erro", texto: r.erro });
      }
      router.push(`/admin/campanhas/${g.ok ? g.dados.id : ""}`);
    });

  const usarModelo = (id: string) => {
    const m = dados.modelos.find((x) => x.id === id);
    if (!m) return;
    setConteudo(m.conteudo);
    if (!nome.trim()) setNome(m.nome);
  };

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/campanhas" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Campanhas
      </Link>

      <Cartao padding={0} como="section" aria-label="Campanha" className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="m-0 truncate text-base font-semibold">{campanha ? "Editar campanha" : "Nova campanha"}</h1>
          <Selo tom={TOM_SITUACAO_CAMPANHA[situacao]}>{ROTULO_SITUACAO_CAMPANHA[situacao]}</Selo>
          {alterada && salva && <span className="text-xs text-muted">Alterações não salvas</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="contorno" size="36" disabled={pendente || !dados.emailLigado} onClick={testar}>
            Enviar teste para mim
          </Button>
          <Button variant="contorno" size="36" disabled={pendente || (!!salva && !alterada)} onClick={salvar}>
            {situacao === "AGENDADA" ? "Salvar alterações" : "Salvar rascunho"}
          </Button>
          <Button size="36" disabled={pendente || !dados.emailLigado} onClick={() => setAgendando(true)}>
            <Send className="size-3.5" aria-hidden />
            {situacao === "AGENDADA" ? "Reagendar ou enviar" : "Agendar ou enviar"}
          </Button>
        </div>
        {(aviso || !dados.emailLigado) && (
          <div className="flex w-full flex-col gap-2">
            {!dados.emailLigado && <Aviso tom="erro">O envio de e-mail não está configurado nesta plataforma: dá para escrever e salvar, mas não enviar.</Aviso>}
            {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
          </div>
        )}
      </Cartao>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <Cartao como="section" aria-labelledby="titulo-email" className="flex flex-col gap-4">
            <h2 id="titulo-email" className="m-0 font-sans text-[15px] font-semibold">
              E-mail
            </h2>
            <Campo rotulo="Nome da campanha" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} tamanho="42" ajuda="Só a equipe vê. Ex.: Convite da live de novembro." />
            {dados.modelos.length > 0 && (
              <Selecao
                rotulo="Copiar texto de um modelo"
                vazio="Escolha um modelo"
                opcoes={dados.modelos.map((m) => ({ valor: m.id, rotulo: m.nome }))}
                value=""
                onChange={(e) => usarModelo(e.target.value)}
                ajuda="Troca o assunto e o texto abaixo pelos do modelo."
              />
            )}
            <CamposConteudo valor={conteudo} onMudar={setConteudo} />
          </Cartao>
          <Cartao como="section" aria-labelledby="titulo-publico" className="flex flex-col gap-4">
            <h2 id="titulo-publico" className="m-0 font-sans text-[15px] font-semibold">
              Quem recebe
            </h2>
            <SeletorPublico opcoes={dados.opcoes} valor={publico} onMudar={setPublico} onContagem={onContagem} />
          </Cartao>
        </div>
        <Cartao como="section" aria-labelledby="titulo-previa" className="flex min-w-0 flex-col gap-3 self-start xl:sticky xl:top-4">
          <h2 id="titulo-previa" className="m-0 font-sans text-[15px] font-semibold">
            Prévia
          </h2>
          <PreviaEmail marca={dados.marca} conteudo={conteudo} nome={primeiroNome(nomeUsuario) || "Ana"} />
          <p className="m-0 text-xs text-muted">Cada pessoa vê o próprio nome. O rodapé leva o link para se descadastrar.</p>
        </Cartao>
      </div>

      {agendando && (
        <AgendarCampanha
          aberto
          onFechar={() => setAgendando(false)}
          assunto={conteudo.assunto || nome}
          receberao={contagem?.receberao ?? null}
          limite={limite}
          onConfirmar={agendar}
          pendente={pendente}
        />
      )}
    </div>
  );
}
