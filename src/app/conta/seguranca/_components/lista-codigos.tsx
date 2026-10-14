/** Codigos de recuperacao, mostrados UMA vez (nao ficam legiveis no servidor depois). */
export function ListaCodigos({ codigos }: { codigos: string[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-4">
      <p className="m-0 text-sm font-semibold">Guarde estes códigos de recuperação agora</p>
      <p className="m-0 text-xs text-muted">Cada um vale uma vez, no lugar do código do aplicativo. Eles não serão mostrados de novo.</p>
      <ul className="m-0 grid list-none grid-cols-2 gap-1.5 p-0 font-mono text-sm">
        {codigos.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}
