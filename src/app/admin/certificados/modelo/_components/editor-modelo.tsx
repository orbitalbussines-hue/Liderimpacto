"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { SeletorCorMarca } from "@/components/admin/seletor-cor-marca";
import { PreviaCertificado } from "@/components/certificados/previa-certificado";
import { AreaTexto } from "@/components/ui/area-texto";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { Interruptor } from "@/components/ui/interruptor";
import { acaoSalvarModeloCertificado } from "@/lib/actions/certificados";
import { corDoCertificado, preencherTexto, type VariaveisTexto } from "@/lib/certificados/regras";
import { validarHex } from "@/lib/marca/paleta";

export interface ModeloEditavel {
  produtoId: string | null;
  /** `null` = ainda não existe modelo próprio para este alvo (salvar cria). */
  versao: string | null;
  titulo: string;
  texto: string;
  assinaturaNome: string;
  assinaturaCargo: string;
  cor: string | null;
}

export interface EditorModeloProps {
  modelo: ModeloEditavel;
  /** Cor que vale sem cor própria: curso → criador → dourado (hex cru, antes do ajuste ao papel). */
  corHerdada: string;
  /** Dados de exemplo da prévia (nome, curso, carga, data) + criador, código e URL de exemplo. */
  exemplo: VariaveisTexto & { criador: string; codigoLegivel: string; urlVerificacao: string };
}

const VARIAVEIS: { chave: keyof VariaveisTexto; explica: string }[] = [
  { chave: "nome", explica: "Nome completo do aluno, como está no cadastro (obrigatória)." },
  { chave: "curso", explica: "Título do curso concluído." },
  { chave: "carga_horaria", explica: "Soma das aulas publicadas, em horas cheias (ex.: 12 horas)." },
  { chave: "data", explica: "Data da conclusão por extenso (ex.: 14 de outubro de 2026)." },
];

/**
 * Editor do modelo de certificado com prévia AO VIVO fiel ao PDF (mesma `PreviaCertificado` da
 * verificação). Vale para os próximos PDFs; os já gerados ficam como estão. Trava otimista pela versão.
 */
export function EditorModelo({ modelo, corHerdada, exemplo }: EditorModeloProps) {
  const router = useRouter();
  const texto = useRef<HTMLTextAreaElement>(null);
  const [titulo, setTitulo] = useState(modelo.titulo);
  const [corpo, setCorpo] = useState(modelo.texto);
  const [assinaturaNome, setAssinaturaNome] = useState(modelo.assinaturaNome);
  const [assinaturaCargo, setAssinaturaCargo] = useState(modelo.assinaturaCargo);
  const [corPropria, setCorPropria] = useState(modelo.cor !== null);
  const [cor, setCor] = useState(validarHex(modelo.cor ?? "") ?? validarHex(corHerdada) ?? "#d9a441");
  const [corValida, setCorValida] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [pendente, iniciar] = useTransition();

  const mudou = () => {
    setFeito(false);
    setErro(null);
  };
  // Conferência ao vivo (a action valida de novo com o schema): chave que sobra depois de
  // `preencherTexto` é variável desconhecida.
  const erroTexto = !corpo.includes("{nome}")
    ? "O texto precisa ter {nome}."
    : /\{[^}]*\}/.test(preencherTexto(corpo, exemplo))
      ? "Variável desconhecida. Use {nome}, {curso}, {carga_horaria} ou {data}."
      : corpo.trim().length < 10
        ? "Texto: mínimo de 10 caracteres."
        : undefined;

  const inserir = (chave: string) => {
    const el = texto.current;
    const marca = `{${chave}}`;
    const ini = el?.selectionStart ?? corpo.length;
    const fim = el?.selectionEnd ?? corpo.length;
    setCorpo(corpo.slice(0, ini) + marca + corpo.slice(fim));
    mudou();
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  };

  const salvar = () =>
    iniciar(async () => {
      const r = await acaoSalvarModeloCertificado({
        produtoId: modelo.produtoId,
        versao: modelo.versao,
        titulo,
        texto: corpo,
        assinaturaNome,
        assinaturaCargo,
        cor: corPropria ? cor : null,
      }).catch(() => null);
      if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
      if (!r.ok) return setErro(r.erro);
      setFeito(true);
      router.refresh();
    });

  const previa = {
    criador: exemplo.criador,
    titulo: titulo || "Título do certificado",
    texto: preencherTexto(corpo, exemplo),
    nome: exemplo.nome,
    assinaturaNome: assinaturaNome || "Nome de quem assina",
    assinaturaCargo,
    cor: corDoCertificado(corPropria ? cor : null, corHerdada),
    codigoLegivel: exemplo.codigoLegivel,
    urlVerificacao: exemplo.urlVerificacao,
    concluidoEm: exemplo.data,
  };

  return (
    <div className="grid items-start gap-5 desk:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Cartao padding={24} como="section" aria-label="Dados do modelo" className="order-2 desk:order-1">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
        >
          <Campo
            rotulo="Título"
            value={titulo}
            onChange={(e) => {
              setTitulo(e.target.value);
              mudou();
            }}
            required
            minLength={2}
            maxLength={160}
            tamanho="42"
            autoComplete="off"
            ajuda="Aparece em maiúsculas acima do nome (ex.: Certificado de conclusão)."
          />
          <div className="flex flex-col gap-2.5">
            <AreaTexto
              ref={texto}
              rotulo="Texto"
              value={corpo}
              onChange={(e) => {
                setCorpo(e.target.value);
                mudou();
              }}
              rows={5}
              maxLength={600}
              erro={erroTexto}
              ajuda={`${corpo.length}/600. O trecho antes de {nome} sai em itálico na linha de cima; o resto, abaixo do nome.`}
            />
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Inserir variável no texto">
              <span className="text-xs font-semibold text-muted">Inserir:</span>
              {VARIAVEIS.map((v) => (
                <Button key={v.chave} type="button" variant="contorno" size="36" className="h-7 rounded-full px-2.5 font-mono text-xs" onClick={() => inserir(v.chave)}>
                  {`{${v.chave}}`}
                </Button>
              ))}
            </div>
            <dl className="m-0 grid gap-1.5 rounded-xl border border-border bg-surface-2 p-3.5 text-xs">
              {VARIAVEIS.map((v) => (
                <div key={v.chave} className="grid grid-cols-[112px_1fr] gap-2">
                  <dt className="font-mono font-semibold text-accent">{`{${v.chave}}`}</dt>
                  <dd className="m-0 text-muted">{v.explica}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="grid gap-5 min-[560px]:grid-cols-2">
            <Campo
              rotulo="Quem assina"
              value={assinaturaNome}
              onChange={(e) => {
                setAssinaturaNome(e.target.value);
                mudou();
              }}
              required
              minLength={2}
              maxLength={120}
              tamanho="42"
              autoComplete="off"
            />
            <Campo
              rotulo="Cargo"
              value={assinaturaCargo}
              onChange={(e) => {
                setAssinaturaCargo(e.target.value);
                mudou();
              }}
              maxLength={120}
              tamanho="42"
              autoComplete="off"
              ajuda="Opcional."
            />
          </div>
          <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div id="cor-certificado" className="text-sm font-semibold">
                  Cor própria do certificado
                </div>
                <div className="text-xs text-muted">Desligada, usa a cor do curso ou da área. A cor é escurecida se precisar, para ler bem no papel.</div>
              </div>
              <Interruptor
                aria-labelledby="cor-certificado"
                ligado={corPropria}
                onAlternar={(v) => {
                  setCorPropria(v);
                  mudou();
                }}
              />
            </div>
            {corPropria && (
              <SeletorCorMarca
                cor={cor}
                onMudar={(hex) => {
                  setCor(hex);
                  mudou();
                }}
                onValidade={setCorValida}
              />
            )}
          </div>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          {feito && <Aviso tom="ok">Modelo salvo. Vale para os próximos PDFs; os já gerados ficam como estão.</Aviso>}
          <Button type="submit" size="42" carregando={pendente} disabled={!!erroTexto || (corPropria && !corValida)} className="self-start">
            Salvar modelo
          </Button>
        </form>
      </Cartao>
      <section aria-label="Prévia do certificado" className="order-1 flex flex-col gap-2.5 desk:sticky desk:top-6 desk:order-2">
        <CartaoTitulo tamanho={15} como="h2">
          Prévia ao vivo
        </CartaoTitulo>
        <PreviaCertificado dados={previa} className="overflow-hidden rounded-lg border border-border" />
        <p className="m-0 text-xs text-muted">
          Dados de exemplo. É o mesmo desenho do PDF (A4 paisagem); o QR leva à página pública de verificação do certificado.
        </p>
      </section>
    </div>
  );
}
