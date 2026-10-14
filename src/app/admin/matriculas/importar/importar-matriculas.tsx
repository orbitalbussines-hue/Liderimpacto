"use client";

import { useState, useTransition } from "react";
import { FileUp } from "lucide-react";
import { LinksPrimeiroAcesso } from "@/components/admin/links-primeiro-acesso";
import { ListaErrosCsv } from "@/components/admin/lista-erros-csv";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button, buttonVariants } from "@/components/ui/button";
import { Estatistica } from "@/components/ui/estatistica";
import { acaoImportarMatriculas, type ResultadoImportacaoMatriculas } from "@/lib/actions/matriculas-importacao";
import { lerCsvDeMatriculas, resolverProdutos, type ProdutoDoCsv } from "@/lib/matriculas/csv";
import { MAX_BYTES_CSV, type ErroCsv } from "@/lib/membros/csv";

const PREVIA = 8;
const data = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Prévia já com o produto ligado (mesmas funções puras que o servidor roda de novo). */
function preparar(texto: string, produtos: readonly ProdutoDoCsv[]) {
  const leitura = lerCsvDeMatriculas(texto, new Date());
  if (!leitura.ok) return { ok: false as const, erro: leitura.erro };
  const ligadas = resolverProdutos(leitura.validas, produtos);
  const erros: ErroCsv[] = [...leitura.erros, ...ligadas.erros].sort((a, b) => a.numero - b.numero);
  return { ok: true as const, validas: ligadas.ok, erros };
}

/**
 * Importação de matrículas em 3 tempos, igual à de membros: prévia no navegador (erro por
 * linha), confirmação no modal block e resultado com contagens e links de primeiro acesso.
 */
export function ImportarMatriculas({ produtos }: { produtos: readonly ProdutoDoCsv[] }) {
  const [arquivo, setArquivo] = useState<{ nome: string; texto: string; previa: ReturnType<typeof preparar> } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacaoMatriculas | null>(null);
  const [pendente, iniciar] = useTransition();

  const escolher = async (f: File | undefined) => {
    setErro(null);
    setResultado(null);
    if (!f) return setArquivo(null);
    if (f.size > MAX_BYTES_CSV) return setErro("Arquivo maior que 1 MB.");
    const texto = await f.text();
    setArquivo({ nome: f.name, texto, previa: preparar(texto, produtos) });
  };

  const importar = () =>
    iniciar(async () => {
      const r = await acaoImportarMatriculas({ csv: arquivo?.texto ?? "" });
      setConfirmando(false);
      if (!r.ok) return setErro(r.erro);
      setResultado(r.dados);
      setArquivo(null);
    });

  if (resultado) {
    return (
      <div className="flex flex-col gap-5">
        <p role="status" className="m-0 text-sm font-semibold text-ok">
          Importação concluída.
        </p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4">
          <Estatistica valor={resultado.criadas} rotulo="matrículas criadas" tom="accent" />
          <Estatistica valor={resultado.reativadas} rotulo="reativadas" />
          <Estatistica valor={resultado.jaExistiam} rotulo="já existiam" />
          <Estatistica valor={resultado.contasNovas} rotulo="contas novas" />
          <Estatistica valor={resultado.invalidas.length} rotulo="linhas ignoradas" />
        </div>
        {resultado.gruposCriados.length > 0 && <p className="m-0 text-[13px] text-muted">Turmas criadas: {resultado.gruposCriados.join(", ")}.</p>}
        <ListaErrosCsv erros={resultado.invalidas} />
        {resultado.reaproveitados > 0 && (
          <p className="m-0 rounded-lg border border-border bg-surface-2 p-3 text-[13px]">
            Quem já tinha conta na plataforma entra com a senha que já usa; para essas pessoas não há link.
          </p>
        )}
        {resultado.emailsEnviados > 0 && <p className="m-0 text-[13px] text-muted">{resultado.emailsEnviados} links também foram enviados por e-mail.</p>}
        <LinksPrimeiroAcesso links={resultado.links} />
        <Button variant="contorno" size="42" className="self-start" onClick={() => setResultado(null)}>
          Importar outro arquivo
        </Button>
      </div>
    );
  }

  const previa = arquivo?.previa;
  const pronta = previa?.ok ? previa : null;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className={buttonVariants({ variant: "contorno", size: "42", className: "has-focus-visible:ring-3 has-focus-visible:ring-accent/25" })}>
          <FileUp aria-hidden />
          Escolher arquivo .csv
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => escolher(e.target.files?.[0])} />
        </label>
        {arquivo && <span className="text-[13px] text-muted">{arquivo.nome}</span>}
      </div>

      {(erro || previa?.ok === false) && (
        <p role="alert" className="m-0 text-[13px] font-semibold text-warn">
          {erro ?? (previa?.ok === false ? previa.erro : "")}
        </p>
      )}

      {pronta && (
        <>
          <p className="m-0 text-sm">
            <b className="text-ok">{pronta.validas.length} prontas para importar</b>
            {pronta.erros.length > 0 && <> · {pronta.erros.length} com erro</>}
          </p>
          {pronta.validas.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 rounded-lg border border-border bg-bg p-3 text-[13px]">
              {pronta.validas.slice(0, PREVIA).map(({ numero, dados, produto }) => (
                <li key={numero} className="truncate">
                  <b>{dados.nome}</b> · <span className="text-muted">{dados.email}</span> · {produto.titulo}
                  <span className="text-muted">
                    {dados.expira_em ? ` · até ${data(dados.expira_em)}` : ""}
                    {dados.grupo ? ` · ${dados.grupo}` : ""}
                  </span>
                </li>
              ))}
              {pronta.validas.length > PREVIA && <li className="text-muted">e mais {pronta.validas.length - PREVIA}...</li>}
            </ul>
          )}
          <ListaErrosCsv erros={pronta.erros} />
          <Button size="42" className="self-start" disabled={pronta.validas.length === 0} onClick={() => setConfirmando(true)}>
            Importar {pronta.validas.length} {pronta.validas.length === 1 ? "matrícula" : "matrículas"}
          </Button>
        </>
      )}

      <ModalConfirmacaoBlock
        aberto={confirmando}
        titulo="Importar matrículas"
        mensagem={`${pronta?.validas.length ?? 0} matrículas entram numa operação só (se algo falhar, nada é gravado). Quem ainda não é membro entra como Aluno; contas novas recebem link de primeiro acesso. Quem já tem matrícula ativa fica como está.${
          pronta?.erros.length ? ` ${pronta.erros.length} linhas com erro ficam de fora.` : ""
        }`}
        textoConfirmar="Importar"
        carregando={pendente}
        onCancelar={() => setConfirmando(false)}
        onConfirmar={importar}
      />
    </div>
  );
}
