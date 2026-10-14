/** Linhas do CSV que não entram, com o número da linha e o motivo (prévia e resultado). */
export function ListaErrosCsv({ erros }: { erros: readonly { numero: number; mensagem: string }[] }) {
  if (erros.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="m-0 text-[13px] font-semibold text-warn">
        {erros.length} {erros.length === 1 ? "linha não será importada" : "linhas não serão importadas"}:
      </p>
      <ul className="m-0 flex max-h-56 list-none flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-bg p-3 text-[13px]">
        {erros.map((e) => (
          <li key={e.numero}>
            <b>Linha {e.numero}</b> · <span className="text-muted">{e.mensagem}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
