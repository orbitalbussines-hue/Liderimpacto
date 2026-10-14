"use client";

import { useState, useTransition } from "react";
import { FileUp } from "lucide-react";
import { LinksPrimeiroAcesso } from "@/components/admin/links-primeiro-acesso";
import { ListaErrosCsv } from "@/components/admin/lista-erros-csv";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button, buttonVariants } from "@/components/ui/button";
import { Estatistica } from "@/components/ui/estatistica";
import { acaoImportarMembros, type ResultadoImportacao } from "@/lib/actions/membros";
import { lerCsvDeMembros, MAX_BYTES_CSV, type LeituraCsv } from "@/lib/membros/csv";

const PREVIA = 8;

/**
 * Importação em 3 tempos: escolher o arquivo (prévia no navegador, mesma regra do servidor),
 * confirmar no modal block e ver o resultado com os links de primeiro acesso — copiados ou
 * baixados num CSV gerado AQUI (os links não ficam no servidor nem na URL).
 */
export function ImportarCsv() {
  const [arquivo, setArquivo] = useState<{ nome: string; texto: string; leitura: LeituraCsv } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [pendente, iniciar] = useTransition();

  const escolher = async (f: File | undefined) => {
    setErro(null);
    setResultado(null);
    if (!f) return setArquivo(null);
    if (f.size > MAX_BYTES_CSV) return setErro("Arquivo maior que 1 MB.");
    const texto = await f.text();
    setArquivo({ nome: f.name, texto, leitura: lerCsvDeMembros(texto) });
  };

  const importar = () =>
    iniciar(async () => {
      const r = await acaoImportarMembros({ csv: arquivo?.texto ?? "" });
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
          <Estatistica valor={resultado.criados} rotulo="contas novas" tom="accent" />
          <Estatistica valor={resultado.reaproveitados} rotulo="já tinham conta" />
          <Estatistica valor={resultado.jaMembros} rotulo="já eram membros" />
          <Estatistica valor={resultado.invalidas.length} rotulo="linhas ignoradas" />
        </div>
        {resultado.gruposCriados.length > 0 && <p className="m-0 text-[13px] text-muted">Turmas criadas: {resultado.gruposCriados.join(", ")}.</p>}
        <ListaErrosCsv erros={resultado.invalidas} />
        {resultado.reaproveitados > 0 && (
          <p className="m-0 rounded-lg border border-border bg-surface-2 p-3 text-[13px]">
            Quem já tinha conta na plataforma entra com a senha que já usa; para essas pessoas não há link.
          </p>
        )}
        <LinksPrimeiroAcesso links={resultado.links} />
        <Button variant="contorno" size="42" className="self-start" onClick={() => setResultado(null)}>
          Importar outro arquivo
        </Button>
      </div>
    );
  }

  const leitura = arquivo?.leitura;
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

      {(erro || (leitura && !leitura.ok)) && (
        <p role="alert" className="m-0 text-[13px] font-semibold text-warn">
          {erro ?? (leitura && !leitura.ok ? leitura.erro : "")}
        </p>
      )}

      {leitura?.ok && (
        <>
          <p className="m-0 text-sm">
            <b className="text-ok">{leitura.validas.length} prontas para importar</b>
            {leitura.erros.length > 0 && <> · {leitura.erros.length} com erro</>}
          </p>
          {leitura.validas.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 rounded-lg border border-border bg-bg p-3 text-[13px]">
              {leitura.validas.slice(0, PREVIA).map(({ numero, dados }) => (
                <li key={numero} className="truncate">
                  <b>{dados.nome}</b> · <span className="text-muted">{dados.email}</span>
                  {dados.grupo && <span className="text-muted"> · {dados.grupo}</span>}
                </li>
              ))}
              {leitura.validas.length > PREVIA && <li className="text-muted">e mais {leitura.validas.length - PREVIA}...</li>}
            </ul>
          )}
          <ListaErrosCsv erros={leitura.erros} />
          <Button size="42" className="self-start" disabled={leitura.validas.length === 0} onClick={() => setConfirmando(true)}>
            Importar {leitura.validas.length} {leitura.validas.length === 1 ? "membro" : "membros"}
          </Button>
        </>
      )}

      <ModalConfirmacaoBlock
        aberto={confirmando}
        titulo="Importar membros"
        mensagem={`${leitura?.ok ? leitura.validas.length : 0} pessoas entram nesta área como Aluno, numa operação só (se algo falhar, nada é gravado). ${leitura?.ok && leitura.erros.length ? `${leitura.erros.length} linhas com erro ficam de fora. ` : ""}Contas novas recebem link de primeiro acesso.`}
        textoConfirmar="Importar"
        carregando={pendente}
        onCancelar={() => setConfirmando(false)}
        onConfirmar={importar}
      />
    </div>
  );
}
