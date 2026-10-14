import { MoreVertical } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { Button } from "@/components/ui/button";
import { EspacoImagem } from "@/components/ui/espaco-imagem";
import { Selo } from "@/components/ui/selo";
import { cn } from "@/lib/utils";
import type { Celula } from "./tabela-tipos";

/** Uma célula da PaginaTabela. Cada tipo do union tem UM visual; telas só passam dados. */
export function CelulaTabela({ celula }: { celula: Celula }) {
  switch (celula.tipo) {
    case "texto":
      return (
        <div className="min-w-0">
          <div
            className={cn(
              "truncate",
              celula.sub ? "font-bold" : "font-medium",
              celula.caixaAlta && "tracking-[.02em] uppercase"
            )}
          >
            {celula.texto}
          </div>
          {celula.sub && <div className="truncate text-xs text-muted">{celula.sub}</div>}
        </div>
      );
    case "membro":
      return (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar nome={celula.nome} src={celula.src} tamanho={32} />
          <div className="min-w-0">
            <div className="truncate font-bold">{celula.nome}</div>
            <div className="truncate text-xs text-muted">{celula.email}</div>
          </div>
        </div>
      );
    case "capa":
      return (
        <div className="relative h-14 w-11 overflow-hidden rounded-md">
          <EspacoImagem src={celula.src} alt={celula.alt} sizes="44px" />
        </div>
      );
    case "selo":
      return <Selo tom={celula.tom ?? "neutro"}>{celula.texto}</Selo>;
    case "etiqueta":
      return (
        <Selo tom="neutro" forma="rotulo">
          {celula.texto}
        </Selo>
      );
    case "barra":
      return (
        <div className="flex items-center gap-2">
          <BarraProgresso valor={celula.valor} rotulo={celula.rotulo ?? "Progresso"} mostrarPercentual />
        </div>
      );
    case "numeroDestaque":
      return <span className="font-bold text-accent">{celula.texto}</span>;
    case "data":
      return celula.texto === "Nunca" ? (
        <span className="text-xs font-semibold text-warn">Nunca</span>
      ) : (
        <span className="text-muted">{celula.texto}</span>
      );
    case "no":
      return celula.conteudo;
    case "acoes":
      return (
        <div className="flex justify-center">
          <Button variant="fantasma" size="icone44" aria-label={celula.rotulo} className="text-muted">
            <MoreVertical aria-hidden />
          </Button>
        </div>
      );
  }
}
